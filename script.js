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

    if (cartSidebar?.classList.contains('open')) {
        const clickedInsideCart = cartSidebar.contains(eventTarget);
        const clickedCartTrigger = eventTarget.closest('.js-toggle-cart');
        if (!clickedInsideCart && !clickedCartTrigger) {
            closeCart();
        }
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

if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
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
const products = [
    // --- Cart Items ---
    { id: 1, name: 'Escritorio Gamer Pro', specs: 'Melamina 18mm / Pasacables / LED', price: 185000, image: 'assets/desk_gamer.png', action: 'cart' },
    { id: 2, name: 'Rack TV Minimalista', specs: 'Para TV 65" / Cajones Push', price: 210000, image: 'assets/tv_rack.png', action: 'cart' },
    { id: 3, name: 'Mesa Ratona Industrial', specs: 'Hierro estructural / Tapa Paraíso', price: 95000, image: 'assets/coffee_table.png', action: 'cart' },
    { id: 4, name: 'Biblioteca Moderna', specs: 'Estantería asimétrica / Melamina Negra', price: 145000, image: 'assets/library.png', action: 'cart' },
    { id: 5, name: 'Vajillero Nórdico', specs: 'Patas de madera maciza / Puertas blancas', price: 230000, image: 'assets/sideboard.png', action: 'cart' },
    { id: 6, name: 'Escritorio Home Office', specs: 'Diseño compacto / Cajonera móvil', price: 120000, image: 'assets/office_desk.png', action: 'cart' },
    { id: 7, name: 'Gabinete Multiuso', specs: 'Almacenamiento versátil', price: 180000, image: 'assets/cabinet.webp', action: 'cart' },
    { id: 8, name: 'Silla de Diseño', specs: 'Ergonómica / Madera', price: 85000, image: 'assets/chair.webp', action: 'cart' },
    { id: 9, name: 'Mesa Comedor', specs: 'Para 6 personas / Resistente', price: 250000, image: 'assets/table.webp', action: 'cart' },
    { id: 10, name: 'Mueble TV Flotante', specs: 'Diseño aéreo / Moderno', price: 200000, image: 'assets/tv_unit.webp', action: 'cart' },
    { id: 11, name: 'Escritorio Melamina', specs: 'Básico / Funcional', price: 130000, image: 'assets/melamine_desk.webp', action: 'cart' },

    // --- Quote Items (Proyectos) ---
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

const CART_PRODUCT_MAP = products
    .filter(product => product.action === 'cart')
    .reduce((acc, product) => {
        acc[product.id] = product;
        return acc;
    }, {});

const INITIAL_PRODUCTS_VISIBLE = 12;
let visibleProductsCount = INITIAL_PRODUCTS_VISIBLE;
let csrfTokenCache = '';

async function getCsrfToken(forceRefresh = false) {
    if (csrfTokenCache && !forceRefresh) {
        return csrfTokenCache;
    }

    const response = await fetch('/api/csrf-token', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
    });

    if (!response.ok) {
        throw new Error('No se pudo obtener token CSRF');
    }

    const data = await response.json();
    if (!data?.csrfToken) {
        throw new Error('Token CSRF inválido');
    }

    csrfTokenCache = String(data.csrfToken);
    return csrfTokenCache;
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
    const contactForm = document.getElementById('contact-form');
    if (!contactForm) return;

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
        setContactSubmitInfo('Enviando…', 'loading');

        try {
            const csrfToken = await getCsrfToken();
            if (!csrfToken) {
                throw new Error('No se pudo validar el formulario');
            }

            const payload = Object.fromEntries(formData.entries());
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
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
                setContactSubmitInfo('Mensaje enviado correctamente ✅', 'success');
                return;
            }

            const responseError = String(responsePayload?.error || '').trim();

            setContactSubmitInfo(
                responseError || 'Error al enviar. Intentá nuevamente.',
                'error'
            );
        } catch (error) {
            setContactSubmitInfo('Error al enviar. Intentá nuevamente.', 'error');
        } finally {
            isSubmitting = false;
            setContactSubmittingState(false);
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

    const visibleProducts = products.slice(0, visibleProductsCount);

    grid.innerHTML = visibleProducts.map((product, index) => {
        const delay = (index % 6) * 0.1;

        let buttonHtml = '';
        let priceHtml = '';

        if (product.action === 'cart') {
            priceHtml = `<span class="product-price">$${product.price.toLocaleString('es-AR')}</span>`;
            buttonHtml = `<button class="btn-add-cart js-add-cart" data-product-id="${product.id}">Agregar al Carrito</button>`;
        } else {
            priceHtml = `<span class="product-price" style="color: var(--color-text-muted);">Consultar Precio</span>`;
            buttonHtml = `<button class="btn-add-cart js-open-quote" style="border-color: var(--color-text); color: var(--color-text);" data-product-id="${product.id}">Cotizar</button>`;
        }

        return `
            <div class="product-card reveal" style="transition-delay: ${delay}s;">
                <div class="product-image">
                    <img src="${product.image}" alt="${product.name}" loading="lazy" decoding="async" width="1024" height="1024">
                </div>
                <div class="product-details">
                    <h4 class="product-name">${product.name}</h4>
                    <p class="product-specs">${product.specs}</p>
                    ${priceHtml}
                    ${buttonHtml}
                </div>
            </div>
        `;
    }).join('');

    bindCatalogActions(grid);
    renderLoadMoreButton(grid);

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

    grid.querySelectorAll('.js-open-quote').forEach(button => {
        button.addEventListener('click', () => {
            openQuoteById(button.dataset.productId);
        });
    });
}

function renderLoadMoreButton(grid) {
    if (!grid?.parentElement) return;

    const previousWrapper = document.getElementById('catalog-load-more');
    if (previousWrapper) {
        previousWrapper.remove();
    }

    if (visibleProductsCount >= products.length) {
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'catalog-load-more';
    wrapper.className = 'catalog-load-more';
    wrapper.innerHTML = '<button type="button" id="loadMoreProductsBtn" class="btn btn-outline">Ver mas productos</button>';
    grid.parentElement.appendChild(wrapper);

    const loadMoreButton = document.getElementById('loadMoreProductsBtn');
    loadMoreButton?.addEventListener('click', () => {
        visibleProductsCount = Math.min(visibleProductsCount + 8, products.length);
        renderProducts();
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
    const pathname = window.location.pathname.toLowerCase();
    if (
        pathname.includes('success')
        || pathname.includes('failure')
        || pathname.includes('pending')
        || pathname.includes('404')
    ) {
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
    installationSelected: false
};

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
        return { ok: false, message: 'El carrito está vacío.' };
    }

    if (deliveryState.method === DELIVERY_METHOD_PICKUP) {
        return { ok: true, message: '' };
    }

    if (deliveryState.postalCode.length < 4) {
        return { ok: false, message: 'Ingresá tu código postal para calcular el envío.' };
    }

    if (deliveryState.shippingLoading) {
        return { ok: false, message: 'Calculando costo de envío...' };
    }

    if (!deliveryState.shippingReady) {
        return {
            ok: false,
            message: deliveryState.shippingError || deliveryConfig.unsupportedPostalCodeMessage
        };
    }

    if (deliveryState.installationSelected && !deliveryState.installationAvailable) {
        return {
            ok: false,
            message: 'Instalación no disponible en tu zona. Podés continuar con envío sin instalación o retiro por fábrica.'
        };
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
}

function resetShippingState() {
    deliveryState.shippingCost = 0;
    deliveryState.shippingLabel = '';
    deliveryState.shippingReady = false;
    deliveryState.shippingLoading = false;
    deliveryState.shippingError = '';
    deliveryState.installationAvailable = false;
    deliveryState.installationSelected = false;
}

async function loadDeliveryOptions() {
    try {
        const response = await fetch('/api/delivery/options', {
            method: 'GET',
            headers: { Accept: 'application/json' }
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
    deliveryState.shippingLoading = true;
    deliveryState.shippingError = '';
    deliveryState.shippingReady = false;
    deliveryState.installationSelected = false;
    updateDeliveryUi();

    try {
        const response = await fetch(`/api/delivery/quote?postalCode=${encodeURIComponent(postalCode)}`, {
            method: 'GET',
            headers: { Accept: 'application/json' }
        });

        const data = await response.json();
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
        deliveryConfig.installationBaseCost = Number.parseInt(data.installationBaseCost, 10) || deliveryConfig.installationBaseCost;
        deliveryConfig.installationComplexNotice = String(
            data.installationComplexNotice || deliveryConfig.installationComplexNotice
        );
    } catch (error) {
        deliveryState.shippingError = 'No pudimos calcular el envío en este momento. Intentá nuevamente.';
        deliveryState.shippingReady = false;
    } finally {
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
            requestShippingQuote(normalizedPostalCode);
        }, 350);
    });

    refs.installationCheckbox?.addEventListener('change', () => {
        deliveryState.installationSelected = refs.installationCheckbox.checked;
        updateDeliveryUi();
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
    textElement.textContent = `Has agregado ${productName} al carrito`;

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
}

async function checkout(currentEvent = null) {
    const checkoutValidation = getCheckoutValidation();
    if (!checkoutValidation.ok) {
        setDeliveryPanelOpen(true);
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

        const items = cart.map(item => ({
            id: item.id,
            title: item.name,
            quantity: item.quantity,
            unit_price: item.price
        }));

        const csrfToken = await getCsrfToken();
        if (!csrfToken) {
            throw new Error('No se encontró token CSRF');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        let response;
        try {
            response = await fetch('/api/mp/create-preference', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({
                    items,
                    delivery: buildDeliveryPayload()
                }),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Error al procesar el pago');
        }

        if (data.payment_mode === 'offline' && data.warning) {
            alert(`${data.warning} Te llevaremos al formulario de datos para coordinar manualmente.`);
        }

        if (data.init_point) {
            window.location.href = data.init_point;
        } else {
            throw new Error('No se recibió URL de pago');
        }

    } catch (error) {
        console.error('Error en checkout:', error);
        if (error.name === 'AbortError') {
            alert('La solicitud tardó demasiado. Intenta nuevamente.');
        } else {
            alert(error.message || 'Error al procesar el pago. Por favor, intenta nuevamente.');
        }

        if (checkoutButton) {
            checkoutButton.disabled = false;
            checkoutButton.textContent = originalText;
        }
    }
}

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    syncUiOverlayState();
    renderProducts();
    bindCommonUiActions();
    bindStaticAddToCartButtons();
    setupAccessibleTriggers();
    ensureDeliveryCheckoutUi();
    updateCart();
    loadDeliveryOptions();
    injectDeliveryPolicyPanel();

    // Contact Form Pre-fill Logic
    const currentPath = String(window.location.pathname || '').toLowerCase();
    if (currentPath.includes('contacto')) {
        const urlParams = new URLSearchParams(window.location.search);
        const product = String(urlParams.get('producto') || '').slice(0, 120);
        initContactFormSubmission();
        setContactSubmitInfo('Responderemos a la brevedad posible.');

        if (product) {
            const typeSelect = document.querySelector('select[name="type"]');
            const messageTextarea = document.querySelector('textarea[name="message"]');

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
    const slides = document.querySelectorAll('.hero-slide');
    if (slides.length === 0) return;

    let currentSlide = 0;
    const slideInterval = 3000; // 3 seconds

    setInterval(() => {
        slides[currentSlide].classList.remove('active');
        currentSlide = (currentSlide + 1) % slides.length;
        slides[currentSlide].classList.add('active');
    }, slideInterval);
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
    window.location.href = `contacto.html?producto=${encodeURIComponent(safeProductName)}`;
}
