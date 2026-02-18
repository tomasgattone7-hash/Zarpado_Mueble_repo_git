(function siteShellBootstrap() {
    const navLinks = [
        { key: 'inicio', href: '/', label: 'Inicio', type: 'link' },
        { key: 'tienda', href: '/tienda', label: 'Tienda', type: 'link' },
        { key: 'amedida', href: '/a-medida', label: 'A Medida', type: 'link' },
        { key: 'nosotros', href: '/nosotros', label: 'Nosotros', type: 'link' },
        { key: 'contacto', href: '/contacto', label: 'Contacto', type: 'button' }
    ];

    const legalLinks = [
        { href: '/envios', label: 'Política de Envíos' },
        { href: '/garantia', label: 'Garantía' },
        { href: '/privacidad', label: 'Política de Privacidad' },
        { href: '/reembolso', label: 'Política de Reembolso' },
        { href: '/terminos', label: 'Términos de Servicio' }
    ];

    function getPageKeyFromPath() {
        const pathname = String(window.location.pathname || '').toLowerCase();
        if (pathname.startsWith('/tienda/')) return 'tienda';
        if (pathname === '/tienda') return 'tienda';
        if (pathname === '/a-medida') return 'amedida';
        if (pathname === '/nosotros') return 'nosotros';
        if (pathname === '/contacto') return 'contacto';

        const fileName = pathname.split('/').pop() || 'index.html';
        const slug = fileName.replace(/\.html$/, '');

        if (!slug || slug === 'index') return 'inicio';
        if (slug === 'tienda' || slug === 'catalogo') return 'tienda';
        if (slug === 'a-medida' || slug === 'amedida' || slug === 'servicios') return 'amedida';
        if (slug === 'nosotros') return 'nosotros';
        if (slug === 'contacto') return 'contacto';
        return '';
    }

    function buildNavMarkup(activeKey) {
        const linksMarkup = navLinks.map(link => {
            const isActive = activeKey === link.key;
            if (link.type === 'button') {
                return `<li><a href="${link.href}" class="btn-nav${isActive ? ' active' : ''}">${link.label}</a></li>`;
            }

            return `<li><a href="${link.href}" class="nav-link${isActive ? ' active' : ''}">${link.label}</a></li>`;
        }).join('');

        return `
            <header class="navbar">
                <div class="container navbar-container">
                    <a href="/" class="logo" aria-label="Zarpado Mueble - Inicio">
                        <img
                            class="logo-dinamico"
                            src="/assets/logo_blanco.svg"
                            data-logo-light="/assets/logo_negro.svg"
                            data-logo-dark="/assets/logo_blanco.svg"
                            alt="Zarpado Mueble"
                        >
                    </a>

                    <nav id="primary-navigation" class="nav-menu" aria-label="Menú principal">
                        <ul>
                            ${linksMarkup}
                        </ul>
                    </nav>

                    <div class="nav-icons">
                        <button class="cart-icon js-toggle-cart" type="button" aria-label="Abrir carrito" aria-expanded="false" aria-controls="cartSidebar">
                            <i class="fas fa-shopping-bag" aria-hidden="true"></i>
                            <span class="cart-count">0</span>
                        </button>
                        <button class="hamburger" type="button" aria-label="Abrir menú" aria-expanded="false" aria-controls="primary-navigation">
                            <span class="bar"></span>
                            <span class="bar"></span>
                            <span class="bar"></span>
                        </button>
                    </div>
                </div>
            </header>
        `;
    }

    function buildCartMarkup() {
        return `
            <div class="cart-sidebar" id="cartSidebar" aria-label="Carrito de compras">
                <div class="cart-header">
                    <h3>Tu carrito</h3>
                    <button class="close-cart js-toggle-cart" type="button" aria-label="Cerrar carrito">&times;</button>
                </div>
                <div class="cart-items" id="cartItems">
                    <p style="text-align:center; color: #888; margin-top: 2rem;">Tu carrito está vacío.</p>
                </div>
                <div class="cart-footer">
                    <div class="cart-total-row">
                        <span>Total:</span>
                        <span id="cartTotal">$0</span>
                    </div>
                    <button class="btn btn-primary js-checkout" type="button" style="width: 100%;">Iniciar compra</button>
                </div>
            </div>

            <div id="cart-notification" class="cart-notification" aria-live="polite">
                <i class="fas fa-shopping-bag" style="color: var(--color-accent); font-size: 1.5rem;" aria-hidden="true"></i>
                <div>
                    <p>Tenés productos en tu carrito</p>
                    <p style="font-size: 0.8rem; color: #aaa;">Finalizá la compra cuando quieras.</p>
                </div>
                <button class="cart-notification-close js-close-notification" type="button" aria-label="Cerrar aviso">&times;</button>
            </div>
        `;
    }

    function buildFooterMarkup() {
        const navMarkup = navLinks.map(link => `<a href="${link.href}" class="nav-link" style="font-size: 0.9rem;">${link.label}</a>`).join('');
        const legalMarkup = legalLinks.map(link => `<a href="${link.href}" class="nav-link" style="font-size: 0.8rem; color: #666;">${link.label}</a>`).join('');

        return `
            <footer class="footer">
                <div class="container">
                    <div class="footer-content">
                        <div class="footer-brand">
                            <a href="/" class="logo" aria-label="Zarpado Mueble - Inicio">
                                <img
                                    class="logo-dinamico"
                                    src="/assets/logo_blanco.svg"
                                    data-logo-light="/assets/logo_negro.svg"
                                    data-logo-dark="/assets/logo_blanco.svg"
                                    alt="Zarpado Mueble"
                                >
                            </a>
                            <p style="color: var(--color-text-muted); margin-top: 10px; font-size: 0.9rem;">Diseño, fabricación local y atención personalizada.</p>
                        </div>
                        <div class="footer-links" style="display: flex; gap: 20px; flex-wrap: wrap;">
                            ${navMarkup}
                        </div>
                        <div class="footer-socials">
                            <a href="https://www.instagram.com/zarpadomuebleoficial/" target="_blank" rel="noopener noreferrer" class="social-icon" aria-label="Instagram"><i class="fab fa-instagram" aria-hidden="true"></i></a>
                            <a href="https://www.facebook.com/profile.php?id=61583196106459" target="_blank" rel="noopener noreferrer" class="social-icon" aria-label="Facebook"><i class="fab fa-facebook" aria-hidden="true"></i></a>
                            <a href="mailto:contacto@zarpadomueble.com" class="social-icon" aria-label="Email"><i class="fas fa-envelope" aria-hidden="true"></i></a>
                        </div>
                    </div>
                    <div class="text-center" style="margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.05);">
                        <div style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; margin-bottom: 1rem;">
                            ${legalMarkup}
                        </div>
                        <p style="font-size: 0.8rem; color: #444;">&copy; 2026 Zarpado Mueble. Todos los derechos reservados.</p>
                    </div>
                </div>
            </footer>
        `;
    }

    function buildTrustBlockMarkup() {
        return `
            <section class="section trust-block-section" aria-label="Beneficios Zarpado Mueble">
                <div class="container">
                    <div class="text-center reveal">
                        <span class="section-tag">Confianza</span>
                        <h2 class="section-title">Por qué elegirnos para comprar y para cotizar</h2>
                    </div>
                    <div class="grid-3 trust-grid">
                        <article class="feature-card reveal-up">
                            <i class="fas fa-map-marker-alt feature-icon" aria-hidden="true"></i>
                            <h3 class="feature-title">Fabricación local</h3>
                            <p class="feature-text">Diseñamos y fabricamos en Buenos Aires, con seguimiento humano en cada etapa.</p>
                        </article>
                        <article class="feature-card reveal-up" style="transition-delay: 0.1s;">
                            <i class="fas fa-credit-card feature-icon" aria-hidden="true"></i>
                            <h3 class="feature-title">Pagos en Argentina</h3>
                            <p class="feature-text">Mercado Pago, transferencia y efectivo en retiro (según modalidad). Plazos: 48/72 hs (stock) o 10-20 días hábiles (bajo pedido).</p>
                        </article>
                        <article class="feature-card reveal-up" style="transition-delay: 0.2s;">
                            <i class="fas fa-shield-alt feature-icon" aria-hidden="true"></i>
                            <h3 class="feature-title">Garantía real</h3>
                            <p class="feature-text">Todos los trabajos incluyen 12 meses de garantía por defectos de fabricación.</p>
                        </article>
                    </div>
                </div>
            </section>
        `;
    }

    function replaceHeader(activeKey, cartEnabled) {
        const existingHeader = document.querySelector('.navbar');
        const headerMarkup = buildNavMarkup(activeKey, cartEnabled);

        if (existingHeader) {
            existingHeader.outerHTML = headerMarkup;
            return;
        }

        const firstChild = document.body.firstElementChild;
        if (firstChild) {
            firstChild.insertAdjacentHTML('beforebegin', headerMarkup);
        } else {
            document.body.insertAdjacentHTML('afterbegin', headerMarkup);
        }
    }

    function replaceCart(cartEnabled) {
        document.getElementById('cartSidebar')?.remove();
        document.getElementById('cart-notification')?.remove();

        if (!cartEnabled) {
            document.querySelector('.cart-icon')?.remove();
            return;
        }

        const navIcons = document.querySelector('.nav-icons');
        if (!navIcons?.querySelector('.cart-icon')) {
            navIcons?.insertAdjacentHTML(
                'afterbegin',
                '<button class="cart-icon js-toggle-cart" type="button" aria-label="Abrir carrito" aria-expanded="false" aria-controls="cartSidebar"><i class="fas fa-shopping-bag" aria-hidden="true"></i><span class="cart-count">0</span></button>'
            );
        }

        const header = document.querySelector('.navbar');
        if (!header) {
            return;
        }

        header.insertAdjacentHTML('afterend', buildCartMarkup());
    }

    function replaceFooter() {
        const existingFooter = document.querySelector('.footer');
        const footerMarkup = buildFooterMarkup();

        if (existingFooter) {
            existingFooter.outerHTML = footerMarkup;
            return;
        }

        document.body.insertAdjacentHTML('beforeend', footerMarkup);
    }

    function replaceTrustBlocks() {
        const trustTargets = document.querySelectorAll('[data-trust-block]');
        trustTargets.forEach(target => {
            target.outerHTML = buildTrustBlockMarkup();
        });
    }

    function init() {
        if (!document.body) {
            return;
        }

        const pageKey = document.body.dataset.page || getPageKeyFromPath();
        const cartEnabled = document.body.dataset.cart !== 'off';

        replaceHeader(pageKey, cartEnabled);
        replaceCart(cartEnabled);
        replaceTrustBlocks();
        replaceFooter();
    }

    init();
})();

