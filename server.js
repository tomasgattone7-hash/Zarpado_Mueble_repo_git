const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const isProduction = process.env.NODE_ENV === 'production';
const forceHttps = process.env.FORCE_HTTPS === 'true' || isProduction;
const CSRF_SESSION_COOKIE_NAME = 'zm_sid';
const CONTACT_FORM_ENDPOINT = process.env.CONTACT_FORM_ENDPOINT || 'https://formspree.io/f/xqedeven';
const MAX_CSRF_SESSIONS = Number.parseInt(process.env.CSRF_SESSION_MAX, 10) || 5000;
const DELIVERY_CONFIG_PATH = path.resolve(__dirname, 'config', 'delivery-config.json');
const ORDERS_DB_PATH = path.resolve(__dirname, 'data', 'orders.json');
const POSTAL_CODE_PATTERN = /^\d{4}$/;
const ORDER_ID_PATTERN = /^ZM-\d{13}-[A-F0-9]{6}$/;
const EXTERNAL_REFERENCE_PATTERN = /^ORDER_\d{13}_[A-Z0-9]{6}$/;
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const NAME_PATTERN = /^[a-zA-ZÀ-ÿ0-9 .,'-]{2,120}$/u;
const PHONE_PATTERN = /^[0-9+()\-\s]{6,40}$/;
const DOCUMENT_PATTERN = /^[A-Za-z0-9./-]{5,20}$/;
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
const SMTP_HOST = String(process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT, 10) || 587;
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim();
const FROM_EMAIL = String(process.env.FROM_EMAIL || '').trim();
const csrfSessions = new Map();

const defaultAllowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    BASE_URL
];

const allowedOrigins = [
    ...new Set(
        (process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',')
            : defaultAllowedOrigins
        )
            .map(origin => origin.trim())
            .filter(Boolean)
    )
];

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

function normalizeText(value, maxLength = 120) {
    return String(value || '').trim().slice(0, maxLength);
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

function isInstallationAvailable(postalCode, config) {
    const zones = config.installationZones || {};
    if (isPostalCodeInList(postalCode, zones.enabledPostalCodes || [])) {
        return true;
    }

    return isPostalCodeInRanges(postalCode, zones.enabledRanges || []);
}

function calculateDelivery(rawDelivery, config) {
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
    const shippingCost = Number.parseInt(shippingRule.cost, 10);

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
        shippingLabel: String(shippingRule.label || 'Envío a domicilio').slice(0, 80),
        shippingCost,
        installationAvailable: installationAllowed,
        installationRequested,
        installationBaseCost,
        installationCost: installationRequested ? installationBaseCost : 0
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
    scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
    styleSrcAttr: ["'unsafe-inline'"],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'", 'https://api.mercadopago.com', 'https://formspree.io'],
    formAction: ["'self'", CONTACT_FORM_ENDPOINT],
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
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error('Origen no permitido por CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    credentials: false,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(compression({ threshold: 1024 }));
app.use(cookieParser());
app.use(express.json({ limit: '16kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

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

app.use((req, res, next) => {
    const { sessionId, csrfToken } = getOrCreateCsrfSession(req, res);
    res.locals.csrfSessionId = sessionId;
    res.locals.csrfToken = csrfToken;
    return next();
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number.parseInt(process.env.RATE_LIMIT_MAX, 10) || 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Demasiadas solicitudes. Intentá nuevamente en unos minutos.'
    }
});

const checkoutLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: Number.parseInt(process.env.CHECKOUT_RATE_LIMIT_MAX, 10) || 25,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Demasiados intentos de checkout. Esperá unos minutos.'
    }
});

const contactLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: Number.parseInt(process.env.CONTACT_RATE_LIMIT_MAX, 10) || 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Demasiados envíos de formulario. Probá nuevamente en unos minutos.'
    }
});

function hasAllowedOrigin(request) {
    const origin = request.get('origin');
    if (!origin) return true;
    return allowedOrigins.includes(origin);
}

function validateCsrf(request, response, next) {
    if (!hasAllowedOrigin(request)) {
        return response.status(403).json({ error: 'Origen no permitido' });
    }

    const sessionId = request.cookies?.[CSRF_SESSION_COOKIE_NAME];
    const expectedToken = sessionId ? csrfSessions.get(sessionId) : null;
    const headerToken = request.get('x-csrf-token');
    const bodyToken = typeof request.body?.csrf_token === 'string'
        ? request.body.csrf_token
        : null;
    const providedToken = (headerToken || bodyToken || '').trim();

    if (!sessionId || !expectedToken || !providedToken || expectedToken !== providedToken) {
        return response.status(403).json({ error: 'Token CSRF inválido o ausente' });
    }

    return next();
}

