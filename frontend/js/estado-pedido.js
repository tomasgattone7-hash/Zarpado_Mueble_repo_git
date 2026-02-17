const PROD_API_BASE_URL = 'https://api.zarpadomueble.com';
const LOCAL_API_BASE_URL = 'http://localhost:3000';

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

function formatStatusCurrency(value) {
    return `$${Number(value || 0).toLocaleString('es-AR')}`;
}

function setOrderStatusFeedback(message, type = '') {
    const feedback = document.getElementById('order-status-feedback');
    if (!feedback) return;

    feedback.textContent = message || '';
    feedback.classList.remove('is-success', 'is-error', 'is-loading');
    if (type === 'success') feedback.classList.add('is-success');
    if (type === 'error') feedback.classList.add('is-error');
    if (type === 'loading') feedback.classList.add('is-loading');
}

function renderOrderTimeline(timeline = []) {
    const container = document.getElementById('order-status-timeline');
    if (!container) return;

    const normalizedTimeline = Array.isArray(timeline) ? timeline : [];
    if (normalizedTimeline.length === 0) {
        container.hidden = true;
        container.innerHTML = '';
        return;
    }

    container.hidden = false;
    container.innerHTML = normalizedTimeline.map((item, index) => {
        const dateLabel = item?.at
            ? new Date(item.at).toLocaleString('es-AR')
            : 'Fecha no disponible';
        const note = String(item?.note || '').trim();
        return `
            <article class="service-step reveal-up" style="transition-delay: ${Math.min(index, 5) * 0.08}s;">
                <span class="service-step-number">${index + 1}</span>
                <div>
                    <h3>${String(item?.label || item?.status || 'Actualización')}</h3>
                    <p>${dateLabel}${note ? ` · ${note}` : ''}</p>
                </div>
            </article>
        `;
    }).join('');
}

function renderOrderStatus(payload) {
    const resultBox = document.getElementById('order-status-result');
    const trackingLink = document.getElementById('order-status-tracking');
    if (!resultBox) return;

    document.getElementById('order-status-ref').textContent = payload.orderRef || payload.orderId || '-';
    document.getElementById('order-status-label').textContent = payload.fulfillmentLabel || payload.fulfillmentStatus || '-';
    document.getElementById('order-status-payment-method').textContent = payload.paymentMethodLabel || payload.paymentMethod || '-';
    document.getElementById('order-status-payment-status').textContent = payload.paymentStatus || '-';
    document.getElementById('order-status-total').textContent = formatStatusCurrency(payload?.totals?.total || 0);
    document.getElementById('order-status-lead-time').textContent = payload.estimatedLeadTime || '-';

    const trackingUrl = String(payload.trackingUrl || '').trim();
    if (trackingLink) {
        if (trackingUrl) {
            trackingLink.href = trackingUrl;
            trackingLink.textContent = trackingUrl;
        } else {
            trackingLink.href = '#';
            trackingLink.textContent = 'No disponible';
        }
    }

    resultBox.hidden = false;
    renderOrderTimeline(payload.timeline || []);
}

async function fetchOrderStatus(orderRef) {
    const response = await fetch(buildApiUrl(`/api/orders/${encodeURIComponent(orderRef)}`), {
        method: 'GET',
        headers: { Accept: 'application/json' }
    });

    let payload = {};
    try {
        payload = await response.json();
    } catch (error) {
        payload = {};
    }

    if (!response.ok) {
        throw new Error(payload.error || 'No encontramos ese pedido.');
    }

    return payload;
}

function getOrderRefFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return String(
        params.get('order_ref')
        || params.get('order_id')
        || params.get('external_reference')
        || ''
    ).trim().toUpperCase();
}

document.addEventListener('DOMContentLoaded', () => {
    if (!window.location.pathname.toLowerCase().includes('estado-pedido')) {
        return;
    }

    const form = document.getElementById('order-status-form');
    const input = document.getElementById('order-ref-input');
    if (!form || !input) {
        return;
    }

    const autoRef = getOrderRefFromUrl();
    if (autoRef) {
        input.value = autoRef;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const orderRef = String(input.value || '').trim().toUpperCase();
        if (!orderRef) {
            setOrderStatusFeedback('Ingresá un número de pedido.', 'error');
            return;
        }

        setOrderStatusFeedback('Consultando estado...', 'loading');
        try {
            const payload = await fetchOrderStatus(orderRef);
            renderOrderStatus(payload);
            setOrderStatusFeedback('Estado actualizado.', 'success');
        } catch (error) {
            setOrderStatusFeedback(error.message || 'No se pudo consultar el pedido.', 'error');
            document.getElementById('order-status-result').hidden = true;
            document.getElementById('order-status-timeline').hidden = true;
        }
    });

    if (autoRef) {
        form.dispatchEvent(new Event('submit', { cancelable: true }));
    }
});
