// Exporta los datos de demostración (los mismos del prototipo) a JSON para sembrar la base de datos.
// Uso:  node tools/export_seed.js
const fs = require('fs'), path = require('path');
require(path.join(__dirname, '..', 'frontend', 'js', 'data.js'));
const INV = globalThis.INV;
const b = INV.generarBase();
const salida = {
  hoy: INV.fechas.HOY, dias: INV.fechas.DIAS,
  categorias: b.categorias, unidades: b.unidades, proveedores: b.proveedores,
  productos: b.productos, movimientos: b.movimientos.map(m => ({ sku: m.sku, tipo: m.tipo, cantidad: m.cantidad, fecha: m.fecha, motivo: m.motivo, proveedorId: m.proveedorId, usuario: m.usuario })),
  ventas: b.ventas, pedidos: b.pedidos
};
const destino = path.join(__dirname, '..', 'backend', 'app', 'seed', 'datos_demo.json');
fs.writeFileSync(destino, JSON.stringify(salida));
console.log('Escrito', destino, (fs.statSync(destino).size / 1024).toFixed(0) + ' KB');
