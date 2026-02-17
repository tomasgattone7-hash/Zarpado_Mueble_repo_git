const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const nodemailer = require('nodemailer');
const { z } = require('zod');
require('dotenv').config();

const app = express();
const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://zarpadomueble.com';
const API_URL = process.env.API_URL || 'https://api.zarpadomueble.com';
const NORMALIZED_FRONTEND_URL = String(FRONTEND_URL).trim().replace(/\/+$/, '');
const NORMALIZED_API_URL = String(API_URL).trim().replace(/\/+$/, '');
const isProduction = process.env.NODE_ENV === 'production';
const FRONTEND_ROOT_PATH = path.resolve(__dirname, '..', 'frontend');
const FRONTEND_PAGES_PATH = path.resolve(FRONTEND_ROOT_PATH, 'pages');
const FRONTEND_NOT_FOUND_PATH = path.resolve(FRONTEND_PAGES_PATH, '404.html');
const hasFrontendStaticBundle = fs.existsSync(FRONTEND_ROOT_PATH) && fs.existsSync(FRONTEND_PAGES_PATH);
const forceHttps = process.env.FORCE_HTTPS === 'true' || isProduction;
const CSRF_SESSION_COOKIE_NAME = 'zm_sid';
const FORMS_DRY_RUN = process.env.DRY_RUN === 'true';
const MAX_CSRF_SESSIONS = Number.parseInt(process.env.CSRF_SESSION_MAX, 10) || 5000;
const DELIVERY_CONFIG_PATH = path.resolve(__dirname, 'config', 'delivery-config.json');
const COMMERCE_CONFIG_PATH = path.resolve(__dirname, 'config', 'commerce-config.json');
const ORDERS_DB_PATH = path.resolve(__dirname, 'data', 'orders.json');
const QUOTES_DB_PATH = path.resolve(__dirname, 'data', 'quotes.json');
const POSTAL_CODE_PATTERN = /^\d{4}$/;
const ORDER_ID_PATTERN = /^ZM-\d{13}-[A-F0-9]{6}$/;
const EXTERNAL_REFERENCE_PATTERN = /^ORDER_\d{13}_[A-Z0-9]{6}$/;
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const NAME_PATTERN = /^[a-zA-ZÀ-ÿ0-9 .,'-]{2,120}$/u;
const PHONE_PATTERN = /^[0-9+()\-\s]{6,40}$/;
const DOCUMENT_PATTERN = /^[A-Za-z0-9./-]{5,20}$/;
const CITY_NEIGHBORHOOD_PATTERN = /^[a-zA-ZÀ-ÿ0-9 .,'-]{2,120}$/u;
const BUDGET_PATTERN = /^[0-9$.,\s-]{1,40}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DELIVERY_METHODS = Object.freeze({
    SHIPPING: 'shipping',
    PICKUP: 'pickup'
});
const MP_RETRY_ATTEMPTS = Number.parseInt(process.env.MP_RETRY_ATTEMPTS, 10) || 3;
const MP_RETRY_DELAY_MS = Number.parseInt(process.env.MP_RETRY_DELAY_MS, 10) || 900;
const MP_OFFLINE_FALLBACK = process.env.MP_OFFLINE_FALLBACK === 'true'
    || (!isProduction && process.env.MP_OFFLINE_FALLBACK !== 'false');

const MAX_CART_ITEMS = Number.parseInt(process.env.MAX_CART_ITEMS, 10) || 20;
const MAX_ITEM_QUANTITY = Number.parseInt(process.env.MAX_ITEM_QUANTITY, 10) || 10;
const MP_API_TIMEOUT_MS = Number.parseInt(process.env.MP_API_TIMEOUT_MS, 10) || 10000;
const MP_API_BASE_URL = 'https://api.mercadopago.com';
const MP_WEBHOOK_SECRET = String(process.env.MP_WEBHOOK_SECRET || '').trim();
const MP_NOTIFICATION_URL = String(process.env.NOTIFICATION_URL || `${NORMALIZED_API_URL}/api/mp/webhook`).trim();
const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT, 10) || 587;
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim();
const FROM_EMAIL = String(process.env.FROM_EMAIL || '').trim();
const csrfSessions = new Map();
const CONTACT_TYPE_OPTIONS = ['Escritorio', 'Rack TV', 'Cocina', 'Placard', 'Otro', ''];
const QUOTE_FURNITURE_TYPE_OPTIONS = [
    'Escritorio',
    'Rack TV',
    'Cocina',
    'Placard',
    'Vestidor',
    'Biblioteca',
    'Otro'
];
const QUOTE_FILE_MAX_MB = Number.parseInt(process.env.QUOTE_FILE_MAX_MB, 10) || 5;
const QUOTE_MAX_FILES = Number.parseInt(process.env.QUOTE_MAX_FILES, 10) || 6;
const QUOTE_FILE_SIZE_BYTES = QUOTE_FILE_MAX_MB * 1024 * 1024;
const QUOTE_ALLOWED_FILE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
]);

const DEFAULT_ADMIN_PANEL_TOKEN = 'dev-admin-token';
const ORDER_TYPE_STORE = 'tienda';
const ORDER_TYPE_CUSTOM = 'a_medida';
const PAYMENT_METHODS = Object.freeze({
    MERCADOPAGO: 'mercadopago',
    BANK_TRANSFER: 'bank_transfer',
    CASH_PICKUP: 'cash_pickup'
});

const ORDER_STATUS_LABELS = Object.freeze({
    pending_payment: 'Pendiente de pago',
    pending_transfer_confirmation: 'Pendiente de confirmacion de transferencia',
    pending_cash_pickup_payment: 'Pendiente de pago en retiro',
    payment_confirmed: 'Pago confirmado',
    preparing: 'En preparacion',
    in_production: 'En produccion',
    shipped: 'Despachado',
    ready_for_pickup: 'Listo para retiro',
    ready_for_delivery: 'Listo para entrega',
    delivered: 'Entregado',
    cancelled: 'Cancelado'
});

const QUOTE_STATUS_LABELS = Object.freeze({
    received: 'Solicitud recibida',
    quoted: 'Cotizacion enviada',
    deposit_pending: 'Pendiente de sena',
    deposit_paid: 'Sena acreditada',
    in_production: 'En produccion',
    ready_for_delivery: 'Listo para entrega',
    delivered: 'Entregado',
    closed: 'Cerrado',
    cancelled: 'Cancelado'
});

const FORMSPREE_CONTACT_ENDPOINT = 'https://formspree.io/f/xqedeven';
const FORMSPREE_MEDIDA_ENDPOINT = 'https://formspree.io/f/maqdjjkq';
const defaultAllowedOrigins = [
    NORMALIZED_FRONTEND_URL || 'https://zarpadomueble.com',
    'https://www.zarpadomueble.com',
    'http://localhost:8888',
    'http://127.0.0.1:8888',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    NORMALIZED_API_URL,
    BASE_URL
];

function normalizeOriginValue(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return '';
    }

    try {
        return new URL(normalized).origin;
    } catch {
        return normalized.replace(/\/+$/, '');
    }
}

const configuredAllowedOriginsFromEnv = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS
        .split(',')
        .map(origin => normalizeOriginValue(origin))
        .filter(Boolean)
    : [];

const configuredAllowedOrigins = [
    ...new Set(
        [
            ...defaultAllowedOrigins,
            ...configuredAllowedOriginsFromEnv
        ]
            .map(origin => normalizeOriginValue(origin))
            .filter(Boolean)
    )
];

const allowedOrigins = new Set(configuredAllowedOrigins);
const NETLIFY_PREVIEW_HOST_PATTERN = new RegExp(
    process.env.NETLIFY_PREVIEW_HOST_PATTERN || '^[a-z0-9-]+\\.netlify\\.app$',
    'i'
);

function isAllowedNetlifyPreviewOrigin(origin) {
    if (!origin) {
        return false;
    }

    try {
        const parsed = new URL(origin);
        return parsed.protocol === 'https:' && NETLIFY_PREVIEW_HOST_PATTERN.test(parsed.hostname);
    } catch {
        return false;
    }
}

function isLocalDevOrigin(origin) {
    if (!origin) {
        return false;
    }

    try {
        const parsed = new URL(origin);
        const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
        return isLocalHost && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
    } catch {
        return false;
    }
}

function isAllowedOrigin(origin) {
    const normalizedOrigin = normalizeOriginValue(origin);
    if (!normalizedOrigin) {
        return true;
    }

    if (!isProduction && normalizedOrigin === 'null') {
        return true;
    }

    return (
        allowedOrigins.has(normalizedOrigin)
        || isAllowedNetlifyPreviewOrigin(normalizedOrigin)
        || isLocalDevOrigin(normalizedOrigin)
    );
}

function extractOriginFromUrlLike(value) {
    return normalizeOriginValue(value);
}

function hasAllowedFormSource(request) {
    const origin = String(request.get('origin') || '').trim();
    const refererOrigin = extractOriginFromUrlLike(request.get('referer'));
    if (origin && isAllowedOrigin(origin)) {
        return true;
    }

    if (refererOrigin && isAllowedOrigin(refererOrigin)) {
        return true;
    }

    return false;
}

function requireAllowedFormSource(request, response, next) {
    if (hasAllowedFormSource(request)) {
        return next();
    }

    if (!isProduction) {
        console.warn(
            `[forms] Request bloqueado por source inválido. origin=${request.get('origin') || 'null'} referer=${request.get('referer') || 'null'}`
        );
    }

    return response.status(403).json({
        ok: false,
        error: 'Origen no permitido',
        code: 'origin_not_allowed',
        requestId: request.requestId
    });
}

function createApiError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function generateRequestId() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return crypto.randomBytes(16).toString('hex');
}

const quoteUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        files: QUOTE_MAX_FILES,
        fileSize: QUOTE_FILE_SIZE_BYTES,
        fields: 30
    },
    fileFilter: (_request, file, callback) => {
        const mimeType = String(file?.mimetype || '').toLowerCase();
        if (!QUOTE_ALLOWED_FILE_MIME_TYPES.has(mimeType)) {
            return callback(createApiError(
                'Formato de archivo no permitido. Solo JPG, PNG, WEBP o PDF.',
                400
            ));
        }

        return callback(null, true);
    }
});

function parsePayloadWithSchema(schema, payload, fallbackMessage = 'Datos inválidos') {
    const parsed = schema.safeParse(payload || {});
    if (parsed.success) {
        return parsed.data;
    }

    const firstIssue = parsed.error.issues?.[0];
    throw createApiError(firstIssue?.message || fallbackMessage, 400);
}

const checkoutItemPayloadSchema = z.object({
    id: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().min(1).max(MAX_ITEM_QUANTITY),
    unit_price: z.coerce.number().nonnegative().optional()
}).passthrough();

const checkoutCustomerPayloadSchema = z.object({
    fullName: z.string().trim().max(120).optional(),
    name: z.string().trim().max(120).optional(),
    email: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(40).optional(),
    address: z.string().trim().max(180).optional(),
    street: z.string().trim().max(120).optional(),
    streetNumber: z.string().trim().max(40).optional(),
    city: z.string().trim().max(80).optional(),
    province: z.string().trim().max(80).optional(),
    zip: z.string().trim().max(10).optional(),
    postalCode: z.string().trim().max(10).optional(),
    addressReference: z.string().trim().max(180).optional()
}).passthrough();

const checkoutPayloadSchema = z.object({
    items: z.array(checkoutItemPayloadSchema).min(1).max(MAX_CART_ITEMS),
    delivery: z.object({
        method: z.enum([DELIVERY_METHODS.SHIPPING, DELIVERY_METHODS.PICKUP]),
        postalCode: z.string().optional(),
        installationRequested: z.boolean().optional()
    }).passthrough(),
    paymentMethod: z.string().trim().max(40).optional(),
    buyerEmail: z.string().trim().max(160).optional(),
    email: z.string().trim().max(160).optional(),
    payer: z.object({
        email: z.string().trim().max(160).optional()
    }).partial().optional(),
    customer: checkoutCustomerPayloadSchema.optional()
}).passthrough().superRefine((value, ctx) => {
    if (value.buyerEmail && !EMAIL_PATTERN.test(value.buyerEmail)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['buyerEmail'],
            message: 'Email de comprador inválido'
        });
    }

    if (value.email && !EMAIL_PATTERN.test(value.email)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['email'],
            message: 'Email inválido'
        });
    }

    if (value.payer?.email && !EMAIL_PATTERN.test(value.payer.email)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['payer', 'email'],
            message: 'Email de pagador inválido'
        });
    }
});

const contactPayloadSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().max(120).email('Email inválido'),
    phone: z.string().trim().max(40).optional(),
    type: z.string().trim().max(60).optional(),
    message: z.string().trim().min(3).max(3000),
    productReference: z.string().trim().max(120).optional(),
    company: z.string().trim().max(200).optional(),
    website: z.string().trim().max(200).optional()
}).passthrough().superRefine((value, ctx) => {
    if (!NAME_PATTERN.test(value.name)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['name'],
            message: 'Nombre inválido'
        });
    }

    if (value.phone && !PHONE_PATTERN.test(value.phone)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['phone'],
            message: 'Teléfono inválido'
        });
    }

    if (!CONTACT_TYPE_OPTIONS.includes(value.type || '')) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['type'],
            message: 'Tipo de mueble inválido'
        });
    }
});

const quotePayloadSchema = z.object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().max(120).email('Email inválido'),
    phone: z.string().trim().min(6).max(40),
    cityNeighborhood: z.string().trim().min(2).max(120),
    province: z.string({
        required_error: 'Ingresá la provincia',
        invalid_type_error: 'Ingresá la provincia'
    }).trim().min(2, 'Ingresá la provincia').max(80),
    furnitureType: z.string().trim().min(2).max(80),
    approximateMeasures: z.string().trim().min(5).max(600),
    estimatedBudget: z.string().trim().max(40).optional(),
    targetDate: z.string().trim().max(20).optional(),
    additionalComments: z.string().trim().max(2000).optional(),
    privacyAccepted: z.union([z.string(), z.boolean()]).optional(),
    company: z.string().trim().max(200).optional(),
    website: z.string().trim().max(200).optional()
}).passthrough().superRefine((value, ctx) => {
    if (!NAME_PATTERN.test(value.fullName)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['fullName'],
            message: 'Nombre completo inválido'
        });
    }

    if (!PHONE_PATTERN.test(value.phone)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['phone'],
            message: 'Teléfono inválido'
        });
    }

    if (!CITY_NEIGHBORHOOD_PATTERN.test(value.cityNeighborhood)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['cityNeighborhood'],
            message: 'Ingresá una ciudad o barrio válido'
        });
    }

    if (!CITY_NEIGHBORHOOD_PATTERN.test(value.province)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['province'],
            message: 'Ingresá una provincia válida'
        });
    }

    if (!QUOTE_FURNITURE_TYPE_OPTIONS.includes(value.furnitureType)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['furnitureType'],
            message: 'Tipo de mueble inválido'
        });
    }

    if (value.estimatedBudget && !BUDGET_PATTERN.test(value.estimatedBudget)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['estimatedBudget'],
            message: 'Presupuesto estimado inválido'
        });
    }

    if (value.targetDate && !DATE_PATTERN.test(value.targetDate)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['targetDate'],
            message: 'Fecha objetivo inválida'
        });
    }

    if (value.targetDate && DATE_PATTERN.test(value.targetDate)) {
        const parsedDate = new Date(`${value.targetDate}T00:00:00.000Z`);
        if (Number.isNaN(parsedDate.getTime())) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['targetDate'],
                message: 'Fecha objetivo inválida'
            });
        }
    }

    const normalizedPrivacy = String(value.privacyAccepted || '').trim().toLowerCase();
    const acceptedValues = new Set(['true', '1', 'on', 'yes', 'si', 'sí']);
    if (!acceptedValues.has(normalizedPrivacy)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['privacyAccepted'],
            message: 'Debés aceptar la Política de Privacidad'
        });
    }
});

const deliveryQuotePayloadSchema = z.object({
    postalCode: z.string().trim().min(4).max(10),
    items: z.array(checkoutItemPayloadSchema).max(MAX_CART_ITEMS).optional()
}).passthrough();

function getRequestIpAddress(request) {
    const forwardedFor = String(request.get('x-forwarded-for') || '').trim();
    if (forwardedFor) {
        const firstForwardedIp = forwardedFor.split(',')[0]?.trim();
        if (firstForwardedIp) {
            return firstForwardedIp;
        }
    }

    return String(request.ip || request.socket?.remoteAddress || '').trim();
}

function buildFormRequestMetadata(request) {
    const originHeader = String(request.get('origin') || '').trim();
    const refererOrigin = extractOriginFromUrlLike(request.get('referer'));
    return {
        ip: getRequestIpAddress(request),
        userAgent: String(request.get('user-agent') || '').slice(0, 400),
        origin: originHeader || refererOrigin || '',
        timestamp: new Date().toISOString(),
        requestId: String(request.requestId || '')
    };
}

function pickFirstFormValue(payload = {}, keys = []) {
    if (!payload || typeof payload !== 'object') {
        return '';
    }

    for (const key of keys) {
        const candidate = payload[key];
        if (candidate === undefined || candidate === null) {
            continue;
        }

        const normalized = String(candidate).trim();
        if (normalized) {
            return normalized;
        }
    }

    return '';
}

function normalizeContactFormPayload(payload = {}) {
    const source = payload && typeof payload === 'object' ? payload : {};

    return {
        ...source,
        name: pickFirstFormValue(source, ['name', 'nombre']),
        email: pickFirstFormValue(source, ['email', 'correo', 'mail']),
        phone: pickFirstFormValue(source, ['phone', 'tel', 'telefono']),
        type: pickFirstFormValue(source, ['type', 'tipo']),
        message: pickFirstFormValue(source, ['message', 'mensaje', 'descripcion']),
        productReference: pickFirstFormValue(source, ['productReference', 'producto', 'referencia']),
        company: pickFirstFormValue(source, ['company']),
        website: pickFirstFormValue(source, ['website', 'web', 'sitio'])
    };
}

function normalizeQuoteFormPayload(payload = {}) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const privacyAccepted = source.privacyAccepted ?? source.privacidad ?? source.privacy ?? '';

    return {
        ...source,
        fullName: pickFirstFormValue(source, ['fullName', 'nombreCompleto', 'nombre', 'name']),
        email: pickFirstFormValue(source, ['email', 'correo', 'mail']),
        phone: pickFirstFormValue(source, ['phone', 'tel', 'telefono']),
        cityNeighborhood: pickFirstFormValue(source, ['cityNeighborhood', 'ciudadBarrio', 'ciudad', 'barrio']),
        province: pickFirstFormValue(source, ['province', 'provincia']),
        furnitureType: pickFirstFormValue(source, ['furnitureType', 'tipoMueble', 'tipo']),
        approximateMeasures: pickFirstFormValue(source, ['approximateMeasures', 'medidasAproximadas', 'medidas', 'descripcion']),
        estimatedBudget: pickFirstFormValue(source, ['estimatedBudget', 'presupuestoEstimado', 'presupuesto']),
        targetDate: pickFirstFormValue(source, ['targetDate', 'fechaObjetivo']),
        additionalComments: pickFirstFormValue(source, ['additionalComments', 'comentariosAdicionales', 'comentarios']),
        privacyAccepted,
        company: pickFirstFormValue(source, ['company']),
        website: pickFirstFormValue(source, ['website', 'web', 'sitio'])
    };
}

function getFormHoneypotValue(payload = {}) {
    return pickFirstFormValue(payload, ['website', 'company', 'web', 'sitio']);
}

function parseFormPayload(schema, payload) {
    const parsed = schema.safeParse(payload || {});
    if (parsed.success) {
        return parsed.data;
    }

    const error = createApiError('invalid_payload', 400);
    error.validationIssues = parsed.error.issues || [];
    throw error;
}

async function submitFormspreeJson({ endpoint, payload }) {
    if (FORMS_DRY_RUN) {
        return {
            ok: true,
            dryRun: true,
            payload: payload || {}
        };
    }

    if (!endpoint) {
        throw createApiError('forms_provider_not_configured', 503);
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        body: JSON.stringify(payload || {})
    });

    let responsePayload = {};
    try {
        responsePayload = await response.json();
    } catch {
        responsePayload = {};
    }

    if (!response.ok || responsePayload?.ok === false) {
        const error = createApiError('form_forward_failed', 502);
        error.providerError = String(responsePayload?.error || '').trim();
        error.providerStatus = response.status;
        throw error;
    }

    return responsePayload;
}

function ensureJsonFile(filePath, defaultValue) {
    const directory = path.dirname(filePath);
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }

    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
    }
}

function readJsonFile(filePath, defaultValue) {
    ensureJsonFile(filePath, defaultValue);
    const rawContent = fs.readFileSync(filePath, 'utf8');
    try {
        return JSON.parse(rawContent);
    } catch {
        return defaultValue;
    }
}

