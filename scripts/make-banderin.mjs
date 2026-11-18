// Genera el banderín del hub (tela roja, ribete dorado, logo bordado) y su boceto de vista previa.
//
// Uso (desde la raíz del proyecto):  pnpm banderin:make
// Requiere Node >=22 (WebSocket y fetch globales) y Chrome/Edge (o CHROME_PATH).
//
// Dibuja el banderín como SVG (forma, degradado, pliegues, ribete, anillas) con public/logo.png REAL incrustado
// (sin deformarlo) y lo renderiza con Chrome headless por CDP con fondo transparente.
// Escribe public/hub/banderin.webp (1024x640, alfa, <=60 KB) y
// 02-DOCS/attachments/ui-pantallas/banderin-boceto.png (el banderín sobre hub-fallback.webp a 375x812 y 1280x800).
// Al acabar (o con Ctrl+C) cierra Chrome (árbol completo) y borra el perfil temporal.
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
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
const outTexture = resolve(root, 'public/hub/banderin.webp');
const outBack = resolve(root, 'public/hub/banderin-back.webp');
const outPreview = resolve(root, '02-DOCS/attachments/ui-pantallas/banderin-boceto.png');
const MAX_BYTES = 60 * 1024;
const W = 1024, H = 640;
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
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ---------- Diseño (SVG) ----------
const M = 10;            // margen transparente
const HEM = 64;          // ancho del dobladillo junto al mástil
const BORDER = 14;       // grosor del ribete dorado
const NOTCH_X = 790;     // fondo de la cola de golondrina
const outline = `M ${M} ${M} L ${W - M} ${M} L ${NOTCH_X} ${H / 2} L ${W - M} ${H - M} L ${M} ${H - M} Z`;

