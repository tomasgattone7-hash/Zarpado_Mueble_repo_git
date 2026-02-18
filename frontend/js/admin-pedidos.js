// MODIFICACIONES PANEL ADMIN: filtros de estado, actualización inline y panel de métricas.
const ADMIN_ORDERS_FETCH_TIMEOUT_MS = 15000;
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'zm_admin_sidebar_collapsed';
const CHART_JS_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

const STATUS_CATEGORY_TO_API = Object.freeze({
    pending: 'pending_payment',
    shipped: 'shipped',
    closed: 'delivered'
});

const STATUS_META = Object.freeze({
    pending: {
        label: 'Pendiente',
        icon: '●',
        className: 'is-pending'
    },
    shipped: {
        label: 'Enviado',
        icon: '●',
        className: 'is-shipped'
    },
    closed: {
        label: 'Cerrado',
        icon: '●',
        className: 'is-closed'
    }
});

const PENDING_STATUS_SET = new Set([
    'draft',
    'checkout_created',
    'pending',
    'pendiente',
    'pending_payment',
    'pending_transfer_confirmation',
    'pending_cash_pickup_payment',
    'payment_confirmed',
    'order_received',
    'transfer_pending',
    'cash_pickup_pending',
    'preparing',
    'in_production'
]);

const SHIPPED_STATUS_SET = new Set([
    'shipped',
    'enviado',
    'despachado',
    'ready_for_pickup',
    'ready_for_delivery'
]);

const CLOSED_STATUS_SET = new Set([
    'closed',
    'cerrado',
    'delivered',
    'entregado',
    'cancelled',
    'cancelado',
    'completed'
]);

const PAID_PAYMENT_STATUS_SET = new Set([
    'approved',
    'accredited',
    'authorized',
    'paid'
]);

const PAID_FULFILLMENT_STATUS_SET = new Set([
    'payment_confirmed',
    'preparing',
    'in_production',
    'shipped',
    'ready_for_pickup',
    'ready_for_delivery',
    'delivered'
]);

const PANEL_TEXT = Object.freeze({
    pedidos: {
        title: 'Dashboard de pedidos',
        description: 'Vista operativa de pedidos con filtros por estado, cambio rápido de estado y exportación CSV.'
    },
    metricas: {
        title: 'Panel de métricas',
        description: 'Seguimiento de indicadores comerciales con ventas efectivamente cobradas y distribución por estado.'
    }
});

let adminOrdersDataTable = null;
let salesTrendChart = null;
let orderStatusChart = null;
let latestPedidos = [];
let activeStatusFilter = 'all';
let canViewMetricsPanel = true;
let overviewLoaded = false;
let chartJsLoadPromise = null;
let orderDetailsByReference = new Map();

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatArs(value) {
    const amount = Number(value) || 0;
    return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatPercent(value) {
    const numeric = Number(value) || 0;
    return `${Math.abs(numeric).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatDate(value) {
    const parsed = new Date(String(value || ''));
    if (Number.isNaN(parsed.getTime())) {
        return '-';
    }

    return parsed.toLocaleString('es-AR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function setFeedback(message, type = '') {
    const feedback = document.getElementById('admin-orders-feedback');
    if (!feedback) return;

    feedback.textContent = message || '';
    feedback.classList.remove('is-success', 'is-error', 'is-loading');
    if (type === 'success') feedback.classList.add('is-success');
    if (type === 'error') feedback.classList.add('is-error');
    if (type === 'loading') feedback.classList.add('is-loading');
}

function buildApiUrl(path) {
    const normalizedPath = String(path || '').trim();
    if (!normalizedPath) {
        return '/';
    }

    if (/^https?:\/\//i.test(normalizedPath)) {
        return normalizedPath;
    }

    return normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = ADMIN_ORDERS_FETCH_TIMEOUT_MS) {
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

function toCsvCell(value) {
    const text = String(value ?? '');
    if (!/[",\n]/.test(text)) {
        return text;
    }

    return `"${text.replace(/"/g, '""')}"`;
}