function writeJsonFile(filePath, data) {
    ensureJsonFile(filePath, data);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadCommerceConfig() {
    const defaultConfig = {
        tienda: {
            stockMessage: 'En stock - Envio en 48/72 hs',
            madeToOrderMessage: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
            acceptedPaymentMethods: [
                PAYMENT_METHODS.MERCADOPAGO,
                PAYMENT_METHODS.BANK_TRANSFER,
                PAYMENT_METHODS.CASH_PICKUP
            ],
            warrantyMonths: 12,
            coverage: 'AMBA + interior del pais + retiro en taller'
        },
        products: [
            {
                id: 1,
                name: 'Escritorio Gamer Pro',
                specs: 'Melamina 18mm, pasacables y led frontal',
                category: 'Escritorios',
                price: 185000,
                image: 'assets/desk_gamer.png',
                line: ORDER_TYPE_STORE,
                fulfillmentModel: 'stock',
                stock: 4,
                stockShipLabel: 'En stock - Envio en 48/72 hs',
                madeToOrderShipLabel: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
                weightKg: 38,
                volumeM3: 0.26
            },
            {
                id: 2,
                name: 'Rack TV Minimalista',
                specs: 'Para TV 65", cajones push-open',
                category: 'Living',
                price: 210000,
                image: 'assets/tv_rack.png',
                line: ORDER_TYPE_STORE,
                fulfillmentModel: 'stock',
                stock: 3,
                stockShipLabel: 'En stock - Envio en 48/72 hs',
                madeToOrderShipLabel: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
                weightKg: 42,
                volumeM3: 0.32
            },
            {
                id: 3,
                name: 'Mesa Ratona Industrial',
                specs: 'Estructura de hierro y tapa paraiso',
                category: 'Living',
                price: 95000,
                image: 'assets/coffee_table.png',
                line: ORDER_TYPE_STORE,
                fulfillmentModel: 'stock',
                stock: 8,
                stockShipLabel: 'En stock - Envio en 48/72 hs',
                madeToOrderShipLabel: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
                weightKg: 18,
                volumeM3: 0.18
            },
            {
                id: 4,
                name: 'Biblioteca Moderna',
                specs: 'Estanteria asimetrica en melamina',
                category: 'Living',
                price: 145000,
                image: 'assets/library.png',
                line: ORDER_TYPE_STORE,
                fulfillmentModel: 'made_to_order',
                stock: 0,
                stockShipLabel: 'En stock - Envio en 48/72 hs',
                madeToOrderShipLabel: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
                weightKg: 33,
                volumeM3: 0.31
            },
            {
                id: 5,
                name: 'Vajillero Nordico',
                specs: 'Modulo de guardado para cocina/comedor',
                category: 'Cocinas',
                price: 230000,
                image: 'assets/sideboard.png',
                line: ORDER_TYPE_STORE,
                fulfillmentModel: 'made_to_order',
                stock: 0,
                stockShipLabel: 'En stock - Envio en 48/72 hs',
                madeToOrderShipLabel: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
                weightKg: 52,
                volumeM3: 0.41
            },
            {
                id: 6,
                name: 'Escritorio Home Office',
                specs: 'Diseno compacto con cajonera movil',
                category: 'Escritorios',
                price: 120000,
                image: 'assets/office_desk.png',
                line: ORDER_TYPE_STORE,
                fulfillmentModel: 'stock',
                stock: 6,
                stockShipLabel: 'En stock - Envio en 48/72 hs',
                madeToOrderShipLabel: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
                weightKg: 29,
                volumeM3: 0.21
            },
            {
                id: 7,
                name: 'Gabinete Multiuso',
                specs: 'Guardado versatil para dormitorio o vestidor',
                category: 'Placards',
                price: 180000,
                image: 'assets/cabinet.webp',
                line: ORDER_TYPE_STORE,
                fulfillmentModel: 'made_to_order',
                stock: 0,
                stockShipLabel: 'En stock - Envio en 48/72 hs',
                madeToOrderShipLabel: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
                weightKg: 47,
                volumeM3: 0.37
            },
            {
                id: 8,
                name: 'Silla de Diseno',
                specs: 'Ergonomica con estructura reforzada',
                category: 'Comedor',
                price: 85000,
                image: 'assets/chair.webp',
                line: ORDER_TYPE_STORE,
                fulfillmentModel: 'stock',
                stock: 12,
                stockShipLabel: 'En stock - Envio en 48/72 hs',
                madeToOrderShipLabel: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
                weightKg: 12,
                volumeM3: 0.08
            },
            {
                id: 9,
                name: 'Mesa Comedor',
                specs: 'Para 6 personas, tapa resistente',
                category: 'Comedor',
                price: 250000,
                image: 'assets/table.webp',
                line: ORDER_TYPE_STORE,
                fulfillmentModel: 'made_to_order',
                stock: 0,
                stockShipLabel: 'En stock - Envio en 48/72 hs',
                madeToOrderShipLabel: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
                weightKg: 59,
                volumeM3: 0.48
            },
            {
                id: 10,
                name: 'Mueble TV Flotante',
                specs: 'Diseno aereo con pasacables oculto',
                category: 'Living',
                price: 200000,
                image: 'assets/tv_unit.webp',
                line: ORDER_TYPE_STORE,
                fulfillmentModel: 'made_to_order',
                stock: 0,
                stockShipLabel: 'En stock - Envio en 48/72 hs',
                madeToOrderShipLabel: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
                weightKg: 44,
                volumeM3: 0.34
            },
            {
                id: 11,
                name: 'Escritorio Melamina',
                specs: 'Formato clasico para estudio',
                category: 'Escritorios',
                price: 130000,
                image: 'assets/melamine_desk.webp',
                line: ORDER_TYPE_STORE,
                fulfillmentModel: 'stock',
                stock: 7,
                stockShipLabel: 'En stock - Envio en 48/72 hs',
                madeToOrderShipLabel: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
                weightKg: 31,
                volumeM3: 0.24
            }
        ]
    };

    const parsed = readJsonFile(COMMERCE_CONFIG_PATH, defaultConfig);
    const normalizedProducts = Array.isArray(parsed.products)
        ? parsed.products
            .map(product => ({
                id: Number.parseInt(product?.id, 10),
                name: sanitizeSingleLine(product?.name, 120),
                specs: sanitizeSingleLine(product?.specs, 180),
                category: sanitizeSingleLine(product?.category, 80) || 'General',
                price: Number.parseInt(product?.price, 10),
                image: sanitizeSingleLine(product?.image, 240),
                line: sanitizeSingleLine(product?.line, 20).toLowerCase() || ORDER_TYPE_STORE,
                fulfillmentModel: sanitizeSingleLine(product?.fulfillmentModel, 20).toLowerCase() === 'made_to_order'
                    ? 'made_to_order'
                    : 'stock',
                stock: Math.max(0, Number.parseInt(product?.stock, 10) || 0),
                stockShipLabel: sanitizeSingleLine(
                    product?.stockShipLabel || parsed?.tienda?.stockMessage || defaultConfig.tienda.stockMessage,
                    160
                ),
                madeToOrderShipLabel: sanitizeSingleLine(
                    product?.madeToOrderShipLabel || parsed?.tienda?.madeToOrderMessage || defaultConfig.tienda.madeToOrderMessage,
                    180
                ),
                weightKg: Number.parseFloat(product?.weightKg) || 25,
                volumeM3: Number.parseFloat(product?.volumeM3) || 0.2
            }))
            .filter(product => (
                Number.isInteger(product.id)
                && product.id > 0
                && product.name
                && Number.isInteger(product.price)
                && product.price >= 0
            ))
        : defaultConfig.products;

    return {
        tienda: {
            stockMessage: sanitizeSingleLine(parsed?.tienda?.stockMessage || defaultConfig.tienda.stockMessage, 160),
            madeToOrderMessage: sanitizeSingleLine(parsed?.tienda?.madeToOrderMessage || defaultConfig.tienda.madeToOrderMessage, 180),
            acceptedPaymentMethods: Array.isArray(parsed?.tienda?.acceptedPaymentMethods)
                ? parsed.tienda.acceptedPaymentMethods
                    .map(method => sanitizeSingleLine(method, 40).toLowerCase())
                    .filter(Boolean)
                : defaultConfig.tienda.acceptedPaymentMethods,
            warrantyMonths: Number.parseInt(parsed?.tienda?.warrantyMonths, 10) || defaultConfig.tienda.warrantyMonths,
            coverage: sanitizeSingleLine(parsed?.tienda?.coverage || defaultConfig.tienda.coverage, 180)
        },
        products: normalizedProducts
    };
}

let commerceConfig = null;
let STORE_PRODUCTS = [];
let PRODUCT_CATALOG = {};
let AVAILABLE_PAYMENT_METHODS = new Set();

function refreshCommerceRuntimeConfig() {
    commerceConfig = loadCommerceConfig();

    STORE_PRODUCTS = Object.freeze(
        commerceConfig.products
            .filter(product => product.line === ORDER_TYPE_STORE)
            .map(product => ({
                ...product,
                availabilityMessage: product.fulfillmentModel === 'made_to_order'
                    ? product.madeToOrderShipLabel
                    : product.stockShipLabel
            }))
    );

    PRODUCT_CATALOG = Object.freeze(
        STORE_PRODUCTS.reduce((accumulator, product) => {
            accumulator[product.id] = product;
            return accumulator;
        }, {})
    );

    const configuredMethods = commerceConfig.tienda.acceptedPaymentMethods
        .filter(method => Object.values(PAYMENT_METHODS).includes(method));

    AVAILABLE_PAYMENT_METHODS = new Set(configuredMethods);
    if (!AVAILABLE_PAYMENT_METHODS.size) {
        AVAILABLE_PAYMENT_METHODS.add(PAYMENT_METHODS.MERCADOPAGO);
    }
}

refreshCommerceRuntimeConfig();

function getPublicStoreCatalog() {
    return STORE_PRODUCTS.map(product => ({
        id: product.id,
        name: product.name,
        specs: product.specs,
        price: product.price,
        image: product.image,
        category: product.category,
        stock: product.stock,
        fulfillmentModel: product.fulfillmentModel,
        availabilityMessage: product.fulfillmentModel === 'made_to_order'
            ? product.madeToOrderShipLabel
            : product.stockShipLabel,
        shippingEstimate: product.fulfillmentModel === 'made_to_order'
            ? '10 a 20 dias habiles'
            : '48/72 hs',
        weightKg: product.weightKg,
        volumeM3: product.volumeM3
    }));
}

function persistCommerceConfig(nextConfig) {
    writeJsonFile(COMMERCE_CONFIG_PATH, nextConfig);
    refreshCommerceRuntimeConfig();
}

function readQuotesStore() {
    const data = readJsonFile(QUOTES_DB_PATH, { quotes: [] });
    return Array.isArray(data.quotes) ? data : { quotes: [] };
}

function writeQuotesStore(data) {
    writeJsonFile(QUOTES_DB_PATH, data);
}

function generateQuoteId() {
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `QM-${Date.now()}-${randomPart}`;
}

function createQuote(quoteRecord) {
    const store = readQuotesStore();
    store.quotes.push(quoteRecord);
    writeQuotesStore(store);
    return quoteRecord;
}

function findQuote(quoteId) {
    const normalizedQuoteId = normalizeText(quoteId, 80).toUpperCase();
    if (!normalizedQuoteId) return null;

    const store = readQuotesStore();
    return store.quotes.find(quote => normalizeText(quote.quoteId, 80).toUpperCase() === normalizedQuoteId) || null;
}

function updateQuote(quoteId, updater) {
    const store = readQuotesStore();
    const normalizedQuoteId = normalizeText(quoteId, 80).toUpperCase();
    const index = store.quotes.findIndex(quote => normalizeText(quote.quoteId, 80).toUpperCase() === normalizedQuoteId);
    if (index === -1) return null;

    const currentQuote = store.quotes[index];
    const updatedQuote = updater({ ...currentQuote });
    store.quotes[index] = updatedQuote;
    writeQuotesStore(store);
    return updatedQuote;
}

function makeTimelineEntry(status, note = '') {
    return {
        status: normalizeText(status, 60).toLowerCase(),
        label: ORDER_STATUS_LABELS[status] || QUOTE_STATUS_LABELS[status] || normalizeText(status, 80),
        note: sanitizeSingleLine(note, 240),
        at: new Date().toISOString()
    };
}

function appendTimelineEntry(existingTimeline, status, note = '', options = {}) {
    const timeline = Array.isArray(existingTimeline)
        ? [...existingTimeline]
        : [];
    const normalizedStatus = normalizeText(status, 60).toLowerCase();
    const normalizedNote = sanitizeSingleLine(note, 240);
    const lastEntry = timeline[timeline.length - 1];
    const allowDuplicate = Boolean(options.allowDuplicate);

    if (
        !allowDuplicate
        && lastEntry
        && normalizeText(lastEntry.status, 60).toLowerCase() === normalizedStatus
        && sanitizeSingleLine(lastEntry.note, 240) === normalizedNote
    ) {
        return timeline;
    }

    timeline.push(makeTimelineEntry(normalizedStatus, normalizedNote));
    return timeline;
}

function normalizeText(value, maxLength = 120) {
    return String(value || '').trim().slice(0, maxLength);
}

function sanitizeSingleLine(value, maxLength = 120) {
    return String(value || '')
        .replace(/[<>]/g, '')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function sanitizeMultiLine(value, maxLength = 2000) {
    return String(value || '')
        .replace(/\r\n/g, '\n')
        .replace(/[<>]/g, '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim()
        .slice(0, maxLength);
}

function normalizeOrderLookupRef(value) {
    return normalizeText(value, 80).toUpperCase();
}

function normalizeMpIdentifier(value, maxLength = 80) {
    return normalizeText(value, maxLength);
}

function sanitizeEmail(value) {
    const normalized = normalizeText(value, 160).toLowerCase();
    if (!normalized || !EMAIL_PATTERN.test(normalized)) {
        return '';
    }

    return normalized;
}

function extractDigits(value, maxLength = 60) {
    return String(value || '')
        .replace(/\D/g, '')
        .slice(0, maxLength);
}

function buildAddressLine(customerData = {}) {
    const mainLine = [customerData.street, customerData.streetNumber]
        .map(part => normalizeText(part, 120))
        .filter(Boolean)
        .join(' ');

    const extraParts = [
        normalizeText(customerData.floorApartment, 60),
        normalizeText(customerData.neighborhood, 80)
    ].filter(Boolean);

    const locationParts = [
        normalizeText(customerData.city, 80),
        normalizeText(customerData.province, 80),
        normalizePostalCode(customerData.postalCode)
    ].filter(Boolean);

    const chunks = [mainLine, ...extraParts, locationParts.join(', ')]
        .map(chunk => chunk.trim())
        .filter(Boolean);

    return chunks.join(' | ');
}

function normalizePostalCode(input) {
    return String(input || '')
        .replace(/\D/g, '')
        .slice(0, 4);
}

function splitAddressLine(addressLine) {
    const normalizedAddress = sanitizeSingleLine(addressLine, 180);
    const addressMatch = normalizedAddress.match(/^(.*?)(?:\s+(\d+[A-Za-z0-9./-]*))$/);

    if (!addressMatch) {
        return {
            street: normalizedAddress,
            streetNumber: 'S/N'
        };
    }

    return {
        street: sanitizeSingleLine(addressMatch[1], 120) || normalizedAddress,
        streetNumber: sanitizeSingleLine(addressMatch[2], 40) || 'S/N'
    };
}

function parseCheckoutCustomerData(checkoutPayload = {}) {
    const rawCustomer = checkoutPayload?.customer || {};
    const fullName = sanitizeSingleLine(
        rawCustomer.fullName || rawCustomer.name || checkoutPayload.fullName || checkoutPayload.name,
        120
    );
    const email = sanitizeEmail(
        rawCustomer.email
        || checkoutPayload.buyerEmail
        || checkoutPayload.payer?.email
        || checkoutPayload.email
    );
    const phone = sanitizeSingleLine(rawCustomer.phone || checkoutPayload.phone, 40);
    const addressLine = sanitizeSingleLine(rawCustomer.address || checkoutPayload.address, 180);
    const city = sanitizeSingleLine(rawCustomer.city || checkoutPayload.city, 80);
    const province = sanitizeSingleLine(rawCustomer.province || checkoutPayload.province, 80);
    const postalCode = normalizePostalCode(rawCustomer.zip || rawCustomer.postalCode || checkoutPayload.zip || checkoutPayload.postalCode);
    const addressReference = sanitizeSingleLine(rawCustomer.addressReference || checkoutPayload.addressReference, 180);

    let street = sanitizeSingleLine(rawCustomer.street || checkoutPayload.street, 120);
    let streetNumber = sanitizeSingleLine(rawCustomer.streetNumber || checkoutPayload.streetNumber, 40);
    if (!street || !streetNumber) {
        const splitAddress = splitAddressLine(addressLine);
        street = street || splitAddress.street;
        streetNumber = streetNumber || splitAddress.streetNumber;
    }

    const missingFields = [];

    if (!fullName) missingFields.push('name');
    if (!email) missingFields.push('email');
    if (!phone) missingFields.push('phone');
    if (!addressLine) missingFields.push('address');
    if (!city) missingFields.push('city');
    if (!province) missingFields.push('province');
    if (!postalCode) missingFields.push('zip');

    if (missingFields.length > 0) {
        return {
            ok: false,
            missingFields
        };
    }

    if (!NAME_PATTERN.test(fullName)) {
        return { ok: false, reason: 'Nombre inválido' };
    }

    if (!EMAIL_PATTERN.test(email)) {
        return { ok: false, reason: 'Email inválido' };
    }

    if (!PHONE_PATTERN.test(phone)) {
        return { ok: false, reason: 'Teléfono inválido' };
    }

    if (!CITY_NEIGHBORHOOD_PATTERN.test(city) || !CITY_NEIGHBORHOOD_PATTERN.test(province)) {
        return { ok: false, reason: 'Ciudad o provincia inválidas' };
    }

    if (!POSTAL_CODE_PATTERN.test(postalCode)) {
        return { ok: false, reason: 'Código postal inválido' };
    }

    return {
        ok: true,
        buyerEmail: email,
        customerData: {
            fullName,
            phone,
            email,
            documentId: '',
            street,
            streetNumber,
            city,
            province,
            postalCode,
            floorApartment: '',
            neighborhood: '',
            addressReference,
            receiverType: 'yo',
            receiverName: fullName,
            availableSchedule: '',
            additionalNotes: ''
        }
    };
}

function postalCodeToNumber(postalCode) {
    return Number.parseInt(postalCode, 10);
}

function isPostalCodeInRanges(postalCode, ranges = []) {
    const postalCodeNumber = postalCodeToNumber(postalCode);
    if (!Number.isInteger(postalCodeNumber)) {
        return false;
    }

    return ranges.some(range => {
        const from = postalCodeToNumber(range?.from);
        const to = postalCodeToNumber(range?.to);
        if (!Number.isInteger(from) || !Number.isInteger(to)) {
            return false;
        }

        return postalCodeNumber >= from && postalCodeNumber <= to;
    });
}

function isPostalCodeInList(postalCode, postalCodes = []) {
    return postalCodes
        .map(code => normalizePostalCode(code))
        .includes(postalCode);
}

function loadDeliveryConfig() {
    const defaultConfig = {
        currency: 'ARS',
        installationBaseCost: 200000,
        installationComplexNotice: 'Instalaciones complejas se cotizan aparte.',
        unsupportedPostalCodeMessage: 'No podemos calcular el envío automáticamente para tu CP. Contactanos para cotización.',
        factoryPickup: {
            address: 'Salto 850, Francisco Álvarez, Moreno, Buenos Aires',
            note: 'Retiro sin costo. El cliente debe venir con su flete propio. Se entrega el mueble en fábrica.'
        },
        shippingRules: [],
        interiorFreightTable: {
            densityFactorKgPerM3: 250,
            tiers: []
        },
        installationZones: {
            label: 'Buenos Aires (zonas seleccionadas)',
            enabledPostalCodes: [],
            enabledRanges: []
        }
    };

    const config = readJsonFile(DELIVERY_CONFIG_PATH, defaultConfig);
    return {
        ...defaultConfig,
        ...config,
        factoryPickup: {
            ...defaultConfig.factoryPickup,
            ...(config.factoryPickup || {})
        },
        installationZones: {
            ...defaultConfig.installationZones,
            ...(config.installationZones || {})
        },
        interiorFreightTable: {
            ...defaultConfig.interiorFreightTable,
            ...(config.interiorFreightTable || {})
        }
    };
}

function findShippingRule(postalCode, config) {
    for (const rule of config.shippingRules || []) {
        if (
            isPostalCodeInList(postalCode, rule.postalCodes || [])
            || isPostalCodeInRanges(postalCode, rule.ranges || [])
        ) {
            return rule;
        }
    }

    return null;
}

function isInteriorRule(rule = {}) {
    const explicitType = normalizeText(rule?.type, 30).toLowerCase();
    if (explicitType === 'interior') {
        return true;
    }
    if (explicitType === 'amba') {
        return false;
    }

    const label = normalizeText(rule?.label, 80).toLowerCase();
    return !(label.includes('caba') || label.includes('amba'));
}

function calculateChargeableWeightKg(items = [], densityFactorKgPerM3 = 250) {
    const totals = items.reduce((accumulator, item) => {
        const quantity = Number.parseInt(item?.quantity, 10) || 0;
        const weightKg = Number.parseFloat(item?.weightKg) || 0;
        const volumeM3 = Number.parseFloat(item?.volumeM3) || 0;
        return {
            weightKg: accumulator.weightKg + (quantity * weightKg),
            volumeM3: accumulator.volumeM3 + (quantity * volumeM3)
        };
    }, { weightKg: 0, volumeM3: 0 });

    const volumetricWeight = totals.volumeM3 * (Number.parseFloat(densityFactorKgPerM3) || 250);
    return {
        totalWeightKg: Number(totals.weightKg.toFixed(2)),
        totalVolumeM3: Number(totals.volumeM3.toFixed(3)),
        volumetricWeightKg: Number(volumetricWeight.toFixed(2)),
        chargeableWeightKg: Number(Math.max(totals.weightKg, volumetricWeight).toFixed(2))
    };
}

function findInteriorFreightTier(chargeableWeightKg, config = {}) {
    const tiers = Array.isArray(config?.interiorFreightTable?.tiers)
        ? [...config.interiorFreightTable.tiers]
            .map(tier => ({
                label: normalizeText(tier?.label, 80),
                maxChargeableKg: Number.parseFloat(tier?.maxChargeableKg),
                cost: Number.parseInt(tier?.cost, 10)
            }))
            .filter(tier => (
                Number.isFinite(tier.maxChargeableKg)
                && tier.maxChargeableKg > 0
                && Number.isInteger(tier.cost)
                && tier.cost >= 0
            ))
            .sort((left, right) => left.maxChargeableKg - right.maxChargeableKg)
        : [];

    if (tiers.length === 0) return null;
    return tiers.find(tier => chargeableWeightKg <= tier.maxChargeableKg) || tiers[tiers.length - 1];
}

function isInstallationAvailable(postalCode, config) {
    const zones = config.installationZones || {};
    if (isPostalCodeInList(postalCode, zones.enabledPostalCodes || [])) {
        return true;
    }

    return isPostalCodeInRanges(postalCode, zones.enabledRanges || []);
}

function calculateDelivery(rawDelivery, config, validatedItems = []) {
    const method = String(rawDelivery?.method || '').trim().toLowerCase();

    if (method !== DELIVERY_METHODS.SHIPPING && method !== DELIVERY_METHODS.PICKUP) {
        const error = new Error('Seleccioná un método de entrega válido');
        error.status = 400;
        throw error;
    }

    if (method === DELIVERY_METHODS.PICKUP) {
        return {
            method,
            postalCode: null,
            shippingLabel: 'Retiro en fábrica',
            shippingCost: 0,
            installationAvailable: false,
            installationRequested: false,
            installationBaseCost: Number.parseInt(config.installationBaseCost, 10) || 200000,
            installationCost: 0
        };
    }

    const postalCode = normalizePostalCode(rawDelivery?.postalCode);
    if (!POSTAL_CODE_PATTERN.test(postalCode)) {
        const error = new Error('Ingresá un código postal válido de 4 dígitos');
        error.status = 400;
        throw error;
    }

    const shippingRule = findShippingRule(postalCode, config);
    if (!shippingRule) {
        const error = new Error(config.unsupportedPostalCodeMessage);
        error.status = 422;
        error.code = 'UNSUPPORTED_POSTAL_CODE';
        throw error;
    }

    const installationBaseCost = Number.parseInt(config.installationBaseCost, 10) || 200000;
    const installationAllowed = isInstallationAvailable(postalCode, config);
    const installationRequested = Boolean(rawDelivery?.installationRequested);
    let shippingCost = Number.parseInt(shippingRule.cost, 10);
    let shippingLabel = String(shippingRule.label || 'Envío a domicilio').slice(0, 80);
    const shippingMeta = {};

    if (isInteriorRule(shippingRule) && Array.isArray(validatedItems) && validatedItems.length > 0) {
        const densityFactor = Number.parseFloat(config?.interiorFreightTable?.densityFactorKgPerM3) || 250;
        const weightSummary = calculateChargeableWeightKg(validatedItems, densityFactor);
        const freightTier = findInteriorFreightTier(weightSummary.chargeableWeightKg, config);

        if (freightTier) {
            shippingCost = freightTier.cost;
            shippingLabel = `${shippingLabel} (${freightTier.label})`.slice(0, 80);
            shippingMeta.freightTier = freightTier.label;
            shippingMeta.chargeableWeightKg = weightSummary.chargeableWeightKg;
            shippingMeta.totalWeightKg = weightSummary.totalWeightKg;
            shippingMeta.totalVolumeM3 = weightSummary.totalVolumeM3;
        }
    }

    if (!Number.isInteger(shippingCost) || shippingCost < 0) {
        const error = new Error('La configuración de envío para ese código postal es inválida');
        error.status = 500;
        throw error;
    }

    if (installationRequested && !installationAllowed) {
        const error = new Error('Instalación no disponible en tu zona. Podés continuar con envío sin instalación o retiro por fábrica.');
        error.status = 400;
        throw error;
    }

    return {
        method,
        postalCode,
        shippingLabel,
        shippingCost,
        installationAvailable: installationAllowed,
        installationRequested,
        installationBaseCost,
        installationCost: installationRequested ? installationBaseCost : 0,
        shippingMeta
    };
}

function readOrdersStore() {
    const data = readJsonFile(ORDERS_DB_PATH, { orders: [] });
    return Array.isArray(data.orders) ? data : { orders: [] };
}

function writeOrdersStore(data) {
    writeJsonFile(ORDERS_DB_PATH, data);
}

function generateOrderId() {
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `ZM-${Date.now()}-${randomPart}`;
}

function generateExternalReference() {
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `ORDER_${Date.now()}_${randomPart}`;
}

function shouldEnableMercadoPagoAutoReturn(baseUrl) {
    try {
        const parsedUrl = new URL(baseUrl);
        const hostname = parsedUrl.hostname.toLowerCase();
        const isLocalHost = (
            hostname === 'localhost'
            || hostname === '127.0.0.1'
            || hostname === '0.0.0.0'
            || hostname.endsWith('.local')
        );

        if (isLocalHost) {
            return false;
        }

        return parsedUrl.protocol === 'https:';
    } catch {
        return false;
    }
}

function createOrder(orderRecord) {
    const store = readOrdersStore();
    store.orders.push(orderRecord);
    writeOrdersStore(store);
    return orderRecord;
}

function findOrder(orderId) {
    const store = readOrdersStore();
    return store.orders.find(order => order.orderId === orderId) || null;
}

function findOrderByPreferenceId(preferenceId) {
    const trimmedPreferenceId = String(preferenceId || '').trim();
    if (!trimmedPreferenceId) return null;

    const store = readOrdersStore();
    return store.orders.find(order => (
        order.preferenceId === trimmedPreferenceId
        || normalizeMpIdentifier(order?.mp?.preferenceId, 120) === trimmedPreferenceId
    )) || null;
}

function findOrderByExternalReference(externalReference) {
    const normalizedRef = normalizeOrderLookupRef(externalReference);
    if (!normalizedRef) return null;

    const store = readOrdersStore();
    return store.orders.find(order => normalizeOrderLookupRef(order.externalReference) === normalizedRef) || null;
}

function findOrderByPaymentId(paymentId) {
    const normalizedPaymentId = normalizeMpIdentifier(paymentId, 80);
    if (!normalizedPaymentId) return null;

    const store = readOrdersStore();
    return store.orders.find(order => {
        const orderPaymentId = normalizeMpIdentifier(
            order?.mp?.paymentId || order?.paymentMeta?.paymentId,
            80
        );
        return orderPaymentId === normalizedPaymentId;
    }) || null;
}

function findOrderByMerchantOrderId(merchantOrderId) {
    const normalizedMerchantOrderId = normalizeMpIdentifier(merchantOrderId, 120);
    if (!normalizedMerchantOrderId) return null;

    const store = readOrdersStore();
    return store.orders.find(order => {
        const orderMerchantOrderId = normalizeMpIdentifier(order?.mp?.merchantOrderId, 120);
        return orderMerchantOrderId === normalizedMerchantOrderId;
    }) || null;
}

function findOrderByAnyReference({
    orderRef = '',
    orderId = '',
    externalReference = '',
    preferenceId = '',
    paymentId = '',
    merchantOrderId = ''
} = {}) {
    const normalizedOrderRef = normalizeOrderLookupRef(orderRef);
    const normalizedOrderId = normalizeOrderLookupRef(orderId);
    const normalizedExternalReference = normalizeOrderLookupRef(externalReference);
    const normalizedPreferenceId = normalizeMpIdentifier(preferenceId, 120);
    const normalizedPaymentId = normalizeMpIdentifier(paymentId, 80);
    const normalizedMerchantOrderId = normalizeMpIdentifier(merchantOrderId, 120);

    if (normalizedOrderRef) {
        const byOrderRef = findOrder(normalizedOrderRef) || findOrderByExternalReference(normalizedOrderRef);
        if (byOrderRef) return byOrderRef;
    }

    if (normalizedOrderId) {
        const byOrderId = findOrder(normalizedOrderId) || findOrderByExternalReference(normalizedOrderId);
        if (byOrderId) return byOrderId;
    }

    if (normalizedExternalReference) {
        const byExternalRef = findOrderByExternalReference(normalizedExternalReference) || findOrder(normalizedExternalReference);
        if (byExternalRef) return byExternalRef;
    }

    if (normalizedPreferenceId) {
        const byPreference = findOrderByPreferenceId(normalizedPreferenceId);
        if (byPreference) return byPreference;
    }

    if (normalizedPaymentId) {
        const byPaymentId = findOrderByPaymentId(normalizedPaymentId);
        if (byPaymentId) return byPaymentId;
    }

    if (normalizedMerchantOrderId) {
        const byMerchantOrderId = findOrderByMerchantOrderId(normalizedMerchantOrderId);
        if (byMerchantOrderId) return byMerchantOrderId;
    }

    return null;
}

function updateOrder(orderId, updater) {
    const store = readOrdersStore();
    const index = store.orders.findIndex(order => order.orderId === orderId);
    if (index === -1) return null;

    const currentOrder = store.orders[index];
    const updatedOrder = updater({ ...currentOrder });
    store.orders[index] = updatedOrder;
    writeOrdersStore(store);
    return updatedOrder;
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isMercadoPagoNetworkError(error) {
    const networkCodes = new Set([
        'EHOSTUNREACH',
        'ENETUNREACH',
        'ETIMEDOUT',
        'ECONNRESET',
        'ECONNREFUSED',
        'EAI_AGAIN'
    ]);

    const errorCode = String(error?.code || error?.cause?.code || '').toUpperCase();
    return networkCodes.has(errorCode);
}

async function createMercadoPagoPreferenceWithRetry(preferenceClient, payload) {
    let lastError;

    for (let attempt = 1; attempt <= MP_RETRY_ATTEMPTS; attempt += 1) {
        try {
            return await preferenceClient.create({ body: payload });
        } catch (error) {
            lastError = error;
            if (!isMercadoPagoNetworkError(error) || attempt === MP_RETRY_ATTEMPTS) {
                throw error;
            }

            const delay = MP_RETRY_DELAY_MS * attempt;
            console.warn(`⚠️ Reintento Mercado Pago ${attempt}/${MP_RETRY_ATTEMPTS} en ${delay}ms (${error.code})`);
            await wait(delay);
        }
    }

    throw lastError;
}

const trustProxyValue = process.env.TRUST_PROXY;
const trustProxySetting = trustProxyValue === undefined
    ? 1
    : (Number.isNaN(Number(trustProxyValue)) ? trustProxyValue : Number(trustProxyValue));

app.set('trust proxy', trustProxySetting);
app.disable('x-powered-by');

const cspDirectives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    scriptSrc: [
        "'self'",
        'https://cdnjs.cloudflare.com'
    ],
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
    styleSrcAttr: ["'unsafe-inline'"],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
    imgSrc: ["'self'", 'data:'],
    connectSrc: [
        "'self'",
        'https://api.mercadopago.com',
        'https://formspree.io'
    ],
    frameSrc: ["'self'"],
    formAction: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"]
};

if (isProduction) {
    cspDirectives.upgradeInsecureRequests = [];
} else {
    cspDirectives.upgradeInsecureRequests = null;
}

app.use(helmet({
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    noSniff: true,
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
    hsts: isProduction
        ? { maxAge: 31536000, includeSubDomains: true, preload: false }
        : false,
    permissionsPolicy: {
        features: {
            geolocation: [],
            microphone: [],
            camera: [],
            payment: ['self'],
            usb: [],
            browsingTopics: []
        }
    },
    contentSecurityPolicy: {
        useDefaults: true,
        directives: cspDirectives
    }
}));

app.use((req, res, next) => {
    res.setHeader(
        'Permissions-Policy',
        'geolocation=(), microphone=(), camera=(), payment=(self), usb=(), browsing-topics=()'
    );
    next();
});

if (forceHttps) {
    app.use((req, res, next) => {
        const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
        if (protocol === 'https') {
            return next();
        }

        return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    });
}

const corsOptions = {
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
            return callback(null, true);
        }

        if (!isProduction) {
            console.warn(`[CORS] Origin bloqueado: ${origin || 'null'}`);
        }

        return callback(new Error('Origen no permitido por CORS'));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'X-CSRF-Token', 'X-Admin-Token', 'X-Request-Id'],
    credentials: false,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use((request, response, next) => {
    const incomingRequestId = String(request.get('x-request-id') || '').trim().slice(0, 120);
    const requestId = incomingRequestId || generateRequestId();
    request.requestId = requestId;
    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    const startedAt = Date.now();

    response.on('finish', () => {
        if (!isProduction || request.path.startsWith('/forms/')) {
            console.info(
                `[${requestId}] ${request.method} ${request.originalUrl} ${response.statusCode} ${Date.now() - startedAt}ms`
            );
        }
    });

    next();
});
app.use(compression({ threshold: 1024 }));
app.use(cookieParser());
app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

function createRandomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
}

function getOrCreateCsrfSession(request, response) {
    let sessionId = request.cookies?.[CSRF_SESSION_COOKIE_NAME];

    if (!sessionId || !/^[a-f0-9]{48}$/i.test(sessionId)) {
        sessionId = createRandomToken(24);
        response.cookie(CSRF_SESSION_COOKIE_NAME, sessionId, {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            path: '/'
        });
    }

    let csrfToken = csrfSessions.get(sessionId);
    if (!csrfToken) {
        csrfToken = createRandomToken(32);
        csrfSessions.set(sessionId, csrfToken);

        if (csrfSessions.size > MAX_CSRF_SESSIONS) {
            const oldestSessionId = csrfSessions.keys().next().value;
            if (oldestSessionId) {
                csrfSessions.delete(oldestSessionId);
            }
        }
    }

    return { sessionId, csrfToken };
}

function attachCsrfSession(req, res, next) {
    const { sessionId, csrfToken } = getOrCreateCsrfSession(req, res);
    res.locals.csrfSessionId = sessionId;
    res.locals.csrfToken = csrfToken;
    return next();
}

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number.parseInt(process.env.RATE_LIMIT_MAX, 10) || 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        ok: false,
        error: 'Demasiadas solicitudes. Intentá nuevamente en unos minutos.'
    }
});

const checkoutLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: Number.parseInt(process.env.CHECKOUT_RATE_LIMIT_MAX, 10) || 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        ok: false,
        error: 'Demasiados intentos de checkout. Esperá unos minutos.'
    }
});

const contactLimiter = rateLimit({
    windowMs: Number.parseInt(process.env.CONTACT_RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000,
    max: Number.parseInt(process.env.CONTACT_RATE_LIMIT_MAX, 10) || 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        ok: false,
        error: 'Demasiados envíos de formulario. Probá nuevamente en unos minutos.'
    }
});

const quoteLimiter = rateLimit({
    windowMs: Number.parseInt(process.env.QUOTE_RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000,
    max: Number.parseInt(process.env.QUOTE_RATE_LIMIT_MAX, 10) || 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        ok: false,
        error: 'Demasiadas solicitudes de cotización. Esperá unos minutos y volvé a intentar.'
    }
});

const formsLimiter = rateLimit({
    windowMs: Number.parseInt(process.env.FORMS_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: Number.parseInt(process.env.FORMS_RATE_LIMIT_MAX, 10) || 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (request, response) => {
        return response.status(429).json({
            ok: false,
            error: 'Demasiados envíos de formulario. Esperá unos minutos e intentá nuevamente.',
            code: 'rate_limited',
            requestId: request.requestId
        });
    }
});

function hasAllowedOrigin(request) {
    const origin = String(request.get('origin') || '').trim();
    const refererOrigin = extractOriginFromUrlLike(request.get('referer'));
    return isAllowedOrigin(origin) || isAllowedOrigin(refererOrigin);
}

function requireAllowedOrigin(request, response, next) {
    if (hasAllowedOrigin(request)) {
        return next();
    }

    if (!isProduction) {
        console.warn(
            `[CORS] Request bloqueado por source inválido. origin=${request.get('origin') || 'null'} referer=${request.get('referer') || 'null'}`
        );
    }
    return response.status(403).json({ ok: false, error: 'Origen no permitido', code: 'origin_not_allowed' });
}

function safeCompareTokens(leftValue, rightValue) {
    const left = String(leftValue || '');
    const right = String(rightValue || '');
    if (!left || !right || left.length !== right.length) {
        return false;
    }

    return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function getAdminPanelToken() {
    const configured = normalizeText(process.env.ADMIN_PANEL_TOKEN, 200);
    if (configured) {
        return configured;
    }

    return isProduction ? '' : DEFAULT_ADMIN_PANEL_TOKEN;
}

function requireAdminAuth(request, response, next) {
    const expectedToken = getAdminPanelToken();
    if (!expectedToken) {
        return response.status(503).json({
            ok: false,
            error: 'Panel interno no disponible. Configurá ADMIN_PANEL_TOKEN en el servidor.'
        });
    }

    const providedToken = normalizeText(
        request.get('x-admin-token')
        || request.query?.token
        || request.body?.adminToken,
        200
    );

    if (!safeCompareTokens(expectedToken, providedToken)) {
        return response.status(401).json({ ok: false, error: 'Token de administrador inválido' });
    }

    return next();
}

app.use('/api/', apiLimiter);
app.use('/api/mp/create-preference', checkoutLimiter, requireAllowedOrigin);
app.use('/api/contact', contactLimiter, requireAllowedOrigin);
app.use('/api/quotes', quoteLimiter, requireAllowedOrigin);
app.use('/forms/', formsLimiter, requireAllowedFormSource);
app.get('/forms/config', requireAllowedOrigin, (_request, response) => {
    return response.json({
        ok: true,
        enabled: false
    });
});
app.get('/api/csrf-token', requireAllowedOrigin, attachCsrfSession, (req, res) => {
    if (!hasAllowedOrigin(req)) {
        return res.status(403).json({ ok: false, error: 'Origen no permitido' });
    }

    return res.json({ ok: true, csrfToken: res.locals.csrfToken });
});

const blockedPrefixPaths = ['/backend/', '/scripts/', '/node_modules/', '/.github/', '/config/', '/data/', '/pages/'];
const blockedFilePattern = /\.(?:md|map|ya?ml|toml|cjs|mjs|env|example|log)$/i;

if (hasFrontendStaticBundle) {
    app.use((req, res, next) => {
        const normalizedPath = String(req.path || '/');
        const normalizedPathWithSlash = normalizedPath.endsWith('/') ? normalizedPath : `${normalizedPath}/`;
        if (blockedPrefixPaths.some(prefix => normalizedPathWithSlash.startsWith(prefix))) {
            return res.status(404).end();
        }

        const fileName = path.basename(normalizedPath).toLowerCase();
        if (
            blockedFilePattern.test(fileName)
            || fileName === 'package.json'
            || fileName === 'package-lock.json'
        ) {
            return res.status(404).end();
        }

        return next();
    });

    const friendlyStaticRoutes = new Map();
    const staticPages = fs.readdirSync(FRONTEND_PAGES_PATH)
        .filter(fileName => fileName.toLowerCase().endsWith('.html'));

    for (const htmlFile of staticPages) {
        const baseName = htmlFile.replace(/\.html$/i, '');
        if (baseName === '404') {
            continue;
        }

        friendlyStaticRoutes.set(`/${baseName}`, htmlFile);
        friendlyStaticRoutes.set(`/${baseName}.html`, htmlFile);
    }

    const customFriendlyAliases = new Map([
        ['/tienda/escritorios', 'tienda-escritorios.html'],
        ['/tienda/cocinas', 'tienda-cocinas.html'],
        ['/tienda/placards', 'tienda-placards.html'],
        ['/tienda/living', 'tienda-living.html'],
        ['/tienda/comedor', 'tienda-comedor.html']
    ]);

    for (const [routePath, htmlFile] of customFriendlyAliases.entries()) {
        friendlyStaticRoutes.set(routePath, htmlFile);
    }

    app.get(Array.from(friendlyStaticRoutes.keys()), (req, res) => {
        const htmlFile = friendlyStaticRoutes.get(req.path);
        if (!htmlFile) {
            return res.status(404).end();
        }

        return res.sendFile(path.resolve(FRONTEND_PAGES_PATH, htmlFile));
    });

    app.use(express.static(FRONTEND_ROOT_PATH, {
        index: 'index.html',
        extensions: ['html'],
        maxAge: isProduction ? '1d' : 0,
        etag: true,
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
                res.setHeader('Cache-Control', 'no-store');
                return;
            }

            if (/\.(css|js|mjs|webp|png|jpg|jpeg|svg|ico|woff2?)$/i.test(filePath)) {
                const cacheControl = isProduction
                    ? 'public, max-age=31536000, immutable'
                    : 'public, max-age=0';
                res.setHeader('Cache-Control', cacheControl);
            }
        }
    }));
} else {
    console.warn(`⚠️ Frontend estático no encontrado en ${FRONTEND_ROOT_PATH}. Se inicia modo API-only.`);
}

