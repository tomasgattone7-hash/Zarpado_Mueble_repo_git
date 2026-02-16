import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import fetch from 'node-fetch';
import crypto from 'node:crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://zarpadomueble.com';
const API_URL = process.env.API_URL || 'https://api.zarpadomueble.com';
const isProduction = process.env.NODE_ENV === 'production';

const MAX_CART_ITEMS = Number.parseInt(process.env.MAX_CART_ITEMS, 10) || 20;
const MAX_ITEM_QUANTITY = Number.parseInt(process.env.MAX_ITEM_QUANTITY, 10) || 10;
const CSRF_SESSION_COOKIE_NAME = 'zm_sid';
const MAX_CSRF_SESSIONS = Number.parseInt(process.env.CSRF_SESSION_MAX, 10) || 5000;
const FRM_CONTACT_ID = String(process.env.FRM_CONTACT_ID || process.env.FORMSPREE_CONTACT_ID || '').trim();
const FRM_MEDIDA_ID = String(process.env.FRM_MEDIDA_ID || process.env.FORMSPREE_ENVIO_ID || '').trim();
const LEGACY_CONTACT_FORM_ENDPOINT = String(process.env.CONTACT_FORM_ENDPOINT || '').trim();
const RECAPTCHA_V2_SITE_KEY = '6LdjBW4sAAAAAPaYMKU5daLqShZB3Vf4SUJDsq4Y';
const RECAPTCHA_SECRET = String(process.env.RECAPTCHA_SECRET || '').trim();
const RECAPTCHA_SITE_KEY = String(process.env.RECAPTCHA_SITE_KEY || RECAPTCHA_V2_SITE_KEY).trim();
const RECAPTCHA_VERSION = String(process.env.RECAPTCHA_VERSION || 'v2').trim().toLowerCase() === 'v3'
    ? 'v3'
    : 'v2';
