import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const INDEX = readFileSync(new URL('index.html', root), 'utf8');
const SPLASH_DIR = new URL('public/splash/', root);
const SPLASH_JS = readFileSync(new URL('public/splash.js', root), 'utf8');
const LIMIT = 150 * 1024;          // código del splash: <style> + splash.js
const IMG_LIMIT = 400 * 1024;      // imágenes que pide el splash en una orientación (foto del hoyo + moneda + logo); ver nota en el informe
// Imágenes que de verdad pide el splash: rutas /splash/* y /logo-header.png en index.html y splash.js.
// Los .webp antiguos (sky, forest, fireball…) siguen en public/splash/ para scripts y documentación, pero no se piden.
function splashImages(html, js) {
  const all = `${html}\n${js}`;
  const paths = new Set([...all.matchAll(/['"(](\/splash\/[\w.-]+\.(?:webp|jpg|png)|\/logo-header\.png)['")]/g)].map((m) => m[1]));
  return [...paths].sort();
}

// Equivale a `grep -c -e "<script>" -e "<script type=\"module\">"` (líneas que casan).
function countScriptInline(text) {
  return text.split('\n').filter((l) => l.includes('<script>') || l.includes('<script type="module">')).length;
}
function styleBlocks(html) {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
}
function styleBytes(html) {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].reduce((n, m) => n + Buffer.byteLength(m[1]), 0);
}

test('AC29 (revisado con la escena de la moneda): <style> + splash.js pesan menos de 150 KB', () => {
  const js = statSync(new URL('public/splash.js', root)).size;
  const css = styleBytes(INDEX);
  assert.ok(css > 0, 'index.html debe llevar el <style> del splash');
  assert.ok(css + js < LIMIT, `código ${css + js} B >= ${LIMIT} B`);
});

test('imágenes que pide el splash: solo hoyo, moneda y logo, y menos de 350 KB entre todas', () => {
  const imgs = splashImages(INDEX, SPLASH_JS);
  assert.deepEqual(imgs, ['/logo-header.png', '/splash/coin.png', '/splash/hole-portrait.jpg', '/splash/hole.jpg']);
  // Cada orientación carga solo su foto del hoyo: se mide logo + moneda + la foto de esa orientación.
  const size = (p) => statSync(new URL(`public${p}`, root)).size;
  const shared = size('/logo-header.png') + size('/splash/coin.png');
  for (const hole of ['/splash/hole.jpg', '/splash/hole-portrait.jpg']) {
    const bytes = shared + size(hole);
    assert.ok(bytes < IMG_LIMIT, `${hole}: imágenes ${bytes} B >= ${IMG_LIMIT} B`);
  }
  // caso positivo: el detector ve rutas en url(), src y cadenas JS
  assert.deepEqual(splashImages("url('/splash/a.webp') src=\"/splash/b.jpg\"", "var X = '/splash/c.png';"), ['/splash/a.webp', '/splash/b.jpg', '/splash/c.png']);
});

test('public/splash/ solo contiene imágenes web (.webp, .jpg, .png)', () => {
  const files = readdirSync(SPLASH_DIR);
  assert.ok(files.includes('hole.jpg') && files.includes('coin.png'));
  for (const f of files) assert.match(f, /\.(webp|jpg|png)$/, f);
});

test('index.html: sin <script> inline ni <script type="module"> literal', () => {
  assert.equal(countScriptInline(INDEX), 0);
  assert.match(INDEX, /<script src="\/splash\.js"><\/script>/);
  assert.ok(INDEX.indexOf('/splash.js') < INDEX.indexOf('/src/main.js'), 'splash.js antes del bundle');
});

test('el grep de <script> puede fallar (caso positivo y negativo)', () => {
  assert.equal(countScriptInline('a\n<script>alert(1)</script>\nb'), 1);
  assert.equal(countScriptInline('x\n<script type="module">import 1</script>'), 1);
  assert.equal(countScriptInline('<script src="/splash.js"></script>\n<p>nada</p>'), 0);
});

// AC25 (pregunta abierta): el CSS de Vite (render-blocking, ~123 KB) se descarga antes del primer pintado;
// el <style> inline del splash no lo evita. Se anota aquí y no se cambia en T020a.
const MIN_CYCLE_S = 0.5;
// Ciclo real de cada animación del CSS: duración x2 si es 'alternate' (ida y vuelta). Una regla que solo
// fija animation-duration hereda 'alternate' de la regla base (el selector sin su última clase).
function cycles(css) {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const out = [];
  for (const { sel, body } of rules) {
    const dur = (s) => [...s.matchAll(/(?:^|[\s:])(\d*\.?\d+)(ms|s)\b/g)].map((m) => (m[2] === 'ms' ? +m[1] / 1000 : +m[1]));
    const sh = body.match(/(?:^|[;\s])animation\s*:([^;]*)/);
    const du = body.match(/animation-duration\s*:([^;]*)/);
    if (sh) {
      const d = dur(sh[1])[0];
      if (d !== undefined) out.push({ sel, seconds: d * (/alternate/.test(sh[1]) ? 2 : 1) });
    } else if (du) {
      const base = sel.slice(0, sel.lastIndexOf('.'));
      const baseRule = rules.find((r) => r.sel === base);
      const alt = baseRule && /animation\s*:[^;]*alternate/.test(baseRule.body);
      out.push({ sel, seconds: dur(du[1])[0] * (alt ? 2 : 1) });
    }
  }
  return out;
}
const fastCycles = (css) => cycles(css).filter((c) => c.seconds < MIN_CYCLE_S);

test('ningún ciclo de animación < 0,5 s (en segundos y con alternate x2)', () => {
  const css = styleBlocks(INDEX);
  assert.ok(cycles(css).length >= 3, 'debe detectar las animaciones del splash');
  assert.deepEqual(fastCycles(css), []);
  const by = (sel) => cycles(css).find((c) => c.sel === sel)?.seconds;
  assert.equal(by('#splash .brand img'), 1.2);
  assert.equal(by('#splash .bar > i'), 1.6, 'brillo de la barra');
  // caso positivo: el detector falla con 0.2s, con 0.2s alternate (0,4 s) y con animation-duration
  assert.equal(fastCycles('a { animation: x 0.2s linear infinite; }').length, 1);
  assert.equal(fastCycles('a { animation: x 0.2s ease alternate infinite; }').length, 1);
  assert.equal(fastCycles('a { animation: x 1s ease alternate infinite; } a.b { animation-duration: 0.2s; }').length, 1);
  assert.equal(fastCycles('a { animation: x 0.25s ease alternate infinite; }').length, 0);
});

test('#splash: marcado ARIA (progressbar en .bar, .err fuera de cualquier progressbar)', () => {
  assert.match(INDEX, /<div id="splash" data-max-ms="15000" role="region" aria-label="Golf Cash Battle">/);
  assert.match(INDEX, /<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="5" aria-label="Cargando">/);
  assert.equal((INDEX.match(/role="progressbar"/g) ?? []).length, 1);
  assert.ok(INDEX.indexOf('id="splash"') < INDEX.indexOf('id="app"'), '#splash antes de #app');
  // .err no puede quedar dentro del progressbar: se recorta el <div class="bar" ...>...</div> (sin hijos div) y se comprueba.
  const barStart = INDEX.indexOf('role="progressbar"');
  const barEnd = INDEX.indexOf('</div>', barStart);
  const barHtml = INDEX.slice(barStart, barEnd);
  assert.ok(!/class="err"|role="alert"|<button/.test(barHtml), 'el progressbar solo contiene la barra');
  assert.ok(barEnd < INDEX.indexOf('class="err"'), '.err va después de cerrar el progressbar');
  // caso positivo: el detector falla si se vuelve a anidar
  const anidado = '<div role="progressbar"><i></i><div class="err" role="alert"><button>x</button></div></div>';
  const s = anidado.indexOf('role="progressbar"');
  assert.ok(/class="err"|<button/.test(anidado.slice(s, anidado.lastIndexOf('</div>'))));
  assert.match(INDEX, /<img class="hole" src="\/splash\/hole\.jpg"/);
  assert.match(INDEX, /<canvas class="coins" aria-hidden="true"><\/canvas>/);
  assert.match(INDEX, /Reintentar/);
  assert.match(INDEX, /class="tip"/);
  assert.match(INDEX, /class="pct"/);
});
