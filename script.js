/* --- Navigation & Mobile Menu --- */
const MOBILE_BREAKPOINT = 768;
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');
const cartSidebar = document.getElementById('cartSidebar');

function isMobileViewport() {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

function syncUiOverlayState() {
    const menuOpen = Boolean(navMenu?.classList.contains('active'));
    const cartOpen = Boolean(cartSidebar?.classList.contains('open'));
    document.body.classList.toggle('ui-locked', isMobileViewport() && (menuOpen || cartOpen));
}

function closeMobileMenu() {
    navMenu?.classList.remove('active');
    hamburger?.classList.remove('active');
    syncUiOverlayState();
}

function setCartOpenState(isOpen) {
    if (!cartSidebar) return;
    cartSidebar.classList.toggle('open', Boolean(isOpen));
    syncUiOverlayState();
}

function closeCart() {
    setCartOpenState(false);
}

const THEME_STORAGE_KEY = 'zm_theme';
const LIGHT_THEME = 'light';
const DARK_THEME = 'dark';
const THEME_MEDIA_QUERY = window.matchMedia('(prefers-color-scheme: dark)');
const PROD_API_BASE_URL = 'https://api.zarpadomueble.com';
const LOCAL_API_BASE_URL = 'http://localhost:3000';

function resolveApiBaseUrl() {
    if (typeof window === 'undefined' || !window.location) {
        return PROD_API_BASE_URL;
    }

    const hostname = String(window.location.hostname || '').toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
        return LOCAL_API_BASE_URL;
    }

    return PROD_API_BASE_URL;
}

const API_BASE_URL = resolveApiBaseUrl();
const RECAPTCHA_V2_SITE_KEY = '6LdtDG4sAAAAAMAXYM3oDCZhrM7qP7hsA85KABMM';
const RECAPTCHA_V2_SCRIPT_URL = 'https://www.google.com/recaptcha/api.js?render=explicit';
let recaptchaScriptLoadPromise = null;
const recaptchaWidgetIds = {};

function buildApiUrl(path) {
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath) {
        return API_BASE_URL;
    }

    if (/^https?:\/\//i.test(normalizedPath)) {
        return normalizedPath;
    }

    const pathWithSlash = normalizedPath.startsWith('/')
        ? normalizedPath
        : `/${normalizedPath}`;

    return `${API_BASE_URL}${pathWithSlash}`;
}

if (typeof window !== 'undefined') {
    window.ZM_API_BASE_URL = API_BASE_URL;
    window.zmBuildApiUrl = buildApiUrl;
}

function getStoredTheme() {
    try {
        const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
        if (storedTheme === LIGHT_THEME || storedTheme === DARK_THEME) {
            return storedTheme;
        }
    } catch (error) {
        // Ignore blocked storage scenarios.
    }

    return '';
}

function getSystemTheme() {
    return THEME_MEDIA_QUERY.matches ? DARK_THEME : LIGHT_THEME;
}

function getInitialTheme() {
    return getStoredTheme() || getSystemTheme();
}

function updateThemeToggleUi(theme) {
    document.querySelectorAll('.js-theme-toggle').forEach(button => {
        const isDark = theme === DARK_THEME;
        button.setAttribute('aria-pressed', String(isDark));
        button.setAttribute(
            'aria-label',
            isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
        );
        button.dataset.theme = theme;

        const icon = button.querySelector('i');
        if (icon) {
            icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        }

        const text = button.querySelector('.theme-toggle-text');
        if (text) {
            text.textContent = isDark ? 'Tema claro' : 'Tema oscuro';
        }
    });
}

function updateThemeAwareAssets(theme) {
    const useDarkVariant = theme === DARK_THEME;
    document.querySelectorAll('img[data-logo-light][data-logo-dark]').forEach(image => {
        const nextSource = useDarkVariant
            ? image.dataset.logoDark
            : image.dataset.logoLight;

        if (!nextSource || image.getAttribute('src') === nextSource) {
            return;
        }

        image.setAttribute('src', nextSource);
    });
}

function applyTheme(theme, persist = false) {
    const resolvedTheme = theme === LIGHT_THEME ? LIGHT_THEME : DARK_THEME;
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.style.colorScheme = resolvedTheme;
    updateThemeToggleUi(resolvedTheme);
    updateThemeAwareAssets(resolvedTheme);

    if (!persist) {
        return;
    }

    try {
        localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
    } catch (error) {
        // Ignore blocked storage scenarios.
    }
}

function createThemeToggleButton(className = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `theme-toggle js-theme-toggle ${className}`.trim();
    button.innerHTML = '<i class="fas fa-moon" aria-hidden="true"></i><span class="theme-toggle-text">Tema oscuro</span>';
    return button;
}

function ensureThemeToggleUi() {
    const navIcons = document.querySelector('.nav-icons');
    if (navIcons && !navIcons.querySelector('.js-theme-toggle')) {
        navIcons.appendChild(createThemeToggleButton('theme-toggle-header'));
    }
}

function initThemeToggle() {
    ensureThemeToggleUi();
    applyTheme(getInitialTheme());

    document.querySelectorAll('.js-theme-toggle').forEach(button => {
        button.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') || DARK_THEME;
            const nextTheme = currentTheme === DARK_THEME ? LIGHT_THEME : DARK_THEME;
            applyTheme(nextTheme, true);
        });
    });

    const supportsMqListener = typeof THEME_MEDIA_QUERY.addEventListener === 'function';
    if (supportsMqListener) {
        THEME_MEDIA_QUERY.addEventListener('change', () => {
            if (getStoredTheme()) {
                return;
            }

            applyTheme(getSystemTheme());
        });
    }
}

if (hamburger && navMenu) {
    hamburger.addEventListener('click', () => {
        const shouldOpen = !navMenu.classList.contains('active');
        navMenu.classList.toggle('active', shouldOpen);
        hamburger.classList.toggle('active', shouldOpen);
        if (shouldOpen) {
            closeCart();
        }
        syncUiOverlayState();
    });
}

// Close menu when clicking a link
document.querySelectorAll('.nav-link, .btn-nav').forEach(n => n.addEventListener('click', () => {
    closeMobileMenu();
}));

window.addEventListener('resize', () => {
    if (window.innerWidth > MOBILE_BREAKPOINT) {
        closeMobileMenu();
    } else {
        syncUiOverlayState();
    }
});

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') {
        return;
    }

    closeMobileMenu();
    closeCart();
});

document.addEventListener('click', event => {
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) {
        return;
    }

    if (navMenu?.classList.contains('active')) {
        const clickedInsideMenu = navMenu.contains(eventTarget);
        const clickedHamburger = hamburger?.contains(eventTarget);
        if (!clickedInsideMenu && !clickedHamburger) {
            closeMobileMenu();
        }
    }
});

function setupAccessibleTriggers() {
    const clickableElements = [
        { element: document.querySelector('.cart-icon'), label: 'Abrir carrito' },
        { element: document.querySelector('.hamburger'), label: 'Abrir menu' }
    ];

    clickableElements.forEach(({ element, label }) => {
        if (!element) return;

        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.setAttribute('aria-label', label);
        element.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                element.click();
            }
        });
    });

    const cartCount = document.querySelector('.cart-count');
    if (cartCount) {
        cartCount.setAttribute('aria-live', 'polite');
    }
}


/* --- Scroll Animations (Intersection Observer) --- */
const observerOptions = {
    threshold: 0.15,
    rootMargin: "0px 0px -50px 0px"
};

let revealObserver = null;
const shouldDisableRevealAnimations = typeof window !== 'undefined'
    && window.matchMedia('(max-width: 768px), (prefers-reduced-motion: reduce)').matches;

if (!shouldDisableRevealAnimations && typeof window !== 'undefined' && 'IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                revealObserver.unobserve(entry.target); // Only animate once
            }
        });
    }, observerOptions);
}

function observeRevealElement(element) {
    if (!element) return;

    if (!revealObserver) {
        element.classList.add('active');
        return;
    }

    revealObserver.observe(element);
}

document.querySelectorAll('.reveal').forEach(observeRevealElement);
document.querySelectorAll('.reveal-up').forEach(observeRevealElement);


/* --- Product Catalog --- */
const FALLBACK_STORE_PRODUCTS = [
    {
        id: 1,
        name: 'Escritorio Gamer Pro',
        specs: 'Melamina 18mm, pasacables y led frontal',
        price: 185000,
        image: 'assets/desk_gamer.png',
        category: 'Escritorios',
        stock: 4,
        fulfillmentModel: 'stock',
        availabilityMessage: 'En stock - Envio en 48/72 hs',
        shippingEstimate: '48/72 hs',
        action: 'cart'
    },
    {
        id: 2,
        name: 'Rack TV Minimalista',
        specs: 'Para TV 65\", cajones push-open',
        price: 210000,
        image: 'assets/tv_rack.png',
        category: 'Living',
        stock: 3,
        fulfillmentModel: 'stock',
        availabilityMessage: 'En stock - Envio en 48/72 hs',
        shippingEstimate: '48/72 hs',
        action: 'cart'
    },
    {
        id: 3,
        name: 'Mesa Ratona Industrial',
        specs: 'Estructura de hierro y tapa paraíso',
        price: 95000,
        image: 'assets/coffee_table.png',
        category: 'Living',
        stock: 8,
        fulfillmentModel: 'stock',
        availabilityMessage: 'En stock - Envio en 48/72 hs',
        shippingEstimate: '48/72 hs',
        action: 'cart'
    },
    {
        id: 4,
        name: 'Biblioteca Moderna',
        specs: 'Estantería asimétrica en melamina',
        price: 145000,
        image: 'assets/library.png',
        category: 'Living',
        stock: 0,
        fulfillmentModel: 'made_to_order',
        availabilityMessage: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
        shippingEstimate: '10 a 20 dias habiles',
        action: 'cart'
    },
    {
        id: 5,
        name: 'Vajillero Nórdico',
        specs: 'Módulo de guardado para cocina/comedor',
        price: 230000,
        image: 'assets/sideboard.png',
        category: 'Cocinas',
        stock: 0,
        fulfillmentModel: 'made_to_order',
        availabilityMessage: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
        shippingEstimate: '10 a 20 dias habiles',
        action: 'cart'
    },
    {
        id: 6,
        name: 'Escritorio Home Office',
        specs: 'Diseño compacto con cajonera móvil',
        price: 120000,
        image: 'assets/office_desk.png',
        category: 'Escritorios',
        stock: 6,
        fulfillmentModel: 'stock',
        availabilityMessage: 'En stock - Envio en 48/72 hs',
        shippingEstimate: '48/72 hs',
        action: 'cart'
    },
    {
        id: 7,
        name: 'Gabinete Multiuso',
        specs: 'Guardado versátil para dormitorio o vestidor',
        price: 180000,
        image: 'assets/cabinet.webp',
        category: 'Placards',
        stock: 0,
        fulfillmentModel: 'made_to_order',
        availabilityMessage: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
        shippingEstimate: '10 a 20 dias habiles',
        action: 'cart'
    },
    {
        id: 8,
        name: 'Silla de Diseño',
        specs: 'Ergonómica con estructura reforzada',
        price: 85000,
        image: 'assets/chair.webp',
        category: 'Comedor',
        stock: 12,
        fulfillmentModel: 'stock',
        availabilityMessage: 'En stock - Envio en 48/72 hs',
        shippingEstimate: '48/72 hs',
        action: 'cart'
    },
    {
        id: 9,
        name: 'Mesa Comedor',
        specs: 'Para 6 personas, tapa resistente',
        price: 250000,
        image: 'assets/table.webp',
        category: 'Comedor',
        stock: 0,
        fulfillmentModel: 'made_to_order',
        availabilityMessage: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
        shippingEstimate: '10 a 20 dias habiles',
        action: 'cart'
    },
    {
        id: 10,
        name: 'Mueble TV Flotante',
        specs: 'Diseño aéreo con pasacables oculto',
        price: 200000,
        image: 'assets/tv_unit.webp',
        category: 'Living',
        stock: 0,
        fulfillmentModel: 'made_to_order',
        availabilityMessage: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
        shippingEstimate: '10 a 20 dias habiles',
        action: 'cart'
    },
    {
        id: 11,
        name: 'Escritorio Melamina',
        specs: 'Formato clásico para estudio',
        price: 130000,
        image: 'assets/melamine_desk.webp',
        category: 'Escritorios',
        stock: 7,
        fulfillmentModel: 'stock',
        availabilityMessage: 'En stock - Envio en 48/72 hs',
        shippingEstimate: '48/72 hs',
        action: 'cart'
    }
];

