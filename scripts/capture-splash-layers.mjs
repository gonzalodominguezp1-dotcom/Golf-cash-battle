// Genera las capas WebP del splash y la imagen fija del hub desde la escena del laboratorio.
//
// Uso (desde la raíz del proyecto):  pnpm splash:capture
// Requiere Node >=22 (WebSocket y fetch globales).
//
// Arranca Vite en un puerto libre, abre scripts/hub-scene-lab.html en Chrome headless (WebGL por SwiftShader) por el
// protocolo de depuración remota y hace una captura WebP por capa (sky opaca; forest y green con fondo transparente).
// Escribe public/splash/{sky,forest,green,hub-fallback}.webp. Límites: 3 capas <=110 KB, hub-fallback <=40 KB.
// Al acabar (o con Ctrl+C) cierra Chrome (árbol completo), borra el perfil temporal y cierra Vite.
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

if (Number(process.versions.node.split('.')[0]) < 22 || typeof WebSocket === 'undefined') {
  console.error(`Este script necesita Node >=22 (WebSocket global); tienes ${process.versions.node}.`);
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/splash');
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

const W = 1280, H = 800;
const jobs = [
  { file: 'sky.webp', layer: 'sky', transparent: false, q: 55 },
  { file: 'forest.webp', layer: 'forest', transparent: true, q: 60 },
  { file: 'green.webp', layer: 'green', transparent: true, q: 60 },
  { file: 'hub-fallback.webp', layer: null, transparent: false, q: 60 },
];
const LAYERS_MAX = 110 * 1024;
const FALLBACK_MAX = 40 * 1024;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

function freePort() {
  return new Promise((ok, fail) => {
    const s = createNetServer();
    s.on('error', fail);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
  });
}

let vite = null;
let browser = null;
let browserExited = null; // { code } cuando Chrome ha salido
let profile = null;
let cleaned = null;

// Idempotente: mata el árbol de Chrome, espera su salida, borra el perfil y cierra Vite (cada paso aislado).
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
    // En Windows el proceso lanzado puede ceder el control a otro Chrome con distinto pid: se mata por el
    // perfil temporal (nombre único de esta ejecución), sin tocar ningún otro Chrome.
    if (profile && process.platform === 'win32') {
      const ps = `Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'chrome.exe','msedge.exe' -and $_.CommandLine -like '*${profile.replaceAll("'", "''")}*' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }`;
      spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
      await sleep(500);
    } else if (profile) {
      spawnSync('pkill', ['-9', '-f', profile], { stdio: 'ignore' });
    }
    try { await vite?.close(); } catch (e) { console.warn(`No pude cerrar Vite: ${e.message}`); }
    if (profile) {
      try { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch (e) { console.warn(`No pude borrar el perfil temporal ${profile}: ${e.message}`); }
    }
  })();
  return cleaned;
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { cleanup().finally(() => process.exit(130)); });
}

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

