(() => {
const CHECKOUT_SHIPPING_STORAGE_KEY = 'checkoutShippingData';
const CHECKOUT_STATE_STORAGE_KEY = 'checkoutState';
const CART_STORAGE_KEY = 'zarpadoCart';
const PHONE_PATTERN = /^[0-9+()\-\s]{6,40}$/;
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const POSTAL_CODE_PATTERN = /^\d{4}$/;
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

const confirmState = {
    cart: [],
    shippingData: null,
    shippingQuote: null,
    draftOrderId: null,
    draftOrderRef: '',
    processing: false,
    subtotal: 0,
    shippingCost: 0,
    installationCost: 0,
    total: 0
};

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatArs(amount) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0
    }).format(Number(amount) || 0);
}

function normalizePostalCode(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 4);
}

function getStoredJson(key, fallbackValue) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) {
            return fallbackValue;
        }

        return JSON.parse(raw);
    } catch {
        return fallbackValue;
    }
}

function getStoredCart() {
    const parsed = getStoredJson(CART_STORAGE_KEY, []);
    if (!Array.isArray(parsed)) {
        return [];
    }

    return parsed;
}

function getStoredCheckoutState() {
    try {
        const raw = sessionStorage.getItem(CHECKOUT_STATE_STORAGE_KEY)
            || localStorage.getItem(CHECKOUT_STATE_STORAGE_KEY);
        const parsed = JSON.parse(raw || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function saveCheckoutState(state) {
    const payload = state && typeof state === 'object' ? state : {};
    try {
        sessionStorage.setItem(CHECKOUT_STATE_STORAGE_KEY, JSON.stringify(payload));
        localStorage.setItem(CHECKOUT_STATE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
        // Ignore blocked storage scenarios.
    }
}

function parseCartInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
}

function parseCartMoney(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        const rounded = Math.round(value);
        return Number.isInteger(rounded) ? rounded : null;
    }

    const raw = String(value || '').trim();
    if (!raw) {
        return null;
    }

    const normalized = raw
        .replace(/\s+/g, '')
        .replace(/ars/ig, '')
        .replace(/\$(?=\d|[.,]\d)/g, '')
        .replace(/\.(?=\d{3}(\D|$))/g, '')
        .replace(/,(?=\d{3}(\D|$))/g, '')
        .replace(',', '.')
        .replace(/[^0-9.-]/g, '');

    if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') {
        return null;
    }

    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed)) {
        return null;
    }

    return Math.round(parsed);
}

function sanitizeCart(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    return items
        .map(item => ({
            id: parseCartInteger(item?.id ?? item?.productId ?? item?.itemId),
            name: String(item?.name || item?.title || item?.productName || '').trim(),
            price: parseCartMoney(item?.price ?? item?.unit_price ?? item?.unitPrice),
            quantity: parseCartInteger(item?.quantity ?? item?.qty ?? item?.cantidad),
            image: String(item?.image || '').trim()
        }))
        .filter(item => (
            Number.isInteger(item.id)
            && item.id > 0
            && Number.isInteger(item.quantity)
            && item.quantity > 0
            && item.quantity <= 10
        ));
}

function getStoredCheckoutItems(checkoutState) {
    return sanitizeCart(checkoutState?.items);
}

function getStoredCheckoutTotals(checkoutState) {
    const subtotal = parseCartMoney(checkoutState?.totals?.subtotal);
    const shippingCost = parseCartMoney(checkoutState?.totals?.envio);
    const total = parseCartMoney(checkoutState?.totals?.total);

    return {
        subtotal: Number.isInteger(subtotal) && subtotal >= 0 ? subtotal : null,
        shippingCost: Number.isInteger(shippingCost) && shippingCost >= 0 ? shippingCost : null,
        total: Number.isInteger(total) && total >= 0 ? total : null
    };
}

