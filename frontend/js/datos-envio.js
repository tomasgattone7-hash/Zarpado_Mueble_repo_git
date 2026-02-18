(() => {
const CHECKOUT_SHIPPING_STORAGE_KEY = 'checkoutShippingData';
const CHECKOUT_STATE_STORAGE_KEY = 'checkoutState';
const CART_STORAGE_KEY = 'zarpadoCart';
const PHONE_PATTERN = /^[0-9+()\-\s]{6,40}$/;
const PROD_API_BASE_URL = 'https://api.zarpadomueble.com';
const LOCAL_API_BASE_URL = 'http://localhost:3000';
const DEFAULT_FETCH_TIMEOUT_MS = 12000;

function normalizeApiBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function resolveApiBaseUrl() {
    if (typeof window === 'undefined' || !window.location) {
        return normalizeApiBaseUrl(PROD_API_BASE_URL);
    }

    if (typeof window.ZM_API_BASE_URL === 'string' && window.ZM_API_BASE_URL.trim()) {
        return normalizeApiBaseUrl(window.ZM_API_BASE_URL);
    }

    const hostname = String(window.location.hostname || '').toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
        return normalizeApiBaseUrl(LOCAL_API_BASE_URL);
    }

    if (window.location.protocol === 'file:') {
        return normalizeApiBaseUrl(LOCAL_API_BASE_URL);
    }

    return normalizeApiBaseUrl(PROD_API_BASE_URL);
}

function buildApiUrl(path) {
    if (typeof window !== 'undefined' && typeof window.zmBuildApiUrl === 'function') {
        return window.zmBuildApiUrl(path);
    }

    const baseUrl = resolveApiBaseUrl();
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath) {
        return baseUrl;
    }

    if (/^https?:\/\//i.test(normalizedPath)) {
        return normalizedPath;
    }

    const pathWithSlash = normalizedPath.startsWith('/')
        ? normalizedPath
        : `/${normalizedPath}`;

    if (!baseUrl) {
        return pathWithSlash;
    }

    return `${baseUrl}${pathWithSlash}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
    if (typeof AbortController === 'undefined') {
        return fetch(url, options);
    }

    const controller = new AbortController();
    const timerId = window.setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    const mergedOptions = {
        ...options,
        signal: controller.signal
    };

    try {
        return await fetch(url, mergedOptions);
    } finally {
        window.clearTimeout(timerId);
    }
}

function getStoredCart() {
    try {
        const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
        return Array.isArray(parsed)
            ? parsed.filter(item => Number.isInteger(Number.parseInt(item?.id, 10)) && Number.parseInt(item?.quantity, 10) > 0)
            : [];
    } catch (error) {
        return [];
    }
}

function normalizePostalCode(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 4);
}

function sanitizeCheckoutItems(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    return items
        .map(item => ({
            id: Number.parseInt(item?.id, 10),
            quantity: Number.parseInt(item?.quantity, 10),
            price: Number.parseInt(item?.price ?? item?.unit_price, 10) || 0,
            name: String(item?.name || item?.title || '').trim(),
            image: String(item?.image || '').trim()
        }))
        .filter(item => Number.isInteger(item.id) && item.id > 0 && Number.isInteger(item.quantity) && item.quantity > 0);
}

function getCartItemsFromLocalStorage() {
    return sanitizeCheckoutItems(getStoredCart());
}

function getStoredCheckoutState() {
    try {
        const raw = sessionStorage.getItem(CHECKOUT_STATE_STORAGE_KEY) || localStorage.getItem(CHECKOUT_STATE_STORAGE_KEY);
        const parsed = JSON.parse(raw || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        return {};
    }
}

function saveCheckoutState(state) {
    const payload = state && typeof state === 'object' ? state : {};
    try {
        localStorage.setItem(CHECKOUT_STATE_STORAGE_KEY, JSON.stringify(payload));
        sessionStorage.setItem(CHECKOUT_STATE_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        // Storage can be blocked (private mode / strict settings).
    }
}

function getStoredShippingData() {
    try {
        const raw = sessionStorage.getItem(CHECKOUT_SHIPPING_STORAGE_KEY) || localStorage.getItem(CHECKOUT_SHIPPING_STORAGE_KEY);
        const parsed = JSON.parse(raw || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        return {};
    }
}

function calculateSubtotal(items) {
    return items.reduce((acc, item) => acc + ((Number.parseInt(item.price, 10) || 0) * (Number.parseInt(item.quantity, 10) || 0)), 0);
}

function setFieldError(fieldId, message = '') {
    const errorElement = document.getElementById(`error-${fieldId}`);
    const input = document.getElementById(fieldId);

    if (errorElement) {
        errorElement.textContent = message;
        errorElement.hidden = !message;
    }

    if (input) {
        input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
}

function clearFieldErrors() {
    [
        'fullName',
        'email',
        'phone',
        'addressLine',
        'city',
        'province',
        'postalCode'
    ].forEach(fieldId => setFieldError(fieldId, ''));
}

function isValidEmail(email) {
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(String(email || '').trim());
}

function readFormData() {
    const form = document.getElementById('shipping-step-form');
    const formData = new FormData(form);
    return {
        fullName: String(formData.get('fullName') || '').trim(),
        email: String(formData.get('email') || '').trim().toLowerCase(),
        phone: String(formData.get('phone') || '').trim(),
        addressLine: String(formData.get('addressLine') || '').trim(),
        city: String(formData.get('city') || '').trim(),
        province: String(formData.get('province') || '').trim(),
        postalCode: normalizePostalCode(formData.get('postalCode'))
    };
}

function validateFormData(data) {
    clearFieldErrors();
    let hasError = false;

    if (data.fullName.length < 2) {
        setFieldError('fullName', 'Ingresá tu nombre completo.');
        hasError = true;
    }

    if (!isValidEmail(data.email)) {
        setFieldError('email', 'Ingresá un email válido.');
        hasError = true;
    }

    if (!PHONE_PATTERN.test(data.phone)) {
        setFieldError('phone', 'Ingresá un teléfono válido.');
        hasError = true;
    }

    if (!data.addressLine || data.addressLine.length < 4) {
        setFieldError('addressLine', 'Ingresá calle y número.');
        hasError = true;
    }

    if (!data.city) {
        setFieldError('city', 'Ingresá la ciudad.');
        hasError = true;
    }

    if (!data.province) {
        setFieldError('province', 'Ingresá la provincia.');
        hasError = true;
    }

    if (!/^\d{4}$/.test(data.postalCode)) {
        setFieldError('postalCode', 'Ingresá un código postal válido de 4 dígitos.');
        hasError = true;
    }

    return !hasError;
}

function prefillForm(data) {
    const fields = ['fullName', 'email', 'phone', 'addressLine', 'city', 'province', 'postalCode'];
    const legacyAddress = [String(data?.street || '').trim(), String(data?.streetNumber || '').trim()]
        .filter(Boolean)
        .join(' ');
    fields.forEach(fieldId => {
        const input = document.getElementById(fieldId);
        if (!input) return;
        const value = fieldId === 'addressLine'
            ? String(data?.addressLine || legacyAddress || '')
            : String(data?.[fieldId] || '');
        input.value = fieldId === 'postalCode'
            ? normalizePostalCode(value)
            : value;
    });
}

function setShippingFeedback(message, type = '') {
    const feedback = document.getElementById('shipping-form-feedback');
    if (!feedback) return;

    feedback.textContent = message || '';
    feedback.classList.remove('is-success', 'is-error', 'is-loading');
    if (type === 'success') feedback.classList.add('is-success');
    if (type === 'error') feedback.classList.add('is-error');
    if (type === 'loading') feedback.classList.add('is-loading');
}

function bindPostalCodeMask() {
    const postalCodeInput = document.getElementById('postalCode');
    if (!postalCodeInput) return;

    postalCodeInput.addEventListener('input', () => {
        postalCodeInput.value = normalizePostalCode(postalCodeInput.value);
    });
}

function lockShippingForm() {
    const form = document.getElementById('shipping-step-form');
    if (!form) return;

    form.querySelectorAll('input, button, select, textarea').forEach(element => {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLButtonElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) {
            return;
        }
        if (element.id === 'shipping-step-submit') {
            element.disabled = true;
            return;
        }
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            element.readOnly = true;
        }
    });
}

function redirectIfCartMissing() {
    const cart = getCartItemsFromLocalStorage();
    if (cart.length > 0) {
        return false;
    }

    lockShippingForm();
    setShippingFeedback('Tu carrito está vacío. Te llevamos a la tienda para continuar.', 'error');
    setTimeout(() => {
        window.location.href = '/tienda';
    }, 1200);
    return true;
}

async function saveDraftOrder(data, items) {
    const checkoutState = getStoredCheckoutState();
    if (items.length === 0) {
        throw new Error('El carrito está vacío. Volvé a la tienda para continuar.');
    }

    const rawSubtotal = Number.parseInt(checkoutState?.totals?.subtotal, 10);
    const rawEnvioCandidates = [
        checkoutState?.totals?.envio,
        checkoutState?.delivery?.shippingCost,
        checkoutState?.shippingCost
    ];
    const rawEnvio = rawEnvioCandidates
        .map(value => Number.parseInt(value, 10))
        .find(value => Number.isInteger(value) && value >= 0);
    const fallbackSubtotal = calculateSubtotal(items);
    const subtotal = Number.isInteger(rawSubtotal) && rawSubtotal > 0 ? rawSubtotal : fallbackSubtotal;
    const envio = Number.isInteger(rawEnvio) && rawEnvio >= 0 ? rawEnvio : 0;
    const rawInstallation = Number.parseInt(checkoutState?.totals?.installation, 10);
    const installation = Number.isInteger(rawInstallation) && rawInstallation >= 0 ? rawInstallation : 0;
    const total = subtotal + envio + installation;

    const response = await fetchWithTimeout(buildApiUrl('/api/checkout/shipping'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
            fullName: data.fullName,
            nombre: data.fullName,
            email: data.email,
            phone: data.phone,
            telefono: data.phone,
            addressLine: data.addressLine,
            direccion: data.addressLine,
            city: data.city,
            ciudad: data.city,
            province: data.province,
            provincia: data.province,
            postalCode: data.postalCode,
            codigo_postal: data.postalCode,
            subtotal,
            envio,
            installation,
            total,
            items: items.map(item => ({
                id: item.id,
                quantity: item.quantity,
                unit_price: item.price
            })),
            cart: {
                subtotal,
                envio,
                installation,
                total,
                items: items.map(item => ({
                    id: item.id,
                    quantity: item.quantity,
                    unit_price: item.price
                }))
            }
        })
    }, 15000);

    let payload = {};
    try {
        payload = await response.json();
    } catch (error) {
        payload = {};
    }

    if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || 'No pudimos guardar el pedido.'));
    }

    const draftOrderId = Number.parseInt(payload?.id ?? payload?.pedidoId, 10);
    const draftOrderRef = String(payload?.orderId || payload?.order_id || checkoutState?.draftOrderRef || '').trim();

    saveCheckoutState({
        ...checkoutState,
        items,
        totals: {
            subtotal: Number.parseInt(payload?.totals?.subtotal, 10) || subtotal,
            envio: Number.parseInt(payload?.totals?.envio, 10) || envio,
            installation: Number.parseInt(payload?.totals?.installation, 10) || installation,
            total: Number.parseInt(payload?.totals?.total, 10) || total
        },
        delivery: {
            ...(checkoutState.delivery || {}),
            method: 'shipping',
            postalCode: data.postalCode,
            shippingLabel: String(payload?.shippingLabel || checkoutState?.delivery?.shippingLabel || ''),
            shippingReady: true
        },
        draftOrderId: Number.isInteger(draftOrderId) && draftOrderId > 0 ? draftOrderId : null,
        draftOrderRef
    });

    return payload;
}

document.addEventListener('DOMContentLoaded', () => {
    if (!window.location.pathname.toLowerCase().includes('datos-envio')) {
        return;
    }

    if (redirectIfCartMissing()) {
        return;
    }

    bindPostalCodeMask();
    prefillForm(getStoredShippingData());
    try {
        const url = new URL(window.location.href);
        const redirectedError = String(url.searchParams.get('error') || '').trim();
        if (redirectedError) {
            setShippingFeedback(redirectedError, 'error');
            url.searchParams.delete('error');
            window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }
    } catch (error) {
        // Ignore malformed URL edge-cases.
    }

    const form = document.getElementById('shipping-step-form');
    const submitButton = document.getElementById('shipping-step-submit');
    if (!form || !submitButton) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = readFormData();
        if (!validateFormData(data)) {
            setShippingFeedback('Revisá los campos marcados para continuar.', 'error');
            return;
        }

        const items = getCartItemsFromLocalStorage();
        if (items.length === 0) {
            setShippingFeedback('El carrito está vacío. Agregá productos para continuar.', 'error');
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Guardando...';
        setShippingFeedback('Guardando datos de envío...', 'loading');

        try {
            const shippingPayload = {
                ...data,
                savedAt: new Date().toISOString()
            };
            sessionStorage.setItem(CHECKOUT_SHIPPING_STORAGE_KEY, JSON.stringify(shippingPayload));
            localStorage.setItem(CHECKOUT_SHIPPING_STORAGE_KEY, JSON.stringify(shippingPayload));

            const payload = await saveDraftOrder(data, items);

            setShippingFeedback('Datos guardados. Avanzando al paso 2...', 'success');
            const redirectTarget = String(payload?.redirectTo || '').trim()
                || `/confirmacion${payload?.orderId ? `?orderId=${encodeURIComponent(payload.orderId)}` : ''}`;
            setTimeout(() => {
                window.location.href = redirectTarget;
            }, 350);
        } catch (error) {
            const fallbackMessage = error?.name === 'AbortError'
                ? 'El servidor tardó demasiado en responder. Intentá nuevamente.'
                : 'No pudimos guardar los datos. Intentá nuevamente.';
            const message = error?.name === 'AbortError'
                ? fallbackMessage
                : (error?.message || fallbackMessage);
            setShippingFeedback(message, 'error');
            submitButton.disabled = false;
            submitButton.textContent = 'Continuar a confirmación';
        }
    });
});
})();
