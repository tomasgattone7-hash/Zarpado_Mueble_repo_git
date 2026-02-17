# Inventory & Diagnóstico

Fecha: 2026-02-17
Repo auditado: `muebles_web/`

## Comandos ejecutados

```bash
ls -la
find . -maxdepth 3 \( -name "package.json" -o -name "server.js" -o -name "package-lock.json" \)
find . -name "node_modules" -type d -prune
find . \( -name "*.log" -o -name "server.log" -o -name "npm-debug.log*" \)
git status --short --branch
git ls-files | grep -E "node_modules|\.env|\.log$" || true
```

## Hallazgos

1. Fuente real de frontend: `frontend/index.html`.
2. Fuente real de backend: `backend/server.js` + `backend/package.json`.
3. `package.json` y `server.js` están solo en `backend/` (sin duplicados funcionales en raíz del repo).
4. `node_modules` detectado localmente en `backend/node_modules` (no trackeado por Git).
5. No se detectaron logs (`*.log`) en el árbol del repo.
6. `git ls-files` no muestra `node_modules`, `.env` ni `.log` versionados; solo `backend/.env.example`.
7. El repo venía con cambios pendientes previos al inicio de esta tarea (worktree no limpio).

## Estado estructural

Estructura objetivo presente y consolidada:

- `frontend/`
- `backend/`
- `docs/`
- `netlify.toml`
- `.gitignore`
- `README.md`

## Acciones previstas tras diagnóstico

- Endurecer `.gitignore` para exclusiones globales.
- Eliminar dependencia de reCAPTCHA (front + back).
- Reforzar `/forms/*` con allowlist `origin/referer`, honeypot y rate limit estricto.
- Ajustar URLs de MercadoPago a `FRONTEND_URL`/`API_URL`.
- Validar deploys Netlify/Railway y documentar pruebas.
