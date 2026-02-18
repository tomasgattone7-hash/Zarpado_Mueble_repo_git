function setAdminLoginFeedback(message, type = '') {
    const feedback = document.getElementById('admin-login-feedback');
    if (!feedback) return;

    feedback.textContent = message || '';
    feedback.classList.remove('is-success', 'is-error', 'is-loading');
    if (type === 'success') feedback.classList.add('is-success');
    if (type === 'error') feedback.classList.add('is-error');
    if (type === 'loading') feedback.classList.add('is-loading');
}

function getLoginErrorFromQuery() {
    const params = new URLSearchParams(window.location.search || '');
    const errorCode = String(params.get('error') || '').trim();
    if (!errorCode) {
        return '';
    }

    if (errorCode === 'invalid_credentials') {
        return 'Credenciales inválidas. Revisá usuario y contraseña.';
    }

    return 'No se pudo iniciar sesión.';
}

document.addEventListener('DOMContentLoaded', () => {
    const path = String(window.location.pathname || '').toLowerCase();
    if (path !== '/admin/login') {
        return;
    }

    const queryError = getLoginErrorFromQuery();
    if (queryError) {
        setAdminLoginFeedback(queryError, 'error');
    }

    const form = document.getElementById('admin-login-form');
    const submitButton = document.getElementById('admin-login-submit');
    if (!form || !submitButton) return;

    form.addEventListener('submit', () => {
        submitButton.disabled = true;
        submitButton.textContent = 'Ingresando...';
        setAdminLoginFeedback('Validando credenciales...', 'loading');
    });
});
