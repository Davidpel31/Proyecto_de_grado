/* =====================================================================
   InventarIA · prototipo
   forecast.js — pronóstico de demanda, métricas y reglas de reposición

   IMPORTANTE: en el prototipo las técnicas están escritas en JavaScript y
   son versiones simplificadas. En la versión 1.0 este módulo se reemplaza
   por un servicio en Python (statsmodels, Prophet, etc.) que el frontend
   consulta a través de la API. Las reglas de reposición (punto de reorden,
   stock de seguridad) sí son las mismas que se documentaron en el proyecto.
   ===================================================================== */
(function (root) {
  'use strict';
  var INV = root.INV = root.INV || {};

  /* ------------------------ utilidades numéricas ------------------------ */
  function suma(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function media(a) { return a.length ? suma(a) / a.length : 0; }
  function llenar(n, v) { var o = new Array(n); for (var i = 0; i < n; i++) o[i] = v; return o; }

  /* ----------------------------- técnicas ----------------------------- */
  // 1) Línea base: promedio móvil de 14 días
  function promedioMovil(train, h) {
    var w = Math.min(14, train.length);
    return llenar(h, media(train.slice(-w)));
  }

  // 2) Suavizado exponencial de Holt-Winters (aditivo, tendencia amortiguada, periodo semanal)
  function hwAjustar(y, m, alpha, beta, gamma, phi) {
    var n = y.length;
    var l = media(y.slice(0, m));
    var b = (media(y.slice(m, 2 * m)) - media(y.slice(0, m))) / m;
    var s = [], i;
    for (i = 0; i < m; i++) s.push(y[i] - l);
    var sse = 0;
    for (var t = m; t < n; t++) {
      var est = s[t % m];
      var pred = l + phi * b + est;
      var e = y[t] - pred;
      sse += e * e;
      var lNuevo = alpha * (y[t] - est) + (1 - alpha) * (l + phi * b);
      var bNuevo = beta * (lNuevo - l) + (1 - beta) * phi * b;
      s[t % m] = gamma * (y[t] - lNuevo) + (1 - gamma) * est;
      l = lNuevo; b = bNuevo;
    }
    return { l: l, b: b, s: s, sse: sse, n: n };
  }
  function holtWinters(train, h) {
    var m = 7, phi = 0.9;
    var y = train.length > 140 ? train.slice(-140) : train;
    if (y.length < 2 * m) return promedioMovil(train, h);
    var mejor = null;
    var alphas = [0.05, 0.15, 0.3], betas = [0, 0.05, 0.1], gammas = [0.05, 0.2, 0.4];
    for (var a = 0; a < alphas.length; a++) for (var b = 0; b < betas.length; b++) for (var g = 0; g < gammas.length; g++) {
      var f = hwAjustar(y, m, alphas[a], betas[b], gammas[g], phi);
      if (!mejor || f.sse < mejor.sse) mejor = f;
    }
    var out = [], acum = 0;
    for (var k = 1; k <= h; k++) {
      acum += Math.pow(phi, k);
      var v = mejor.l + acum * mejor.b + mejor.s[(mejor.n + k - 1) % m];
      out.push(Math.max(0, v));
    }
    return out;
  }

  // 3) Modelo aditivo: tendencia lineal + estacionalidad semanal (idea similar a Prophet, simplificada)
  function modeloAditivo(train, h) {
    var n = Math.min(train.length, 112);
    var y = train.slice(-n);
    var off = train.length - n;
    var est = [0, 0, 0, 0, 0, 0, 0], a = 0, b = 0, i, it;
    for (it = 0; it < 6; it++) {
      var sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (i = 0; i < n; i++) {
        var z = y[i] - est[(off + i) % 7];
        sx += i; sy += z; sxx += i * i; sxy += i * z;
      }
      var den = n * sxx - sx * sx;
      b = den ? (n * sxy - sx * sy) / den : 0;
      a = (sy - b * sx) / n;
      var acc = [0, 0, 0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0, 0, 0];
      for (i = 0; i < n; i++) { var d = (off + i) % 7; acc[d] += y[i] - (a + b * i); cnt[d]++; }
      var mm = 0;
      for (var d2 = 0; d2 < 7; d2++) { est[d2] = cnt[d2] ? acc[d2] / cnt[d2] : 0; mm += est[d2]; }
      mm /= 7;
      for (var d3 = 0; d3 < 7; d3++) est[d3] -= mm;
    }
    var tope = media(y) / 60;           // evita pendientes exageradas
    b = Math.max(-tope, Math.min(tope, b));
    a = media(y) - b * (n - 1) / 2;
    var out = [];
    for (var k = 0; k < h; k++) out.push(Math.max(0, a + b * (n + k) + est[(off + n + k) % 7]));
    return out;
  }

  // 4) Croston con corrección SBA: para ventas esporádicas (muchos días en cero)
  function croston(train, h) {
    var alpha = 0.1, z = 0, p = 1, q = 1, inicio = false;
    for (var i = 0; i < train.length; i++) {
      if (train[i] > 0) {
        if (!inicio) { z = train[i]; p = q; inicio = true; }
        else { z += alpha * (train[i] - z); p += alpha * (q - p); }
        q = 1;
      } else q++;
    }
    var f = inicio ? (1 - alpha / 2) * z / p : 0;
    return llenar(h, f);
  }

  var TECNICAS = {
    base:    { id: 'base',    nombre: 'Promedio móvil de 14 días (línea base)', corto: 'Promedio móvil (base)', fn: promedioMovil },
    ets:     { id: 'ets',     nombre: 'Suavizado exponencial (Holt-Winters)', corto: 'Suavizado exponencial', fn: holtWinters },
    aditivo: { id: 'aditivo', nombre: 'Modelo aditivo con tendencia y estacionalidad semanal (tipo Prophet, simplificado)', corto: 'Modelo aditivo (tipo Prophet)', fn: modeloAditivo },
    croston: { id: 'croston', nombre: 'Croston con corrección SBA (ventas esporádicas)', corto: 'Croston / SBA', fn: croston }
  };

  /* --------------------------- evaluación --------------------------- */
  // Validación fuera de muestra: se entrena con el pasado y se compara con la semana siguiente,
  // repitiendo en 4 ventanas (origen móvil).
  function evaluar(serie, fn) {
    var n = serie.length, origenes = [n - 28, n - 21, n - 14, n - 7];
    var errores = [], reales = [];
    origenes.forEach(function (o) {
      var f = fn(serie.slice(0, o), 7);
      for (var i = 0; i < 7; i++) { errores.push(serie[o + i] - f[i]); reales.push(serie[o + i]); }
    });
    var absE = errores.map(Math.abs);
    var mae = media(absE);
    var rmse = Math.sqrt(media(errores.map(function (e) { return e * e; })));
    var sumR = suma(reales);
    var wape = sumR > 0 ? suma(absE) / sumR : null;
    var base = serie.slice(0, n - 7), esc = [];
    for (var t = 7; t < base.length; t++) esc.push(Math.abs(base[t] - base[t - 7]));
    var escala = media(esc);
    var mase = escala > 0 ? mae / escala : null;
    return { mae: mae, rmse: rmse, wape: wape, mase: mase };
  }

  function analizar(serie) {
    var n = serie.length;
    var ult90 = serie.slice(-90);
    var conVenta = ult90.filter(function (v) { return v > 0; }).length;
    if (n < 56 || conVenta < 10) return { suficiente: false, motivo: 'Hay muy pocas ventas registradas para pronosticar con confianza (se necesitan al menos 10 días con ventas en los últimos 90).' };
    var intermitente = (1 - conVenta / ult90.length) >= 0.4;
    var lista = [TECNICAS.base, TECNICAS.ets, TECNICAS.aditivo];
    if (intermitente) lista.push(TECNICAS.croston);
    var resultados = lista.map(function (t) {
      return { id: t.id, nombre: t.nombre, corto: t.corto, metricas: evaluar(serie, t.fn), fn: t.fn };
    });
    var mejor = resultados.slice().sort(function (a, b) {
      var ma = a.metricas.mase == null ? Infinity : a.metricas.mase;
      var mb = b.metricas.mase == null ? Infinity : b.metricas.mase;
      return ma !== mb ? ma - mb : a.metricas.mae - b.metricas.mae;
    })[0];
    var pred = mejor.fn(serie, 28);
    var sigma = Math.max(0.3, mejor.metricas.rmse);
    return {
      suficiente: true, intermitente: intermitente, tecnicas: resultados.map(function (r) { return { id: r.id, nombre: r.nombre, corto: r.corto, metricas: r.metricas, elegida: r.id === mejor.id }; }),
      mejorId: mejor.id, mejorNombre: mejor.nombre, pred: pred, sigma: sigma,
      diasConDatos: n, diasConVenta: conVenta
    };
  }

  /* --------------------------- reposición --------------------------- */
  var Z = { 0.9: 1.2816, 0.95: 1.6449, 0.975: 1.96, 0.99: 2.3263 };

  function extender(pred, n) {
    var out = pred.slice(), ref = media(pred.slice(-7));
    while (out.length < n) out.push(ref);
    return out;
  }
  function acumulada(pred) {
    var c = [0];
    for (var i = 0; i < pred.length; i++) c.push(c[i] + pred[i]);
    return c;
  }

  // Reglas documentadas en el proyecto (sección 10.1):
  //   SS  = z · σ · √L
  //   PR  = demanda pronosticada durante la entrega + SS
  //   Q   = demanda pronosticada durante (entrega + cobertura) + SS − existencias
  function reponer(o) {
    var L = o.lead, C = o.cobertura;
    if (!o.analisis || !o.analisis.suficiente) {
      var bajo = o.stock <= o.nivelMinimo;
      return { regla: 'simple', pr: o.nivelMinimo, ss: null, q: bajo ? Math.max(0, 2 * o.nivelMinimo - o.stock) : 0,
        diasParaPedir: bajo ? 0 : null, diasParaAgotar: o.stock <= 0 ? 0 : null, cobertura: null, mediaDia: null };
    }
    var z = Z[o.nivelServicio] || Z[0.95];
    var H = Math.max(35, L + C + 3);
    var pred = extender(o.analisis.pred, H), c = acumulada(pred);
    var ss = z * o.analisis.sigma * Math.sqrt(L);
    var pr = c[L] + ss;
    var q = Math.max(0, Math.ceil(c[L + C] + ss - o.stock));
    var k, diasPedir = null, diasAgotar = null;
    if (o.stock <= pr) diasPedir = 0;
    else for (k = 1; k <= H; k++) if (o.stock - c[k] <= pr) { diasPedir = Math.max(0, k - 1); break; }
    if (o.stock <= 0) diasAgotar = 0;
    else for (k = 1; k <= H; k++) if (o.stock - c[k] <= 0) { diasAgotar = k - 1; break; }
    var mediaDia = c[28] / 28;
    return {
      regla: 'pronostico', z: z, pr: pr, ss: ss, q: q, diasParaPedir: diasPedir, diasParaAgotar: diasAgotar,
      cobertura: mediaDia > 0.01 ? o.stock / mediaDia : Infinity, mediaDia: mediaDia,
      demandaEntrega: c[L], demandaCobertura: c[L + C]
    };
  }

  // Estado del producto para el semáforo: agotamiento / vigilar / sobreinventario / normal
  function clasificar(o, rep) {
    if (o.stock <= 0) return 'agotamiento';
    if (rep.regla === 'simple') return o.stock <= o.nivelMinimo ? 'vigilar' : 'normal';
    // se agotaría antes de que alcance a llegar un pedido hecho hoy
    if (rep.diasParaAgotar != null && rep.diasParaAgotar <= o.lead) return 'agotamiento';
    // ya está en el punto de reorden, o lo alcanzará en los próximos 3 días
    if (o.stock <= o.nivelMinimo || (rep.diasParaPedir != null && rep.diasParaPedir <= 3)) return 'vigilar';
    if (rep.cobertura > Math.max(90, 3 * (o.lead + o.cobertura))) return 'sobreinventario';
    return 'normal';
  }

  INV.forecast = { analizar: analizar, reponer: reponer, clasificar: clasificar, TECNICAS: TECNICAS, Z: Z, media: media, suma: suma };
  if (typeof module !== 'undefined' && module.exports) module.exports = INV.forecast;
})(typeof window !== 'undefined' ? window : globalThis);
