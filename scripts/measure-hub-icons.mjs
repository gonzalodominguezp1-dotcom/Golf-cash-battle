// Mide EN PÍXELES (render real en Chrome headless) dónde queda cada icono del hub, para fijar ICON_NUDGE y la tabla
// VISIBLE_BOX de tests/hub-icon-centering.test.js.
//
// Uso (desde la raíz):  node scripts/measure-hub-icons.mjs [--out <carpeta de capturas>] [--json]
//   - Sin --out no guarda capturas. Las capturas de diagnóstico NO deben ir al repo.
//   - --json imprime también la tabla lista para pegar (ICON_NUDGE y VISIBLE_BOX).
// Requiere Node >=22 (WebSocket global) y Chrome/Edge (o CHROME_PATH). No necesita Vite.
//
// Parte 1 (icono puro): cada icono con icon(name,{size:256}) se dibuja en un canvas (sin filtros CSS) y se mide, en unidades
//   del viewBox (51 unidades = 256 px; el centro del lienzo es 24,5): (a) caja de píxeles con alfa > 40, (b) centro de masa
//   ponderado por alfa, (c) caja del color principal (sin los píxeles casi negros de contorno/extrusión, luminancia < 60).
// Parte 2 (recuadro real): el mismo marcado que hub.js con el hub.css real, a 78 px (accesos) o el tamaño de herramienta; se
//   captura con y sin el svg (visibility) y la diferencia da la caja del icono dentro del recuadro, con y sin el drop-shadow.
//   Informa los márgenes izquierdo/derecho/superior/inferior en px CSS. Usa el ICON_NUDGE y el hub.css actuales.
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (Number(process.versions.node.split('.')[0]) < 22 || typeof WebSocket === 'undefined') {
  console.error(`Este script necesita Node >=22 (WebSocket global); tienes ${process.versions.node}.`);
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outDir = args.includes('--out') ? resolve(args[args.indexOf('--out') + 1]) : null;
const wantJson = args.includes('--json');
const { icon } = await import(pathToFileURL(resolve(root, 'src/ui/icons.js')).href);
const { ICON_NUDGE, nudgeVars } = await import(pathToFileURL(resolve(root, 'src/screens/hubRules.js')).href);
const { iconBounds } = await import(pathToFileURL(resolve(root, 'tests/helpers/svgBounds.js')).href);

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

// Iconos del hub tal y como los pinta el hub (tono incluido).
const HUB = [
  { name: 'trophy' }, { name: 'medal', opts: { tone: 'gold' } }, { name: 'skins' }, { name: 'users' }, { name: 'map' },
  { name: 'robot' }, { name: 'gear', tool: true }, { name: 'fullscreen', tool: true }, { name: 'user' }, { name: 'coins' },
  { name: 'lock' }, { name: 'chains' },
];
const ALPHA = 40, LUM = 60, PX = 256, UNIT = 256 / 51, C = 24.5;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

function freePort() {
  return new Promise((ok, fail) => {
    const s = createNetServer();
    s.on('error', fail);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
  });
}

let browser = null, browserExited = null, profile = null, cleaned = null;

// Idempotente: mata el árbol de Chrome, lo que cuelgue del perfil temporal (nombre único de esta ejecución) y borra el perfil.
function cleanup() {
  cleaned ??= (async () => {
    if (browser && !browserExited) {
      const exited = new Promise((ok) => browser.once('exit', ok));
      try {
        if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
        else browser.kill('SIGKILL');
      } catch { /* ya muerto */ }
      await Promise.race([exited, sleep(5000)]);
    }
    if (profile && process.platform === 'win32') {
      const ps = `Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'chrome.exe','msedge.exe' -and $_.CommandLine -like '*${profile.replaceAll("'", "''")}*' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }`;
      spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
      await sleep(500);
    } else if (profile) {
      spawnSync('pkill', ['-9', '-f', profile], { stdio: 'ignore' });
    }
    if (profile) {
      try { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch (e) { console.warn(`No pude borrar el perfil temporal ${profile}: ${e.message}`); }
    }
  })();
  return cleaned;
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup().finally(() => process.exit(130)); });

function connect(wsUrl) {
  return new Promise((ok, fail) => {
    const ws = new WebSocket(wsUrl);
    let n = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      m.error ? p.fail(new Error(JSON.stringify(m.error))) : p.ok(m.result);
    };
    ws.onerror = () => fail(new Error('error en la conexión con Chrome'));
    ws.onclose = () => { for (const p of pending.values()) p.fail(new Error('conexión con Chrome cerrada')); pending.clear(); };
    ws.onopen = () => ok({
      send: (method, params = {}) => new Promise((res, rej) => {
        const id = ++n;
        pending.set(id, { ok: res, fail: rej });
        ws.send(JSON.stringify({ id, method, params }));
      }),
      close: () => ws.close(),
    });
  });
}

