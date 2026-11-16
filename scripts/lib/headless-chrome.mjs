// Chrome/Edge headless por CDP para los generadores de assets (scripts/make-*.mjs).
// Uso:  await withChrome(async ({ render }) => { const buf = await render(html, { width, height, format }); ... });
// Cierra Chrome (árbol completo), borra el perfil temporal y no toca ningún otro Chrome del usuario.
// Requiere Node >=22 (WebSocket y fetch globales).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

function freePort() {
  return new Promise((ok, fail) => {
    const s = createNetServer();
    s.on('error', fail);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
  });
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

export async function withChrome(fn) {
  if (Number(process.versions.node.split('.')[0]) < 22 || typeof WebSocket === 'undefined') {
    throw new Error(`Este script necesita Node >=22 (WebSocket global); tienes ${process.versions.node}.`);
  }
  const chrome = candidates.find((p) => existsSync(p));
  if (!chrome) throw new Error('No encuentro Chrome/Edge: define CHROME_PATH');
  const port = Number(process.env.CHROME_DEBUG_PORT) || await freePort();
  const debugUrl = `http://127.0.0.1:${port}`;
  const profile = await mkdtemp(join(tmpdir(), 'asset-make-'));
  let exited = null;
  const browser = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });
  let launchError = null;
  browser.on('error', (e) => { launchError = new Error(`No pude lanzar Chrome: ${e.message}`); });
  browser.on('exit', (code) => { exited = { code }; });

  const cleanup = async () => {
    if (!exited) {
      const done = new Promise((ok) => browser.once('exit', ok));
      try {
        if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' });
        else browser.kill('SIGKILL');
      } catch { /* ya muerto */ }
      await Promise.race([done, sleep(5000)]);
    }
    // Se mata por el perfil temporal (nombre único de esta ejecución), sin tocar otros Chrome.
    if (process.platform === 'win32') {
      const ps = `Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'chrome.exe','msedge.exe' -and $_.CommandLine -like '*${profile.replaceAll("'", "''")}*' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }`;
      spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
      await sleep(500);
    } else {
      spawnSync('pkill', ['-9', '-f', profile], { stdio: 'ignore' });
    }
    try { await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
    catch (e) { console.warn(`No pude borrar el perfil temporal ${profile}: ${e.message}`); }
  };
  const onSig = () => { cleanup().finally(() => process.exit(130)); };
  process.on('SIGINT', onSig);
  process.on('SIGTERM', onSig);

  try {
    for (let i = 0; ; i++) {
      if (launchError) throw launchError;
      if (exited && exited.code !== 0) throw new Error(`Chrome salió (código ${exited.code}): ¿puerto ${port} ocupado?`);
      if (await fetch(`${debugUrl}/json/version`).then((r) => r.ok, () => false)) break;
      if (i >= 150) throw new Error('Chrome no abrió el puerto de depuración');
      await sleep(200);
    }

    // Renderiza un HTML (escrito a un archivo del perfil: los data: URL de navegación tienen tope ~2 MB).
    const render = async (html, { width, height, transparent = false, format = 'png', quality } = {}) => {
      const target = await fetch(`${debugUrl}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
      const cdp = await connect(target.webSocketDebuggerUrl);
      try {
        await cdp.send('Page.enable');
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        if (transparent) await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
        const file = join(profile, `page-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
        await writeFile(file, html);
        await cdp.send('Page.navigate', { url: pathToFileURL(file).href });
        const r = await cdp.send('Runtime.evaluate', {
          expression: `new Promise((ok) => { const go = () => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))).then(() => ok('ok')); document.readyState === 'complete' ? go() : addEventListener('load', go); })`,
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
    };
    return await fn({ render });
  } finally {
    await cleanup();
  }
}

export const hasAlpha = (buf) => buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 12, 16) === 'VP8X' && (buf[20] & 0x10) !== 0;
