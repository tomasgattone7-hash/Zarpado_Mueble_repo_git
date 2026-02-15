# Flujo Post-Pago Mercado Pago + Datos + Emails

Implementación activa en `../server.js`.

## Endpoints principales

- `POST /api/mp/create-preference`
- `POST /api/mp/webhook`
- `POST /api/order/details`
- Compatibilidad legacy: `POST /api/orders/:orderId/delivery-details`

## Variables de entorno (`.env`)

```env
MP_ACCESS_TOKEN=APP_USR_xxx
NOTIFICATION_URL=https://tu-dominio.com/api/mp/webhook
MP_API_TIMEOUT_MS=10000
MP_WEBHOOK_SECRET=opcional_si_activas_firma

SMTP_HOST=smtp.tudominio.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario_smtp
SMTP_PASS=clave_smtp
FROM_EMAIL=ventas@tudominio.com
ADMIN_EMAIL=admin@tudominio.com

BASE_URL=https://tu-dominio.com
```

Si SMTP no está configurado, el flujo de compra funciona igual pero no se envían emails.
Si el email del comprador no se conoce antes de pagar, se completa en `datos-envio.html`.

## Configurar webhook en Mercado Pago

1. Ir a tu aplicación en Mercado Pago Developers.
2. En Webhooks/Notificaciones, configurar URL:
   - `https://tu-dominio.com/api/mp/webhook`
3. Activar eventos de `payment` (y opcional `merchant_order`).
4. Guardar cambios.

## Prueba local

1. Instalar dependencias y correr servidor:

```bash
cd /home/tomii/Escritorio/Pagina\ Web\ ZM\ editable/muebles_web
npm install
npm start
```

2. Exponer local con ngrok (opcional):

```bash
ngrok http 3000
```

3. Configurar en MP el webhook con la URL HTTPS de ngrok + `/api/mp/webhook`.
4. Hacer checkout desde catálogo, pagar en MP, completar `datos-envio.html`.
5. Verificar en `data/orders.json`:
   - `paid: true`
   - `emails_sent: true` (si SMTP está configurado)