async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

// ---- análisis en la página (se serializa con toString) ----
async function pagePure(items, px, alphaT, lumT) {
  const out = {};
  for (const it of items) {
    const img = new Image();
    img.src = `data:image/svg+xml;base64,${it.b64}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, px, px);
    const d = g.getImageData(0, 0, px, px).data;
    const box = () => ({ x0: 1e9, y0: 1e9, x1: -1, y1: -1 });
    const all = box(), main = box();
    let sa = 0, sx = 0, sy = 0;
    for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
      const i = (y * px + x) * 4, a = d[i + 3];
      if (a > 0) { sa += a; sx += a * (x + 0.5); sy += a * (y + 0.5); }
      if (a <= alphaT) continue;
      all.x0 = Math.min(all.x0, x); all.x1 = Math.max(all.x1, x + 1); all.y0 = Math.min(all.y0, y); all.y1 = Math.max(all.y1, y + 1);
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (lum >= lumT) { main.x0 = Math.min(main.x0, x); main.x1 = Math.max(main.x1, x + 1); main.y0 = Math.min(main.y0, y); main.y1 = Math.max(main.y1, y + 1); }
    }
    out[it.name] = { all, main, cm: [sx / sa, sy / sa] };
  }
  return out;
}

// bbox de los píxeles que difieren entre dos PNG (b64) por más de t (suma de canales RGBA)
async function pageDiff(a64, b64, t) {
  const load = async (b) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data };
  };
  const A = await load(a64), B = await load(b64);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
    const i = (y * A.w + x) * 4;
    const s = Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1]) + Math.abs(A.d[i + 2] - B.d[i + 2]) + Math.abs(A.d[i + 3] - B.d[i + 3]);
    if (s > t) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); }
  }
  return { x0, y0, x1, y1 };
}

const toUnits = (b) => ({ minX: b.x0 / UNIT - 1, maxX: b.x1 / UNIT - 1, minY: b.y0 / UNIT - 1, maxY: b.y1 / UNIT - 1 });
const ctr = (u) => [(u.minX + u.maxX) / 2, (u.minY + u.maxY) / 2];
const f = (n, d = 2) => (n >= 0 ? '+' : '') + n.toFixed(d);

try {
  const chrome = candidates.find((p) => existsSync(p));
  if (!chrome) throw new Error('No encuentro Chrome/Edge: define CHROME_PATH');
  const port = await freePort();
  const debugUrl = `http://127.0.0.1:${port}`;
  profile = await mkdtemp(join(tmpdir(), 'hubicons-measure-'));
  browser = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=800,800', 'about:blank'], { stdio: 'ignore' });
  let launchError = null;
  browser.on('error', (e) => { launchError = new Error(`No pude lanzar Chrome: ${e.message}`); });
  browser.on('exit', (code) => { browserExited = { code }; });
  for (let i = 0; ; i++) {
    if (launchError) throw launchError;
    if (browserExited && browserExited.code !== 0) throw new Error(`Chrome salió (código ${browserExited.code})`);
    if (await fetch(`${debugUrl}/json/version`).then((r) => r.ok, () => false)) break;
    if (i >= 150) throw new Error('Chrome no abrió el puerto de depuración');
    await sleep(200);
  }
  const target = await fetch(`${debugUrl}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  if (outDir) await mkdir(outDir, { recursive: true });
  const setHtml = async (html) => {
    const { frameTree } = await cdp.send('Page.getFrameTree');
    await cdp.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
    await sleep(150);
  };

  // ---------- Parte 1: icono puro ----------
  const svgOf = (h) => icon(h.name, { size: PX, ...(h.opts ?? {}) }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 400, height: 400, deviceScaleFactor: 1, mobile: false });
  await setHtml('<!doctype html><body></body>');
  const items = HUB.map((h) => ({ name: h.name, b64: Buffer.from(svgOf(h)).toString('base64') }));
  const pure = await evaluate(cdp, `(${pagePure})(${JSON.stringify(items)}, ${PX}, ${ALPHA}, ${LUM})`);

  const rows = [];
  for (const h of HUB) {
    const p = pure[h.name];
    const vis = toUnits(p.all), main = toUnits(p.main);
    const [vx, vy] = ctr(vis), [mx, my] = ctr(main);
    const cmx = p.cm[0] / UNIT - 1, cmy = p.cm[1] / UNIT - 1;
    const g = iconBounds(icon(h.name, h.opts ?? {}));
    const [nx, ny] = ICON_NUDGE[h.name] ?? [0, 0];
    rows.push({ name: h.name, vis, devVis: [vx - C, vy - C], devCm: [cmx - C, cmy - C], devMain: [mx - C, my - C], devGeo: [g.cx - C, g.cy - C], nudge: [nx, ny], geo: g });
  }
  console.log('\n== Parte 1: icono puro (unidades del viewBox; desvío respecto al centro 24,5; + = derecha/abajo) ==');
  console.log('icono        (a)caja visible        (b)masa              (c)color principal   geométrica(test)     nudge actual   residuo(a)+nudge');
  for (const r of rows) {
    const s = (d) => `${f(d[0])},${f(d[1])}`.padEnd(18);
    console.log(`${r.name.padEnd(12)} ${s(r.devVis)} ${s(r.devCm)} ${s(r.devMain)} ${s(r.devGeo)} ${(`${f(r.nudge[0], 1)},${f(r.nudge[1], 1)}`).padEnd(14)} ${f(r.devVis[0] + r.nudge[0])},${f(r.devVis[1] + r.nudge[1])}`);
  }

  // ---------- Parte 2: recuadro real ----------
  const css = await readFile(resolve(root, 'src/screens/hub.css'), 'utf8');
  const tileCases = HUB.map((h) => {
    const nv = nudgeVars(h.name);
    const svg = icon(h.name, { size: 52, ...(h.opts ?? {}) });
    if (h.name === 'lock') return { ...h, sel: '.hub-padlock > svg', html: `<div class="hub-nav"><span class="hub-ico hub-ico--ranking"><span class="hub-lock"><span class="hub-padlock" style="${nv}">${svg}</span></span></span></div>` };
    if (h.name === 'chains') return { ...h, sel: '.hub-chains > svg', html: `<div class="hub-nav"><span class="hub-ico hub-ico--ranking"><span class="hub-lock"><span class="hub-chains" style="${nv}">${svg}</span></span></span></div>` };
    if (h.name === 'user' || h.name === 'coins') return null; // viven en .hub-face y .hub-wallet-ico, no en un .hub-ico
    const cls = { medal: 'achievements', skins: 'skins', users: 'friends' }[h.name] ?? (h.tool ? 'tool' : 'ranking');
    const inner = `${svg}${h.tool ? '' : '<span class="hub-lock" data-lock="x" aria-hidden="true"></span><span data-badge="x"></span>'}`;
    return { ...h, sel: '.hub-ico > svg', html: `<div class="hub-nav${h.tool ? ' hub-tool' : ''}"><span class="hub-ico hub-ico--${cls}" style="${nv}">${inner}</span></div>` };
  }).filter(Boolean);

  const DSF = 4;
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 400, deviceScaleFactor: DSF, mobile: false });
  const shot = async (rect) => (await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip: { x: rect.x - 12, y: rect.y - 12, width: rect.w + 24, height: rect.h + 24, scale: 1 } })).data;
  const tiles = {};
  for (const c of tileCases) {
    await setHtml(`<!doctype html><meta charset="utf-8"><style>${css}
      html,body{margin:0;background:transparent} .hub{position:static!important;display:block!important;background:none!important;overflow:visible!important;padding:24px!important;--ico:78px;--ico-svg:56px;--tool:62px;--tool-svg:44px}
      .hub-nav{display:inline-flex}</style><div class="hub">${c.html}</div>`);
    const rect = await evaluate(cdp, `(() => { const r = document.querySelector('.hub-ico').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
    const res = {};
    for (const shadow of [true, false]) {
      await evaluate(cdp, `(() => { let s = document.getElementById('t'); if (!s) { s = document.createElement('style'); s.id = 't'; document.head.appendChild(s); } s.textContent = ${JSON.stringify(shadow ? '' : '.hub svg{filter:none!important}')}; })()`);
      const a = await shot(rect);
      await evaluate(cdp, `(() => { document.getElementById('t').textContent += ${JSON.stringify(`${c.sel}{visibility:hidden!important}`)}; })()`);
      const b = await shot(rect);
      const d = await evaluate(cdp, `(${pageDiff})(${JSON.stringify(a)}, ${JSON.stringify(b)}, 60)`);
      // d está en px de dispositivo relativos al recorte (que empieza 12 px CSS antes del recuadro)
      const L = d.x0 / DSF - 12, T = d.y0 / DSF - 12, R = rect.w - (d.x1 / DSF - 12), B = rect.h - (d.y1 / DSF - 12);
      res[shadow ? 'sombra' : 'limpio'] = { L, R, T, B };
      if (outDir) {
        await writeFile(join(outDir, `${c.name}-${shadow ? 'sombra' : 'limpio'}.png`), Buffer.from(a, 'base64'));
      }
    }
    tiles[c.name] = { rect, ...res };
  }
  console.log('\n== Parte 2: márgenes del icono dentro del recuadro real (px CSS; el recuadro mide el lado indicado) ==');
  console.log('icono        lado  sin sombra  izq    der    sup    inf   | con sombra  izq    der    sup    inf   | desvío x,y (sin sombra)');
  for (const c of tileCases) {
    const t = tiles[c.name], a = t.limpio, s = t.sombra;
    console.log(`${c.name.padEnd(12)} ${String(t.rect.w).padEnd(5)} ${''.padEnd(10)} ${a.L.toFixed(2).padStart(5)} ${a.R.toFixed(2).padStart(6)} ${a.T.toFixed(2).padStart(6)} ${a.B.toFixed(2).padStart(6)}   | ${''.padEnd(10)} ${s.L.toFixed(2).padStart(5)} ${s.R.toFixed(2).padStart(6)} ${s.T.toFixed(2).padStart(6)} ${s.B.toFixed(2).padStart(6)}   | ${f((a.L - a.R) / 2)},${f((a.T - a.B) / 2)}`);
  }

  if (wantJson) {
    console.log('\n// ICON_NUDGE (criterio: centro de la caja visible (a), unidades del viewBox, 1 decimal)');
    console.log(JSON.stringify(Object.fromEntries(rows.map((r) => [r.name, [Math.round(-r.devVis[0] * 10) / 10, Math.round(-r.devVis[1] * 10) / 10]]))));
    console.log('// VISIBLE_BOX [minX,minY,maxX,maxY] medida en píxeles');
    console.log(JSON.stringify(Object.fromEntries(rows.map((r) => [r.name, [r.vis.minX, r.vis.minY, r.vis.maxX, r.vis.maxY].map((n) => Math.round(n * 10) / 10)]))));
  }
  cdp.close();
  await fetch(`${debugUrl}/json/close/${target.id}`).catch(() => {});
} catch (err) {
  console.error(err.message ?? err);
  process.exitCode = 1;
} finally {
  await cleanup();
}
process.exit(process.exitCode ?? 0);