const RECAPTCHA_MIN_SCORE = Number.parseFloat(process.env.RECAPTCHA_MIN_SCORE || '0.5') || 0.5;
const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const RECAPTCHA_VERIFY_TIMEOUT_MS = Number.parseInt(process.env.RECAPTCHA_VERIFY_TIMEOUT_MS, 10) || 8000;
const RECAPTCHA_ACTIONS = Object.freeze({
    CONTACTO: 'contacto_submit',
    MEDIDA: 'medida_submit'
});
const QUOTE_MAX_FILES = Number.parseInt(process.env.QUOTE_MAX_FILES, 10) || 6;
const QUOTE_FILE_MAX_MB = Number.parseInt(process.env.QUOTE_FILE_MAX_MB, 10) || 5;
const QUOTE_FILE_SIZE_BYTES = QUOTE_FILE_MAX_MB * 1024 * 1024;
const QUOTE_ALLOWED_FILE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
]);
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const NAME_PATTERN = /^[a-zA-ZÀ-ÿ0-9 .,'-]{2,120}$/u;
const PHONE_PATTERN = /^[0-9+()\-\s]{6,40}$/;
const CITY_NEIGHBORHOOD_PATTERN = /^[a-zA-ZÀ-ÿ0-9 .,'-]{2,120}$/u;
const BUDGET_PATTERN = /^[0-9$.,\s-]{1,40}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CONTACT_TYPE_OPTIONS = new Set(['', 'Escritorio', 'Rack TV', 'Cocina', 'Placard', 'Otro']);
const QUOTE_FURNITURE_TYPE_OPTIONS = new Set([
    'Escritorio',
    'Rack TV',
    'Cocina',
    'Placard',
    'Vestidor',
    'Biblioteca',
    'Otro'
]);
const csrfSessions = new Map();

const PRODUCT_CATALOG = Object.freeze({
    1: { name: 'Escritorio Gamer Pro', price: 185000 },
    2: { name: 'Rack TV Minimalista', price: 210000 },
    3: { name: 'Mesa Ratona Industrial', price: 95000 },
    4: { name: 'Biblioteca Moderna', price: 145000 },
    5: { name: 'Vajillero Nórdico', price: 230000 },
    6: { name: 'Escritorio Home Office', price: 120000 },
    7: { name: 'Gabinete Multiuso', price: 180000 },
    8: { name: 'Silla de Diseño', price: 85000 },
    9: { name: 'Mesa Comedor', price: 250000 },
    10: { name: 'Mueble TV Flotante', price: 200000 },
    11: { name: 'Escritorio Melamina', price: 130000 }
});

function buildFormspreeEndpoint(formId, fallbackEndpoint = '') {
    const normalizedId = String(formId || '').trim();
    if (normalizedId) {
        return `https://formspree.io/f/${normalizedId}`;
    }

    return String(fallbackEndpoint || '').trim();
}

const FORMSPREE_CONTACT_ENDPOINT = buildFormspreeEndpoint(
    FRM_CONTACT_ID,
    LEGACY_CONTACT_FORM_ENDPOINT
);
const FORMSPREE_MEDIDA_ENDPOINT = buildFormspreeEndpoint(
    FRM_MEDIDA_ID,
    ''
);

const defaultAllowedOrigins = [
    'https://zarpadomueble.com',
    'https://www.zarpadomueble.com',
    'http://localhost:8888',
    'http://127.0.0.1:8888',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    FRONTEND_URL,
    API_URL,
    BASE_URL
];

const configuredAllowedOrigins = [
    ...new Set(
        (process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',')
            : defaultAllowedOrigins
        )
            .map(origin => origin.trim())
            .filter(Boolean)
    )
];

const allowedOrigins = new Set(configuredAllowedOrigins);

function isNetlifyOrigin(origin) {
    if (!origin) {
        return false;
    }

    try {
        const parsed = new URL(origin);
        return parsed.protocol === 'https:' && parsed.hostname.endsWith('.netlify.app');
    } catch {
        return false;
    }
}

function isAllowedOrigin(origin) {
    if (!origin) {
        return true;
    }

    return allowedOrigins.has(origin) || isNetlifyOrigin(origin);
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

function normalizeText(value, maxLength = 2000) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function sanitizeMultiLine(value, maxLength = 2000) {
    return String(value || '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim()
        .slice(0, maxLength);
}

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
    return {
        ip: getRequestIpAddress(request),
        userAgent: normalizeText(request.get('user-agent') || '', 400),
        origin: normalizeText(request.get('origin') || '', 200),
        timestamp: new Date().toISOString(),
        requestId: normalizeText(request.requestId || '', 120)
    };
}

async function verifyRecaptchaToken({ token, remoteIp, expectedAction }) {
    if (!RECAPTCHA_SECRET) {
        return {
            ok: false,
            error: 'recaptcha_not_configured'
        };
    }

    const normalizedToken = normalizeText(token, 4000);
    if (!normalizedToken) {
        return {
            ok: false,
            error: 'recaptcha_failed',
            reason: 'missing_token'
        };
    }

    const payload = new URLSearchParams();
    payload.set('secret', RECAPTCHA_SECRET);
    payload.set('response', normalizedToken);
    if (remoteIp) {
        payload.set('remoteip', remoteIp);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RECAPTCHA_VERIFY_TIMEOUT_MS);
    let verificationResponse;
    try {
        verificationResponse = await fetch(RECAPTCHA_VERIFY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: payload.toString(),
            signal: controller.signal
        });
    } catch {
        throw createApiError('recaptcha_verify_unavailable', 502);
    } finally {
        clearTimeout(timeoutId);
    }

    let verificationPayload = {};
    try {
        verificationPayload = await verificationResponse.json();
    } catch {
        verificationPayload = {};
    }

    const hasValidHostname = (() => {
        const recaptchaHostname = String(verificationPayload?.hostname || '').trim().toLowerCase();
        if (!recaptchaHostname) {
            return true;
        }

        try {
            const frontendHost = new URL(FRONTEND_URL).hostname.toLowerCase();
            return (
                recaptchaHostname === frontendHost
                || recaptchaHostname === `www.${frontendHost}`
                || frontendHost === `www.${recaptchaHostname}`
            );
        } catch {
            return true;
        }
    })();

    if (!verificationPayload?.success || !hasValidHostname) {
        return {
            ok: false,
            error: 'recaptcha_failed',
            reason: hasValidHostname ? 'provider_rejected' : 'hostname_mismatch'
        };
    }

    if (RECAPTCHA_VERSION === 'v3') {
        const score = Number(verificationPayload?.score);
        if (!Number.isFinite(score) || score < RECAPTCHA_MIN_SCORE) {
            return {
                ok: false,
                error: 'recaptcha_failed',
                reason: 'low_score'
            };
        }

        const recaptchaAction = normalizeText(verificationPayload?.action, 80);
        if (expectedAction && recaptchaAction && recaptchaAction !== expectedAction) {
            return {
                ok: false,
                error: 'recaptcha_failed',
                reason: 'action_mismatch'
            };
        }
    }

    return {
        ok: true
    };
}

async function assertRecaptchaOrThrow(request, expectedAction) {
    const verification = await verifyRecaptchaToken({
        token: request.body?.recaptchaToken,
        remoteIp: getRequestIpAddress(request),
        expectedAction
    });

    if (verification.ok) {
        return;
    }

    const status = verification.error === 'recaptcha_not_configured' ? 503 : 400;
    const error = createApiError(verification.error || 'recaptcha_failed', status);
    error.details = verification;
    throw error;
}

async function submitFormspreeJson({ endpoint, payload }) {
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
        throw createApiError('formspree_failed', 502);
    }
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
        'https://www.google.com/recaptcha/',
        'https://www.gstatic.com/recaptcha/'
    ],
    scriptSrcAttr: ["'none'"],
    connectSrc: [
        "'self'",
        'https://api.mercadopago.com',
        'https://formspree.io',
        'https://www.google.com/recaptcha/'
    ],
    imgSrc: ["'self'", 'data:', 'https://www.google.com', 'https://www.gstatic.com'],
    frameSrc: ["'self'", 'https://www.google.com', 'https://www.gstatic.com'],
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
    allowedHeaders: ['Content-Type', 'Accept', 'X-CSRF-Token', 'X-Request-Id'],
    credentials: false,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use((request, response, next) => {
    const incomingRequestId = normalizeText(request.get('x-request-id'), 120);
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
app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

function parseCookies(cookieHeader = '') {
    const safeDecode = (value) => {
        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    };

    return cookieHeader
        .split(';')
        .map(cookie => cookie.trim())
        .filter(Boolean)
        .reduce((acc, cookie) => {
            const separatorIndex = cookie.indexOf('=');
            if (separatorIndex < 0) {
                return acc;
            }

            const key = safeDecode(cookie.slice(0, separatorIndex).trim());
            const value = safeDecode(cookie.slice(separatorIndex + 1).trim());
            acc[key] = value;
            return acc;
        }, {});
}

function getCookieValue(request, key) {
    const cookies = parseCookies(request.headers?.cookie || '');
    return cookies[key];
}

function createRandomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
}

function getOrCreateCsrfSession(request, response) {
    let sessionId = getCookieValue(request, CSRF_SESSION_COOKIE_NAME);

    if (!sessionId || !/^[a-f0-9]{48}$/i.test(sessionId)) {
        sessionId = createRandomToken(24);
        response.cookie(CSRF_SESSION_COOKIE_NAME, sessionId, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
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

function hasAllowedOrigin(request) {
    return isAllowedOrigin(request.get('origin'));
}

function requireAllowedOrigin(request, response, next) {
    if (hasAllowedOrigin(request)) {
        return next();
    }

    if (!isProduction) {
        console.warn(`[CORS] Request bloqueado por origin inválido: ${request.get('origin') || 'null'}`);
    }

    return response.status(403).json({ ok: false, error: 'Origen no permitido' });
}

app.use((request, response, next) => {
    const { csrfToken } = getOrCreateCsrfSession(request, response);
    response.locals.csrfToken = csrfToken;
    next();
});

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
    windowMs: 60 * 1000,
    max: Number.parseInt(process.env.FORMS_RATE_LIMIT_MAX, 10) || 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        ok: false,
        error: 'Demasiados envíos de formulario. Esperá un minuto e intentá nuevamente.'
    }
});

app.use('/api/', apiLimiter);
app.use('/api/mp/create-preference', checkoutLimiter, requireAllowedOrigin);
app.use('/forms/', formsLimiter, requireAllowedOrigin);
app.get('/forms/config', requireAllowedOrigin, (_request, response) => {
    return response.json({
        ok: true,
        enabled: Boolean(RECAPTCHA_SITE_KEY),
        version: RECAPTCHA_VERSION,
        siteKey: RECAPTCHA_SITE_KEY,
        minScore: RECAPTCHA_MIN_SCORE
    });
});
app.get('/api/csrf-token', (request, response) => {
    if (!hasAllowedOrigin(request)) {
        return response.status(403).json({ ok: false, error: 'Origen no permitido' });
    }

    return response.json({ ok: true, csrfToken: response.locals.csrfToken });
});

if (!process.env.MP_ACCESS_TOKEN) {
    console.error('❌ ERROR CRÍTICO: MP_ACCESS_TOKEN no está configurado en .env');
    process.exit(1);
}

try {
    new URL(BASE_URL);
} catch {
    console.error(`❌ Error: BASE_URL invalida (${BASE_URL})`);
    process.exit(1);
}

function buildValidatedItems(rawItems) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
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

    for (const rawItem of rawItems) {
        const id = Number.parseInt(rawItem?.id, 10);
        const quantity = Number.parseInt(rawItem?.quantity, 10);

        if (!Number.isInteger(id) || !Object.prototype.hasOwnProperty.call(PRODUCT_CATALOG, id)) {
            const error = new Error(`Producto ID ${rawItem?.id} no encontrado en el catálogo`);
            error.status = 400;
            throw error;
        }

        if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
            const error = new Error(`Cantidad inválida para el producto ${id}`);
            error.status = 400;
            throw error;
        }

        validatedItems.push({
            id: String(id),
            title: PRODUCT_CATALOG[id].name.slice(0, 120),
            quantity,
            unit_price: PRODUCT_CATALOG[id].price,
            currency_id: 'ARS'
        });
    }

    return validatedItems;
}

