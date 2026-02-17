const ADMIN_TOKEN_STORAGE_KEY = 'zm_admin_panel_token';
const PROD_API_BASE_URL = 'https://api.zarpadomueble.com';
const LOCAL_API_BASE_URL = 'http://localhost:3000';

function normalizeApiBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function resolveAdminApiBaseUrl() {
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

function buildAdminApiUrl(path) {
    if (typeof window !== 'undefined' && typeof window.zmBuildApiUrl === 'function') {
        return window.zmBuildApiUrl(path);
    }

    const baseUrl = resolveAdminApiBaseUrl();
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

function formatAdminCurrency(value) {
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

function setAdminFeedback(message, type = '') {
    const feedback = document.getElementById('admin-feedback');
    if (!feedback) return;

    feedback.textContent = message || '';
    feedback.classList.remove('is-success', 'is-error', 'is-loading');
    if (type === 'success') feedback.classList.add('is-success');
    if (type === 'error') feedback.classList.add('is-error');
    if (type === 'loading') feedback.classList.add('is-loading');
}

function getAdminToken() {
    const input = document.getElementById('admin-token-input');
    return String(input?.value || '').trim();
}

function saveAdminToken(token) {
    try {
        localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    } catch (error) {
        // Ignore blocked storage scenarios.
    }
}

function loadStoredAdminToken() {
    try {
        return String(localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '').trim();
    } catch (error) {
        return '';
    }
}

async function adminFetch(path, options = {}) {
    const token = getAdminToken();
    if (!token) {
        throw new Error('Ingresá el token de administrador.');
    }

    const headers = {
        Accept: 'application/json',
        ...(options.headers || {}),
        'X-Admin-Token': token
    };

    const response = await fetch(buildAdminApiUrl(path), {
        method: options.method || 'GET',
        headers,
        body: options.body || null
    });

    let payload = {};
    try {
        payload = await response.json();
    } catch (error) {
        payload = {};
    }

    if (!response.ok || payload?.ok === false) {
        throw new Error(payload.error || 'La operación no pudo completarse.');
    }

    return payload;
}

function createStatusOptions(statusMap, currentStatus) {
    return Object.entries(statusMap || {})
        .map(([statusKey, label]) => {
            const selected = statusKey === currentStatus ? ' selected' : '';
            return `<option value="${statusKey}"${selected}>${label}</option>`;
        })
        .join('');
}

function renderAdminStats(stats = {}) {
    document.getElementById('admin-stat-orders').textContent = String(stats.orders || 0);
    document.getElementById('admin-stat-quotes').textContent = String(stats.quotes || 0);
    document.getElementById('admin-stat-pending-orders').textContent = String(stats.pendingStoreOrders || 0);
    document.getElementById('admin-stat-pending-quotes').textContent = String(stats.pendingQuotes || 0);
}

function renderOrdersList(orders = [], statusMap = {}) {
    const container = document.getElementById('admin-orders-list');
    if (!container) return;

    if (!Array.isArray(orders) || orders.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-muted);">Sin pedidos para mostrar.</p>';
        return;
    }

    container.innerHTML = orders.map(order => {
        const orderId = escapeHtml(order.orderId);
        const orderRef = escapeHtml(order.orderRef || order.orderId);
        const customerName = escapeHtml(order.customerName || '-');
        const customerEmail = escapeHtml(order.customerEmail || '-');
        const paymentLabel = escapeHtml(order.paymentMethodLabel || order.paymentMethod || '-');
        const paymentStatus = escapeHtml(order.paymentStatus || '-');
        const fulfillmentLabel = escapeHtml(order.fulfillmentLabel || order.fulfillmentStatus || '-');
        const trackingUrl = escapeHtml(order.trackingUrl || '');

        return `
        <article class="shipping-data-card admin-item-card">
            <div class="shipping-data-grid">
                <div class="form-group shipping-data-full">
                    <p><strong>${orderRef}</strong></p>
                    <p style="color: var(--color-text-muted);">Cliente: ${customerName} · ${customerEmail}</p>
                    <p style="color: var(--color-text-muted);">Pago: ${paymentLabel} · Estado: ${paymentStatus}</p>
                    <p style="color: var(--color-text-muted);">Total: ${formatAdminCurrency(order?.totals?.total || 0)} · ${fulfillmentLabel}</p>
                </div>
                <div class="form-group">
                    <label>Nuevo estado</label>
                    <select class="form-input admin-order-status" data-order-id="${orderId}">
                        ${createStatusOptions(statusMap, order.fulfillmentStatus)}
                    </select>
                </div>
                <div class="form-group">
                    <label>Tracking (opcional)</label>
                    <input class="form-input admin-order-tracking" data-order-id="${orderId}" value="${trackingUrl}">
                </div>
                <div class="form-group shipping-data-full">
                    <label>Nota interna</label>
                    <input class="form-input admin-order-note" data-order-id="${orderId}" placeholder="Detalle para notificación al cliente">
                </div>
                <div class="form-group">
                    <button type="button" class="btn btn-primary admin-order-update" data-order-id="${orderId}">Guardar estado</button>
                </div>
            </div>
        </article>
    `;
    }).join('');
}

function renderQuotesList(quotes = [], statusMap = {}) {
    const container = document.getElementById('admin-quotes-list');
    if (!container) return;

    if (!Array.isArray(quotes) || quotes.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-muted);">Sin cotizaciones para mostrar.</p>';
        return;
    }

    container.innerHTML = quotes.map(quote => {
        const quoteId = escapeHtml(quote.quoteId);
        const quoteStatus = escapeHtml(quote.statusLabel || quote.status || '-');
        const customerName = escapeHtml(quote?.customer?.fullName || '-');
        const customerEmail = escapeHtml(quote?.customer?.email || '-');
        const furnitureType = escapeHtml(quote?.project?.furnitureType || '-');
        const estimatedBudget = escapeHtml(quote?.project?.estimatedBudget || 'No informado');
        const linkedOrderId = escapeHtml(quote.linkedOrderId || 'No creada');

        return `
        <article class="shipping-data-card admin-item-card">
            <div class="shipping-data-grid">
                <div class="form-group shipping-data-full">
                    <p><strong>${quoteId}</strong> · ${quoteStatus}</p>
                    <p style="color: var(--color-text-muted);">Cliente: ${customerName} · ${customerEmail}</p>
                    <p style="color: var(--color-text-muted);">Proyecto: ${furnitureType} · Presupuesto: ${estimatedBudget}</p>
                    <p style="color: var(--color-text-muted);">Orden vinculada: ${linkedOrderId}</p>
                </div>
                <div class="form-group">
                    <label>Nuevo estado</label>
                    <select class="form-input admin-quote-status" data-quote-id="${quoteId}">
                        ${createStatusOptions(statusMap, quote.status)}
                    </select>
                </div>
                <div class="form-group shipping-data-full">
                    <label>Nota interna</label>
                    <input class="form-input admin-quote-note" data-quote-id="${quoteId}" placeholder="Detalle para historial/notificación">
                </div>
                <div class="form-group">
                    <button type="button" class="btn btn-outline admin-quote-update" data-quote-id="${quoteId}">Guardar estado</button>
                </div>
                <div class="form-group">
                    <label>Medio de seña</label>
                    <select class="form-input admin-quote-payment-method" data-quote-id="${quoteId}">
                        <option value="bank_transfer">Transferencia</option>
                        <option value="mercadopago">Mercado Pago</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>% de seña</label>
                    <input class="form-input admin-quote-deposit" data-quote-id="${quoteId}" value="50" inputmode="numeric">
                </div>
                <div class="form-group">
                    <button type="button" class="btn btn-primary admin-quote-accept" data-quote-id="${quoteId}">Crear orden de seña</button>
                </div>
            </div>
        </article>
    `;
    }).join('');
}

async function updateOrderStatus(orderId) {
    const status = document.querySelector(`.admin-order-status[data-order-id="${orderId}"]`)?.value;
    const note = document.querySelector(`.admin-order-note[data-order-id="${orderId}"]`)?.value || '';
    const trackingUrl = document.querySelector(`.admin-order-tracking[data-order-id="${orderId}"]`)?.value || '';

    await adminFetch(`/api/admin/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            status,
            note,
            trackingUrl
        })
    });
}

async function updateQuoteStatus(quoteId) {
    const status = document.querySelector(`.admin-quote-status[data-quote-id="${quoteId}"]`)?.value;
    const note = document.querySelector(`.admin-quote-note[data-quote-id="${quoteId}"]`)?.value || '';

    await adminFetch(`/api/admin/quotes/${encodeURIComponent(quoteId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            status,
            note
        })
    });
}

