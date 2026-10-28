/* =====================================================================
   InventarIA · prototipo
   app.js — arranque: rol de demostración, menú lateral y rutas.

   Las rutas usan el "hash" de la dirección (#/productos, #/dashboard…),
   así funciona igual en GitHub Pages sin configurar nada en el servidor.
   ===================================================================== */
(function (root) {
  'use strict';
  var INV = root.INV, S = INV.Store, FE = INV.fechas, UI = INV.ui, V = INV.views, E = INV.engine;
  var doc = root.document;

  var A = null, modoServidor = false;
  function recalcular() { A = S.estado ? E.analizar(S.estado) : null; }
  S.alCambiar(recalcular);

  /* ------------------------------ rol ------------------------------ */
  var CLAVE_ROL = 'inventaria-rol', rolMemoria = null;
  function leerRol() {
    if (modoServidor) return INV.api.token ? INV.api.rol : null;      // el rol viene del servidor (token firmado)
    try { return root.sessionStorage.getItem(CLAVE_ROL); } catch (e) { return rolMemoria; }
  }
  function fijarRol(r) {
    rolMemoria = r;
    try { r ? root.sessionStorage.setItem(CLAVE_ROL, r) : root.sessionStorage.removeItem(CLAVE_ROL); } catch (e) { /* sin sessionStorage */ }
  }

  /* ------------------------------ rutas ------------------------------ */
  var AD = ['admin'], TODOS = ['admin', 'operativo'];
  var RUTAS = [
    { re: /^\/dashboard$/, vista: 'dashboard', roles: AD, menu: 'dashboard' },
    { re: /^\/productos$/, vista: 'productos', roles: TODOS, menu: 'productos' },
    { re: /^\/productos\/([^\/]+)$/, vista: 'productoDetalle', roles: TODOS, menu: 'productos', param: 'sku' },
    { re: /^\/categorias$/, vista: 'categorias', roles: AD, menu: 'categorias' },
    { re: /^\/proveedores$/, vista: 'proveedores', roles: AD, menu: 'proveedores' },
    { re: /^\/movimientos\/nuevo$/, vista: 'nuevoMovimiento', roles: TODOS, menu: 'mov-nuevo' },
    { re: /^\/movimientos\/historial$/, vista: 'historial', roles: TODOS, menu: 'mov-hist' },
    { re: /^\/pedidos$/, vista: 'pedidos', roles: TODOS, menu: 'pedidos' },
    { re: /^\/importar$/, vista: 'importar', roles: AD, menu: 'importar' },
    { re: /^\/analisis\/abc$/, vista: 'abc', roles: AD, menu: 'abc' },
    { re: /^\/analisis\/pronostico(?:\/([^\/]+))?$/, vista: 'pronostico', roles: AD, menu: 'pronostico', param: 'sku' },
    { re: /^\/analisis\/alertas$/, vista: 'alertas', roles: AD, menu: 'alertas' },
    { re: /^\/analisis\/recomendaciones$/, vista: 'recomendaciones', roles: AD, menu: 'recomendaciones' },
    { re: /^\/config\/parametros$/, vista: 'parametros', roles: AD, menu: 'parametros' },
    { re: /^\/config\/usuarios$/, vista: 'usuarios', roles: AD, menu: 'usuarios' }
  ];
  var MENU = [
    { id: 'dashboard', t: 'Dashboard', href: '#/dashboard', roles: AD },
    { grupo: 'Inventario', items: [
      { id: 'productos', t: 'Productos', href: '#/productos', roles: TODOS },
      { id: 'categorias', t: 'Categorías y unidades', href: '#/categorias', roles: AD },
      { id: 'proveedores', t: 'Proveedores', href: '#/proveedores', roles: AD }] },
    { grupo: 'Movimientos', items: [
      { id: 'mov-nuevo', t: 'Registrar movimiento', href: '#/movimientos/nuevo', roles: TODOS },
      { id: 'mov-hist', t: 'Historial', href: '#/movimientos/historial', roles: TODOS },
      { id: 'pedidos', t: 'Pedidos a proveedores', href: '#/pedidos', roles: TODOS }] },
    { id: 'importar', t: 'Importar ventas', href: '#/importar', roles: AD },
    { grupo: 'Análisis', items: [
      { id: 'abc', t: 'ABC y rotación', href: '#/analisis/abc', roles: AD },
      { id: 'pronostico', t: 'Pronóstico', href: '#/analisis/pronostico', roles: AD },
      { id: 'alertas', t: 'Alertas', href: '#/analisis/alertas', roles: AD, cuenta: true },
      { id: 'recomendaciones', t: 'Recomendaciones', href: '#/analisis/recomendaciones', roles: AD }] },
    { grupo: 'Configuración', items: [
      { id: 'parametros', t: 'Parámetros de reposición', href: '#/config/parametros', roles: AD },
      { id: 'usuarios', t: 'Usuarios y roles', href: '#/config/usuarios', roles: AD }] }
  ];

  function parsearHash() {
    var h = (root.location.hash || '').replace(/^#/, '');
    var partes = h.split('?'), ruta = partes[0] || '', q = {};
    (partes[1] || '').split('&').forEach(function (kv) {
      if (!kv) return;
      var p = kv.split('=');
      q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
    });
    return { ruta: ruta, q: q };
  }
  function rolEtiqueta(r) { return r === 'admin' ? 'Administrador' : 'Operativo'; }
  function inicioDe(r) { return r === 'admin' ? '/dashboard' : '/movimientos/nuevo'; }
  function ir(ruta) {
    var destino = '#' + ruta;
    if (root.location.hash === destino) pintar(false); else root.location.hash = destino;
  }

  /* --------------------------- pantalla de entrada --------------------------- */
  function pintarLogin(mensaje) {
    var cuerpo;
    if (modoServidor) {
      cuerpo = '<h2>Iniciar sesión</h2><form class="form-login" id="form-login" novalidate>' +
        '<label>Usuario<input name="usuario" autocomplete="username" required autofocus></label>' +
        '<label>Contraseña<input name="clave" type="password" autocomplete="current-password" required></label>' +
        '<p class="error-form" id="login-error" role="alert"' + (mensaje ? '' : ' hidden') + '>' + (mensaje || '') + '</p>' +
        '<button class="btn btn-primary" type="submit">Entrar</button></form>' +
        '<div class="demo-credenciales"><strong>Usuarios de demostración</strong><br>Administrador: <code>admin</code> / <code>admin123</code><br>Operativo: <code>operativo</code> / <code>operativo123</code></div>';
    } else {
      cuerpo = '<h2>Entrar como</h2><div class="login-roles">' +
        '<button type="button" class="rol-btn" data-rol="admin"><strong>Administrador</strong><span>Dueño del negocio: ve el dashboard, el pronóstico, las alertas y las recomendaciones.</span></button>' +
        '<button type="button" class="rol-btn" data-rol="operativo"><strong>Operativo</strong><span>Encargado de bodega: registra entradas y salidas y consulta existencias.</span></button></div>';
    }
    doc.getElementById('app').innerHTML =
      '<div class="login"><div class="login-caja">' +
      '<p class="marca marca-grande">' + logo() + 'InventarIA</p>' +
      '<h1>Decide cuánto comprar y cuándo, con tus propias ventas</h1>' +
      (modoServidor
        ? '<p>Versión conectada al servidor: los datos viven en la base de datos y cada acción pasa por la API con su inicio de sesión y sus roles.</p>'
        : '<p>Este es un prototipo navegable del proyecto. Funciona con datos de demostración de una tienda de barrio (25 productos y ocho meses de ventas) y todo lo que hagas se guarda solo en tu navegador.</p>') +
      cuerpo +
      (modoServidor ? '' : '<p class="muted nota">Fecha de la demostración: ' + FE.larga(FE.HOY) + '. No hay contraseñas: en la versión conectada el acceso se hace con usuario y contraseña.</p>') +
      '</div></div>';
    Array.prototype.forEach.call(doc.querySelectorAll('.rol-btn'), function (b) {
      b.addEventListener('click', function () {
        var r = b.getAttribute('data-rol'); fijarRol(r);
        var destino = '#' + inicioDe(r);
        if (root.location.hash === destino) pintar(true); else root.location.hash = destino;
      });
    });
    var f = doc.getElementById('form-login');
    if (f) f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var caja = doc.getElementById('login-error'), boton = f.querySelector('button[type=submit]');
      boton.disabled = true;
      INV.api.login(f.elements.usuario.value.trim().toLowerCase(), f.elements.clave.value)
        .then(function () { return INV.api.cargar(); })
        .then(function () {
          var destino = '#' + inicioDe(INV.api.rol);
          if (root.location.hash === destino) pintar(true); else root.location.hash = destino;
        })
        .catch(function (er) { boton.disabled = false; caja.textContent = er.message; caja.hidden = false; });
    });
  }
  function logo() {
    return '<svg class="logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect x="2" y="5" width="28" height="3" rx="1" fill="currentColor"/><rect x="2" y="15" width="28" height="3" rx="1" fill="currentColor"/><rect x="2" y="25" width="28" height="3" rx="1" fill="currentColor"/>' +
      '<rect x="5" y="9" width="6" height="6" fill="#8FB4EA"/><rect x="13" y="11" width="6" height="4" fill="#8FB4EA"/><rect x="21" y="8.5" width="6" height="6.5" fill="#8FB4EA"/><rect x="6" y="19" width="8" height="6" fill="#8FB4EA"/><rect x="17" y="20" width="6" height="5" fill="#8FB4EA"/></svg>';
  }

  /* ------------------------------ menú lateral ------------------------------ */
  function menuHTML(rol, activo) {
    function link(it) {
      return '<li><a href="' + it.href + '"' + (it.id === activo ? ' aria-current="page"' : '') + '>' + it.t +
        (it.cuenta && A.resumen.alertas ? '<span class="cuenta" aria-label="' + A.resumen.alertas + ' alertas">' + A.resumen.alertas + '</span>' : '') + '</a></li>';
    }
    var h = '';
    MENU.forEach(function (m) {
      if (m.grupo) {
        var items = m.items.filter(function (i) { return i.roles.indexOf(rol) >= 0; });
        if (!items.length) return;
        h += '<li class="grupo"><p>' + m.grupo + '</p><ul>' + items.map(link).join('') + '</ul></li>';
      } else if (m.roles.indexOf(rol) >= 0) h += link(m);
    });
    return '<ul>' + h + '</ul>';
  }

  /* -------------------------------- pintar -------------------------------- */
  function pintar(cambioDeRuta) {
    var rol = leerRol();
    if (!rol || !S.estado) { pintarLogin(); return; }
    INV.ui.ocultarPocosDatos = rol === 'operativo';   // el operativo no ve el historial de ventas: no tiene sentido ese aviso
    var h = parsearHash(), ruta = h.ruta || inicioDe(rol);
    var def = null, args = {};
    RUTAS.forEach(function (r) {
      if (def) return;
      var m = ruta.match(r.re);
      if (m) { def = r; if (r.param && m[1]) args[r.param] = decodeURIComponent(m[1]); }
    });
    var contenido, despues = null;
    var ctx = { A: A, estado: S.estado, rol: rol, servidor: modoServidor, q: h.q, args: args, saludo: 'Buenos días', ir: ir, refrescar: function () { pintar(false); } };
    if (!def) {
      contenido = '<header class="page-head"><div><h1>Página no encontrada</h1></div></header><div class="vacio"><p>Esa dirección no existe en el prototipo.</p><a class="btn" href="#' + inicioDe(rol) + '">Ir al inicio</a></div>';
    } else if (def.roles.indexOf(rol) < 0) {
      contenido = '<header class="page-head"><div><h1>Solo para el administrador</h1></div></header><div class="vacio"><p>Con el rol Operativo no se puede entrar a esta sección.</p><a class="btn" href="#' + inicioDe(rol) + '">Ir a mi inicio</a></div>';
      def = null;
    } else {
      var r = V[def.vista](ctx);
      contenido = r.html; despues = r.despues;
    }
    var activo = def ? def.menu : '';
    doc.getElementById('app').innerHTML =
      '<a class="saltar" href="#" id="saltar">Ir al contenido</a>' +
      '<div class="app"><aside class="lateral-nav" id="nav" aria-label="Menú principal">' +
      '<p class="marca">' + logo() + 'InventarIA</p><nav>' + menuHTML(rol, activo) + '</nav>' +
      '<div class="nav-pie"><p class="rol-actual">' + (modoServidor ? 'Sesión: <strong>' + esc(INV.api.nombre || '') + '</strong> (' + rolEtiqueta(rol) + ')' : 'Rol: <strong>' + rolEtiqueta(rol) + '</strong>') + '</p>' +
      '<button type="button" class="btn-nav" id="cambiar-rol">' + (modoServidor ? 'Cerrar sesión' : 'Cambiar de rol') + '</button>' +
      (modoServidor ? '' : '<button type="button" class="btn-nav" id="restablecer">Restablecer datos de demostración</button>') +
      '<p class="nav-nota">' + (modoServidor ? 'Conectado al servidor: los datos están en la base de datos.' : 'Prototipo con datos ficticios. Lo que registres se guarda solo en este navegador.') + '</p></div></aside>' +
      '<div class="principal"><div class="barra-movil"><button type="button" class="btn-menu" id="btn-menu" aria-expanded="false" aria-controls="nav">Menú</button><span class="marca">' + logo() + 'InventarIA</span></div>' +
      '<main id="contenido" tabindex="-1">' + contenido + '</main></div></div>';

    var nav = doc.getElementById('nav'), btn = doc.getElementById('btn-menu');
    btn.addEventListener('click', function () {
      var abierto = nav.classList.toggle('abierto'); btn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    });
    nav.addEventListener('click', function (ev) { if (ev.target.closest('a')) { nav.classList.remove('abierto'); btn.setAttribute('aria-expanded', 'false'); } });
    doc.getElementById('cambiar-rol').addEventListener('click', function () {
      if (modoServidor) INV.api.cerrarSesion(); else fijarRol(null);
      root.location.hash = ''; pintar(true);
    });
    var rest = doc.getElementById('restablecer');
    if (rest) rest.addEventListener('click', function () {
      if (root.confirm('Se borrarán los movimientos, productos e importaciones que hayas hecho y se volverá a los datos de demostración. ¿Continuar?')) {
        S.restablecer(); UI.aviso('Datos de demostración restablecidos.'); pintar(false);
      }
    });
    doc.getElementById('saltar').addEventListener('click', function (ev) { ev.preventDefault(); doc.getElementById('contenido').focus(); });
    if (despues) despues(doc.getElementById('contenido'));
    if (cambioDeRuta !== false) {
      root.scrollTo && root.scrollTo(0, 0);
      var main = doc.getElementById('contenido');
      if (main && main.focus) main.focus({ preventScroll: true });
      doc.title = (def ? (doc.querySelector('main h1') || {}).textContent + ' · ' : '') + 'InventarIA · prototipo';
    }
  }

  function esc(t) { return UI.esc(t); }

  // Arranque: ¿hay servidor? Si lo hay, se usa la API; si no (p. ej. GitHub Pages), el prototipo local.
  function arrancar() {
    INV.api.detectar().then(function (hay) {
      modoServidor = hay;
      if (hay) {
        INV.api.activarModoServidor();
        INV.api.alExpirar = function () { pintarLogin('Tu sesión expiró. Inicia sesión de nuevo.'); };
        if (INV.api.sesionActiva()) return INV.api.cargar().catch(function () { INV.api.cerrarSesion(); });
      } else {
        S.iniciar();
      }
    }).then(function () { recalcular(); pintar(true); });
  }
  root.addEventListener('hashchange', function () { pintar(true); });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', arrancar); else arrancar();

  INV.app = { ir: ir, pintar: pintar, analisis: function () { return A; } };
})(typeof window !== 'undefined' ? window : globalThis);