function validateContactPayload(rawPayload = {}) {
    const payload = {
        name: normalizeText(rawPayload.name, 120),
        email: normalizeText(rawPayload.email, 160).toLowerCase(),
        phone: normalizeText(rawPayload.phone, 40),
        type: normalizeText(rawPayload.type, 60),
        message: sanitizeMultiLine(rawPayload.message, 3000),
        productReference: normalizeText(rawPayload.productReference, 120),
        company: normalizeText(rawPayload.company, 200)
    };

    if (!payload.name || payload.name.length < 2 || !NAME_PATTERN.test(payload.name)) {
        throw createApiError('Nombre inválido', 400);
    }

    if (!payload.email || !EMAIL_PATTERN.test(payload.email)) {
        throw createApiError('Email inválido', 400);
    }

    if (payload.phone && !PHONE_PATTERN.test(payload.phone)) {
        throw createApiError('Teléfono inválido', 400);
    }

    if (!CONTACT_TYPE_OPTIONS.has(payload.type)) {
        throw createApiError('Tipo de mueble inválido', 400);
    }

    if (!payload.message || payload.message.length < 10) {
        throw createApiError('El mensaje debe tener al menos 10 caracteres', 400);
    }

    return payload;
}

function validateQuotePayload(rawPayload = {}) {
    const payload = {
        fullName: normalizeText(rawPayload.fullName, 120),
        email: normalizeText(rawPayload.email, 160).toLowerCase(),
        phone: normalizeText(rawPayload.phone, 40),
        cityNeighborhood: normalizeText(rawPayload.cityNeighborhood, 120),
        province: normalizeText(rawPayload.province, 80),
        furnitureType: normalizeText(rawPayload.furnitureType, 80),
        approximateMeasures: sanitizeMultiLine(rawPayload.approximateMeasures, 600),
        estimatedBudget: normalizeText(rawPayload.estimatedBudget, 40),
        targetDate: normalizeText(rawPayload.targetDate, 20),
        additionalComments: sanitizeMultiLine(rawPayload.additionalComments, 2000),
        privacyAccepted: normalizeText(rawPayload.privacyAccepted, 20).toLowerCase(),
        company: normalizeText(rawPayload.company, 200)
    };

    const acceptedPrivacy = new Set(['true', '1', 'on', 'yes', 'si', 'sí']);

    if (!payload.fullName || payload.fullName.length < 2 || !NAME_PATTERN.test(payload.fullName)) {
        throw createApiError('Nombre completo inválido', 400);
    }

    if (!payload.email || !EMAIL_PATTERN.test(payload.email)) {
        throw createApiError('Email inválido', 400);
    }

    if (!payload.phone || !PHONE_PATTERN.test(payload.phone)) {
        throw createApiError('Teléfono inválido', 400);
    }

    if (!payload.cityNeighborhood || !CITY_NEIGHBORHOOD_PATTERN.test(payload.cityNeighborhood)) {
        throw createApiError('Ingresá una ciudad o barrio válido', 400);
    }

    if (!payload.province || !CITY_NEIGHBORHOOD_PATTERN.test(payload.province)) {
        throw createApiError('Ingresá una provincia válida', 400);
    }

    if (!QUOTE_FURNITURE_TYPE_OPTIONS.has(payload.furnitureType)) {
        throw createApiError('Tipo de mueble inválido', 400);
    }

    if (!payload.approximateMeasures || payload.approximateMeasures.length < 5) {
        throw createApiError('Completá las medidas aproximadas para cotizar', 400);
    }

    if (payload.estimatedBudget && !BUDGET_PATTERN.test(payload.estimatedBudget)) {
        throw createApiError('Presupuesto estimado inválido', 400);
    }

    if (payload.targetDate && !DATE_PATTERN.test(payload.targetDate)) {
        throw createApiError('Fecha objetivo inválida', 400);
    }

    if (!acceptedPrivacy.has(payload.privacyAccepted)) {
        throw createApiError('Debés aceptar la Política de Privacidad', 400);
    }

    return payload;
}