const hasMercadoPagoAccessToken = Boolean(normalizeText(process.env.MP_ACCESS_TOKEN, 600));
if (!hasMercadoPagoAccessToken) {
    console.warn('⚠️ MP_ACCESS_TOKEN no está configurado. Mercado Pago quedará deshabilitado.');
}

try {
    new URL(BASE_URL);
} catch {
    console.error(`❌ Error: BASE_URL invalida (${BASE_URL})`);
    process.exit(1);
}

const client = hasMercadoPagoAccessToken
    ? new MercadoPagoConfig({
        accessToken: process.env.MP_ACCESS_TOKEN,
        options: { timeout: 5000 }
    })
    : null;

const preference = client
    ? new Preference(client)
    : null;

function buildValidatedItems(rawItems, options = {}) {
    const allowEmpty = Boolean(options.allowEmpty);

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        if (allowEmpty) {
            return [];
        }

        const error = new Error('El carrito está vacío o es inválido');
        error.status = 400;
        throw error;
    }

    if (rawItems.length > MAX_CART_ITEMS) {
        const error = new Error(`El carrito supera el máximo permitido (${MAX_CART_ITEMS} items)`);
        error.status = 400;
        throw error;
    }

    const validatedItems = [];

    for (const item of rawItems) {
        const id = Number.parseInt(item?.id, 10);
        const quantity = Number.parseInt(item?.quantity, 10);

        if (!Number.isInteger(id) || !Object.prototype.hasOwnProperty.call(PRODUCT_CATALOG, id)) {
            const error = new Error(`Producto ID ${item?.id} no encontrado en el catálogo`);
            error.status = 400;
            throw error;
        }

        if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
            const error = new Error(`Cantidad inválida para el producto ${id}`);
            error.status = 400;
            throw error;
        }

        const product = PRODUCT_CATALOG[id];
        validatedItems.push({
            id: String(id),
            title: product.name.slice(0, 120),
            description: String(product.specs || product.name).slice(0, 256),
            quantity,
            unit_price: product.price,
            currency_id: 'ARS',
            category: product.category,
            fulfillmentModel: product.fulfillmentModel,
            stock: product.stock,
            stockShipLabel: product.stockShipLabel,
            madeToOrderShipLabel: product.madeToOrderShipLabel,
            weightKg: Number(product.weightKg) || 0,
            volumeM3: Number(product.volumeM3) || 0
        });
    }

    return validatedItems;
}

function ensureStoreStockAvailability(items = []) {
    for (const item of items) {
        const product = PRODUCT_CATALOG[Number.parseInt(item.id, 10)];
        if (!product) {
            continue;
        }

        if (product.fulfillmentModel !== 'stock') {
            continue;
        }

        const availableStock = Number.parseInt(product.stock, 10) || 0;
        if (item.quantity > availableStock) {
            const error = new Error(
                `No hay stock suficiente para "${product.name}". Disponible: ${availableStock}.`
            );
            error.status = 409;
            throw error;
        }
    }
}

function reserveStockForOrder(order) {
    if (!order || order.stockReserved) {
        return { ok: true, updated: false };
    }

    const orderType = normalizeText(order.orderType, 20).toLowerCase();
    if (orderType !== ORDER_TYPE_STORE) {
        return { ok: true, updated: false };
    }

    const currentConfig = loadCommerceConfig();
    const productsById = new Map(currentConfig.products.map(product => [Number.parseInt(product.id, 10), product]));
    const stockDeltas = new Map();

    for (const item of order.items || []) {
        const id = Number.parseInt(item?.id, 10);
        const quantity = Number.parseInt(item?.quantity, 10) || 0;
        if (!Number.isInteger(id) || quantity <= 0) {
            continue;
        }

        const configuredProduct = productsById.get(id);
        if (!configuredProduct || configuredProduct.fulfillmentModel !== 'stock') {
            continue;
        }

        const existing = stockDeltas.get(id) || 0;
        stockDeltas.set(id, existing + quantity);
    }

    if (stockDeltas.size === 0) {
        return { ok: true, updated: false };
    }

    for (const [productId, quantity] of stockDeltas.entries()) {
        const product = productsById.get(productId);
        const availableStock = Math.max(0, Number.parseInt(product.stock, 10) || 0);
        if (quantity > availableStock) {
            return {
                ok: false,
                error: `Stock insuficiente para ${sanitizeSingleLine(product.name, 120)}. Disponible ${availableStock}.`
            };
        }
    }

    currentConfig.products = currentConfig.products.map(product => {
        const productId = Number.parseInt(product.id, 10);
        const quantityToReserve = stockDeltas.get(productId) || 0;
        if (!quantityToReserve) {
            return product;
        }

        const nextStock = Math.max(0, (Number.parseInt(product.stock, 10) || 0) - quantityToReserve);
        return {
            ...product,
            stock: nextStock
        };
    });

    persistCommerceConfig(currentConfig);
    return { ok: true, updated: true };
}

function releaseStockForOrder(order) {
    if (!order || !order.stockReserved) {
        return { ok: true, updated: false };
    }

    const orderType = normalizeText(order.orderType, 20).toLowerCase();
    if (orderType !== ORDER_TYPE_STORE) {
        return { ok: true, updated: false };
    }

    const currentConfig = loadCommerceConfig();
    const stockDeltas = new Map();

    for (const item of order.items || []) {
        const id = Number.parseInt(item?.id, 10);
        const quantity = Number.parseInt(item?.quantity, 10) || 0;
        const product = currentConfig.products.find(current => Number.parseInt(current.id, 10) === id);
        if (!product || product.fulfillmentModel !== 'stock' || quantity <= 0) {
            continue;
        }

        const existing = stockDeltas.get(id) || 0;
        stockDeltas.set(id, existing + quantity);
    }

    if (stockDeltas.size === 0) {
        return { ok: true, updated: false };
    }

    currentConfig.products = currentConfig.products.map(product => {
        const productId = Number.parseInt(product.id, 10);
        const quantityToRelease = stockDeltas.get(productId) || 0;
        if (!quantityToRelease) {
            return product;
        }

        return {
            ...product,
            stock: (Number.parseInt(product.stock, 10) || 0) + quantityToRelease
        };
    });

    persistCommerceConfig(currentConfig);
    return { ok: true, updated: true };
}

function calculateItemsSubtotal(items) {
    return items.reduce((acc, item) => acc + (item.unit_price * item.quantity), 0);
}

function buildPublicOrderPayload(order) {
    const orderRef = normalizeOrderLookupRef(order.externalReference) || order.orderId;
    const paymentStatus = normalizeText(order.paymentStatus || order?.mp?.status || 'pending', 40).toLowerCase();
    const paymentMethod = normalizePaymentMethod(order.paymentMethod);
    const fulfillmentStatus = normalizeOrderStatus(
        order.fulfillmentStatus
        || (order.paid ? 'payment_confirmed' : 'pending_payment')
    );
    const timeline = Array.isArray(order.timeline)
        ? order.timeline
        : [];

    return {
        orderRef,
        orderId: order.orderId,
        externalReference: normalizeOrderLookupRef(order.externalReference) || null,
        orderType: normalizeText(order.orderType, 20).toLowerCase() === ORDER_TYPE_CUSTOM
            ? ORDER_TYPE_CUSTOM
            : ORDER_TYPE_STORE,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        preferenceId: order.preferenceId || order?.mp?.preferenceId || null,
        paymentId: normalizeMpIdentifier(order?.mp?.paymentId || order?.paymentMeta?.paymentId, 80) || null,
        merchantOrderId: normalizeMpIdentifier(order?.mp?.merchantOrderId, 120) || null,
        paymentMethod,
        paymentMethodLabel: getPaymentMethodLabel(paymentMethod),
        paymentStatus,
        paid: Boolean(order.paid || paymentStatus === 'approved'),
        fulfillmentStatus,
        fulfillmentLabel: ORDER_STATUS_LABELS[fulfillmentStatus] || 'En gestión',
        checkoutStatus: order.checkoutStatus,
        estimatedLeadTime: normalizeText(order.estimatedLeadTime, 220) || inferOrderLeadTime(order.items || []),
        stockReserved: Boolean(order.stockReserved),
        delivery: order.delivery,
        totals: order.totals,
        hasDeliveryDetails: Boolean(order.customerData),
        timeline,
        trackingUrl: normalizeText(order.tracking_url, 600) || null,
        factoryPickup: loadDeliveryConfig().factoryPickup
    };
}

function buildPublicQuotePayload(quote) {
    const normalizedStatus = normalizeQuoteStatus(quote.status || 'received');
    const timeline = Array.isArray(quote.timeline)
        ? quote.timeline
        : [];

    return {
        quoteId: normalizeText(quote.quoteId, 80),
        createdAt: quote.createdAt,
        updatedAt: quote.updatedAt,
        status: normalizedStatus,
        statusLabel: QUOTE_STATUS_LABELS[normalizedStatus] || normalizedStatus,
        source: normalizeText(quote.source, 40) || 'web',
        linkedOrderId: normalizeText(quote.linkedOrderId, 80) || null,
        customer: {
            fullName: sanitizeSingleLine(quote?.customer?.fullName || quote.fullName, 120),
            email: sanitizeEmail(quote?.customer?.email || quote.email),
            phone: sanitizeSingleLine(quote?.customer?.phone || quote.phone, 40),
            cityNeighborhood: sanitizeSingleLine(quote?.customer?.cityNeighborhood || quote.cityNeighborhood, 120),
            province: sanitizeSingleLine(quote?.customer?.province || quote.province, 80)
        },
        project: {
            furnitureType: sanitizeSingleLine(quote?.project?.furnitureType || quote.furnitureType, 80),
            approximateMeasures: sanitizeMultiLine(quote?.project?.approximateMeasures || quote.approximateMeasures, 600),
            estimatedBudget: sanitizeSingleLine(quote?.project?.estimatedBudget || quote.estimatedBudget, 40),
            targetDate: sanitizeSingleLine(quote?.project?.targetDate || quote.targetDate, 20),
            additionalComments: sanitizeMultiLine(quote?.project?.additionalComments || quote.additionalComments, 2000),
            leadTimeEstimate: sanitizeSingleLine(
                quote?.project?.leadTimeEstimate || quote?.leadTimeEstimate || 'Se define en la propuesta final',
                160
            )
        },
        attachments: Array.isArray(quote.attachments) ? quote.attachments : [],
        timeline
    };
}

function isValidOrderLookupRef(orderRef) {
    if (!orderRef) return false;
    return ORDER_ID_PATTERN.test(orderRef) || EXTERNAL_REFERENCE_PATTERN.test(orderRef);
}

function formatOrderCurrency(value) {
    return `$${Number(value || 0).toLocaleString('es-AR')}`;
}

function normalizePaymentMethod(input) {
    const normalized = normalizeText(input, 40).toLowerCase();
    if (normalized === PAYMENT_METHODS.BANK_TRANSFER) return PAYMENT_METHODS.BANK_TRANSFER;
    if (normalized === PAYMENT_METHODS.CASH_PICKUP) return PAYMENT_METHODS.CASH_PICKUP;
    return PAYMENT_METHODS.MERCADOPAGO;
}

function getPaymentMethodLabel(paymentMethod) {
    const normalized = normalizePaymentMethod(paymentMethod);
    if (normalized === PAYMENT_METHODS.BANK_TRANSFER) return 'Transferencia bancaria';
    if (normalized === PAYMENT_METHODS.CASH_PICKUP) return 'Efectivo en retiro';
    return 'Mercado Pago (tarjeta/debito/credito)';
}

function inferOrderLeadTime(items = []) {
    let hasMadeToOrder = false;
    let hasStock = false;

    for (const item of items) {
        if (String(item?.fulfillmentModel || '').toLowerCase() === 'made_to_order') {
            hasMadeToOrder = true;
        } else {
            hasStock = true;
        }
    }

    if (hasMadeToOrder && hasStock) {
        return 'Pedido mixto: entrega estimada entre 10 y 20 días hábiles.';
    }

    if (hasMadeToOrder) {
        return 'Fabricación bajo pedido: entrega estimada entre 10 y 20 días hábiles.';
    }

    return 'Productos en stock: envío estimado en 48/72 hs hábiles.';
}

function normalizeOrderStatus(status, fallback = 'pending_payment') {
    const normalized = normalizeText(status, 60).toLowerCase();
    return ORDER_STATUS_LABELS[normalized] ? normalized : fallback;
}

function normalizeQuoteStatus(status, fallback = 'received') {
    const normalized = normalizeText(status, 60).toLowerCase();
    return QUOTE_STATUS_LABELS[normalized] ? normalized : fallback;
}

function mapOrderStatusToEventKey(status) {
    const normalized = normalizeOrderStatus(status);
    if (normalized === 'pending_transfer_confirmation') return 'transfer_pending';
    if (normalized === 'pending_cash_pickup_payment') return 'cash_pickup_pending';
    if (normalized === 'payment_confirmed') return 'payment_confirmed';
    if (normalized === 'preparing') return 'preparing';
    if (normalized === 'shipped') return 'shipped';
    if (normalized === 'ready_for_pickup') return 'ready_for_pickup';
    if (normalized === 'ready_for_delivery') return 'ready_for_delivery';
    return 'order_received';
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createEmailTransporter() {
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !Number.isInteger(SMTP_PORT)) {
        return null;
    }

    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });
}

const emailTransporter = createEmailTransporter();

function isEmailNotificationConfigured() {
    return Boolean(emailTransporter && FROM_EMAIL && ADMIN_EMAIL);
}

function canSendCustomerEmails() {
    return Boolean(emailTransporter && FROM_EMAIL);
}

function getOrderReference(order) {
    return normalizeOrderLookupRef(order.externalReference) || normalizeOrderLookupRef(order.orderId);
}

function summarizeOrderItems(order) {
    return (order.items || []).map(item => {
        const quantity = Number.parseInt(item.quantity, 10) || 0;
        const unitPrice = Number.parseInt(item.unit_price, 10) || 0;
        const lineTotal = quantity * unitPrice;

        return {
            id: normalizeText(item.id, 40),
            title: normalizeText(item.title, 120),
            quantity,
            unitPrice,
            lineTotal
        };
    });
}

function buildOrderSummaryText(order) {
    const summarizedItems = summarizeOrderItems(order);
    const furnitureTypes = summarizedItems.map(item => item.title).filter(Boolean).join(', ') || 'No informado';
    const lines = summarizedItems.map((item, index) => (
        `${index + 1}. ${item.title} (${item.id}) x${item.quantity} - ${formatOrderCurrency(item.unitPrice)} c/u - ${formatOrderCurrency(item.lineTotal)}`
    ));

    const totals = order.totals || {};
    const paymentStatus = normalizeText(order.paymentStatus || order?.mp?.status || 'pending', 40);
    const orderRef = getOrderReference(order);
    const paymentMethod = getPaymentMethodLabel(order.paymentMethod);
    const fulfillmentStatus = ORDER_STATUS_LABELS[normalizeOrderStatus(order.fulfillmentStatus || order.checkoutStatus)] || 'En gestión';
    const estimatedLeadTime = normalizeText(order.estimatedLeadTime, 200) || inferOrderLeadTime(order.items || []);

    return {
        orderRef,
        furnitureTypes,
        itemsLines: lines.length > 0 ? lines.join('\n') : 'Sin items',
        totals,
        paymentStatus,
        paymentMethod,
        fulfillmentStatus,
        estimatedLeadTime
    };
}

function buildAdminEmailPayload(order) {
    const customer = order.customerData || {};
    const mpData = order.mp || {};
    const summary = buildOrderSummaryText(order);
    const customerAddress = buildAddressLine(customer);
    const receiverLabel = customer.receiverType === 'otra_persona'
        ? `Otra persona (${normalizeText(customer.receiverName, 120) || 'Sin nombre'})`
        : 'Titular del pedido';

    const text = [
        `Nueva compra aprobada - ${summary.orderRef}`,
        '',
        'Datos del cliente',
        `- Nombre: ${normalizeText(customer.fullName, 120) || 'No informado'}`,
        `- Email: ${sanitizeEmail(customer.email) || 'No informado'}`,
        `- Teléfono: ${normalizeText(customer.phone, 40) || 'No informado'}`,
        `- DNI/CUIT: ${normalizeText(customer.documentId, 20) || 'No informado'}`,
        `- Dirección: ${customerAddress || 'No informado'}`,
        `- Referencias: ${normalizeText(customer.addressReference, 180) || 'No informado'}`,
        `- Coordinación: ${normalizeText(customer.availableSchedule, 120) || 'No informado'}`,
        `- Quién recibe: ${receiverLabel}`,
        '',
        'Resumen del pedido',
        `- Tipo de mueble: ${summary.furnitureTypes}`,
        summary.itemsLines,
        `Subtotal: ${formatOrderCurrency(summary.totals?.subtotal)}`,
        `Envío: ${formatOrderCurrency(summary.totals?.shipping)}`,
        `Instalación: ${formatOrderCurrency(summary.totals?.installation)}`,
        `Total: ${formatOrderCurrency(summary.totals?.total)}`,
        '',
        'Pago',
        `- payment_id: ${normalizeMpIdentifier(mpData.paymentId, 80) || 'No informado'}`,
        `- merchant_order_id: ${normalizeMpIdentifier(mpData.merchantOrderId, 120) || 'No informado'}`,
        `- preference_id: ${normalizeMpIdentifier(mpData.preferenceId || order.preferenceId, 120) || 'No informado'}`,
        `- status: ${summary.paymentStatus || 'No informado'}`,
        `- medio_de_pago: ${summary.paymentMethod || 'No informado'}`,
        `- estado_operativo: ${summary.fulfillmentStatus || 'No informado'}`,
        '',
        `Plazo estimado: ${summary.estimatedLeadTime || 'No informado'}`,
        '',
        `tracking_url: ${normalizeText(order.tracking_url, 600) || 'Pendiente'}`
    ].join('\n');

    const htmlItems = summarizeOrderItems(order).map(item => (
        `<li>${escapeHtml(item.title)} (${escapeHtml(item.id)}) x${item.quantity} - ${escapeHtml(formatOrderCurrency(item.unitPrice))} c/u - <strong>${escapeHtml(formatOrderCurrency(item.lineTotal))}</strong></li>`
    )).join('');

    const html = `
        <h2>Nueva compra aprobada - ${escapeHtml(summary.orderRef)}</h2>
        <h3>Datos del cliente</h3>
        <ul>
            <li><strong>Nombre:</strong> ${escapeHtml(customer.fullName || 'No informado')}</li>
            <li><strong>Email:</strong> ${escapeHtml(customer.email || 'No informado')}</li>
            <li><strong>Teléfono:</strong> ${escapeHtml(customer.phone || 'No informado')}</li>
            <li><strong>DNI/CUIT:</strong> ${escapeHtml(customer.documentId || 'No informado')}</li>
            <li><strong>Dirección:</strong> ${escapeHtml(customerAddress || 'No informado')}</li>
            <li><strong>Referencias:</strong> ${escapeHtml(customer.addressReference || 'No informado')}</li>
            <li><strong>Coordinación:</strong> ${escapeHtml(customer.availableSchedule || 'No informado')}</li>
        </ul>
        <h3>Resumen del pedido</h3>
        <p><strong>Tipo de mueble:</strong> ${escapeHtml(summary.furnitureTypes)}</p>
        <ul>${htmlItems || '<li>Sin items</li>'}</ul>
        <p><strong>Subtotal:</strong> ${escapeHtml(formatOrderCurrency(summary.totals?.subtotal))}</p>
        <p><strong>Envío:</strong> ${escapeHtml(formatOrderCurrency(summary.totals?.shipping))}</p>
        <p><strong>Instalación:</strong> ${escapeHtml(formatOrderCurrency(summary.totals?.installation))}</p>
        <p><strong>Total:</strong> ${escapeHtml(formatOrderCurrency(summary.totals?.total))}</p>
        <h3>Pago</h3>
        <ul>
            <li><strong>payment_id:</strong> ${escapeHtml(mpData.paymentId || 'No informado')}</li>
            <li><strong>merchant_order_id:</strong> ${escapeHtml(mpData.merchantOrderId || 'No informado')}</li>
            <li><strong>preference_id:</strong> ${escapeHtml(mpData.preferenceId || order.preferenceId || 'No informado')}</li>
            <li><strong>status:</strong> ${escapeHtml(summary.paymentStatus || 'No informado')}</li>
            <li><strong>medio de pago:</strong> ${escapeHtml(summary.paymentMethod || 'No informado')}</li>
            <li><strong>estado operativo:</strong> ${escapeHtml(summary.fulfillmentStatus || 'No informado')}</li>
        </ul>
        <p><strong>Plazo estimado:</strong> ${escapeHtml(summary.estimatedLeadTime || 'No informado')}</p>
        <p><strong>tracking_url:</strong> ${escapeHtml(order.tracking_url || 'Pendiente')}</p>
    `;

    return {
        subject: `Nueva compra aprobada - ${summary.orderRef}`,
        text,
        html
    };
}

