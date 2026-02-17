# Deploy Notes

## Netlify (frontend)

- Archivo: `netlify.toml`
- Build:
  - `publish = "frontend"`
  - `command = ""`
- Rewrites/redirects: `frontend/_redirects`
  - proxy API/forms a `https://api.zarpadomueble.com`
  - rutas amigables a `/pages/*.html`
  - canonicalización de dominio (`www` -> apex y `http` -> `https`)

## Railway (backend)

- Root directory del servicio: `backend`
- Start command: `npm start`
- Escucha en `0.0.0.0:${PORT}`
- Health endpoint: `/health`

## Variables críticas (Railway)

- `FRONTEND_URL=https://zarpadomueble.com`
- `API_URL=https://api.zarpadomueble.com`
- `FRM_CONTACT_ID=xqedeven`
- `FRM_MEDIDA_ID=maqdjjkq`
- `MP_ACCESS_TOKEN=...`
- `NOTIFICATION_URL=https://api.zarpadomueble.com/api/mp/webhook` (opcional, con fallback automático)

## Seguridad formularios (sin reCAPTCHA)

- allowlist de `origin/referer`
- rate limit por IP en `/forms/*`
- honeypot (`website`/`company`)
- validación de payload y límites de tamaño
