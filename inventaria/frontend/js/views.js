/* =====================================================================
   InventarIA · prototipo
   views.js — cada pantalla es una función que recibe el contexto (ctx)
   y devuelve { html, despues(raiz) }. `despues` conecta los eventos
   una vez que el HTML ya está en la página.
   ===================================================================== */
(function (root) {
  'use strict';
  var INV = root.INV = root.INV || {};
  var UI = INV.ui, E = INV.engine, FE = INV.fechas, esc = UI.esc, num = UI.num;

  /* ------------------------------ ayudas ------------------------------ */
  function plural(n, uno, varios) { return n === 1 ? uno : varios; }
  function enlaceProducto(i) { return '<a href="#/productos/' + encodeURIComponent(i.sku) + '">' + esc(i.producto.nombre) + '</a>'; }
  function cabecera(titulo, descripcion, acciones) {
    return '<header class="page-head"><div><h1>' + esc(titulo) + '</h1>' + (descripcion ? '<p class="muted">' + descripcion + '</p>' : '') + '</div>' +
      (acciones ? '<div class="page-acciones">' + acciones + '</div>' : '') + '</header>';
  }
  function opciones(lista, valor, vacio) {
    return (vacio ? '<option value="">' + esc(vacio) + '</option>' : '') +
      lista.map(function (o) { return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(valor) ? ' selected' : '') + '>' + esc(o.t) + '</option>'; }).join('');
  }
  function tipoMov(m) {
    var t = { entrada: ['Entrada', 'mov-entrada'], salida: ['Salida', 'mov-salida'], ajuste: ['Ajuste', 'mov-ajuste'] }[m.tipo];
    return '<span class="mov ' + t[1] + '">' + t[0] + '</span>';
  }
  function cantidadMov(m, abrev) {
    var signo = m.tipo === 'salida' ? -1 : (m.cantidad < 0 ? -1 : 1);
    var v = Math.abs(m.cantidad);
    return '<span class="cant ' + (signo < 0 ? 'neg' : 'pos') + '">' + (signo < 0 ? '−' : '+') + num(v) + ' ' + esc(abrev) + '</span>';
  }
  function tabla(cabeceras, filas, clase) {
    return '<div class="tabla-wrap"><table class="tabla ' + (clase || '') + '"><thead><tr>' +
      cabeceras.map(function (c) { return '<th scope="col"' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + (c.t || c) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + filas + '</tbody></table></div>';
  }
  function vacio(texto, accion) {
    return '<div class="vacio"><p>' + texto + '</p>' + (accion || '') + '</div>';
  }
  function esAdmin(ctx) { return ctx.rol === 'admin'; }
  function productosActivos(ctx) { return ctx.estado.productos.filter(function (p) { return p.activo !== false; }); }
  function porNombre(a, b) { return a.nombre.localeCompare(b.nombre, 'es'); }

  /* ============================= DASHBOARD ============================= */
  function dashboard(ctx) {
    var A = ctx.A, r = A.resumen, c = r.cuenta;
    var partes = [];
    if (c.agotamiento) partes.push(c.agotamiento + ' ' + plural(c.agotamiento, 'se agotaría', 'se agotarían') + ' antes de que llegue un pedido hecho hoy');
    if (c.vigilar) partes.push(c.vigilar + ' ' + plural(c.vigilar, 'llega', 'llegan') + ' al punto de reorden');
    if (c.sobreinventario) partes.push(c.sobreinventario + ' ' + plural(c.sobreinventario, 'tiene', 'tienen') + ' más inventario del necesario');
    var titulo = r.requierenAtencion
      ? r.requierenAtencion + ' ' + plural(r.requierenAtencion, 'producto necesita', 'productos necesitan') + ' una decisión de compra esta semana'
      : 'Todo está en orden esta semana';
    var detalle = partes.length ? partes.join('; ') + '.' : 'Ningún producto está cerca de agotarse.';

    var tiles = A.lista.map(function (i) {
      var cob = i.rep.cobertura == null ? '—' : (!isFinite(i.rep.cobertura) || i.rep.cobertura > 120 ? '120+' : num(i.rep.cobertura, i.rep.cobertura < 10 ? 1 : 0));
      var e = UI.ESTADOS[i.estado];
      return '<a class="tile ' + e.cls + '" href="#/productos/' + encodeURIComponent(i.sku) + '" aria-label="' + esc(i.producto.nombre + ': ' + e.txt + ', alcanza para ' + cob + ' días') + '">' +
        '<span class="tile-nombre">' + esc(i.producto.nombre) + '</span>' +
        '<span class="tile-num"><b>' + cob + '</b> días</span>' +
        '<span class="tile-est">' + e.txt + '</span></a>';
    }).join('');

    var atencion = A.lista.filter(function (i) { return i.estado !== 'normal'; }).slice(0, 8);
    var filas = atencion.map(function (i) {
      return '<tr><td>' + enlaceProducto(i) + '<small class="sku">' + esc(i.sku) + '</small></td>' +
        '<td class="num">' + num(i.existencias) + ' ' + esc(i.unidad.abrev) + '</td>' +
        '<td class="num">' + UI.coberturaTexto(i.rep) + '</td>' +
        '<td>' + UI.badge(i.estado) + '</td><td>' + esc(UI.accionSugerida(i)) + '</td></tr>';
    }).join('');

    var html = cabecera(ctx.saludo, FE.larga(FE.HOY) + ' · datos de demostración') +
      '<section class="resumen" aria-labelledby="t-resumen"><h2 id="t-resumen">' + titulo + '</h2><p>' + detalle + '</p></section>' +
      '<dl class="cifras">' +
      '<div><dt>Productos activos</dt><dd>' + r.activos + '</dd></div>' +
      '<div><dt>Cobertura típica</dt><dd>' + num(r.coberturaMediana) + ' <small>días</small></dd></div>' +
      '<div><dt>Rotación media</dt><dd>' + num(r.rotacionMedia, 1) + ' <small>veces al mes</small></dd></div>' +
      '<div><dt>Alertas activas</dt><dd class="' + (r.alertas ? 'texto-rojo' : '') + '">' + r.alertas + '</dd></div></dl>' +
      '<section class="panel" aria-labelledby="t-est"><div class="panel-cab"><h2 id="t-est">Estantería</h2>' +
      '<ul class="leyenda"><li class="est-rojo"><i></i>Se agota pronto</li><li class="est-ambar"><i></i>Vigilar</li><li class="est-morado"><i></i>Sobreinventario</li><li class="est-verde"><i></i>En orden</li></ul></div>' +
      '<p class="muted">Cada casilla es un producto y muestra para cuántos días de ventas alcanzan sus existencias. Las más urgentes aparecen primero.</p>' +
      '<div class="estanteria">' + tiles + '</div></section>' +
      '<section class="panel" aria-labelledby="t-aten"><div class="panel-cab"><h2 id="t-aten">Productos que requieren atención</h2><a href="#/analisis/recomendaciones">Ver recomendaciones</a></div>' +
      (atencion.length ? tabla(['Producto', { t: 'Existencias', cls: 'num' }, { t: 'Alcanza para', cls: 'num' }, 'Estado', 'Qué hacer'], filas) : vacio('No hay productos que requieran atención.')) + '</section>' +
      '<div class="dos-col igual">' +
      '<section class="panel" aria-labelledby="t-sem"><div class="panel-cab"><h2 id="t-sem">Ventas y existencias</h2></div><p class="muted">Últimas 12 semanas, en unidades de todos los productos.</p>' + UI.graficoSemanas(A.semanas) + '</section>' +
      '<section class="panel" aria-labelledby="t-abc"><div class="panel-cab"><h2 id="t-abc">Clasificación ABC</h2><a href="#/analisis/abc">Ver detalle</a></div><p class="muted">Cuánto del valor vendido en 90 días aporta cada clase de producto.</p>' + UI.barraABC(A.abc) + '</section></div>';
    return { html: html };
  }

  /* ============================== PRODUCTOS ============================== */
  function formProducto(ctx, p) {
    var e = ctx.estado, nuevo = !p;
    p = p || { sku: '', nombre: '', categoriaId: e.categorias[0].id, unidadId: e.unidades[0].id, costo: '', proveedorId: e.proveedores[0].id, tiempoEntrega: e.proveedores[0].tiempoEntrega, nivelMinimo: '', cobertura: 14, nivelServicio: 0.95, activo: true };
    return '<div class="campos">' +
      (nuevo ? '<label>Código (SKU)<input name="sku" required maxlength="16" placeholder="Ej.: ARR-500" autocomplete="off"></label>' : '<input type="hidden" name="sku" value="' + esc(p.sku) + '">') +
      '<label>Nombre<input name="nombre" required maxlength="60" value="' + esc(p.nombre) + '"></label>' +
      '<label>Categoría<select name="categoriaId">' + opciones(e.categorias.map(function (c) { return { v: c.id, t: c.nombre }; }), p.categoriaId) + '</select></label>' +
      '<label>Unidad de medida<select name="unidadId">' + opciones(e.unidades.map(function (u) { return { v: u.id, t: u.nombre + ' (' + u.abrev + ')' }; }), p.unidadId) + '</select></label>' +
      '<label>Costo por unidad (COP)<input name="costo" type="number" min="0" step="50" required value="' + esc(p.costo) + '"></label>' +
      '<label>Proveedor principal<select name="proveedorId">' + opciones(e.proveedores.map(function (x) { return { v: x.id, t: x.nombre }; }), p.proveedorId) + '</select></label>' +
      '<label>Tiempo de entrega (días)<input name="tiempoEntrega" type="number" min="1" max="60" required value="' + esc(p.tiempoEntrega) + '"></label>' +
      '<label>Nivel mínimo<input name="nivelMinimo" type="number" min="0" required value="' + esc(p.nivelMinimo) + '"></label>' +
      '<label>Cobertura objetivo (días)<input name="cobertura" type="number" min="1" max="90" required value="' + esc(p.cobertura) + '"></label>' +
      '<label>Pedido mínimo (unidades)<input name="minimoPedido" type="number" min="1" required value="' + esc(p.minimoPedido || 1) + '"></label>' +
      '<label>Se pide en múltiplos de<input name="multiploPedido" type="number" min="1" required value="' + esc(p.multiploPedido || 1) + '"></label>' +
      '<label>Nivel de servicio<select name="nivelServicio">' + opciones([{ v: 0.9, t: '90 %' }, { v: 0.95, t: '95 %' }, { v: 0.975, t: '97,5 %' }, { v: 0.99, t: '99 %' }], p.nivelServicio) + '</select></label>' +
      (nuevo ? '' : '<label class="check"><input type="checkbox" name="activo"' + (p.activo !== false ? ' checked' : '') + '> Producto activo</label>') +
      '</div>';
  }
  function leerProducto(d, nuevo, ctx) {
    var costo = parseFloat(d.costo), ent = parseInt(d.tiempoEntrega, 10), minimo = parseInt(d.nivelMinimo, 10), cob = parseInt(d.cobertura, 10);
    var moq = parseInt(d.minimoPedido, 10), mult = parseInt(d.multiploPedido, 10);
    if (!d.nombre.trim()) return { error: 'Escribe el nombre del producto.' };
    if (nuevo) {
      if (!/^[A-Za-z0-9-]{2,16}$/.test(d.sku.trim())) return { error: 'El código debe tener entre 2 y 16 letras, números o guiones.' };
      if (ctx.estado.productos.some(function (p) { return p.sku.toLowerCase() === d.sku.trim().toLowerCase(); })) return { error: 'Ya existe un producto con ese código.' };
    }
    if (isNaN(costo) || costo < 0) return { error: 'El costo debe ser un número mayor o igual a cero.' };
    if (isNaN(ent) || ent < 1 || ent > 60) return { error: 'El tiempo de entrega debe estar entre 1 y 60 días.' };
    if (isNaN(minimo) || minimo < 0) return { error: 'El nivel mínimo debe ser un número mayor o igual a cero.' };
    if (isNaN(cob) || cob < 1 || cob > 90) return { error: 'La cobertura objetivo debe estar entre 1 y 90 días.' };
    if (isNaN(moq) || moq < 1 || isNaN(mult) || mult < 1) return { error: 'El pedido mínimo y el múltiplo deben ser números enteros desde 1.' };
    return { valor: { sku: d.sku.trim().toUpperCase(), nombre: d.nombre.trim(), categoriaId: d.categoriaId, unidadId: d.unidadId, costo: costo, proveedorId: d.proveedorId,
      tiempoEntrega: ent, nivelMinimo: minimo, cobertura: cob, nivelServicio: parseFloat(d.nivelServicio), minimoPedido: moq, multiploPedido: mult, activo: nuevo ? true : !!d.activo } };
  }

  function productos(ctx) {
    var A = ctx.A, e = ctx.estado, admin = esAdmin(ctx);
    var html = cabecera('Productos', 'Consulta las existencias y el estado de cada producto.',
      admin ? '<button class="btn btn-primary" id="nuevo-producto" type="button">Nuevo producto</button>' : '') +
      '<div class="filtros"><label>Buscar<input type="search" id="f-texto" placeholder="Nombre o código"></label>' +
      '<label>Categoría<select id="f-cat">' + opciones(e.categorias.map(function (c) { return { v: c.nombre, t: c.nombre }; }), '', 'Todas') + '</select></label>' +
      '<label>Estado<select id="f-est">' + opciones([{ v: 'agotamiento', t: 'Se agota pronto' }, { v: 'vigilar', t: 'Vigilar' }, { v: 'sobreinventario', t: 'Sobreinventario' }, { v: 'normal', t: 'En orden' }, { v: 'inactivo', t: 'Inactivo' }], '', 'Todos') + '</select></label></div>' +
      '<p class="muted" id="f-cuenta" aria-live="polite"></p><div id="tabla-productos"></div>';

    function pintar() {
      var t = document.getElementById('f-texto').value.trim().toLowerCase();
      var cat = document.getElementById('f-cat').value, est = document.getElementById('f-est').value;
      var lista = A.todos.slice().sort(function (a, b) { return porNombre(a.producto, b.producto); }).filter(function (i) {
        return (!t || i.producto.nombre.toLowerCase().indexOf(t) >= 0 || i.sku.toLowerCase().indexOf(t) >= 0) && (!cat || i.categoria === cat) && (!est || i.estado === est);
      });
      document.getElementById('f-cuenta').textContent = lista.length + ' ' + plural(lista.length, 'producto', 'productos');
      var filas = lista.map(function (i) {
        return '<tr><td>' + enlaceProducto(i) + '<small class="sku">' + esc(i.sku) + '</small></td><td>' + esc(i.categoria) + '</td>' +
          '<td class="num">' + num(i.existencias) + ' ' + esc(i.unidad.abrev) + '</td><td class="num">' + UI.coberturaTexto(i.rep) + '</td>' +
          '<td>' + UI.badgeInfo(i) + '</td>' + (admin ? '<td class="centro">' + (i.abc ? '<span class="abc-pill abc-' + i.abc.toLowerCase() + '">' + i.abc + '</span>' : '—') + '</td>' : '') + '</tr>';
      }).join('');
      document.getElementById('tabla-productos').innerHTML = lista.length
        ? tabla(['Producto', 'Categoría', { t: 'Existencias', cls: 'num' }, { t: 'Alcanza para', cls: 'num' }, 'Estado'].concat(admin ? [{ t: 'ABC', cls: 'centro' }] : []), filas)
        : vacio('Ningún producto coincide con la búsqueda.');
    }
    return { html: html, despues: function () {
      pintar();
      ['f-texto', 'f-cat', 'f-est'].forEach(function (id) { document.getElementById(id).addEventListener('input', pintar); });
      var b = document.getElementById('nuevo-producto');
      if (b) b.addEventListener('click', function () {
        UI.abrirModal({ titulo: 'Nuevo producto', cuerpo: formProducto(ctx, null), accion: 'Crear producto', alGuardar: function (d) {
          var r = leerProducto(d, true, ctx);
          if (r.error) return r.error;
          return Promise.resolve(INV.Store.agregarProducto(r.valor)).then(function () {
            UI.aviso('Producto creado. Importa sus ventas históricas para activar el pronóstico.');
            ctx.refrescar();
          });
        } });
      });
    } };
  }

  function productoDetalle(ctx) {
    var i = ctx.A.info[ctx.args.sku];
    if (!i) return { html: cabecera('Producto no encontrado') + vacio('No existe un producto con el código «' + esc(ctx.args.sku) + '».', '<a class="btn" href="#/productos">Volver a productos</a>') };
    var admin = esAdmin(ctx), p = i.producto, u = i.unidad.abrev;
    var movs = ctx.estado.movimientos.filter(function (m) { return m.sku === i.sku; }).slice(-10).reverse();
    var filas = movs.map(function (m) {
      return '<tr><td>' + FE.media(m.fecha) + '</td><td>' + tipoMov(m) + '</td><td class="num">' + cantidadMov(m, u) + '</td><td>' + esc(m.motivo) + '</td></tr>';
    }).join('');
    var acciones = '<a class="btn" href="#/movimientos/nuevo?sku=' + encodeURIComponent(i.sku) + '">Registrar movimiento</a>' +
      (admin ? '<a class="btn" href="#/analisis/pronostico/' + encodeURIComponent(i.sku) + '">Ver pronóstico</a><button class="btn" type="button" id="editar-producto">Editar</button>' : '');
    var html = '<p class="migas"><a href="#/productos">Productos</a> / ' + esc(p.nombre) + '</p>' +
      cabecera(p.nombre, esc(i.sku) + ' · ' + esc(i.categoria) + ' · ' + (i.proveedor ? esc(i.proveedor.nombre) : 'Sin proveedor'), acciones) +
      '<section class="resumen estado-' + i.estado + '"><div>' + UI.badgeInfo(i) + '</div><p>' + esc(i.mensaje) + '</p></section>' +
      '<dl class="cifras">' +
      '<div><dt>Existencias</dt><dd>' + num(i.existencias) + ' <small>' + esc(u) + '</small></dd></div>' +
      '<div><dt>Alcanza para</dt><dd>' + UI.coberturaTexto(i.rep) + '</dd></div>' +
      '<div><dt>Nivel mínimo</dt><dd>' + num(p.nivelMinimo) + ' <small>' + esc(u) + '</small></dd></div>' +
      '<div><dt>Último ingreso</dt><dd class="dd-chico">' + (i.ultimaEntrada ? FE.media(i.ultimaEntrada) : '—') + '</dd></div>' +
      (admin ? '<div><dt>Rotación</dt><dd>' + num(i.rotacion, 1) + ' <small>veces al mes (' + i.claseRot + ')</small></dd></div>' +
        '<div><dt>Clase ABC</dt><dd>' + (i.abc || '—') + '</dd></div>' : '') + '</dl>' +
      '<section class="panel"><div class="panel-cab"><h2>Últimos movimientos</h2><a href="#/movimientos/historial?sku=' + encodeURIComponent(i.sku) + '">Ver historial completo</a></div>' +
      tabla(['Fecha', 'Tipo', { t: 'Cantidad', cls: 'num' }, 'Motivo'], filas) + '</section>';
    return { html: html, despues: function () {
      var b = document.getElementById('editar-producto');
      if (b) b.addEventListener('click', function () {
        UI.abrirModal({ titulo: 'Editar ' + p.nombre, cuerpo: formProducto(ctx, p), alGuardar: function (d) {
          var r = leerProducto(d, false, ctx);
          if (r.error) return r.error;
          var cambios = r.valor; delete cambios.sku;
          return Promise.resolve(INV.Store.editarProducto(p.sku, cambios)).then(function () {
            UI.aviso('Cambios guardados.');
            ctx.refrescar();
          });
        } });
      });
    } };
  }

  /* ============================ CATEGORÍAS Y UNIDADES ============================ */
  function categorias(ctx) {
    var e = ctx.estado;
    var cuentaCat = {}, cuentaUni = {};
    e.productos.forEach(function (p) { cuentaCat[p.categoriaId] = (cuentaCat[p.categoriaId] || 0) + 1; cuentaUni[p.unidadId] = (cuentaUni[p.unidadId] || 0) + 1; });
    var f1 = e.categorias.map(function (c) { return '<tr><td>' + esc(c.nombre) + '</td><td class="num">' + (cuentaCat[c.id] || 0) + '</td></tr>'; }).join('');
    var f2 = e.unidades.map(function (u) { return '<tr><td>' + esc(u.nombre) + '</td><td>' + esc(u.abrev) + '</td><td class="num">' + (cuentaUni[u.id] || 0) + '</td></tr>'; }).join('');
    var html = cabecera('Categorías y unidades', 'Agrupan los productos y definen cómo se cuentan.') +
      '<div class="dos-col igual"><section class="panel"><div class="panel-cab"><h2>Categorías</h2></div>' + tabla(['Nombre', { t: 'Productos', cls: 'num' }], f1) +
      '<form class="form-inline" id="form-cat"><label>Nueva categoría<input name="nombre" required maxlength="40"></label><button class="btn btn-primary" type="submit">Agregar categoría</button></form></section>' +
      '<section class="panel"><div class="panel-cab"><h2>Unidades de medida</h2></div>' + tabla(['Nombre', 'Abreviatura', { t: 'Productos', cls: 'num' }], f2) +
      '<form class="form-inline" id="form-uni"><label>Nueva unidad<input name="nombre" required maxlength="30"></label><label>Abreviatura<input name="abrev" required maxlength="6" size="6"></label><button class="btn btn-primary" type="submit">Agregar unidad</button></form></section></div>';
    return { html: html, despues: function () {
      document.getElementById('form-cat').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var n = ev.target.elements.nombre.value.trim();
        if (!n) return;
        if (e.categorias.some(function (c) { return c.nombre.toLowerCase() === n.toLowerCase(); })) { UI.aviso('Esa categoría ya existe.', 'error'); return; }
        Promise.resolve(INV.Store.agregarCategoria(n)).then(function () { UI.aviso('Categoría agregada.'); ctx.refrescar(); }).catch(function (er) { UI.aviso(er.message, 'error'); });
      });
      document.getElementById('form-uni').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var n = ev.target.elements.nombre.value.trim(), a = ev.target.elements.abrev.value.trim();
        if (!n || !a) return;
        if (e.unidades.some(function (u) { return u.abrev.toLowerCase() === a.toLowerCase(); })) { UI.aviso('Esa abreviatura ya existe.', 'error'); return; }
        Promise.resolve(INV.Store.agregarUnidad(n, a)).then(function () { UI.aviso('Unidad agregada.'); ctx.refrescar(); }).catch(function (er) { UI.aviso(er.message, 'error'); });
      });
    } };
  }

  /* ============================== PROVEEDORES ============================== */
  function proveedores(ctx) {
    var e = ctx.estado, cuenta = {};
    e.productos.forEach(function (p) { cuenta[p.proveedorId] = (cuenta[p.proveedorId] || 0) + 1; });
    var filas = e.proveedores.map(function (p) {
      return '<tr><td>' + esc(p.nombre) + '</td><td>' + esc(p.contacto) + '</td><td class="num">' + p.tiempoEntrega + ' días</td><td class="num">' + (cuenta[p.id] || 0) + '</td></tr>';
    }).join('');
    var html = cabecera('Proveedores', 'Quién surte cada producto y cuánto tarda en entregar.', '<button class="btn btn-primary" id="nuevo-prov" type="button">Nuevo proveedor</button>') +
      '<section class="panel">' + tabla(['Proveedor', 'Contacto', { t: 'Tiempo de entrega', cls: 'num' }, { t: 'Productos', cls: 'num' }], filas) + '</section>' +
      '<p class="muted nota">Los proveedores del prototipo son ficticios.</p>';
    return { html: html, despues: function () {
      document.getElementById('nuevo-prov').addEventListener('click', function () {
        UI.abrirModal({ titulo: 'Nuevo proveedor', accion: 'Crear proveedor',
          cuerpo: '<div class="campos"><label>Nombre<input name="nombre" required maxlength="60"></label><label>Contacto (correo o teléfono)<input name="contacto" maxlength="60"></label><label>Tiempo de entrega típico (días)<input name="tiempoEntrega" type="number" min="1" max="60" value="5" required></label></div>',
          alGuardar: function (d) {
            var t = parseInt(d.tiempoEntrega, 10);
            if (!d.nombre.trim()) return 'Escribe el nombre del proveedor.';
            if (isNaN(t) || t < 1 || t > 60) return 'El tiempo de entrega debe estar entre 1 y 60 días.';
            return Promise.resolve(INV.Store.agregarProveedor(d.nombre.trim(), d.contacto.trim(), t)).then(function () { UI.aviso('Proveedor creado.'); ctx.refrescar(); });
          } });
      });
    } };
  }

  /* ============================ REGISTRAR MOVIMIENTO ============================ */
  function nuevoMovimiento(ctx) {
    var A = ctx.A, e = ctx.estado, admin = esAdmin(ctx), q = ctx.q;
    var lista = productosActivos(ctx).slice().sort(porNombre);
    var sku0 = q.sku && A.info[q.sku] ? q.sku : lista[0].sku;
    var tipo0 = q.tipo === 'salida' || (q.tipo === 'ajuste' && admin) ? q.tipo : 'entrada';
    var banner = '';
    if (q.ok) {
      var m = e.movimientos.filter(function (x) { return x.id === q.ok; })[0];
      if (m && A.info[m.sku]) {
        var inf = A.info[m.sku];
        var verbo = { entrada: 'Entrada registrada', salida: 'Salida registrada', ajuste: 'Ajuste registrado' }[m.tipo];
        banner = '<div class="banner-ok" role="status"><strong>' + verbo + ':</strong> ' + cantidadMov(m, inf.unidad.abrev) + ' de ' + esc(inf.producto.nombre) + '. Ahora hay ' + num(inf.existencias) + ' ' + esc(inf.unidad.abrev) + '. ' +
          '<a href="#/movimientos/historial?sku=' + encodeURIComponent(m.sku) + '">Ver historial</a></div>';
      }
    }
    var html = cabecera('Registrar movimiento', 'Anota una entrada, una salida' + (admin ? ' o un ajuste' : '') + ' de inventario.') + banner +
      '<div class="dos-col form-col"><form class="panel form-mov" id="form-mov" novalidate>' +
      '<fieldset><legend>Tipo de movimiento</legend><div class="radios">' +
      '<label><input type="radio" name="tipo" value="entrada"' + (tipo0 === 'entrada' ? ' checked' : '') + '> Entrada</label>' +
      '<label><input type="radio" name="tipo" value="salida"' + (tipo0 === 'salida' ? ' checked' : '') + '> Salida</label>' +
      (admin ? '<label><input type="radio" name="tipo" value="ajuste"' + (tipo0 === 'ajuste' ? ' checked' : '') + '> Ajuste</label>' : '') + '</div></fieldset>' +
      '<div class="campos">' +
      '<label class="ancho">Producto<select name="sku" id="m-sku">' + opciones(lista.map(function (p) { return { v: p.sku, t: p.nombre + ' (' + p.sku + ')' }; }), sku0) + '</select></label>' +
      '<label>Cantidad<input name="cantidad" id="m-cant" type="number" min="1" step="1" inputmode="numeric" value="' + esc(q.cantidad || '') + '" required></label>' +
      '<label>Fecha<input name="fecha" type="date" min="' + FE.INICIO + '" max="' + FE.HOY + '" value="' + FE.HOY + '" required></label>' +
      '<label id="l-prov">Proveedor<select name="proveedorId" id="m-prov">' + opciones(e.proveedores.map(function (p) { return { v: p.id, t: p.nombre }; }), '') + '</select></label>' +
      '<label id="l-dir">Sentido del ajuste<select name="sentido"><option value="mas">Aumentar existencias</option><option value="menos">Disminuir existencias</option></select></label>' +
      '<label class="ancho">Motivo o referencia<input name="motivo" id="m-motivo" maxlength="80" placeholder="Ej.: factura de compra N.º 1042"></label></div>' +
      '<p class="error-form" id="m-error" role="alert" hidden></p>' +
      '<div class="form-acciones"><button class="btn btn-primary" type="submit">Guardar movimiento</button><a class="btn btn-quiet" href="#/productos">Cancelar</a></div></form>' +
      '<aside class="panel lateral" aria-labelledby="t-estado"><h2 id="t-estado">Estado del producto</h2><div id="m-panel"></div></aside></div>';

    function actual() { return document.getElementById('m-sku').value; }
    function pintarPanel() {
      var i = A.info[actual()]; if (!i) return;
      var u = i.unidad.abrev;
      document.getElementById('m-panel').innerHTML =
        '<dl class="lista-dl"><div><dt>Existencias</dt><dd>' + num(i.existencias) + ' ' + esc(u) + '</dd></div>' +
        '<div><dt>Nivel mínimo</dt><dd>' + num(i.producto.nivelMinimo) + ' ' + esc(u) + '</dd></div>' +
        '<div><dt>Alcanza para</dt><dd>' + UI.coberturaTexto(i.rep) + '</dd></div>' +
        '<div><dt>Último ingreso</dt><dd>' + (i.ultimaEntrada ? FE.media(i.ultimaEntrada) : '—') + '</dd></div></dl>' +
        '<p>' + UI.badgeInfo(i) + '</p><p class="muted">' + esc(i.mensaje) + '</p>';
    }
    function ajustarCampos() {
      var tipo = document.querySelector('input[name=tipo]:checked').value;
      document.getElementById('l-prov').hidden = tipo !== 'entrada';
      document.getElementById('l-dir').hidden = tipo !== 'ajuste';
      var i = A.info[actual()];
      if (tipo === 'entrada' && i && i.producto.proveedorId) document.getElementById('m-prov').value = i.producto.proveedorId;
      document.getElementById('m-motivo').placeholder = tipo === 'entrada' ? 'Ej.: factura de compra N.º 1042' : tipo === 'salida' ? 'Ej.: venta del día' : 'Obligatorio. Ej.: producto vencido';
    }
    return { html: html, despues: function () {
      pintarPanel(); ajustarCampos();
      document.getElementById('m-sku').addEventListener('change', function () { pintarPanel(); ajustarCampos(); });
      Array.prototype.forEach.call(document.querySelectorAll('input[name=tipo]'), function (r) { r.addEventListener('change', ajustarCampos); });
      document.getElementById('form-mov').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var f = ev.target.elements, tipo = f.tipo.value, sku = f.sku.value, cant = Number(f.cantidad.value), fecha = f.fecha.value, motivo = f.motivo.value.trim();
        var i = A.info[sku], u = i.unidad.abrev, err = '';
        if (!Number.isInteger(cant) || cant <= 0) err = 'La cantidad debe ser un número entero mayor que cero.';
        else if (!FE.esFechaValida(fecha) || fecha > FE.HOY || fecha < FE.INICIO) err = 'La fecha debe estar entre ' + FE.media(FE.INICIO) + ' y ' + FE.media(FE.HOY) + '.';
        else if (tipo === 'salida' && cant > i.existencias) err = 'Solo hay ' + num(i.existencias) + ' ' + u + ' en existencias. Reduce la cantidad o registra un ajuste.';
        else if (tipo === 'ajuste' && !motivo) err = 'Escribe el motivo del ajuste para dejar rastro.';
        else if (tipo === 'ajuste' && f.sentido.value === 'menos' && cant > i.existencias) err = 'No puedes disminuir más de las existencias actuales (' + num(i.existencias) + ' ' + u + ').';
        var caja = document.getElementById('m-error');
        if (err) { caja.textContent = err; caja.hidden = false; return; }
        caja.hidden = true;
        var cantidad = tipo === 'ajuste' && f.sentido.value === 'menos' ? -cant : cant;
        var boton = ev.target.querySelector('button[type=submit]');
        boton.disabled = true;
        Promise.resolve(INV.Store.agregarMovimiento({ sku: sku, tipo: tipo, cantidad: cantidad, fecha: fecha, usuario: admin ? 'Administrador' : 'Operativo',
          motivo: motivo || (tipo === 'entrada' ? 'Entrada de mercancía' : 'Salida de inventario'), proveedorId: tipo === 'entrada' ? f.proveedorId.value : null }))
          .then(function (id) { ctx.ir('/movimientos/nuevo?sku=' + encodeURIComponent(sku) + '&tipo=' + tipo + '&ok=' + id); })
          .catch(function (er) { boton.disabled = false; caja.textContent = er.message; caja.hidden = false; });
      });
    } };
  }

  /* ================================ HISTORIAL ================================ */
  function historial(ctx) {
    var A = ctx.A, e = ctx.estado, q = ctx.q;
    var desde0 = q.desde || FE.addDias(FE.HOY, -29), hasta0 = q.hasta || FE.HOY;
    var lista = e.productos.slice().sort(porNombre);
    var html = cabecera('Historial de movimientos', 'Todo lo que entró, salió o se ajustó en el inventario.') +
      '<div class="filtros"><label>Producto<select id="h-sku">' + opciones(lista.map(function (p) { return { v: p.sku, t: p.nombre }; }), q.sku || '', 'Todos') + '</select></label>' +
      '<label>Tipo<select id="h-tipo">' + opciones([{ v: 'entrada', t: 'Entradas' }, { v: 'salida', t: 'Salidas' }, { v: 'ajuste', t: 'Ajustes' }], q.tipo || '', 'Todos') + '</select></label>' +
      '<label>Desde<input type="date" id="h-desde" min="' + FE.INICIO + '" max="' + FE.HOY + '" value="' + desde0 + '"></label>' +
      '<label>Hasta<input type="date" id="h-hasta" min="' + FE.INICIO + '" max="' + FE.HOY + '" value="' + hasta0 + '"></label></div>' +
      '<p class="muted" id="h-cuenta" aria-live="polite"></p><div id="h-tabla"></div><nav class="paginas" id="h-pag" aria-label="Páginas del historial"></nav>';
    var pagina = 0, POR = 20;
    function pintar() {
      var sku = document.getElementById('h-sku').value, tipo = document.getElementById('h-tipo').value;
      var d = document.getElementById('h-desde').value || FE.INICIO, h = document.getElementById('h-hasta').value || FE.HOY;
      var filtrados = e.movimientos.filter(function (m) { return (!sku || m.sku === sku) && (!tipo || m.tipo === tipo) && m.fecha >= d && m.fecha <= h; });
      filtrados.sort(function (a, b) { return a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : (a.id < b.id ? 1 : -1); });
      var total = filtrados.length, paginas = Math.max(1, Math.ceil(total / POR));
      if (pagina >= paginas) pagina = paginas - 1;
      var ini = pagina * POR, trozo = filtrados.slice(ini, ini + POR);
      document.getElementById('h-cuenta').textContent = total ? 'Mostrando ' + (ini + 1) + '–' + (ini + trozo.length) + ' de ' + num(total) + ' movimientos' : '0 movimientos';
      var filas = trozo.map(function (m) {
        var i = A.info[m.sku], u = i ? i.unidad.abrev : 'und';
        return '<tr><td>' + FE.media(m.fecha) + '</td><td>' + (i ? enlaceProducto(i) : esc(m.sku)) + '</td><td>' + tipoMov(m) + '</td><td class="num">' + cantidadMov(m, u) + '</td><td>' + esc(m.usuario) + '</td><td>' + esc(m.motivo) + '</td></tr>';
      }).join('');
      document.getElementById('h-tabla').innerHTML = total ? tabla(['Fecha', 'Producto', 'Tipo', { t: 'Cantidad', cls: 'num' }, 'Usuario', 'Motivo'], filas) : vacio('No hay movimientos con estos filtros. Prueba con otro rango de fechas.');
      document.getElementById('h-pag').innerHTML = paginas > 1
        ? '<button class="btn btn-quiet" type="button" data-p="-1"' + (pagina === 0 ? ' disabled' : '') + '>Anterior</button><span>Página ' + (pagina + 1) + ' de ' + paginas + '</span><button class="btn btn-quiet" type="button" data-p="1"' + (pagina >= paginas - 1 ? ' disabled' : '') + '>Siguiente</button>' : '';
    }
    return { html: html, despues: function () {
      pintar();
      ['h-sku', 'h-tipo', 'h-desde', 'h-hasta'].forEach(function (id) { document.getElementById(id).addEventListener('input', function () { pagina = 0; pintar(); }); });
      document.getElementById('h-pag').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-p]'); if (!b) return;
        pagina += parseInt(b.getAttribute('data-p'), 10); pintar();
      });
    } };
  }

  /* ============================ IMPORTAR VENTAS ============================ */
  function parsearLinea(l, delim) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < l.length; i++) {
      var c = l[i];
      if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === delim && !q) { out.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  }
  function normalizarFecha(t) {
    t = (t || '').trim();
    var m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) t = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return FE.esFechaValida(t) ? t : null;
  }
  function validarCSV(texto, ctx) {
    texto = texto.replace(/^\uFEFF/, '');
    var lineas = texto.split(/\r\n|\n|\r/).filter(function (l) { return l.trim() !== ''; });
    if (!lineas.length) return { fatal: 'El archivo está vacío.' };
    var delim = lineas[0].split(';').length > lineas[0].split(',').length ? ';' : ',';
    var enc = parsearLinea(lineas[0], delim).map(function (c) { return c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); });
    var iSku = enc.findIndex(function (c) { return c === 'sku' || c === 'codigo' || c === 'producto'; });
    var iFecha = enc.indexOf('fecha'), iCant = enc.findIndex(function (c) { return c === 'cantidad' || c === 'unidades'; });
    if (iSku < 0 || iFecha < 0 || iCant < 0) return { fatal: 'Faltan columnas. El archivo debe tener los encabezados: sku, fecha y cantidad.' };
    var existentes = {}; ctx.estado.productos.forEach(function (p) { existentes[p.sku.toUpperCase()] = true; });
    var vistos = {}, validas = [], errores = [];
    for (var n = 1; n < lineas.length; n++) {
      var c = parsearLinea(lineas[n], delim), fila = n + 1;
      var sku = (c[iSku] || '').toUpperCase(), fecha = normalizarFecha(c[iFecha]), cantTxt = (c[iCant] || '').trim(), cant = Number(cantTxt);
      var msg = null;
      if (!sku) msg = 'Falta el código del producto.';
      else if (!existentes[sku]) msg = 'El producto «' + sku + '» no existe en el catálogo.';
      else if (!fecha) msg = 'La fecha «' + (c[iFecha] || '') + '» no es válida. Usa AAAA-MM-DD o DD/MM/AAAA.';
      else if (fecha > FE.HOY) msg = 'La fecha ' + FE.media(fecha) + ' es posterior a hoy.';
      else if (fecha < FE.INICIO) msg = 'La fecha ' + FE.media(fecha) + ' es anterior al periodo disponible (' + FE.media(FE.INICIO) + ').';
      else if (cantTxt === '' || isNaN(cant) || !Number.isInteger(cant) || cant < 0) msg = 'La cantidad «' + cantTxt + '» debe ser un número entero mayor o igual a cero.';
      else if (vistos[sku + '|' + fecha]) msg = 'Ya hay otra fila para ' + sku + ' el ' + FE.media(fecha) + ' (duplicado en el archivo).';
      if (msg) errores.push({ fila: fila, texto: lineas[n], msg: msg });
      else { vistos[sku + '|' + fecha] = true; validas.push({ sku: sku, fecha: fecha, cantidad: cant }); }
    }
    return { total: lineas.length - 1, validas: validas, errores: errores };
  }
  function csvEjemplo() {
    var d = function (n) { return FE.addDias(FE.HOY, -n); };
    var f = ['sku,fecha,cantidad'];
    [['ARR-500', [12, 14, 13, 18, 20, 11, 12]], ['LEC-1L', [34, 31, 30, 41, 47, 33, 35]], ['CAF-250', [7, 8, 9, 8, 10, 7, 8]]].forEach(function (p) {
      p[1].forEach(function (q, k) { f.push(p[0] + ',' + d(6 - k) + ',' + q); });
    });
    f.push('XXX-999,' + d(1) + ',5');
    f.push('ARR-500,31/02/2026,4');
    f.push('LEC-1L,' + d(2) + ',-3');
    f.push('CAF-250,' + d(1) + ',9');
    f.push('ARR-500,' + FE.addDias(FE.HOY, 12) + ',6');
    return f.join('\n');
  }
  function importar(ctx) {
    var html = cabecera('Importar ventas históricas', 'Carga un archivo con las ventas por producto y día. El sistema revisa cada fila antes de guardar nada.') +
      '<div class="dos-col form-col"><section class="panel"><h2>1. Elige el archivo</h2>' +
      '<p>El archivo debe tener tres columnas: <code>sku</code>, <code>fecha</code> (AAAA-MM-DD o DD/MM/AAAA) y <code>cantidad</code>. Las fechas válidas van del ' + FE.media(FE.INICIO) + ' al ' + FE.media(FE.HOY) + '. Si ya había una venta para ese producto y día, se reemplaza.</p>' +
      '<div class="form-acciones"><label class="btn btn-primary btn-archivo">Elegir archivo CSV<input type="file" id="i-archivo" accept=".csv,text/csv,.txt" hidden></label>' +
      '<button class="btn" type="button" id="i-ejemplo">Probar con un archivo de ejemplo</button></div>' +
      '<p class="muted"><a href="#" id="i-descargar">Descargar el archivo de ejemplo</a> para ver el formato. En la versión 1.0 también se aceptarán archivos de Excel (.xlsx).</p></section>' +
      '<aside class="panel lateral"><h2>Qué se revisa</h2><ul class="lista"><li>Que existan las tres columnas.</li><li>Que el producto exista en el catálogo.</li><li>Que la fecha sea válida y no sea futura.</li><li>Que la cantidad sea un entero igual o mayor a cero.</li><li>Que no haya dos filas para el mismo producto y día.</li></ul></aside></div>' +
      '<section id="i-resultado" aria-live="polite"></section>';
    var pendientes = null, textoActual = '';
    function mostrar(texto, nombre) {
      textoActual = texto;
      var r = validarCSV(texto, ctx), cont = document.getElementById('i-resultado');
      if (r.fatal) { cont.innerHTML = '<section class="panel"><h2>2. Resultado de la revisión</h2><p class="error-form">' + esc(r.fatal) + '</p></section>'; pendientes = null; return; }
      pendientes = r.validas;
      var filas = r.errores.slice(0, 30).map(function (er) { return '<tr><td class="num">' + er.fila + '</td><td><code>' + esc(er.texto) + '</code></td><td>' + esc(er.msg) + '</td></tr>'; }).join('');
      cont.innerHTML = '<section class="panel"><h2>2. Resultado de la revisión</h2><p class="muted">' + esc(nombre) + '</p>' +
        '<dl class="cifras compacto"><div><dt>Filas leídas</dt><dd>' + r.total + '</dd></div><div><dt>Filas válidas</dt><dd class="texto-verde">' + r.validas.length + '</dd></div><div><dt>Filas con error</dt><dd class="' + (r.errores.length ? 'texto-rojo' : '') + '">' + r.errores.length + '</dd></div></dl>' +
        (r.errores.length ? '<h3>Filas con error</h3>' + tabla([{ t: 'Fila', cls: 'num' }, 'Contenido', 'Qué pasó'], filas) + (r.errores.length > 30 ? '<p class="muted">Se muestran las primeras 30.</p>' : '') : '<p>No se encontraron errores.</p>') +
        '<div class="form-acciones"><button class="btn btn-primary" type="button" id="i-confirmar"' + (r.validas.length ? '' : ' disabled') + '>Importar ' + r.validas.length + ' ' + plural(r.validas.length, 'fila válida', 'filas válidas') + '</button></div>' +
        (r.errores.length ? '<p class="muted">Las filas con error no se importan. Corrígelas en el archivo y vuelve a cargarlo.</p>' : '') + '</section>';
      var b = document.getElementById('i-confirmar');
      if (b) b.addEventListener('click', function () {
        b.disabled = true;
        var skus = {}; pendientes.forEach(function (x) { skus[x.sku] = 1; });
        var n = pendientes.length;
        var hecho = INV.Store.confirmarImportacion ? INV.Store.confirmarImportacion(nombre, textoActual) : INV.Store.importarVentas(pendientes);
        Promise.resolve(hecho).then(function () {
          UI.aviso('Se importaron ' + n + ' filas de ' + Object.keys(skus).length + ' productos. Los pronósticos se recalcularon.');
          document.getElementById('i-resultado').innerHTML = '<section class="banner-ok" role="status"><strong>Importación lista.</strong> Ya puedes ver el efecto en <a href="#/analisis/pronostico">Pronóstico</a> y en <a href="#/analisis/abc">ABC y rotación</a>.</section>';
          pendientes = null;
        }).catch(function (er) { b.disabled = false; UI.aviso(er.message, 'error'); });
      });
    }
    return { html: html, despues: function () {
      document.getElementById('i-archivo').addEventListener('change', function (ev) {
        var f = ev.target.files[0]; if (!f) return;
        if (/\.xlsx?$/i.test(f.name)) { document.getElementById('i-resultado').innerHTML = '<section class="panel"><p class="error-form">En el prototipo solo se leen archivos CSV. Guarda tu hoja de Excel como CSV y vuelve a cargarla.</p></section>'; return; }
        var rd = new FileReader();
        rd.onload = function () { mostrar(String(rd.result), f.name); };
        rd.readAsText(f);
      });
      document.getElementById('i-ejemplo').addEventListener('click', function () { mostrar(csvEjemplo(), 'archivo-de-ejemplo.csv (incluye 5 filas con errores a propósito)'); });
      document.getElementById('i-descargar').addEventListener('click', function (ev) {
        ev.preventDefault();
        var blob = new Blob([csvEjemplo()], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'ventas-ejemplo.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
      });
    } };
  }

  /* ============================== ABC Y ROTACIÓN ============================== */
  function abc(ctx) {
    var A = ctx.A, clase = ctx.q.clase || '';
    var filas = A.abc.filter(function (i) { return !clase || i.abc === clase; }).map(function (i) {
      return '<tr><td>' + enlaceProducto(i) + '<small class="sku">' + esc(i.sku) + '</small></td><td class="centro"><span class="abc-pill abc-' + i.abc.toLowerCase() + '">' + i.abc + '</span></td>' +
        '<td class="num">' + UI.pct(i.pctValor, 1) + '</td><td class="num">' + UI.pct(i.pctAcum, 0) + '</td><td class="num">' + num(i.ventas30) + ' ' + esc(i.unidad.abrev) + '</td>' +
        '<td class="num">' + num(i.rotacion, 1) + '</td><td><span class="rot rot-' + i.claseRot + '">' + { alta: 'Alta', media: 'Media', baja: 'Baja' }[i.claseRot] + '</span></td></tr>';
    }).join('');
    var chips = [['', 'Todas'], ['A', 'Clase A'], ['B', 'Clase B'], ['C', 'Clase C']].map(function (c) {
      return '<a class="chip' + (clase === c[0] ? ' activo' : '') + '" href="#/analisis/abc' + (c[0] ? '?clase=' + c[0] : '') + '"' + (clase === c[0] ? ' aria-current="true"' : '') + '>' + c[1] + '</a>';
    }).join('');
    var html = cabecera('ABC y rotación', 'Qué productos concentran las ventas y cuáles se mueven más despacio.') +
      '<section class="panel"><h2>Participación en el valor vendido (últimos 90 días)</h2>' + UI.barraABC(A.abc) + '</section>' +
      '<div class="chips" role="navigation" aria-label="Filtrar por clase">' + chips + '</div>' +
      '<section class="panel">' + tabla(['Producto', { t: 'Clase', cls: 'centro' }, { t: '% del valor', cls: 'num' }, { t: '% acumulado', cls: 'num' }, { t: 'Ventas 30 días', cls: 'num' }, { t: 'Rotación (veces/mes)', cls: 'num' }, 'Nivel de rotación'], filas) + '</section>' +
      '<details class="panel detalle"><summary>Cómo se calcula</summary><ul class="lista">' +
      '<li><strong>Clase ABC:</strong> se multiplica lo vendido en 90 días por el costo de cada producto y se ordena de mayor a menor. Los que suman hasta el 80 % del valor son A, hasta el 95 % son B y el resto es C.</li>' +
      '<li><strong>Rotación:</strong> unidades vendidas en 30 días dividido entre las existencias promedio del mismo periodo. Alta: 3 veces al mes o más; media: entre 1,5 y 3; baja: menos de 1,5.</li>' +
      '<li>Los umbrales son una propuesta inicial y se podrán configurar en la versión 1.0.</li></ul></details>';
    return { html: html };
  }

  /* ================================ PRONÓSTICO ================================ */
  function pronostico(ctx) {
    var A = ctx.A, admin = esAdmin(ctx);
    var lista = A.todos.filter(function (i) { return i.producto.activo !== false; }).sort(function (a, b) { return porNombre(a.producto, b.producto); });
    var sku = ctx.args.sku && A.info[ctx.args.sku] ? ctx.args.sku : A.lista[0].sku;
    var i = A.info[sku], u = i.unidad.abrev, r = i.rep, p = i.producto;
    var selector = '<label class="selector-prod">Producto<select id="p-sku">' + opciones(lista.map(function (x) { return { v: x.sku, t: x.producto.nombre + ' — ' + UI.ESTADOS[x.estado].txt }; }), sku) + '</select></label>';
    var cuerpo = '';
    if (!i.analisis.suficiente) {
      cuerpo = '<section class="panel"><h2>Todavía no hay pronóstico</h2><p>' + esc(i.analisis.motivo) + '</p><p>Mientras tanto, el sistema usa una regla simple: pedir cuando las existencias bajan del nivel mínimo (' + num(p.nivelMinimo) + ' ' + esc(u) + ').</p>' +
        '<p><a class="btn" href="#/importar">Importar ventas históricas</a></p></section>' + tarjetaRecomendacion(i, admin);
    } else {
      var a = i.analisis, p7 = a.pred.slice(0, 7).reduce(function (s, v) { return s + v; }, 0), p28 = a.pred.reduce(function (s, v) { return s + v; }, 0);
      var mejor = a.tecnicas.filter(function (t) { return t.elegida; })[0];
      var filas = a.tecnicas.map(function (t) {
        var m = t.metricas;
        return '<tr class="' + (t.elegida ? 'elegida' : '') + '"><td>' + esc(t.nombre) + (t.base ? ' <span class="chip-mini">referencia</span>' : '') + (t.elegida ? ' <span class="chip-mini ok">elegida</span>' : '') + '</td><td class="num">' + num(m.mae, 2) + '</td><td class="num">' + num(m.rmse, 2) + '</td>' +
          '<td class="num">' + (m.wape == null ? '—' : UI.pct(m.wape, 0)) + '</td><td class="num">' + (m.mase == null ? '—' : num(m.mase, 2)) + '</td></tr>';
      }).join('');
      var avisos = '';
      if (!a.superaIngenuo) avisos += '<div class="banner-aviso" role="status"><strong>Ninguna técnica supera al pronóstico ingenuo con estos datos.</strong> Se usa la de menor error, pero no aporta más que repetir lo vendido la semana anterior: conviene tomar la recomendación con cautela.</div>';
      if (a.diasCensurados > 0) avisos += '<div class="banner-aviso" role="status"><strong>' + a.diasCensurados + ' de los últimos 90 días el producto terminó agotado.</strong> Lo vendido esos días no mide la demanda real: se reemplazó por el promedio del mismo día de la semana para entrenar y no se usó para medir el error.</div>';
      cuerpo = avisos + '<dl class="cifras"><div><dt>Se venderían en 7 días</dt><dd>' + num(p7) + ' <small>' + esc(u) + '</small></dd></div><div><dt>Se venderían en 28 días</dt><dd>' + num(p28) + ' <small>' + esc(u) + '</small></dd></div>' +
        '<div><dt>Error típico por día</dt><dd>±' + num(mejor.metricas.mae, 1) + ' <small>' + esc(u) + '</small></dd></div><div><dt>Tipo de demanda</dt><dd class="dd-chico">' + esc(a.patron.tipo) + '</dd></div></dl>' +
        '<div class="dos-col pron-col"><section class="panel" aria-labelledby="t-graf"><div class="panel-cab"><h2 id="t-graf">Ventas y pronóstico</h2></div>' +
        '<p class="muted">Línea azul: ventas diarias reales. Línea punteada: pronóstico. Franja: rango probable (80 %).</p>' + UI.graficoPronostico(i) + '</section>' + tarjetaRecomendacion(i, admin) + '</div>' +
        '<section class="panel" aria-labelledby="t-comp"><div class="panel-cab"><h2 id="t-comp">Comparación de técnicas</h2></div>' +
        '<p class="muted">Evaluación temporal: cada técnica se entrena solo con lo anterior a la fecha de corte y se prueba con los ' + a.horizonteEval + ' días siguientes, repitiendo en las últimas ' + a.ventanas + ' semanas. Los días agotados no cuentan. Menor error es mejor; un MASE menor que 1 significa que supera a repetir lo ocurrido la semana anterior.</p>' +
        tabla(['Técnica', { t: 'MAE', cls: 'num' }, { t: 'RMSE', cls: 'num' }, { t: 'WAPE', cls: 'num' }, { t: 'MASE', cls: 'num' }], filas, 'tabla-tec') + '</section>' +
        '<details class="panel detalle"><summary>Cómo se decidió y qué límites tiene</summary><ul class="lista">' +
        '<li><strong>Tipo de demanda:</strong> intervalo medio entre ventas (ADI) = ' + num(a.patron.adi, 2) + ' días y variación del tamaño de las ventas (CV²) = ' + num(a.patron.cv2, 2) + ' → <em>' + esc(a.patron.tipo) + '</em>. Con ADI ≥ 1,32 se agrega Croston/SBA a la competencia (Syntetos, Boylan y Croston, 2005).</li>' +
        '<li><strong>Frecuencia y horizonte:</strong> series diarias; se pronostican 28 días, que cubren el tiempo de entrega más la cobertura objetivo. Se evalúa el error a 7 días porque es la escala del tiempo de entrega.</li>' +
        '<li>El pronóstico usa ' + a.diasConDatos + ' días de ventas (' + a.diasConVenta + ' con ventas en los últimos 90). No considera promociones, cambios de precio ni festivos.</li>' +
        '<li>El rango probable muestra la incertidumbre: la demanda real puede salirse de la franja una de cada cinco veces.</li>' +
        '<li><strong>Stock de seguridad</strong> = z × σ × √L, con z según el nivel de servicio (' + UI.pct(p.nivelServicio, 1) + ' → z = ' + num(r.z, 2) + '), σ el error típico diario y L los días de entrega.</li>' +
        '<li><strong>Posición de inventario</strong> = existencias + pedidos pendientes. <strong>Punto de reorden</strong> = demanda esperada durante la entrega + stock de seguridad. <strong>Cantidad sugerida</strong> = demanda esperada durante (entrega + cobertura objetivo) + stock de seguridad − posición, ajustada al pedido mínimo y al múltiplo del proveedor.</li>' +
        '<li>En este prototipo las técnicas son versiones simplificadas escritas en JavaScript. En el Avance 5 se calcularán en el servidor con Python (statsmodels, Prophet) y se compararán contra una regla simple de reposición.</li></ul></details>';
    }
    return { html: cabecera('Pronóstico por producto', 'Cuánto se venderá y cuánto conviene pedir.', selector) + cuerpo, despues: function () {
      document.getElementById('p-sku').addEventListener('change', function (ev) { ctx.ir('/analisis/pronostico/' + encodeURIComponent(ev.target.value)); });
      conectarPedidos(ctx, document.getElementById('contenido'));
    } };
  }

  function tarjetaRecomendacion(i, admin) {
    var r = i.rep, u = i.unidad.abrev, p = i.producto, prov = i.proveedor, pend = i.pendientes || [];
    var titulo, clase, razones = '', pedible = false;
    if (r.regla === 'simple') {
      clase = r.q > 0 ? 'rec-pedir' : 'rec-ok'; pedible = r.q > 0;
      titulo = r.q > 0 ? 'Pedir ' + num(r.q) + ' ' + u + ' hoy' : 'No hace falta pedir por ahora';
      razones = '<li>Hay pocas ventas para pronosticar, por eso se usa una regla simple.</li><li>Entre existencias y pedidos en camino hay ' + num(r.posicion) + ' ' + esc(u) + ' y el nivel mínimo es ' + num(p.nivelMinimo) + ' ' + esc(u) + '.</li>' +
        (r.q > 0 ? '<li>Se sugiere reponer hasta cerca del doble del nivel mínimo.</li>' : '');
    } else if (i.estado === 'sobreinventario') {
      clase = 'rec-sobre'; titulo = 'No comprar más por ahora';
      razones = '<li>Hay ' + num(i.existencias) + ' ' + esc(u) + ', suficientes para unos ' + num(r.cobertura) + ' días.</li><li>Se venden unas ' + num(r.mediaDia, 1) + ' ' + esc(u) + ' por día.</li><li>Lo recomendable es tener entre ' + p.tiempoEntrega + ' y ' + (p.tiempoEntrega + p.cobertura) + ' días de ventas.</li>';
    } else if (r.q > 0 && (r.diasParaPedir != null && r.diasParaPedir <= 7)) {
      clase = 'rec-pedir'; pedible = true; titulo = 'Pedir ' + num(r.q) + ' ' + u + ' ' + E.cuando(r.diasParaPedir);
    } else if (i.estado === 'agotamiento' && pend.length) {
      // ya hay un pedido, pero llega después de que se acaben las existencias
      clase = 'rec-pedir';
      titulo = 'Se agotaría antes de que llegue el pedido en camino';
    } else {
      clase = 'rec-ok'; titulo = 'No hace falta pedir por ahora';
    }
    if (r.regla === 'pronostico' && i.estado !== 'sobreinventario') {
      razones = '<li>Se venden unas ' + num(r.mediaDia, 1) + ' ' + esc(u) + ' por día (según el pronóstico).</li>' +
        '<li>Hoy hay ' + num(i.existencias) + ' ' + esc(u) + ', que alcanzan para ' + UI.coberturaTexto(r) + '.</li>' +
        (pend.length ? '<li>Ya hay ' + num(r.enCamino) + ' ' + esc(u) + ' pedidas que llegan ' + E.cuando(pend.slice().sort(function (a, b) { return a.dias - b.dias; })[0].dias) + '; se descuentan de lo que falta.</li>' : '') +
        '<li>' + (prov ? esc(prov.nombre) : 'El proveedor') + ' tarda ' + p.tiempoEntrega + ' días en entregar.</li>' +
        '<li>Se deja un colchón de seguridad de ' + num(r.ss) + ' ' + esc(u) + ' (nivel de servicio ' + UI.pct(p.nivelServicio, 1) + ').</li>' +
        '<li>La cantidad cubre ' + p.cobertura + ' días de ventas después de que llegue el pedido.</li>' +
        (pedible && r.q > 0 && r.q !== r.qBruta ? '<li>Se calculó ' + num(r.qBruta) + ' ' + esc(u) + ', pero el proveedor vende con mínimo de ' + num(p.minimoPedido || 1) + ' y en múltiplos de ' + num(p.multiploPedido || 1) + ': se ajusta a ' + num(r.q) + '.</li>' : '') +
        (!pedible && i.estado !== 'agotamiento' ? '<li>El punto de reorden (' + num(r.pr) + ' ' + esc(u) + ') se alcanzaría ' + (r.diasParaPedir == null ? 'después de 35 días' : E.cuando(r.diasParaPedir)) + '.</li>' : '') +
        (!pedible && i.estado === 'agotamiento' && pend.length ? '<li>Con las ventas esperadas se agotaría ' + E.cuando(r.diasParaAgotar == null ? 0 : r.diasParaAgotar) + ', antes de que llegue el pedido. Conviene pedirle al proveedor que adelante la entrega o conseguir unidades de urgencia.</li>' : '');
    }
    var cta = '';
    if (pedible && admin && i.estado !== 'sobreinventario') {
      cta = '<button class="btn btn-primary" type="button" data-pedir="' + esc(i.sku) + '" data-cant="' + r.q + '">Registrar pedido de ' + num(r.q) + ' ' + esc(u) + ' al proveedor</button>';
    }
    return '<section class="panel recomendacion ' + clase + '" aria-labelledby="t-rec"><p class="rec-etiqueta" id="t-rec">Recomendación</p><p class="rec-titulo">' + titulo + '</p>' +
      (pedible && r.q > 0 && i.estado !== 'sobreinventario' ? '<p class="muted">Costo estimado: ' + UI.dinero(r.q * p.costo) + '</p>' : '') +
      '<h3>¿Por qué?</h3><ul class="lista">' + razones + '</ul>' + cta + '</section>';
  }

  // registra un pedido al proveedor a partir de una recomendación (botones data-pedir)
  function conectarPedidos(ctx, raiz) {
    Array.prototype.forEach.call(raiz.querySelectorAll('[data-pedir]'), function (b) {
      b.addEventListener('click', function () {
        var sku = b.getAttribute('data-pedir'), cant = parseInt(b.getAttribute('data-cant'), 10), i = ctx.A.info[sku], p = i.producto;
        b.disabled = true;
        Promise.resolve(INV.Store.agregarPedido({ sku: sku, cantidad: cant, proveedorId: p.proveedorId, fechaPedido: FE.HOY, fechaEsperada: FE.addDias(FE.HOY, p.tiempoEntrega) }))
          .then(function () { UI.aviso('Pedido registrado: ' + num(cant) + ' ' + i.unidad.abrev + ' de ' + p.nombre + '. Llegan ' + E.cuando(p.tiempoEntrega) + '.'); ctx.refrescar(); })
          .catch(function (er) { b.disabled = false; UI.aviso(er.message, 'error'); });
      });
    });
  }

  /* ================================== ALERTAS ================================== */
  function alertas(ctx) {
    var A = ctx.A, f = ctx.q.tipo || '';
    var todas = A.lista.filter(function (i) { return i.estado === 'agotamiento' || i.estado === 'sobreinventario'; });
    var vistas = todas.filter(function (i) { return !f || i.estado === f; });
    var vigilar = A.lista.filter(function (i) { return i.estado === 'vigilar'; });
    var cuenta = function (e) { return todas.filter(function (i) { return i.estado === e; }).length; };
    var chips = [['', 'Todas (' + todas.length + ')'], ['agotamiento', 'Agotamiento (' + cuenta('agotamiento') + ')'], ['sobreinventario', 'Sobreinventario (' + cuenta('sobreinventario') + ')']].map(function (c) {
      return '<a class="chip' + (f === c[0] ? ' activo' : '') + '" href="#/analisis/alertas' + (c[0] ? '?tipo=' + c[0] : '') + '"' + (f === c[0] ? ' aria-current="true"' : '') + '>' + c[1] + '</a>';
    }).join('');
    function item(i) {
      return '<li class="alerta ' + UI.ESTADOS[i.estado].cls + '"><div class="alerta-cab"><h3>' + enlaceProducto(i) + '</h3>' + UI.badge(i.estado) + '</div>' +
        '<p>' + esc(i.mensaje) + '</p><p class="alerta-acciones"><strong>' + esc(UI.accionSugerida(i)) + '</strong> · <a href="#/analisis/pronostico/' + encodeURIComponent(i.sku) + '">Ver por qué</a></p></li>';
    }
    var html = cabecera('Alertas', 'Avisos anticipados de productos que se agotarían o que tienen más inventario del necesario.') +
      '<div class="chips" role="navigation" aria-label="Filtrar alertas">' + chips + '</div>' +
      (vistas.length ? '<ul class="alertas">' + vistas.map(item).join('') + '</ul>' : vacio('No hay alertas de este tipo. Todo en orden.')) +
      (!f && vigilar.length ? '<section class="panel"><div class="panel-cab"><h2>Para vigilar</h2></div><p class="muted">Todavía no son alertas, pero conviene preparar el pedido.</p><ul class="alertas">' + vigilar.map(item).join('') + '</ul></section>' : '');
    return { html: html };
  }

  /* ============================== RECOMENDACIONES ============================== */
  function recomendaciones(ctx) {
    var A = ctx.A;
    var candidatos = A.lista.filter(function (i) { return i.estado !== 'sobreinventario' && i.rep.q > 0 && i.rep.diasParaPedir != null && i.rep.diasParaPedir <= 7; });
    var ya = candidatos.filter(function (i) { return i.rep.diasParaPedir === 0; }), semana = candidatos.filter(function (i) { return i.rep.diasParaPedir > 0; });
    function filas(l) {
      return l.map(function (i) {
        return '<tr><td>' + enlaceProducto(i) + '<small class="sku">' + esc(i.sku) + '</small></td><td class="num"><strong>' + num(i.rep.q) + ' ' + esc(i.unidad.abrev) + '</strong></td><td>' + E.cuando(i.rep.diasParaPedir) + '</td>' +
          '<td>' + (i.proveedor ? esc(i.proveedor.nombre) : '—') + '</td><td class="num">' + UI.dinero(i.rep.q * i.producto.costo) + '</td>' +
          '<td><a href="#/analisis/pronostico/' + encodeURIComponent(i.sku) + '">Por qué</a> · <button class="btn btn-quiet btn-chico" type="button" data-pedir="' + esc(i.sku) + '" data-cant="' + i.rep.q + '">Registrar pedido</button></td></tr>';
      }).join('');
    }
    var cab = ['Producto', { t: 'Cantidad', cls: 'num' }, 'Cuándo', 'Proveedor', { t: 'Costo estimado', cls: 'num' }, 'Acciones'];
    var porProv = {};
    candidatos.forEach(function (i) {
      var k = i.proveedor ? i.proveedor.nombre : 'Sin proveedor';
      porProv[k] = porProv[k] || { n: 0, total: 0, dias: i.proveedor ? i.proveedor.tiempoEntrega : 0 };
      porProv[k].n++; porProv[k].total += i.rep.q * i.producto.costo;
    });
    var resumen = Object.keys(porProv).sort().map(function (k) {
      return '<tr><td>' + esc(k) + '</td><td class="num">' + porProv[k].n + '</td><td class="num">' + UI.dinero(porProv[k].total) + '</td></tr>';
    }).join('');
    var total = Object.keys(porProv).reduce(function (s, k) { return s + porProv[k].total; }, 0);
    var html = cabecera('Recomendaciones de reposición', 'Qué pedir, cuánto y cuándo, con base en las ventas esperadas y el tiempo de entrega de cada proveedor.') +
      '<section class="panel"><div class="panel-cab"><h2>Pedir hoy</h2></div>' + (ya.length ? tabla(cab, filas(ya)) : vacio('No hay pedidos urgentes hoy.')) + '</section>' +
      '<section class="panel"><div class="panel-cab"><h2>Pedir en los próximos 7 días</h2></div>' + (semana.length ? tabla(cab, filas(semana)) : vacio('No hay pedidos previstos para esta semana.')) + '</section>' +
      '<section class="panel"><div class="panel-cab"><h2>Resumen por proveedor</h2></div>' + (resumen ? tabla(['Proveedor', { t: 'Productos', cls: 'num' }, { t: 'Costo estimado', cls: 'num' }], resumen + '<tr class="total"><td>Total</td><td class="num">' + candidatos.length + '</td><td class="num">' + UI.dinero(total) + '</td></tr>') : vacio('Sin pedidos sugeridos.')) + '</section>';
    return { html: html, despues: function () { conectarPedidos(ctx, document.getElementById('contenido')); } };
  }

  /* ============================= PEDIDOS A PROVEEDORES ============================= */
  function pedidos(ctx) {
    var A = ctx.A, e = ctx.estado, admin = esAdmin(ctx);
    var provPorId = {}; e.proveedores.forEach(function (p) { provPorId[String(p.id)] = p; });
    function fila(p, acciones) {
      var i = A.info[p.sku], u = i ? i.unidad.abrev : 'und', prov = provPorId[String(p.proveedorId)];
      var dias = FE.difDias(FE.HOY, p.fechaEsperada);
      var cuando = p.estado !== 'pendiente' ? FE.media(p.fechaEsperada) : (dias < 0 ? '<strong class="texto-rojo">Atrasado (' + FE.media(p.fechaEsperada) + ')</strong>' : (dias === 0 ? 'Hoy' : FE.media(p.fechaEsperada) + ' (en ' + dias + (dias === 1 ? ' día' : ' días') + ')'));
      return '<tr><td>' + esc(p.id) + '</td><td>' + (i ? enlaceProducto(i) : esc(p.sku)) + '</td><td class="num">' + num(p.cantidad) + ' ' + esc(u) + '</td><td>' + (prov ? esc(prov.nombre) : '—') + '</td>' +
        '<td>' + FE.media(p.fechaPedido) + '</td><td>' + cuando + '</td><td>' + (acciones || '<span class="chip-mini">' + esc(p.estado) + '</span>') + '</td></tr>';
    }
    var pend = e.pedidos.filter(function (p) { return p.estado === 'pendiente'; }).sort(function (a, b) { return a.fechaEsperada < b.fechaEsperada ? -1 : 1; });
    var hist = e.pedidos.filter(function (p) { return p.estado !== 'pendiente'; }).slice(-10).reverse();
    var cab = ['Pedido', 'Producto', { t: 'Cantidad', cls: 'num' }, 'Proveedor', 'Fecha del pedido', 'Llega', 'Estado'];
    var filasPend = pend.map(function (p) {
      return fila(p, '<button class="btn btn-quiet btn-chico" type="button" data-recibir="' + esc(p.id) + '">Marcar como recibido</button>' + (admin ? '<button class="btn btn-quiet btn-chico" type="button" data-cancelar="' + esc(p.id) + '">Cancelar</button>' : ''));
    }).join('');
    var html = cabecera('Pedidos a proveedores', 'Lo que ya se pidió y todavía no llega. El sistema lo descuenta de lo que falta por pedir.') +
      '<section class="panel"><div class="panel-cab"><h2>Pendientes</h2></div>' + (pend.length ? tabla(cab, filasPend) : vacio('No hay pedidos pendientes.' + (admin ? ' Los puedes registrar desde <a href="#/analisis/recomendaciones">Recomendaciones</a>.' : ''))) + '</section>' +
      '<section class="panel"><div class="panel-cab"><h2>Recientes</h2></div>' + (hist.length ? tabla(cab, hist.map(function (p) { return fila(p); }).join('')) : vacio('Aún no hay pedidos recibidos o cancelados.')) + '</section>' +
      '<p class="muted nota">Al marcar un pedido como recibido se registra automáticamente una entrada de inventario con el motivo «Recepción del pedido».</p>';
    return { html: html, despues: function () {
      var raiz = document.getElementById('contenido');
      raiz.addEventListener('click', function (ev) {
        var br = ev.target.closest('[data-recibir]'), bc = ev.target.closest('[data-cancelar]');
        var b = br || bc; if (!b) return;
        b.disabled = true;
        var hecho = br ? INV.Store.recibirPedido(br.getAttribute('data-recibir'), admin ? 'Administrador' : 'Operativo') : INV.Store.cancelarPedido(bc.getAttribute('data-cancelar'));
        Promise.resolve(hecho).then(function () { UI.aviso(br ? 'Pedido recibido: las existencias se actualizaron.' : 'Pedido cancelado.'); ctx.refrescar(); })
          .catch(function (er) { b.disabled = false; UI.aviso(er.message, 'error'); });
      });
    } };
  }

  /* ========================= PARÁMETROS DE REPOSICIÓN ========================= */
  function parametros(ctx) {
    var A = ctx.A;
    var filas = A.todos.slice().sort(function (a, b) { return porNombre(a.producto, b.producto); }).map(function (i) {
      var p = i.producto, r = i.rep, u = i.unidad.abrev;
      return '<tr><td>' + enlaceProducto(i) + '</td><td>' + (i.proveedor ? esc(i.proveedor.nombre) : '—') + '</td><td class="num">' + p.tiempoEntrega + '</td><td class="num">' + num(p.nivelMinimo) + '</td><td class="num">' + p.cobertura + '</td><td class="num">' + UI.pct(p.nivelServicio, 1) + '</td>' +
        '<td class="num">' + (r.ss == null ? '—' : num(r.ss) + ' ' + esc(u)) + '</td><td class="num">' + num(r.pr) + ' ' + esc(u) + '</td><td><button class="btn btn-quiet" type="button" data-sku="' + esc(i.sku) + '">Editar</button></td></tr>';
    }).join('');
    var html = cabecera('Parámetros de reposición', 'Reglas que usa el sistema para decidir cuándo avisarte y cuánto pedir.') +
      '<section class="panel">' + tabla(['Producto', 'Proveedor', { t: 'Entrega (días)', cls: 'num' }, { t: 'Nivel mínimo', cls: 'num' }, { t: 'Cobertura (días)', cls: 'num' }, { t: 'Nivel de servicio', cls: 'num' }, { t: 'Stock de seguridad', cls: 'num' }, { t: 'Punto de reorden', cls: 'num' }, ''], filas) + '</section>' +
      '<p class="muted nota">El stock de seguridad y el punto de reorden los calcula el sistema; no se escriben a mano.</p>';
    return { html: html, despues: function () {
      document.querySelector('.tabla').addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-sku]'); if (!b) return;
        var p = A.info[b.getAttribute('data-sku')].producto;
        UI.abrirModal({ titulo: 'Parámetros de ' + p.nombre, cuerpo: formProducto(ctx, p), alGuardar: function (d) {
          var r = leerProducto(d, false, ctx); if (r.error) return r.error;
          var c = r.valor; delete c.sku;
          return Promise.resolve(INV.Store.editarProducto(p.sku, c)).then(function () { UI.aviso('Parámetros actualizados. Las recomendaciones se recalcularon.'); ctx.refrescar(); });
        } });
      });
    } };
  }

  /* ============================= USUARIOS Y ROLES ============================= */
  function usuarios(ctx) {
    var ok = '<span class="si" aria-label="Sí">Sí</span>', no = '<span class="no" aria-label="No">—</span>';
    var permisos = [['Iniciar sesión', 1, 1], ['Ver productos y existencias', 1, 1], ['Registrar entradas y salidas', 1, 1], ['Consultar el historial de movimientos', 1, 1],
      ['Crear y editar productos, categorías y proveedores', 1, 0], ['Registrar ajustes de inventario', 1, 0], ['Importar ventas históricas', 1, 0],
      ['Ver dashboard, ABC, pronósticos, alertas y recomendaciones', 1, 0], ['Configurar parámetros de reposición', 1, 0]];
    var filas = permisos.map(function (p) { return '<tr><td>' + p[0] + '</td><td class="centro">' + (p[1] ? ok : no) + '</td><td class="centro">' + (p[2] ? ok : no) + '</td></tr>'; }).join('');
    var html = cabecera('Usuarios y roles', 'Quién puede hacer qué en el sistema.') +
      '<section class="panel"><h2>Usuarios de demostración</h2>' + tabla(['Usuario', 'Rol', 'Descripción'],
        '<tr><td>Propietario</td><td>Administrador</td><td>Decide las compras y configura el sistema.</td></tr><tr><td>Encargado de bodega</td><td>Operativo</td><td>Registra los movimientos diarios.</td></tr>') + '</section>' +
      '<section class="panel"><h2>Permisos por rol</h2>' + tabla(['Acción', { t: 'Administrador', cls: 'centro' }, { t: 'Operativo', cls: 'centro' }], filas) + '</section>' +
      '<p class="muted nota">En la versión 1.0 los usuarios se crearán y autenticarán con contraseña, y los roles se validarán en el servidor.</p>';
    return { html: html };
  }

  INV.views = { pedidos: pedidos, dashboard: dashboard, productos: productos, productoDetalle: productoDetalle, categorias: categorias, proveedores: proveedores, nuevoMovimiento: nuevoMovimiento,
    historial: historial, importar: importar, abc: abc, pronostico: pronostico, alertas: alertas, recomendaciones: recomendaciones, parametros: parametros, usuarios: usuarios,
    _validarCSV: validarCSV, _csvEjemplo: csvEjemplo };
})(typeof window !== 'undefined' ? window : globalThis);
