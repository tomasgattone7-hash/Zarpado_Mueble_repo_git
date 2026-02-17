const CHECKOUT_SHIPPING_STORAGE_KEY = 'checkoutShippingData';
const CART_STORAGE_KEY = 'zarpadoCart';
const PHONE_PATTERN = /^[0-9+()\-\s]{6,40}$/;

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

function getStoredShippingData() {
    try {
        const raw = sessionStorage.getItem(CHECKOUT_SHIPPING_STORAGE_KEY) || localStorage.getItem(CHECKOUT_SHIPPING_STORAGE_KEY);
        const parsed = JSON.parse(raw || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        return {};
    }
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

function normalizePostalCode(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 4);
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

function redirectIfCartMissing() {
    const cart = getStoredCart();
    if (cart.length > 0) {
        return false;
    }

    setShippingFeedback('Tu carrito está vacío. Te llevamos a la tienda para continuar.', 'error');
    setTimeout(() => {
        window.location.href = '/tienda';
    }, 1200);
    return true;
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

    const form = document.getElementById('shipping-step-form');
    const submitButton = document.getElementById('shipping-step-submit');
    if (!form || !submitButton) return;

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = readFormData();
        if (!validateFormData(data)) {
            setShippingFeedback('Revisá los campos marcados para continuar.', 'error');
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = 'Guardando...';
        setShippingFeedback('Guardando datos de envío...', 'loading');

        try {
            const payload = {
                ...data,
                savedAt: new Date().toISOString()
            };
            sessionStorage.setItem(CHECKOUT_SHIPPING_STORAGE_KEY, JSON.stringify(payload));
            localStorage.setItem(CHECKOUT_SHIPPING_STORAGE_KEY, JSON.stringify(payload));
            setShippingFeedback('Datos guardados. Avanzando al paso 2...', 'success');
            setTimeout(() => {
                window.location.href = '/confirmacion';
            }, 350);
        } catch (error) {
            setShippingFeedback('No pudimos guardar los datos. Intentá nuevamente.', 'error');
            submitButton.disabled = false;
            submitButton.textContent = 'Continuar a confirmación';
        }
    });
});