async function acceptQuote(quoteId) {
    const paymentMethod = document.querySelector(`.admin-quote-payment-method[data-quote-id="${quoteId}"]`)?.value || 'bank_transfer';
    const depositPercent = Number.parseInt(
        document.querySelector(`.admin-quote-deposit[data-quote-id="${quoteId}"]`)?.value,
        10
    ) || 50;

    const payload = await adminFetch(`/api/admin/quotes/${encodeURIComponent(quoteId)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            paymentMethod,
            depositPercent
        })
    });

    if (payload?.payment?.init_point) {
        window.open(payload.payment.init_point, '_blank', 'noopener');
    }
}

async function loadOverview() {
    setAdminFeedback('Cargando panel...', 'loading');
    const payload = await adminFetch('/api/admin/overview');
    renderAdminStats(payload.stats || {});
    renderOrdersList(payload.orders || [], payload.fulfillmentStatuses || {});
    renderQuotesList(payload.quotes || [], payload.quoteStatuses || {});
    setAdminFeedback('Panel actualizado.', 'success');
}

function bindAdminActions() {
    document.getElementById('admin-load-btn')?.addEventListener('click', async () => {
        try {
            const token = getAdminToken();
            saveAdminToken(token);
            await loadOverview();
        } catch (error) {
            setAdminFeedback(error.message || 'No se pudo cargar el panel.', 'error');
        }
    });

    document.getElementById('admin-export-orders')?.addEventListener('click', () => {
        const token = getAdminToken();
        if (!token) {
            setAdminFeedback('Ingresá el token para exportar.', 'error');
            return;
        }
        window.open(buildAdminApiUrl(`/api/admin/export?type=orders&format=csv&token=${encodeURIComponent(token)}`), '_blank', 'noopener');
    });

    document.getElementById('admin-export-all')?.addEventListener('click', () => {
        const token = getAdminToken();
        if (!token) {
            setAdminFeedback('Ingresá el token para exportar.', 'error');
            return;
        }
        window.open(buildAdminApiUrl(`/api/admin/export?type=all&format=csv&token=${encodeURIComponent(token)}`), '_blank', 'noopener');
    });

    document.addEventListener('click', async (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const orderButton = target.closest('.admin-order-update');
        if (orderButton) {
            const orderId = orderButton.getAttribute('data-order-id');
            if (!orderId) return;
            try {
                await updateOrderStatus(orderId);
                await loadOverview();
            } catch (error) {
                setAdminFeedback(error.message || 'No se pudo actualizar el pedido.', 'error');
            }
            return;
        }

        const quoteStatusButton = target.closest('.admin-quote-update');
        if (quoteStatusButton) {
            const quoteId = quoteStatusButton.getAttribute('data-quote-id');
            if (!quoteId) return;
            try {
                await updateQuoteStatus(quoteId);
                await loadOverview();
            } catch (error) {
                setAdminFeedback(error.message || 'No se pudo actualizar la cotización.', 'error');
            }
            return;
        }

        const acceptButton = target.closest('.admin-quote-accept');
        if (acceptButton) {
            const quoteId = acceptButton.getAttribute('data-quote-id');
            if (!quoteId) return;
            try {
                await acceptQuote(quoteId);
                await loadOverview();
                setAdminFeedback('Orden interna creada correctamente.', 'success');
            } catch (error) {
                setAdminFeedback(error.message || 'No se pudo crear la orden de seña.', 'error');
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (!window.location.pathname.toLowerCase().includes('panel-interno')) {
        return;
    }

    const input = document.getElementById('admin-token-input');
    if (input) {
        input.value = loadStoredAdminToken();
    }

    bindAdminActions();
});