app.use('/api/', apiLimiter);
app.use('/api/mp/create-preference', checkoutLimiter, validateCsrf);
app.use('/api/contact', contactLimiter, validateCsrf);
app.get('/api/csrf-token', (req, res) => {
    if (!hasAllowedOrigin(req)) {
        return res.status(403).json({ error: 'Origen no permitido' });
    }

    return res.json({ csrfToken: res.locals.csrfToken });
});

const blockedPrefixPaths = ['/backend/', '/scripts/', '/node_modules/', '/.github/', '/config/', '/data/'];
const blockedFilePattern = /\.(?:md|map|ya?ml|toml|cjs|mjs|env|example|log)$/i;

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

app.use(express.static(path.resolve(__dirname), {
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

if (!process.env.MP_ACCESS_TOKEN) {
    console.error('❌ Error: MP_ACCESS_TOKEN no está configurado en .env');
    process.exit(1);
}

try {
    new URL(BASE_URL);
} catch {
    console.error(`❌ Error: BASE_URL invalida (${BASE_URL})`);
    process.exit(1);
}

const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN,
    options: { timeout: 5000 }
});

const preference = new Preference(client);

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
            description: String(product.description || product.name).slice(0, 256),
            quantity,
            unit_price: product.price,
            currency_id: 'ARS'
        });
    }

    return validatedItems;
}

function calculateItemsSubtotal(items) {
    return items.reduce((acc, item) => acc + (item.unit_price * item.quantity), 0);
}

function buildPublicOrderPayload(order) {
    const orderRef = normalizeOrderLookupRef(order.externalReference) || order.orderId;
    const paymentStatus = normalizeText(order.paymentStatus || order?.mp?.status || 'pending', 40).toLowerCase();
    return {
        orderRef,
        orderId: order.orderId,
        externalReference: normalizeOrderLookupRef(order.externalReference) || null,
        createdAt: order.createdAt,
        preferenceId: order.preferenceId || order?.mp?.preferenceId || null,
        paymentId: normalizeMpIdentifier(order?.mp?.paymentId || order?.paymentMeta?.paymentId, 80) || null,
        merchantOrderId: normalizeMpIdentifier(order?.mp?.merchantOrderId, 120) || null,
        paymentStatus,
        paid: Boolean(order.paid || paymentStatus === 'approved'),
        checkoutStatus: order.checkoutStatus,
        delivery: order.delivery,
        totals: order.totals,
        hasDeliveryDetails: Boolean(order.customerData),
        trackingUrl: normalizeText(order.tracking_url, 600) || null,
        factoryPickup: loadDeliveryConfig().factoryPickup
    };
}

function isValidOrderLookupRef(orderRef) {
    if (!orderRef) return false;
    return ORDER_ID_PATTERN.test(orderRef) || EXTERNAL_REFERENCE_PATTERN.test(orderRef);
}

