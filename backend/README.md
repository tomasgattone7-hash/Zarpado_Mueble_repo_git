# Backend alternativo Mercado Pago

Servicio Express (puerto `3001`) para crear preferencias de pago de Mercado Pago.

## Setup

```bash
cd backend
npm install
cp .env.example .env
```

Variables minimas:

```env
MP_ACCESS_TOKEN=APP_USR_xxx
PORT=3001
BASE_URL=http://localhost:3000
```

## Run

```bash
npm start
```

## Endpoints

- `GET /health`
- `GET /api/health`
- `POST /api/mp/create-preference`

Ejemplo:

```bash
curl -X POST http://localhost:3001/api/mp/create-preference \
  -H "Content-Type: application/json" \
  -d '{"items":[{"id":1,"quantity":1}]}'
```

## Seguridad aplicada

- Validacion estricta por catalogo interno (no confia en precio del frontend).
- Limites de carrito/cantidad por item.
- Rate limiting (`/api/*` y checkout).
- CORS por allowlist (`ALLOWED_ORIGINS`).
- Headers de seguridad (`helmet`).
- Limite de payload JSON (`16kb`).
- Timeout de request a Mercado Pago (`MP_API_TIMEOUT_MS`).

## Scripts

```bash
npm run dev
npm run lint
npm run audit
```
