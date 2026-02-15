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
    return store.orders.find(order => order.preferenceId === trimmedPreferenceId) || null;
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
    connectSrc: ["'self'", 'https://api.mercadopago.com'],
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

function calculateItemsSubtotal(items) {
    return items.reduce((acc, item) => acc + (item.unit_price * item.quantity), 0);
}

function buildPublicOrderPayload(order) {
    return {
        orderId: order.orderId,
        createdAt: order.createdAt,
        preferenceId: order.preferenceId,
        paymentStatus: order.paymentStatus,
        checkoutStatus: order.checkoutStatus,
        delivery: order.delivery,
        totals: order.totals,
        hasDeliveryDetails: Boolean(order.customerData),
        factoryPickup: loadDeliveryConfig().factoryPickup
    };
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
            external_reference: orderId,
            metadata: {
                order_id: orderId,
                delivery_method: delivery.method,
                postal_code: delivery.postalCode || '',
                installation_requested: String(delivery.installationRequested)
            },
            back_urls: {
                success: `${BASE_URL}/datos-envio`,
                failure: `${BASE_URL}/failure.html`,
                pending: `${BASE_URL}/pending.html`
            }
        };

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
                init_point: `${BASE_URL}/datos-envio?order_id=${encodeURIComponent(orderId)}&payment_mode=offline&status=pending`
            };

            console.warn('⚠️ Mercado Pago inaccesible. Se habilitó fallback offline para entorno actual.');
        }

        createOrder({
            orderId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            preferenceId: response.id,
            paymentStatus: isOfflineFallback ? 'unavailable' : 'pending',
            checkoutStatus: isOfflineFallback ? 'offline_fallback' : 'pending_payment',
            items: validatedItems.map(item => ({
                id: item.id,
                title: item.title,
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
            customerData: null,
            paymentMeta: null
        });

        if (!isOfflineFallback) {
            console.log('✅ Preferencia creada:', response.id);
        }

        return res.json({
            id: response.id,
            init_point: response.init_point,
            order_id: orderId,
            payment_mode: isOfflineFallback ? 'offline' : 'mercadopago',
            warning: isOfflineFallback
                ? 'No fue posible conectar con Mercado Pago. Se habilitó un flujo offline temporal.'
                : undefined,
            totals: {
                subtotal,
                shipping: delivery.shippingCost,
                installation: delivery.installationCost,
                total: totalAmount
            }
        });
    } catch (error) {
        if (!error.status) {
            console.error('❌ Error al crear preferencia:', error);
        }
        return next(error);
    }
});

app.post('/api/contact', async (req, res, next) => {
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

        if (!response.ok) {
            const error = new Error('No se pudo enviar el formulario de contacto');
            error.status = 502;
            throw error;
        }

        return res.redirect(303, '/contacto.html?sent=1');
    } catch (error) {
        if (!error.status) {
            console.error('❌ Error al enviar contacto:', error);
        }
        return next(error);
    }
});