function formatOrderCurrency(value) {
    return `$${Number(value || 0).toLocaleString('es-AR')}`;
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
    return Boolean(emailTransporter && ADMIN_EMAIL && FROM_EMAIL);
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

    return {
        orderRef,
        furnitureTypes,
        itemsLines: lines.length > 0 ? lines.join('\n') : 'Sin items',
        totals,
        paymentStatus
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
        'Mercado Pago',
        `- payment_id: ${normalizeMpIdentifier(mpData.paymentId, 80) || 'No informado'}`,
        `- merchant_order_id: ${normalizeMpIdentifier(mpData.merchantOrderId, 120) || 'No informado'}`,
        `- preference_id: ${normalizeMpIdentifier(mpData.preferenceId || order.preferenceId, 120) || 'No informado'}`,
        `- status: ${summary.paymentStatus || 'No informado'}`,
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
        <h3>Mercado Pago</h3>
        <ul>
            <li><strong>payment_id:</strong> ${escapeHtml(mpData.paymentId || 'No informado')}</li>
            <li><strong>merchant_order_id:</strong> ${escapeHtml(mpData.merchantOrderId || 'No informado')}</li>
            <li><strong>preference_id:</strong> ${escapeHtml(mpData.preferenceId || order.preferenceId || 'No informado')}</li>
            <li><strong>status:</strong> ${escapeHtml(summary.paymentStatus || 'No informado')}</li>
        </ul>
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
        `- Tipo de mueble: ${summary.furnitureTypes}`,
        summary.itemsLines,
        `Subtotal: ${formatOrderCurrency(summary.totals?.subtotal)}`,
        `Envío: ${formatOrderCurrency(summary.totals?.shipping)}`,
        `Instalación: ${formatOrderCurrency(summary.totals?.installation)}`,
        `Total abonado: ${formatOrderCurrency(summary.totals?.total)}`,
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
        <p><strong>Tipo de mueble:</strong> ${escapeHtml(summary.furnitureTypes)}</p>
        <ul>${htmlItems || '<li>Sin items</li>'}</ul>
        <p><strong>Subtotal:</strong> ${escapeHtml(formatOrderCurrency(summary.totals?.subtotal))}</p>
        <p><strong>Envío:</strong> ${escapeHtml(formatOrderCurrency(summary.totals?.shipping))}</p>
        <p><strong>Instalación:</strong> ${escapeHtml(formatOrderCurrency(summary.totals?.installation))}</p>
        <p><strong>Total abonado:</strong> ${escapeHtml(formatOrderCurrency(summary.totals?.total))}</p>
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

async function fetchMercadoPagoEndpoint(endpointPath, query = null) {
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
    const updated = updateOrder(matchedOrder.orderId, current => ({
        ...current,
        updatedAt: new Date().toISOString(),
        externalReference: normalizeOrderLookupRef(current.externalReference) || externalReference || current.orderId,
        preferenceId: preferenceId || current.preferenceId,
        paymentStatus,
        paid: Boolean(current.paid || approved),
        buyerEmail: sanitizeEmail(current.buyerEmail || payerEmail),
        checkoutStatus: approved
            ? (current.customerData ? 'paid_and_completed_data' : 'paid_waiting_customer_data')
            : (current.checkoutStatus || 'pending_payment'),
        mp: {
            ...(current.mp || {}),
            paymentId: paymentId || current?.mp?.paymentId || '',
            merchantOrderId: merchantOrderId || current?.mp?.merchantOrderId || '',
            preferenceId: preferenceId || current?.mp?.preferenceId || current.preferenceId || '',
            status: paymentStatus,
            statusDetail: normalizeText(paymentData?.status_detail || current?.mp?.statusDetail, 120),
            externalReference: normalizeOrderLookupRef(current.externalReference) || externalReference || '',
            lastSyncedAt: new Date().toISOString(),
            source
        },
        paymentMeta: {
            paymentId: paymentId || current?.paymentMeta?.paymentId || '',
            preferenceId: preferenceId || current?.paymentMeta?.preferenceId || current.preferenceId || '',
            merchantOrderId: merchantOrderId || current?.paymentMeta?.merchantOrderId || '',
            paymentStatus: paymentStatus
        }
    }));

    if (!updated) {
        return null;
    }

    if (approved) {
        return sendOrderEmailsIfReady(updated, source);
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
        return res.status(400).json({ error: 'Ingresá un código postal válido de 4 dígitos' });
    }

    const shippingRule = findShippingRule(postalCode, config);
    if (!shippingRule) {
        return res.status(422).json({
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
        return res.status(500).json({ error: 'La configuración de envío para ese código postal es inválida' });
    }

    return res.json({
        postalCode,
        shippingLabel: String(shippingRule.label || 'Envío a domicilio').slice(0, 80),
        shippingCost,
        installationAvailable: isInstallationAvailable(postalCode, config),
        installationBaseCost,
        installationComplexNotice: String(config.installationComplexNotice || 'Instalaciones complejas se cotizan aparte.')
    });
});

app.post('/api/mp/create-preference', async (req, res, next) => {
    try {
        const validatedItems = buildValidatedItems(req.body?.items);
        const subtotal = calculateItemsSubtotal(validatedItems);
        const deliveryConfig = loadDeliveryConfig();
        const delivery = calculateDelivery(req.body?.delivery, deliveryConfig);
        const totalAmount = subtotal + delivery.shippingCost + delivery.installationCost;
        const orderId = generateOrderId();
        const externalReference = generateExternalReference();
        const buyerEmail = sanitizeEmail(
            req.body?.buyerEmail
            || req.body?.payer?.email
            || req.body?.email
        );
        const preferenceItems = [...validatedItems];
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
                delivery_method: delivery.method,
                postal_code: delivery.postalCode || '',
                installation_requested: String(delivery.installationRequested),
                buyer_email: buyerEmail,
                items: metadataItems,
                totals: metadataTotals
            },
            back_urls: {
                success: `${BASE_URL}/datos-envio.html?order_id=${encodeURIComponent(orderId)}&order_ref=${encodeURIComponent(externalReference)}`,
                failure: `${BASE_URL}/failure.html?order_ref=${encodeURIComponent(externalReference)}`,
                pending: `${BASE_URL}/pending.html?order_ref=${encodeURIComponent(externalReference)}`
            }
        };

        const notificationUrl = normalizeText(process.env.NOTIFICATION_URL, 300);
        if (notificationUrl) {
            preferenceData.notification_url = notificationUrl;
        }

        if (buyerEmail) {
            preferenceData.payer = { email: buyerEmail };
        }

        if (shouldEnableMercadoPagoAutoReturn(BASE_URL)) {
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
                init_point: `${BASE_URL}/datos-envio.html?order_id=${encodeURIComponent(orderId)}&order_ref=${encodeURIComponent(externalReference)}&payment_mode=offline&status=pending`
            };

            console.warn('⚠️ Mercado Pago inaccesible. Se habilitó fallback offline para entorno actual.');
        }

        createOrder({
            orderId,
            externalReference,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            preferenceId: response.id,
            paymentStatus: isOfflineFallback ? 'unavailable' : 'pending',
            paid: false,
            checkoutStatus: isOfflineFallback ? 'offline_fallback' : 'pending_payment',
            items: validatedItems.map(item => ({
                id: item.id,
                title: item.title,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price
            })),
            delivery,
            totals: {
                subtotal,
                shipping: delivery.shippingCost,
                installation: delivery.installationCost,
                total: totalAmount
            },
            buyerEmail,
            customerData: null,
            tracking_url: '',
            emails_sent: false,
            emails_sent_at: null,
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
            id: response.id,
            init_point: response.init_point,
            order_id: orderId,
            order_ref: externalReference,
            external_reference: externalReference,
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

app.post('/api/contact', async (req, res, next) => {
    const expectsJson = String(req.headers.accept || '').includes('application/json');

    try {
        const name = String(req.body?.name || '').trim().slice(0, 120);
        const email = String(req.body?.email || '').trim().slice(0, 120);
        const phone = String(req.body?.phone || '').trim().slice(0, 40);
        const type = String(req.body?.type || '').trim().slice(0, 60);
        const message = String(req.body?.message || '').trim().slice(0, 3000);
        const allowedTypes = new Set(['Escritorio', 'Rack TV', 'Cocina', 'Placard', 'Otro', '']);

        if (!name || !email || !message) {
            const error = new Error('Completá nombre, email y mensaje');
            error.status = 400;
            throw error;
        }

        if (!/^[a-zA-ZÀ-ÿ0-9 .,'-]{2,120}$/u.test(name)) {
            const error = new Error('Nombre inválido');
            error.status = 400;
            throw error;
        }

        if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
            const error = new Error('Email inválido');
            error.status = 400;
            throw error;
        }

        if (phone && !/^[0-9+()\-\s]{6,40}$/.test(phone)) {
            const error = new Error('Teléfono inválido');
            error.status = 400;
            throw error;
        }

        if (!allowedTypes.has(type)) {
            const error = new Error('Tipo de mueble inválido');
            error.status = 400;
            throw error;
        }

        const submitContactViaFormspree = async () => {
            const payload = new URLSearchParams({
                name,
                email,
                phone,
                type,
                message
            });

            const response = await fetch(CONTACT_FORM_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'application/json'
                },
                body: payload.toString()
            });

            let responsePayload = {};
            try {
                responsePayload = await response.json();
            } catch {
                responsePayload = {};
            }

            if (!response.ok || responsePayload?.ok !== true) {
                const providerError = String(
                    responsePayload?.errors?.[0]?.message
                    || responsePayload?.error
                    || ''
                ).trim();
                const error = new Error(providerError || 'No se pudo enviar el formulario de contacto');
                error.status = response.status >= 500 ? 502 : 400;
                throw error;
            }

            return 'formspree';
        };

        let provider = 'formspree';
        if (emailTransporter && ADMIN_EMAIL && FROM_EMAIL) {
            const subject = `Nuevo contacto web - ${type || 'Consulta general'}`;
            const lines = [
                `Nombre: ${name}`,
                `Email: ${email}`,
                `Teléfono: ${phone || 'No informado'}`,
                `Tipo de mueble: ${type || 'No informado'}`,
                '',
                'Mensaje:',
                message
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
                console.error(`❌ Error SMTP contacto: ${smtpError.message}`);
                provider = await submitContactViaFormspree();
            }
        } else {
            provider = await submitContactViaFormspree();
        }

        console.log(`📨 Contacto enviado (${provider}) desde ${email}`);

        if (expectsJson) {
            return res.json({ ok: true, provider });
        }
        return res.redirect(303, '/contacto.html?sent=1');
    } catch (error) {
        if (!error.status) {
            console.error('❌ Error al enviar contacto:', error);
        }
        if (expectsJson) {
            return res.status(error.status || 500).json({
                ok: false,
                error: error.message || 'No se pudo enviar el formulario'
            });
        }
        return next(error);
    }
});

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
        return res.status(400).json({ error: 'Identificador de pedido inválido' });
    }

    const order = findOrderByAnyReference({ orderRef });
    if (!order) {
        return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    return res.json(buildPublicOrderPayload(order));
});

app.get('/api/orders/by-preference/:preferenceId', (req, res) => {
    const preferenceId = normalizeMpIdentifier(req.params.preferenceId, 120);
    if (!preferenceId) {
        return res.status(400).json({ error: 'Preferencia inválida' });
    }

    const order = findOrderByPreferenceId(preferenceId);
    if (!order) {
        return res.status(404).json({ error: 'Pedido no encontrado para esa preferencia' });
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
            const currentStatus = normalizeText(current?.mp?.status || current.paymentStatus || 'pending', 40).toLowerCase();
            const isPaid = Boolean(current.paid || currentStatus === 'approved');
            return {
                ...current,
                updatedAt: new Date().toISOString(),
                externalReference: normalizeOrderLookupRef(current.externalReference) || current.orderId,
                paymentStatus: currentStatus,
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
                    status: currentStatus,
                    externalReference: normalizeOrderLookupRef(current.externalReference) || current.orderId
                },
                paymentMeta: {
                    paymentId: paymentId || current?.paymentMeta?.paymentId || '',
                    preferenceId: preferenceId || current?.paymentMeta?.preferenceId || current.preferenceId || '',
                    merchantOrderId: merchantOrderId || current?.paymentMeta?.merchantOrderId || '',
                    paymentStatus: currentStatus
                },
                tracking_url: normalizeText(current.tracking_url, 600) || ''
            };
        });

        if (!savedOrder) {
            const error = new Error('No se pudo actualizar el pedido');
            error.status = 500;
            throw error;
        }

        const notifiedOrder = await sendOrderEmailsIfReady(savedOrder, 'order_details_submission');
        return res.json({
            ok: true,
            message: notifiedOrder?.paid
                ? 'Datos recibidos. Compra confirmada correctamente.'
                : 'Datos recibidos. Estamos esperando la acreditación del pago para confirmar la compra.',
            order: buildPublicOrderPayload(notifiedOrder || savedOrder)
        });
    } catch (error) {
        return next(error);
    }
}

