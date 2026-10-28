/* =====================================================================
   InventarIA · prototipo
   data.js — fechas, datos de demostración y almacenamiento local

   Idea central: los datos base se generan siempre igual (semilla fija).
   Lo que hace el usuario (movimientos nuevos, productos, importaciones)
   se guarda aparte en localStorage como "cambios" y se vuelve a aplicar
   sobre los datos base cada vez que se abre la página.
   ===================================================================== */
(function (root) {
  'use strict';
  var INV = root.INV = root.INV || {};

  /* ---------------------------- fechas ---------------------------- */
  // Fecha "de hoy" fija para que la demostración se vea igual para todos.
  var HOY = '2026-10-08';
  var DIAS_HISTORIA = 240;

  function aMs(iso) {
    var p = iso.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }
  function addDias(iso, n) {
    var d = new Date(aMs(iso) + n * 86400000);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  function difDias(a, b) { return Math.round((aMs(b) - aMs(a)) / 86400000); }
  function diaSemana(iso) { return new Date(aMs(iso)).getUTCDay(); } // 0 = domingo
  function esFechaValida(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    var p = iso.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return d.getUTCFullYear() === +p[0] && d.getUTCMonth() === +p[1] - 1 && d.getUTCDate() === +p[2];
  }
  var fmtCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  var fmtLarga = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  var fmtMedia = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  function fechaCorta(iso) { return fmtCorta.format(new Date(aMs(iso))).replace('.', ''); }
  function fechaLarga(iso) { return fmtLarga.format(new Date(aMs(iso))); }
  function fechaMedia(iso) { return fmtMedia.format(new Date(aMs(iso))); }

  var INICIO = addDias(HOY, -(DIAS_HISTORIA - 1));

  /* ---------------------- números y generador ---------------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(rnd) {
    var u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* ---------------------- datos de demostración ---------------------- */
  var CATEGORIAS = [
    { id: 'c1', nombre: 'Despensa' },
    { id: 'c2', nombre: 'Lácteos y huevos' },
    { id: 'c3', nombre: 'Bebidas' },
    { id: 'c4', nombre: 'Aseo del hogar' },
    { id: 'c5', nombre: 'Cuidado personal' },
    { id: 'c6', nombre: 'Panadería y snacks' }
  ];
  var UNIDADES = [
    { id: 'u1', nombre: 'Unidad', abrev: 'und' },
    { id: 'u2', nombre: 'Paquete', abrev: 'paq' },
    { id: 'u3', nombre: 'Caja', abrev: 'caja' },
    { id: 'u4', nombre: 'Kilogramo', abrev: 'kg' }
  ];
  // Proveedores ficticios (no corresponden a empresas reales).
  var PROVEEDORES = [
    { id: 'p1', nombre: 'Distribuidora Caribe', contacto: 'ventas@ejemplo.com', tiempoEntrega: 4, activo: true },
    { id: 'p2', nombre: 'Alimentos del Sinú', contacto: 'pedidos@ejemplo.com', tiempoEntrega: 7, activo: true },
    { id: 'p3', nombre: 'Lácteos La Montaña', contacto: 'comercial@ejemplo.com', tiempoEntrega: 3, activo: true },
    { id: 'p4', nombre: 'Bebidas del Litoral', contacto: 'despachos@ejemplo.com', tiempoEntrega: 5, activo: true },
    { id: 'p5', nombre: 'Aseo y Hogar Bolívar', contacto: 'cuentas@ejemplo.com', tiempoEntrega: 6, activo: true }
  ];

  // Perfiles de ventas por día de la semana (índice 0 = domingo)
  var PERFIL = {
    plano:  [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
    diario: [0.95, 1.05, 1.05, 1.00, 1.00, 1.00, 0.95],
    finde:  [1.10, 0.85, 0.85, 0.90, 0.95, 1.20, 1.35],
    fuerte: [1.05, 0.70, 0.70, 0.80, 0.95, 1.55, 1.75]
  };

  // base = ventas promedio por día; p = probabilidad de que haya venta ese día;
  // objetivo = escenario que se quiere mostrar en la demostración.
  var SEMILLA_PRODUCTOS = [
    { sku: 'ARR-500', nombre: 'Arroz 500 g', cat: 'c1', uni: 'u1', costo: 2100, base: 12, perfil: 'finde', tend: 0.12, ruido: 0.25, p: 1, prov: 'p1', cob: 14, objetivo: { dias: 1.8 } },
    { sku: 'ACE-1L', nombre: 'Aceite vegetal 1 L', cat: 'c1', uni: 'u1', costo: 9800, base: 12, perfil: 'diario', tend: 0, ruido: 0.30, p: 1, prov: 'p1', cob: 14, objetivo: { dias: 7.5 } },
    { sku: 'LEN-500', nombre: 'Lentejas 500 g', cat: 'c1', uni: 'u1', costo: 3200, base: 1.2, perfil: 'plano', tend: -0.10, ruido: 0.5, p: 0.75, prov: 'p2', cob: 14, objetivo: { dias: 190 } },
    { sku: 'AZU-1K', nombre: 'Azúcar 1 kg', cat: 'c1', uni: 'u1', costo: 3600, base: 5, perfil: 'diario', tend: 0.05, ruido: 0.25, p: 1, prov: 'p1', cob: 14, objetivo: { dias: 18 } },
    { sku: 'SAL-1K', nombre: 'Sal 1 kg', cat: 'c1', uni: 'u1', costo: 1500, base: 2.5, perfil: 'plano', tend: 0, ruido: 0.35, p: 1, prov: 'p1', cob: 14, objetivo: { dias: 26 } },
    { sku: 'HAR-1K', nombre: 'Harina de trigo 1 kg', cat: 'c1', uni: 'u1', costo: 3300, base: 2.8, perfil: 'finde', tend: 0.02, ruido: 0.30, p: 1, prov: 'p2', cob: 14, objetivo: { dias: 24 } },
    { sku: 'PAS-250', nombre: 'Pasta 250 g', cat: 'c1', uni: 'u1', costo: 2400, base: 4, perfil: 'plano', tend: 0.08, ruido: 0.30, p: 1, prov: 'p2', cob: 14, objetivo: { dias: 21 } },
    { sku: 'ATU-170', nombre: 'Atún en lata 170 g', cat: 'c1', uni: 'u1', costo: 5200, base: 3, perfil: 'plano', tend: 0.15, ruido: 0.35, p: 1, prov: 'p2', cob: 14, objetivo: { dias: 12 } },
    { sku: 'FRI-500', nombre: 'Fríjol 500 g', cat: 'c1', uni: 'u1', costo: 4100, base: 2.5, perfil: 'finde', tend: -0.10, ruido: 0.40, p: 1, prov: 'p2', cob: 14, objetivo: { dias: 30 } },
    { sku: 'PAN-500', nombre: 'Panela 500 g', cat: 'c1', uni: 'u1', costo: 2800, base: 2, perfil: 'plano', tend: 0, ruido: 0.45, p: 0.85, prov: 'p2', cob: 14, objetivo: { dias: 28 } },
    { sku: 'CAF-250', nombre: 'Café molido 250 g', cat: 'c1', uni: 'u1', costo: 6900, base: 8, perfil: 'diario', tend: 0.20, ruido: 0.30, p: 1, prov: 'p2', cob: 14, objetivo: { dias: 2.6 } },
    { sku: 'LEC-1L', nombre: 'Leche entera 1 L', cat: 'c2', uni: 'u1', costo: 3900, base: 36, perfil: 'finde', tend: 0.05, ruido: 0.20, p: 1, prov: 'p3', cob: 7, objetivo: { dias: 2.2 } },
    { sku: 'HUE-30', nombre: 'Huevos x30', cat: 'c2', uni: 'u3', costo: 16500, base: 10, perfil: 'diario', tend: 0.10, ruido: 0.30, p: 1, prov: 'p3', cob: 7, objetivo: { dias: 9 } },
    { sku: 'QUE-500', nombre: 'Queso campesino 500 g', cat: 'c2', uni: 'u1', costo: 12800, base: 1.6, perfil: 'finde', tend: 0, ruido: 0.40, p: 0.9, prov: 'p3', cob: 7, objetivo: { dias: 8 } },
    { sku: 'GAS-15L', nombre: 'Gaseosa 1,5 L', cat: 'c3', uni: 'u1', costo: 5400, base: 20, perfil: 'fuerte', tend: 0, ruido: 0.25, p: 1, prov: 'p4', cob: 14, objetivo: { dias: 17 } },
    { sku: 'AGU-600', nombre: 'Agua 600 ml', cat: 'c3', uni: 'u1', costo: 1800, base: 11, perfil: 'finde', tend: 0.10, ruido: 0.25, p: 1, prov: 'p4', cob: 14, objetivo: { dias: 20 } },
    { sku: 'CER-330', nombre: 'Cerveza lata 330 ml', cat: 'c3', uni: 'u1', costo: 2900, base: 20, perfil: 'fuerte', tend: 0, ruido: 0.30, p: 1, prov: 'p4', cob: 14, objetivo: { dias: 7.2 } },
    { sku: 'JAB-BAN', nombre: 'Jabón de baño', cat: 'c5', uni: 'u1', costo: 2300, base: 3.5, perfil: 'plano', tend: 0, ruido: 0.30, p: 1, prov: 'p5', cob: 14, objetivo: { dias: 25 } },
    { sku: 'CHA-SAC', nombre: 'Champú sachet', cat: 'c5', uni: 'u1', costo: 900, base: 6, perfil: 'plano', tend: 0.05, ruido: 0.35, p: 1, prov: 'p5', cob: 14, objetivo: { dias: 22 } },
    { sku: 'DET-1K', nombre: 'Detergente en polvo 1 kg', cat: 'c4', uni: 'u1', costo: 8700, base: 1.8, perfil: 'finde', tend: 0, ruido: 0.35, p: 1, prov: 'p5', cob: 14, objetivo: { dias: 29 } },
    { sku: 'PAP-4', nombre: 'Papel higiénico x4', cat: 'c4', uni: 'u2', costo: 6500, base: 2.5, perfil: 'finde', tend: 0.03, ruido: 0.30, p: 1, prov: 'p5', cob: 14, objetivo: { dias: 19 } },
    { sku: 'GAL-SOD', nombre: 'Galletas de soda', cat: 'c6', uni: 'u2', costo: 3100, base: 3.5, perfil: 'plano', tend: 0, ruido: 0.30, p: 1, prov: 'p2', cob: 14, objetivo: { dias: 23 } },
    { sku: 'PAN-TAJ', nombre: 'Pan tajado', cat: 'c6', uni: 'u1', costo: 5800, base: 6, perfil: 'finde', tend: 0.04, ruido: 0.25, p: 1, prov: 'p3', cob: 5, objetivo: { dias: 6 } },
    { sku: 'VEL-6', nombre: 'Velas x6', cat: 'c4', uni: 'u2', costo: 2500, base: 0.55, perfil: 'plano', tend: 0, ruido: 0.4, p: 0.28, tam: 2, prov: 'p5', cob: 21, objetivo: { dias: 160 } },
    { sku: 'PIL-AA', nombre: 'Pilas AA x2', cat: 'c4', uni: 'u2', costo: 3900, base: 0.9, perfil: 'plano', tend: 0, ruido: 0.4, p: 0.32, tam: 2.2, prov: 'p5', cob: 21, objetivo: { dias: 45 } }
  ];

  // [mínimo de pedido, múltiplo]: los proveedores venden por cajas o paquetes cerrados
  var MOQ = {
    'ARR-500': [48, 24], 'ACE-1L': [12, 12], 'LEC-1L': [24, 12], 'CAF-250': [12, 12], 'GAS-15L': [12, 6],
    'AGU-600': [24, 12], 'CER-330': [24, 24], 'HUE-30': [4, 1], 'AZU-1K': [10, 10], 'PAP-4': [6, 6]
  };

  /* --------------------- generación de datos base --------------------- */
  function generarBase() {
    var fechas = [];
    for (var i = 0; i < DIAS_HISTORIA; i++) fechas.push(addDias(INICIO, i));

    var productos = [], movimientos = [], ventas = {};
    var contador = 0;
    function nuevoMov(sku, tipo, cantidad, fecha, motivo, provId, usuario) {
      contador++;
      movimientos.push({ id: 'M' + String(contador).padStart(5, '0'), sku: sku, tipo: tipo, cantidad: cantidad,
        fecha: fecha, motivo: motivo, proveedorId: provId || null, usuario: usuario });
    }
    var provPorId = {};
    PROVEEDORES.forEach(function (p) { provPorId[p.id] = p; });

    SEMILLA_PRODUCTOS.forEach(function (s, idx) {
      var rnd = mulberry32(1000 + idx * 97);
      var prov = provPorId[s.prov];
      var lead = prov.tiempoEntrega;
      var perfil = PERFIL[s.perfil];

      // 1) ventas diarias
      var serie = [];
      for (var d = 0; d < DIAS_HISTORIA; d++) {
        var f = fechas[d];
        var media = s.base * perfil[diaSemana(f)] * (1 + s.tend * (d / 100));
        var q = 0;
        if (rnd() < s.p) {
          var v = media * (s.tam ? 1 : 1) / s.p * (1 + s.ruido * normal(rnd));
          if (s.tam) v = s.tam * (0.6 + rnd() * 1.2);
          q = Math.max(0, Math.round(v));
        }
        serie.push(q);
      }

      // 2) compras con una política simple de reposición (se simula con la demanda deseada)
      var inicial = Math.max(3, Math.round(s.base * (lead + 10)));
      var rr = mulberry32(5000 + idx * 31);
      var llegadasPol = []; // {t, q}
      (function () {
        var stock = inicial, enCamino = 0, llegan = {};
        for (var t = 0; t < DIAS_HISTORIA; t++) {
          var esperada = s.base * (1 + s.tend * (t / 100));
          var rop = Math.max(2, esperada * (lead + 3));
          var pedido = Math.max(3, Math.round(esperada * (s.cob + lead)));
          if (llegan[t]) { stock += llegan[t]; enCamino -= llegan[t]; llegadasPol.push({ t: t, q: llegan[t] }); }
          stock -= Math.min(stock, serie[t]);
          if (stock + enCamino <= rop && t < DIAS_HISTORIA - 1) {
            var llega = t + lead, cant = Math.max(3, Math.round(pedido * (0.9 + rr() * 0.25)));
            if (llega < DIAS_HISTORIA) { llegan[llega] = (llegan[llega] || 0) + cant; enCamino += cant; }
          }
        }
      })();

      // 3) pequeños ajustes de conteo (de ±1 unidad)
      var ajustesPol = [];
      for (var k = 0; k < 2; k++) {
        ajustesPol.push({ t: 20 + Math.floor(rnd() * (DIAS_HISTORIA - 60)), q: rnd() < 0.7 ? -1 : 1 });
      }

      // 4) repetición determinista: con las llegadas ya fijadas se calcula qué se vendió de verdad
      //    (nunca más que las existencias) y cómo quedó el inventario día a día
      function repetir(llegadas) {
        var stock = inicial, mov = [], vendidos = new Array(DIAS_HISTORIA).fill(0);
        for (var t = 0; t < DIAS_HISTORIA; t++) {
          llegadas.forEach(function (l) { if (l.t === t) { stock += l.q; mov.push({ t: t, tipo: 'entrada', q: l.q }); } });
          ajustesPol.forEach(function (a) {
            if (a.t === t && (a.q > 0 || stock >= 3)) { stock += a.q; mov.push({ t: t, tipo: 'ajuste', q: a.q }); }
          });
          var v = Math.min(stock, serie[t]);
          if (v > 0) { stock -= v; vendidos[t] = v; mov.push({ t: t, tipo: 'salida', q: v }); }
        }
        return { stock: stock, mov: mov, vendidos: vendidos };
      }
      var meta = Math.max(1, Math.round(s.base * s.objetivo.dias));
      var llegadas = llegadasPol.slice();
      var res = repetir(llegadas);
      if (res.stock > meta * 1.25) {
        // el último pedido llegó incompleto (o no llegó): se reduce hasta acercarse a la meta
        for (var li = llegadas.length - 1; li >= 0 && res.stock > meta * 1.25; li--) {
          var orig = llegadas[li].q, lo = 0, hi = orig;
          while (hi - lo > 1) {
            var mid = (lo + hi) >> 1;
            llegadas[li] = { t: llegadas[li].t, q: mid };
            if (repetir(llegadas).stock > meta) hi = mid; else lo = mid;
          }
          llegadas[li] = { t: llegadas[li].t, q: lo };
          res = repetir(llegadas);
          if (llegadas[li].q < Math.max(1, orig * 0.15)) { llegadas.splice(li, 1); res = repetir(llegadas); }
        }
      }
      var correccion = 0;
      if (res.stock < meta * 0.8) { correccion = meta - res.stock; }
      ventas[s.sku] = res.vendidos;
      var mov = res.mov;

      // 5) registrar movimientos
      nuevoMov(s.sku, 'ajuste', inicial, fechas[0], 'Inventario inicial', null, 'Administrador');
      var nFactura = 1000 + idx * 40;
      mov.forEach(function (m) {
        if (m.tipo === 'entrada') {
          nFactura++;
          nuevoMov(s.sku, 'entrada', m.q, fechas[m.t], 'Compra a proveedor · factura ' + nFactura, s.prov, 'Operativo');
        } else if (m.tipo === 'ajuste') {
          nuevoMov(s.sku, 'ajuste', m.q, fechas[m.t], m.q < 0 ? 'Producto vencido o dañado' : 'Error de conteo corregido', null, 'Administrador');
        } else {
          nuevoMov(s.sku, 'salida', m.q, fechas[m.t], 'Ventas del día', null, 'Operativo');
        }
      });
      if (correccion > 0) {
        nuevoMov(s.sku, 'entrada', correccion, fechas[DIAS_HISTORIA - 3], 'Compra a proveedor · factura ' + (nFactura + 7), s.prov, 'Operativo');
      }

      productos.push({
        sku: s.sku, nombre: s.nombre, categoriaId: s.cat, unidadId: s.uni, costo: s.costo, activo: true,
        proveedorId: s.prov, tiempoEntrega: lead,
        nivelMinimo: Math.max(1, Math.ceil(s.base * lead)), cobertura: s.cob, nivelServicio: 0.95,
        minimoPedido: (MOQ[s.sku] || [1, 1])[0], multiploPedido: (MOQ[s.sku] || [1, 1])[1]
      });
    });

    // ordenar movimientos por fecha (y por id) para que el historial sea coherente
    movimientos.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.id < b.id ? -1 : 1); });

    // pedidos que ya se hicieron al proveedor y todavía no llegan
    var pedidos = [
      { sku: 'ARR-500', cantidad: 240, hace: 2, falta: 2 },
      { sku: 'CAF-250', cantidad: 120, hace: 3, falta: 4 },
      { sku: 'LEC-1L', cantidad: 240, hace: 2, falta: 1 }
    ].map(function (p, i) {
      var prod = productos.filter(function (x) { return x.sku === p.sku; })[0];
      return { id: 'P' + String(i + 1).padStart(4, '0'), sku: p.sku, proveedorId: prod.proveedorId, cantidad: p.cantidad,
        fechaPedido: addDias(HOY, -p.hace), fechaEsperada: addDias(HOY, p.falta), estado: 'pendiente' };
    });
    return {
      fechas: fechas,
      categorias: CATEGORIAS.map(function (x) { return Object.assign({}, x); }),
      unidades: UNIDADES.map(function (x) { return Object.assign({}, x); }),
      proveedores: PROVEEDORES.map(function (x) { return Object.assign({}, x); }),
      productos: productos, movimientos: movimientos, ventas: ventas, pedidos: pedidos, contador: contador
    };
  }

  /* ----------------------------- el "store" ----------------------------- */
  var CLAVE = 'inventaria-prototipo-v1';
  var LISTENERS = [];

  var Store = {
    estado: null,
    cambios: null,
    version: 0,

    iniciar: function () {
      this.cambios = this.leerCambios();
      this.reconstruir();
    },
    leerCambios: function () {
      var vacio = { categorias: [], unidades: [], proveedores: [], productosNuevos: [], edicionesProducto: {}, movimientos: [], ventas: {}, siguienteMov: 1, pedidosNuevos: [], pedidosRecibidos: [], siguientePedido: 1 };
      try {
        var raw = root.localStorage && root.localStorage.getItem(CLAVE);
        if (raw) {
          var obj = JSON.parse(raw);
          for (var k in vacio) if (!(k in obj)) obj[k] = vacio[k];
          return obj;
        }
      } catch (e) { /* sin almacenamiento: se trabaja en memoria */ }
      return vacio;
    },
    guardar: function () {
      try { root.localStorage && root.localStorage.setItem(CLAVE, JSON.stringify(this.cambios)); } catch (e) { /* ignorar */ }
    },
    reconstruir: function () {
      var base = generarBase();
      var c = this.cambios;
      c.categorias.forEach(function (x) { base.categorias.push(x); });
      c.unidades.forEach(function (x) { base.unidades.push(x); });
      c.proveedores.forEach(function (x) { base.proveedores.push(x); });
      c.productosNuevos.forEach(function (p) {
        base.productos.push(Object.assign({}, p));
        base.ventas[p.sku] = new Array(DIAS_HISTORIA).fill(0);
      });
      base.productos.forEach(function (p) {
        var ed = c.edicionesProducto[p.sku];
        if (ed) Object.assign(p, ed);
      });
      c.movimientos.forEach(function (m) { base.movimientos.push(Object.assign({}, m)); });
      c.pedidosNuevos.forEach(function (p) { base.pedidos.push(Object.assign({}, p)); });
      base.pedidos.forEach(function (p) { if (c.pedidosRecibidos.indexOf(p.id) >= 0) p.estado = 'recibido'; });
      // ventas importadas: reemplazan el valor del día
      Object.keys(c.ventas).forEach(function (sku) {
        if (!base.ventas[sku]) return;
        Object.keys(c.ventas[sku]).forEach(function (i) { base.ventas[sku][+i] = c.ventas[sku][i]; });
      });
      this.estado = base;
      this.version++;
      LISTENERS.forEach(function (fn) { fn(); });
    },
    alCambiar: function (fn) { LISTENERS.push(fn); },
    // modo servidor: el estado llega de la API en lugar de generarse aquí
    establecer: function (estado) {
      this.estado = estado; this.version++;
      LISTENERS.forEach(function (fn) { fn(); });
    },
    restablecer: function () {
      try { root.localStorage && root.localStorage.removeItem(CLAVE); } catch (e) { /* ignorar */ }
      this.cambios = { categorias: [], unidades: [], proveedores: [], productosNuevos: [], edicionesProducto: {}, movimientos: [], ventas: {}, siguienteMov: 1, pedidosNuevos: [], pedidosRecibidos: [], siguientePedido: 1 };
      this.reconstruir();
    },

    /* ---- operaciones ---- */
    agregarMovimiento: function (m) {
      var c = this.cambios;
      var id = 'N' + String(c.siguienteMov++).padStart(4, '0');
      c.movimientos.push({ id: id, sku: m.sku, tipo: m.tipo, cantidad: m.cantidad, fecha: m.fecha, motivo: m.motivo, proveedorId: m.proveedorId || null, usuario: m.usuario });
      this.guardar(); this.reconstruir();
      return id;
    },
    agregarCategoria: function (nombre) {
      this.cambios.categorias.push({ id: 'cx' + Date.now() + Math.floor(Math.random() * 99), nombre: nombre });
      this.guardar(); this.reconstruir();
    },
    agregarUnidad: function (nombre, abrev) {
      this.cambios.unidades.push({ id: 'ux' + Date.now() + Math.floor(Math.random() * 99), nombre: nombre, abrev: abrev });
      this.guardar(); this.reconstruir();
    },
    agregarProveedor: function (nombre, contacto, tiempoEntrega) {
      this.cambios.proveedores.push({ id: 'px' + Date.now() + Math.floor(Math.random() * 99), nombre: nombre, contacto: contacto, tiempoEntrega: tiempoEntrega, activo: true });
      this.guardar(); this.reconstruir();
    },
    agregarProducto: function (p) {
      this.cambios.productosNuevos.push(p);
      this.guardar(); this.reconstruir();
    },
    editarProducto: function (sku, campos) {
      var nuevo = this.cambios.productosNuevos.filter(function (p) { return p.sku === sku; })[0];
      if (nuevo) Object.assign(nuevo, campos);
      else this.cambios.edicionesProducto[sku] = Object.assign(this.cambios.edicionesProducto[sku] || {}, campos);
      this.guardar(); this.reconstruir();
    },
    agregarPedido: function (p) {
      var c = this.cambios, id = 'PN' + String(c.siguientePedido++).padStart(3, '0');
      c.pedidosNuevos.push({ id: id, sku: p.sku, proveedorId: p.proveedorId, cantidad: p.cantidad, fechaPedido: p.fechaPedido, fechaEsperada: p.fechaEsperada, estado: 'pendiente' });
      this.guardar(); this.reconstruir();
      return id;
    },
    recibirPedido: function (id, usuario) {
      var ped = this.estado.pedidos.filter(function (p) { return p.id === id; })[0];
      if (!ped || ped.estado !== 'pendiente') return null;
      this.cambios.pedidosRecibidos.push(id);
      return this.agregarMovimiento({ sku: ped.sku, tipo: 'entrada', cantidad: ped.cantidad, fecha: HOY, motivo: 'Recepción del pedido ' + id, proveedorId: ped.proveedorId, usuario: usuario });
    },
    cancelarPedido: function (id) {
      var c = this.cambios;
      if (c.pedidosRecibidos.indexOf(id) < 0) c.pedidosRecibidos.push(id);   // en el prototipo: sale de la lista de pendientes
      this.guardar(); this.reconstruir();
    },
    importarVentas: function (filas) { // filas: [{sku, fecha, cantidad}]
      var c = this.cambios;
      filas.forEach(function (f) {
        var i = difDias(INICIO, f.fecha);
        c.ventas[f.sku] = c.ventas[f.sku] || {};
        c.ventas[f.sku][i] = f.cantidad;
      });
      this.guardar(); this.reconstruir();
    }
  };

  INV.fechas = { HOY: HOY, INICIO: INICIO, DIAS: DIAS_HISTORIA, addDias: addDias, difDias: difDias, diaSemana: diaSemana,
    esFechaValida: esFechaValida, corta: fechaCorta, larga: fechaLarga, media: fechaMedia,
    // en modo servidor la fecha de hoy y el periodo los define la API
    configurar: function (hoy, dias) { this.HOY = hoy; this.DIAS = dias; this.INICIO = addDias(hoy, -(dias - 1)); } };
  INV.Store = Store;
  INV.generarBase = generarBase;
})(typeof window !== 'undefined' ? window : globalThis);
