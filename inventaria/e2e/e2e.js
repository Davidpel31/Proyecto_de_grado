const chromium = require('@sparticuz/chromium').default || require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:8000';
const errs = [], pasos = [];
const ok = (c, m) => { pasos.push((c ? 'OK    ' : 'FALLA ') + m); console.log((c ? 'OK    ' : 'FALLA ') + m); if (!c) errs.push(m); };
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: 'shell' });
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|fonts/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url(); if (u.startsWith(BASE) || u.startsWith('data:')) r.continue(); else r.abort(); });
  await page.setViewport({ width: 900, height: 1000, deviceScaleFactor: 1.5 });
  const shot = async (n) => { const el = (await page.$('main')) || (await page.$('.login')); await el.screenshot({ path: '../docs/evidencia/' + n + '.png' }); };
  const texto = (sel) => page.$eval(sel, e => e.textContent.trim()).catch(() => '');
  const ir = async (h) => { await page.evaluate(x => { location.hash = x; }, '#' + h); await esperar(450); };
  const login = async (u, c) => {
    await page.type('input[name=usuario]', u); await page.type('input[name=clave]', c);
    await page.click('#form-login button[type=submit]'); await esperar(1500);
  };
  const api = (ruta, token) => page.evaluate(async (r, t) => (await fetch(r, { headers: { Authorization: 'Bearer ' + t } })).json(), ruta, token);
  const tokenAct = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('inventaria-sesion')).token);
  const stockDe = async (sku) => (await api('/api/estado', await tokenAct())).productos.find(p => p.sku === sku).existencias;

  // 1. pantalla de inicio de sesión (modo servidor)
  await page.goto(BASE + '/', { waitUntil: 'load' }); await esperar(600);
  ok(!!(await page.$('#form-login')), 'se muestra el formulario de inicio de sesión (modo servidor)');
  await shot('01-login');

  // 2. credenciales incorrectas
  await page.type('input[name=usuario]', 'admin'); await page.type('input[name=clave]', 'mala');
  await page.click('#form-login button[type=submit]'); await esperar(900);
  ok(/incorrectos/.test(await texto('#login-error')), 'clave incorrecta: ' + await texto('#login-error'));
  await page.evaluate(() => { document.querySelector('input[name=clave]').value = ''; document.querySelector('input[name=usuario]').value = ''; });

  // 3. OPERATIVO: registra ventas (flujo principal)
  await login('operativo', 'operativo123');
  ok(/Registrar movimiento/.test(await texto('main h1')), 'el operativo inicia en Registrar movimiento');
  ok(!(await page.$('input[name=tipo][value=ajuste]')), 'el operativo no tiene la opción de ajuste');
  const antes = await stockDe('ARR-500');
  await ir('/movimientos/nuevo?sku=ARR-500&tipo=salida');
  await shot('02-operativo-registrar');
  await page.click('input[name=tipo][value=salida]');
  await page.type('#m-cant', '999');
  await page.click('#form-mov button[type=submit]'); await esperar(600);
  ok(!(await page.$eval('#m-error', e => e.hidden)), 'salida mayor al stock: ' + await texto('#m-error'));
  await shot('03-salida-rechazada');
  await page.$eval('#m-cant', e => { e.value = ''; });
  await page.type('#m-cant', '5');
  await page.click('#form-mov button[type=submit]'); await esperar(1200);
  ok(/Salida registrada/.test(await texto('.banner-ok')), 'salida válida confirmada: ' + (await texto('.banner-ok')).slice(0, 90));
  const despues = await stockDe('ARR-500');
  ok(despues === antes - 5, `existencias en la base de datos: ${antes} → ${despues}`);
  await shot('04-salida-registrada');
  await ir('/movimientos/historial?sku=ARR-500');
  ok(/Ventas|Salida|Salida de inventario/.test(await texto('#h-tabla')), 'el movimiento aparece en el historial');
  await shot('05-historial');
  await ir('/dashboard');
  ok(/Solo para el administrador/.test(await texto('main h1')), 'el operativo no entra al dashboard');
  await page.evaluate(() => document.getElementById('cambiar-rol').click()); await esperar(500);

  // 4. ADMIN: ve el análisis, registra un pedido, lo recibe
  await login('admin', 'admin123');
  ok(/Buenos días/.test(await texto('main h1')), 'el administrador ve el dashboard');
  await shot('06-dashboard-admin');
  await ir('/analisis/pronostico/ARR-500'); await shot('07-pronostico-arroz');
  ok(/pedidas que llegan|pedidas/.test(await texto('.recomendacion')) || /pedido/.test(await texto('.recomendacion')), 'la recomendación considera el pedido pendiente del arroz');
  await ir('/analisis/pronostico/CAF-250');
  const botonPedir = await page.$('[data-pedir]');
  ok(!!botonPedir, 'hay botón para registrar el pedido recomendado de café');
  const pend0 = (await api('/api/estado', await tokenAct())).pedidos.filter(p => p.estado === 'pendiente').length;
  if (botonPedir) { await botonPedir.click(); await esperar(1200); }
  const pend1 = (await api('/api/estado', await tokenAct())).pedidos.filter(p => p.estado === 'pendiente').length;
  ok(pend1 === pend0 + 1, `pedido registrado en el servidor (pendientes ${pend0} → ${pend1})`);
  await ir('/pedidos'); await shot('08-pedidos');
  const stockLec = await stockDe('LEC-1L');
  const recibir = await page.$('[data-recibir="P0003"]');
  if (recibir) { await recibir.click(); await esperar(1300); }
  const stockLec2 = await stockDe('LEC-1L');
  ok(stockLec2 === stockLec + 240, `recibir el pedido P0003 sumó 240 a la leche (${stockLec} → ${stockLec2})`);
  await ir('/analisis/recomendaciones'); await shot('09-recomendaciones');

  // 5. importación de ventas validada por el servidor
  await ir('/importar'); await page.click('#i-ejemplo'); await esperar(500);
  ok((await page.$$('#i-resultado tbody tr')).length === 5, 'la validación muestra 5 filas con error');
  await shot('10-importacion-validada');
  await page.click('#i-confirmar'); await esperar(1500);
  ok(/Importación lista/.test(await texto('#i-resultado')), 'la importación se aplicó en el servidor');
  ok(true, 'pasos: ' + pasos.length);

  console.log('\nERRORES:', errs.length ? '\n' + errs.join('\n') : 'ninguno');
  require('fs').writeFileSync('resultado-e2e.txt', pasos.join('\n') + '\n\nERRORES: ' + (errs.length ? errs.join(' | ') : 'ninguno') + '\n');
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('FALLO', e); process.exit(2); });