const QUOTE_PRODUCTS = [
    { id: 12, name: 'Cocina Integral', specs: 'Diseño y fabricación a medida', price: 0, image: 'assets/kitchen.webp', action: 'quote' },
    { id: 13, name: 'Placard Vestidor', specs: 'Interior completo / Puertas corredizas', price: 0, image: 'assets/closet.webp', action: 'quote' },
    { id: 14, name: 'Proyecto Living', specs: 'Ambientación completa', price: 0, image: 'assets/11.jpg', action: 'quote' },
    { id: 15, name: 'Dormitorio Principal', specs: 'Cama, mesas de luz y respaldo', price: 0, image: 'assets/12.webp', action: 'quote' },
    { id: 16, name: 'Espacio de Trabajo', specs: 'Oficina en casa personalizada', price: 0, image: 'assets/13.webp', action: 'quote' },
    { id: 17, name: 'Cocina Premium', specs: 'Acabados de lujo', price: 0, image: 'assets/14.webp', action: 'quote' },
    { id: 18, name: 'Estar Diario', specs: 'Confort y diseño', price: 0, image: 'assets/15.webp', action: 'quote' },
    { id: 19, name: 'Comedor Diario', specs: 'Mobiliario integrado', price: 0, image: 'assets/16.webp', action: 'quote' },
    { id: 20, name: 'Recibidor', specs: 'Muebles de entrada', price: 0, image: 'assets/17.webp', action: 'quote' },
    { id: 21, name: 'Living Integrado', specs: 'Soluciones espaciales', price: 0, image: 'assets/18.webp', action: 'quote' },
    { id: 22, name: 'Home Studio', specs: 'Escritorios y bibliotecas', price: 0, image: 'assets/19.webp', action: 'quote' }
];

let products = [...FALLBACK_STORE_PRODUCTS, ...QUOTE_PRODUCTS];

function buildCartProductMap(list) {
    return list
        .filter(product => product.action === 'cart')
        .reduce((acc, product) => {
            acc[product.id] = product;
            return acc;
        }, {});
}

let CART_PRODUCT_MAP = buildCartProductMap(products);

const INITIAL_PRODUCTS_VISIBLE = 12;
let visibleProductsCount = INITIAL_PRODUCTS_VISIBLE;
let activeCatalogFilter = 'all';
const PRODUCT_IMAGE_SIZES = '(max-width: 768px) 92vw, (max-width: 1200px) 45vw, 280px';
const PRODUCT_RESPONSIVE_VARIANTS = {
    cabinet: [360, 640, 960],
    chair: [360, 640, 960],
    coffee_table: [360, 640],
    desk_gamer: [360, 640],
    library: [360, 640],
    melamine_desk: [360, 640, 960],
    office_desk: [360, 640],
    sideboard: [360, 640],
    table: [360, 640, 960],
    tv_rack: [360, 640],
    tv_unit: [360, 640, 960]
};

const SHOP_PAGE_KEYS = new Set(['tienda', 'catalogo']);

function getCurrentPageKey() {
    const bodyPage = String(document.body?.dataset?.page || '').trim().toLowerCase();
    if (bodyPage) {
        return bodyPage;
    }

    const path = String(window.location.pathname || '').toLowerCase();
    const fileName = path.split('/').pop() || 'index.html';
    return fileName.replace('.html', '');
}

function isShopPage() {
    return SHOP_PAGE_KEYS.has(getCurrentPageKey());
}

const DEFAULT_STORE_CONFIG = Object.freeze({
    acceptedPaymentMethods: ['mercadopago', 'bank_transfer', 'cash_pickup'],
    stockMessage: 'En stock - Envio en 48/72 hs',
    madeToOrderMessage: 'Fabricacion bajo pedido - Entrega estimada: 10 a 20 dias habiles',
    warrantyMonths: 12,
    coverage: 'AMBA + interior del pais + retiro en taller'
});

let storeConfig = { ...DEFAULT_STORE_CONFIG };

function normalizeStoreProductFromApi(product) {
    const id = Number.parseInt(product?.id, 10);
    const price = Number.parseInt(product?.price, 10);
    const stock = Math.max(0, Number.parseInt(product?.stock, 10) || 0);
    const fulfillmentModel = String(product?.fulfillmentModel || '').toLowerCase() === 'made_to_order'
        ? 'made_to_order'
        : 'stock';
    const availabilityMessage = String(product?.availabilityMessage || '').trim()
        || (fulfillmentModel === 'made_to_order'
            ? storeConfig.madeToOrderMessage
            : storeConfig.stockMessage);

    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(price) || price < 0) {
        return null;
    }

    return {
        id,
        name: String(product?.name || '').trim(),
        specs: String(product?.specs || '').trim(),
        price,
        image: String(product?.image || '').trim(),
        category: String(product?.category || 'General').trim(),
        stock,
        fulfillmentModel,
        availabilityMessage,
        shippingEstimate: fulfillmentModel === 'made_to_order'
            ? '10 a 20 dias habiles'
            : '48/72 hs',
        weightKg: Number(product?.weightKg || 0),
        volumeM3: Number(product?.volumeM3 || 0),
        action: 'cart'
    };
}

