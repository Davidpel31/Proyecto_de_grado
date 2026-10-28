// Simulación retrospectiva de políticas de reposición.
//
// Pregunta del jurado: «¿qué demostraría que su recomendación supera una regla sencilla de reposición?»
//
// Procedimiento (el mismo que se aplicará con los datos del negocio piloto):
//   1. Se toman las últimas 56 días (8 semanas) de ventas de cada producto.
//   2. Cada política decide, al cierre de cada día y SOLO con lo ocurrido hasta ese día, si pide y cuánto.
//   3. Los pedidos llegan después del tiempo de entrega del proveedor y respetan mínimo y múltiplo de pedido.
//   4. Se mide, igual para todas: días con faltante, % de demanda atendida, inventario promedio (en pesos) y pedidos.
//
// Políticas comparadas:
//   A. Mínimo fijo        : si existencias + pedidos pendientes <= nivel mínimo, pedir hasta el doble del mínimo
//                           (la regla que el sistema usa cuando no hay pronóstico).
//   B. Promedio móvil     : punto de reorden = ventas promedio de 28 días × (entrega + 3 días); pedir hasta
//                           ventas promedio × (entrega + cobertura). Es una regla sencilla pero adaptativa.
//   C. Pronóstico (InventarIA): SS = z·σ·√L, PR = demanda esperada en la entrega + SS, Q ajustado a mínimo y múltiplo.
//
// ADVERTENCIA: con los datos de demostración (sintéticos) esto solo prueba que el procedimiento funciona.
// La conclusión sobre el negocio real depende de repetirlo con las ventas del piloto.
//
// Uso:  node tools/simulacion_politicas.js
const path = require('path');
const raiz = path.join(__dirname, '..', 'frontend', 'js');
require(path.join(raiz, 'data.js'));
require(path.join(raiz, 'forecast.js'));
require(path.join(raiz, 'engine.js'));
const INV = globalThis.INV, F = INV.forecast;

const DIAS_SIM = 56;
const ajustarLote = (q, minimo, multiplo) => {
  if (q <= 0) return 0;
  q = Math.max(q, minimo || 1);
  multiplo = Math.max(1, multiplo || 1);
  return Math.ceil(q / multiplo) * multiplo;
};
const media = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

INV.Store.iniciar();
const e = INV.Store.estado;
const N = e.fechas.length;

// existencias al cierre de cada día (para arrancar la simulación con las existencias reales de ese día)
const idx = {}; e.fechas.forEach((f, i) => { idx[f] = i; });
const delta = {}; e.productos.forEach((p) => { delta[p.sku] = new Array(N).fill(0); });
e.movimientos.forEach((m) => { const i = idx[m.fecha]; if (i !== undefined) delta[m.sku][i] += m.tipo === 'salida' ? -m.cantidad : m.cantidad; });
const cierre = {};
Object.keys(delta).forEach((sku) => { let s = 0; cierre[sku] = delta[sku].map((d) => (s += d)); });

function politica(nombre, p, ventas, d, stock, pendientes) {
  const L = p.tiempoEntrega, C = p.cobertura;
  const enCamino = pendientes.reduce((s, x) => s + x.cantidad, 0);
  const posicion = stock + enCamino;
  if (nombre === 'A') {
    return posicion <= p.nivelMinimo ? ajustarLote(2 * p.nivelMinimo - posicion, p.minimoPedido, p.multiploPedido) : 0;
  }
  if (nombre === 'B') {
    const m = media(ventas.slice(d - 27, d + 1));
    const pr = m * (L + 3);
    return posicion <= pr ? ajustarLote(m * (L + C) - posicion, p.minimoPedido, p.multiploPedido) : 0;
  }
  // C: pronóstico con la información disponible hasta el día d (inclusive)
  const hist = ventas.slice(0, d + 1);
  const analisis = F.analizar(hist, null);
  const ped = pendientes.map((x) => ({ cantidad: x.cantidad, dias: Math.max(0, x.llega - d - 1) }));
  const rep = F.reponer({ stock, lead: L, cobertura: C, nivelServicio: p.nivelServicio, nivelMinimo: p.nivelMinimo, analisis,
    pedidos: ped, minimoPedido: p.minimoPedido, multiploPedido: p.multiploPedido });
  return rep.diasParaPedir === 0 && rep.q > 0 ? rep.q : 0;
}