function buildCustomerEmailPayload(order) {
    const customer = order.customerData || {};
    const summary = buildOrderSummaryText(order);
    const orderRef = summary.orderRef;

    const text = [
        `Compra confirmada - ${orderRef}`,
        '',
        `Hola ${normalizeText(customer.fullName, 120) || 'cliente'},`,
        'Compra confirmada, en breve te mandamos la factura.',
        'Luego te enviaremos el link de seguimiento del envío.',
        '',
        'Resumen de compra',
        `- Nro de pedido: ${orderRef}`,
        `- Medio de pago: ${summary.paymentMethod}`,
        `- Estado actual: ${summary.fulfillmentStatus}`,
        `- Tipo de mueble: ${summary.furnitureTypes}`,
        summary.itemsLines,
        `Subtotal: ${formatOrderCurrency(summary.totals?.subtotal)}`,
        `Envío: ${formatOrderCurrency(summary.totals?.shipping)}`,
        `Instalación: ${formatOrderCurrency(summary.totals?.installation)}`,
        `Total abonado: ${formatOrderCurrency(summary.totals?.total)}`,
        `Plazo estimado: ${summary.estimatedLeadTime}`,
        '',
        'Seguimiento',
        'Te lo enviaremos cuando despachemos tu pedido.'
    ].join('\n');

    const htmlItems = summarizeOrderItems(order).map(item => (
        `<li>${escapeHtml(item.title)} x${item.quantity} - ${escapeHtml(formatOrderCurrency(item.lineTotal))}</li>`
    )).join('');

    const html = `
        <h2>Compra confirmada - ${escapeHtml(orderRef)}</h2>
        <p>Hola ${escapeHtml(customer.fullName || 'cliente')},</p>
        <p><strong>Compra confirmada, en breve te mandamos la factura.</strong></p>
        <p>Luego te enviaremos el link de seguimiento del envío.</p>
        <h3>Resumen de compra</h3>
        <p><strong>Nro de pedido:</strong> ${escapeHtml(orderRef)}</p>
        <p><strong>Medio de pago:</strong> ${escapeHtml(summary.paymentMethod || 'No informado')}</p>
        <p><strong>Estado actual:</strong> ${escapeHtml(summary.fulfillmentStatus || 'En gestión')}</p>
        <p><strong>Tipo de mueble:</strong> ${escapeHtml(summary.furnitureTypes)}</p>
        <ul>${htmlItems || '<li>Sin items</li>'}</ul>
        <p><strong>Subtotal:</strong> ${escapeHtml(formatOrderCurrency(summary.totals?.subtotal))}</p>
        <p><strong>Envío:</strong> ${escapeHtml(formatOrderCurrency(summary.totals?.shipping))}</p>
        <p><strong>Instalación:</strong> ${escapeHtml(formatOrderCurrency(summary.totals?.installation))}</p>
        <p><strong>Total abonado:</strong> ${escapeHtml(formatOrderCurrency(summary.totals?.total))}</p>
        <p><strong>Plazo estimado:</strong> ${escapeHtml(summary.estimatedLeadTime || 'No informado')}</p>
        <h3>Seguimiento</h3>
        <p>Te lo enviaremos cuando despachemos tu pedido.</p>
    `;

    return {
        subject: `Compra confirmada - ${orderRef}`,
        text,
        html
    };
}

async function sendOrderEmailsIfReady(order, reason = 'unknown') {
    if (!order) return null;

    const shouldSend = Boolean(order.paid && order.customerData && !order.emails_sent);
    if (!shouldSend) {
        return order;
    }

    if (!isEmailNotificationConfigured()) {
        console.warn(`⚠️ SMTP no configurado. No se enviaron emails para ${order.orderId} (${reason}).`);
        return order;
    }

    const customerEmail = sanitizeEmail(order.customerData?.email || order.buyerEmail);
    if (!customerEmail) {
        console.warn(`⚠️ Pedido ${order.orderId} sin email válido de cliente. Se omitió notificación al cliente.`);
    }

    const adminEmail = buildAdminEmailPayload(order);
    await emailTransporter.sendMail({
        from: FROM_EMAIL,
        to: ADMIN_EMAIL,
        subject: adminEmail.subject,
        text: adminEmail.text,
        html: adminEmail.html
    });

    if (customerEmail) {
        const customerPayload = buildCustomerEmailPayload(order);
        await emailTransporter.sendMail({
            from: FROM_EMAIL,
            to: customerEmail,
            subject: customerPayload.subject,
            text: customerPayload.text,
            html: customerPayload.html
        });
    }

    const sentAt = new Date().toISOString();
    const updated = updateOrder(order.orderId, current => ({
        ...current,
        updatedAt: sentAt,
        emails_sent: true,
        emails_sent_at: sentAt,
        checkoutStatus: current.paid && current.customerData
            ? 'completed'
            : current.checkoutStatus
    }));

    if (updated) {
        console.log(`📧 Emails enviados para ${updated.orderId} (${reason}).`);
        return updated;
    }

    return order;
}

function buildOrderLifecycleEmail(order, eventKey, note = '') {
    const summary = buildOrderSummaryText(order);
    const orderRef = summary.orderRef;
    const eventMessages = {
        order_received: 'Recibimos tu pedido y lo estamos validando.',
        transfer_pending: 'Tu pedido quedó pendiente de confirmación de transferencia.',
        cash_pickup_pending: 'Tu pedido quedó registrado para pago en retiro.',
        payment_confirmed: 'Confirmamos el pago de tu pedido.',
        preparing: 'Tu pedido está en preparación.',
        shipped: 'Tu pedido fue despachado.',
        ready_for_pickup: 'Tu pedido está listo para retirar en taller.',
        ready_for_delivery: 'Tu pedido está listo para coordinar entrega.'
    };

    const eventMessage = eventMessages[eventKey] || 'Actualizamos el estado de tu pedido.';
    const trackingLine = normalizeText(order.tracking_url, 600);
    const noteLine = sanitizeSingleLine(note, 240);
    const subject = `Actualización de pedido ${orderRef} - ${summary.fulfillmentStatus}`;

    const text = [
        `Pedido ${orderRef}`,
        '',
        eventMessage,
        noteLine ? `Detalle: ${noteLine}` : '',
        `Estado actual: ${summary.fulfillmentStatus}`,
        `Medio de pago: ${summary.paymentMethod}`,
        `Plazo estimado: ${summary.estimatedLeadTime}`,
        '',
        'Resumen',
        summary.itemsLines,
        `Total: ${formatOrderCurrency(summary.totals?.total)}`,
        trackingLine ? `Tracking: ${trackingLine}` : ''
    ].filter(Boolean).join('\n');

    const html = `
        <h2>Pedido ${escapeHtml(orderRef)}</h2>
        <p>${escapeHtml(eventMessage)}</p>
        ${noteLine ? `<p><strong>Detalle:</strong> ${escapeHtml(noteLine)}</p>` : ''}
        <p><strong>Estado actual:</strong> ${escapeHtml(summary.fulfillmentStatus)}</p>
        <p><strong>Medio de pago:</strong> ${escapeHtml(summary.paymentMethod)}</p>
        <p><strong>Plazo estimado:</strong> ${escapeHtml(summary.estimatedLeadTime)}</p>
        <p><strong>Total:</strong> ${escapeHtml(formatOrderCurrency(summary.totals?.total))}</p>
        ${trackingLine ? `<p><strong>Tracking:</strong> ${escapeHtml(trackingLine)}</p>` : ''}
    `;

    return { subject, text, html };
}

async function sendOrderLifecycleEmail(order, eventKey, note = '') {
    if (!order || !canSendCustomerEmails()) {
        return;
    }

    const customerEmail = sanitizeEmail(order.customerData?.email || order.buyerEmail);
    if (!customerEmail) {
        return;
    }

    const payload = buildOrderLifecycleEmail(order, eventKey, note);
    await emailTransporter.sendMail({
        from: FROM_EMAIL,
        to: customerEmail,
        subject: payload.subject,
        text: payload.text,
        html: payload.html
    });
}

function buildQuoteLifecycleEmail(quote, status) {
    const normalizedStatus = normalizeQuoteStatus(status, quote.status || 'received');
    const label = QUOTE_STATUS_LABELS[normalizedStatus] || normalizedStatus;
    const quoteId = normalizeText(quote.quoteId, 80);
    const fullName = sanitizeSingleLine(quote?.customer?.fullName || quote?.fullName, 120) || 'cliente';
    const furnitureType = sanitizeSingleLine(quote?.project?.furnitureType || quote?.furnitureType, 80) || 'proyecto a medida';
    const leadTime = sanitizeSingleLine(quote?.project?.leadTimeEstimate || quote?.leadTimeEstimate || 'Se define en la propuesta final', 160);

    const subject = `Cotizacion ${quoteId} - ${label}`;
    const text = [
        `Hola ${fullName},`,
        '',
        `Estado de tu solicitud: ${label}.`,
        `Proyecto: ${furnitureType}.`,
        `Plazo estimado: ${leadTime}.`,
        '',
        'Si tenés dudas, respondé este email o escribinos por WhatsApp.'
    ].join('\n');

    const html = `
        <p>Hola ${escapeHtml(fullName)},</p>
        <p><strong>Estado de tu solicitud:</strong> ${escapeHtml(label)}.</p>
        <p><strong>Proyecto:</strong> ${escapeHtml(furnitureType)}.</p>
        <p><strong>Plazo estimado:</strong> ${escapeHtml(leadTime)}.</p>
        <p>Si tenés dudas, respondé este email o escribinos por WhatsApp.</p>
    `;

    return { subject, text, html };
}

async function sendQuoteLifecycleEmail(quote, status) {
    if (!quote || !canSendCustomerEmails()) {
        return;
    }

    const customerEmail = sanitizeEmail(quote?.customer?.email || quote?.email);
    if (!customerEmail) {
        return;
    }

    const payload = buildQuoteLifecycleEmail(quote, status);
    await emailTransporter.sendMail({
        from: FROM_EMAIL,
        to: customerEmail,
        subject: payload.subject,
        text: payload.text,
        html: payload.html
    });
}

async function fetchMercadoPagoEndpoint(endpointPath, query = null) {
    if (!hasMercadoPagoAccessToken) {
        throw createApiError('Mercado Pago no está configurado en este entorno.', 503);
    }

    const endpoint = new URL(`${MP_API_BASE_URL}${endpointPath}`);
    if (query) {
        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                endpoint.searchParams.set(key, String(value));
            }
        });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MP_API_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(endpoint.toString(), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
                Accept: 'application/json'
            },
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }

    let payload = {};
    try {
        payload = await response.json();
    } catch {
        payload = {};
    }

    if (!response.ok) {
        const error = new Error(payload?.message || 'Mercado Pago devolvió un error');
        if (response.status === 404) {
            error.status = 404;
        } else if (response.status >= 500) {
            error.status = 502;
        } else {
            error.status = 400;
        }
        error.code = 'MP_API_ERROR';
        throw error;
    }

    return payload;
}

async function fetchMercadoPagoPayment(paymentId) {
    const normalizedId = extractDigits(paymentId, 80);
    if (!normalizedId) {
        const error = new Error('payment_id inválido');
        error.status = 400;
        throw error;
    }

    return fetchMercadoPagoEndpoint(`/v1/payments/${normalizedId}`);
}

async function fetchMercadoPagoMerchantOrder(merchantOrderId) {
    const normalizedId = extractDigits(merchantOrderId, 120);
    if (!normalizedId) {
        const error = new Error('merchant_order_id inválido');
        error.status = 400;
        throw error;
    }

    return fetchMercadoPagoEndpoint(`/merchant_orders/${normalizedId}`);
}

async function searchMercadoPagoPaymentByExternalReference(externalReference) {
    const normalizedExternalReference = normalizeOrderLookupRef(externalReference);
    if (!normalizedExternalReference) {
        return null;
    }

    const payload = await fetchMercadoPagoEndpoint('/v1/payments/search', {
        external_reference: normalizedExternalReference,
        sort: 'date_created',
        criteria: 'desc',
        limit: 1
    });

    const firstResult = Array.isArray(payload.results) ? payload.results[0] : null;
    return firstResult || null;
}

function extractPreferenceIdFromPayment(paymentData = {}) {
    return normalizeMpIdentifier(
        paymentData?.metadata?.preference_id
        || paymentData?.point_of_interaction?.transaction_data?.checkout_id
        || paymentData?.preference_id,
        120
    );
}

async function syncOrderWithMercadoPagoPayment(paymentData, source = 'unknown') {
    const paymentStatus = normalizeText(paymentData?.status, 40).toLowerCase() || 'pending';
    const paymentId = extractDigits(paymentData?.id, 80);
    const merchantOrderId = extractDigits(paymentData?.order?.id, 120);
    const preferenceId = extractPreferenceIdFromPayment(paymentData);
    const externalReference = normalizeOrderLookupRef(
        paymentData?.external_reference
        || paymentData?.metadata?.external_reference
        || paymentData?.metadata?.order_ref
    );
    const metadataOrderId = normalizeOrderLookupRef(paymentData?.metadata?.order_id);
    const payerEmail = sanitizeEmail(paymentData?.payer?.email);

    const matchedOrder = findOrderByAnyReference({
        orderRef: metadataOrderId,
        externalReference,
        preferenceId,
        paymentId,
        merchantOrderId
    });

    if (!matchedOrder) {
        console.warn(`⚠️ No se encontró pedido local para payment_id=${paymentId || 'N/A'} external_reference=${externalReference || 'N/A'}`);
        return null;
    }

    if (
        externalReference
        && matchedOrder.externalReference
        && normalizeOrderLookupRef(matchedOrder.externalReference) !== externalReference
    ) {
        const error = new Error('El payment_id no corresponde al pedido indicado');
        error.status = 400;
        throw error;
    }

    const approved = paymentStatus === 'approved';
    const updated = updateOrder(matchedOrder.orderId, current => {
        const nowIso = new Date().toISOString();
        const wasPaid = Boolean(current.paid);
        const normalizedCurrentStatus = normalizeOrderStatus(
            current.fulfillmentStatus
            || (wasPaid ? 'payment_confirmed' : 'pending_payment')
        );
        const nextFulfillmentStatus = approved
            ? 'payment_confirmed'
            : normalizedCurrentStatus;

        let timeline = Array.isArray(current.timeline)
            ? [...current.timeline]
            : [];
        if (!timeline.length) {
            timeline = appendTimelineEntry(
                timeline,
                normalizedCurrentStatus,
                'Pedido creado'
            );
        }

        if (approved && !wasPaid) {
            timeline = appendTimelineEntry(
                timeline,
                'payment_confirmed',
                'Pago confirmado por webhook de Mercado Pago'
            );
        }

        return {
            ...current,
            updatedAt: nowIso,
            orderType: normalizeText(current.orderType, 20).toLowerCase() === ORDER_TYPE_CUSTOM
                ? ORDER_TYPE_CUSTOM
                : ORDER_TYPE_STORE,
            paymentMethod: normalizePaymentMethod(current.paymentMethod || PAYMENT_METHODS.MERCADOPAGO),
            externalReference: normalizeOrderLookupRef(current.externalReference) || externalReference || current.orderId,
            preferenceId: preferenceId || current.preferenceId,
            paymentStatus,
            paid: Boolean(current.paid || approved),
            fulfillmentStatus: nextFulfillmentStatus,
            buyerEmail: sanitizeEmail(current.buyerEmail || payerEmail),
            checkoutStatus: approved
                ? (current.customerData ? 'paid_and_completed_data' : 'paid_waiting_customer_data')
                : (current.checkoutStatus || 'pending_payment'),
            timeline,
            mp: {
                ...(current.mp || {}),
                paymentId: paymentId || current?.mp?.paymentId || '',
                merchantOrderId: merchantOrderId || current?.mp?.merchantOrderId || '',
                preferenceId: preferenceId || current?.mp?.preferenceId || current.preferenceId || '',
                status: paymentStatus,
                statusDetail: normalizeText(paymentData?.status_detail || current?.mp?.statusDetail, 120),
                externalReference: normalizeOrderLookupRef(current.externalReference) || externalReference || '',
                lastSyncedAt: nowIso,
                source
            },
            paymentMeta: {
                paymentId: paymentId || current?.paymentMeta?.paymentId || '',
                preferenceId: preferenceId || current?.paymentMeta?.preferenceId || current.preferenceId || '',
                merchantOrderId: merchantOrderId || current?.paymentMeta?.merchantOrderId || '',
                paymentStatus: paymentStatus
            }
        };
    });

    if (!updated) {
        return null;
    }

    if (approved) {
        let paidOrder = updated;
        if (!updated.stockReserved) {
            const reservationResult = reserveStockForOrder(updated);
            if (reservationResult.ok && reservationResult.updated) {
                const reserved = updateOrder(updated.orderId, current => ({
                    ...current,
                    updatedAt: new Date().toISOString(),
                    stockReserved: true
                }));
                if (reserved) {
                    paidOrder = reserved;
                }
            }
        }

        await sendOrderLifecycleEmail(paidOrder, 'payment_confirmed', 'Pago confirmado por Mercado Pago.');
        return sendOrderEmailsIfReady(paidOrder, source);
    }

    return updated;
}

function extractWebhookTopic(req) {
    return normalizeText(
        req.query?.type
        || req.query?.topic
        || req.body?.type
        || req.body?.topic
        || req.body?.action,
        80
    ).toLowerCase();
}

function extractWebhookEntityId(req) {
    return normalizeMpIdentifier(
        req.body?.data?.id
        || req.query?.['data.id']
        || req.query?.id
        || req.body?.id,
        120
    );
}

function extractWebhookResource(req) {
    return normalizeText(req.query?.resource || req.body?.resource, 400);
}

function extractPaymentIdFromResource(resource) {
    const matched = String(resource || '').match(/\/payments\/(\d+)/i);
    return matched ? matched[1] : '';
}

function parseMercadoPagoSignature(signatureHeader) {
    const segments = String(signatureHeader || '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);

    const signatureData = {};
    segments.forEach(segment => {
        const [key, value] = segment.split('=');
        if (!key || !value) return;
        signatureData[key.trim()] = value.trim();
    });

    return {
        ts: signatureData.ts || '',
        v1: signatureData.v1 || ''
    };
}

function isMercadoPagoWebhookSignatureValid(req) {
    if (!MP_WEBHOOK_SECRET) {
        return true;
    }

    const signatureHeader = req.get('x-signature');
    const requestId = normalizeText(req.get('x-request-id'), 200);
    const entityId = extractWebhookEntityId(req);
    const { ts, v1 } = parseMercadoPagoSignature(signatureHeader);

    if (!signatureHeader || !requestId || !entityId || !ts || !v1) {
        return false;
    }

    const manifest = `id:${entityId};request-id:${requestId};ts:${ts};`;
    const expectedSignature = crypto
        .createHmac('sha256', MP_WEBHOOK_SECRET)
        .update(manifest)
        .digest('hex')
        .toLowerCase();
    const providedSignature = String(v1 || '').toLowerCase();

    if (expectedSignature.length !== providedSignature.length) {
        return false;
    }

    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature));
}

