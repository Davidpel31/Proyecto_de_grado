# Prueba extremo a extremo (con navegador)

Recorre el flujo principal contra el servidor real y guarda capturas en `docs/evidencia/`.

```bash
# 1) servidor con base limpia (desde la carpeta backend)
DATABASE_URL=sqlite:////tmp/e2e.db uvicorn app.main:app --port 8000
# 2) en otra terminal, desde esta carpeta
npm install
node e2e.js
```

Si repites la prueba hay que reiniciar el servidor con una base nueva, porque la prueba crea y recibe pedidos.
El único «error» que muestra al final es un 401 esperado: es el paso de contraseña incorrecta.