function exportPedidosCsv(pedidos) {
    if (!Array.isArray(pedidos) || pedidos.length === 0) {
        setFeedback('No hay pedidos para exportar.', 'error');
        return;
    }

    const columns = [
        'id',
        'fecha_creado',
        'nombre',
        'email',
        'telefono',
        'direccion',
        'ciudad',
        'provincia',
        'codigo_postal',
        'subtotal',
        'envio',
        'total',
        'estado',
        'payment_status',
        'paid',
        'order_id',
        'external_reference'
    ];

    const header = columns.join(',');
    const rows = pedidos.map(pedido => columns.map(column => toCsvCell(pedido?.[column])).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `pedidos-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
}

function normalizeStatusCategory(rawStatus) {
    const normalized = String(rawStatus || '').trim().toLowerCase();
    if (SHIPPED_STATUS_SET.has(normalized)) {
        return 'shipped';
    }

    if (CLOSED_STATUS_SET.has(normalized)) {
        return 'closed';
    }

    if (PENDING_STATUS_SET.has(normalized)) {
        return 'pending';
    }

    return 'pending';
}

function resolveStatusMeta(rawStatus) {
    return STATUS_META[normalizeStatusCategory(rawStatus)] || STATUS_META.pending;
}

function getOrderReference(pedido) {
    const orderId = String(pedido?.order_id || '').trim();
    if (orderId) return orderId;

    const externalReference = String(pedido?.external_reference || '').trim();
    if (externalReference) return externalReference;

    return '';
}

function normalizeOrderReferenceKey(value) {
    return String(value || '').trim().toUpperCase();
}

function normalizeItemsSummary(value) {
    return String(value || '')
        .split('·')
        .map(part => part.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(' · ');
}

function safeMoney(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePaymentStatus(value) {
    return String(value || '').trim().toLowerCase();
}

function isPaymentStatusPaid(paymentStatus) {
    return PAID_PAYMENT_STATUS_SET.has(normalizePaymentStatus(paymentStatus));
}

function deriveInstallationAmountFromPedido(pedido) {
    const explicitInstallation = safeMoney(pedido?.instalacion);
    if (explicitInstallation > 0) {
        return explicitInstallation;
    }

    const subtotal = safeMoney(pedido?.subtotal);
    const shipping = safeMoney(pedido?.envio);
    const total = safeMoney(pedido?.total);
    const derived = total - subtotal - shipping;
    return derived > 0 ? derived : 0;
}

function buildOrderDetailsIndex(orders) {
    const index = new Map();
    const sourceOrders = Array.isArray(orders) ? orders : [];

    sourceOrders.forEach(order => {
        const refs = [
            order?.orderId,
            order?.orderRef,
            order?.externalReference
        ].map(normalizeOrderReferenceKey).filter(Boolean);

        if (refs.length === 0) {
            return;
        }

        const shippingAmount = safeMoney(order?.shippingAmount ?? order?.totals?.shipping);
        const installationAmount = safeMoney(order?.installationAmount ?? order?.totals?.installation);
        const paymentStatus = normalizePaymentStatus(order?.paymentStatus);
        const paid = Boolean(order?.paid) || isPaymentStatusPaid(paymentStatus);
        const detail = {
            itemsSummary: normalizeItemsSummary(order?.itemsSummary),
            hasShipping: Boolean(order?.hasShipping) || shippingAmount > 0,
            hasInstallation: Boolean(order?.hasInstallation) || installationAmount > 0,
            shippingAmount,
            installationAmount,
            paymentStatus,
            paid
        };

        refs.forEach(ref => {
            index.set(ref, detail);
        });
    });

    orderDetailsByReference = index;
}

function resolveOrderDetailsByPedido(pedido) {
    const refs = [
        pedido?.order_id,
        pedido?.external_reference,
        getOrderReference(pedido)
    ].map(normalizeOrderReferenceKey).filter(Boolean);

    for (const ref of refs) {
        const detail = orderDetailsByReference.get(ref);
        if (detail) {
            return detail;
        }
    }

    const shippingAmount = safeMoney(pedido?.envio);
    const installationAmount = deriveInstallationAmountFromPedido(pedido);
    const paymentStatus = normalizePaymentStatus(pedido?.payment_status);
    const paid = String(pedido?.paid || '').trim() === '1'
        || String(pedido?.paid || '').trim().toLowerCase() === 'true'
        || isPaymentStatusPaid(paymentStatus);

    return {
        itemsSummary: '',
        hasShipping: shippingAmount > 0,
        hasInstallation: installationAmount > 0,
        shippingAmount,
        installationAmount,
        paymentStatus,
        paid
    };
}

function resolveOrderPaymentState(pedido, orderDetails = {}) {
    const pedidoPaymentStatus = normalizePaymentStatus(pedido?.payment_status);
    const lookupPaymentStatus = normalizePaymentStatus(orderDetails?.paymentStatus);
    const paymentStatus = pedidoPaymentStatus || lookupPaymentStatus;

    const paidFromPedido = String(pedido?.paid || '').trim() === '1'
        || String(pedido?.paid || '').trim().toLowerCase() === 'true';
    const paidFromLookup = Boolean(orderDetails?.paid);
    const paidFromStatus = isPaymentStatusPaid(paymentStatus);
    const paidFromFulfillment = PAID_FULFILLMENT_STATUS_SET.has(String(pedido?.estado || '').trim().toLowerCase());

    const paid = paidFromPedido || paidFromLookup || paidFromStatus || paidFromFulfillment;
    return {
        paid,
        paymentStatus: paymentStatus || (paid ? 'approved' : 'pending'),
        label: paid ? 'Pagado' : 'Pendiente',
        className: paid ? 'is-paid' : 'is-pending'
    };
}

function initializeOrdersDataTable() {
    if (typeof window.DataTable !== 'function') {
        return;
    }

    if (adminOrdersDataTable) {
        adminOrdersDataTable.destroy();
        adminOrdersDataTable = null;
    }

    adminOrdersDataTable = new window.DataTable('#admin-orders-table', {
        pageLength: 25,
        lengthMenu: [10, 25, 50, 100],
        order: [[3, 'desc']],
        columnDefs: [
            {
                orderable: false,
                targets: [10]
            }
        ],
        language: {
            search: 'Buscar:',
            lengthMenu: 'Mostrar _MENU_ pedidos',
            info: 'Mostrando _START_ a _END_ de _TOTAL_ pedidos',
            infoEmpty: 'Sin pedidos para mostrar',
            emptyTable: 'No hay pedidos registrados',
            paginate: {
                first: 'Primero',
                previous: 'Anterior',
                next: 'Siguiente',
                last: 'Último'
            }
        }
    });
}

function renderOrdersTable(pedidos) {
    const body = document.getElementById('admin-orders-table-body');
    if (!body) return;

    const rows = Array.isArray(pedidos) ? pedidos : [];
    body.innerHTML = rows.map(pedido => {
        const parsedDate = new Date(String(pedido?.fecha_creado || ''));
        const dateOrderValue = Number.isNaN(parsedDate.getTime()) ? 0 : parsedDate.getTime();
        const total = safeMoney(pedido?.total);
        const statusCategory = normalizeStatusCategory(pedido?.estado);
        const statusMeta = resolveStatusMeta(pedido?.estado);
        const orderReference = getOrderReference(pedido);
        const orderDetails = resolveOrderDetailsByPedido(pedido);
        const paymentState = resolveOrderPaymentState(pedido, orderDetails);
        const furnitureLabel = orderDetails.itemsSummary || 'No disponible';
        const shippingLabel = orderDetails.hasShipping ? 'Con envío' : 'Sin envío';
        const installationLabel = orderDetails.hasInstallation ? 'Con instalación' : 'Sin instalación';
        const rowIdentifier = escapeHtml(String(pedido?.id ?? orderReference ?? ''));
        const customerLabel = String(pedido?.nombre || pedido?.email || pedido?.telefono || 'Pedido sin datos').trim();
        const orderReferenceLabel = orderReference || customerLabel;

        return `
            <tr data-status-category="${statusCategory}">
                <td>${escapeHtml(pedido?.id ?? '-')}</td>
                <td>
                    <p class="admin-order-customer-name">${escapeHtml(pedido?.nombre || '-')}</p>
                    <p class="admin-order-customer-meta">${escapeHtml(pedido?.email || '-')}</p>
                    <p class="admin-order-customer-meta">${escapeHtml(pedido?.telefono || '-')}</p>
                </td>
                <td><p class="admin-order-furniture">${escapeHtml(furnitureLabel)}</p></td>
                <td data-order="${dateOrderValue}">${escapeHtml(formatDate(pedido?.fecha_creado))}</td>
                <td data-order="${total}">${escapeHtml(formatArs(total))}</td>
                <td data-order="${orderDetails.hasShipping ? 1 : 0}">
                    <p class="admin-order-option-pill ${orderDetails.hasShipping ? 'is-on' : 'is-off'}">${shippingLabel}</p>
                </td>
                <td data-order="${orderDetails.hasInstallation ? 1 : 0}">
                    <p class="admin-order-option-pill ${orderDetails.hasInstallation ? 'is-on' : 'is-off'}">${installationLabel}</p>
                </td>
                <td>
                    <p class="admin-order-address">${escapeHtml(pedido?.direccion || '-')}</p>
                    <p class="admin-order-address">${escapeHtml(pedido?.ciudad || '-')} · ${escapeHtml(pedido?.provincia || '-')} · CP ${escapeHtml(pedido?.codigo_postal || '-')}</p>
                </td>
                <td>
                    <span class="admin-status-badge ${statusMeta.className}">
                        <span aria-hidden="true">${statusMeta.icon}</span>
                        ${statusMeta.label}
                    </span>
                </td>
                <td data-order="${paymentState.paid ? 1 : 0}">
                    <p class="admin-payment-badge ${paymentState.className}">${paymentState.label}</p>
                </td>
                <td>
                    <select
                        class="admin-status-select"
                        data-order-ref="${escapeHtml(orderReference)}"
                        data-row-id="${rowIdentifier}"
                        data-current-status="${statusCategory}"
                        aria-label="Cambiar estado del pedido ${escapeHtml(orderReferenceLabel)}"
                        ${orderReference ? '' : 'disabled'}
                    >
                        <option value="pending" ${statusCategory === 'pending' ? 'selected' : ''}>Pendiente</option>
                        <option value="shipped" ${statusCategory === 'shipped' ? 'selected' : ''}>Enviado</option>
                        <option value="closed" ${statusCategory === 'closed' ? 'selected' : ''}>Cerrado</option>
                    </select>
                    <p class="admin-order-status-hint">${orderReference ? 'Se guarda automáticamente al cambiar.' : 'Sin referencia para actualizar.'}</p>
                </td>
                <td><p class="admin-order-reference">${escapeHtml(pedido?.order_id || '-')}</p></td>
                <td><p class="admin-order-reference">${escapeHtml(pedido?.external_reference || '-')}</p></td>
            </tr>
        `;
    }).join('');

    initializeOrdersDataTable();
}

function updateFilterButtonsState() {
    const buttons = document.querySelectorAll('.admin-filter-btn');
    buttons.forEach(button => {
        const filter = String(button.getAttribute('data-status-filter') || 'all');
        const isActive = filter === activeStatusFilter;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function getFilteredPedidos() {
    if (!Array.isArray(latestPedidos)) {
        return [];
    }

    if (activeStatusFilter === 'all') {
        return latestPedidos;
    }

    return latestPedidos.filter(pedido => normalizeStatusCategory(pedido?.estado) === activeStatusFilter);
}

function renderFilteredPedidos() {
    const filtered = getFilteredPedidos();
    renderOrdersTable(filtered);
    updateFilterButtonsState();
}

function upsertPedidoStatusLocally(orderReference, nextStatus) {
    const normalizedReference = String(orderReference || '').trim();
    if (!normalizedReference) return;

    latestPedidos = latestPedidos.map(pedido => {
        const currentReference = getOrderReference(pedido);
        if (currentReference !== normalizedReference) {
            return pedido;
        }

        return {
            ...pedido,
            estado: String(nextStatus || pedido?.estado || '')
        };
    });
}

async function patchOrderStatus(orderReference, selectedCategory) {
    const nextStatus = STATUS_CATEGORY_TO_API[selectedCategory] || STATUS_CATEGORY_TO_API.pending;
    const response = await fetchWithTimeout(buildApiUrl(`/api/admin/orders/${encodeURIComponent(orderReference)}/status`), {
        method: 'PATCH',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ status: nextStatus })
    });

    let payload = {};
    try {
        payload = await response.json();
    } catch {
        payload = {};
    }

    if (response.status === 401 || response.status === 403) {
        window.location.href = '/admin/login';
        return null;
    }

    if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'No se pudo actualizar el estado del pedido.');
    }

    return payload;
}

async function handleOrderStatusChange(selectElement) {
    if (!(selectElement instanceof HTMLSelectElement)) {
        return;
    }

    const previousStatus = String(selectElement.getAttribute('data-current-status') || 'pending');
    const selectedCategory = String(selectElement.value || 'pending');
    const orderReference = String(selectElement.getAttribute('data-order-ref') || '').trim();

    if (!orderReference) {
        selectElement.value = previousStatus;
        setFeedback('El pedido no tiene referencia válida para actualizar estado.', 'error');
        return;
    }

    selectElement.disabled = true;
    setFeedback(`Actualizando estado de ${orderReference}...`, 'loading');

    try {
        const payload = await patchOrderStatus(orderReference, selectedCategory);
        if (!payload) {
            return;
        }
        const nextStatusFromApi = payload?.order?.fulfillmentStatus || STATUS_CATEGORY_TO_API[selectedCategory];
        upsertPedidoStatusLocally(orderReference, nextStatusFromApi);
        selectElement.setAttribute('data-current-status', selectedCategory);
        renderFilteredPedidos();
        setFeedback(`Estado actualizado para ${orderReference}.`, 'success');

        if (canViewMetricsPanel && overviewLoaded) {
            loadMetricsOverview({ silent: true }).catch(() => {
                // El panel de pedidos sigue operativo aunque falle la actualización de métricas.
            });
        }
    } catch (error) {
        selectElement.value = previousStatus;
        setFeedback(error?.message || 'No se pudo actualizar el estado del pedido.', 'error');
    } finally {
        selectElement.disabled = false;
    }
}

async function loadPedidos() {
    setFeedback('Cargando pedidos...', 'loading');

    const response = await fetchWithTimeout(buildApiUrl('/api/admin/pedidos?limit=1000'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include'
    });

    let payload = {};
    try {
        payload = await response.json();
    } catch {
        payload = {};
    }

    if (response.status === 401 || response.status === 403) {
        window.location.href = '/admin/login';
        return;
    }

    if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'No se pudieron cargar los pedidos.');
    }

    latestPedidos = Array.isArray(payload?.pedidos) ? payload.pedidos : [];
    renderFilteredPedidos();

    if (latestPedidos.length === 0) {
        setFeedback('Sin pedidos todavía.', 'success');
        return;
    }

    const source = String(payload?.source || 'mariadb').toLowerCase();
    if (source === 'json_fallback') {
        setFeedback('Panel cargado con respaldo local. Configurá MariaDB para operar en producción.', 'error');
        return;
    }

    setFeedback(`Pedidos cargados (${latestPedidos.length}).`, 'success');
}

function resolveMetricsPermission() {
    if (typeof window.isAdmin === 'boolean') {
        return window.isAdmin;
    }

    const context = window.ADMIN_CONTEXT || window.adminContext;
    if (context && typeof context === 'object') {
        if (typeof context.isAdmin === 'boolean') {
            return context.isAdmin;
        }

        const role = String(context.role || context.userRole || '').trim().toLowerCase();
        if (role) {
            return ['admin', 'root', 'owner', 'dueño', 'dueno'].includes(role);
        }
    }

    return true;
}

function setPanelHeading(panelKey) {
    const titleElement = document.getElementById('admin-panel-title');
    const descriptionElement = document.getElementById('admin-panel-description');
    const panelText = PANEL_TEXT[panelKey] || PANEL_TEXT.pedidos;

    if (titleElement) {
        titleElement.textContent = panelText.title;
    }

    if (descriptionElement) {
        descriptionElement.textContent = panelText.description;
    }
}

async function setActivePanel(panelKey) {
    let normalizedPanelKey = String(panelKey || 'pedidos').toLowerCase();
    if (normalizedPanelKey !== 'metricas') {
        normalizedPanelKey = 'pedidos';
    }

    if (normalizedPanelKey === 'metricas' && !canViewMetricsPanel) {
        normalizedPanelKey = 'pedidos';
    }

    const ordersPanel = document.getElementById('admin-panel-pedidos');
    const metricsPanel = document.getElementById('admin-panel-metricas');

    if (ordersPanel) {
        if (normalizedPanelKey === 'pedidos') {
            ordersPanel.removeAttribute('hidden');
        } else {
            ordersPanel.setAttribute('hidden', 'hidden');
        }
    }

    if (metricsPanel) {
        if (normalizedPanelKey === 'metricas') {
            metricsPanel.removeAttribute('hidden');
        } else {
            metricsPanel.setAttribute('hidden', 'hidden');
        }
    }

    document.querySelectorAll('.admin-sidebar-link[data-panel-target]').forEach(link => {
        const linkPanel = String(link.getAttribute('data-panel-target') || 'pedidos').toLowerCase();
        const isActive = linkPanel === normalizedPanelKey;
        link.classList.toggle('is-active', isActive);
        if (isActive) {
            link.setAttribute('aria-current', 'page');
        } else {
            link.removeAttribute('aria-current');
        }
    });

    setPanelHeading(normalizedPanelKey);

    if (normalizedPanelKey === 'metricas' && canViewMetricsPanel && !overviewLoaded) {
        try {
            await loadMetricsOverview();
        } catch (error) {
            setFeedback(error?.message || 'No se pudieron cargar las métricas.', 'error');
        }
    }
}

function getMonthKeyFromDate(value) {
    const parsed = new Date(String(value || ''));
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }

    const year = parsed.getUTCFullYear();
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function buildLastMonthsRange(totalMonths = 12) {
    const months = [];
    const formatter = new Intl.DateTimeFormat('es-AR', {
        month: 'short',
        year: 'numeric'
    });

    const now = new Date();
    for (let offset = totalMonths - 1; offset >= 0; offset -= 1) {
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
        const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
        months.push({
            key,
            label: formatter.format(date).replace('.', '')
        });
    }

    return months;
}

function isOrderPaidForMetrics(order) {
    const paymentStatus = normalizePaymentStatus(order?.paymentStatus);
    const paidFlag = Boolean(order?.paid) || isPaymentStatusPaid(paymentStatus);
    const fulfillmentStatus = String(order?.fulfillmentStatus || '').trim().toLowerCase();
    return paidFlag || PAID_FULFILLMENT_STATUS_SET.has(fulfillmentStatus);
}

function calculateOverviewMetrics(orders) {
    const allOrders = Array.isArray(orders) ? orders : [];
    const storeOrders = allOrders.filter(order => String(order?.orderType || 'tienda').toLowerCase() === 'tienda');
    const sourceOrders = (storeOrders.length > 0 ? storeOrders : allOrders).filter(isOrderPaidForMetrics);

    const months = buildLastMonthsRange(12);
    const monthTotalsMap = new Map(months.map(month => [month.key, 0]));
    const statusDistribution = {
        pending: 0,
        shipped: 0,
        closed: 0
    };

    let totalRevenue = 0;
    let totalOrders = 0;

    for (const order of sourceOrders) {
        const totalAmount = Number(order?.totals?.total) || 0;
        totalRevenue += totalAmount;
        totalOrders += 1;

        const monthKey = getMonthKeyFromDate(order?.createdAt || order?.updatedAt);
        if (monthTotalsMap.has(monthKey)) {
            monthTotalsMap.set(monthKey, (monthTotalsMap.get(monthKey) || 0) + totalAmount);
        }

        const statusCategory = normalizeStatusCategory(order?.fulfillmentStatus);
        statusDistribution[statusCategory] += 1;
    }

    const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const monthKeys = months.map(month => month.key);
    const currentMonthTotal = Number(monthTotalsMap.get(monthKeys[monthKeys.length - 1]) || 0);
    const previousMonthTotal = Number(monthTotalsMap.get(monthKeys[monthKeys.length - 2]) || 0);

    let monthOverMonthPercent = 0;
    if (previousMonthTotal > 0) {
        monthOverMonthPercent = ((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100;
    } else if (currentMonthTotal > 0) {
        monthOverMonthPercent = 100;
    }

    return {
        totalRevenue,
        totalOrders,
        averageTicket,
        monthOverMonthPercent,
        monthLabels: months.map(month => month.label),
        monthTotals: months.map(month => Number(monthTotalsMap.get(month.key) || 0)),
        statusDistribution
    };
}

function updateRevenueDelta(deltaPercent) {
    const deltaContainer = document.getElementById('admin-metric-revenue-delta');
    const deltaIcon = document.getElementById('admin-metric-revenue-trend-icon');
    const deltaText = document.getElementById('admin-metric-revenue-trend-text');
    if (!deltaContainer || !deltaIcon || !deltaText) {
        return;
    }

    deltaContainer.classList.remove('is-up', 'is-down');

    if (deltaPercent > 0.01) {
        deltaContainer.classList.add('is-up');
        deltaIcon.textContent = '▲';
        deltaText.textContent = `+${formatPercent(deltaPercent)} vs mes anterior`;
        return;
    }

    if (deltaPercent < -0.01) {
        deltaContainer.classList.add('is-down');
        deltaIcon.textContent = '▼';
        deltaText.textContent = `-${formatPercent(deltaPercent)} vs mes anterior`;
        return;
    }

    deltaIcon.textContent = '•';
    deltaText.textContent = '0,0% vs mes anterior';
}

function renderMetricsCards(metrics) {
    const revenueElement = document.getElementById('admin-metric-revenue');
    const ordersElement = document.getElementById('admin-metric-orders');
    const averageTicketElement = document.getElementById('admin-metric-average-ticket');

    if (revenueElement) {
        revenueElement.textContent = formatArs(metrics.totalRevenue);
    }

    if (ordersElement) {
        ordersElement.textContent = String(metrics.totalOrders);
    }

    if (averageTicketElement) {
        averageTicketElement.textContent = formatArs(metrics.averageTicket);
    }

    updateRevenueDelta(metrics.monthOverMonthPercent);
}

function destroyExistingCharts() {
    if (salesTrendChart) {
        salesTrendChart.destroy();
        salesTrendChart = null;
    }

    if (orderStatusChart) {
        orderStatusChart.destroy();
        orderStatusChart = null;
    }
}

async function ensureChartJsLoaded() {
    if (typeof window.Chart === 'function') {
        return;
    }

    if (chartJsLoadPromise) {
        return chartJsLoadPromise;
    }

    chartJsLoadPromise = new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
            chartJsLoadPromise = null;
            reject(new Error('No se pudo cargar Chart.js para renderizar métricas.'));
        }, 9000);

        const handleReady = () => {
            if (typeof window.Chart === 'function') {
                window.clearTimeout(timeoutId);
                resolve();
            }
        };

        const onLoad = () => {
            handleReady();
            if (typeof window.Chart !== 'function') {
                chartJsLoadPromise = null;
                reject(new Error('No se pudo cargar Chart.js para renderizar métricas.'));
            }
        };

        const onError = () => {
            window.clearTimeout(timeoutId);
            chartJsLoadPromise = null;
            reject(new Error('No se pudo cargar Chart.js para renderizar métricas.'));
        };

        const existing = document.querySelector('script[src*="chart.umd.min.js"], script[src*="chart.js"]');
        if (existing) {
            existing.addEventListener('load', onLoad, { once: true });
            existing.addEventListener('error', onError, { once: true });
            handleReady();
            return;
        }

        const script = document.createElement('script');
        script.src = CHART_JS_CDN_URL;
        script.async = true;
        script.addEventListener('load', onLoad, { once: true });
        script.addEventListener('error', onError, { once: true });
        document.head.appendChild(script);
    });

    return chartJsLoadPromise;
}

function renderMetricsCharts(metrics) {
    if (typeof window.Chart !== 'function') {
        throw new Error('No se pudo cargar Chart.js para renderizar métricas.');
    }

    const salesChartCanvas = document.getElementById('admin-sales-trend-chart');
    const ordersStatusCanvas = document.getElementById('admin-orders-status-chart');
    if (!(salesChartCanvas instanceof HTMLCanvasElement) || !(ordersStatusCanvas instanceof HTMLCanvasElement)) {
        return;
    }

    destroyExistingCharts();

    salesTrendChart = new window.Chart(salesChartCanvas, {
        type: 'line',
        data: {
            labels: metrics.monthLabels,
            datasets: [
                {
                    label: 'Ventas mensuales',
                    data: metrics.monthTotals,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 3,
                    borderColor: 'rgba(60, 133, 183, 1)',
                    backgroundColor: 'rgba(78, 161, 186, 0.18)'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            return ` ${formatArs(context?.parsed?.y || 0)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(17, 56, 78, 0.1)'
                    },
                    ticks: {
                        callback(value) {
                            return formatArs(value);
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });

    orderStatusChart = new window.Chart(ordersStatusCanvas, {
        type: 'doughnut',
        data: {
            labels: ['Pendientes', 'Enviados', 'Cerrados'],
            datasets: [
                {
                    data: [
                        metrics.statusDistribution.pending,
                        metrics.statusDistribution.shipped,
                        metrics.statusDistribution.closed
                    ],
                    backgroundColor: [
                        'rgba(244, 193, 84, 0.86)',
                        'rgba(82, 168, 210, 0.86)',
                        'rgba(76, 182, 135, 0.86)'
                    ],
                    borderColor: 'rgba(255, 255, 255, 0.95)',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            },
            cutout: '60%'
        }
    });
}

async function loadMetricsOverview(options = {}) {
    const { silent = false } = options;
    if (!silent) {
        setFeedback('Cargando métricas...', 'loading');
    }

    const response = await fetchWithTimeout(buildApiUrl('/api/admin/overview?limit=1000'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include'
    });

    let payload = {};
    try {
        payload = await response.json();
    } catch {
        payload = {};
    }

    if (response.status === 401 || response.status === 403) {
        window.location.href = '/admin/login';
        return;
    }

    if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'No se pudieron cargar las métricas.');
    }

    const overviewOrders = Array.isArray(payload?.orders) ? payload.orders : [];
    buildOrderDetailsIndex(overviewOrders);
    if (latestPedidos.length > 0) {
        renderFilteredPedidos();
    }

    const metrics = calculateOverviewMetrics(overviewOrders);
    renderMetricsCards(metrics);
    await ensureChartJsLoaded();
    renderMetricsCharts(metrics);
    overviewLoaded = true;

    if (!silent) {
        setFeedback('Métricas actualizadas.', 'success');
    }
}

