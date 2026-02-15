# Mercado Pago Checkout Pro - Guía de Configuración

## 📋 Requisitos Previos

- Node.js 16+ instalado
- Cuenta de Mercado Pago (Argentina)
- Access Token de Mercado Pago

---

## 🚀 Configuración Local (Development)

### 1. Obtener Access Token de Mercado Pago

1. Ir a [Mercado Pago Developers](https://www.mercadopago.com.ar/developers/panel)
2. Crear una aplicación o usar una existente
3. En **Credenciales** → copiar el **Access Token de prueba** (TEST)
4. Guardar el token que empieza con `APP_USR_...`

### 2. Instalar Dependencias

```bash
cd /home/tomii/Descargas/zarpa-main/muebles_web
npm install
```

### 3. Configurar Variables de Entorno

```bash
# Copiar el archivo de ejemplo
cp .env.example .env

# Editar .env y agregar tu token
nano .env
```

Reemplazar en `.env`:
```
MP_ACCESS_TOKEN=APP_USR_tu_token_de_prueba_aqui
PORT=3000
BASE_URL=http://localhost:3000
NODE_ENV=development
```

### 4. Iniciar el Servidor

```bash
npm start
```

Deberías ver:
```
🚀 Servidor corriendo en http://localhost:3000
💳 Mercado Pago configurado correctamente
```

### 5. Probar la Integración

1. Abrir navegador en `http://localhost:3000`
2. Agregar productos al carrito
3. Clic en **"Iniciar Compra"**
4. Deberías ser redirigido a Mercado Pago

### 6. Probar Pagos con Tarjetas de Prueba

Usar las [tarjetas de prueba oficiales](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/test-cards):

**Tarjeta aprobada:**
- Número: `5031 7557 3453 0604`
- CVV: `123`
- Vencimiento: cualquier fecha futura
- Titular: `APRO`

**Tarjeta rechazada:**
- Número: `5031 7557 3453 0604`
- Titular: `OFFE`

---

## 🌐 Deploy a Producción

### Opción 1: Railway.app (Recomendado - Gratis)

1. Crear cuenta en [Railway.app](https://railway.app/)
2. Conectar repositorio de GitHub
3. Configurar variables de entorno:
   ```
   MP_ACCESS_TOKEN=APP_USR_tu_token_de_produccion
   BASE_URL=https://tu-dominio.railway.app
   NODE_ENV=production
   ```
4. Deploy automático

### Opción 2: Render.com

1. Crear cuenta en [Render](https://render.com/)
2. New → Web Service
3. Conectar repo
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Agregar Environment Variables
7. Deploy

### Opción 3: Heroku

```bash
# Instalar Heroku CLI
heroku login
heroku create zarpadomueble

# Configurar variables
heroku config:set MP_ACCESS_TOKEN=APP_USR_xxx
heroku config:set BASE_URL=https://zarpadomueble.herokuapp.com

# Deploy
git push heroku main
```

### Cambiar a Credenciales de Producción

> ⚠️ **IMPORTANTE**: En producción usar **Access Token de Producción**, no de prueba.

1. En Mercado Pago Developers, activar la aplicación
2. Copiar **Access Token de producción**
3. Actualizar variable de entorno `MP_ACCESS_TOKEN`

---

## 📄 Páginas de Retorno

Crear estas páginas (ya están referenciadas en `server.js`):

### `success.html`
```html
<!DOCTYPE html>
<html lang="es">
<head>
    <title>Pago Exitoso - Zarpado Mueble</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div style="text-align: center; padding: 100px 20px;">
        <h1 style="color: var(--color-accent);">✅ ¡Pago Exitoso!</h1>
        <p>Tu pedido ha sido confirmado. Te contactaremos pronto.</p>
        <a href="index.html" class="btn btn-primary">Volver al Inicio</a>
    </div>
</body>
</html>
```

### `failure.html`
```html
<!DOCTYPE html>
<html lang="es">
<head>
    <title>Pago Rechazado - Zarpado Mueble</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div style="text-align: center; padding: 100px 20px;">
        <h1 style="color: #e74c3c;">❌ Pago Rechazado</h1>
        <p>Hubo un problema con el pago. Intenta nuevamente.</p>
        <a href="index.html" class="btn btn-outline">Volver al Inicio</a>
    </div>
</body>
</html>
```

### `pending.html`
```html
<!DOCTYPE html>
<html lang="es">
<head>
    <title>Pago Pendiente - Zarpado Mueble</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div style="text-align: center; padding: 100px 20px;">
        <h1 style="color: #f39c12;">⏳ Pago Pendiente</h1>
        <p>Estamos procesando tu pago. Te notificaremos cuando se confirme.</p>
        <a href="index.html" class="btn btn-outline">Volver al Inicio</a>
    </div>
</body>
</html>
```

---

## 🔧 Troubleshooting

### Error: "MP_ACCESS_TOKEN no está configurado"
- Verificar que `.env` existe
- Verificar que `MP_ACCESS_TOKEN` está definido
- Reiniciar el servidor

### Error: "EADDRINUSE: address already in use"
- Puerto 3000 ocupado
- Cambiar `PORT=3001` en `.env`
- O matar proceso: `lsof -ti:3000 | xargs kill -9`

### No redirige a Mercado Pago
- Verificar respuesta en DevTools → Network
- Verificar que `init_point` se recibe correctamente
- Revisar logs del servidor

---

## 📊 Próximos Pasos (Opcional)

1. **Webhooks**: Recibir notificaciones automáticas de pagos
2. **Base de datos**: Guardar órdenes y transacciones
3. **Emails**: Enviar confirmaciones automáticas
4. **Panel admin**: Ver órdenes y estado de pagos
5. **Stock**: Validar disponibilidad antes del pago

---

## 🔐 Seguridad

✅ **Lo que YA hace el backend:**
- Valida precios contra catálogo (no confía en frontend)
- Valida cantidades positivas
- No expone tokens en frontend
- Usa variables de entorno

⚠️ **Para producción mejorar:**
- Rate limiting (evitar spam de requests)
- HTTPS obligatorio
- Validación de webhooks con firma
- Logs de auditoría

---

## 📞 Soporte

- [Documentación MP Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/landing)
- [API Reference](https://www.mercadopago.com.ar/developers/es/reference)
- [Foro de desarrolladores](https://www.mercadopago.com.ar/developers/es/support)