const nombres = { A: 'A. Mínimo fijo (nivel mínimo × 2)', B: 'B. Promedio móvil 28 d', C: 'C. Pronóstico (InventarIA)' };
const acum = { A: {}, B: {}, C: {} };
Object.keys(acum).forEach((k) => { acum[k] = { diasProd: 0, diasFaltante: 0, demanda: 0, perdida: 0, valorInv: 0, pedidos: 0, unidadesPedidas: 0 }; });
const porProducto = [];

e.productos.forEach((p) => {
  const ventas = e.ventas[p.sku];
  const inicio = N - DIAS_SIM;
  const fila = { sku: p.sku, nombre: p.nombre };
  ['A', 'B', 'C'].forEach((pol) => {
    let stock = cierre[p.sku][inicio - 1];
    const llegadas = [];            // {llega, cantidad}
    const r = acum[pol];
    let faltantes = 0, perdida = 0, demandaTot = 0, valor = 0, pedidos = 0;
    for (let d = inicio; d < N; d++) {
      // 1) llegan pedidos
      for (let k = llegadas.length - 1; k >= 0; k--) if (llegadas[k].llega === d) { stock += llegadas[k].cantidad; llegadas.splice(k, 1); }
      // 2) se vende lo que hay
      const dem = ventas[d], vendido = Math.min(stock, dem);
      stock -= vendido; demandaTot += dem; perdida += dem - vendido;
      if (dem > vendido) faltantes++;
      valor += stock * p.costo;
      // 3) al cierre, la política decide
      const q = politica(pol, p, ventas, d, stock, llegadas);
      if (q > 0) { llegadas.push({ llega: d + p.tiempoEntrega, cantidad: q }); pedidos++; r.unidadesPedidas += q; }
    }
    r.diasProd += DIAS_SIM; r.diasFaltante += faltantes; r.demanda += demandaTot; r.perdida += perdida; r.valorInv += valor / DIAS_SIM; r.pedidos += pedidos;
    fila[pol] = { faltantes, atendida: demandaTot ? 1 - perdida / demandaTot : 1, inv: valor / DIAS_SIM, pedidos };
  });
  porProducto.push(fila);
});

const pesos = (n) => '$ ' + Math.round(n).toLocaleString('es-CO');
const pct = (n) => (n * 100).toFixed(1).replace('.', ',') + ' %';
console.log('Simulación retrospectiva: últimos ' + DIAS_SIM + ' días, ' + e.productos.length + ' productos (datos de demostración)\n');
console.log('Política'.padEnd(36) + 'Días con faltante'.padEnd(22) + 'Demanda atendida'.padEnd(20) + 'Inventario prom.'.padEnd(20) + 'Pedidos');
const resumen = {};
['A', 'B', 'C'].forEach((k) => {
  const r = acum[k];
  resumen[k] = { diasFaltante: r.diasFaltante, pctDiasFaltante: r.diasFaltante / r.diasProd, demandaAtendida: 1 - r.perdida / r.demanda, inventarioPromedio: r.valorInv, pedidos: r.pedidos };
  console.log(nombres[k].padEnd(36) + (r.diasFaltante + ' (' + pct(r.diasFaltante / r.diasProd) + ')').padEnd(22) + pct(1 - r.perdida / r.demanda).padEnd(20) + pesos(r.valorInv).padEnd(20) + r.pedidos);
});
const out = path.join(__dirname, 'resultado_simulacion.json');
require('fs').writeFileSync(out, JSON.stringify({ diasSimulados: DIAS_SIM, productos: e.productos.length, resumen, porProducto }, null, 1));
console.log('\nDetalle por producto en', out);