async function loadStoreConfig() {
    try {
        const response = await fetch(buildApiUrl('/api/store/config'), {
            method: 'GET',
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) {
            return;
        }

        const data = await response.json();
        if (!data?.ok || !data?.tienda) {
            return;
        }

        const acceptedPaymentMethods = Array.isArray(data.tienda.acceptedPaymentMethods)
            ? data.tienda.acceptedPaymentMethods
                .map(method => String(method || '').trim().toLowerCase())
                .filter(Boolean)
            : DEFAULT_STORE_CONFIG.acceptedPaymentMethods;

        storeConfig = {
            acceptedPaymentMethods: acceptedPaymentMethods.length > 0
                ? acceptedPaymentMethods
                : DEFAULT_STORE_CONFIG.acceptedPaymentMethods,
            stockMessage: String(data.tienda.stockMessage || DEFAULT_STORE_CONFIG.stockMessage).trim(),
            madeToOrderMessage: String(data.tienda.madeToOrderMessage || DEFAULT_STORE_CONFIG.madeToOrderMessage).trim(),
            warrantyMonths: Number.parseInt(data.tienda.warrantyMonths, 10) || DEFAULT_STORE_CONFIG.warrantyMonths,
            coverage: String(data.tienda.coverage || DEFAULT_STORE_CONFIG.coverage).trim()
        };
    } catch (error) {
        storeConfig = { ...DEFAULT_STORE_CONFIG };
    }
}

async function loadStoreCatalog() {
    try {
        await loadStoreConfig();
        const response = await fetch(buildApiUrl('/api/store/catalog'), {
            method: 'GET',
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) {
            return false;
        }

        const data = await response.json();
        const apiProducts = Array.isArray(data?.products)
            ? data.products
                .map(normalizeStoreProductFromApi)
                .filter(Boolean)
            : [];
        if (apiProducts.length === 0) {
            return false;
        }

        products = [...apiProducts, ...QUOTE_PRODUCTS];
        CART_PRODUCT_MAP = buildCartProductMap(products);
        cart = sanitizeCart(cart);
        persistCart(cart);
        return true;
    } catch (error) {
        return false;
    }
}

function getOptimizedImageBase(imagePath) {
    const imageName = String(imagePath || '')
        .split('/')
        .pop()
        .replace(/\.[a-z0-9]+$/i, '');

    return imageName ? `assets/optimized/${imageName}` : '';
}

function buildResponsiveProductPicture(product) {
    const fallbackImage = String(product.image || '').trim();
    const optimizedBase = getOptimizedImageBase(fallbackImage);
    const imageName = String(fallbackImage || '')
        .split('/')
        .pop()
        .replace(/\.[a-z0-9]+$/i, '');
    const availableVariants = PRODUCT_RESPONSIVE_VARIANTS[imageName];
    if (!fallbackImage || !optimizedBase) {
        return `<img src="${fallbackImage}" alt="${product.name}" loading="lazy" decoding="async" width="1024" height="1024">`;
    }
    if (!Array.isArray(availableVariants) || availableVariants.length === 0) {
        return `<img src="${fallbackImage}" alt="${product.name}" loading="lazy" decoding="async" width="1024" height="1024">`;
    }

    const avifSet = availableVariants
        .map(size => `${optimizedBase}-${size}.avif ${size}w`)
        .join(', ');
    const webpSet = availableVariants
        .map(size => `${optimizedBase}-${size}.webp ${size}w`)
        .join(', ');
    const fallbackOptimized = `${optimizedBase}-${availableVariants[availableVariants.length - 1]}.webp`;

    return `
        <picture>
            <source type="image/avif" srcset="${avifSet}" sizes="${PRODUCT_IMAGE_SIZES}">
            <source type="image/webp" srcset="${webpSet}" sizes="${PRODUCT_IMAGE_SIZES}">
            <img
                src="${fallbackOptimized}"
                alt="${product.name}"
                loading="lazy"
                decoding="async"
                width="1024"
                height="1024"
            >
        </picture>
    `;
}

async function ensureRecaptchaScriptLoaded() {
    if (
        window.grecaptcha
        && typeof window.grecaptcha.render === 'function'
        && typeof window.grecaptcha.getResponse === 'function'
    ) {
        return window.grecaptcha;
    }

    if (!recaptchaScriptLoadPromise) {
        recaptchaScriptLoadPromise = new Promise((resolve, reject) => {
            const existingScript = document.querySelector('script[data-recaptcha="v2"]');
            if (existingScript) {
                existingScript.addEventListener('load', () => resolve(window.grecaptcha), { once: true });
                existingScript.addEventListener('error', () => reject(new Error('No pudimos cargar reCAPTCHA.')), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = RECAPTCHA_V2_SCRIPT_URL;
            script.async = true;
            script.defer = true;
            script.dataset.recaptcha = 'v2';
            script.addEventListener('load', () => resolve(window.grecaptcha), { once: true });
            script.addEventListener('error', () => reject(new Error('No pudimos cargar reCAPTCHA.')), { once: true });
            document.head.appendChild(script);
        });
    }

    const grecaptchaApi = await recaptchaScriptLoadPromise;
    if (
        !grecaptchaApi
        || typeof grecaptchaApi.render !== 'function'
        || typeof grecaptchaApi.getResponse !== 'function'
    ) {
        throw new Error('reCAPTCHA no está disponible en este navegador.');
    }

    return grecaptchaApi;
}

async function ensureRecaptchaWidget(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        return null;
    }

    if (Number.isInteger(recaptchaWidgetIds[containerId])) {
        return recaptchaWidgetIds[containerId];
    }

    const grecaptchaApi = await ensureRecaptchaScriptLoaded();
    const widgetId = grecaptchaApi.render(container, {
        sitekey: RECAPTCHA_V2_SITE_KEY
    });
    recaptchaWidgetIds[containerId] = widgetId;
    return widgetId;
}

function getRecaptchaToken(widgetId) {
    if (!window.grecaptcha || !Number.isInteger(widgetId)) {
        return '';
    }

    return String(window.grecaptcha.getResponse(widgetId) || '').trim();
}

function resetRecaptchaWidget(widgetId) {
    if (!window.grecaptcha || !Number.isInteger(widgetId)) {
        return;
    }

    window.grecaptcha.reset(widgetId);
}

function setContactSubmitInfo(message, type = 'neutral') {
    const submitInfo = document.getElementById('contact-submit-info');
    if (!submitInfo) return;

    submitInfo.textContent = message;
    submitInfo.classList.remove('is-success', 'is-error', 'is-loading');
    if (type === 'success') submitInfo.classList.add('is-success');
    if (type === 'error') submitInfo.classList.add('is-error');
    if (type === 'loading') submitInfo.classList.add('is-loading');
}

function isValidEmailAddress(email) {
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(String(email || '').trim());
}

function setContactSubmittingState(isSubmitting) {
    const submitButton = document.getElementById('contact-submit-btn');
    if (!submitButton) return;

    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting ? 'Enviando…' : 'Solicitar Presupuesto';
}

function initContactFormSubmission() {
    const contactForm = document.getElementById('form-contacto');
    if (!contactForm) return;

    let contactRecaptchaWidgetId = null;
    ensureRecaptchaWidget('contact-recaptcha')
        .then(widgetId => {
            contactRecaptchaWidgetId = widgetId;
        })
        .catch(error => {
            setContactSubmitInfo(error.message || 'No pudimos cargar reCAPTCHA.', 'error');
        });

    let isSubmitting = false;
    contactForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (isSubmitting) return;

        const formData = new FormData(contactForm);
        const email = String(formData.get('email') || '').trim();
        const message = String(formData.get('message') || '').trim();

        if (!isValidEmailAddress(email)) {
            setContactSubmitInfo('Ingresá un email válido.', 'error');
            return;
        }

        if (message.length < 10) {
            setContactSubmitInfo('El mensaje debe tener al menos 10 caracteres.', 'error');
            return;
        }

        isSubmitting = true;
        setContactSubmittingState(true);
        setContactSubmitInfo('Validando reCAPTCHA…', 'loading');

        try {
            if (!Number.isInteger(contactRecaptchaWidgetId)) {
                contactRecaptchaWidgetId = await ensureRecaptchaWidget('contact-recaptcha');
            }

            const recaptchaToken = getRecaptchaToken(contactRecaptchaWidgetId);
            if (!recaptchaToken) {
                setContactSubmitInfo('Completá el reCAPTCHA para continuar.', 'error');
                return;
            }

            const payload = Object.fromEntries(formData.entries());
            payload.recaptchaToken = recaptchaToken;

            setContactSubmitInfo('Enviando…', 'loading');
            const response = await fetch(buildApiUrl('/forms/contacto'), {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            let responsePayload = {};
            try {
                responsePayload = await response.json();
            } catch (error) {
                responsePayload = {};
            }

            if (response.ok && responsePayload.ok === true) {
                contactForm.reset();
                resetRecaptchaWidget(contactRecaptchaWidgetId);
                setContactSubmitInfo('Mensaje enviado correctamente ✅', 'success');
                return;
            }

            const responseError = String(responsePayload?.error || '').trim().toLowerCase();
            if (responseError === 'recaptcha_failed') {
                resetRecaptchaWidget(contactRecaptchaWidgetId);
                setContactSubmitInfo('No pudimos validar el reCAPTCHA. Intentá nuevamente.', 'error');
                return;
            }

            if (responseError === 'recaptcha_not_configured') {
                setContactSubmitInfo('El formulario no está habilitado todavía. Falta configurar reCAPTCHA.', 'error');
                return;
            }

            setContactSubmitInfo(
                String(responsePayload?.error || '').trim() || 'Error al enviar. Intentá nuevamente.',
                'error'
            );
        } catch (error) {
            setContactSubmitInfo(error.message || 'Error al enviar. Intentá nuevamente.', 'error');
            resetRecaptchaWidget(contactRecaptchaWidgetId);
        } finally {
            isSubmitting = false;
            setContactSubmittingState(false);
        }
    });
}

const QUOTE_MAX_FILES_CLIENT = 6;
const QUOTE_MAX_FILE_SIZE_BYTES_CLIENT = 5 * 1024 * 1024;
const QUOTE_ALLOWED_MIME_TYPES_CLIENT = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
]);
const DEFAULT_QUOTE_FILES_HELP = `Podés adjuntar hasta ${QUOTE_MAX_FILES_CLIENT} archivos (JPG, PNG, WEBP o PDF de hasta 5 MB cada uno).`;
let quoteSelectedFiles = [];

function setQuoteSubmitInfo(message, type = 'neutral') {
    const submitInfo = document.getElementById('quote-submit-info');
    if (!submitInfo) return;

    submitInfo.textContent = message;
    submitInfo.classList.remove('is-success', 'is-error', 'is-loading');
    if (type === 'success') submitInfo.classList.add('is-success');
    if (type === 'error') submitInfo.classList.add('is-error');
    if (type === 'loading') submitInfo.classList.add('is-loading');
}

function setQuoteSubmittingState(isSubmitting) {
    const submitButton = document.getElementById('quote-submit-btn');
    if (!submitButton) return;

    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting ? 'Enviando...' : 'Enviar cotización';
}

function formatArPhoneMask(rawValue) {
    const digits = String(rawValue || '').replace(/\D/g, '').slice(0, 13);
    if (!digits) return '';

    let normalized = digits;
    if (normalized.startsWith('54')) normalized = normalized.slice(2);
    if (normalized.startsWith('9')) normalized = normalized.slice(1);

    const areaCode = normalized.slice(0, 2);
    const firstBlock = normalized.slice(2, 6);
    const secondBlock = normalized.slice(6, 10);

    let formatted = '+54 9';
    if (areaCode) formatted += ` ${areaCode}`;
    if (firstBlock) formatted += ` ${firstBlock}`;
    if (secondBlock) formatted += `-${secondBlock}`;
    return formatted.trim();
}

function bindPhoneInputMask(input) {
    if (!input) return;

    input.addEventListener('input', () => {
        const start = input.selectionStart || 0;
        input.value = formatArPhoneMask(input.value);
        input.setSelectionRange(input.value.length, input.value.length);
        if (start === 0) {
            input.setSelectionRange(0, 0);
        }
    });

    input.addEventListener('blur', () => {
        input.value = formatArPhoneMask(input.value);
    });
}

function initPhoneInputMasks() {
    document.querySelectorAll('input[data-inputmask="phone-ar"]').forEach(bindPhoneInputMask);
}

function validateQuoteFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length > QUOTE_MAX_FILES_CLIENT) {
        return `Podés adjuntar hasta ${QUOTE_MAX_FILES_CLIENT} archivos.`;
    }

    for (const file of files) {
        if (!QUOTE_ALLOWED_MIME_TYPES_CLIENT.has(String(file.type || '').toLowerCase())) {
            return 'Formato no permitido. Adjuntá JPG, PNG, WEBP o PDF.';
        }

        if (Number(file.size || 0) > QUOTE_MAX_FILE_SIZE_BYTES_CLIENT) {
            return 'Cada archivo puede pesar hasta 5 MB.';
        }
    }

    return '';
}

