# Test Checklist

Fecha: 2026-02-17

## Backend local

Entorno usado:

- `cd backend`
- `npm ci`
- `DRY_RUN=true npm start`

Pruebas:

1. `GET /health`
- Resultado: `200 OK`
- Body: `{"ok":true,...}`

2. CORS preflight (`OPTIONS /forms/contacto` con Origin permitido)
- Resultado: `204 No Content`
- Headers: `Access-Control-Allow-Origin: https://zarpadomueble.com`

3. Form contacto OK (sin honeypot)
- Request: `POST /forms/contacto` con `nombre/email/mensaje/website=""`
- Resultado: `200 OK`
- Body: `{"ok":true,"provider":"dry_run",...}`

4. Honeypot spam (website con contenido)
- Request: `POST /forms/contacto` con `website="http://spam"`
- Resultado: `200 OK`
- Body: `{"ok":true,"code":"spam_detected",...}`

5. Origin/Referer faltantes
- Request: `POST /forms/contacto` sin `Origin`/`Referer`
- Resultado: `403 Forbidden`
- Body: `{"ok":false,"code":"origin_not_allowed",...}`

6. Form A Medida
- Request: `POST /forms/medida` (multipart, sin archivos)
- Resultado: `200 OK`
- Body: `{"ok":true,"quoteId":"...",...}`

## Compra / MercadoPago

Prueba:

- `POST /api/mp/create-preference` con item válido, envío y customer válido

Resultado:

- `200 OK`
- Preferencia creada (`id` + `init_point` devueltos)
- Flujo de compra activo sin romper endpoint productivo

## Frontend local

Entorno usado:

- `npx serve frontend -l 4173`

Checks:

1. Carga páginas base:
- `/` -> `200`
- `/pages/tienda.html` -> `200`
- `/pages/contacto.html` -> `200`
- `/pages/a-medida.html` -> `200`

2. Assets referenciados (css/js/favicon/assets) desde esas páginas:
- Resultado: sin `404` en recursos testeados.

Nota:

- `npx serve` no aplica `_redirects` de Netlify, por eso rutas amigables (`/tienda`, `/contacto`, etc.) se validan en deploy Netlify.

## Integración frontend -> API productiva

Verificado en código compilado:

- `frontend/js/script.js` y minificados usan `PROD_API_BASE_URL = "https://api.zarpadomueble.com"`.
- Formularios (`/forms/contacto`, `/forms/medida`) y checkout (`/api/mp/create-preference`) apuntan al backend productivo fuera de `localhost`.
