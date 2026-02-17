# Arquitectura Híbrida Zarpado Mueble

## Objetivo
Separar el sitio en dos flujos claros:
- **Tienda**: compra directa de muebles estándar con precio fijo y checkout online.
- **A Medida**: captación de proyectos personalizados mediante cotización.

## Estructura aplicada
- `index.html`: home híbrida con dos CTA principales.
- `tienda.html`: flujo ecommerce (filtros por categoría, ficha completa, carrito, checkout MP).
- `a-medida.html`: flujo de cotización (proceso, galería y CTA a formulario).
- `catalogo.html` y `servicios.html`: rutas legacy que redirigen a las nuevas secciones.

## Componentización Frontend
Se agregó `js/site-shell.js` para centralizar:
- Header principal con menú: `Inicio | Tienda | A Medida | Nosotros | Contacto`.
- Footer con navegación y legales.
- Bloque de confianza reutilizable (`data-trust-block`).
- Cart/sidebar inyectado automáticamente en páginas habilitadas.

Esto evita repetir markup en cada página y mantiene navegación consistente.

## Lógica de Tienda
En `script.js`:
- Catálogo de tienda con metadatos de conversión:
  - categoría
  - stock
  - envío estimado
  - precio final
- Filtros por categoría (Escritorios, Cocinas, Placards, Living, Comedor).
- Render de resultados con contador dinámico.
- Checkout con selección de medio de pago:
  - Mercado Pago (confirmación automática)
  - Transferencia bancaria (pendiente de confirmación)
  - Efectivo en retiro (solo retiro en taller)
- Cálculo de envío por CP y, para interior, por peso/volumen de ítems.
- Front consume catálogo/configuración desde `/api/store/catalog` y `/api/store/config`.

## SEO y compatibilidad
- `sitemap.xml` actualizado con `tienda.html` y `a-medida.html`.
- `_redirects` agrega 301 para rutas históricas:
  - `/catalogo` -> `/tienda`
  - `/servicios` -> `/a-medida`
- Se mantienen favicons estándar y rutas absolutas en `/assets/favicon`.

## Operación comercial implementada
- `config/commerce-config.json` define productos, stock real y modalidad por ítem:
  - `stock`: “En stock - Envío en 48/72 hs”
  - `made_to_order`: “Fabricación bajo pedido - Entrega estimada: 10 a 20 días hábiles”
- `config/delivery-config.json` incorpora:
  - reglas AMBA
  - tabla de flete interior por peso/volumen
  - retiro en taller (Moreno, BA)
- Backend (`server.js`) agrega endpoints operativos:
  - `/api/store/catalog`
  - `/api/store/config`
  - `/api/delivery/quote` (GET y POST)
  - `/api/admin/overview`
  - `/api/admin/orders/:orderId/status`
  - `/api/admin/quotes/:quoteId/status`
  - `/api/admin/quotes/:quoteId/accept`
  - `/api/admin/export`
- Flujo A Medida:
  - cotizaciones persistidas en `data/quotes.json`
  - posibilidad de crear orden interna de seña desde panel
  - seguimiento por estados (recibida, cotizada, seña pendiente, etc.)
- Flujo post-venta:
  - timeline por pedido/cotización
  - emails transaccionales por cambios de estado (si SMTP está configurado)
  - página pública `estado-pedido` para consulta de estado.

## Panel interno
- Nueva pantalla `/panel-interno` con token (`ADMIN_PANEL_TOKEN`) para:
  - ver pedidos estándar
  - ver solicitudes de cotización
  - cambiar estados
  - crear orden interna de seña desde cotización
  - exportar datos (CSV).

## Variables recomendadas
- `ADMIN_PANEL_TOKEN`: token de acceso al panel interno.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`, `ADMIN_EMAIL`: emails de operación.
- `MP_ACCESS_TOKEN`: credencial Mercado Pago.
- `NOTIFICATION_URL`: webhook de Mercado Pago.

## Estrategia UX / Conversión
- Home orientada a decisión rápida entre compra inmediata y proyecto personalizado.
- Tienda enfocada en reducir fricción: información de stock/envío visible en tarjeta.
- A Medida enfocada en valor percibido: proceso + galería + cotización asistida.
- Tono de comunicación unificado en voseo argentino.

## Formularios: AJAX + Relay Backend

### Flujo implementado
- Frontend (Netlify) envía por AJAX a `https://api.zarpadomueble.com/forms/...`.
- Backend (Railway) valida payload y aplica rate limit por IP.
- Si el payload es válido, backend reenvía server-to-server a Formspree.
- El frontend nunca envía directo a Formspree.

### Endpoints
- `GET /forms/config`: estado de configuración de formularios.
- `POST /forms/contacto`: formulario de contacto.
- `POST /forms/medida`: formulario de cotización A Medida.

### Variables de entorno requeridas (Railway)
Definilas en el servicio backend:

```bash
FRM_CONTACT_ID=maqdjjkq
FRM_MEDIDA_ID=maqdjjkq

FRONTEND_URL=https://zarpadomueble.com
API_URL=https://api.zarpadomueble.com
```

Opcionales:

```bash
FORMS_RATE_LIMIT_MAX=10
```

### Dónde obtener cada valor
- `FRM_CONTACT_ID` / `FRM_MEDIDA_ID`:
  - En Formspree, abrí cada form y copiá el ID de la ruta `f/xxxxxx`.
  - Si tenés un `action` histórico tipo `https://formspree.io/f/maqdjjkq`, el ID es `maqdjjkq`.

### Prueba rápida local
Con backend levantado en `localhost:3000`:

```bash
curl -i -X POST http://localhost:3000/forms/contacto \
  -H "Content-Type: application/json" \
  -d '{"name":"t","email":"t@t.com","message":"mensaje de prueba"}'
```