function formatQuoteFileSize(fileSizeBytes) {
    const size = Number(fileSizeBytes || 0);
    if (size >= 1024 * 1024) {
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function setQuoteFilesFeedback(message = '', type = 'neutral') {
    const feedback = document.getElementById('quote-files-feedback');
    if (!feedback) return;

    feedback.textContent = message || DEFAULT_QUOTE_FILES_HELP;
    feedback.classList.remove('is-error', 'is-success');
    if (type === 'error') feedback.classList.add('is-error');
    if (type === 'success') feedback.classList.add('is-success');
}

function renderQuoteSelectedFiles() {
    const selectedFilesContainer = document.getElementById('quote-files-selected');
    if (!selectedFilesContainer) return;

    if (quoteSelectedFiles.length === 0) {
        selectedFilesContainer.innerHTML = '';
        setQuoteFilesFeedback(DEFAULT_QUOTE_FILES_HELP, 'neutral');
        return;
    }

    selectedFilesContainer.innerHTML = quoteSelectedFiles.map((file, index) => `
        <div class="quote-files-selected-item">
            <span>${file.name} (${formatQuoteFileSize(file.size)})</span>
            <button type="button" class="quote-file-remove" data-index="${index}" aria-label="Quitar archivo">&times;</button>
        </div>
    `).join('');

    selectedFilesContainer.querySelectorAll('.quote-file-remove').forEach(removeButton => {
        removeButton.addEventListener('click', () => {
            const index = Number.parseInt(removeButton.dataset.index, 10);
            if (!Number.isInteger(index) || index < 0 || index >= quoteSelectedFiles.length) {
                return;
            }

            quoteSelectedFiles.splice(index, 1);
            renderQuoteSelectedFiles();
        });
    });

    setQuoteFilesFeedback(
        `Archivos seleccionados: ${quoteSelectedFiles.length}/${QUOTE_MAX_FILES_CLIENT}.`,
        'success'
    );
}

function isSameQuoteFile(leftFile, rightFile) {
    return (
        String(leftFile?.name || '') === String(rightFile?.name || '')
        && Number(leftFile?.size || 0) === Number(rightFile?.size || 0)
        && Number(leftFile?.lastModified || 0) === Number(rightFile?.lastModified || 0)
    );
}

function mergeQuoteFiles(nextFiles) {
    const normalizedNewFiles = Array.from(nextFiles || []);
    if (normalizedNewFiles.length === 0) {
        return true;
    }

    const mergedFiles = [...quoteSelectedFiles];
    for (const file of normalizedNewFiles) {
        if (!file || typeof file !== 'object') {
            continue;
        }

        const mimeType = String(file.type || '').toLowerCase();
        if (!QUOTE_ALLOWED_MIME_TYPES_CLIENT.has(mimeType)) {
            const message = `El archivo "${file.name}" no está permitido. Usá JPG, PNG, WEBP o PDF.`;
            setQuoteFilesFeedback(message, 'error');
            setQuoteSubmitInfo(message, 'error');
            return false;
        }

        if (Number(file.size || 0) > QUOTE_MAX_FILE_SIZE_BYTES_CLIENT) {
            const message = `El archivo "${file.name}" supera el límite de 5 MB.`;
            setQuoteFilesFeedback(message, 'error');
            setQuoteSubmitInfo(message, 'error');
            return false;
        }

        const alreadyIncluded = mergedFiles.some(currentFile => isSameQuoteFile(currentFile, file));
        if (!alreadyIncluded) {
            mergedFiles.push(file);
        }
    }

    if (mergedFiles.length > QUOTE_MAX_FILES_CLIENT) {
        const message = `Podés adjuntar hasta ${QUOTE_MAX_FILES_CLIENT} archivos.`;
        setQuoteFilesFeedback(message, 'error');
        setQuoteSubmitInfo(message, 'error');
        return false;
    }

    quoteSelectedFiles = mergedFiles;
    renderQuoteSelectedFiles();
    return true;
}

function bindQuoteFilesUi() {
    const dropzone = document.getElementById('quote-dropzone');
    const fileInput = document.getElementById('quote-photos');
    const chooseFilesButton = document.getElementById('quote-files-trigger');

    if (!dropzone || !fileInput || !chooseFilesButton) {
        return;
    }

    const openFilePicker = () => {
        fileInput.click();
    };

    chooseFilesButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openFilePicker();
    });

    dropzone.addEventListener('click', event => {
        if (event.target === chooseFilesButton) {
            return;
        }

        openFilePicker();
    });

    dropzone.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openFilePicker();
        }
    });

    fileInput.addEventListener('change', () => {
        mergeQuoteFiles(Array.from(fileInput.files || []));
        fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, event => {
            event.preventDefault();
            event.stopPropagation();
            dropzone.classList.add('is-dragging');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, event => {
            event.preventDefault();
            event.stopPropagation();
            dropzone.classList.remove('is-dragging');
        });
    });

    dropzone.addEventListener('drop', event => {
        const droppedFiles = Array.from(event.dataTransfer?.files || []);
        mergeQuoteFiles(droppedFiles);
    });

    renderQuoteSelectedFiles();
}

function initQuoteFormSubmission() {
    const quoteForm = document.getElementById('form-medida');
    if (!quoteForm) return;

    quoteSelectedFiles = [];
    bindQuoteFilesUi();
    let quoteRecaptchaWidgetId = null;
    ensureRecaptchaWidget('quote-recaptcha')
        .then(widgetId => {
            quoteRecaptchaWidgetId = widgetId;
        })
        .catch(error => {
            setQuoteSubmitInfo(error.message || 'No pudimos cargar reCAPTCHA.', 'error');
        });

    let isSubmitting = false;
    quoteForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (isSubmitting) return;

        const readOnlyFormData = new FormData(quoteForm);
        const fullName = String(readOnlyFormData.get('fullName') || '').trim();
        const email = String(readOnlyFormData.get('email') || '').trim();
        const phone = String(readOnlyFormData.get('phone') || '').trim();
        const cityNeighborhood = String(readOnlyFormData.get('cityNeighborhood') || '').trim();
        const province = String(readOnlyFormData.get('province') || '').trim();
        const furnitureType = String(readOnlyFormData.get('furnitureType') || '').trim();
        const approximateMeasures = String(readOnlyFormData.get('approximateMeasures') || '').trim();
        const privacyAccepted = String(readOnlyFormData.get('privacyAccepted') || '').trim();
        const filesError = validateQuoteFiles(quoteSelectedFiles);

        if (fullName.length < 2) {
            setQuoteSubmitInfo('Ingresá tu nombre completo.', 'error');
            return;
        }

        if (!isValidEmailAddress(email)) {
            setQuoteSubmitInfo('Ingresá un email válido.', 'error');
            return;
        }

        if (phone.length < 8) {
            setQuoteSubmitInfo('Ingresá un teléfono válido.', 'error');
            return;
        }

        if (cityNeighborhood.length < 2) {
            setQuoteSubmitInfo('Ingresá tu ciudad o barrio.', 'error');
            return;
        }

        if (province.length < 2) {
            setQuoteSubmitInfo('Ingresá tu provincia.', 'error');
            return;
        }

        if (!furnitureType) {
            setQuoteSubmitInfo('Seleccioná el tipo de mueble.', 'error');
            return;
        }

        if (approximateMeasures.length < 5) {
            setQuoteSubmitInfo('Completá las medidas aproximadas para cotizar.', 'error');
            return;
        }

        if (!privacyAccepted) {
            setQuoteSubmitInfo('Debés aceptar la Política de Privacidad.', 'error');
            return;
        }

        if (filesError) {
            setQuoteSubmitInfo(filesError, 'error');
            setQuoteFilesFeedback(filesError, 'error');
            return;
        }

        isSubmitting = true;
        setQuoteSubmittingState(true);
        setQuoteSubmitInfo('Validando reCAPTCHA...', 'loading');

        try {
            if (!Number.isInteger(quoteRecaptchaWidgetId)) {
                quoteRecaptchaWidgetId = await ensureRecaptchaWidget('quote-recaptcha');
            }

            const recaptchaToken = getRecaptchaToken(quoteRecaptchaWidgetId);
            if (!recaptchaToken) {
                setQuoteSubmitInfo('Completá el reCAPTCHA para continuar.', 'error');
                return;
            }

            const payloadFormData = new FormData(quoteForm);
            payloadFormData.delete('photos');
            quoteSelectedFiles.forEach(file => {
                payloadFormData.append('photos', file, file.name);
            });
            payloadFormData.set('recaptchaToken', recaptchaToken);

            setQuoteSubmitInfo('Enviando solicitud de cotización...', 'loading');
            const response = await fetch(buildApiUrl('/forms/medida'), {
                method: 'POST',
                headers: {
                    Accept: 'application/json'
                },
                body: payloadFormData
            });

            let payload = {};
            try {
                payload = await response.json();
            } catch (error) {
                payload = {};
            }

            if (!response.ok || payload?.ok === false) {
                const responseError = String(payload?.error || '').trim().toLowerCase();
                if (responseError === 'recaptcha_failed') {
                    throw new Error('No pudimos validar el reCAPTCHA. Intentá nuevamente.');
                }

                if (responseError === 'recaptcha_not_configured') {
                    throw new Error('El formulario no está habilitado todavía. Falta configurar reCAPTCHA.');
                }

                throw new Error(payload.error || 'No pudimos enviar la solicitud de cotización.');
            }

            quoteForm.reset();
            quoteSelectedFiles = [];
            renderQuoteSelectedFiles();
            resetRecaptchaWidget(quoteRecaptchaWidgetId);
            setQuoteSubmitInfo(
                payload.message || 'Solicitud enviada. Te vamos a contactar dentro de las próximas 24 horas hábiles.',
                'success'
            );
        } catch (error) {
            setQuoteSubmitInfo(error.message || 'No pudimos enviar la solicitud de cotización.', 'error');
            resetRecaptchaWidget(quoteRecaptchaWidgetId);
        } finally {
            isSubmitting = false;
            setQuoteSubmittingState(false);
        }
    });
}

function sanitizeCart(rawCart) {
    if (!Array.isArray(rawCart)) {
        return [];
    }

    return rawCart
        .slice(0, 20)
        .map(item => {
            const id = Number.parseInt(item?.id, 10);
            const quantity = Number.parseInt(item?.quantity, 10);
            const catalogProduct = CART_PRODUCT_MAP[id];

            if (!catalogProduct || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
                return null;
            }

            return {
                id,
                name: catalogProduct.name,
                price: catalogProduct.price,
                image: catalogProduct.image,
                quantity
            };
        })
        .filter(Boolean);
}

function loadStoredCart() {
    try {
        const parsed = JSON.parse(localStorage.getItem('zarpadoCart'));
        return sanitizeCart(parsed || []);
    } catch (error) {
        return [];
    }
}

function persistCart(rawCart) {
    try {
        localStorage.setItem('zarpadoCart', JSON.stringify(rawCart));
    } catch (error) {
        // Storage can be blocked (private mode / strict settings).
    }
}