function bindPanelNavigation() {
    const links = document.querySelectorAll('.admin-sidebar-link[data-panel-target]');
    links.forEach(link => {
        link.addEventListener('click', async () => {
            const panelTarget = String(link.getAttribute('data-panel-target') || 'pedidos').toLowerCase();
            await setActivePanel(panelTarget);
        });
    });
}

function bindFilters() {
    document.querySelectorAll('.admin-filter-btn').forEach(button => {
        button.addEventListener('click', () => {
            const statusFilter = String(button.getAttribute('data-status-filter') || 'all').toLowerCase();
            activeStatusFilter = statusFilter;
            renderFilteredPedidos();
        });
    });
}

function bindOrderStatusUpdates() {
    const tableBody = document.getElementById('admin-orders-table-body');
    if (!tableBody) {
        return;
    }

    tableBody.addEventListener('change', event => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const statusSelect = target.closest('.admin-status-select');
        if (!(statusSelect instanceof HTMLSelectElement)) {
            return;
        }

        handleOrderStatusChange(statusSelect).catch(error => {
            setFeedback(error?.message || 'No se pudo actualizar el estado.', 'error');
        });
    });
}

function applyMetricsVisibility() {
    const metricsNavButton = document.getElementById('admin-metrics-nav-btn');
    const metricsPanel = document.getElementById('admin-panel-metricas');

    if (canViewMetricsPanel) {
        return;
    }

    if (metricsNavButton) {
        metricsNavButton.setAttribute('hidden', 'hidden');
    }

    if (metricsPanel) {
        metricsPanel.setAttribute('hidden', 'hidden');
    }
}

