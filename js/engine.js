/* =====================================================================
   InventarIA · prototipo
   engine.js — calcula, para cada producto, existencias, rotación,
   clasificación ABC, pronóstico, estado (semáforo) y recomendación.
   ===================================================================== */
(function (root) {
  'use strict';
  var INV = root.INV = root.INV || {};
  var F = INV.forecast || (typeof require !== 'undefined' ? require('./forecast.js') : null);

  function media(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; }
  function mediana(a) {
    if (!a.length) return 0;
    var b = a.slice().sort(function (x, y) { return x - y; }), m = Math.floor(b.length / 2);
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  }

  function serieExistencias(estado) {
    var N = estado.fechas.length, idx = {};
    estado.fechas.forEach(function (f, i) { idx[f] = i; });
    var delta = {};
    estado.productos.forEach(function (p) { delta[p.sku] = new Array(N).fill(0); });
    var ultimaEntrada = {};
    estado.movimientos.forEach(function (m) {
      var i = idx[m.fecha];
      if (i === undefined || !delta[m.sku]) return;
      var d = m.tipo === 'salida' ? -m.cantidad : m.cantidad; // entrada y ajuste: la cantidad ya trae su signo
      delta[m.sku][i] += d;
      if (m.tipo === 'entrada' && (!ultimaEntrada[m.sku] || m.fecha > ultimaEntrada[m.sku])) ultimaEntrada[m.sku] = m.fecha;
    });
    var series = {};
    Object.keys(delta).forEach(function (sku) {
      var s = 0;
      series[sku] = delta[sku].map(function (d) { s += d; return s; });
    });
    return { series: series, ultimaEntrada: ultimaEntrada };
  }

  var ORDEN_ESTADO = { agotamiento: 0, vigilar: 1, sobreinventario: 2, normal: 3 };

  function analizar(estado) {
    var N = estado.fechas.length;
    var ex = serieExistencias(estado);
    var info = {}, lista = [];
    var catPorId = {}, uniPorId = {}, provPorId = {};
    estado.categorias.forEach(function (c) { catPorId[c.id] = c; });
    estado.unidades.forEach(function (u) { uniPorId[u.id] = u; });
    estado.proveedores.forEach(function (p) { provPorId[p.id] = p; });

    estado.productos.forEach(function (p) {
      var ventas = estado.ventas[p.sku] || new Array(N).fill(0);
      var serie = ex.series[p.sku];
      var stock = serie[N - 1];
      var v30 = ventas.slice(-30).reduce(function (s, v) { return s + v; }, 0);
      var v90 = ventas.slice(-90).reduce(function (s, v) { return s + v; }, 0);
      var stockProm = media(serie.slice(-30));
      var rotacion = stockProm > 0 ? v30 / stockProm : 0;
      var claseRot = rotacion >= 3 ? 'alta' : rotacion >= 1.5 ? 'media' : 'baja';

      var analisis = F.analizar(ventas);
      var base = { stock: stock, lead: p.tiempoEntrega, cobertura: p.cobertura, nivelServicio: p.nivelServicio, nivelMinimo: p.nivelMinimo, analisis: analisis };
      var rep = F.reponer(base);
      var est = p.activo === false ? 'inactivo' : F.clasificar(base, rep);
      var uni = uniPorId[p.unidadId] || { abrev: 'und', nombre: 'Unidad' };

      info[p.sku] = {
        sku: p.sku, producto: p, categoria: (catPorId[p.categoriaId] || {}).nombre || '—', unidad: uni, proveedor: provPorId[p.proveedorId] || null,
        existencias: stock, serieExistencias: serie, ventas: ventas, ventas30: v30, ventas90: v90, valor90: v90 * p.costo,
        rotacion: rotacion, claseRot: claseRot, analisis: analisis, rep: rep, estado: est,
        ultimaEntrada: ex.ultimaEntrada[p.sku] || null, abc: null, pctAcum: null
      };
      lista.push(info[p.sku]);
    });

    // Clasificación ABC por valor de consumo de los últimos 90 días
    var activos = lista.filter(function (i) { return i.producto.activo !== false; })
      .sort(function (a, b) { return b.valor90 - a.valor90; });
    var total = activos.reduce(function (s, i) { return s + i.valor90; }, 0) || 1;
    var acum = 0;
    activos.forEach(function (i) {
      var antes = acum / total;
      acum += i.valor90;
      i.abc = antes < 0.8 ? 'A' : antes < 0.95 ? 'B' : 'C';
      i.pctAcum = acum / total;
      i.pctValor = i.valor90 / total;
    });

    // textos en lenguaje sencillo
    lista.forEach(function (i) { i.mensaje = mensaje(i); });

    var ordenada = lista.filter(function (i) { return i.estado !== 'inactivo'; }).sort(function (a, b) {
      var d = ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado];
      if (d) return d;
      var ca = a.rep.cobertura == null ? 999 : a.rep.cobertura, cb = b.rep.cobertura == null ? 999 : b.rep.cobertura;
      return a.estado === 'sobreinventario' ? cb - ca : ca - cb;
    });

    var coberturas = ordenada.map(function (i) { return i.rep.cobertura; }).filter(function (c) { return c != null && isFinite(c); }).map(function (c) { return Math.min(c, 120); });
    var cuenta = { agotamiento: 0, vigilar: 0, sobreinventario: 0, normal: 0 };
    ordenada.forEach(function (i) { cuenta[i.estado]++; });
    var resumen = {
      activos: ordenada.length, cuenta: cuenta,
      coberturaMediana: mediana(coberturas),
      rotacionMedia: media(ordenada.map(function (i) { return i.rotacion; })),
      alertas: cuenta.agotamiento + cuenta.sobreinventario,
      requierenAtencion: cuenta.agotamiento + cuenta.vigilar
    };

    // serie agregada para el gráfico del dashboard (últimas 12 semanas)
    var semanas = [];
    for (var w = 11; w >= 0; w--) {
      var fin = N - 1 - w * 7, ini = fin - 6, ventasSem = 0, exis = 0;
      ordenada.forEach(function (i) {
        for (var d = ini; d <= fin; d++) ventasSem += i.ventas[d];
        exis += i.serieExistencias[fin];
      });
      semanas.push({ fin: estado.fechas[fin], ventas: ventasSem, existencias: exis });
    }
    return { info: info, lista: ordenada, todos: lista, resumen: resumen, semanas: semanas, abc: activos };
  }

  function fmt(n, dec) {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: dec == null ? 0 : dec, minimumFractionDigits: 0 }).format(n);
  }
  function cuando(dias) {
    var f = INV.fechas;
    if (dias <= 0) return 'hoy';
    if (dias === 1) return 'mañana';
    return 'hacia el ' + f.corta(f.addDias(f.HOY, dias));
  }

  function mensaje(i) {
    var u = i.unidad.abrev, r = i.rep, p = i.producto;
    if (i.estado === 'inactivo') return 'Producto desactivado: no genera alertas ni recomendaciones.';
    if (r.regla === 'simple') {
      return i.estado === 'vigilar'
        ? 'Está por debajo del nivel mínimo (' + fmt(p.nivelMinimo) + ' ' + u + '). Como hay pocas ventas registradas, el sistema usa una regla simple en lugar de un pronóstico.'
        : 'Hay pocas ventas registradas para pronosticar; el sistema usa el nivel mínimo como referencia.';
    }
    if (i.estado === 'agotamiento') {
      return i.existencias <= 0
        ? 'Está agotado. Con las ventas esperadas (' + fmt(r.mediaDia, 1) + ' ' + u + ' por día) conviene pedir hoy; el proveedor tarda ' + p.tiempoEntrega + ' días.'
        : 'Con las ventas esperadas (' + fmt(r.mediaDia, 1) + ' ' + u + ' por día) se agotaría ' + cuando(r.diasParaAgotar) + '. El proveedor tarda ' + p.tiempoEntrega + ' días en entregar.';
    }
    if (i.estado === 'vigilar') {
      return r.diasParaPedir === 0 || i.existencias <= p.nivelMinimo
        ? 'Ya llegó al punto de reorden (' + fmt(r.pr) + ' ' + u + '). Es buen momento para hacer el pedido y no quedarse corto.'
        : 'Llegará al punto de reorden (' + fmt(r.pr) + ' ' + u + ') ' + cuando(r.diasParaPedir) + '. Conviene preparar el pedido.';
    }
    if (i.estado === 'sobreinventario') {
      return 'Hay para unos ' + fmt(r.cobertura) + ' días de ventas, mucho más de los ' + (p.tiempoEntrega + p.cobertura) + ' que se necesitan. Conviene no comprar más por ahora.';
    }
    return 'Las existencias alcanzan para unos ' + fmt(r.cobertura) + ' días de ventas. No requiere acción.';
  }

  INV.engine = { analizar: analizar, fmt: fmt, cuando: cuando };
  if (typeof module !== 'undefined' && module.exports) module.exports = INV.engine;
})(typeof window !== 'undefined' ? window : globalThis);
