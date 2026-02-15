function formatOrderCurrency(value) {
    return `$${Number(value || 0).toLocaleString('es-AR')}`;
}

function normalizeOrderPostalCode(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 4);
}

function setFormFeedback(message, type = '') {
    const feedback = document.getElementById('delivery-form-feedback');
    if (!feedback) return;

    feedback.textContent = message || '';
    feedback.classList.remove('is-success', 'is-error');
    if (type === 'success') feedback.classList.add('is-success');
    if (type === 'error') feedback.classList.add('is-error');
}

function setAddressFieldsRequired(required) {
    ['street', 'streetNumber', 'city', 'province', 'postalCode'].forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (!element) return;
        element.required = required;
    });
}

function getOrderIdFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return String(
        params.get('order_id')
        || params.get('external_reference')
        || ''
    ).trim().toUpperCase();
}

function getPreferenceIdFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return String(params.get('preference_id') || '').trim();
}

async function loadOrderData() {
    const orderId = getOrderIdFromQuery();
    const preferenceId = getPreferenceIdFromQuery();
    const summaryOrderId = document.getElementById('order-id-text');
    const hiddenOrderId = document.getElementById('delivery-order-id');

    if (summaryOrderId) summaryOrderId.textContent = orderId || 'No informado';
    if (hiddenOrderId) hiddenOrderId.value = orderId;

    let response;
    if (orderId) {
        response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
            method: 'GET',
            headers: { Accept: 'application/json' }
        });
    } else if (preferenceId) {
        response = await fetch(`/api/orders/by-preference/${encodeURIComponent(preferenceId)}`, {
            method: 'GET',
            headers: { Accept: 'application/json' }
        });
    } else {
        throw new Error('No recibimos un número de pedido válido. Revisá el enlace de pago.');
    }

    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload.error || 'No pudimos cargar los datos del pedido.');
    }

    if (summaryOrderId) summaryOrderId.textContent = payload.orderId || orderId || 'No informado';
    if (hiddenOrderId) hiddenOrderId.value = payload.orderId || orderId || '';

    return payload;
}

function applyOrderToForm(orderData) {
    const methodText = document.getElementById('order-delivery-method');
    const totalText = document.getElementById('order-total-text');
    const modeNote = document.getElementById('delivery-mode-note');
    const shippingAddressSection = document.getElementById('shipping-address-section');
    const postalCodeInput = document.getElementById('postalCode');

    const isPickup = orderData?.delivery?.method === 'pickup';

    if (methodText) {
        methodText.textContent = isPickup
            ? `Retiro por fábrica (${orderData.factoryPickup?.address || ''})`
            : `Envío a domicilio (CP ${orderData?.delivery?.postalCode || '-'})`;
    }

    if (totalText) {
        totalText.textContent = formatOrderCurrency(orderData?.totals?.total || 0);
    }

    if (modeNote) {
        modeNote.textContent = isPickup
            ? `Retiro sin costo. ${orderData.factoryPickup?.note || ''}`
            : 'Instalación solo en Buenos Aires y sujeta a disponibilidad por código postal. Instalaciones complejas se cotizan aparte.';
    }

    if (shippingAddressSection) {
        shippingAddressSection.hidden = isPickup;
    }

    setAddressFieldsRequired(!isPickup);

    if (postalCodeInput) {
        if (isPickup) {
            postalCodeInput.value = '';
        } else {
            postalCodeInput.value = normalizeOrderPostalCode(orderData?.delivery?.postalCode || '');
        }
    }
}

function readPaymentQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const paymentId = String(params.get('payment_id') || params.get('collection_id') || '').trim();
    const preferenceId = String(params.get('preference_id') || '').trim();
    const paymentStatus = String(params.get('status') || params.get('collection_status') || '').trim();

    const paymentIdInput = document.getElementById('delivery-payment-id');
    const preferenceIdInput = document.getElementById('delivery-preference-id');
    const paymentStatusInput = document.getElementById('delivery-payment-status');

    if (paymentIdInput) paymentIdInput.value = paymentId;
    if (preferenceIdInput) preferenceIdInput.value = preferenceId;
    if (paymentStatusInput) paymentStatusInput.value = paymentStatus;

    return { paymentId, preferenceId, paymentStatus };
}

function buildDeliveryDetailsPayload() {
    const form = document.getElementById('delivery-data-form');
    const formData = new FormData(form);
    const payload = {};

    formData.forEach((value, key) => {
        payload[key] = String(value || '').trim();
    });

    payload.postalCode = normalizeOrderPostalCode(payload.postalCode);
    payload.orderId = String(payload.orderId || '').toUpperCase();

    if (payload.receiverType !== 'otra_persona') {
        payload.receiverName = '';
    }

    return payload;
}

async function submitDeliveryData(event, orderData) {
    event.preventDefault();
    setFormFeedback('');

    const submitButton = document.getElementById('delivery-submit-btn');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Guardando...';
    }

    try {
        const csrfToken = await getCsrfToken();
        const payload = buildDeliveryDetailsPayload();

        const response = await fetch(`/api/orders/${encodeURIComponent(orderData.orderId)}/delivery-details`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'No pudimos guardar los datos.');
        }

        setFormFeedback(
            'Datos recibidos. Te contactaremos para coordinar la entrega/instalación/retiro.',
            'success'
        );

        try {
            localStorage.removeItem('zarpadoCart');
        } catch (error) {
            // Ignore blocked storage scenarios.
        }
    } catch (error) {
        setFormFeedback(error.message || 'Ocurrió un error al guardar tus datos.', 'error');
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Guardar datos';
        }
    }
}

async function initDeliveryDataPage() {
    if (!window.location.pathname.toLowerCase().includes('datos-envio')) {
        return;
    }

    try {
        const orderData = await loadOrderData();
        const paymentQuery = readPaymentQueryParams();

        if (paymentQuery.preferenceId && orderData.preferenceId && paymentQuery.preferenceId !== orderData.preferenceId) {
            throw new Error('El enlace no coincide con la preferencia de pago de este pedido.');
        }

        applyOrderToForm(orderData);

        const form = document.getElementById('delivery-data-form');
        form?.addEventListener('submit', event => submitDeliveryData(event, orderData));
    } catch (error) {
        setFormFeedback(error.message || 'No pudimos cargar el pedido.', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initDeliveryDataPage();
});
