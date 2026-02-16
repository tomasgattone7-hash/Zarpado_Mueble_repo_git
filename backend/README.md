# Backend API (Railway)

## Endpoints principales

- `POST /api/mp/create-preference`
- `GET /api/health`
- `GET /health`
- `GET /forms/config`
- `POST /forms/contacto`
- `POST /forms/envios`
- Compatibilidad: `POST /api/contact`, `POST /api/quotes`

## Flujo formularios (AJAX + reCAPTCHA + Formspree)

1. Frontend obtiene configuración pública en `GET /forms/config`.
2. Frontend ejecuta reCAPTCHA y envía `recaptchaToken` por AJAX al backend.
3. Backend valida payload + reCAPTCHA + rate-limit.
4. Backend reenvía server-to-server a Formspree.

Nunca se expone `RECAPTCHA_SECRET` en el frontend.

## Variables de entorno (`.env`)

```env
MP_ACCESS_TOKEN=APP_USR_xxx
BASE_URL=https://zarpadomueble.com
FRONTEND_URL=https://zarpadomueble.com
API_URL=https://api.zarpadomueble.com
ALLOWED_ORIGINS=https://zarpadomueble.com,https://www.zarpadomueble.com

RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET=
RECAPTCHA_VERSION=v3
RECAPTCHA_MIN_SCORE=0.5

FORMSPREE_CONTACT_ID=
FORMSPREE_ENVIO_ID=

CONTACT_RATE_LIMIT_MAX=10
QUOTE_RATE_LIMIT_MAX=10
FORMS_RATE_LIMIT_MAX=10
```

## Cómo obtener los IDs y keys

- `FORMSPREE_*`:
  - Panel de Formspree o del action histórico `https://formspree.io/f/xxxx` (ID = `xxxx`).
- `RECAPTCHA_SITE_KEY` y `RECAPTCHA_SECRET`:
  - Google reCAPTCHA Admin Console (mismo dominio del frontend).

## Prueba rápida local

Con variables cargadas:

```bash
curl -i -X POST http://localhost:3000/forms/contacto \
  -H "Content-Type: application/json" \
  -d '{"name":"t","email":"t@t.com","message":"mensaje de prueba","recaptchaToken":"TEST"}'
```

Con token inválido: responde `400` + `{"ok":false,"error":"recaptcha_failed"}`.
