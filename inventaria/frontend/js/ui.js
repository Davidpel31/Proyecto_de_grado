/* =====================================================================
   InventarIA · prototipo
   ui.js — utilidades de interfaz: formato, etiquetas de estado,
   gráficos SVG, ventanas modales y avisos.
   ===================================================================== */
(function (root) {
  'use strict';
  var INV = root.INV = root.INV || {};
  var E = INV.engine, FE = INV.fechas;

  /* ------------------------------- formato ------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var fmtMoneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  function dinero(n) { return fmtMoneda.format(Math.round(n)); }
  function num(n, d) { return E.fmt(n, d); }
  function pct(n, d) { return E.fmt(n * 100, d == null ? 0 : d) + ' %'; }

  function coberturaTexto(rep) {
    if (rep.cobertura == null) return '—';
    if (!isFinite(rep.cobertura) || rep.cobertura > 365) return 'más de un año';
    if (rep.cobertura > 120) return 'más de 120 d';
    return num(rep.cobertura, rep.cobertura < 10 ? 1 : 0) + ' d';
  }

  /* ----------------------------- estados ----------------------------- */
  var ESTADOS = {
    agotamiento: { txt: 'Se agota pronto', cls: 'est-rojo' },
    vigilar: { txt: 'Vigilar', cls: 'est-ambar' },
    sobreinventario: { txt: 'Sobreinventario', cls: 'est-morado' },
    normal: { txt: 'En orden', cls: 'est-verde' },
    inactivo: { txt: 'Inactivo', cls: 'est-gris' }
  };
  function badge(est) {
    var e = ESTADOS[est] || ESTADOS.normal;
    return '<span class="estado ' + e.cls + '"><i aria-hidden="true"></i>' + e.txt + '</span>';
  }
  function badgeInfo(info) {
    var b = badge(info.estado);
    if (info.rep.regla === 'simple' && info.estado !== 'inactivo' && !INV.ui.ocultarPocosDatos) b += ' <span class="chip-mini" title="Hay pocas ventas registradas: se usa una regla simple">pocos datos</span>';
    return b;
  }
  function accionSugerida(i) {
    var u = i.unidad.abrev, r = i.rep;
    if (i.estado === 'inactivo') return 'Producto desactivado';
    if (i.estado === 'sobreinventario') return 'No comprar por ahora';
    if ((i.estado === 'agotamiento' || i.estado === 'vigilar') && r.q > 0) return 'Pedir ' + num(r.q) + ' ' + u + ' ' + E.cuando(r.diasParaPedir == null ? 0 : r.diasParaPedir);
    if (r.q > 0 && r.diasParaPedir != null && r.diasParaPedir <= 7) return 'Pedir ' + num(r.q) + ' ' + u + ' ' + E.cuando(r.diasParaPedir);
    return 'Sin acción';
  }

  /* ------------------------------ gráficos ------------------------------ */
  function escalaY(max) {
    if (max <= 0) return { max: 1, paso: 1 };
    var exp = Math.pow(10, Math.floor(Math.log10(max)));
    var f = max / exp, paso = f <= 1.2 ? 0.2 : f <= 2.5 ? 0.5 : f <= 6 ? 1 : 2;
    paso *= exp;
    return { max: Math.ceil(max / paso) * paso, paso: paso };
  }
  function ruta(puntos) {
    return puntos.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
  }

  // Gráfico del pronóstico: ventas reales + pronóstico con rango probable
  function graficoPronostico(info) {
    var W = 760, H = 300, mi = 44, md = 14, ms = 16, mb = 34;
    var hist = info.ventas.slice(-84), pred = info.analisis.pred, sg = info.analisis.sigma;
    var z80 = 1.2816;
    var sup = pred.map(function (v) { return v + z80 * sg; });
    var inf = pred.map(function (v) { return Math.max(0, v - z80 * sg); });
    var maxV = Math.max.apply(null, hist.concat(sup));
    var ys = escalaY(maxV * 1.05);
    var n = hist.length + pred.length;
    function X(i) { return mi + (W - mi - md) * i / (n - 1); }
    function Y(v) { return ms + (H - ms - mb) * (1 - v / ys.max); }
    var s = '<svg class="grafico" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ventas diarias de los últimos 84 días y pronóstico de los próximos 28 días con su rango probable">';
    for (var v = 0; v <= ys.max + 1e-9; v += ys.paso) {
      s += '<line x1="' + mi + '" x2="' + (W - md) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" class="g-rejilla"/><text x="' + (mi - 6) + '" y="' + (Y(v) + 4) + '" class="g-eje" text-anchor="end">' + num(v, ys.paso < 1 ? 1 : 0) + '</text>';
    }
    // banda del pronóstico
    var ini = hist.length;
    var banda = [];
    pred.forEach(function (p, k) { banda.push([X(ini + k), Y(sup[k])]); });
    for (var k2 = pred.length - 1; k2 >= 0; k2--) banda.push([X(ini + k2), Y(inf[k2])]);
    s += '<path d="' + ruta(banda) + ' Z" class="g-banda"/>';
    // hoy
    s += '<line x1="' + X(ini - 0.5) + '" x2="' + X(ini - 0.5) + '" y1="' + ms + '" y2="' + (H - mb) + '" class="g-hoy"/><text x="' + (X(ini - 0.5) + 5) + '" y="' + (ms + 11) + '" class="g-etiqueta">hoy</text>';
    s += '<path d="' + ruta(hist.map(function (v2, i) { return [X(i), Y(v2)]; })) + '" class="g-linea-real"/>';
    s += '<path d="' + ruta(pred.map(function (v3, k3) { return [X(ini + k3), Y(v3)]; })) + '" class="g-linea-pred"/>';
    // eje x
    var marcas = [0, 21, 42, 63, 83, n - 1];
    marcas.forEach(function (i) {
      var fecha = FE.addDias(FE.HOY, i - (hist.length - 1));
      var ancla = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      s += '<text x="' + X(i) + '" y="' + (H - 12) + '" class="g-eje" text-anchor="' + ancla + '">' + FE.corta(fecha) + '</text>';
    });
    s += '</svg>';
    return s;
  }

  // Gráfico del dashboard: ventas por semana y existencias totales (12 semanas)
  function graficoSemanas(semanas) {
    var W = 560, H = 240, mi = 46, md = 92, ms = 14, mb = 30;
    var max = Math.max.apply(null, semanas.map(function (s) { return Math.max(s.ventas, s.existencias); }));
    var ys = escalaY(max * 1.05), n = semanas.length;
    function X(i) { return mi + (W - mi - md) * i / (n - 1); }
    function Y(v) { return ms + (H - ms - mb) * (1 - v / ys.max); }
    var s = '<svg class="grafico" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Existencias totales y ventas semanales de las últimas 12 semanas">';
    for (var v = 0; v <= ys.max + 1e-9; v += ys.paso) {
      s += '<line x1="' + mi + '" x2="' + (W - md) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" class="g-rejilla"/><text x="' + (mi - 6) + '" y="' + (Y(v) + 4) + '" class="g-eje" text-anchor="end">' + num(v) + '</text>';
    }
    var pe = semanas.map(function (w, i) { return [X(i), Y(w.existencias)]; });
    var pv = semanas.map(function (w, i) { return [X(i), Y(w.ventas)]; });
    s += '<path d="' + ruta(pe) + '" class="g-linea-exist"/><path d="' + ruta(pv) + '" class="g-linea-real"/>';
    var ult = n - 1;
    s += '<text x="' + (X(ult) + 8) + '" y="' + (Y(semanas[ult].existencias) + 4) + '" class="g-etiqueta g-et-exist">Existencias</text>';
    s += '<text x="' + (X(ult) + 8) + '" y="' + (Y(semanas[ult].ventas) + 4) + '" class="g-etiqueta g-et-ventas">Ventas</text>';
    [0, 4, 8, 11].forEach(function (i) { s += '<text x="' + X(i) + '" y="' + (H - 10) + '" class="g-eje" text-anchor="middle">' + FE.corta(semanas[i].fin) + '</text>'; });
    return s + '</svg>';
  }

  // Barra apilada ABC
  function barraABC(abc) {
    var conteo = { A: 0, B: 0, C: 0 }, valor = { A: 0, B: 0, C: 0 }, tot = 0;
    abc.forEach(function (i) { conteo[i.abc]++; valor[i.abc] += i.valor90; tot += i.valor90; });
    tot = tot || 1;
    var html = '<div class="abc-barra" role="img" aria-label="Participación en el valor vendido: A ' + pct(valor.A / tot) + ', B ' + pct(valor.B / tot) + ', C ' + pct(valor.C / tot) + '">';
    ['A', 'B', 'C'].forEach(function (c) {
      html += '<span class="abc-' + c.toLowerCase() + '" style="flex:' + Math.max(valor[c] / tot, 0.08).toFixed(3) + '">' + c + '</span>';
    });
    html += '</div><ul class="abc-leyenda">';
    ['A', 'B', 'C'].forEach(function (c) {
      html += '<li><strong>Clase ' + c + '</strong>: ' + conteo[c] + ' productos · ' + pct(valor[c] / tot) + ' del valor vendido</li>';
    });
    return html + '</ul>';
  }

  /* ------------------------------ modales ------------------------------ */
  function abrirModal(opciones) {
    var dlg = document.createElement('dialog');
    dlg.className = 'modal';
    dlg.innerHTML =
      '<form method="dialog" novalidate>' +
      '<header><h2>' + esc(opciones.titulo) + '</h2><button type="button" class="btn-cerrar" aria-label="Cerrar">×</button></header>' +
      '<div class="modal-cuerpo">' + opciones.cuerpo + '</div>' +
      '<p class="error-form" role="alert" hidden></p>' +
      '<footer><button type="button" class="btn btn-quiet" data-cancelar>Cancelar</button><button type="submit" class="btn btn-primary">' + esc(opciones.accion || 'Guardar') + '</button></footer>' +
      '</form>';
    document.body.appendChild(dlg);
    function cerrar() { try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); } if (dlg.parentNode) dlg.parentNode.removeChild(dlg); }
    dlg.querySelector('.btn-cerrar').addEventListener('click', cerrar);
    dlg.querySelector('[data-cancelar]').addEventListener('click', cerrar);
    dlg.addEventListener('cancel', function (ev) { ev.preventDefault(); cerrar(); });
    dlg.querySelector('form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var datos = {};
      Array.prototype.forEach.call(ev.target.elements, function (el) {
        if (!el.name) return;
        if (el.type === 'checkbox') datos[el.name] = el.checked;
        else if (el.type === 'radio') { if (el.checked) datos[el.name] = el.value; }
        else datos[el.name] = el.value;
      });
      var caja = dlg.querySelector('.error-form'), boton = dlg.querySelector('button[type=submit]');
      var res;
      try { res = opciones.alGuardar(datos); } catch (e) { res = e.message; }
      boton.disabled = true;
      // alGuardar puede devolver un texto de error, nada, o una promesa (cuando habla con el servidor)
      Promise.resolve(res).then(function (err) {
        boton.disabled = false;
        if (err) { caja.textContent = err; caja.hidden = false; return; }
        cerrar();
      }).catch(function (e) { boton.disabled = false; caja.textContent = e.message; caja.hidden = false; });
    });
    try { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); } catch (e) { dlg.setAttribute('open', ''); }
    var primero = dlg.querySelector('input:not([type=hidden]),select,textarea');
    if (primero) primero.focus();
    return dlg;
  }

  /* ------------------------------- avisos ------------------------------- */
  function aviso(mensaje, tipo) {
    var cont = document.getElementById('avisos');
    if (!cont) return;
    var d = document.createElement('div');
    d.className = 'aviso ' + (tipo || 'ok');
    d.textContent = mensaje;
    cont.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 5200);
  }

  INV.ui = { esc: esc, dinero: dinero, num: num, pct: pct, coberturaTexto: coberturaTexto, ESTADOS: ESTADOS, badge: badge, badgeInfo: badgeInfo,
    accionSugerida: accionSugerida, graficoPronostico: graficoPronostico, graficoSemanas: graficoSemanas, barraABC: barraABC,
    abrirModal: abrirModal, aviso: aviso };
})(typeof window !== 'undefined' ? window : globalThis);