function setSidebarCollapsedState(collapsed) {
    const shell = document.querySelector('.admin-dashboard-shell');
    const toggleButton = document.getElementById('admin-sidebar-toggle-btn');
    if (!shell) {
        return;
    }

    const isCollapsed = Boolean(collapsed);
    shell.classList.toggle('is-sidebar-collapsed', isCollapsed);

    if (toggleButton) {
        toggleButton.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        toggleButton.setAttribute('aria-label', isCollapsed ? 'Mostrar panel interno' : 'Ocultar panel interno');
        toggleButton.setAttribute('title', isCollapsed ? 'Mostrar panel interno' : 'Ocultar panel interno');
        const label = toggleButton.querySelector('.admin-sidebar-toggle-label');
        if (label) {
            label.textContent = isCollapsed ? 'Mostrar panel' : 'Ocultar panel';
        }
    }
}

function loadSidebarCollapsedPreference() {
    try {
        return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

function saveSidebarCollapsedPreference(isCollapsed) {
    try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, isCollapsed ? '1' : '0');
    } catch {
        // Ignora escenarios con storage bloqueado.
    }
}

function bindSidebarToggle() {
    const toggleButton = document.getElementById('admin-sidebar-toggle-btn');
    if (!toggleButton) {
        return;
    }

    setSidebarCollapsedState(loadSidebarCollapsedPreference());

    toggleButton.addEventListener('click', () => {
        const shell = document.querySelector('.admin-dashboard-shell');
        const nextState = !(shell && shell.classList.contains('is-sidebar-collapsed'));
        setSidebarCollapsedState(nextState);
        saveSidebarCollapsedPreference(nextState);
    });
}