async function resolvePaymentsFromWebhook(req) {
    const topic = extractWebhookTopic(req);
    const entityId = extractWebhookEntityId(req);
    const resource = extractWebhookResource(req);
    const resourcePaymentId = extractPaymentIdFromResource(resource);

    if (topic.includes('payment') || resourcePaymentId) {
        const paymentId = extractDigits(entityId || resourcePaymentId, 80);
        if (!paymentId) return [];

        const payment = await fetchMercadoPagoPayment(paymentId);
        return [payment];
    }

    if (topic.includes('merchant_order')) {
        const merchantOrderId = extractDigits(entityId, 120);
        if (!merchantOrderId) return [];

        const merchantOrder = await fetchMercadoPagoMerchantOrder(merchantOrderId);
        const paymentIds = (merchantOrder.payments || [])
            .map(payment => extractDigits(payment?.id, 80))
            .filter(Boolean);

        if (paymentIds.length === 0) {
            return [];
        }

        const payments = [];
        for (const paymentId of paymentIds) {
            // MP notifica merchant_order para múltiples pagos, procesamos cada uno.
            const payment = await fetchMercadoPagoPayment(paymentId);
            payments.push(payment);
        }

        return payments;
    }

    return [];
}

app.get('/api/store/catalog', (req, res) => {
    return res.json({
        ok: true,
        products: getPublicStoreCatalog()
    });
});

app.get('/api/store/config', (req, res) => {
    const acceptedPaymentMethods = Array.from(AVAILABLE_PAYMENT_METHODS);
    return res.json({
        ok: true,
        tienda: {
            stockMessage: commerceConfig?.tienda?.stockMessage || 'En stock - Envio en 48/72 hs',
            madeToOrderMessage: commerceConfig?.tienda?.madeToOrderMessage || 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
            warrantyMonths: Number.parseInt(commerceConfig?.tienda?.warrantyMonths, 10) || 12,
            coverage: sanitizeSingleLine(commerceConfig?.tienda?.coverage, 180) || 'AMBA + interior del pais + retiro en taller',
            acceptedPaymentMethods
        }
    });
});

app.get('/api/delivery/options', (req, res) => {
    const config = loadDeliveryConfig();
    return res.json({
        currency: String(config.currency || 'ARS'),
        installationBaseCost: Number.parseInt(config.installationBaseCost, 10) || 200000,
        installationComplexNotice: String(config.installationComplexNotice || 'Instalaciones complejas se cotizan aparte.'),
        unsupportedPostalCodeMessage: String(
            config.unsupportedPostalCodeMessage
            || 'No podemos calcular el envío automáticamente para tu CP. Contactanos para cotización.'
        ),
        factoryPickup: config.factoryPickup,
        installationZonesLabel: String(config.installationZones?.label || 'Buenos Aires (zonas seleccionadas)')
    });
});

app.get('/api/delivery/quote', (req, res) => {
    const config = loadDeliveryConfig();
    const postalCode = normalizePostalCode(req.query?.postalCode);

    if (!POSTAL_CODE_PATTERN.test(postalCode)) {
        return res.status(400).json({ ok: false, error: 'Ingresá un código postal válido de 4 dígitos' });
    }

    const shippingRule = findShippingRule(postalCode, config);
    if (!shippingRule) {
        return res.status(422).json({
            ok: false,
            error: String(
                config.unsupportedPostalCodeMessage
                || 'No podemos calcular el envío automáticamente para tu CP. Contactanos para cotización.'
            ),
            code: 'UNSUPPORTED_POSTAL_CODE'
        });
    }

    const installationBaseCost = Number.parseInt(config.installationBaseCost, 10) || 200000;
    const shippingCost = Number.parseInt(shippingRule.cost, 10);
    if (!Number.isInteger(shippingCost) || shippingCost < 0) {
        return res.status(500).json({ ok: false, error: 'La configuración de envío para ese código postal es inválida' });
    }

    return res.json({
        ok: true,
        postalCode,
        shippingLabel: String(shippingRule.label || 'Envío a domicilio').slice(0, 80),
        shippingCost,
        installationAvailable: isInstallationAvailable(postalCode, config),
        installationBaseCost,
        installationComplexNotice: String(config.installationComplexNotice || 'Instalaciones complejas se cotizan aparte.')
    });
});

app.post('/api/delivery/quote', requireAllowedOrigin, (req, res, next) => {
    try {
        const payload = parsePayloadWithSchema(
            deliveryQuotePayloadSchema,
            req.body,
            'Datos de envío inválidos'
        );
        const deliveryConfig = loadDeliveryConfig();
        const validatedItems = buildValidatedItems(payload.items || [], { allowEmpty: true });
        const delivery = calculateDelivery(
            {
                method: DELIVERY_METHODS.SHIPPING,
                postalCode: payload.postalCode,
                installationRequested: false
            },
            deliveryConfig,
            validatedItems
        );

        return res.json({
            ok: true,
            postalCode: delivery.postalCode,
            shippingLabel: delivery.shippingLabel,
            shippingCost: delivery.shippingCost,
            installationAvailable: delivery.installationAvailable,
            installationBaseCost: delivery.installationBaseCost,
            installationComplexNotice: String(
                deliveryConfig.installationComplexNotice || 'Instalaciones complejas se cotizan aparte.'
            ),
            shippingMeta: delivery.shippingMeta || {}
        });
    } catch (error) {
        return next(error);
    }
});

app.post('/api/mp/create-preference', async (req, res, next) => {
    try {
        const checkoutPayload = parsePayloadWithSchema(
            checkoutPayloadSchema,
            req.body,
            'Datos de checkout inválidos'
        );
        const paymentMethod = normalizePaymentMethod(checkoutPayload.paymentMethod);
        if (!AVAILABLE_PAYMENT_METHODS.has(paymentMethod)) {
            throw createApiError('Medio de pago no habilitado para Tienda', 400);
        }

        const validatedItems = buildValidatedItems(checkoutPayload.items);
        ensureStoreStockAvailability(validatedItems);
        const subtotal = calculateItemsSubtotal(validatedItems);
        const deliveryConfig = loadDeliveryConfig();
        const delivery = calculateDelivery(checkoutPayload.delivery, deliveryConfig, validatedItems);
        const parsedCustomerData = parseCheckoutCustomerData(checkoutPayload);
        if (!parsedCustomerData.ok) {
            const reason = Array.isArray(parsedCustomerData.missingFields) && parsedCustomerData.missingFields.length > 0
                ? `faltan: ${parsedCustomerData.missingFields.join(', ')}`
                : (parsedCustomerData.reason || 'datos inválidos');
            console.warn(`[checkout] Datos incompletos para generar el pago (${reason}).`);
            throw createApiError('Datos incompletos para generar el pago.', 400);
        }

        const customerData = parsedCustomerData.customerData;
        const buyerEmail = parsedCustomerData.buyerEmail;

        if (
            delivery.method === DELIVERY_METHODS.SHIPPING
            && delivery.postalCode
            && customerData.postalCode !== delivery.postalCode
        ) {
            throw createApiError('El código postal del envío no coincide con los datos del comprador.', 400);
        }

        const totalAmount = subtotal + delivery.shippingCost + delivery.installationCost;
        const orderId = generateOrderId();
        const externalReference = generateExternalReference();
        const estimatedLeadTime = inferOrderLeadTime(validatedItems);

        if ((paymentMethod === PAYMENT_METHODS.BANK_TRANSFER || paymentMethod === PAYMENT_METHODS.CASH_PICKUP) && !buyerEmail) {
            throw createApiError('Para este medio de pago necesitamos un email válido para enviarte el resumen del pedido.', 400);
        }

        if (paymentMethod === PAYMENT_METHODS.CASH_PICKUP && delivery.method !== DELIVERY_METHODS.PICKUP) {
            throw createApiError('El pago en efectivo solo está disponible con retiro en taller.', 400);
        }

        const metadataItems = validatedItems.map(item => ({
            id: item.id,
            title: String(item.title || '').slice(0, 80),
            description: String(item.description || '').slice(0, 256),
            quantity: item.quantity,
            unit_price: item.unit_price
        }));
        const metadataTotals = {
            subtotal,
            shipping: delivery.shippingCost,
            installation: delivery.installationCost,
            total: totalAmount
        };
        const successUrl = `${NORMALIZED_FRONTEND_URL}/success?order_id=${encodeURIComponent(orderId)}&order_ref=${encodeURIComponent(externalReference)}`;
        const failureUrl = `${NORMALIZED_FRONTEND_URL}/failure?order_ref=${encodeURIComponent(externalReference)}`;
        const pendingUrl = `${NORMALIZED_FRONTEND_URL}/pending?order_ref=${encodeURIComponent(externalReference)}`;
        const nowIso = new Date().toISOString();
        const initialStatus = paymentMethod === PAYMENT_METHODS.BANK_TRANSFER
            ? 'pending_transfer_confirmation'
            : paymentMethod === PAYMENT_METHODS.CASH_PICKUP
                ? 'pending_cash_pickup_payment'
                : 'pending_payment';

        const baseOrderRecord = {
            orderId,
            externalReference,
            orderType: ORDER_TYPE_STORE,
            createdAt: nowIso,
            updatedAt: nowIso,
            paymentMethod,
            paymentStatus: paymentMethod === PAYMENT_METHODS.MERCADOPAGO ? 'pending' : 'pending_manual',
            paid: false,
            checkoutStatus: initialStatus,
            fulfillmentStatus: initialStatus,
            estimatedLeadTime,
            stockReserved: false,
            timeline: [
                makeTimelineEntry(initialStatus, 'Pedido creado desde Tienda')
            ],
            items: validatedItems.map(item => ({
                id: item.id,
                title: item.title,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                fulfillmentModel: item.fulfillmentModel,
                category: item.category,
                weightKg: item.weightKg,
                volumeM3: item.volumeM3
            })),
            delivery,
            totals: {
                subtotal,
                shipping: delivery.shippingCost,
                installation: delivery.installationCost,
                total: totalAmount
            },
            buyerEmail,
            customerData,
            tracking_url: '',
            emails_sent: false,
            emails_sent_at: null,
            mp: {
                preferenceId: '',
                paymentId: '',
                merchantOrderId: '',
                status: paymentMethod === PAYMENT_METHODS.MERCADOPAGO ? 'pending' : 'not_applicable',
                statusDetail: '',
                externalReference
            },
            paymentMeta: {
                paymentId: '',
                preferenceId: '',
                merchantOrderId: '',
                paymentStatus: paymentMethod === PAYMENT_METHODS.MERCADOPAGO ? 'pending' : 'pending_manual'
            }
        };

        if (paymentMethod !== PAYMENT_METHODS.MERCADOPAGO) {
            const createdOrder = createOrder(baseOrderRecord);
            const eventKey = paymentMethod === PAYMENT_METHODS.BANK_TRANSFER
                ? 'transfer_pending'
                : 'cash_pickup_pending';
            await sendOrderLifecycleEmail(createdOrder, eventKey, 'Pedido registrado con datos de envío confirmados.');

            return res.json({
                ok: true,
                order_id: orderId,
                order_ref: externalReference,
                external_reference: externalReference,
                payment_mode: paymentMethod,
                payment_method: paymentMethod,
                payment_method_label: getPaymentMethodLabel(paymentMethod),
                next_step_url: successUrl,
                instruction: paymentMethod === PAYMENT_METHODS.BANK_TRANSFER
                    ? 'Pedido registrado. Te enviaremos los datos bancarios para acreditar la transferencia.'
                    : 'Pedido registrado para pago en retiro. Te contactaremos para coordinar día y horario.',
                totals: metadataTotals
            });
        }

        if (!preference) {
            throw createApiError('Mercado Pago no está configurado en este entorno.', 503);
        }

        const preferenceItems = [...validatedItems];

        if (delivery.shippingCost > 0) {
            preferenceItems.push({
                id: `shipping-${delivery.postalCode}`,
                title: `Envío a domicilio (${delivery.postalCode})`,
                quantity: 1,
                unit_price: delivery.shippingCost,
                currency_id: 'ARS'
            });
        }

        if (delivery.installationCost > 0) {
            preferenceItems.push({
                id: 'installation-base',
                title: 'Instalación (base)',
                quantity: 1,
                unit_price: delivery.installationCost,
                currency_id: 'ARS'
            });
        }

        const preferenceData = {
            items: preferenceItems,
            external_reference: externalReference,
            metadata: {
                order_id: orderId,
                external_reference: externalReference,
                payment_method: paymentMethod,
                delivery_method: delivery.method,
                postal_code: delivery.postalCode || '',
                installation_requested: String(delivery.installationRequested),
                buyer_email: buyerEmail,
                customer_name: customerData.fullName,
                customer_phone: customerData.phone,
                customer_city: customerData.city,
                customer_province: customerData.province,
                items: metadataItems,
                totals: metadataTotals
            },
            back_urls: {
                success: successUrl,
                failure: failureUrl,
                pending: pendingUrl
            }
        };

        const notificationUrl = normalizeText(MP_NOTIFICATION_URL, 300);
        if (notificationUrl) {
            preferenceData.notification_url = notificationUrl;
        }

        if (buyerEmail) {
            preferenceData.payer = { email: buyerEmail };
        }

        if (shouldEnableMercadoPagoAutoReturn(NORMALIZED_FRONTEND_URL)) {
            preferenceData.auto_return = 'approved';
        }

        let response = null;
        let isOfflineFallback = false;

        try {
            response = await createMercadoPagoPreferenceWithRetry(preference, preferenceData);
        } catch (error) {
            if (!isMercadoPagoNetworkError(error) || !MP_OFFLINE_FALLBACK) {
                throw error;
            }

            isOfflineFallback = true;
            response = {
                id: `offline-${orderId}`,
                init_point: `${pendingUrl}&payment_mode=offline&status=pending`
            };

            console.warn('⚠️ Mercado Pago inaccesible. Se habilitó fallback offline para entorno actual.');
        }

        createOrder({
            ...baseOrderRecord,
            preferenceId: response.id,
            paymentMethod: PAYMENT_METHODS.MERCADOPAGO,
            paymentStatus: isOfflineFallback ? 'unavailable' : 'pending',
            paid: false,
            checkoutStatus: isOfflineFallback ? 'offline_fallback' : 'pending_payment',
            fulfillmentStatus: isOfflineFallback ? 'pending_transfer_confirmation' : 'pending_payment',
            timeline: [
                makeTimelineEntry(
                    isOfflineFallback ? 'pending_transfer_confirmation' : 'pending_payment',
                    isOfflineFallback
                        ? 'Pedido registrado con fallback temporal'
                        : 'Pedido registrado en Mercado Pago'
                )
            ],
            mp: {
                preferenceId: response.id,
                paymentId: '',
                merchantOrderId: '',
                status: isOfflineFallback ? 'unavailable' : 'pending',
                statusDetail: '',
                externalReference
            },
            paymentMeta: {
                paymentId: '',
                preferenceId: response.id,
                merchantOrderId: '',
                paymentStatus: isOfflineFallback ? 'unavailable' : 'pending'
            }
        });

        if (!isOfflineFallback) {
            console.log(`✅ Preferencia creada: ${response.id} (orderRef=${externalReference})`);
        }

        return res.json({
            ok: true,
            id: response.id,
            init_point: response.init_point,
            order_id: orderId,
            order_ref: externalReference,
            external_reference: externalReference,
            payment_method: PAYMENT_METHODS.MERCADOPAGO,
            payment_mode: isOfflineFallback ? 'offline' : 'mercadopago',
            warning: isOfflineFallback
                ? 'No fue posible conectar con Mercado Pago. Se habilitó un flujo offline temporal.'
                : undefined,
            totals: metadataTotals
        });
    } catch (error) {
        if (!error.status) {
            console.error('❌ Error al crear preferencia:', error);
        }
        return next(error);
    }
});

async function submitContactViaFormspree({
    name,
    email,
    phone,
    type,
    message,
    productReference,
    metadata
}) {
    const payload = {
        page: 'contacto',
        name,
        email,
        phone,
        type,
        message,
        product_reference: productReference || '',
        metadata_ip: metadata.ip || '',
        metadata_user_agent: metadata.userAgent || '',
        metadata_origin: metadata.origin || '',
        metadata_timestamp: metadata.timestamp,
        metadata_request_id: metadata.requestId || ''
    };

    const endpoint = String(FORMSPREE_CONTACT_ENDPOINT || '').trim();
    if (!endpoint) {
        throw createApiError('forms_provider_not_configured', 503);
    }

    await submitFormspreeJson({
        endpoint,
        payload
    });

    return FORMS_DRY_RUN ? 'dry_run' : 'formspree';
}

async function submitQuoteViaFormspree({
    fullName,
    email,
    phone,
    cityNeighborhood,
    province,
    furnitureType,
    approximateMeasures,
    estimatedBudget,
    targetDate,
    additionalComments,
    photoMetadata,
    metadata
}) {
    if (!FORMSPREE_MEDIDA_ENDPOINT) {
        throw createApiError('forms_provider_not_configured', 503);
    }

    const attachmentsSummary = photoMetadata
        .map(file => `${file.originalName} (${file.mimeType}, ${file.sizeKb} KB)`)
        .join(' | ');
    const payload = {
        page: 'a-medida',
        form_type: 'quote_a_medida',
        full_name: fullName,
        email,
        phone,
        city_neighborhood: cityNeighborhood,
        province,
        furniture_type: furnitureType,
        approximate_measures: approximateMeasures,
        estimated_budget: estimatedBudget || 'No informado',
        target_date: targetDate || 'No informada',
        additional_comments: additionalComments || 'Sin comentarios',
        files_count: photoMetadata.length,
        attachments_summary: attachmentsSummary || 'Sin archivos adjuntos',
        privacy_accepted: 'Sí',
        metadata_ip: metadata.ip || '',
        metadata_user_agent: metadata.userAgent || '',
        metadata_origin: metadata.origin || '',
        metadata_timestamp: metadata.timestamp,
        metadata_request_id: metadata.requestId || ''
    };

    await submitFormspreeJson({
        endpoint: FORMSPREE_MEDIDA_ENDPOINT,
        payload
    });

    return FORMS_DRY_RUN ? 'dry_run' : 'formspree';
}

async function handleContactSubmission(req, res, next) {
    try {
        const normalizedPayload = normalizeContactFormPayload(req.body);
        const contactPayload = parseFormPayload(contactPayloadSchema, normalizedPayload);
        const name = contactPayload.name;
        const email = contactPayload.email;
        const phone = String(contactPayload.phone || '').trim();
        const type = String(contactPayload.type || '').trim();
        const message = contactPayload.message;
        const productReference = String(contactPayload.productReference || '').trim();
        const honeypotValue = getFormHoneypotValue(normalizedPayload);
        const requestMetadata = buildFormRequestMetadata(req);

        // Honeypot: bots suelen completar campos invisibles. Respondemos OK sin procesar.
        if (honeypotValue) {
            return res.status(200).json({ ok: true, code: 'spam_detected', requestId: req.requestId });
        }

        let provider = 'formspree';
        if (emailTransporter && ADMIN_EMAIL && FROM_EMAIL) {
            const subject = `Nuevo contacto web - ${type || 'Consulta general'}`;
            const lines = [
                `Nombre: ${name}`,
                `Email: ${email}`,
                `Teléfono: ${phone || 'No informado'}`,
                `Tipo de mueble: ${type || 'No informado'}`,
                `Referencia de producto: ${productReference || 'No informada'}`,
                '',
                'Mensaje:',
                message,
                '',
                `IP: ${requestMetadata.ip || 'No disponible'}`,
                `Origen: ${requestMetadata.origin || 'No disponible'}`,
                `Request ID: ${requestMetadata.requestId || 'No disponible'}`
            ];

            try {
                await emailTransporter.sendMail({
                    from: FROM_EMAIL,
                    to: ADMIN_EMAIL,
                    replyTo: email,
                    subject,
                    text: lines.join('\n')
                });
                provider = 'smtp';
            } catch (smtpError) {
                console.error(`[${req.requestId}] ❌ Error SMTP contacto: ${smtpError.message}`);
                provider = await submitContactViaFormspree({
                    name,
                    email,
                    phone,
                    type,
                    message,
                    productReference,
                    metadata: requestMetadata
                });
            }
        } else {
            provider = await submitContactViaFormspree({
                name,
                email,
                phone,
                type,
                message,
                productReference,
                metadata: requestMetadata
            });
        }

        console.log(`[${req.requestId}] 📨 Contacto enviado (${provider}) desde ${email}`);
        return res.json({ ok: true, provider, requestId: req.requestId });
    } catch (error) {
        if (!error.status) {
            console.error(`[${req.requestId}] ❌ Error al enviar contacto:`, error);
        }
        return next(error);
    }
}