app.post('/api/order/details', validateCsrf, handleOrderDetailsSubmission);

app.post('/api/orders/:orderId/delivery-details', validateCsrf, (req, res, next) => {
    req.body = {
        ...(req.body || {}),
        orderRef: req.body?.orderRef || req.params.orderId,
        orderId: req.body?.orderId || req.params.orderId
    };
    return handleOrderDetailsSubmission(req, res, next);
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint no encontrado' });
});

app.use((req, res, next) => {
    if (req.method !== 'GET') {
        return next();
    }

    return res.status(404).sendFile(path.resolve(__dirname, '404.html'));
});

app.use((error, req, res, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        return res.status(400).json({ error: 'JSON inválido en el request body' });
    }

    if (error.name === 'AbortError') {
        return res.status(504).json({ error: 'Timeout al comunicarse con Mercado Pago' });
    }

    if (error.message === 'Origen no permitido por CORS') {
        return res.status(403).json({ error: 'Origen no permitido' });
    }

    if (isMercadoPagoNetworkError(error)) {
        return res.status(503).json({
            error: 'No pudimos conectar con Mercado Pago en este momento. Verificá conectividad de red/firewall y reintentá.',
            code: 'MP_UNREACHABLE'
        });
    }

    const status = error.status || 500;
    const payload = {
        error: status === 500
            ? 'Error interno del servidor. Intenta nuevamente.'
            : error.message
    };

    if (status === 500 && process.env.NODE_ENV === 'development') {
        payload.details = error.message;
    }

    return res.status(status).json(payload);
});

const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`💳 Mercado Pago configurado correctamente`);
    console.log(`🛡️ CORS permitido para: ${allowedOrigins.join(', ')}`);
    console.log(`🔔 Webhook MP: ${process.env.NOTIFICATION_URL || '(no configurado)'}`);
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
