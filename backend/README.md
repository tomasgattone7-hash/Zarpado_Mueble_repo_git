# Backend API (Railway)

Servicio Node/Express para formularios, checkout y administración.

## Comandos

```bash
npm install
npm start
```

## Endpoints principales

- `GET /health`
- `GET /api/health`
- `GET /api/store/catalog`
- `POST /api/delivery/quote`
- `POST /api/mp/create-preference`
- `POST /forms/contacto`
- `POST /forms/medida`

## Variables

Usar `./.env.example` como base.

Claves de producción mínimas:

- `MP_ACCESS_TOKEN`
- `FRM_CONTACT_ID=xqedeven`
- `FRM_MEDIDA_ID=maqdjjkq`
- `FRONTEND_URL=https://zarpadomueble.com`
- `API_URL=https://api.zarpadomueble.com`

Notas:

- No usa reCAPTCHA.
- Anti-spam en formularios: `origin/referer` allowlist + rate limit + honeypot (`website`/`company`) + validación de payload.
