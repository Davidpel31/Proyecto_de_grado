# InventarIA · prototipo navegable

Prototipo del proyecto **InventarIA**: una plataforma de gestión de inventario que usa el historial de ventas para pronosticar la demanda y recomendar cuánto y cuándo reponer, pensada para PYMEs.

Proyecto de Ingeniería I · Ingeniería de Sistemas · UTB · 2026-02

> Es un prototipo: todo corre en el navegador, con **datos de demostración ficticios** de una tienda de barrio (25 productos y ocho meses de ventas). No hay servidor ni base de datos. Lo que se registra se guarda solo en el navegador de quien lo prueba.

## Cómo verlo

**En tu computador:** abre `index.html` con doble clic. Funciona sin instalar nada.

Si prefieres verlo como lo verá el docente, desde una carpeta con servidor local:

```bash
python3 -m http.server 8000
# luego abre http://localhost:8000
```

**En internet (GitHub Pages):** mira la sección siguiente.

## Cómo publicarlo en GitHub Pages

1. Crea un repositorio nuevo en GitHub (por ejemplo `inventaria-prototipo`). Déjalo **público**.
2. Sube el contenido de esta carpeta a la raíz del repositorio. Con la terminal:

   ```bash
   git init
   git add .
   git commit -m "Prototipo navegable de InventarIA"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/inventaria-prototipo.git
   git push -u origin main
   ```

   (También puedes arrastrar los archivos en la página del repositorio con **Add file → Upload files**.)
3. En el repositorio entra a **Settings → Pages**.
4. En **Build and deployment**, elige **Source: Deploy from a branch**, rama **main** y carpeta **/ (root)**. Guarda.
5. Espera uno o dos minutos. La dirección será:

   ```
   https://TU-USUARIO.github.io/inventaria-prototipo/
   ```

   Esa es la dirección que va en el Anexo A del documento.

Notas:
- El archivo `.nojekyll` evita que GitHub procese los archivos como un sitio Jekyll. Déjalo en la raíz.
- Las rutas de la aplicación usan `#` (por ejemplo `#/productos`), así que no hace falta configurar nada más en el servidor.
- Si cambias algo y haces `git push`, la página se actualiza sola en uno o dos minutos.

## Recorrido sugerido para la demostración

1. **Entrar como Administrador.** El dashboard resume en una frase cuántos productos necesitan una decisión esta semana y muestra la *estantería*: cada casilla es un producto, con los días de ventas que alcanzan sus existencias.
2. Abrir **Arroz 500 g** desde la estantería y luego **Ver pronóstico**: gráfico de ventas y pronóstico con su rango probable, comparación de técnicas con sus métricas y la recomendación con su «¿Por qué?».
3. Ir a **Registrar movimiento**: probar una salida mayor a las existencias (el sistema la rechaza) y luego registrar una entrada. Ver cómo cambia el estado del producto.
4. Ir a **Importar ventas** y pulsar **Probar con un archivo de ejemplo**: el sistema revisa cada fila y explica los errores antes de guardar.
5. Revisar **ABC y rotación**, **Alertas** y **Recomendaciones** (incluye el resumen del pedido por proveedor).
6. **Cambiar de rol** a Operativo: solo ve productos, entradas, salidas e historial.

El botón **Restablecer datos de demostración** (menú lateral) borra lo que hayas registrado.

## Qué contiene

```
index.html          Página única; carga los scripts en orden
css/styles.css      Estilos
js/data.js          Fechas, datos de demostración y almacenamiento local (el "store")
js/forecast.js      Técnicas de pronóstico, métricas y reglas de reposición
js/engine.js        Calcula por producto: existencias, rotación, ABC, estado y mensajes
js/ui.js            Formato, gráficos SVG, ventanas modales y avisos
js/views.js         Las pantallas (una función por pantalla)
js/app.js           Arranque, rol de demostración, menú y rutas
```

### Qué es real y qué es simplificado

