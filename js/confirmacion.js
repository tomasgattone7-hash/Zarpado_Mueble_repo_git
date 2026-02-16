const CHECKOUT_SHIPPING_STORAGE_KEY = 'checkoutShippingData';
const CART_STORAGE_KEY = 'zarpadoCart';
const PHONE_PATTERN = /^[0-9+()\-\s]{6,40}$/;
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const POSTAL_CODE_PATTERN = /^\d{4}$/;
const PROD_API_BASE_URL = 'https://api.zarpadomueble.com';
const LOCAL_API_BASE_URL = 'http://localhost:3000';

function resolveApiBaseUrl() {
    if (typeof window === 'undefined' || !window.location) {
        return PROD_API_BASE_URL;
    }

    if (typeof window.ZM_API_BASE_URL === 'string' && window.ZM_API_BASE_URL.trim()) {
        return window.ZM_API_BASE_URL.trim();
    }

    const hostname = String(window.location.hostname || '').toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
        return LOCAL_API_BASE_URL;
    }

    return PROD_API_BASE_URL;
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

    return `${baseUrl}${pathWithSlash}`;
}

const confirmState = {
    cart: [],
    shippingData: null,
    shippingQuote: null,
    processing: false
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

function sanitizeCart(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    return items
        .map(item => ({
            id: Number.parseInt(item?.id, 10),
            name: String(item?.name || '').trim(),
            price: Number.parseInt(item?.price, 10),
            quantity: Number.parseInt(item?.quantity, 10),
            image: String(item?.image || '').trim()
        }))
        .filter(item => (
            Number.isInteger(item.id)
            && item.id > 0
            && item.name
            && Number.isInteger(item.price)
            && item.price >= 0
            && Number.isInteger(item.quantity)
            && item.quantity > 0
        ));
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

function getMissingShippingFields(data) {
    const normalized = {
        fullName: String(data?.fullName || '').trim(),
        email: String(data?.email || '').trim().toLowerCase(),
        phone: String(data?.phone || '').trim(),
        addressLine: String(data?.addressLine || '').trim(),
        city: String(data?.city || '').trim(),
        province: String(data?.province || '').trim(),
        postalCode: normalizePostalCode(data?.postalCode)
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
        const lineTotal = item.price * item.quantity;
        return `
            <article class="checkout-cart-item">
                <div>
                    <h3>${escapeHtml(item.name)}</h3>
                    <p>Cantidad: ${item.quantity}</p>
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
    return items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
}

function renderTotals(subtotal, shippingCost) {
    const subtotalNode = document.getElementById('confirm-subtotal');
    const shippingNode = document.getElementById('confirm-shipping-cost');
    const totalNode = document.getElementById('confirm-total');

    if (subtotalNode) {
        subtotalNode.textContent = formatArs(subtotal);
    }

    if (shippingNode) {
        shippingNode.textContent = Number.isInteger(shippingCost)
            ? formatArs(shippingCost)
            : 'A cotizar';
    }

    if (totalNode) {
        const total = subtotal + (Number.isInteger(shippingCost) ? shippingCost : 0);
        totalNode.textContent = formatArs(total);
    }
}

function renderShippingLabel(labelText) {
    const label = document.getElementById('confirm-shipping-label');
    if (!label) return;

    label.textContent = labelText;
}

async function requestShippingQuote(postalCode, items) {
    const quoteResponse = await fetch(buildApiUrl('/api/delivery/quote'), {
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
                unit_price: item.price
            }))
        })
    });

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

    return {
        items: confirmState.cart.map(item => ({
            id: item.id,
            quantity: item.quantity,
            unit_price: item.price
        })),
        paymentMethod: 'mercadopago',
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

    if (!confirmState.shippingQuote || !Number.isInteger(confirmState.shippingQuote.shippingCost)) {
        setConfirmFeedback('No pudimos validar el envío. Revisá tus datos y reintentá.', 'error');
        return;
    }

    confirmState.processing = true;
    disablePayButton(true, 'Procesando...');
    setConfirmFeedback('Creando orden de pago segura...', 'loading');

    try {
        const response = await fetch(buildApiUrl('/api/mp/create-preference'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            },
            body: JSON.stringify(buildCheckoutPayload())
        });

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
        setConfirmFeedback(error.message || 'No pudimos iniciar el pago en este momento.', 'error');
        disablePayButton(false, 'Confirmar y pagar');
        confirmState.processing = false;
    }
}

function redirectWithDelay(url, message) {
    setConfirmFeedback(message, 'error');
    window.setTimeout(() => {
        window.location.href = url;
    }, 1200);
}

function initConfirmationStep() {
    const path = String(window.location.pathname || '').toLowerCase();
    if (!path.includes('confirmacion')) {
        return;
    }

    confirmState.cart = sanitizeCart(getStoredCart());
    if (confirmState.cart.length === 0) {
        redirectWithDelay('/tienda', 'Tu carrito está vacío. Te llevamos a la tienda.');
        return;
    }

    const { normalized, missing } = getMissingShippingFields(getStoredShippingData());
    if (missing.length > 0) {
        redirectWithDelay('/datos-envio', 'Faltan datos de envío para continuar. Completá el paso 1.');
        return;
    }

    confirmState.shippingData = normalized;

    renderCartItems(confirmState.cart);
    renderShippingData(confirmState.shippingData);

    const subtotal = getSubtotal(confirmState.cart);
    renderTotals(subtotal, 0);
    renderShippingLabel('Calculando costo de envío...');
    setConfirmFeedback('Validando costo de envío por código postal...', 'loading');

    requestShippingQuote(confirmState.shippingData.postalCode, confirmState.cart)
        .then(quote => {
            confirmState.shippingQuote = quote;
            renderTotals(subtotal, quote.shippingCost);
            renderShippingLabel(`${quote.shippingLabel}. Plazos: 48/72 hs (stock) o 10-20 días hábiles (bajo pedido).`);
            setConfirmFeedback('Todo listo. Podés confirmar y pagar.', 'success');
            disablePayButton(false, 'Confirmar y pagar');
        })
        .catch(error => {
            renderTotals(subtotal, null);
            renderShippingLabel('No pudimos calcular el envío automáticamente para este CP.');
            setConfirmFeedback(error.message || 'No pudimos calcular el envío.', 'error');
            disablePayButton(true, 'Confirmar y pagar');
        });

    const payButton = document.getElementById('confirm-and-pay-btn');
    if (payButton) {
        payButton.disabled = true;
        payButton.addEventListener('click', () => {
            handleConfirmAndPay();
        });
    }
}

document.addEventListener('DOMContentLoaded', initConfirmationStep);
