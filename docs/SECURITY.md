# Seguridad y Cloudflare (Produccion)

## Checklist rapido

- Backend con validacion estricta de carrito (id + cantidad + precio desde catalogo interno).
- Token de Mercado Pago solo en `.env` del backend.
- CORS restringido con `ALLOWED_ORIGINS`.
- Rate limit global y rate limit especifico para checkout.
- Cabeceras de seguridad (`helmet`) y `X-Powered-By` desactivado.
- `target="_blank"` con `rel="noopener noreferrer"` en todos los HTML.

## Variables recomendadas

Configurar en produccion:

```env
NODE_ENV=production
ALLOWED_ORIGINS=https://zarpadomueble.com,https://www.zarpadomueble.com
TRUST_PROXY=1
RATE_LIMIT_MAX=300
CHECKOUT_RATE_LIMIT_MAX=25
MAX_CART_ITEMS=20
MAX_ITEM_QUANTITY=10
```

## Cloudflare recomendado

1. DNS/Proxy:
- Activar nube naranja para el dominio y subdominios publicos.

2. SSL/TLS:
- Modo `Full (strict)`.
- Activar `Always Use HTTPS`.
- Activar `Automatic HTTPS Rewrites`.

3. WAF:
- Activar `Managed Rules`.
- Activar `OWASP Core Ruleset`.
- Accion sugerida: `Managed Challenge` para reglas de alto riesgo.

4. Rate limiting en Cloudflare:
- Regla 1: `http.request.uri.path contains "/api/mp/create-preference"`
- Umbral: 20 requests por 10 minutos por IP.
- Accion: `Managed Challenge` o `Block` por 10 minutos.
- Regla 2: `http.request.uri.path starts_with "/api/"`
- Umbral: 120 requests por minuto por IP.
- Accion: `Managed Challenge`.

5. Bot y DDoS:
- Activar `Bot Fight Mode` (o Super Bot Fight si el plan lo permite).
- Mantener `DDoS managed protection` activa (default).

6. Firewall rules:
- Bloquear ASN o paises solo si no afectan clientes reales.
- Bloquear User-Agents maliciosos conocidos.

7. Cache:
- Cachear estaticos (`.css`, `.js`, imagenes) y no cachear `/api/*`.

## Endurecimiento del origen (servidor)

- Exponer solo 80/443 publicamente.
- Mantener puerto interno de Node.js sin acceso directo desde internet.
- Si usas VPS:
  - `ufw allow 80/tcp`
  - `ufw allow 443/tcp`
  - `ufw deny 3000/tcp`
  - `ufw deny 3001/tcp`

## Monitoreo minimo

- Alertas por picos de `429` (rate limit).
- Alertas por aumento de `5xx`.
- Rotacion de logs y revision diaria de `/api/mp/create-preference`.