function renderProducts() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;

    const storeProducts = products.filter(product => product.action === 'cart');
    const filteredProducts = activeCatalogFilter === 'all'
        ? storeProducts
        : storeProducts.filter(product => product.category === activeCatalogFilter);

    const visibleProducts = filteredProducts.slice(0, visibleProductsCount);

    const resultCounter = document.getElementById('catalogFilterResult');
    if (resultCounter) {
        const suffix = filteredProducts.length === 1 ? 'producto' : 'productos';
        const selectedCategory = activeCatalogFilter === 'all' ? 'todas las categorías' : activeCatalogFilter;
        resultCounter.textContent = `Mostrando ${filteredProducts.length} ${suffix} en ${selectedCategory}.`;
    }

    grid.innerHTML = visibleProducts.map((product, index) => {
        const delay = (index % 6) * 0.1;
        const isMadeToOrder = product.fulfillmentModel === 'made_to_order';
        const stockLabel = isMadeToOrder
            ? 'Fabricacion bajo pedido'
            : `En stock - ${Number.parseInt(product.stock, 10) || 0} unidades`;
        const shippingLabel = String(product.availabilityMessage || product.shippingEstimate || '').trim();

        return `
            <div class="product-card reveal" style="transition-delay: ${delay}s;">
                <div class="product-image">
                    ${buildResponsiveProductPicture(product)}
                </div>
                <div class="product-details">
                    <h4 class="product-name">${product.name}</h4>
                    <p class="product-specs">${product.specs}</p>
                    <p class="product-meta"><strong>Categoría:</strong> ${product.category}</p>
                    <p class="product-meta"><strong>Disponibilidad:</strong> ${stockLabel}</p>
                    <p class="product-meta"><strong>Logística:</strong> ${shippingLabel}</p>
                    <span class="product-price">$${product.price.toLocaleString('es-AR')}</span>
                    <button class="btn-add-cart js-add-cart" data-product-id="${product.id}">Agregar al carrito</button>
                </div>
            </div>
        `;
    }).join('');

    bindCatalogActions(grid);
    renderLoadMoreButton(grid, filteredProducts.length);

    setTimeout(() => {
        grid.querySelectorAll('.reveal').forEach(observeRevealElement);
    }, 100);
}

function bindCatalogActions(grid) {
    grid.querySelectorAll('.js-add-cart').forEach(button => {
        button.addEventListener('click', () => {
            addToCart(button.dataset.productId);
        });
    });
}

function renderLoadMoreButton(grid, totalProductsCount) {
    if (!grid?.parentElement) return;

    const previousWrapper = document.getElementById('catalog-load-more');
    if (previousWrapper) {
        previousWrapper.remove();
    }

    if (visibleProductsCount >= totalProductsCount) {
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'catalog-load-more';
    wrapper.className = 'catalog-load-more';
    wrapper.innerHTML = '<button type="button" id="loadMoreProductsBtn" class="btn btn-outline">Ver mas productos</button>';
    grid.parentElement.appendChild(wrapper);

    const loadMoreButton = document.getElementById('loadMoreProductsBtn');
    loadMoreButton?.addEventListener('click', () => {
        visibleProductsCount = Math.min(visibleProductsCount + 8, totalProductsCount);
        renderProducts();
    });
}

function initCatalogFilters() {
    const filterButtons = document.querySelectorAll('.js-catalog-filter');
    if (filterButtons.length === 0) {
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const categoryFromQuery = String(urlParams.get('categoria') || '').trim();
    if (categoryFromQuery) {
        const normalizedCategory = categoryFromQuery.toLowerCase();
        const matchingButton = Array.from(filterButtons).find(button => (
            String(button.dataset.filter || '').toLowerCase() === normalizedCategory
        ));

        if (matchingButton) {
            activeCatalogFilter = String(matchingButton.dataset.filter);
        }
    }

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            const nextFilter = String(button.dataset.filter || 'all');
            activeCatalogFilter = nextFilter;
            visibleProductsCount = INITIAL_PRODUCTS_VISIBLE;

            filterButtons.forEach(item => {
                const isActive = item.dataset.filter === nextFilter;
                item.classList.toggle('active', isActive);
                item.setAttribute('aria-pressed', String(isActive));
            });

            renderProducts();
        });
    });

    filterButtons.forEach(item => {
        const isActive = item.dataset.filter === activeCatalogFilter;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-pressed', String(isActive));
    });
}

function bindStaticAddToCartButtons() {
    document.querySelectorAll('.js-static-add-to-cart').forEach(button => {
        button.addEventListener('click', () => {
            addToCart(button.dataset.productId);
        });
    });
}

function bindCommonUiActions() {
    document.querySelectorAll('.js-toggle-cart').forEach(element => {
        element.addEventListener('click', toggleCart);
    });

    document.querySelectorAll('.js-checkout').forEach(button => {
        button.addEventListener('click', checkout);
    });

    document.querySelectorAll('.js-close-notification').forEach(button => {
        button.addEventListener('click', closeNotification);
    });

    document.querySelectorAll('.js-feature-link').forEach(card => {
        const href = card.dataset.href;
        if (!href) return;

        card.setAttribute('role', 'link');
        card.setAttribute('tabindex', '0');
        card.addEventListener('click', () => {
            window.location.href = href;
        });
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                window.location.href = href;
            }
        });
    });
}

function injectDeliveryPolicyPanel() {
    const pageKey = String(document.body?.dataset?.page || '').trim().toLowerCase();
    const pathname = String(window.location.pathname || '').toLowerCase();
    const isTiendaOrAMedida = (
        pageKey === 'tienda'
        || pageKey === 'amedida'
        || pathname === '/tienda'
        || pathname.startsWith('/tienda/')
        || pathname === '/a-medida'
        || pathname.endsWith('/tienda.html')
        || pathname.endsWith('/a-medida.html')
        || pathname.endsWith('/catalogo.html')
    );

    if (!isTiendaOrAMedida) {
        return;
    }

    if (document.getElementById('delivery-policy-panel')) {
        return;
    }

    const footer = document.querySelector('.footer');
    if (!footer) {
        return;
    }

    const section = document.createElement('section');
    section.className = 'section delivery-policy-section';
    section.id = 'delivery-policy-panel';
    section.innerHTML = `
        <div class="container">
            <div class="delivery-policy-panel reveal">
                <span class="section-tag">Logística</span>
                <h2 class="section-title">Envíos, instalación y retiro</h2>
                <ul class="delivery-policy-list">
                    <li>Envíos a todo el país a la dirección brindada por el cliente.</li>
                    <li>Instalación solo en Buenos Aires y sujeta a disponibilidad de zona (consultar por CP).</li>
                    <li>Retiro por fábrica: Salto 850, Francisco Álvarez, Moreno, Buenos Aires (con flete propio).</li>
                    <li>Instalación base desde $200.000 (traslado + colocación simple). Trabajos complejos se cotizan aparte.</li>
                </ul>
            </div>
        </div>
    `;

    footer.parentNode.insertBefore(section, footer);
    section.querySelectorAll('.reveal').forEach(observeRevealElement);
}

function formatArs(amount) {
    return `$${Number(amount || 0).toLocaleString('es-AR')}`;
}

const DELIVERY_METHOD_SHIPPING = 'shipping';
const DELIVERY_METHOD_PICKUP = 'pickup';
const PAYMENT_METHOD_MERCADOPAGO = 'mercadopago';
const PAYMENT_METHOD_BANK_TRANSFER = 'bank_transfer';
const PAYMENT_METHOD_CASH_PICKUP = 'cash_pickup';
const PAYMENT_METHOD_LABELS = Object.freeze({
    [PAYMENT_METHOD_MERCADOPAGO]: 'Mercado Pago',
    [PAYMENT_METHOD_BANK_TRANSFER]: 'Transferencia bancaria',
    [PAYMENT_METHOD_CASH_PICKUP]: 'Efectivo en retiro'
});
const DEFAULT_DELIVERY_CONFIG = Object.freeze({
    installationBaseCost: 200000,
    installationComplexNotice: 'Instalaciones complejas se cotizan aparte.',
    unsupportedPostalCodeMessage: 'No podemos calcular el envío automáticamente para tu CP. Contactanos para cotización.',
    factoryPickupAddress: 'Salto 850, Francisco Álvarez, Moreno, Buenos Aires',
    factoryPickupNote: 'Retiro sin costo. El cliente debe venir con su flete propio. Se entrega el mueble en fábrica.',
    installationZoneLabel: 'Buenos Aires (zonas seleccionadas)'
});

let cart = loadStoredCart();
const cartItemsContainer = document.getElementById('cartItems');
const cartTotalElement = document.getElementById('cartTotal');
const cartCountElement = document.querySelector('.cart-count');
let deliveryConfig = { ...DEFAULT_DELIVERY_CONFIG };
let shippingQuoteDebounceId = null;
let lastShippingQuoteKey = '';
let shippingQuoteRequestSequence = 0;
let deliveryPanelOpen = false;
const deliveryState = {
    method: DELIVERY_METHOD_SHIPPING,
    postalCode: '',
    shippingCost: 0,
    shippingLabel: '',
    shippingReady: false,
    shippingLoading: false,
    shippingError: '',
    installationAvailable: false,
    installationSelected: false,
    paymentMethod: PAYMENT_METHOD_MERCADOPAGO,
    buyerEmail: ''
};

function buildShippingQuoteKey(postalCode = deliveryState.postalCode) {
    const normalizedPostalCode = String(postalCode || '').trim();
    const cartSignature = cart
        .map(item => `${Number.parseInt(item.id, 10)}:${Number.parseInt(item.quantity, 10)}`)
        .filter(Boolean)
        .sort()
        .join('|');

    return `${normalizedPostalCode}::${cartSignature}`;
}

function getDeliveryInputRefs() {
    return {
        methodInputs: document.querySelectorAll('input[name="delivery-method"]'),
        postalCodeInput: document.getElementById('delivery-postal-code'),
        shippingControls: document.getElementById('delivery-shipping-controls'),
        pickupInfo: document.getElementById('delivery-pickup-info'),
        quoteMessage: document.getElementById('delivery-quote-message'),
        installationWrap: document.getElementById('delivery-installation-wrap'),
        installationCheckbox: document.getElementById('delivery-installation'),
        installationUnavailable: document.getElementById('delivery-installation-unavailable'),
        installationLabel: document.getElementById('delivery-installation-label'),
        installationNote: document.getElementById('delivery-installation-note'),
        compactSummary: document.getElementById('delivery-compact-summary'),
        configPanel: document.getElementById('delivery-config-panel'),
        configToggle: document.getElementById('delivery-config-toggle'),
        checkoutMessage: document.getElementById('delivery-checkout-message'),
        paymentMethodSelect: document.getElementById('delivery-payment-method'),
        buyerEmailInput: document.getElementById('delivery-buyer-email'),
        paymentMethodNote: document.getElementById('delivery-payment-note'),
        subtotalValue: document.getElementById('cartSubtotal'),
        shippingValue: document.getElementById('cartShippingValue'),
        installationRow: document.getElementById('cartInstallationRow'),
        installationValue: document.getElementById('cartInstallationValue')
    };
}

function getCostBreakdown() {
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const shipping = deliveryState.method === DELIVERY_METHOD_PICKUP
        ? 0
        : (deliveryState.shippingReady ? deliveryState.shippingCost : 0);
    const installation = (
        deliveryState.method === DELIVERY_METHOD_SHIPPING
        && deliveryState.installationSelected
        && deliveryState.installationAvailable
    )
        ? deliveryConfig.installationBaseCost
        : 0;

    return {
        subtotal,
        shipping,
        installation,
        total: subtotal + shipping + installation
    };
}

