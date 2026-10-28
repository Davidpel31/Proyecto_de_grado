# Frontend de InventarIA

HTML, CSS y JavaScript sin compilación. Lo sirve la propia API (carpeta `backend`), o se puede abrir solo.

- **Con servidor** (`uvicorn app.main:app`): muestra el inicio de sesión real y usa la base de datos.
- **Sin servidor** (abriendo `index.html` o en GitHub Pages): funciona como prototipo, con datos de demostración locales y un botón para elegir el rol.

Archivos: `js/api.js` (conexión con la API), `js/engine.js` (estado, ABC, rotación, alertas), `js/forecast.js` (pronóstico y reglas de reposición), `js/views.js` (pantallas), `js/app.js` (arranque y rutas).
Instrucciones completas en el README de la raíz.
