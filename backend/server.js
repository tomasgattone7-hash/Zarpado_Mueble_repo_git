import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import fetch from 'node-fetch';
import crypto from 'node:crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const isProduction = process.env.NODE_ENV === 'production';

const MAX_CART_ITEMS = Number.parseInt(process.env.MAX_CART_ITEMS, 10) || 20;
const MAX_ITEM_QUANTITY = Number.parseInt(process.env.MAX_ITEM_QUANTITY, 10) || 10;
const CSRF_SESSION_COOKIE_NAME = 'zm_sid';
const MAX_CSRF_SESSIONS = Number.parseInt(process.env.CSRF_SESSION_MAX, 10) || 5000;
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

const defaultAllowedOrigins = [
    'https://zarpadomueble.com',
    'https://www.zarpadomueble.com',
    'http://localhost:8888',
    'http://127.0.0.1:8888',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
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

const trustProxyValue = process.env.TRUST_PROXY;
const trustProxySetting = trustProxyValue === undefined
    ? 1
    : (Number.isNaN(Number(trustProxyValue)) ? trustProxyValue : Number(trustProxyValue));

app.set('trust proxy', trustProxySetting);
app.disable('x-powered-by');

const cspDirectives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    scriptSrcAttr: ["'none'"],
    connectSrc: ["'self'", 'https://api.mercadopago.com', 'https://formspree.io'],
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
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'X-CSRF-Token'],
    credentials: false,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '16kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

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

app.use('/api/', apiLimiter);
app.get('/api/csrf-token', (request, response) => {
    if (!hasAllowedOrigin(request)) {
        return response.status(403).json({ ok: false, error: 'Origen no permitido' });
    }

    return response.json({ ok: true, csrfToken: response.locals.csrfToken });
});
app.use('/api/mp/create-preference', checkoutLimiter);

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
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        return res.status(400).json({ ok: false, error: 'JSON inválido en el request body' });
    }

    if (error.name === 'AbortError') {
        return res.status(504).json({ ok: false, error: 'Timeout al comunicarse con Mercado Pago' });
    }

    if (error.message === 'Origen no permitido por CORS') {
        return res.status(403).json({ ok: false, error: 'Origen no permitido' });
    }

    const status = error.status || 500;
    const payload = {
        ok: false,
        error: status === 500
            ? 'Error interno del servidor'
            : error.message
    };

    if (status === 500 && process.env.NODE_ENV === 'development') {
        payload.details = error.message;
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
