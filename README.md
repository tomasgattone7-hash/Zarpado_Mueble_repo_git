# Zarpado Mueble

Repositorio organizado para deploy separado:

- `frontend/` -> Netlify (sitio estático)
- `backend/` -> Railway (API Node/Express)

Dominio productivo: `https://zarpadomueble.com`  
API productiva: `https://api.zarpadomueble.com`

## Estructura

```text
muebles_web/
├── frontend/
│   ├── assets/
│   ├── css/
│   ├── js/
│   ├── pages/
│   ├── index.html
│   ├── _redirects
│   ├── favicon.ico
│   ├── robots.txt
│   └── sitemap.xml
├── backend/
│   ├── config/
│   ├── data/
│   ├── routes/
│   ├── scripts/
│   ├── utils/
│   ├── .env.example
│   ├── package.json
│   └── server.js
├── docs/
├── .gitignore
├── netlify.toml
└── README.md
```

## Desarrollo local

### Backend

```bash
cd backend
npm ci
npm start
```

API local: `http://localhost:3000`

Health checks:

- `GET /health`
- `GET /api/health`

### Frontend

Desde la raíz del repo:

```bash
npx serve frontend
```

El frontend usa:

- `http://localhost:3000` cuando corre en `localhost`
- `https://api.zarpadomueble.com` fuera de `localhost`
- `window.ZM_API_BASE_URL` / `window.ZM_PROD_API_BASE_URL` / `window.ZM_LOCAL_API_BASE_URL` si se definen en `frontend/js/runtime-config.js` o por inyecciÃ³n en deploy.

## Variables de entorno (backend)

Usar `backend/.env.example` como plantilla. No commitear `.env`.

Mínimas para producción:

- `MP_ACCESS_TOKEN`
- `FRONTEND_URL=https://zarpadomueble.com`
- `API_URL=https://api.zarpadomueble.com`
- `FORMSPREE_CONTACT_ENDPOINT=https://formspree.io/f/maqdjjkq`
- `FORMSPREE_MEDIDA_ENDPOINT=https://formspree.io/f/maqdjjkq`

Importante:

- No usa reCAPTCHA.
- Anti-spam de formularios por backend: allowlist de `origin/referer`, rate limit por IP, honeypot (`website`/`company`) y validación de payload.
- Los valores de ejemplo `MP_ACCESS_TOKEN` y `https://formspree.io/f/maqdjjkq` son de prueba. Deben reemplazarse por credenciales/endpoints propios en producción.
- Todo valor sensible (tokens, claves SMTP, secretos de webhook) debe ir en variables de entorno. No hardcodear secretos en el código fuente.

## Endpoints principales

- `GET /health`
- `GET /api/health`
- `GET /api/store/catalog`
- `POST /api/delivery/quote`
- `POST /api/mp/create-preference`
- `POST /forms/contacto`
- `POST /forms/medida`

Form relay (Formspree):

- `/forms/contacto` -> `maqdjjkq`
- `/forms/medida` -> `maqdjjkq`

## Deploy

### Netlify (frontend)

- Base del repo: raíz (`muebles_web/`)
- `netlify.toml`:
  - `publish = "frontend"`
  - `command = ""`
- Ruteo y rewrites en `frontend/_redirects`

### Railway (backend)

- Root Directory del servicio: `backend`
- Start command: `npm start`
- Puerto: `process.env.PORT`

## Mercado Pago

No cambiar rutas de checkout. El backend crea preferencias en:

- `POST /api/mp/create-preference`

Back URLs usan `FRONTEND_URL` y webhook usa `API_URL`/`NOTIFICATION_URL`.