async function submitQuoteViaFormspree({
    quotePayload,
    photoMetadata,
    metadata
}) {
    if (!FORMSPREE_MEDIDA_ENDPOINT) {
        throw createApiError('forms_provider_not_configured', 503);
    }

    const attachmentsSummary = photoMetadata
        .map(file => `${file.originalName} (${file.mimeType}, ${file.sizeKb} KB)`)
        .join(' | ');
    await submitFormspreeJson({
        endpoint: FORMSPREE_MEDIDA_ENDPOINT,
        payload: {
            page: 'a-medida',
            form_type: 'quote_a_medida',
            full_name: quotePayload.fullName,
            email: quotePayload.email,
            phone: quotePayload.phone,
            city_neighborhood: quotePayload.cityNeighborhood,
            province: quotePayload.province,
            furniture_type: quotePayload.furnitureType,
            approximate_measures: quotePayload.approximateMeasures,
            estimated_budget: quotePayload.estimatedBudget || 'No informado',
            target_date: quotePayload.targetDate || 'No informada',
            additional_comments: quotePayload.additionalComments || 'Sin comentarios',
            files_count: photoMetadata.length,
            attachments_summary: attachmentsSummary || 'Sin archivos adjuntos',
            privacy_accepted: 'Sí',
            metadata_ip: metadata.ip || '',
            metadata_user_agent: metadata.userAgent || '',
            metadata_origin: metadata.origin || '',
            metadata_timestamp: metadata.timestamp,
            metadata_request_id: metadata.requestId || ''
        }
    });
}

