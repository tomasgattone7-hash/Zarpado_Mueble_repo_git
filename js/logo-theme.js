(function logoThemeController() {
    const LIGHT_LOGO = '/assets/favicon/apple-touch-icon.png?v=2';
    const DARK_LOGO = '/assets/favicon/apple-touch-iconblanco.png?v=2';
    const themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function isDarkTheme() {
        const html = document.documentElement;
        const body = document.body;
        const htmlDataTheme = String(html?.getAttribute('data-theme') || '').toLowerCase();
        const bodyDataTheme = String(body?.getAttribute('data-theme') || '').toLowerCase();

        if (htmlDataTheme === 'dark' || bodyDataTheme === 'dark') {
            return true;
        }

        if (htmlDataTheme === 'light' || bodyDataTheme === 'light') {
            return false;
        }

        if (html?.classList.contains('dark') || body?.classList.contains('dark')) {
            return true;
        }

        if (html?.classList.contains('light') || body?.classList.contains('light')) {
            return false;
        }

        const toggleButton = document.querySelector('.js-theme-toggle[aria-pressed]');
        if (toggleButton) {
            return toggleButton.getAttribute('aria-pressed') === 'true';
        }

        return themeMediaQuery.matches;
    }

    function applyDynamicLogo() {
        const useDarkLogo = isDarkTheme();
        const nextSource = useDarkLogo ? DARK_LOGO : LIGHT_LOGO;

        document.querySelectorAll('img.logo-dinamico').forEach((logoImage) => {
            if (logoImage.getAttribute('src') !== nextSource) {
                logoImage.setAttribute('src', nextSource);
            }
        });
    }

    function observeThemeChanges() {
        const observer = new MutationObserver(() => {
            applyDynamicLogo();
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class', 'data-theme']
        });

        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['class', 'data-theme']
            });
        }
    }

    function bindThemeChangeListeners() {
        if (typeof themeMediaQuery.addEventListener === 'function') {
            themeMediaQuery.addEventListener('change', applyDynamicLogo);
        } else if (typeof themeMediaQuery.addListener === 'function') {
            themeMediaQuery.addListener(applyDynamicLogo);
        }

        document.addEventListener('click', (event) => {
            const target = event.target instanceof Element
                ? event.target.closest('.js-theme-toggle')
                : null;

            if (!target) {
                return;
            }

            requestAnimationFrame(applyDynamicLogo);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            applyDynamicLogo();
            observeThemeChanges();
            bindThemeChangeListeners();
        });
        return;
    }

    applyDynamicLogo();
    observeThemeChanges();
    bindThemeChangeListeners();
})();