| Parte | En el prototipo | En la versión 1.0 |
|---|---|---|
| Datos | Generados con semilla fija; los cambios del usuario se guardan en `localStorage` | PostgreSQL |
| Lógica de negocio | `engine.js` en el navegador | API en FastAPI |
| Pronóstico | Promedio móvil (línea base), Holt-Winters amortiguado, modelo aditivo de tendencia + estacionalidad semanal y Croston/SBA, escritos a mano en JavaScript | Python: statsmodels, Prophet y Croston/SBA, con la misma evaluación |
| Reglas de reposición | **Las mismas del documento** (ver abajo) | Iguales, calibradas con datos reales |
| Roles | Se eligen con un botón | Autenticación con JWT y roles validados en el servidor |
| Importación | Solo CSV | CSV y Excel, con validación en el servidor |

### Reglas implementadas

- **Evaluación:** se entrena con el pasado y se prueba con las 4 semanas más recientes (4 ventanas de 7 días). Métricas: MAE, RMSE, WAPE y MASE (escalado contra repetir la semana anterior). No se usa MAPE porque falla cuando las ventas son cero.
- **Técnica elegida:** la de menor MASE. Si el producto tiene muchos días sin ventas (40 % o más en los últimos 90 días) también compite Croston/SBA. Si hay menos de 10 días con ventas, no se pronostica y se usa una regla simple basada en el nivel mínimo.
- **Stock de seguridad:** `SS = z · σ · √L`, con z según el nivel de servicio, σ el error típico diario del pronóstico y L el tiempo de entrega en días.
- **Punto de reorden:** `PR = demanda pronosticada durante la entrega + SS`.
- **Cantidad sugerida:** `Q = demanda pronosticada durante (entrega + cobertura objetivo) + SS − existencias`.
- **Estados:** *Se agota pronto* (se agotaría antes de que alcance a llegar un pedido hecho hoy), *Vigilar* (ya está en el punto de reorden o llegará en los próximos 3 días, o está bajo el nivel mínimo), *Sobreinventario* (cobertura mayor a 90 días o a 3 veces entrega + cobertura) y *En orden*.
- **ABC:** valor vendido en 90 días (unidades × costo); A hasta el 80 % acumulado, B hasta el 95 % y C el resto.
- **Rotación:** unidades vendidas en 30 días ÷ existencias promedio de esos 30 días. Alta ≥ 3, media ≥ 1,5, baja < 1,5.

### Datos de demostración

`data.js` genera siempre los mismos datos (semilla fija) y fija la «fecha de hoy» en el 8 de octubre de 2026 para que todos vean lo mismo. Cada producto tiene un escenario pensado para mostrar los distintos estados (por ejemplo, el arroz, el café y la leche están por agotarse; las lentejas y las velas tienen de más). Los proveedores y sus datos de contacto son ficticios.

## Hacia la versión 1.0

Cómo se corresponde este prototipo con la arquitectura propuesta en el documento:

| Prototipo | Versión 1.0 |
|---|---|
| `views.js`, `ui.js`, `app.js`, `css/` | Frontend en React (pantallas, rutas, formularios) |
| `data.js` (el *store*) | Base de datos PostgreSQL + endpoints de la API |
| `engine.js` | Servicios de negocio de la API (inventario, ABC, estados, alertas) |
| `forecast.js` | Servicio de pronóstico en Python |

Decisiones que quedan abiertas para las próximas entregas:

- ¿Las **salidas** registradas cuentan como ventas del historial? Hoy son dos cosas separadas: el historial se alimenta de la importación.
- ¿Las **existencias** se calculan siempre desde los movimientos o se guardan como campo derivado? (El modelo de datos del documento propone guardarlas como dato derivado.)
- Umbrales de rotación, de sobreinventario y nivel de servicio por defecto.
- Qué hacer con los días en que un producto estuvo agotado (las ventas ese día subestiman la demanda).

## Limitaciones

- Los datos y los resultados del pronóstico son de demostración; no representan a ningún negocio real.
- El prototipo no valida permisos en un servidor: el rol solo cambia lo que se muestra.
- Si se borra el almacenamiento del navegador, se pierden los cambios hechos por el usuario (los datos base siempre se regeneran).
- Las fuentes se cargan desde Google Fonts; sin conexión se usa la fuente del sistema.
