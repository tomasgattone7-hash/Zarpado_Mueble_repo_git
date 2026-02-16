# Backend API (Railway)

## Endpoints principales

- `POST /api/mp/create-preference`
- `GET /api/health`
- `GET /health`
- `GET /forms/config`
- `POST /forms/contacto`
- `POST /forms/medida`
- Compatibilidad: `POST /api/contact`, `POST /api/quotes`

## Flujo formularios (AJAX + Formspree)

1. Frontend obtiene configuración pública en `GET /forms/config`.
2. Frontend envía el formulario por AJAX al backend.
3. Backend valida payload + rate-limit.
4. Backend reenvía server-to-server a Formspree.

## Variables de entorno (`.env`)

```env
MP_ACCESS_TOKEN=APP_USR_xxx
BASE_URL=https://zarpadomueble.com
FRONTEND_URL=https://zarpadomueble.com
API_URL=https://api.zarpadomueble.com
ALLOWED_ORIGINS=https://zarpadomueble.com,https://www.zarpadomueble.com

FRM_CONTACT_ID=xqedeven
FRM_MEDIDA_ID=maqdjjkq

CONTACT_RATE_LIMIT_MAX=10
QUOTE_RATE_LIMIT_MAX=10
FORMS_RATE_LIMIT_MAX=10
CONTACT_RATE_LIMIT_WINDOW_MS=60000
QUOTE_RATE_LIMIT_WINDOW_MS=60000
```

## Cómo obtener los IDs

- `FRM_*`:
  - Panel de Formspree o del action histórico `https://formspree.io/f/xxxx` (ID = `xxxx`).

## Prueba rápida local

Con variables cargadas:

```bash
curl -i -X POST http://localhost:3000/forms/contacto \
  -H "Content-Type: application/json" \
  -d '{"name":"t","email":"t@t.com","message":"mensaje de prueba"}'
```
