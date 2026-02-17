# ⚠️ Error: Token de Producción Detectado

## Problema Identificado

El Access Token que configuraste es de **PRODUCCIÓN**. Para pruebas locales necesitás el **Access Token de PRUEBA (TEST)**.

**Error**: `PA_UNAUTHORIZED_RESULT_FROM_POLICIES - At least one policy returned UNAUTHORIZED`

---

## Solución: Obtener Token de Prueba

### 1. Ir a Mercado Pago Developers
[https://www.mercadopago.com.ar/developers/panel/app](https://www.mercadopago.com.ar/developers/panel/app)

### 2. Seleccionar tu Aplicación
- Si no tenés ninguna creale una nueva / "Crear aplicación"
- Nombre: "Zarpado Mueble Test" (o lo que quieras)

### 3. Ir a "Credenciales" en el menú lateral

### 4. Copiar el Access Token de PRUEBA

Vas a ver dos secciones:
- **Credenciales de prueba** ← **USAR ESTO** 🟢
- **Credenciales de producción** ← NO usar para desarrollo

Copiar el **Access Token** de la sección **Credenciales de prueba**.  
Empieza con `APP_USR...` o `TEST-...`

### 5. Actualizar .env

```bash
# Editar el archivo .env
nano /home/tomii/Descargas/zarpa-main/muebles_web/.env
```

Reemplazar la línea:
```env
MP_ACCESS_TOKEN=APP_USR_tu_token_de_PRUEBA_aqui
```

### 6. Reiniciar el Servidor

```bash
# Detener el servidor actual (Ctrl+C en la terminal)
# Luego iniciar nuevamente
npm start
```

---

## Diferencias Token de Prueba vs Producción

| Característica | Token de PRUEBA | Token de PRODUCCIÓN |
|----------------|-----------------|---------------------|
| Pagos reales | ❌ No | ✅ Sí |
| Tarjetas de prueba | ✅ Funciona | ❌ No funciona |
| Cobros reales | ❌ No | ✅ Sí |
| Para desarrollo | ✅ Usar | ❌ NO usar |

---

## Tarjetas de Prueba

Una vez tengas el token de prueba, podés usar estas tarjetas:

### Pago APROBADO
```
Número: 5031 7557 3453 0604
CVV: 123
Vencimiento: 11/25 (cualquier fecha futura)
Nombre: APRO
DNI: 12345678
```

### Pago RECHAZADO
```
Número: 5031 7557 3453 0604
CVV: 123
Vencimiento: 11/25
Nombre: OFFE
DNI: 12345678
```

---

## Después de cambiar el token

1. ✅ Reiniciar servidor: `npm start`
2. ✅ Refrescar navegador: `http://localhost:3000`
3. ✅ Agregar productos al carrito
4. ✅ Clic en "Iniciar Compra"
5. ✅ Te redirigirá a Mercado Pago
6. ✅ Usar tarjeta de prueba "APRO"
7. ✅ Completar pago
8. ✅ Volver a success.html

---

## Cuándo usar Token de Producción

⚠️ **SOLO** cuando subas la app a producción y quieras cobrar de verdad.

Para deploy en producción:
1. Activar la aplicación en MP Developers
2. Copiar **Access Token de Producción**
3. Configurar en variables de entorno del hosting
4. Los pagos cobrarán dinero real