async function handleContactSubmission(req, res, next) {
    try {
        await assertRecaptchaOrThrow(req, RECAPTCHA_ACTIONS.CONTACTO);
        const contactPayload = validateContactPayload(req.body || {});
        const metadata = buildFormRequestMetadata(req);

        // Honeypot.
        if (contactPayload.company) {
            return res.json({ ok: true, requestId: req.requestId });
        }

        await submitFormspreeJson({
            endpoint: FORMSPREE_CONTACT_ENDPOINT,
            payload: {
                page: 'contacto',
                form_type: 'contacto',
                name: contactPayload.name,
                email: contactPayload.email,
                phone: contactPayload.phone || 'No informado',
                type: contactPayload.type || 'No informado',
                message: contactPayload.message,
                product_reference: contactPayload.productReference || '',
                metadata_ip: metadata.ip || '',
                metadata_user_agent: metadata.userAgent || '',
                metadata_origin: metadata.origin || '',
                metadata_timestamp: metadata.timestamp,
                metadata_request_id: metadata.requestId || ''
            }
        });

        return res.json({ ok: true, requestId: req.requestId });
    } catch (error) {
        return next(error);
    }
}

async function handleQuoteSubmission(req, res, next) {
    try {
        await assertRecaptchaOrThrow(req, RECAPTCHA_ACTIONS.MEDIDA);
        const quotePayload = validateQuotePayload(req.body || {});

        // Honeypot.
        if (quotePayload.company) {
            return res.json({ ok: true, requestId: req.requestId });
        }

        const photoFiles = Array.isArray(req.files) ? req.files : [];
        const photoMetadata = photoFiles.map(file => ({
            originalName: normalizeText(file.originalname, 120) || 'archivo',
            mimeType: normalizeText(file.mimetype, 80) || 'application/octet-stream',
            sizeKb: Math.max(1, Math.round((Number(file.size) || 0) / 1024))
        }));
        const metadata = buildFormRequestMetadata(req);
        await submitQuoteViaFormspree({
            quotePayload,
            photoMetadata,
            metadata
        });

        return res.json({
            ok: true,
            requestId: req.requestId,
            message: 'Recibimos tu solicitud. En menos de 24 horas hábiles te vamos a contactar.'
        });
    } catch (error) {
        return next(error);
    }
}