// back=true: cara trasera. Vista por detrás todo sale espejado, así que el logo va pre-espejado para leerse bien.
function bannerSvg(logoDataUri, back = false) {
  // Logo 1700x1467 -> alto 440, ancho ~510, centrado en la zona de tela (entre dobladillo y cola).
  const lh = 440, lw = Math.round(lh * 1700 / 1467);
  const cx = (HEM + NOTCH_X - 40) / 2 + 20, cy = H / 2;
  const lx = Math.round(cx - lw / 2), ly = Math.round(cy - lh / 2);
  const rings = [110, 250, 390, 530].map((y) => `
    <circle cx="${M + 30}" cy="${y}" r="17" fill="#f5c542" stroke="#8a6410" stroke-width="3"/>
    <circle cx="${M + 30}" cy="${y}" r="8" fill="#0b0f15"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="shape"><path d="${outline}"/></clipPath>
    <linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4b525d"/>
      <stop offset="0.5" stop-color="#2f353e"/>
      <stop offset="1" stop-color="#14181e"/>
    </linearGradient>
    <linearGradient id="hem" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7a5a0e"/>
      <stop offset="0.45" stop-color="#f5c542"/>
      <stop offset="1" stop-color="#b8891a"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe08a"/>
      <stop offset="0.5" stop-color="#f5c542"/>
      <stop offset="1" stop-color="#b8891a"/>
    </linearGradient>
    <linearGradient id="foldLight" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="foldDark" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#000" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <!-- Contorno oscuro fino alrededor del logo para que se lea sobre el rojo (sin sombra pesada). -->
    <filter id="stitch" x="-5%" y="-5%" width="110%" height="110%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="4" result="grow"/>
      <feFlood flood-color="#d9a82e" flood-opacity="0.95"/>
      <feComposite in2="grow" operator="in" result="edge"/>
      <feMerge><feMergeNode in="edge"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Tela -->
  <path d="${outline}" fill="url(#cloth)"/>
  <g clip-path="url(#shape)">
    <!-- Pliegues pintados: bandas suaves alternas de luz y sombra con ondulación -->
    <path d="M 150 0 C 210 160 120 320 190 640 L 330 640 C 270 320 360 160 290 0 Z" fill="url(#foldLight)"/>
    <path d="M 330 0 C 390 170 300 330 370 640 L 520 640 C 450 330 540 170 470 0 Z" fill="url(#foldDark)"/>
    <path d="M 520 0 C 580 150 490 330 560 640 L 700 640 C 630 330 720 150 650 0 Z" fill="url(#foldLight)"/>
    <path d="M 700 0 C 760 160 670 330 740 640 L 880 640 C 810 330 900 160 830 0 Z" fill="url(#foldDark)"/>
    <path d="M 860 0 C 920 160 850 330 920 640 L 1024 640 L 1024 0 Z" fill="url(#foldLight)"/>
    <!-- Dobladillo junto al mástil -->
    <rect x="${M}" y="0" width="${HEM}" height="${H}" fill="url(#hem)"/>
    <line x1="${M + HEM}" y1="0" x2="${M + HEM}" y2="${H}" stroke="#6b4c0a" stroke-width="3"/>
    <!-- Puntadas del dobladillo -->
    <line x1="${M + HEM - 8}" y1="0" x2="${M + HEM - 8}" y2="${H}" stroke="#6b4c0a" stroke-width="2" stroke-dasharray="10 8" opacity="0.8"/>
  </g>

  <!-- Ribete dorado -->
  <path d="${outline}" fill="none" stroke="url(#gold)" stroke-width="${BORDER * 2}" stroke-linejoin="round" clip-path="url(#shape)"/>
  <path d="${outline}" fill="none" stroke="#7a5a0e" stroke-width="3" stroke-linejoin="round"/>

  <!-- Logo bordado -->
  <image href="${logoDataUri}" x="${lx}" y="${ly}" width="${lw}" height="${lh}" filter="url(#stitch)"${back ? ` transform="translate(${2 * lx + lw} 0) scale(-1 1)"` : ''}/>

  <!-- Anillas del mástil -->
  ${rings}
</svg>`;
}

// ---------- Chrome por CDP ----------
function freePort() {
  return new Promise((ok, fail) => {
    const s = createNetServer();
    s.on('error', fail);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
  });
}

let browser = null;
let browserExited = null;
let profile = null;
let cleaned = null;

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
    // Se mata por el perfil temporal (nombre único de esta ejecución), sin tocar ningún otro Chrome.
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

// Renderiza un HTML (como data URL) a un tamaño dado y devuelve el buffer de la captura.
async function render(debugUrl, html, { width, height, transparent, format, quality }) {
  const target = await fetch(`${debugUrl}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const cdp = await connect(target.webSocketDebuggerUrl);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    if (transparent) await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    // Los data: URL de navegación tienen tope (~2 MB): el HTML va a un archivo del perfil temporal.
    const file = join(profile, `page-${Date.now()}.html`);
    await writeFile(file, html);
    await cdp.send('Page.navigate', { url: pathToFileURL(file).href });
    // Espera a que todas las imágenes estén decodificadas.
    const r = await cdp.send('Runtime.evaluate', {
      expression: `Promise.all([...document.images].map((i) => i.decode().catch(() => {}))).then(() => 'ok')`,
      awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    await sleep(300);
    const shot = await cdp.send('Page.captureScreenshot', { format, ...(quality ? { quality } : {}), fromSurface: true });
    return Buffer.from(shot.data, 'base64');
  } finally {
    cdp.close();
    await fetch(`${debugUrl}/json/close/${target.id}`).catch(() => {});
  }
}

const hasAlpha = (buf) => buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 12, 16) === 'VP8X' && (buf[20] & 0x10) !== 0;

try {
  const chrome = candidates.find((p) => existsSync(p));
  if (!chrome) throw new Error('No encuentro Chrome/Edge: define CHROME_PATH');
  const port = Number(process.env.CHROME_DEBUG_PORT) || await freePort();
  const debugUrl = `http://127.0.0.1:${port}`;

  profile = await mkdtemp(join(tmpdir(), 'banderin-make-'));
  browser = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, 'about:blank',
  ], { stdio: 'ignore' });
  let launchError = null;
  browser.on('error', (e) => { launchError = new Error(`No pude lanzar Chrome: ${e.message}`); });
  browser.on('exit', (code) => { browserExited = { code }; });
  for (let i = 0; ; i++) {
    if (launchError) throw launchError;
    if (browserExited && browserExited.code !== 0) throw new Error(`Chrome salió (código ${browserExited.code}): ¿puerto ${port} ocupado?`);
    if (await fetch(`${debugUrl}/json/version`).then((r) => r.ok, () => false)) break;
    if (i >= 150) throw new Error('Chrome no abrió el puerto de depuración');
    await sleep(200);
  }

  const logo = `data:image/png;base64,${(await readFile(resolve(root, 'public/logo.png'))).toString('base64')}`;
  const svg = bannerSvg(logo);
  if (process.env.BANDERIN_SVG) await writeFile(process.env.BANDERIN_SVG, svg);

  // 1) Texturas (cara y trasera): calidad más alta que quepa en el límite de peso.
  const renderTexture = async (markup, name) => {
    const svgUri = `data:image/svg+xml;base64,${Buffer.from(markup).toString('base64')}`;
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:transparent"><img src="${svgUri}" width="${W}" height="${H}" style="display:block"></body></html>`;
    for (const q of [92, 88, 84, 80, 75, 70, 65, 60, 55, 50]) {
      const buf = await render(debugUrl, html, { width: W, height: H, transparent: true, format: 'webp', quality: q });
      if (buf.length <= MAX_BYTES) {
        if (!hasAlpha(buf)) throw new Error(`${name} no tiene canal alfa`);
        console.log(`${name}  ${(buf.length / 1024).toFixed(1)} KB (calidad ${q})`);
        return { buf, q };
      }
    }
    throw new Error(`No consigo meter ${name} en 60 KB`);
  };
  const tex = await renderTexture(svg, 'banderin.webp');
  const back = await renderTexture(bannerSvg(logo, true), 'banderin-back.webp');
  await mkdir(dirname(outTexture), { recursive: true });
  await writeFile(outTexture, tex.buf);
  await writeFile(outBack, back.buf);

  // 2) Boceto: el banderín sobre el fondo del hub a 375x812 y 1280x800, con un recuadro ampliado.
  const bg = `data:image/webp;base64,${(await readFile(resolve(root, 'public/splash/hub-fallback.webp'))).toString('base64')}`;
  const flag = `data:image/webp;base64,${tex.buf.toString('base64')}`;
  const panel = (w, h, flagW, mastX, mastTop, zoomW, label) => `
    <div style="position:relative;width:${w}px;height:${h}px;overflow:hidden;background:url(${bg}) center/cover;flex:none">
      <img src="${flag}" style="position:absolute;left:${mastX}px;top:${mastTop}px;width:${flagW}px">
      <div style="position:absolute;left:8px;top:8px;font:12px sans-serif;color:#fff;background:rgba(0,0,0,.55);padding:3px 7px;border-radius:4px">${label}</div>
      <div style="position:absolute;right:10px;bottom:10px;width:${zoomW}px;background:rgba(11,15,21,.82);border:2px solid #f5c542;border-radius:8px;padding:6px">
        <img src="${flag}" style="display:block;width:100%">
        <div style="font:11px sans-serif;color:#f5c542;margin-top:4px">ampliado</div>
      </div>
    </div>`;
  const page = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#0b0f15;display:flex;gap:24px;padding:24px;align-items:flex-start;width:max-content">
    ${panel(375, 812, 112, 188, 279, 300, '375×812 (banderín ≈ 112 px)')}
    ${panel(1280, 800, 130, 640, 275, 380, '1280×800 (≈ 130 px)')}
  </body></html>`;
  const prevW = 24 + 375 + 24 + 1280 + 24, prevH = 24 + 812 + 24;
  const prev = await render(debugUrl, page, { width: prevW, height: prevH, transparent: false, format: 'png' });
  await mkdir(dirname(outPreview), { recursive: true });
  await writeFile(outPreview, prev);
  console.log(`banderin-boceto.png  ${(prev.length / 1024).toFixed(1)} KB`);

  const s = await stat(outTexture);
  if (s.size > MAX_BYTES) throw new Error(`banderin.webp pesa ${s.size} B (máx ${MAX_BYTES})`);
} catch (err) {
  console.error(err.message ?? err);
  process.exitCode = 1;
} finally {
  await cleanup();
}

process.exit(process.exitCode ?? 0);