function bindMainActions() {
    document.getElementById('admin-refresh-btn')?.addEventListener('click', async () => {
        try {
            await loadPedidos();

            const metricsPanel = document.getElementById('admin-panel-metricas');
            const metricsVisible = metricsPanel ? !metricsPanel.hasAttribute('hidden') : false;
            if (canViewMetricsPanel && (metricsVisible || overviewLoaded)) {
                await loadMetricsOverview({ silent: true });
            }

            setFeedback('Panel actualizado.', 'success');
        } catch (error) {
            setFeedback(error?.message || 'No se pudo actualizar el panel.', 'error');
        }
    });

    document.getElementById('admin-export-csv-btn')?.addEventListener('click', () => {
        exportPedidosCsv(latestPedidos);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const path = String(window.location.pathname || '').toLowerCase();
    if (path !== '/admin/pedidos') {
        return;
    }

    canViewMetricsPanel = resolveMetricsPermission();
    applyMetricsVisibility();

    bindMainActions();
    bindFilters();
    bindOrderStatusUpdates();
    bindPanelNavigation();
    bindSidebarToggle();

    setActivePanel('pedidos').catch(() => {
        // El panel inicia por defecto en pedidos.
    });

    loadPedidos().catch(error => {
        setFeedback(error?.message || 'No se pudieron cargar los pedidos.', 'error');
    });

    if (canViewMetricsPanel) {
        loadMetricsOverview({ silent: true }).catch(() => {
            // Se reintenta cuando el usuario abre la pestaña de métricas.
        });
    }
});