function getDeliveryCompactSummary() {
    if (deliveryState.method === DELIVERY_METHOD_PICKUP) {
        return 'Retiro por fábrica (sin costo de envío).';
    }

    if (deliveryState.shippingLoading) {
        return 'Envío a domicilio · calculando costo...';
    }

    if (deliveryState.shippingReady) {
        const installationText = (
            deliveryState.installationSelected
            && deliveryState.installationAvailable
        )
            ? ` + instalación ${formatArs(deliveryConfig.installationBaseCost)}`
            : '';
        return `Envío ${deliveryState.shippingLabel}: ${formatArs(deliveryState.shippingCost)}${installationText}`;
    }

    if (deliveryState.shippingError) {
        return deliveryState.shippingError;
    }

    return 'Completá el CP para calcular el envío.';
}

function setDeliveryPanelOpen(isOpen) {
    const shouldOpen = Boolean(isOpen);
    deliveryPanelOpen = shouldOpen;

    const refs = getDeliveryInputRefs();
    if (refs.configPanel) {
        refs.configPanel.hidden = !shouldOpen;
    }

    if (refs.configToggle) {
        refs.configToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        refs.configToggle.textContent = shouldOpen ? 'Ocultar' : 'Configurar';
    }

    const checkoutBox = document.getElementById('delivery-checkout-box');
    if (checkoutBox) {
        checkoutBox.classList.toggle('is-expanded', shouldOpen);
    }
}

function getCheckoutValidation() {
    if (cart.length === 0) {
        return { ok: false, message: 'El carrito está vacío. Agregá al menos un producto para continuar.' };
    }

    if (deliveryState.method === DELIVERY_METHOD_PICKUP) {
        return { ok: true, message: '' };
    }

    if (deliveryState.shippingLoading) {
        return { ok: false, message: 'Estamos calculando tu envío. Esperá unos segundos.' };
    }

    if (deliveryState.postalCode.length < 4) {
        return { ok: false, message: 'Ingresá el código postal o elegí retiro por fábrica para continuar.' };
    }

    if (deliveryState.shippingError) {
        return { ok: false, message: deliveryState.shippingError };
    }

    if (!deliveryState.shippingReady) {
        return { ok: false, message: 'Necesitamos validar el envío antes de continuar.' };
    }

    return { ok: true, message: '' };
}

function updateCheckoutButtonsState() {
    const validation = getCheckoutValidation();
    const refs = getDeliveryInputRefs();

    document.querySelectorAll('.js-checkout').forEach(button => {
        button.disabled = !validation.ok;
    });

    if (refs.checkoutMessage) {
        refs.checkoutMessage.textContent = validation.message;
        refs.checkoutMessage.classList.toggle('is-error', !validation.ok && validation.message.length > 0);
    }
}

function updateTotalsUi() {
    const breakdown = getCostBreakdown();
    const refs = getDeliveryInputRefs();

    if (refs.subtotalValue) {
        refs.subtotalValue.textContent = formatArs(breakdown.subtotal);
    }

    if (refs.shippingValue) {
        if (deliveryState.method === DELIVERY_METHOD_PICKUP) {
            refs.shippingValue.textContent = formatArs(0);
        } else if (deliveryState.shippingLoading) {
            refs.shippingValue.textContent = 'Calculando...';
        } else if (deliveryState.shippingReady) {
            refs.shippingValue.textContent = formatArs(breakdown.shipping);
        } else if (deliveryState.postalCode.length < 4) {
            refs.shippingValue.textContent = 'Ingresá CP';
        } else {
            refs.shippingValue.textContent = 'A cotizar';
        }
    }

    if (refs.installationRow && refs.installationValue) {
        const showInstallationRow = breakdown.installation > 0;
        refs.installationRow.hidden = !showInstallationRow;
        refs.installationValue.textContent = formatArs(breakdown.installation);
    }

    if (cartTotalElement) {
        cartTotalElement.textContent = formatArs(breakdown.total);
    }

    updateCheckoutButtonsState();
}

function updateDeliveryUi() {
    const refs = getDeliveryInputRefs();
    if (refs.shippingControls) {
        refs.shippingControls.hidden = deliveryState.method !== DELIVERY_METHOD_SHIPPING;
    }

    if (refs.pickupInfo) {
        refs.pickupInfo.hidden = deliveryState.method !== DELIVERY_METHOD_PICKUP;
        refs.pickupInfo.textContent = `${deliveryConfig.factoryPickupAddress}. ${deliveryConfig.factoryPickupNote}`;
    }

    if (refs.postalCodeInput && refs.postalCodeInput.value !== deliveryState.postalCode) {
        refs.postalCodeInput.value = deliveryState.postalCode;
    }

    if (refs.paymentMethodSelect) {
        const acceptedPaymentMethods = Array.isArray(storeConfig.acceptedPaymentMethods)
            ? storeConfig.acceptedPaymentMethods
            : DEFAULT_STORE_CONFIG.acceptedPaymentMethods;

        Array.from(refs.paymentMethodSelect.options).forEach(option => {
            const allowed = acceptedPaymentMethods.includes(option.value);
            option.hidden = !allowed;
            option.disabled = !allowed;
        });

        if (!acceptedPaymentMethods.includes(deliveryState.paymentMethod)) {
            deliveryState.paymentMethod = acceptedPaymentMethods[0] || PAYMENT_METHOD_MERCADOPAGO;
        }

        if (refs.paymentMethodSelect.value !== deliveryState.paymentMethod) {
            refs.paymentMethodSelect.value = deliveryState.paymentMethod;
        }
    }

    if (refs.buyerEmailInput && refs.buyerEmailInput.value !== deliveryState.buyerEmail) {
        refs.buyerEmailInput.value = deliveryState.buyerEmail;
    }

    if (refs.paymentMethodNote) {
        const paymentLabel = PAYMENT_METHOD_LABELS[deliveryState.paymentMethod] || 'Medio de pago';
        if (deliveryState.paymentMethod === PAYMENT_METHOD_BANK_TRANSFER) {
            refs.paymentMethodNote.textContent = `${paymentLabel}: el pedido queda pendiente hasta confirmar acreditación.`;
        } else if (deliveryState.paymentMethod === PAYMENT_METHOD_CASH_PICKUP) {
            refs.paymentMethodNote.textContent = `${paymentLabel}: disponible solo para retiro en taller.`;
        } else {
            refs.paymentMethodNote.textContent = `${paymentLabel}: confirmación automática al acreditarse el pago.`;
        }
    }

    if (refs.installationWrap) {
        const shouldShowInstallation = deliveryState.method === DELIVERY_METHOD_SHIPPING
            && deliveryState.shippingReady
            && deliveryState.installationAvailable;
        refs.installationWrap.hidden = !shouldShowInstallation;
    }

    if (refs.installationCheckbox) {
        refs.installationCheckbox.checked = deliveryState.installationSelected;
    }

    if (refs.installationLabel) {
        refs.installationLabel.textContent = `Agregar instalación (${formatArs(deliveryConfig.installationBaseCost)} base)`;
    }

    if (refs.installationNote) {
        refs.installationNote.textContent = `${deliveryConfig.installationZoneLabel}. ${deliveryConfig.installationComplexNotice}`;
    }

    if (refs.installationUnavailable) {
        const showUnavailableMessage = (
            deliveryState.method === DELIVERY_METHOD_SHIPPING
            && deliveryState.shippingReady
            && !deliveryState.installationAvailable
        );
        refs.installationUnavailable.hidden = !showUnavailableMessage;
        refs.installationUnavailable.textContent = showUnavailableMessage
            ? 'Instalación no disponible en tu zona. Podés continuar con envío sin instalación o retiro por fábrica.'
            : '';
    }

    if (refs.compactSummary) {
        refs.compactSummary.textContent = getDeliveryCompactSummary();
        refs.compactSummary.classList.toggle(
            'is-error',
            Boolean(deliveryState.shippingError)
        );
    }

    if (refs.quoteMessage) {
        if (deliveryState.method === DELIVERY_METHOD_PICKUP) {
            refs.quoteMessage.textContent = 'Retiro por fábrica sin costo de envío.';
            refs.quoteMessage.classList.remove('is-error');
        } else if (deliveryState.shippingLoading) {
            refs.quoteMessage.textContent = 'Calculando costo de envío...';
            refs.quoteMessage.classList.remove('is-error');
        } else if (deliveryState.shippingReady) {
            refs.quoteMessage.textContent = `Envío ${deliveryState.shippingLabel}: ${formatArs(deliveryState.shippingCost)}`;
            refs.quoteMessage.classList.remove('is-error');
        } else if (deliveryState.shippingError) {
            refs.quoteMessage.textContent = deliveryState.shippingError;
            refs.quoteMessage.classList.add('is-error');
        } else {
            refs.quoteMessage.textContent = 'Ingresá tu código postal para calcular el envío.';
            refs.quoteMessage.classList.remove('is-error');
        }
    }

    refs.methodInputs.forEach(input => {
        input.checked = input.value === deliveryState.method;
    });

    updateTotalsUi();

    const quoteKey = buildShippingQuoteKey();
    const shouldRequestShippingQuote = (
        deliveryState.method === DELIVERY_METHOD_SHIPPING
        && deliveryState.postalCode.length === 4
        && !deliveryState.shippingLoading
        && !deliveryState.shippingError
        && (!deliveryState.shippingReady || lastShippingQuoteKey !== quoteKey)
    );

    if (
        shouldRequestShippingQuote
    ) {
        if (shippingQuoteDebounceId) {
            clearTimeout(shippingQuoteDebounceId);
        }

        shippingQuoteDebounceId = setTimeout(() => {
            shippingQuoteDebounceId = null;
            requestShippingQuote(deliveryState.postalCode);
        }, 250);
    }
}

function resetShippingState() {
    deliveryState.shippingCost = 0;
    deliveryState.shippingLabel = '';
    deliveryState.shippingReady = false;
    deliveryState.shippingLoading = false;
    deliveryState.shippingError = '';
    deliveryState.installationAvailable = false;
    deliveryState.installationSelected = false;
    lastShippingQuoteKey = '';
}

