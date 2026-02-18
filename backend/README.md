# Backend API (Node/Express)

Backend para checkout, pedidos, panel admin y Mercado Pago.

## Setup local rápido

```bash
cd backend
npm install
cp .env.example .env
```

## 1) `SESSION_SECRET`

Linux/macOS (OpenSSL):

```bash
openssl rand -hex 32
```

Cross-platform con Node:

```bash
npm run make:session-secret
```

Copiar el valor en:

```env
SESSION_SECRET=...
```

## 2) Admin (`ADMIN_USER` + `ADMIN_PASSWORD_HASH`)

Definir usuario:

```env
ADMIN_USER=admin
```

Generar hash scrypt:

```bash
npm run make:admin-hash -- "TuPasswordFuerte"
```

Resultado esperado:

```text
scrypt$16384$8$1$saltHex$hashHex
```

Copiar en:

```env
ADMIN_PASSWORD_HASH=scrypt$16384$8$1$...
```

## 3) MariaDB

Instalación Ubuntu:

```bash
sudo apt update
sudo apt install mariadb-server
sudo systemctl enable mariadb
sudo systemctl start mariadb
```

Crear esquema:

```bash
sudo mariadb < sql/001_init_mariadb.sql
```

Crear usuario app (mínimos permisos):

```bash
sudo mariadb < sql/002_create_app_user.sql
```

Configurar `.env`:

```env
DB_HOST=...
DB_PORT=3306
DB_USER=...
DB_PASSWORD=...
DB_NAME=tienda
```

Para remotos, habilitar TLS:

```env
DB_SSL=true
DB_SSL_MODE=required
```

## 4) Mercado Pago

```env
MP_ACCESS_TOKEN=TEST-...   # sandbox
# o
MP_ACCESS_TOKEN=APP_USR-... # producción
```

## 5) Local vs Producción (Railway)

- Local: usar `backend/.env` (no subir a git).
- Producción: cargar variables en panel de Railway.
- El backend lee `DB_*` y también fallback Railway `MYSQLHOST`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`, `MYSQLPORT`.

## Seguridad aplicada

- Admin habilitado solo si existen `SESSION_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD_HASH`.
- Password admin verificada con `crypto.scrypt` + `crypto.timingSafeEqual`.
- Rutas admin protegidas con `express-session`.
- Checkout de pago bloqueado si no hay conexión/configuración de DB.

## Endpoints principales

- `POST /api/checkout/shipping` (paso 1: crea/actualiza pedido `draft` en MariaDB)
- `GET /api/checkout/summary?orderId=...` (alias recomendado para resumen de paso 2)
- `GET /api/checkout/confirmacion?orderId=...` (paso 2: devuelve resumen real del pedido draft)
- `POST /api/mp/create-preference` (paso 3: crea preferencia MP solo para pedidos draft válidos)
- `POST /api/pedidos` (compatibilidad legacy; redirige internamente a `POST /api/checkout/shipping`)
- `GET /admin/login`
- `GET /admin/pedidos`
- `GET /api/admin/pedidos`

## Flujo checkout paso 1/2/MP

1. Paso 1 (`/datos-envio`)
- Frontend intercepta el submit (sin querystring sensible por GET).
- Envía `POST /api/checkout/shipping` con datos de envío + carrito.
- También acepta payload legacy (`nombre`, `telefono`, `direccion`, etc.) por compatibilidad.
- Backend valida, recalcula totales del lado servidor, y crea/actualiza `pedidos.estado='draft'`.
- Respuesta: `{ ok, id, orderId, redirectTo }`.

2. Paso 2 (`/confirmacion`)
- Frontend lee `orderId` (query o sesión) y consulta `GET /api/checkout/summary` (o alias `/api/checkout/confirmacion`).
- Totales y datos de envío se renderizan desde DB (no desde valores en memoria del navegador).

3. Paso 3 (`Confirmar y pagar`)
- Frontend llama `POST /api/mp/create-preference` enviando `orderId`.
- Backend exige que el pedido exista en DB y esté en estado `draft`; si no, rechaza.
- Si valida, genera preferencia MP y sincroniza `external_reference`/estado en `pedidos`.