async function handleQuoteSubmission(req, res, next) {
    try {
        const normalizedPayload = normalizeQuoteFormPayload(req.body);
        const quotePayload = parseFormPayload(quotePayloadSchema, normalizedPayload);

        // Honeypot: bots suelen completar campos invisibles. Respondemos OK sin procesar.
        const honeypotValue = getFormHoneypotValue(normalizedPayload);
        if (honeypotValue) {
            return res.status(200).json({ ok: true, code: 'spam_detected', requestId: req.requestId });
        }

        const fullName = sanitizeSingleLine(quotePayload.fullName, 120);
        const email = sanitizeSingleLine(quotePayload.email, 120).toLowerCase();
        const phone = sanitizeSingleLine(quotePayload.phone, 40);
        const cityNeighborhood = sanitizeSingleLine(quotePayload.cityNeighborhood, 120);
        const province = sanitizeSingleLine(quotePayload.province, 80);
        const furnitureType = sanitizeSingleLine(quotePayload.furnitureType, 80);
        const approximateMeasures = sanitizeMultiLine(quotePayload.approximateMeasures, 600);
        const estimatedBudget = sanitizeSingleLine(quotePayload.estimatedBudget, 40);
        const targetDate = sanitizeSingleLine(quotePayload.targetDate, 20);
        const additionalComments = sanitizeMultiLine(quotePayload.additionalComments, 2000);
        const requestMetadata = buildFormRequestMetadata(req);

        const photoFiles = Array.isArray(req.files)
            ? req.files
            : [];

        const photoMetadata = photoFiles.map(file => ({
            originalName: sanitizeSingleLine(file.originalname, 120) || 'archivo',
            mimeType: sanitizeSingleLine(file.mimetype, 80),
            sizeKb: Math.max(1, Math.round((Number(file.size) || 0) / 1024))
        }));

        let provider = 'formspree';
        if (emailTransporter && ADMIN_EMAIL && FROM_EMAIL) {
            const subject = `Nueva cotización A Medida - ${furnitureType}`;
            const lines = [
                `Nombre: ${fullName}`,
                `Email: ${email}`,
                `Teléfono: ${phone}`,
                `Ciudad/Barrio: ${cityNeighborhood}`,
                `Provincia: ${province}`,
                `Tipo de mueble: ${furnitureType}`,
                `Medidas aproximadas: ${approximateMeasures}`,
                `Presupuesto estimado: ${estimatedBudget || 'No informado'}`,
                `Fecha objetivo: ${targetDate || 'No informada'}`,
                '',
                'Comentarios adicionales:',
                additionalComments || 'Sin comentarios',
                '',
                `Archivos adjuntos: ${photoMetadata.length}`,
                `IP: ${requestMetadata.ip || 'No disponible'}`,
                `Origen: ${requestMetadata.origin || 'No disponible'}`,
                `Request ID: ${requestMetadata.requestId || 'No disponible'}`
            ];

            if (photoMetadata.length > 0) {
                lines.push(
                    photoMetadata.map(file => `- ${file.originalName} (${file.mimeType}, ${file.sizeKb} KB)`).join('\n')
                );
            }

            try {
                await emailTransporter.sendMail({
                    from: FROM_EMAIL,
                    to: ADMIN_EMAIL,
                    replyTo: email,
                    subject,
                    text: lines.join('\n'),
                    attachments: photoFiles.map(file => ({
                        filename: sanitizeSingleLine(file.originalname, 120) || 'archivo',
                        content: file.buffer,
                        contentType: file.mimetype
                    }))
                });
                provider = 'smtp';
            } catch (smtpError) {
                console.error(`[${req.requestId}] ❌ Error SMTP cotización: ${smtpError.message}`);
                provider = await submitQuoteViaFormspree({
                    fullName,
                    email,
                    phone,
                    cityNeighborhood,
                    province,
                    furnitureType,
                    approximateMeasures,
                    estimatedBudget,
                    targetDate,
                    additionalComments,
                    photoMetadata,
                    photoFiles,
                    metadata: requestMetadata
                });
            }
        } else {
            provider = await submitQuoteViaFormspree({
                fullName,
                email,
                phone,
                cityNeighborhood,
                province,
                furnitureType,
                approximateMeasures,
                estimatedBudget,
                targetDate,
                additionalComments,
                photoMetadata,
                photoFiles,
                metadata: requestMetadata
            });
        }

        const quoteId = generateQuoteId();
        const leadTimeEstimate = 'Se define en propuesta final y aprobación de diseño.';
        const createdAt = new Date().toISOString();
        const createdQuote = createQuote({
            quoteId,
            createdAt,
            updatedAt: createdAt,
            status: 'received',
            source: 'web',
            provider,
            linkedOrderId: null,
            customer: {
                fullName,
                email,
                phone,
                cityNeighborhood,
                province
            },
            project: {
                furnitureType,
                approximateMeasures,
                estimatedBudget: estimatedBudget || '',
                targetDate: targetDate || '',
                additionalComments: additionalComments || '',
                leadTimeEstimate
            },
            attachments: photoMetadata,
            timeline: [
                makeTimelineEntry('received', 'Solicitud enviada desde la web')
            ]
        });

        await sendQuoteLifecycleEmail(createdQuote, 'received');

        console.log(`[${req.requestId}] 🧾 Cotización A Medida ${quoteId} enviada (${provider}) por ${email}`);
        return res.json({
            ok: true,
            quoteId,
            requestId: req.requestId,
            message: 'Recibimos tu solicitud. En menos de 24 horas hábiles te vamos a contactar por WhatsApp o email para validar medidas y enviarte la propuesta.'
        });
    } catch (error) {
        if (!error.status) {
            console.error(`[${req.requestId}] ❌ Error al enviar cotización:`, error);
        }
        return next(error);
    }
}

app.post('/api/contact', handleContactSubmission);
app.post('/forms/contacto', handleContactSubmission);
app.post('/api/quotes', quoteUpload.array('photos', QUOTE_MAX_FILES), handleQuoteSubmission);
app.post('/forms/medida', quoteUpload.array('photos', QUOTE_MAX_FILES), handleQuoteSubmission);
app.post('/forms/envios', quoteUpload.array('photos', QUOTE_MAX_FILES), handleQuoteSubmission);

app.post('/api/mp/webhook', async (req, res, next) => {
    const topic = extractWebhookTopic(req) || 'unknown';
    const entityId = extractWebhookEntityId(req) || 'N/A';

    try {
        if (!isMercadoPagoWebhookSignatureValid(req)) {
            console.warn(`⚠️ Firma webhook inválida (topic=${topic}, id=${entityId})`);
            return res.status(401).json({ error: 'Firma webhook inválida' });
        }

        console.log(`📨 Webhook MP recibido topic=${topic} id=${entityId}`);
        const payments = await resolvePaymentsFromWebhook(req);
        if (payments.length === 0) {
            console.warn(`⚠️ Webhook MP sin payment processable (topic=${topic}, id=${entityId})`);
            return res.status(200).json({ received: true, processed: 0 });
        }

        let processed = 0;
        for (const paymentData of payments) {
            const syncedOrder = await syncOrderWithMercadoPagoPayment(paymentData, `webhook:${topic}`);
            if (syncedOrder) {
                processed += 1;
            }
        }

        return res.status(200).json({ received: true, processed });
    } catch (error) {
        console.error('❌ Error procesando webhook MP:', error.message);
        return next(error);
    }
});

app.get('/api/orders/:orderId', (req, res) => {
    const orderRef = normalizeOrderLookupRef(req.params.orderId);
    if (!isValidOrderLookupRef(orderRef)) {
        return res.status(400).json({ ok: false, error: 'Identificador de pedido inválido' });
    }

    const order = findOrderByAnyReference({ orderRef });
    if (!order) {
        return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    }

    return res.json(buildPublicOrderPayload(order));
});

app.get('/api/orders/by-preference/:preferenceId', (req, res) => {
    const preferenceId = normalizeMpIdentifier(req.params.preferenceId, 120);
    if (!preferenceId) {
        return res.status(400).json({ ok: false, error: 'Preferencia inválida' });
    }

    const order = findOrderByPreferenceId(preferenceId);
    if (!order) {
        return res.status(404).json({ ok: false, error: 'Pedido no encontrado para esa preferencia' });
    }

    return res.json(buildPublicOrderPayload(order));
});

async function handleOrderDetailsSubmission(req, res, next) {
    try {
        const requestedOrderRef = normalizeOrderLookupRef(
            req.body?.orderRef
            || req.body?.externalReference
            || req.body?.external_reference
            || req.body?.orderId
            || req.params?.orderId
        );
        const paymentId = extractDigits(req.body?.paymentId || req.body?.payment_id, 80);
        const preferenceId = normalizeMpIdentifier(req.body?.preferenceId || req.body?.preference_id, 120);
        const merchantOrderId = extractDigits(req.body?.merchantOrderId || req.body?.merchant_order_id, 120);

        if (requestedOrderRef && !isValidOrderLookupRef(requestedOrderRef)) {
            const error = new Error('Identificador de pedido inválido');
            error.status = 400;
            throw error;
        }

        if (!requestedOrderRef && !paymentId && !preferenceId) {
            const error = new Error('Enviá orderRef, payment_id o preference_id para vincular el pedido');
            error.status = 400;
            throw error;
        }

        let order = findOrderByAnyReference({
            orderRef: requestedOrderRef,
            preferenceId,
            paymentId,
            merchantOrderId
        });

        if (paymentId) {
            const verifiedPayment = await fetchMercadoPagoPayment(paymentId);
            const paymentExternalReference = normalizeOrderLookupRef(
                verifiedPayment.external_reference
                || verifiedPayment?.metadata?.external_reference
            );

            if (
                order
                && paymentExternalReference
                && normalizeOrderLookupRef(order.externalReference || order.orderId) !== paymentExternalReference
            ) {
                const error = new Error('El payment_id no coincide con el pedido enviado');
                error.status = 400;
                throw error;
            }

            const syncedOrder = await syncOrderWithMercadoPagoPayment(verifiedPayment, 'order_details:payment_id');
            if (syncedOrder) {
                order = syncedOrder;
            }
        } else if (order && !order.paid) {
            try {
                const paymentByReference = await searchMercadoPagoPaymentByExternalReference(
                    order.externalReference || order.orderId
                );
                if (paymentByReference) {
                    const syncedOrder = await syncOrderWithMercadoPagoPayment(
                        paymentByReference,
                        'order_details:search_external_reference'
                    );
                    if (syncedOrder) {
                        order = syncedOrder;
                    }
                }
            } catch (error) {
                console.warn(`⚠️ No se pudo verificar pago por external_reference (${order.orderId}): ${error.message}`);
            }
        }

        if (!order) {
            const error = new Error('Pedido no encontrado');
            error.status = 404;
            throw error;
        }

        if (
            preferenceId
            && order.preferenceId
            && preferenceId !== order.preferenceId
            && preferenceId !== normalizeMpIdentifier(order?.mp?.preferenceId, 120)
        ) {
            const error = new Error('El pedido no coincide con la preferencia de pago');
            error.status = 400;
            throw error;
        }

        const fullName = normalizeText(req.body?.fullName, 120);
        const documentId = normalizeText(req.body?.documentId, 20);
        const phone = normalizeText(req.body?.phone, 40);
        const email = sanitizeEmail(req.body?.email);

        const street = normalizeText(req.body?.street, 120);
        const streetNumber = normalizeText(req.body?.streetNumber, 20);
        const city = normalizeText(req.body?.city, 80);
        const province = normalizeText(req.body?.province, 80);
        const postalCode = normalizePostalCode(req.body?.postalCode);

        const floorApartment = normalizeText(req.body?.floorApartment, 60);
        const neighborhood = normalizeText(req.body?.neighborhood, 80);
        const addressReference = normalizeText(req.body?.addressReference, 180);
        const receiverType = normalizeText(req.body?.receiverType, 40).toLowerCase();
        const receiverName = normalizeText(req.body?.receiverName, 120);
        const availableSchedule = normalizeText(req.body?.availableSchedule, 120);
        const additionalNotes = normalizeText(req.body?.additionalNotes, 600);

        if (!fullName || !phone || !email) {
            const error = new Error('Completá nombre, teléfono y email');
            error.status = 400;
            throw error;
        }

        if (!NAME_PATTERN.test(fullName)) {
            const error = new Error('Nombre y apellido inválido');
            error.status = 400;
            throw error;
        }

        if (documentId && !DOCUMENT_PATTERN.test(documentId)) {
            const error = new Error('DNI/CUIT inválido');
            error.status = 400;
            throw error;
        }

        if (!PHONE_PATTERN.test(phone)) {
            const error = new Error('Teléfono inválido');
            error.status = 400;
            throw error;
        }

        if (!EMAIL_PATTERN.test(email)) {
            const error = new Error('Email inválido');
            error.status = 400;
            throw error;
        }

        const allowedReceiverTypes = new Set(['', 'yo', 'otra_persona']);
        if (!allowedReceiverTypes.has(receiverType)) {
            const error = new Error('Tipo de receptor inválido');
            error.status = 400;
            throw error;
        }

        if (receiverType === 'otra_persona' && !receiverName) {
            const error = new Error('Ingresá el nombre de la persona que recibe');
            error.status = 400;
            throw error;
        }

        if (order.delivery?.method === DELIVERY_METHODS.SHIPPING) {
            if (!street || !streetNumber || !city || !province || !POSTAL_CODE_PATTERN.test(postalCode)) {
                const error = new Error('Para envío completá dirección, ciudad, provincia y código postal');
                error.status = 400;
                throw error;
            }

            if (order.delivery.postalCode && order.delivery.postalCode !== postalCode) {
                const error = new Error('El código postal no coincide con el usado en el checkout');
                error.status = 400;
                throw error;
            }
        }

        const savedOrder = updateOrder(order.orderId, current => {
            const currentPaymentStatus = normalizeText(
                current?.paymentStatus || current?.mp?.status || 'pending',
                40
            ).toLowerCase();
            const isPaid = Boolean(current.paid || currentPaymentStatus === 'approved');
            const paymentMethod = normalizePaymentMethod(current.paymentMethod);
            const fallbackFulfillmentStatus = paymentMethod === PAYMENT_METHODS.BANK_TRANSFER
                ? 'pending_transfer_confirmation'
                : paymentMethod === PAYMENT_METHODS.CASH_PICKUP
                    ? 'pending_cash_pickup_payment'
                    : 'pending_payment';
            const normalizedCurrentFulfillment = normalizeOrderStatus(
                current.fulfillmentStatus || fallbackFulfillmentStatus,
                fallbackFulfillmentStatus
            );
            const nextFulfillmentStatus = isPaid
                ? 'payment_confirmed'
                : normalizedCurrentFulfillment;
            let timeline = Array.isArray(current.timeline)
                ? [...current.timeline]
                : [];
            if (!timeline.length) {
                timeline = appendTimelineEntry(timeline, nextFulfillmentStatus, 'Pedido registrado');
            }
            if (nextFulfillmentStatus !== normalizedCurrentFulfillment) {
                timeline = appendTimelineEntry(timeline, nextFulfillmentStatus, 'Pago acreditado');
            }
            if (!current.customerData) {
                timeline = appendTimelineEntry(
                    timeline,
                    nextFulfillmentStatus,
                    'Datos de entrega/retiro confirmados por cliente'
                );
            }

            return {
                ...current,
                updatedAt: new Date().toISOString(),
                orderType: normalizeText(current.orderType, 20).toLowerCase() === ORDER_TYPE_CUSTOM
                    ? ORDER_TYPE_CUSTOM
                    : ORDER_TYPE_STORE,
                paymentMethod,
                fulfillmentStatus: nextFulfillmentStatus,
                timeline,
                externalReference: normalizeOrderLookupRef(current.externalReference) || current.orderId,
                paymentStatus: currentPaymentStatus,
                paid: isPaid,
                checkoutStatus: isPaid
                    ? 'delivery_data_received_paid'
                    : 'delivery_data_received_pending_payment',
                buyerEmail: sanitizeEmail(current.buyerEmail || email),
                customerData: {
                    fullName,
                    documentId,
                    phone,
                    email,
                    street,
                    streetNumber,
                    city,
                    province,
                    postalCode,
                    floorApartment,
                    neighborhood,
                    addressReference,
                    receiverType,
                    receiverName: receiverType === 'otra_persona' ? receiverName : '',
                    availableSchedule,
                    additionalNotes
                },
                mp: {
                    ...(current.mp || {}),
                    paymentId: paymentId || current?.mp?.paymentId || current?.paymentMeta?.paymentId || '',
                    preferenceId: preferenceId || current?.mp?.preferenceId || current.preferenceId || '',
                    merchantOrderId: merchantOrderId || current?.mp?.merchantOrderId || current?.paymentMeta?.merchantOrderId || '',
                    status: currentPaymentStatus,
                    externalReference: normalizeOrderLookupRef(current.externalReference) || current.orderId
                },
                paymentMeta: {
                    paymentId: paymentId || current?.paymentMeta?.paymentId || '',
                    preferenceId: preferenceId || current?.paymentMeta?.preferenceId || current.preferenceId || '',
                    merchantOrderId: merchantOrderId || current?.paymentMeta?.merchantOrderId || '',
                    paymentStatus: currentPaymentStatus
                },
                tracking_url: normalizeText(current.tracking_url, 600) || ''
            };
        });

        if (!savedOrder) {
            const error = new Error('No se pudo actualizar el pedido');
            error.status = 500;
            throw error;
        }

        let finalOrder = savedOrder;
        if (savedOrder.paid && !savedOrder.stockReserved) {
            const reservationResult = reserveStockForOrder(savedOrder);
            if (!reservationResult.ok) {
                const error = new Error(reservationResult.error || 'No se pudo reservar el stock del pedido');
                error.status = 409;
                throw error;
            }

            if (reservationResult.updated) {
                const reservedOrder = updateOrder(savedOrder.orderId, current => ({
                    ...current,
                    updatedAt: new Date().toISOString(),
                    stockReserved: true
                }));
                if (reservedOrder) {
                    finalOrder = reservedOrder;
                }
            }
        }

        if (finalOrder.paid && !order.paid) {
            await sendOrderLifecycleEmail(finalOrder, 'payment_confirmed', 'Datos completados y pago confirmado.');
        }

        const notifiedOrder = await sendOrderEmailsIfReady(finalOrder, 'order_details_submission');
        return res.json({
            ok: true,
            message: notifiedOrder?.paid
                ? 'Datos recibidos. Compra confirmada correctamente.'
                : 'Datos recibidos. Estamos esperando la acreditación del pago para confirmar la compra.',
            order: buildPublicOrderPayload(notifiedOrder || finalOrder)
        });
    } catch (error) {
        return next(error);
    }
}

app.post('/api/order/details', requireAllowedOrigin, handleOrderDetailsSubmission);

app.post('/api/orders/:orderId/delivery-details', requireAllowedOrigin, (req, res, next) => {
    req.body = {
        ...(req.body || {}),
        orderRef: req.body?.orderRef || req.params.orderId,
        orderId: req.body?.orderId || req.params.orderId
    };
    return handleOrderDetailsSubmission(req, res, next);
});

function parseArsAmount(value, fallback = 0) {
    const normalized = String(value || '')
        .trim()
        .replace(/[^\d,.-]/g, '')
        .replace(/\.(?=\d{3}(\D|$))/g, '')
        .replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }

    return Math.round(parsed);
}

function csvEscape(value) {
    const text = String(value ?? '');
    if (!/[",\n]/.test(text)) {
        return text;
    }

    return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(columns, rows) {
    const headerLine = columns.map(column => csvEscape(column.label)).join(',');
    const rowLines = rows.map(row => columns.map(column => csvEscape(row[column.key])).join(','));
    return [headerLine, ...rowLines].join('\n');
}

function sortByRecent(left, right) {
    const leftDate = Date.parse(left.updatedAt || left.createdAt || 0);
    const rightDate = Date.parse(right.updatedAt || right.createdAt || 0);
    return rightDate - leftDate;
}

function mapOrderForAdmin(order) {
    const publicOrder = buildPublicOrderPayload(order);
    const customer = order.customerData || {};
    return {
        ...publicOrder,
        customerName: sanitizeSingleLine(customer.fullName, 120) || '',
        customerEmail: sanitizeEmail(customer.email || order.buyerEmail),
        customerPhone: sanitizeSingleLine(customer.phone, 40) || ''
    };
}

function mapQuoteForAdmin(quote) {
    return buildPublicQuotePayload(quote);
}

app.get('/api/admin/overview', requireAllowedOrigin, requireAdminAuth, (req, res) => {
    const limit = Math.min(300, Math.max(1, Number.parseInt(req.query?.limit, 10) || 120));
    const orders = readOrdersStore().orders
        .slice()
        .sort(sortByRecent)
        .slice(0, limit)
        .map(mapOrderForAdmin);
    const quotes = readQuotesStore().quotes
        .slice()
        .sort(sortByRecent)
        .slice(0, limit)
        .map(mapQuoteForAdmin);

    const pendingStoreOrders = orders.filter(order => (
        order.orderType === ORDER_TYPE_STORE
        && ['pending_payment', 'pending_transfer_confirmation', 'pending_cash_pickup_payment', 'payment_confirmed', 'preparing'].includes(order.fulfillmentStatus)
    )).length;
    const pendingQuotes = quotes.filter(quote => (
        ['received', 'quoted', 'deposit_pending', 'deposit_paid', 'in_production', 'ready_for_delivery'].includes(quote.status)
    )).length;

    return res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        stats: {
            orders: orders.length,
            quotes: quotes.length,
            pendingStoreOrders,
            pendingQuotes
        },
        orders,
        quotes,
        fulfillmentStatuses: ORDER_STATUS_LABELS,
        quoteStatuses: QUOTE_STATUS_LABELS
    });
});

