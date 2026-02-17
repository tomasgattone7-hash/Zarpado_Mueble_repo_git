# Zarpado Mueble

Estructura actual del proyecto:

```text
muebles_web/
├── frontend/
│   ├── assets/
│   ├── css/
│   ├── js/
│   ├── pages/
│   ├── index.html
│   ├── sitemap.xml
│   ├── robots.txt
│   └── _redirects
├── backend/
│   ├── server.js
│   ├── routes/
│   ├── utils/
│   └── package.json
├── config/
├── data/
├── scripts/
├── server.js
├── package.json
└── README.md
```

## Comandos

- `npm start`: inicia servidor en `http://localhost:3000`
- `npm run dev`: inicia con nodemon
- `npm run lint`: valida backend + frontend JS
- `npm run smoke`: prueba rápida de APIs críticas

## Frontend

- CSS: `frontend/css/styles.min.css`
- JS principal: `frontend/js/script.min.js`
- Páginas internas: `frontend/pages/*.html`
- Favicons estándar:
  - `/assets/favicon-32x32.png`
  - `/assets/favicon-16x16.png`
  - `/assets/apple-touch-icon.png`
  - `/assets/favicon.ico`

## Formularios

El frontend envía a:

- `POST /forms/contacto`
- `POST /forms/medida`

El backend reenvía a Formspree con fallback de endpoint para evitar errores 500 si un form ID queda inválido.