function getStoredShippingData() {
    try {
        const raw = sessionStorage.getItem(CHECKOUT_SHIPPING_STORAGE_KEY)
            || localStorage.getItem(CHECKOUT_SHIPPING_STORAGE_KEY);
        const parsed = JSON.parse(raw || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function buildLegacyAddressLine(data) {
    return [
        String(data?.street || '').trim(),
        String(data?.streetNumber || '').trim()
    ]
        .filter(Boolean)
        .join(' ')
        .trim();
}

function getMissingShippingFields(data) {
    const legacyAddressLine = buildLegacyAddressLine(data);
    const normalized = {
        fullName: String(data?.fullName || data?.name || '').trim(),
        email: String(data?.email || '').trim().toLowerCase(),
        phone: String(data?.phone || '').trim(),
        addressLine: String(data?.addressLine || legacyAddressLine || '').trim(),
        city: String(data?.city || data?.cityNeighborhood || '').trim(),
        province: String(data?.province || '').trim(),
        postalCode: normalizePostalCode(data?.postalCode || data?.zip)
    };

    const missing = [];

    if (normalized.fullName.length < 2) missing.push('nombre completo');
    if (!EMAIL_PATTERN.test(normalized.email)) missing.push('email válido');
    if (!PHONE_PATTERN.test(normalized.phone)) missing.push('teléfono válido');
    if (normalized.addressLine.length < 4) missing.push('calle y número');
    if (normalized.city.length < 2) missing.push('ciudad');
    if (normalized.province.length < 2) missing.push('provincia');
    if (!POSTAL_CODE_PATTERN.test(normalized.postalCode)) missing.push('código postal');

    return {
        normalized,
        missing
    };
}

function splitAddressLine(addressLine) {
    const normalized = String(addressLine || '').trim().replace(/\s+/g, ' ');
    const addressMatch = normalized.match(/^(.*?)(?:\s+(\d+[A-Za-z0-9./-]*))$/);

    if (!addressMatch) {
        return {
            street: normalized,
            streetNumber: 'S/N'
        };
    }

    return {
        street: String(addressMatch[1] || '').trim() || normalized,
        streetNumber: String(addressMatch[2] || '').trim() || 'S/N'
    };
}

function setConfirmFeedback(message, type = '') {
    const feedback = document.getElementById('confirm-feedback');
    if (!feedback) return;

    feedback.textContent = message || '';
    feedback.classList.remove('is-success', 'is-error', 'is-loading');

    if (type === 'success') feedback.classList.add('is-success');
    if (type === 'error') feedback.classList.add('is-error');
    if (type === 'loading') feedback.classList.add('is-loading');
}

function renderCartItems(items) {
    const list = document.getElementById('confirm-cart-items');
    if (!list) return;

    list.innerHTML = items.map(item => {
        const unitPrice = Number.isInteger(item.price) && item.price >= 0 ? item.price : 0;
        const quantity = Number.isInteger(item.quantity) ? item.quantity : 0;
        const lineTotal = unitPrice * quantity;
        return `
            <article class="checkout-cart-item">
                <div>
                    <h3>${escapeHtml(item.name)}</h3>
                    <p>Cantidad: ${quantity}</p>
                    <p>Precio unitario: ${formatArs(unitPrice)}</p>
                </div>
                <strong>${formatArs(lineTotal)}</strong>
            </article>
        `;
    }).join('');
}

function renderShippingData(data) {
    const container = document.getElementById('confirm-shipping-data');
    if (!container) return;

    const rows = [
        ['Nombre', data.fullName],
        ['Email', data.email],
        ['Teléfono', data.phone],
        ['Dirección', data.addressLine],
        ['Ciudad', data.city],
        ['Provincia', data.province],
        ['Código Postal', data.postalCode]
    ];

    container.innerHTML = rows.map(([label, value]) => `
        <div class="checkout-shipping-row">
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value)}</dd>
        </div>
    `).join('');
}

function getSubtotal(items) {
    return items.reduce((acc, item) => {
        const unitPrice = Number.isInteger(item.price) && item.price >= 0 ? item.price : 0;
        const quantity = Number.isInteger(item.quantity) ? item.quantity : 0;
        return acc + (unitPrice * quantity);
    }, 0);
}

function renderTotals(subtotal, shippingCost, installationCost = 0) {
    const subtotalNode = document.getElementById('confirm-subtotal');
    const shippingNode = document.getElementById('confirm-shipping-cost');
    const installationNode = document.getElementById('confirm-installation-cost');
    const installationRow = document.getElementById('confirm-installation-row');
    const totalNode = document.getElementById('confirm-total');
    const normalizedSubtotal = Math.max(0, Math.round(Number(subtotal) || 0));
    const normalizedShipping = Number.isInteger(shippingCost) && shippingCost >= 0
        ? shippingCost
        : 0;
    const normalizedInstallation = Number.isInteger(installationCost) && installationCost >= 0
        ? installationCost
        : 0;
    const normalizedTotal = normalizedSubtotal + normalizedShipping + normalizedInstallation;

    confirmState.subtotal = normalizedSubtotal;
    confirmState.shippingCost = normalizedShipping;
    confirmState.installationCost = normalizedInstallation;
    confirmState.total = normalizedTotal;

    if (subtotalNode) {
        subtotalNode.textContent = formatArs(normalizedSubtotal);
    }

    if (shippingNode) {
        shippingNode.textContent = formatArs(normalizedShipping);
    }

    if (installationRow) {
        installationRow.hidden = normalizedInstallation <= 0;
    }

    if (installationNode) {
        installationNode.textContent = formatArs(normalizedInstallation);
    }

    if (totalNode) {
        totalNode.textContent = formatArs(normalizedTotal);
    }
}

function syncPayButtonState(forceDisable = false) {
    const shouldEnable = (
        !forceDisable
        && !confirmState.processing
        && Number.isInteger(confirmState.total)
        && confirmState.total > 0
    );
    disablePayButton(!shouldEnable, 'Confirmar y pagar');
}

function renderShippingLabel(labelText) {
    const label = document.getElementById('confirm-shipping-label');
    if (!label) return;

    label.textContent = labelText;
}

let catalogMapPromise = null;

async function getCatalogMap() {
    if (catalogMapPromise) {
        return catalogMapPromise;
    }

    catalogMapPromise = (async () => {
        const response = await fetchWithTimeout(buildApiUrl('/api/store/catalog'), {
            method: 'GET',
            headers: { Accept: 'application/json' }
        }, 12000);

        let payload = {};
        try {
            payload = await response.json();
        } catch {
            payload = {};
        }

        const products = Array.isArray(payload?.products) ? payload.products : [];
        return products.reduce((acc, product) => {
            const id = parseCartInteger(product?.id);
            if (!Number.isInteger(id) || id <= 0) {
                return acc;
            }

            acc[id] = {
                name: String(product?.name || '').trim(),
                image: String(product?.image || '').trim(),
                price: parseCartInteger(product?.price)
            };
            return acc;
        }, {});
    })();

    try {
        return await catalogMapPromise;
    } catch {
        catalogMapPromise = null;
        return {};
    }
}

async function hydrateCartItems(items) {
    const normalizedItems = Array.isArray(items) ? items : [];
    if (normalizedItems.length === 0) {
        return [];
    }

    const needsCatalogFallback = normalizedItems.some(item => (
        !item.name
        || !Number.isInteger(item.price)
        || item.price < 0
    ));

    if (!needsCatalogFallback) {
        return normalizedItems;
    }

    const catalogMap = await getCatalogMap();
    return normalizedItems
        .map(item => {
            const catalogItem = catalogMap[item.id] || {};
            const name = String(item.name || catalogItem.name || '').trim();
            const priceCandidate = Number.isInteger(item.price) ? item.price : catalogItem.price;
            const price = parseCartInteger(priceCandidate);

            return {
                ...item,
                name,
                price,
                image: String(item.image || catalogItem.image || '').trim()
            };
        })
        .filter(item => (
            Number.isInteger(item.id)
            && item.id > 0
            && item.name
            && Number.isInteger(item.price)
            && item.price >= 0
            && Number.isInteger(item.quantity)
            && item.quantity > 0
            && item.quantity <= 10
        ));
}

async function requestShippingQuote(postalCode, items) {
    const quoteResponse = await fetchWithTimeout(buildApiUrl('/api/delivery/quote'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        body: JSON.stringify({
            postalCode,
            items: items.map(item => ({
                id: item.id,
                quantity: item.quantity,
                unit_price: Number.isInteger(item.price) && item.price >= 0 ? item.price : 0
            }))
        })
    }, 12000);

    let payload = {};
    try {
        payload = await quoteResponse.json();
    } catch {
        payload = {};
    }

    if (!quoteResponse.ok || payload?.ok === false) {
        throw new Error(String(payload?.error || 'No pudimos calcular el envío para ese código postal.'));
    }

    const shippingCost = Number.parseInt(payload?.shippingCost, 10);
    if (!Number.isInteger(shippingCost) || shippingCost < 0) {
        throw new Error('La cotización de envío es inválida.');
    }

    return {
        shippingCost,
        shippingLabel: String(payload?.shippingLabel || 'Envío a domicilio').trim() || 'Envío a domicilio'
    };
}

function markStepThreeActive() {
    const activeStep = document.querySelector('.checkout-progress-step.is-active');
    if (activeStep) {
        activeStep.classList.remove('is-active');
        activeStep.classList.add('is-complete');
    }

    const stepPayment = document.getElementById('checkout-step-payment');
    if (stepPayment) {
        stepPayment.classList.add('is-active');
        stepPayment.setAttribute('aria-current', 'step');
    }
}

function buildCheckoutPayload() {
    const shipping = confirmState.shippingData;
    const address = splitAddressLine(shipping.addressLine);
    const checkoutState = getStoredCheckoutState();
    const paymentMethod = String(checkoutState?.paymentMethod || 'mercadopago').trim() || 'mercadopago';
    const draftOrderId = Number.parseInt(confirmState.draftOrderId, 10);
    const draftOrderRef = String(
        confirmState.draftOrderRef
        || checkoutState?.draftOrderRef
        || checkoutState?.orderId
        || ''
    ).trim();

    return {
        items: confirmState.cart.map(item => ({
            id: item.id,
            quantity: item.quantity,
            unit_price: Number.isInteger(item.price) && item.price >= 0 ? item.price : 0
        })),
        draftOrderId: Number.isInteger(draftOrderId) && draftOrderId > 0 ? draftOrderId : undefined,
        orderId: draftOrderRef || undefined,
        paymentMethod,
        buyerEmail: shipping.email,
        email: shipping.email,
        payer: {
            email: shipping.email
        },
        delivery: {
            method: 'shipping',
            postalCode: shipping.postalCode,
            installationRequested: false
        },
        customer: {
            fullName: shipping.fullName,
            email: shipping.email,
            phone: shipping.phone,
            address: shipping.addressLine,
            street: address.street,
            streetNumber: address.streetNumber,
            city: shipping.city,
            province: shipping.province,
            zip: shipping.postalCode
        }
    };
}

function disablePayButton(disabled, text = '') {
    const button = document.getElementById('confirm-and-pay-btn');
    if (!button) return;

    button.disabled = disabled;
    if (text) {
        button.textContent = text;
    }
}

async function handleConfirmAndPay() {
    if (confirmState.processing) {
        return;
    }

    if (!String(confirmState.draftOrderRef || '').trim()) {
        setConfirmFeedback('No encontramos un pedido draft válido. Volvé al paso 1 e intentá nuevamente.', 'error');
        return;
    }

    if (!confirmState.shippingQuote || !Number.isInteger(confirmState.shippingQuote.shippingCost)) {
        setConfirmFeedback('No pudimos validar el envío. Revisá tus datos y reintentá.', 'error');
        return;
    }

    confirmState.processing = true;
    disablePayButton(true, 'Procesando...');
    setConfirmFeedback('Creando orden de pago segura...', 'loading');

    try {
        const response = await fetchWithTimeout(buildApiUrl('/api/mp/create-preference'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(buildCheckoutPayload())
        }, 15000);

        let payload = {};
        try {
            payload = await response.json();
        } catch {
            payload = {};
        }

        if (!response.ok || payload?.ok === false) {
            throw new Error(String(payload?.error || 'No se pudo iniciar el pago.'));
        }

        const initPoint = String(payload?.init_point || '').trim();
        if (!initPoint) {
            throw new Error('No recibimos la URL de pago de Mercado Pago.');
        }

        markStepThreeActive();
        setConfirmFeedback('Redirigiendo a Mercado Pago...', 'success');

        window.setTimeout(() => {
            window.location.href = initPoint;
        }, 250);
    } catch (error) {
        const fallbackMessage = error?.name === 'AbortError'
            ? 'El servidor demoró en responder. Probá nuevamente.'
            : 'No pudimos iniciar el pago en este momento.';
        const message = error?.name === 'AbortError'
            ? fallbackMessage
            : (error?.message || fallbackMessage);
        setConfirmFeedback(message, 'error');
        confirmState.processing = false;
        syncPayButtonState(false);
    }
}

function redirectWithDelay(url, message) {
    setConfirmFeedback(message, 'error');
    window.setTimeout(() => {
        window.location.href = url;
    }, 1200);
}

function getOrderIdFromLocation() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        return String(params.get('orderId') || params.get('order_id') || '').trim();
    } catch {
        return '';
    }
}

async function fetchDraftSummary(orderId) {
    const query = orderId
        ? `?orderId=${encodeURIComponent(orderId)}`
        : '';
    const candidateEndpoints = [
        `/api/checkout/summary${query}`,
        `/api/checkout/confirmacion${query}`
    ];

    for (const endpoint of candidateEndpoints) {
        const response = await fetchWithTimeout(
            buildApiUrl(endpoint),
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json'
                },
                credentials: 'include'
            },
            12000
        );

        let payload = {};
        try {
            payload = await response.json();
        } catch {
            payload = {};
        }

        if (!response.ok || payload?.ok === false) {
            const error = new Error(String(payload?.error || 'No pudimos recuperar el pedido en curso.'));
            error.redirectTo = String(payload?.redirectTo || '').trim();
            if (response.status === 404 && endpoint.includes('/api/checkout/summary')) {
                continue;
            }
            throw error;
        }

        const pedido = payload?.pedido && typeof payload.pedido === 'object'
            ? payload.pedido
            : null;
        if (pedido) {
            return pedido;
        }
    }

    throw new Error('No recibimos los datos del pedido para confirmar.');
}

