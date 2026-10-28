/* =====================================================================
   InventarIA · api.js — conexión con el servidor (FastAPI)

   Si la página se abre desde el servidor, este archivo detecta la API y reemplaza el
   almacenamiento local del prototipo por llamadas HTTP. Si no hay servidor (por ejemplo,
   GitHub Pages), el prototipo sigue funcionando solo con datos de demostración locales.
   ===================================================================== */
(function (root) {
  'use strict';
  var INV = root.INV, S = INV.Store, FE = INV.fechas;
  var CLAVE = 'inventaria-sesion';
  var api = INV.api = { disponible: false, token: null, rol: null, nombre: null };

  function leerSesion() {
    try { var s = JSON.parse(root.sessionStorage.getItem(CLAVE) || 'null'); if (s) { api.token = s.token; api.rol = s.rol; api.nombre = s.nombre; } } catch (e) { /* sin sessionStorage */ }
  }
  function guardarSesion() {
    try { root.sessionStorage.setItem(CLAVE, JSON.stringify({ token: api.token, rol: api.rol, nombre: api.nombre })); } catch (e) { /* ignorar */ }
  }

  function llamar(metodo, ruta, cuerpo) {
    var opciones = { method: metodo, headers: { 'Content-Type': 'application/json' } };
    if (api.token) opciones.headers.Authorization = 'Bearer ' + api.token;
    if (cuerpo !== undefined) opciones.body = JSON.stringify(cuerpo);
    return root.fetch(ruta, opciones).then(function (r) {
      return r.text().then(function (t) {
        var datos = null; try { datos = t ? JSON.parse(t) : null; } catch (e) { datos = null; }
        if (!r.ok) {
          var msg = datos && datos.detail ? datos.detail : 'No se pudo completar la operación (' + r.status + ').';
          if (Array.isArray(msg)) msg = 'Revisa los datos: ' + msg.map(function (x) { return (x.loc || []).slice(-1)[0] + ' ' + x.msg; }).join('; ');
          var err = new Error(msg); err.status = r.status;
          if (r.status === 401 && api.token && ruta !== '/api/auth/login') { api.cerrarSesion(); if (api.alExpirar) api.alExpirar(); }
          throw err;
        }
        return datos;
      });
    });
  }
  api.llamar = llamar;

  api.detectar = function () {
  var esGitHubPages =
    root.location.hostname === 'davidpel31.github.io';

  // GitHub Pages no ejecuta FastAPI.
  // En ese entorno se utiliza el modo de demostración local.
  if (esGitHubPages) {
    api.disponible = false;
    return Promise.resolve(false);
  }

  // En local, comprueba si FastAPI está disponible.
  return root.fetch('/api/salud')
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (j) {
      api.disponible = !!(j && j.estado === 'ok');
      return api.disponible;
    })
    .catch(function () {
      api.disponible = false;
      return false;
    });
};
  api.sesionActiva = function () { leerSesion(); return !!api.token; };
  api.login = function (usuario, clave) {
    return llamar('POST', '/api/auth/login', { username: usuario, password: clave }).then(function (r) {
      api.token = r.token; api.rol = r.rol; api.nombre = r.nombre; guardarSesion(); return r;
    });
  };
  api.cerrarSesion = function () {
    api.token = null; api.rol = null; api.nombre = null;
    try { root.sessionStorage.removeItem(CLAVE); } catch (e) { /* ignorar */ }
  };

  // El estado de la API llega con la forma que ya usaba el prototipo; solo se completa el calendario.
  api.cargar = function () {
    return llamar('GET', '/api/estado').then(function (e) {
      FE.configurar(e.hoy, e.dias);
      var fechas = []; for (var i = 0; i < e.dias; i++) fechas.push(FE.addDias(e.inicio, i));
      e.fechas = fechas;
      e.contador = e.movimientos.length;
      S.establecer(e);
    });
  };

  /* ---- se reemplazan las operaciones del Store: ahora hablan con el servidor ---- */
  api.activarModoServidor = function () {
    var recargar = function (valor) { return api.cargar().then(function () { return valor; }); };
    S.iniciar = function () {};
    S.modoServidor = true;
    S.agregarMovimiento = function (m) {
      return llamar('POST', '/api/movimientos', { sku: m.sku, tipo: m.tipo, cantidad: m.cantidad, fecha: m.fecha, motivo: m.motivo, proveedorId: m.proveedorId || null })
        .then(function (r) { return recargar(r.id); });
    };
    S.agregarCategoria = function (nombre) { return llamar('POST', '/api/categorias', { nombre: nombre }).then(recargar); };
    S.agregarUnidad = function (nombre, abrev) { return llamar('POST', '/api/unidades', { nombre: nombre, abrev: abrev }).then(recargar); };
    S.agregarProveedor = function (nombre, contacto, t) { return llamar('POST', '/api/proveedores', { nombre: nombre, contacto: contacto, tiempoEntrega: t }).then(recargar); };
    S.agregarProducto = function (p) {
      return llamar('POST', '/api/productos', { sku: p.sku, nombre: p.nombre, categoriaId: +p.categoriaId, unidadId: +p.unidadId, costo: p.costo, proveedorId: +p.proveedorId,
        tiempoEntrega: p.tiempoEntrega, nivelMinimo: p.nivelMinimo, cobertura: p.cobertura, nivelServicio: p.nivelServicio, minimoPedido: p.minimoPedido || 1, multiploPedido: p.multiploPedido || 1 }).then(recargar);
    };
    S.editarProducto = function (sku, campos) {
      var c = Object.assign({}, campos);
      ['categoriaId', 'unidadId', 'proveedorId'].forEach(function (k) { if (c[k] !== undefined) c[k] = +c[k]; });
      return llamar('PUT', '/api/productos/' + encodeURIComponent(sku), c).then(recargar);
    };
    S.agregarPedido = function (p) {
      return llamar('POST', '/api/pedidos', { sku: p.sku, cantidad: p.cantidad, fechaPedido: p.fechaPedido, fechaEsperada: p.fechaEsperada }).then(function (r) { return recargar(r.id); });
    };
    var idNum = function (id) { var p = S.estado.pedidos.filter(function (x) { return x.id === id; })[0]; return p ? p.idNum : parseInt(String(id).replace(/\D/g, ''), 10); };
    S.recibirPedido = function (id) { return llamar('POST', '/api/pedidos/' + idNum(id) + '/recibir').then(function (r) { return recargar(r.movimientoId); }); };
    S.cancelarPedido = function (id) { return llamar('POST', '/api/pedidos/' + idNum(id) + '/cancelar').then(recargar); };
    S.confirmarImportacion = function (archivo, contenido) {
      return llamar('POST', '/api/importaciones/ventas', { archivo: archivo, contenido: contenido, confirmar: true }).then(function (r) { return recargar(r); });
    };
    S.restablecer = function () { return Promise.resolve(); };
  };
})(typeof window !== 'undefined' ? window : globalThis);
