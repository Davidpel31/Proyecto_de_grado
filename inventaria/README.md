# InventarIA

Plataforma de gestión de inventario con pronóstico de demanda y recomendación de reposición para tiendas de barrio y minimercados.

Proyecto de Ingeniería I · Ingeniería de Sistemas · UTB · 2026-02 · Avance 4

## Qué hace hoy (Avance 4)

- **Flujo de inventario de punta a punta:** inicio de sesión con roles (Administrador y Operativo), productos, proveedores, entradas, salidas, ajustes, historial y pedidos a proveedores. Todo pasa por una API REST y queda en una base de datos relacional.
- **Integridad:** las existencias nunca quedan negativas ni se pierden movimientos, aunque lleguen ventas simultáneas.
- **Importación de ventas validada:** revisa cada fila antes de guardar, rechaza duplicados y archivos repetidos, y marca los días en que el producto estuvo agotado (demanda censurada).
- **Análisis:** dashboard, ABC y rotación, pronóstico con comparación de técnicas, alertas y recomendaciones. **Hoy este motor corre en el navegador**; en el Avance 5 pasa a un servicio en Python.

Los datos son de demostración (una tienda ficticia de 25 productos). No hay todavía un negocio piloto.

## Cómo ejecutarlo

### Opción 1: sin Docker (SQLite, lo más rápido)

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app
```

Abre http://localhost:8000. La documentación interactiva de la API está en http://localhost:8000/docs.

### Opción 2: con Docker (PostgreSQL)

```bash
docker compose up --build
```

Abre http://localhost:8000.

### Usuarios de demostración

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `admin123` | Administrador |
| `operativo` | `operativo123` | Operativo |

Solo sirven para pruebas locales. En cualquier uso real se cambian las contraseñas y la variable `SECRET_KEY` (ver `.env.example`).

## Pruebas

```bash
cd backend
python -m pytest            # 34 pruebas, con SQLite
```

Con PostgreSQL: define `DATABASE_URL=postgresql+psycopg://usuario:clave@localhost:5432/base` antes de ejecutar.

La prueba con navegador (16 pasos) está en `e2e/` (ver su README). La simulación que compara políticas de reposición:

```bash
node tools/simulacion_politicas.js
```

## Estructura

```
backend/
  app/
    main.py            Arranque de la API
    models.py          Modelo de datos (16 tablas, con restricciones)
    security.py        JWT, roles y contraseñas con scrypt
    routers/           Rutas HTTP (auth, catálogo, inventario)
    services/          Reglas de negocio (movimientos, pedidos, importación, estado, semilla)
    seed/              Datos de demostración
  tests/               Pruebas automáticas (34)
frontend/              Interfaz (HTML, CSS y JavaScript sin compilación)
  js/api.js            Conexión con la API
  js/engine.js         Estado de cada producto, ABC, rotación, alertas
  js/forecast.js       Técnicas de pronóstico, evaluación y reglas de reposición
tools/                 Simulación de políticas y exportación de los datos de demostración
e2e/                   Prueba con navegador
docs/evidencia/        Capturas del flujo principal
docker-compose.yml     API + PostgreSQL
.github/workflows/     Pruebas automáticas y publicación de la demostración
```

## Cómo entender la lógica (guía para sustentar)

1. **¿Cómo evita existencias negativas?** `backend/app/services/movimientos.py`. Una sola instrucción atómica: `UPDATE producto SET existencias = existencias − q WHERE id = … AND existencias >= q RETURNING existencias`. Si no actualiza ninguna fila, se rechaza. La restricción `CHECK (existencias >= 0)` de `models.py` es la última defensa. Prueba: `tests/test_concurrencia.py`.
2. **¿Cómo evita duplicar una importación?** `services/importacion.py`: huella SHA-256 del archivo y restricción `UNIQUE (producto_id, fecha)`.
3. **¿Qué es la demanda censurada?** Un día en que el producto terminó agotado no mide la demanda. Se marca (`marcar_censuradas`), se reemplaza solo para entrenar (`imputar` en `forecast.js`) y se excluye de las métricas.
4. **¿Cómo se elige el modelo de pronóstico?** `forecast.js`: origen móvil con 8 ventanas semanales, línea base ingenua estacional, menor MASE; avisa si no supera al ingenuo.
5. **¿Cuánto y cuándo pedir?** `reponer` en `forecast.js`: `SS = z·σ·√L`, `PR = demanda en la entrega + SS`, posición = existencias + pedidos pendientes, cantidad ajustada al mínimo y al múltiplo del proveedor.

## Publicar la demostración en GitHub Pages

El flujo `.github/workflows/pages.yml` publica la carpeta `frontend/` (modo demostración, sin servidor). Para activarlo: **Settings → Pages → Source: GitHub Actions**. Sin servidor, el frontend usa los datos de demostración locales; conectado al servidor usa la base de datos y el inicio de sesión real.

> Los flujos de GitHub Actions se escribieron sin poder ejecutarlos en GitHub: si fallan, revisa la pestaña **Actions** del repositorio.

## Limitaciones conocidas

- El motor de análisis y las técnicas de pronóstico están en JavaScript simplificado. El servicio con statsmodels y Prophet es del Avance 5.
- `GET /api/estado` devuelve todos los datos de una vez: sirve para esta escala, pero hay que paginar y calcular en el servidor.
- Importación solo de CSV; falta Excel y restar devoluciones automáticamente.
- Credenciales y clave de firma de demostración; sin recuperación de contraseña.
- La detección de demanda censurada solo considera días que terminan en cero.
- Las pruebas con PostgreSQL se ejecutaron contra un servidor embebido; `docker-compose.yml` debe verificarse en cada equipo.
- La simulación de políticas usa datos sintéticos: solo prueba el procedimiento. Con ellos, la política con pronóstico no se distingue claramente de un promedio móvil sencillo.