async function loadDeliveryOptions() {
    try {
        const response = await fetch(buildApiUrl('/api/delivery/options'), {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'include'
        });

        if (!response.ok) {
            return;
        }

        const data = await response.json();
        deliveryConfig = {
            installationBaseCost: Number.parseInt(data.installationBaseCost, 10) || DEFAULT_DELIVERY_CONFIG.installationBaseCost,
            installationComplexNotice: String(data.installationComplexNotice || DEFAULT_DELIVERY_CONFIG.installationComplexNotice),
            unsupportedPostalCodeMessage: String(data.unsupportedPostalCodeMessage || DEFAULT_DELIVERY_CONFIG.unsupportedPostalCodeMessage),
            factoryPickupAddress: String(data.factoryPickup?.address || DEFAULT_DELIVERY_CONFIG.factoryPickupAddress),
            factoryPickupNote: String(data.factoryPickup?.note || DEFAULT_DELIVERY_CONFIG.factoryPickupNote),
            installationZoneLabel: String(data.installationZonesLabel || DEFAULT_DELIVERY_CONFIG.installationZoneLabel)
        };
    } catch (error) {
        deliveryConfig = { ...DEFAULT_DELIVERY_CONFIG };
    }

    updateDeliveryUi();
}

async function requestShippingQuote(postalCode) {
    const normalizedPostalCode = String(postalCode || '').trim();
    const quoteKey = buildShippingQuoteKey(normalizedPostalCode);
    const requestSequence = ++shippingQuoteRequestSequence;

    deliveryState.shippingLoading = true;
    deliveryState.shippingError = '';
    deliveryState.shippingReady = false;
    deliveryState.installationSelected = false;
    updateDeliveryUi();

    try {
        const items = cart.map(item => ({
            id: item.id,
            quantity: item.quantity
        }));
        const response = await fetch(buildApiUrl('/api/delivery/quote'), {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                postalCode,
                items
            })
        });

        const data = await response.json();
        if (requestSequence !== shippingQuoteRequestSequence) {
            return;
        }

        if (!response.ok) {
            deliveryState.shippingError = String(data.error || deliveryConfig.unsupportedPostalCodeMessage);
            deliveryState.shippingCost = 0;
            deliveryState.shippingLabel = '';
            deliveryState.shippingReady = false;
            deliveryState.installationAvailable = false;
            return;
        }

        deliveryState.shippingCost = Number.parseInt(data.shippingCost, 10) || 0;
        deliveryState.shippingLabel = String(data.shippingLabel || 'Envío a domicilio');
        deliveryState.shippingReady = true;
        deliveryState.shippingError = '';
        deliveryState.installationAvailable = Boolean(data.installationAvailable);
        lastShippingQuoteKey = quoteKey;
        deliveryConfig.installationBaseCost = Number.parseInt(data.installationBaseCost, 10) || deliveryConfig.installationBaseCost;
        deliveryConfig.installationComplexNotice = String(
            data.installationComplexNotice || deliveryConfig.installationComplexNotice
        );
    } catch (error) {
        if (requestSequence !== shippingQuoteRequestSequence) {
            return;
        }

        deliveryState.shippingError = 'No pudimos calcular el envío en este momento. Intentá nuevamente.';
        deliveryState.shippingReady = false;
    } finally {
        if (requestSequence !== shippingQuoteRequestSequence) {
            return;
        }

        deliveryState.shippingLoading = false;
        updateDeliveryUi();
    }
}

function bindDeliveryUiActions() {
    const refs = getDeliveryInputRefs();

    refs.configToggle?.addEventListener('click', () => {
        setDeliveryPanelOpen(!deliveryPanelOpen);
    });

    refs.methodInputs.forEach(input => {
        input.addEventListener('change', () => {
            deliveryState.method = input.value;

            if (
                deliveryState.method === DELIVERY_METHOD_SHIPPING
                && deliveryState.paymentMethod === PAYMENT_METHOD_CASH_PICKUP
            ) {
                const acceptedPaymentMethods = Array.isArray(storeConfig.acceptedPaymentMethods)
                    ? storeConfig.acceptedPaymentMethods
                    : DEFAULT_STORE_CONFIG.acceptedPaymentMethods;
                deliveryState.paymentMethod = acceptedPaymentMethods.includes(PAYMENT_METHOD_MERCADOPAGO)
                    ? PAYMENT_METHOD_MERCADOPAGO
                    : (acceptedPaymentMethods[0] || PAYMENT_METHOD_MERCADOPAGO);
            }

            if (deliveryState.method === DELIVERY_METHOD_PICKUP) {
                resetShippingState();
                updateDeliveryUi();
                return;
            }

            resetShippingState();
            if (deliveryState.postalCode.length === 4) {
                requestShippingQuote(deliveryState.postalCode);
            } else {
                updateDeliveryUi();
            }
        });
    });

    refs.postalCodeInput?.addEventListener('input', () => {
        const normalizedPostalCode = refs.postalCodeInput.value.replace(/\D/g, '').slice(0, 4);
        refs.postalCodeInput.value = normalizedPostalCode;
        deliveryState.postalCode = normalizedPostalCode;
        resetShippingState();

        if (shippingQuoteDebounceId) {
            clearTimeout(shippingQuoteDebounceId);
            shippingQuoteDebounceId = null;
        }

        if (normalizedPostalCode.length < 4) {
            updateDeliveryUi();
            return;
        }

        shippingQuoteDebounceId = setTimeout(() => {
            shippingQuoteDebounceId = null;
            requestShippingQuote(normalizedPostalCode);
        }, 350);
    });

    refs.installationCheckbox?.addEventListener('change', () => {
        deliveryState.installationSelected = refs.installationCheckbox.checked;
        updateDeliveryUi();
    });

    refs.paymentMethodSelect?.addEventListener('change', () => {
        const selected = String(refs.paymentMethodSelect.value || PAYMENT_METHOD_MERCADOPAGO);
        const acceptedPaymentMethods = Array.isArray(storeConfig.acceptedPaymentMethods)
            ? storeConfig.acceptedPaymentMethods
            : DEFAULT_STORE_CONFIG.acceptedPaymentMethods;
        deliveryState.paymentMethod = acceptedPaymentMethods.includes(selected)
            ? selected
            : PAYMENT_METHOD_MERCADOPAGO;

        if (
            deliveryState.paymentMethod === PAYMENT_METHOD_CASH_PICKUP
            && deliveryState.method !== DELIVERY_METHOD_PICKUP
        ) {
            deliveryState.method = DELIVERY_METHOD_PICKUP;
            resetShippingState();
        }

        updateDeliveryUi();
    });

    refs.buyerEmailInput?.addEventListener('input', () => {
        deliveryState.buyerEmail = String(refs.buyerEmailInput.value || '').trim();
        updateCheckoutButtonsState();
    });
}

function ensureDeliveryCheckoutUi() {
    const cartFooter = document.querySelector('.cart-footer');
    if (!cartFooter || document.getElementById('delivery-checkout-box')) {
        return;
    }

    const checkoutBox = document.createElement('div');
    checkoutBox.id = 'delivery-checkout-box';
    checkoutBox.className = 'delivery-checkout-box';
    checkoutBox.innerHTML = `
        <h4 class="delivery-checkout-title">Entrega</h4>
        <div class="delivery-checkout-head">
            <p id="delivery-compact-summary" class="delivery-compact-summary">Completá el CP para calcular el envío.</p>
            <button
                id="delivery-config-toggle"
                class="delivery-config-toggle"
                type="button"
                aria-expanded="false"
                aria-controls="delivery-config-panel"
            >
                Configurar
            </button>
        </div>
        <div id="delivery-config-panel" class="delivery-config-panel" hidden>
            <div class="delivery-methods">
                <label class="delivery-option">
                    <input type="radio" name="delivery-method" value="shipping" checked>
                    <span>Envío a domicilio</span>
                </label>
                <label class="delivery-option">
                    <input type="radio" name="delivery-method" value="pickup">
                    <span>Retiro por fábrica</span>
                </label>
            </div>
            <div id="delivery-shipping-controls" class="delivery-shipping-controls">
                <label for="delivery-postal-code">Código Postal</label>
                <input id="delivery-postal-code" type="text" inputmode="numeric" autocomplete="postal-code" placeholder="Ej: 1746" maxlength="4">
                <p id="delivery-quote-message" class="delivery-help-message">Ingresá tu código postal para calcular el envío.</p>
            </div>
            <p id="delivery-pickup-info" class="delivery-help-message" hidden></p>
            <div id="delivery-installation-wrap" class="delivery-installation-wrap" hidden>
                <label class="delivery-option">
                    <input id="delivery-installation" type="checkbox">
                    <span id="delivery-installation-label"></span>
                </label>
                <p id="delivery-installation-note" class="delivery-help-message"></p>
            </div>
            <p id="delivery-installation-unavailable" class="delivery-help-message is-error" hidden></p>
            <div class="delivery-payment-box">
                <label for="delivery-payment-method">Medio de pago</label>
                <select id="delivery-payment-method" class="form-input">
                    <option value="mercadopago">Mercado Pago</option>
                    <option value="bank_transfer">Transferencia bancaria</option>
                    <option value="cash_pickup">Efectivo en retiro</option>
                </select>
                <label for="delivery-buyer-email" style="margin-top: 0.65rem;">Email para confirmaciones</label>
                <input id="delivery-buyer-email" class="form-input" type="email" inputmode="email" autocomplete="email" placeholder="tuemail@dominio.com">
                <p id="delivery-payment-note" class="delivery-help-message"></p>
            </div>
            <div class="cart-breakdown" id="cart-breakdown">
                <div class="cart-breakdown-row">
                    <span>Subtotal</span>
                    <span id="cartSubtotal">${formatArs(0)}</span>
                </div>
                <div class="cart-breakdown-row">
                    <span>Envío</span>
                    <span id="cartShippingValue">Ingresá CP</span>
                </div>
                <div class="cart-breakdown-row" id="cartInstallationRow" hidden>
                    <span>Instalación (base)</span>
                    <span id="cartInstallationValue">${formatArs(0)}</span>
                </div>
            </div>
        </div>
        <p id="delivery-checkout-message" class="delivery-help-message is-error"></p>
    `;

    const totalRow = cartFooter.querySelector('.cart-total-row');
    if (totalRow) {
        const totalLabel = totalRow.querySelector('span');
        if (totalLabel) {
            totalLabel.textContent = 'Total final:';
        }
        cartFooter.insertBefore(checkoutBox, totalRow);
    } else {
        cartFooter.prepend(checkoutBox);
    }

    bindDeliveryUiActions();
    setDeliveryPanelOpen(false);
    updateDeliveryUi();
}

function buildDeliveryPayload() {
    if (deliveryState.method === DELIVERY_METHOD_PICKUP) {
        return {
            method: DELIVERY_METHOD_PICKUP,
            postalCode: null,
            installationRequested: false
        };
    }

    return {
        method: DELIVERY_METHOD_SHIPPING,
        postalCode: deliveryState.postalCode,
        installationRequested: deliveryState.installationSelected
    };
}

