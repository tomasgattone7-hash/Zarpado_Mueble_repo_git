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
- `FRONTEND_URL=https://zarpadomueble.com`
- `API_URL=https://api.zarpadomueble.com`

Notas:

- No usa reCAPTCHA.
- Formspree fijo por endpoint:
  - Contacto: `https://formspree.io/f/xqedeven`
  - A Medida: `https://formspree.io/f/maqdjjkq`
- Anti-spam en formularios: `origin/referer` allowlist + rate limit + honeypot (`website`/`company`) + validación de payload.