async function captureOne(job, base, debugUrl) {
  if (browserExited && browserExited.code !== 0) throw new Error(`Chrome ha muerto (código ${browserExited.code})`);
  const params = new URLSearchParams({ capture: '1', seed: '1', q: 'high', ambient: '0' });
  if (job.layer) params.set('layer', job.layer);
  const url = `${base}/scripts/hub-scene-lab.html?${params}`;
  const target = await fetch(`${debugUrl}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const cdp = await connect(target.webSocketDebuggerUrl);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    if (job.transparent) await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await cdp.send('Page.navigate', { url });
    const ready = await evaluate(cdp, `new Promise((resolve) => {
      const t0 = Date.now();
      const timer = setInterval(async () => {
        const lab = window.lab;
        if (lab && lab.error) { clearInterval(timer); resolve('error: ' + lab.error); }
        else if (lab && lab.scene) {
          clearInterval(timer);
          try { await lab.scene.firstFrame; } catch (e) {}
          await new Promise((r) => setTimeout(r, 1500));
          resolve('ok');
        } else if (Date.now() - t0 > 90000) { clearInterval(timer); resolve('timeout'); }
      }, 200);
    })`);
    if (ready !== 'ok') throw new Error(`${job.file}: la escena no cargó (${ready})`);
    // Fuera el panel de info y el fondo de la página, para que quede solo la escena.
    await evaluate(cdp, `(() => {
      const s = document.createElement('style');
      s.textContent = '#info,#measure{display:none!important}' + ${job.transparent ? "'html,body{background:transparent!important}'" : "''"};
      document.head.appendChild(s);
    })()`);
    await sleep(300);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'webp', quality: job.q, fromSurface: true });
    return Buffer.from(shot.data, 'base64');
  } finally {
    cdp.close();
    await fetch(`${debugUrl}/json/close/${target.id}`).catch(() => {});
  }
}

// Comprobación final del done-check: archivos, pesos, solo .webp y alfa en forest/green (flag de VP8X).
async function checkOutputs() {
  const errors = [];
  const sizes = {};
  for (const job of jobs) {
    try { sizes[job.file] = (await stat(resolve(outDir, job.file))).size; }
    catch { errors.push(`falta ${job.file}`); }
  }
  const layers = ['sky.webp', 'forest.webp', 'green.webp'].reduce((a, f) => a + (sizes[f] ?? 0), 0);
  if (layers > LAYERS_MAX) errors.push(`las 3 capas pesan ${layers} B (máx ${LAYERS_MAX})`);
  if ((sizes['hub-fallback.webp'] ?? 0) > FALLBACK_MAX) errors.push(`hub-fallback.webp pesa ${sizes['hub-fallback.webp']} B (máx ${FALLBACK_MAX})`);
  const extra = (await readdir(outDir)).filter((f) => !f.endsWith('.webp'));
  if (extra.length) errors.push(`public/splash contiene archivos que no son .webp: ${extra.join(', ')}`);
  for (const f of ['forest.webp', 'green.webp']) {
    if (sizes[f] === undefined) continue;
    const buf = await readFile(resolve(outDir, f));
    const isWebp = buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
    // Cabecera extendida VP8X: byte de flags en el offset 20; bit 0x10 = alfa.
    const hasAlpha = isWebp && buf.toString('latin1', 12, 16) === 'VP8X' && (buf[20] & 0x10) !== 0;
    if (!hasAlpha) errors.push(`${f} no tiene canal alfa (VP8X sin flag de alfa)`);
  }
  return errors;
}

try {
  const chrome = candidates.find((p) => existsSync(p));
  if (!chrome) throw new Error('No encuentro Chrome/Edge: define CHROME_PATH');
  const port = Number(process.env.CHROME_DEBUG_PORT) || await freePort();
  const debugUrl = `http://127.0.0.1:${port}`;

  vite = await createServer({ root, logLevel: 'silent', server: { port: 0, strictPort: false } });
  await vite.listen();
  const base = vite.resolvedUrls.local[0].replace(/\/$/, '');

  profile = await mkdtemp(join(tmpdir(), 'splash-capture-'));
  browser = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, 'about:blank',
  ], { stdio: 'ignore' });
  let launchError = null;
  browser.on('error', (e) => { launchError = new Error(`No pude lanzar Chrome: ${e.message}`); });
  browser.on('exit', (code) => { browserExited = { code }; });

  for (let i = 0; ; i++) {
    if (launchError) throw launchError;
    // Salida con código 0 = el lanzador cedió el control a otro proceso de Chrome (normal en Windows): se sigue esperando el puerto.
    if (browserExited && browserExited.code !== 0) throw new Error(`Chrome salió (código ${browserExited.code}): ¿puerto ${port} ocupado?`);
    if (await fetch(`${debugUrl}/json/version`).then((r) => r.ok, () => false)) break;
    if (i >= 150) throw new Error('Chrome no abrió el puerto de depuración');
    await sleep(200);
  }

  await mkdir(outDir, { recursive: true });
  for (const job of jobs) {
    let buf;
    for (let attempt = 1; !buf; attempt++) {
      try { buf = await captureOne(job, base, debugUrl); } catch (err) {
        if (attempt >= 3 || (browserExited && browserExited.code !== 0)) throw err;
        console.warn(`${job.file}: reintento (${err.message})`);
        await sleep(1000);
      }
    }
    await writeFile(resolve(outDir, job.file), buf);
    console.log(`${job.file}  ${(buf.length / 1024).toFixed(1)} KB`);
  }

  const errors = await checkOutputs();
  if (errors.length) {
    for (const e of errors) console.error(`FALLO: ${e}`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err.message ?? err);
  process.exitCode = 1;
} finally {
  await cleanup();
}

process.exit(process.exitCode ?? 0);
