// Genera las vistas previas WebP de public/courses/ con el mismo renderer que usa la app.
//
// Uso (desde la raíz del proyecto):
//   pnpm previews:capture                      → solo los WebP que falten
//   pnpm previews:capture "Cyberpunk2078"      → regenera esos hoyos
//
// Arranca Vite con este proyecto y abre scripts/course-preview-capture.html en Chrome headless (WebGL por SwiftShader) por el
// protocolo de depuración remota, lee el WebP del DOM y lo escribe como course-N.webp
// (N = posición en COURSES) o tiebreak.webp.
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { COURSES, TIEBREAK_COURSE } from '../src/game/courses.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/courses');
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = Number(process.env.CHROME_DEBUG_PORT ?? 9333);
const requested = process.argv.slice(2);

const jobs = [
  ...COURSES.map((c, i) => ({ name: c.name, file: `course-${i + 1}.webp` })),
  { name: TIEBREAK_COURSE.name, file: 'tiebreak.webp' },
];

const exists = (path) => access(path).then(() => true, () => false);
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

const unknown = requested.filter((name) => !jobs.some((job) => job.name === name));
if (unknown.length) throw new Error(`hoyo desconocido: ${unknown.join(', ')}`);

// Sin nombres: solo los que faltan. Con nombres: esos hoyos, aunque ya tengan imagen.
const selected = [];
for (const job of jobs) {
  const wanted = requested.length ? requested.includes(job.name) : !(await exists(resolve(outDir, job.file)));
  if (wanted) selected.push(job);
}
if (selected.length === 0) {
  console.log('Nada que generar: todos los WebP ya existen. Pasa nombres de hoyo para regenerar.');
  process.exit(0);
}

// Vite de este mismo proyecto, para que la captura use el código de esta carpeta.
const vite = await createServer({ root, logLevel: 'silent', server: { port: 0, strictPort: false } });
await vite.listen();
const base = vite.resolvedUrls.local[0].replace(/\/$/, '');

const profile = await mkdtemp(join(tmpdir(), 'course-preview-'));
const browser = spawn(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu-sandbox',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--window-size=1280,800',
  'about:blank',
], { stdio: 'ignore' });

const debugUrl = `http://127.0.0.1:${port}`;

async function waitForDebugger() {
  for (let i = 0; i < 100; i++) {
    const ok = await fetch(`${debugUrl}/json/version`).then(() => true, () => false);
    if (ok) return;
    await sleep(200);
  }
  throw new Error('Chrome no abrió el puerto de depuración');
}

// Ejecuta en la página la espera de la captura y devuelve { status, text }.
const WAIT_FOR_CAPTURE = `new Promise((resolve) => {
  const started = Date.now();
  const timer = setInterval(() => {
    const out = document.getElementById('out');
    const done = out && out.dataset.status !== 'pending';
    if (done || Date.now() - started > 60000) {
      clearInterval(timer);
      resolve({ status: out ? out.dataset.status : 'missing', text: out ? out.textContent : '' });
    }
  }, 200);
})`;

function evaluateInPage(wsUrl, expression) {
  return new Promise((ok, fail) => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }));
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== 1) return;
      ws.close();
      if (msg.error || msg.result.exceptionDetails) fail(new Error(JSON.stringify(msg.error ?? msg.result.exceptionDetails)));
      else ok(msg.result.result.value);
    };
    ws.onerror = () => fail(new Error('error en la conexión con Chrome'));
  });
}

async function captureOne(job) {
  const url = `${base}/scripts/course-preview-capture.html?course=${encodeURIComponent(job.name)}`;
  const target = await fetch(`${debugUrl}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' }).then((r) => r.json());
  try {
    // La página puede recargarse mientras carga (contexto destruido): se reintenta la espera.
    let result = null;
    for (let attempt = 0; attempt < 3 && !result; attempt++) {
      result = await evaluateInPage(target.webSocketDebuggerUrl, WAIT_FOR_CAPTURE).catch((err) => {
        if (!String(err.message).includes('Execution context was destroyed')) throw err;
        return null;
      });
      if (!result) await sleep(1500);
    }
    if (!result) throw new Error(`${job.name}: la página no llegó a estabilizarse`);
    const { status, text } = result;
    if (status !== 'ok') throw new Error(`${job.name}: la captura falló: ${text}`);
    return text.replace(/^data:image\/webp;base64,/, '');
  } finally {
    await fetch(`${debugUrl}/json/close/${target.id}`).catch(() => {});
  }
}

try {
  await waitForDebugger();
  await mkdir(outDir, { recursive: true });
  for (const job of selected) {
    const base64 = await captureOne(job);
    await writeFile(resolve(outDir, job.file), Buffer.from(base64, 'base64'));
    console.log(`${job.file}  ←  ${job.name}`);
  }
} finally {
  browser.kill();
  await vite.close();
}
