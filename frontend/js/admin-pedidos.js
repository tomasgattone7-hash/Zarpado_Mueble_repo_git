const ADMIN_ORDERS_FETCH_TIMEOUT_MS = 15000;

let adminOrdersDataTable = null;
let latestPedidos = [];

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

function renderOrdersTable(pedidos) {
    const body = document.getElementById('admin-orders-table-body');
    if (!body) return;

    const rows = Array.isArray(pedidos) ? pedidos : [];
    body.innerHTML = rows.map(pedido => `
        <tr>
            <td>${escapeHtml(pedido?.id ?? '-')}</td>
            <td>${escapeHtml(formatDate(pedido?.fecha_creado))}</td>
            <td>${escapeHtml(pedido?.nombre || '-')}</td>
            <td>${escapeHtml(pedido?.email || '-')}</td>
            <td>${escapeHtml(pedido?.telefono || '-')}</td>
            <td>${escapeHtml(pedido?.direccion || '-')}</td>
            <td>${escapeHtml(pedido?.ciudad || '-')}</td>
            <td>${escapeHtml(pedido?.provincia || '-')}</td>
            <td>${escapeHtml(pedido?.codigo_postal || '-')}</td>
            <td>${escapeHtml(formatArs(pedido?.subtotal))}</td>
            <td>${escapeHtml(formatArs(pedido?.envio))}</td>
            <td>${escapeHtml(formatArs(pedido?.total))}</td>
            <td>${escapeHtml(pedido?.estado || '-')}</td>
            <td>${escapeHtml(pedido?.order_id || '-')}</td>
            <td>${escapeHtml(pedido?.external_reference || '-')}</td>
        </tr>
    `).join('');

    if (typeof window.DataTable !== 'function') {
        return;
    }

    if (adminOrdersDataTable) {
        adminOrdersDataTable.destroy();
    }

    adminOrdersDataTable = new DataTable('#admin-orders-table', {
        pageLength: 25,
        lengthMenu: [10, 25, 50, 100],
        order: [[1, 'desc']],
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

async function loadPedidos() {
    setFeedback('Cargando pedidos...', 'loading');

    const response = await fetchWithTimeout(buildApiUrl('/api/admin/pedidos'), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include'
    });

    let payload = {};
    try {
        payload = await response.json();
    } catch (error) {
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
    renderOrdersTable(latestPedidos);

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

document.addEventListener('DOMContentLoaded', () => {
    const path = String(window.location.pathname || '').toLowerCase();
    if (path !== '/admin/pedidos') {
        return;
    }

    document.getElementById('admin-refresh-btn')?.addEventListener('click', async () => {
        try {
            await loadPedidos();
        } catch (error) {
            setFeedback(error?.message || 'No se pudieron actualizar los pedidos.', 'error');
        }
    });

    document.getElementById('admin-export-csv-btn')?.addEventListener('click', () => {
        exportPedidosCsv(latestPedidos);
    });

    loadPedidos().catch(error => {
        setFeedback(error?.message || 'No se pudieron cargar los pedidos.', 'error');
    });
});
