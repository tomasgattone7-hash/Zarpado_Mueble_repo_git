/* Runtime API config loaded before script.min.js */
(function applyRuntimeConfig() {
    if (typeof window === 'undefined') {
        return;
    }

    const trim = value => String(value || '').trim();
    const runtimeConfig = window.__ZM_RUNTIME_CONFIG__ || {};

    const apiBaseFromRuntime = trim(window.ZM_API_BASE_URL || runtimeConfig.ZM_API_BASE_URL);
    if (apiBaseFromRuntime) {
        window.ZM_API_BASE_URL = apiBaseFromRuntime;
    }

    const prodApiBase = trim(window.ZM_PROD_API_BASE_URL || runtimeConfig.ZM_PROD_API_BASE_URL);
    if (prodApiBase) {
        window.ZM_PROD_API_BASE_URL = prodApiBase;
    }

    const localApiBase = trim(window.ZM_LOCAL_API_BASE_URL || runtimeConfig.ZM_LOCAL_API_BASE_URL);
    if (localApiBase) {
        window.ZM_LOCAL_API_BASE_URL = localApiBase;
    }
})();