async function initConfirmationStep() {
    const path = String(window.location.pathname || '').toLowerCase();
    if (!path.includes('confirmacion')) {
        return;
    }

    const checkoutState = getStoredCheckoutState();
    const checkoutItems = getStoredCheckoutItems(checkoutState);
    const localCartItems = sanitizeCart(getStoredCart());
    confirmState.cart = await hydrateCartItems(checkoutItems.length > 0 ? checkoutItems : localCartItems);

    if (confirmState.cart.length === 0) {
        redirectWithDelay('/tienda', 'Tu carrito está vacío. Te llevamos a la tienda.');
        return;
    }

    const queryOrderId = getOrderIdFromLocation();
    const storedOrderId = String(checkoutState?.draftOrderRef || checkoutState?.orderId || '').trim();
    const requestedOrderId = queryOrderId || storedOrderId;
    let draftSummary = null;

    try {
        draftSummary = await fetchDraftSummary(requestedOrderId);
    } catch (error) {
        const redirectTo = String(error?.redirectTo || '').trim() || '/datos-envio';
        redirectWithDelay(redirectTo, error?.message || 'No encontramos un pedido en curso. Completá primero el paso 1.');
        return;
    }

    const draftOrderId = Number.parseInt(draftSummary?.id, 10);
    confirmState.draftOrderId = Number.isInteger(draftOrderId) && draftOrderId > 0 ? draftOrderId : null;
    confirmState.draftOrderRef = String(draftSummary?.orderId || requestedOrderId || '').trim();
    if (!queryOrderId && confirmState.draftOrderRef && window.history?.replaceState) {
        const target = `/confirmacion?orderId=${encodeURIComponent(confirmState.draftOrderRef)}`;
        window.history.replaceState({}, '', target);
    }

    const serverShipping = draftSummary?.shipping && typeof draftSummary.shipping === 'object'
        ? draftSummary.shipping
        : {};
    const { normalized, missing } = getMissingShippingFields(serverShipping);
    if (missing.length > 0) {
        redirectWithDelay('/datos-envio', 'El pedido guardado no tiene datos de envío completos. Completá nuevamente el paso 1.');
        return;
    }
    confirmState.shippingData = normalized;

    const subtotal = parseCartMoney(draftSummary?.totals?.subtotal);
    const shippingCost = parseCartMoney(draftSummary?.totals?.envio);
    const totalFromSummary = parseCartMoney(draftSummary?.totals?.total);
    const installationFromSummary = parseCartMoney(draftSummary?.totals?.installation);
    if (!Number.isInteger(subtotal) || subtotal < 0 || !Number.isInteger(shippingCost) || shippingCost < 0) {
        redirectWithDelay('/datos-envio', 'Los totales del pedido son inválidos. Reintentá el paso 1.');
        return;
    }
    const installationCost = Number.isInteger(installationFromSummary) && installationFromSummary >= 0
        ? installationFromSummary
        : Math.max(
            0,
            (Number.isInteger(totalFromSummary) && totalFromSummary >= 0
                ? totalFromSummary
                : (subtotal + shippingCost)) - subtotal - shippingCost
        );

    const shippingLabel = String(draftSummary?.shippingLabel || 'Envío a domicilio').trim() || 'Envío a domicilio';
    confirmState.shippingQuote = {
        shippingCost,
        installationCost,
        shippingLabel
    };

    renderCartItems(confirmState.cart);
    renderShippingData(confirmState.shippingData);
    renderTotals(subtotal, shippingCost, installationCost);
    renderShippingLabel(`${shippingLabel}. Plazos: 48/72 hs (stock) o 10-20 días hábiles (bajo pedido).`);
    setConfirmFeedback('Pedido cargado desde base de datos. Podés confirmar y pagar.', 'success');
    syncPayButtonState(false);

    const shippingSnapshot = {
        ...confirmState.shippingData,
        savedAt: new Date().toISOString()
    };
    try {
        sessionStorage.setItem(CHECKOUT_SHIPPING_STORAGE_KEY, JSON.stringify(shippingSnapshot));
        localStorage.setItem(CHECKOUT_SHIPPING_STORAGE_KEY, JSON.stringify(shippingSnapshot));
    } catch {
        // Ignore blocked storage.
    }

    saveCheckoutState({
        ...checkoutState,
        items: confirmState.cart,
        totals: {
            subtotal: confirmState.subtotal,
            envio: confirmState.shippingCost,
            installation: confirmState.installationCost,
            total: confirmState.total
        },
        delivery: {
            ...(checkoutState.delivery || {}),
            method: 'shipping',
            postalCode: confirmState.shippingData.postalCode,
            shippingLabel,
            shippingReady: true
        },
        draftOrderId: confirmState.draftOrderId,
        draftOrderRef: confirmState.draftOrderRef
    });

    const payButton = document.getElementById('confirm-and-pay-btn');
    if (payButton) {
        syncPayButtonState(false);
        payButton.addEventListener('click', () => {
            handleConfirmAndPay();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initConfirmationStep().catch(() => {
        redirectWithDelay('/tienda', 'No pudimos cargar la confirmación. Te llevamos a la tienda.');
    });
});
})();