app.patch('/api/admin/orders/:orderId/status', requireAllowedOrigin, requireAdminAuth, async (req, res, next) => {
    try {
        const orderRef = normalizeOrderLookupRef(req.params.orderId);
        if (!orderRef) {
            throw createApiError('Identificador de pedido inválido', 400);
        }

        const order = findOrderByAnyReference({ orderRef });
        if (!order) {
            throw createApiError('Pedido no encontrado', 404);
        }

        const nextStatus = normalizeOrderStatus(req.body?.status, order.fulfillmentStatus || 'pending_payment');
        const note = sanitizeSingleLine(req.body?.note, 240);
        const trackingUrl = normalizeText(req.body?.trackingUrl || req.body?.tracking_url, 600);
        const requestedPaymentStatus = normalizeText(req.body?.paymentStatus, 40).toLowerCase();
        const previousStatus = normalizeOrderStatus(order.fulfillmentStatus || 'pending_payment');
        const wasPaid = Boolean(order.paid);
        const shouldMarkPaid = nextStatus === 'payment_confirmed';
        const shouldCancel = nextStatus === 'cancelled';

        let updatedOrder = updateOrder(order.orderId, current => {
            const paymentStatus = requestedPaymentStatus
                || (shouldMarkPaid ? 'approved' : normalizeText(current.paymentStatus || 'pending', 40).toLowerCase());
            const paid = shouldMarkPaid ? true : Boolean(current.paid);
            let timeline = Array.isArray(current.timeline) ? [...current.timeline] : [];
            timeline = appendTimelineEntry(
                timeline,
                nextStatus,
                note || `Estado actualizado desde panel interno: ${ORDER_STATUS_LABELS[nextStatus] || nextStatus}`
            );

            return {
                ...current,
                updatedAt: new Date().toISOString(),
                paid,
                paymentStatus,
                fulfillmentStatus: nextStatus,
                checkoutStatus: `admin_${nextStatus}`,
                tracking_url: trackingUrl || normalizeText(current.tracking_url, 600) || '',
                timeline
            };
        });

        if (!updatedOrder) {
            throw createApiError('No se pudo actualizar el pedido', 500);
        }

        if (shouldMarkPaid && !updatedOrder.stockReserved) {
            const reserveResult = reserveStockForOrder(updatedOrder);
            if (!reserveResult.ok) {
                throw createApiError(reserveResult.error || 'No se pudo reservar stock', 409);
            }

            if (reserveResult.updated) {
                const reservedOrder = updateOrder(updatedOrder.orderId, current => ({
                    ...current,
                    updatedAt: new Date().toISOString(),
                    stockReserved: true
                }));
                if (reservedOrder) {
                    updatedOrder = reservedOrder;
                }
            }
        }

        if (shouldCancel && updatedOrder.stockReserved) {
            const releaseResult = releaseStockForOrder(updatedOrder);
            if (releaseResult.ok && releaseResult.updated) {
                const releasedOrder = updateOrder(updatedOrder.orderId, current => ({
                    ...current,
                    updatedAt: new Date().toISOString(),
                    stockReserved: false
                }));
                if (releasedOrder) {
                    updatedOrder = releasedOrder;
                }
            }
        }

        if (previousStatus !== nextStatus) {
            await sendOrderLifecycleEmail(
                updatedOrder,
                mapOrderStatusToEventKey(nextStatus),
                note
            );
        }

        if (!wasPaid && updatedOrder.paid) {
            const emailedOrder = await sendOrderEmailsIfReady(updatedOrder, 'admin_status_update');
            if (emailedOrder) {
                updatedOrder = emailedOrder;
            }
        }

        return res.json({
            ok: true,
            order: buildPublicOrderPayload(updatedOrder)
        });
    } catch (error) {
        return next(error);
    }
});

app.patch('/api/admin/quotes/:quoteId/status', requireAllowedOrigin, requireAdminAuth, async (req, res, next) => {
    try {
        const quoteId = normalizeText(req.params.quoteId, 80).toUpperCase();
        const quote = findQuote(quoteId);
        if (!quote) {
            throw createApiError('Cotización no encontrada', 404);
        }

        const previousStatus = normalizeQuoteStatus(quote.status || 'received');
        const nextStatus = normalizeQuoteStatus(req.body?.status, previousStatus);
        const note = sanitizeSingleLine(req.body?.note, 240);

        const updatedQuote = updateQuote(quoteId, current => ({
            ...current,
            updatedAt: new Date().toISOString(),
            status: nextStatus,
            timeline: appendTimelineEntry(
                Array.isArray(current.timeline) ? current.timeline : [],
                nextStatus,
                note || `Estado actualizado desde panel interno: ${QUOTE_STATUS_LABELS[nextStatus] || nextStatus}`
            )
        }));

        if (!updatedQuote) {
            throw createApiError('No se pudo actualizar la cotización', 500);
        }

        if (previousStatus !== nextStatus) {
            await sendQuoteLifecycleEmail(updatedQuote, nextStatus);
        }

        return res.json({
            ok: true,
            quote: buildPublicQuotePayload(updatedQuote)
        });
    } catch (error) {
        return next(error);
    }
});

app.post('/api/admin/quotes/:quoteId/accept', requireAllowedOrigin, requireAdminAuth, async (req, res, next) => {
    try {
        const quoteId = normalizeText(req.params.quoteId, 80).toUpperCase();
        const quote = findQuote(quoteId);
        if (!quote) {
            throw createApiError('Cotización no encontrada', 404);
        }

        if (quote.linkedOrderId) {
            const existingOrder = findOrder(quote.linkedOrderId);
            if (existingOrder) {
                return res.json({
                    ok: true,
                    message: 'La cotización ya tiene una orden interna asociada.',
                    quote: buildPublicQuotePayload(quote),
                    order: buildPublicOrderPayload(existingOrder)
                });
            }
        }

        const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod || PAYMENT_METHODS.BANK_TRANSFER);
        if (![PAYMENT_METHODS.BANK_TRANSFER, PAYMENT_METHODS.MERCADOPAGO].includes(paymentMethod)) {
            throw createApiError('Para seña de A Medida solo se admite Mercado Pago o transferencia.', 400);
        }

        const depositPercentRaw = Number.parseInt(req.body?.depositPercent, 10);
        const depositPercent = Number.isInteger(depositPercentRaw)
            ? Math.max(10, Math.min(90, depositPercentRaw))
            : 50;
        const quotedAmount = parseArsAmount(
            req.body?.projectAmount
            || quote?.project?.quotedAmount
            || quote?.project?.estimatedBudget,
            0
        );
        const depositAmount = quotedAmount > 0
            ? Math.max(1, Math.round(quotedAmount * (depositPercent / 100)))
            : 0;
        const orderId = generateOrderId();
        const externalReference = generateExternalReference();
        const createdAt = new Date().toISOString();
        const quoteProject = quote.project || {};
        const quoteCustomer = quote.customer || {};

        let preferenceResponse = null;
        if (paymentMethod === PAYMENT_METHODS.MERCADOPAGO && depositAmount > 0) {
            if (!preference) {
                throw createApiError('Mercado Pago no está configurado en este entorno.', 503);
            }

            const preferenceData = {
                items: [
                    {
                        id: `deposit-${quoteId}`,
                        title: `Seña proyecto a medida (${quoteId})`,
                        description: `Proyecto ${sanitizeSingleLine(quoteProject.furnitureType, 80) || 'A Medida'}`,
                        quantity: 1,
                        unit_price: depositAmount,
                        currency_id: 'ARS'
                    }
                ],
                external_reference: externalReference,
                metadata: {
                    order_id: orderId,
                    quote_id: quoteId,
                    payment_method: paymentMethod,
                    deposit_percent: depositPercent
                },
                back_urls: {
                    success: `${NORMALIZED_FRONTEND_URL}/pending?order_ref=${encodeURIComponent(externalReference)}&quote_id=${encodeURIComponent(quoteId)}`,
                    failure: `${NORMALIZED_FRONTEND_URL}/failure?order_ref=${encodeURIComponent(externalReference)}&quote_id=${encodeURIComponent(quoteId)}`,
                    pending: `${NORMALIZED_FRONTEND_URL}/pending?order_ref=${encodeURIComponent(externalReference)}&quote_id=${encodeURIComponent(quoteId)}`
                }
            };

            const notificationUrl = normalizeText(MP_NOTIFICATION_URL, 300);
            if (notificationUrl) {
                preferenceData.notification_url = notificationUrl;
            }

            if (shouldEnableMercadoPagoAutoReturn(NORMALIZED_FRONTEND_URL)) {
                preferenceData.auto_return = 'approved';
            }

            const customerEmail = sanitizeEmail(quoteCustomer.email);
            if (customerEmail) {
                preferenceData.payer = { email: customerEmail };
            }

            preferenceResponse = await createMercadoPagoPreferenceWithRetry(preference, preferenceData);
        }

        const createdOrder = createOrder({
            orderId,
            externalReference,
            orderType: ORDER_TYPE_CUSTOM,
            createdAt,
            updatedAt: createdAt,
            preferenceId: preferenceResponse?.id || '',
            paymentMethod,
            paymentStatus: paymentMethod === PAYMENT_METHODS.MERCADOPAGO ? 'pending' : 'pending_manual',
            paid: false,
            checkoutStatus: 'deposit_pending',
            fulfillmentStatus: 'pending_payment',
            estimatedLeadTime: sanitizeSingleLine(
                quoteProject.leadTimeEstimate || 'Se define en propuesta final.',
                200
            ),
            stockReserved: false,
            timeline: [
                makeTimelineEntry('pending_payment', 'Orden interna de A Medida creada (pendiente de seña)')
            ],
            items: [
                {
                    id: quoteId,
                    title: `Proyecto A Medida - ${sanitizeSingleLine(quoteProject.furnitureType, 80) || 'Mueble personalizado'}`,
                    description: sanitizeSingleLine(quoteProject.approximateMeasures, 220) || 'Proyecto a medida',
                    quantity: 1,
                    unit_price: quotedAmount || depositAmount,
                    fulfillmentModel: 'made_to_order',
                    category: 'A Medida',
                    weightKg: 0,
                    volumeM3: 0
                }
            ],
            delivery: {
                method: 'custom_quote',
                postalCode: null,
                shippingLabel: 'Se define en presupuesto final',
                shippingCost: 0,
                installationAvailable: false,
                installationRequested: false,
                installationBaseCost: 0,
                installationCost: 0
            },
            totals: {
                subtotal: quotedAmount,
                shipping: 0,
                installation: 0,
                total: quotedAmount,
                depositPercent,
                depositRequired: depositAmount
            },
            buyerEmail: sanitizeEmail(quoteCustomer.email),
            customerData: {
                fullName: sanitizeSingleLine(quoteCustomer.fullName, 120),
                email: sanitizeEmail(quoteCustomer.email),
                phone: sanitizeSingleLine(quoteCustomer.phone, 40),
                city: sanitizeSingleLine(quoteCustomer.cityNeighborhood, 120)
            },
            tracking_url: '',
            emails_sent: false,
            emails_sent_at: null,
            customProject: {
                quoteId,
                furnitureType: sanitizeSingleLine(quoteProject.furnitureType, 80),
                approximateMeasures: sanitizeMultiLine(quoteProject.approximateMeasures, 600),
                targetDate: sanitizeSingleLine(quoteProject.targetDate, 20)
            },
            mp: {
                preferenceId: preferenceResponse?.id || '',
                paymentId: '',
                merchantOrderId: '',
                status: paymentMethod === PAYMENT_METHODS.MERCADOPAGO ? 'pending' : 'not_applicable',
                statusDetail: '',
                externalReference
            },
            paymentMeta: {
                paymentId: '',
                preferenceId: preferenceResponse?.id || '',
                merchantOrderId: '',
                paymentStatus: paymentMethod === PAYMENT_METHODS.MERCADOPAGO ? 'pending' : 'pending_manual'
            }
        });

        const updatedQuote = updateQuote(quoteId, current => ({
            ...current,
            updatedAt: new Date().toISOString(),
            status: 'deposit_pending',
            linkedOrderId: createdOrder.orderId,
            timeline: appendTimelineEntry(
                Array.isArray(current.timeline) ? current.timeline : [],
                'deposit_pending',
                `Orden interna creada (${createdOrder.orderId})`
            )
        })) || quote;

        await sendQuoteLifecycleEmail(updatedQuote, 'deposit_pending');

        return res.json({
            ok: true,
            quote: buildPublicQuotePayload(updatedQuote),
            order: buildPublicOrderPayload(createdOrder),
            payment: {
                method: paymentMethod,
                methodLabel: getPaymentMethodLabel(paymentMethod),
                depositPercent,
                depositAmount,
                init_point: preferenceResponse?.init_point || null
            }
        });
    } catch (error) {
        return next(error);
    }
});

app.get('/api/admin/export', requireAllowedOrigin, requireAdminAuth, (req, res, next) => {
    try {
        const type = normalizeText(req.query?.type || 'all', 20).toLowerCase();
        const format = normalizeText(req.query?.format || 'csv', 20).toLowerCase();
        const orders = readOrdersStore().orders.slice().sort(sortByRecent).map(mapOrderForAdmin);
        const quotes = readQuotesStore().quotes.slice().sort(sortByRecent).map(mapQuoteForAdmin);

        if (format === 'json') {
            return res.json({
                ok: true,
                generatedAt: new Date().toISOString(),
                orders: type === 'quotes' ? [] : orders,
                quotes: type === 'orders' ? [] : quotes
            });
        }

        let csvRows = [];
        if (type === 'orders') {
            csvRows = orders.map(order => ({
                record_type: 'order',
                id: order.orderId,
                reference: order.orderRef,
                created_at: order.createdAt,
                status: order.fulfillmentStatus,
                payment_status: order.paymentStatus,
                payment_method: order.paymentMethod,
                customer_name: order.customerName,
                customer_email: order.customerEmail,
                total_ars: order?.totals?.total || 0
            }));
        } else if (type === 'quotes') {
            csvRows = quotes.map(quote => ({
                record_type: 'quote',
                id: quote.quoteId,
                reference: quote.quoteId,
                created_at: quote.createdAt,
                status: quote.status,
                payment_status: '',
                payment_method: '',
                customer_name: quote?.customer?.fullName || '',
                customer_email: quote?.customer?.email || '',
                total_ars: quote?.project?.estimatedBudget || ''
            }));
        } else {
            const orderRows = orders.map(order => ({
                record_type: 'order',
                id: order.orderId,
                reference: order.orderRef,
                created_at: order.createdAt,
                status: order.fulfillmentStatus,
                payment_status: order.paymentStatus,
                payment_method: order.paymentMethod,
                customer_name: order.customerName,
                customer_email: order.customerEmail,
                total_ars: order?.totals?.total || 0
            }));
            const quoteRows = quotes.map(quote => ({
                record_type: 'quote',
                id: quote.quoteId,
                reference: quote.quoteId,
                created_at: quote.createdAt,
                status: quote.status,
                payment_status: '',
                payment_method: '',
                customer_name: quote?.customer?.fullName || '',
                customer_email: quote?.customer?.email || '',
                total_ars: quote?.project?.estimatedBudget || ''
            }));
            csvRows = [...orderRows, ...quoteRows];
        }

        const csv = buildCsv([
            { key: 'record_type', label: 'record_type' },
            { key: 'id', label: 'id' },
            { key: 'reference', label: 'reference' },
            { key: 'created_at', label: 'created_at' },
            { key: 'status', label: 'status' },
            { key: 'payment_status', label: 'payment_status' },
            { key: 'payment_method', label: 'payment_method' },
            { key: 'customer_name', label: 'customer_name' },
            { key: 'customer_email', label: 'customer_email' },
            { key: 'total_ars', label: 'total_ars' }
        ], csvRows);

        const filename = type === 'all'
            ? 'zarpadomueble-export-all.csv'
            : `zarpadomueble-export-${type}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csv);
    } catch (error) {
        return next(error);
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({
        ok: true,
        timestamp: new Date().toISOString()
    });
});

app.use('/api', (req, res) => {
    res.status(404).json({ ok: false, error: 'Endpoint no encontrado' });
});

app.use((req, res, next) => {
    if (req.method !== 'GET') {
        return next();
    }

    if (hasFrontendStaticBundle && fs.existsSync(FRONTEND_NOT_FOUND_PATH)) {
        return res.status(404).sendFile(FRONTEND_NOT_FOUND_PATH);
    }

    return res.status(404).json({ ok: false, error: 'Recurso no encontrado' });
});

app.use((error, req, res, _next) => {
    const requestId = String(req.requestId || res.locals.requestId || generateRequestId());
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                ok: false,
                error: `Cada archivo puede pesar hasta ${QUOTE_FILE_MAX_MB} MB.`,
                requestId
            });
        }

        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                ok: false,
                error: `Podés adjuntar hasta ${QUOTE_MAX_FILES} archivos.`,
                requestId
            });
        }

        return res.status(400).json({
            ok: false,
            error: 'Error al procesar los archivos adjuntos.',
            requestId
        });
    }

    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        return res.status(400).json({ ok: false, error: 'JSON inválido en el request body', requestId });
    }

    if (error.name === 'AbortError') {
        return res.status(504).json({ ok: false, error: 'Timeout al comunicarse con Mercado Pago', requestId });
    }

    if (error.message === 'Origen no permitido por CORS') {
        return res.status(403).json({ ok: false, error: 'Origen no permitido', requestId });
    }

    if (error.message === 'origin_not_allowed') {
        return res.status(error.status || 403).json({
            ok: false,
            error: 'Origen o referer no permitido',
            code: 'origin_not_allowed',
            requestId
        });
    }

    if (error.message === 'invalid_payload') {
        return res.status(error.status || 400).json({
            ok: false,
            error: 'Datos inválidos en el formulario',
            code: 'invalid_payload',
            requestId
        });
    }

    if (isMercadoPagoNetworkError(error)) {
        return res.status(503).json({
            ok: false,
            error: 'No pudimos conectar con Mercado Pago en este momento. Verificá conectividad de red/firewall y reintentá.',
            code: 'MP_UNREACHABLE',
            requestId
        });
    }

    if (error.message === 'form_forward_failed') {
        return res.status(error.status || 502).json({
            ok: false,
            error: 'No pudimos enviar el formulario en este momento. Intentá nuevamente en unos minutos.',
            code: 'form_forward_failed',
            requestId
        });
    }

    if (error.message === 'forms_provider_not_configured') {
        return res.status(error.status || 503).json({
            ok: false,
            error: 'El servicio de formularios no está configurado. Contactanos por WhatsApp mientras lo resolvemos.',
            code: 'forms_provider_not_configured',
            requestId
        });
    }

    const status = error.status || 500;
    const payload = {
        ok: false,
        error: status === 500
            ? 'Error interno del servidor. Intenta nuevamente.'
            : error.message,
        requestId
    };

    if (status === 500 && process.env.NODE_ENV === 'development') {
        payload.details = error.message;
    }

    if (status >= 500 || !isProduction) {
        console.error(`[${requestId}] ❌ ${req.method} ${req.originalUrl} -> ${status}: ${error.message}`);
    }

    return res.status(status).json(payload);
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en http://0.0.0.0:${PORT}`);
    console.log(`🌐 API URL esperada: ${API_URL}`);
    console.log(`🧩 Frontend estático: ${hasFrontendStaticBundle ? FRONTEND_ROOT_PATH : 'deshabilitado (modo API-only)'}`);
    console.log(`💳 Mercado Pago: ${hasMercadoPagoAccessToken ? 'configurado' : 'deshabilitado (falta MP_ACCESS_TOKEN)'}`);
    console.log(`🛡️ CORS permitido para: ${Array.from(allowedOrigins).join(', ')} (+ netlify previews por regex)`);
    console.log(`🔔 Webhook MP: ${MP_NOTIFICATION_URL || '(no configurado)'}`);
    console.log(`📧 SMTP emails: ${isEmailNotificationConfigured() ? 'activo' : 'no configurado'}`);
});

server.requestTimeout = Number.parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 15000;
server.headersTimeout = Number.parseInt(process.env.HEADERS_TIMEOUT_MS, 10) || 20000;
server.keepAliveTimeout = Number.parseInt(process.env.KEEP_ALIVE_TIMEOUT_MS, 10) || 5000;

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});