app.post('/forms/contacto', contactLimiter, handleContactSubmission);
app.post('/forms/medida', quoteLimiter, quoteUpload.array('photos', QUOTE_MAX_FILES), handleQuoteSubmission);
app.post('/forms/envios', quoteLimiter, quoteUpload.array('photos', QUOTE_MAX_FILES), handleQuoteSubmission);
app.post('/api/contact', contactLimiter, requireAllowedOrigin, handleContactSubmission);
app.post('/api/quotes', quoteLimiter, requireAllowedOrigin, quoteUpload.array('photos', QUOTE_MAX_FILES), handleQuoteSubmission);

app.post('/api/mp/create-preference', async (req, res, next) => {
    try {
        const validatedItems = buildValidatedItems(req.body?.items);

        const preference = {
            items: validatedItems,
            back_urls: {
                success: `${BASE_URL}/success.html`,
                failure: `${BASE_URL}/failure.html`,
                pending: `${BASE_URL}/pending.html`
            }
        };

        const timeout = Number.parseInt(process.env.MP_API_TIMEOUT_MS, 10) || 10000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        let mpResponse;
        try {
            mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
                },
                body: JSON.stringify(preference),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }

        const mpData = await mpResponse.json();

        if (!mpResponse.ok) {
            const error = new Error(mpData?.message || 'Mercado Pago devolvió un error');
            error.status = 502;
            throw error;
        }

        if (!mpData?.init_point) {
            const error = new Error('Mercado Pago no devolvió init_point');
            error.status = 502;
            throw error;
        }

        return res.json({
            init_point: mpData.init_point,
            id: mpData.id
        });
    } catch (error) {
        if (!error.status) {
            console.error('❌ Error inesperado:', error);
        }
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
    console.log(`Servidor corriendo en puerto ${PORT}`);
    console.log(`\n🚀 Backend corriendo en http://localhost:${PORT}`);
    console.log(`💳 Mercado Pago Access Token: ${process.env.MP_ACCESS_TOKEN ? '✅ Configurado' : '❌ NO configurado'}`);
    console.log(`🛡️ CORS permitido para: ${Array.from(allowedOrigins).join(', ')} (+ *.netlify.app)`);
    console.log(`🔗 Base URL: ${BASE_URL}`);
    console.log(`\n📍 Endpoint: POST http://localhost:${PORT}/api/mp/create-preference\n`);
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