app.get('/api/orders/:orderId', (req, res) => {
    const orderId = String(req.params.orderId || '').trim().toUpperCase();
    if (!ORDER_ID_PATTERN.test(orderId)) {
        return res.status(400).json({ error: 'Identificador de pedido inválido' });
    }

    const order = findOrder(orderId);
    if (!order) {
        return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    return res.json(buildPublicOrderPayload(order));
});

app.get('/api/orders/by-preference/:preferenceId', (req, res) => {
    const preferenceId = String(req.params.preferenceId || '').trim();
    if (!preferenceId) {
        return res.status(400).json({ error: 'Preferencia inválida' });
    }

    const order = findOrderByPreferenceId(preferenceId);
    if (!order) {
        return res.status(404).json({ error: 'Pedido no encontrado para esa preferencia' });
    }

    return res.json(buildPublicOrderPayload(order));
});

app.post('/api/orders/:orderId/delivery-details', validateCsrf, (req, res, next) => {
    try {
        const orderId = String(req.params.orderId || '').trim().toUpperCase();
        if (!ORDER_ID_PATTERN.test(orderId)) {
            const error = new Error('Identificador de pedido inválido');
            error.status = 400;
            throw error;
        }

        const order = findOrder(orderId);
        if (!order) {
            const error = new Error('Pedido no encontrado');
            error.status = 404;
            throw error;
        }

        const fullName = String(req.body?.fullName || '').trim().slice(0, 120);
        const documentId = String(req.body?.documentId || '').trim().slice(0, 20);
        const phone = String(req.body?.phone || '').trim().slice(0, 40);
        const email = String(req.body?.email || '').trim().slice(0, 120);

        const street = String(req.body?.street || '').trim().slice(0, 120);
        const streetNumber = String(req.body?.streetNumber || '').trim().slice(0, 20);
        const city = String(req.body?.city || '').trim().slice(0, 80);
        const province = String(req.body?.province || '').trim().slice(0, 80);
        const postalCode = normalizePostalCode(req.body?.postalCode);

        const floorApartment = String(req.body?.floorApartment || '').trim().slice(0, 60);
        const neighborhood = String(req.body?.neighborhood || '').trim().slice(0, 80);
        const addressReference = String(req.body?.addressReference || '').trim().slice(0, 180);
        const receiverType = String(req.body?.receiverType || '').trim().slice(0, 40);
        const receiverName = String(req.body?.receiverName || '').trim().slice(0, 120);
        const availableSchedule = String(req.body?.availableSchedule || '').trim().slice(0, 120);
        const additionalNotes = String(req.body?.additionalNotes || '').trim().slice(0, 600);

        const paymentId = String(req.body?.paymentId || '').trim().slice(0, 60);
        const preferenceId = String(req.body?.preferenceId || '').trim().slice(0, 120);
        const paymentStatus = String(req.body?.paymentStatus || '').trim().slice(0, 40);

        if (!fullName || !documentId || !phone || !email) {
            const error = new Error('Completá nombre, documento, teléfono y email');
            error.status = 400;
            throw error;
        }

        if (!/^[a-zA-ZÀ-ÿ0-9 .,'-]{2,120}$/u.test(fullName)) {
            const error = new Error('Nombre y apellido inválido');
            error.status = 400;
            throw error;
        }

        if (!/^[A-Za-z0-9.-]{5,20}$/.test(documentId)) {
            const error = new Error('Documento inválido');
            error.status = 400;
            throw error;
        }

        if (!/^[0-9+()\-\s]{6,40}$/.test(phone)) {
            const error = new Error('Teléfono inválido');
            error.status = 400;
            throw error;
        }

        if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
            const error = new Error('Email inválido');
            error.status = 400;
            throw error;
        }

        if (preferenceId && order.preferenceId && preferenceId !== order.preferenceId) {
            const error = new Error('El pedido no coincide con la preferencia de pago');
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

        const nextStatus = paymentStatus.toLowerCase() === 'approved'
            ? 'approved'
            : (order.paymentStatus || 'pending');

        const savedOrder = updateOrder(orderId, current => ({
            ...current,
            updatedAt: new Date().toISOString(),
            paymentStatus: nextStatus,
            checkoutStatus: 'delivery_data_received',
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
                receiverName,
                availableSchedule,
                additionalNotes
            },
            paymentMeta: {
                paymentId,
                preferenceId: preferenceId || current.preferenceId,
                paymentStatus
            }
        }));

        if (!savedOrder) {
            const error = new Error('No se pudo actualizar el pedido');
            error.status = 500;
            throw error;
        }

        return res.json({
            ok: true,
            message: 'Datos recibidos. Te contactaremos para coordinar la entrega/instalación/retiro.',
            order: buildPublicOrderPayload(savedOrder)
        });
    } catch (error) {
        return next(error);
    }
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