function toggleCart() {
    if (!cartSidebar) return;

    const shouldOpen = !cartSidebar.classList.contains('open');
    if (shouldOpen) {
        closeMobileMenu();
    }

    setCartOpenState(shouldOpen);
}

function addToCart(id) {
    const product = CART_PRODUCT_MAP[Number.parseInt(id, 10)];
    if (!product) {
        return;
    }

    const existingItem = cart.find(item => item.id === product.id);

    if (existingItem) {
        existingItem.quantity = Math.min(existingItem.quantity + 1, 10);
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            quantity: 1
        });
    }

    updateCart();
    showAddedNotification(product.name);
}

function showAddedNotification(productName) {
    let notification = document.getElementById('added-notification');

    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'added-notification';
        notification.className = 'added-notification';
        notification.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <p></p>
        `;
        document.body.appendChild(notification);
    }

    const textElement = notification.querySelector('p');
    textElement.textContent = `Agregaste ${productName} al carrito`;

    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3500);
}

function removeFromCart(id) {
    const numericId = Number.parseInt(id, 10);
    cart = cart.filter(item => item.id !== numericId);
    updateCart();
}

function updateQuantity(id, change) {
    const numericId = Number.parseInt(id, 10);
    const item = cart.find(cartItem => cartItem.id === numericId);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(numericId);
        } else if (item.quantity > 10) {
            item.quantity = 10;
            updateCart();
        } else {
            updateCart();
        }
    }
}

function updateCart() {
    const cartWasOpen = Boolean(cartSidebar?.classList.contains('open'));
    cart = sanitizeCart(cart);
    persistCart(cart);

    const totalCount = cart.reduce((acc, item) => acc + item.quantity, 0);
    if (cartCountElement) {
        cartCountElement.textContent = totalCount;
    }

    if (cartItemsContainer) {
        cartItemsContainer.innerHTML = '';

        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<p style="text-align:center; color: #888; margin-top: 2rem;">El carrito está vacío.</p>';
        } else {
            cart.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.classList.add('cart-item');
                itemEl.innerHTML = `
                    <img src="${item.image}" alt="${item.name}">
                    <div style="flex:1;">
                        <h4 style="font-size: 0.9rem; margin-bottom: 4px;">${item.name}</h4>
                        <p style="color: var(--color-accent); font-size: 0.85rem;">${formatArs(item.price)}</p>
                        <div style="display: flex; align-items: center; gap: 10px; margin-top: 5px;">
                            <button type="button" data-action="decrease" data-product-id="${item.id}" style="width: 20px; height: 20px; background:#333; color:#fff; border:none; cursor:pointer;">-</button>
                            <span style="font-size: 0.9rem;">${item.quantity}</span>
                            <button type="button" data-action="increase" data-product-id="${item.id}" style="width: 20px; height: 20px; background:#333; color:#fff; border:none; cursor:pointer;">+</button>
                        </div>
                    </div>
                    <button type="button" data-action="remove" data-product-id="${item.id}" style="background:none; border:none; color: #888; cursor:pointer; font-size: 1.2rem;">&times;</button>
                `;

                itemEl.querySelector('[data-action="decrease"]')?.addEventListener('click', () => {
                    updateQuantity(item.id, -1);
                });
                itemEl.querySelector('[data-action="increase"]')?.addEventListener('click', () => {
                    updateQuantity(item.id, 1);
                });
                itemEl.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
                    removeFromCart(item.id);
                });
                cartItemsContainer.appendChild(itemEl);
            });
        }
    }

    updateTotalsUi();

    if (
        deliveryState.method === DELIVERY_METHOD_SHIPPING
        && deliveryState.postalCode.length === 4
        && !deliveryState.shippingLoading
    ) {
        updateDeliveryUi();
    }

    if (cartWasOpen) {
        setCartOpenState(true);
    }
}

async function checkout(currentEvent = null) {
    const checkoutValidation = getCheckoutValidation();
    if (!checkoutValidation.ok) {
        alert(checkoutValidation.message || 'Revisá los datos de entrega antes de continuar.');
        return;
    }

    let checkoutButton = null;
    let originalText = '';

    try {
        cart = sanitizeCart(cart);
        if (cart.length === 0) {
            alert('El carrito está vacío');
            return;
        }

        const runtimeEvent = currentEvent || (typeof event !== 'undefined' ? event : null);
        checkoutButton = runtimeEvent?.target || document.querySelector('.cart-footer .btn.btn-primary');
        originalText = checkoutButton?.textContent || '';
        if (checkoutButton) {
            checkoutButton.disabled = true;
            checkoutButton.textContent = 'Procesando...';
        }

        window.location.href = '/datos-envio';

    } catch (error) {
        console.error('Error en checkout:', error);
        alert(error.message || 'No pudimos continuar con el checkout.');

        if (checkoutButton) {
            checkoutButton.disabled = false;
            checkoutButton.textContent = originalText;
        }
    }
}

// Initialize on Load
document.addEventListener('DOMContentLoaded', async () => {
    initThemeToggle();
    syncUiOverlayState();
    initPhoneInputMasks();

    await loadStoreCatalog();
    initCatalogFilters();
    renderProducts();
    bindCommonUiActions();
    bindStaticAddToCartButtons();
    setupAccessibleTriggers();
    ensureDeliveryCheckoutUi();
    updateCart();
    await loadDeliveryOptions();
    updateDeliveryUi();
    injectDeliveryPolicyPanel();

    // Contact Form Pre-fill Logic
    initContactFormSubmission();
    initQuoteFormSubmission();

    const currentPath = String(window.location.pathname || '').toLowerCase();
    if (currentPath.includes('contacto')) {
        const urlParams = new URLSearchParams(window.location.search);
        const product = String(urlParams.get('producto') || '').slice(0, 120);
        setContactSubmitInfo('Responderemos a la brevedad posible.');

        if (product) {
            const typeSelect = document.querySelector('select[name="type"]');
            const messageTextarea = document.querySelector('textarea[name="message"]');
            const productReferenceInput = document.querySelector('input[name="productReference"]');

            if (productReferenceInput) {
                productReferenceInput.value = product;
            }

            if (typeSelect) {
                // Map product keywords to dropdown options
                const lowerProduct = product.toLowerCase();
                if (lowerProduct.includes('cocina')) typeSelect.value = 'Cocina';
                else if (lowerProduct.includes('placard') || lowerProduct.includes('vestidor')) typeSelect.value = 'Placard';
                else if (lowerProduct.includes('rack') || lowerProduct.includes('tv') || lowerProduct.includes('vajillero')) typeSelect.value = 'Rack TV';
                else if (lowerProduct.includes('escritorio') || lowerProduct.includes('oficina')) typeSelect.value = 'Escritorio';
                else typeSelect.value = 'Otro';
            }

            if (messageTextarea) {
                messageTextarea.value = `Hola, buenas tardes. Me comunico para consultar el precio para realizar "${product}" a medida.`;
            }
        }
    }

    // Cart Notification Logic
    if (cart.length > 0) {
        setTimeout(() => {
            const notification = document.getElementById('cart-notification');
            if (notification) {
                notification.classList.add('show');
            }
        }, 10000); // Show after 10 seconds (adjust as needed)
    }

    // Hero Slideshow
    initHeroSlideshow();
});

function initHeroSlideshow() {
    const allSlides = Array.from(document.querySelectorAll('.hero-slide'));
    if (allSlides.length === 0) return;

    const orientationQuery = window.matchMedia('(orientation: portrait)');
    const slideInterval = 3000;
    let activeSlides = [];
    let currentSlide = 0;
    let intervalId = null;
    let activeMode = '';
    let resizeDebounceId = null;

    const getBackgroundForMode = (slide, useMobile) => {
        const desktopBg = String(slide.dataset.bgDesktop || '').trim();
        const mobileBg = String(slide.dataset.bgMobile || '').trim();
        const legacyBg = String(slide.dataset.bg || '').trim();
        if (useMobile) {
            return mobileBg || legacyBg || desktopBg;
        }
        return desktopBg || legacyBg;
    };

    const applyBackground = (slide, useMobile) => {
        const backgroundPath = getBackgroundForMode(slide, useMobile);
        slide.classList.remove('active');

        if (!backgroundPath) {
            slide.hidden = true;
            slide.style.backgroundImage = '';
            return false;
        }

        slide.hidden = false;
        slide.style.backgroundImage = `url('${backgroundPath}')`;
        return true;
    };

    const shouldUseMobileSlides = () => {
        const width = window.innerWidth || document.documentElement.clientWidth || 0;
        const height = window.innerHeight || document.documentElement.clientHeight || 0;
        const isPhoneViewport = width <= 900;
        const isPortrait = height > width;
        return isPhoneViewport && isPortrait;
    };

    const clearRotation = () => {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    };

    const startRotation = () => {
        clearRotation();
        if (activeSlides.length < 2) {
            return;
        }

        intervalId = setInterval(() => {
            activeSlides[currentSlide].classList.remove('active');
            currentSlide = (currentSlide + 1) % activeSlides.length;
            activeSlides[currentSlide].classList.add('active');
        }, slideInterval);
    };

    const refreshSlides = () => {
        const useMobileSlides = shouldUseMobileSlides();
        const mode = useMobileSlides ? 'mobile' : 'desktop';
        const shouldRebuild = mode !== activeMode || activeSlides.length === 0;
        if (!shouldRebuild) {
            return;
        }

        activeMode = mode;
        activeSlides = allSlides.filter(slide => applyBackground(slide, useMobileSlides));
        if (activeSlides.length === 0) {
            return;
        }

        currentSlide = 0;
        activeSlides[0].classList.add('active');
        startRotation();
    };

    const queueRefreshSlides = () => {
        if (resizeDebounceId) {
            clearTimeout(resizeDebounceId);
        }

        resizeDebounceId = setTimeout(() => {
            resizeDebounceId = null;
            refreshSlides();
        }, 120);
    };

    refreshSlides();

    window.addEventListener('resize', queueRefreshSlides, { passive: true });
    if (orientationQuery.addEventListener) {
        orientationQuery.addEventListener('change', refreshSlides);
    } else if (orientationQuery.addListener) {
        orientationQuery.addListener(refreshSlides);
    }

}

function closeNotification() {
    const notification = document.getElementById('cart-notification');
    if (notification) {
        notification.classList.remove('show');
    }
}

function openQuoteById(productId) {
    const numericId = Number.parseInt(productId, 10);
    const product = products.find(item => item.id === numericId);

    if (!product) {
        return;
    }

    openQuote(product.name);
}

function openQuote(productName) {
    const safeProductName = String(productName || '').slice(0, 120);
    window.location.href = `/contacto?producto=${encodeURIComponent(safeProductName)}`;
}
