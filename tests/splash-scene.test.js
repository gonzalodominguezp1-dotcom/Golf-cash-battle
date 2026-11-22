// Splash: la moneda cae al hoyo. Comprobaciones sin navegador: marcado y CSS de index.html,
// geometría del hoyo (cover) y simulación de las monedas de public/splash.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const INDEX = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const SRC = readFileSync(new URL('../public/splash.js', import.meta.url), 'utf8');
const SPLASH_HTML = INDEX.slice(INDEX.indexOf('<div id="splash"'), INDEX.indexOf('<div id="app">'));
const CSS = [...INDEX.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const rule = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`).exec(CSS);
  return m ? m[1] : '';
};

function view() {
  const window = {};
  vm.runInContext(SRC, vm.createContext({ window, Date }), { filename: 'public/splash.js' });
  return window.__gcbSplashView;
}
// Aleatorio determinista (LCG) para que la simulación sea repetible.
function seeded(seed = 7) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

test('la escena existe: #splash lleva la foto del hoyo y un <canvas> para las monedas', () => {
  assert.match(SPLASH_HTML, /<img class="hole" src="\/splash\/hole\.jpg" alt="" width="1376" height="768"[^>]*aria-hidden="true"/);
  assert.match(SPLASH_HTML, /<canvas class="coins" aria-hidden="true"><\/canvas>/);
  assert.ok(SPLASH_HTML.indexOf('class="hole"') < SPLASH_HTML.indexOf('class="coins"'), 'el canvas va encima del hoyo');
  assert.ok(SPLASH_HTML.indexOf('class="coins"') < SPLASH_HTML.indexOf('class="loader"'), 'la barra va encima de las monedas');
  assert.match(SPLASH_HTML, /<picture class="hole-pic"><source media="\(orientation: portrait\)" srcset="\/splash\/hole-portrait\.jpg" \/>/, 'vertical: foto propia');
  assert.match(INDEX, /<link rel="preload" as="image" type="image\/jpeg" href="\/splash\/hole\.jpg" media="\(orientation: landscape\)" fetchpriority="high" \/>/);
  assert.match(INDEX, /href="\/splash\/hole-portrait\.jpg" media="\(orientation: portrait\)"/);
  assert.match(SRC, /'\/splash\/coin\.png'/);
});

test('fuera la portada anterior: sin capas sky/forest/green, bola de fuego, logo-hero ni vídeo', () => {
  for (const s of ['class="layer', 'fireball', 'logo-hero', 'ball-shadow', '<video', 'lobby-loop', 'lobby-poster']) {
    assert.ok(!SPLASH_HTML.includes(s), `marcado: ${s}`);
  }
  for (const s of ['.sky', '.forest', '.green', '.fire', 'lobby-poster', 'logo-hero']) assert.ok(!CSS.includes(s), `CSS: ${s}`);
  for (const s of ['lobby-loop', 'videoOn', 'elVideo', 'BASES', 'SCALES']) assert.ok(!SRC.includes(s), `splash.js: ${s}`);
});

// Detector de sonido/vibración: llamadas, constructores y elementos multimedia.
const NOISE = /navigator\s*\.\s*vibrate|\.vibrate\s*\(|new\s+(?:window\.|root\.)?Audio\b|AudioContext|webkitAudioContext|<audio|<video|\.play\s*\(/;
test('sin sonido ni vibración: ni navigator.vibrate, ni Audio/AudioContext, ni <audio>/<video> en el splash', () => {
  assert.doesNotMatch(SRC, NOISE);
  assert.doesNotMatch(SPLASH_HTML, NOISE);
  // caso positivo: el detector salta con cada forma prohibida
  for (const bad of ['navigator.vibrate(30)', 'root.navigator.vibrate([10])', 'new Audio("x.mp3")', 'new root.Audio()',
    'new (window.AudioContext || window.webkitAudioContext)()', '<audio src="a">', 'v.play()']) {
    assert.match(bad, NOISE, bad);
  }
});

test('el hoyo: cover con escala de margen 1,06 en horizontal; en vertical, tamaño fijo y bordes que se funden a negro', () => {
  const hole = rule('#splash .hole');
  assert.match(hole, /position:\s*absolute/);
  assert.match(hole, /inset:\s*0/);
  assert.match(hole, /width:\s*100%/);
  assert.match(hole, /height:\s*100%/);
  assert.match(hole, /object-fit:\s*cover/);
  assert.match(hole, /transform:\s*scale\(1\.06\)/);
  assert.match(CSS, /@media \(orientation: portrait\) \{\s*#splash \.hole \{ transform: none; \}/);
  assert.doesNotMatch(CSS, /mask-image/, 'sin viñeta: la foto no se funde a negro');
  const coins = rule('#splash .coins');
  assert.match(coins, /inset:\s*0/);
  assert.match(coins, /pointer-events:\s*none/);
});

test('holeGeom: en horizontal la foto cubre la pantalla; en vertical mide el 150 % del ancho; el hoyo queda centrado', () => {
  const { holeGeom } = view();
  for (const [W, H] of [[1920, 1080], [1280, 720], [390, 844], [844, 390], [768, 1024], [1000, 1000], [320, 568]]) {
    for (const [px, py] of [[0, 0], [1, 1], [-1, -1], [1, -1]]) {
      const g = holeGeom(W, H, px, py);
      // en ambas orientaciones la foto cubre toda la pantalla, también con el parallax al máximo
      assert.ok(g.ox <= 0 && g.oy <= 0, `${W}x${H} ${px},${py}: sin hueco arriba/izquierda`);
      assert.ok(g.ox + g.dw >= W && g.oy + g.dh >= H, `${W}x${H} ${px},${py}: sin hueco abajo/derecha`);
    }
    const g = holeGeom(W, H, 0, 0);
    assert.ok(Math.abs(g.hx - W / 2) < W * 0.01, `${W}x${H}: hoyo centrado en horizontal`);
    if (H > W) {
      assert.ok(Math.abs(g.hy - H / 2) < H * 0.01, `${W}x${H}: hoyo centrado en vertical`);
    } else {
      assert.ok(Math.abs(g.hy - H / 2) < H * 0.01, `${W}x${H}: hoyo centrado en vertical`);
      assert.ok(Math.abs(g.k - Math.max(W / 1376, H / 768) * 1.06) < 1e-9, `${W}x${H}: horizontal = cover x 1,06`);
    }
    assert.ok(g.holeR > 0);
  }
});

test('simulación: hasta 60 monedas a la vez, una cada 0,1–0,22 s, entrando desde fuera por los 4 bordes', () => {
  const { createCoinScene, holeGeom, MAX_COINS } = view();
  assert.equal(MAX_COINS, 60);
  const W = 1280, H = 720, g = holeGeom(W, H, 0, 0);
  const sc = createCoinScene(seeded(3));
  const edges = new Set();
  let peak = 0, spawned = 0;
  for (let i = 0; i < 2000; i++) {
    sc.update(0.016, W, H, g, 0, 0, true);
    peak = Math.max(peak, sc.coins.length);
    for (const c of sc.coins) {
      if (c._seen) continue;
      c._seen = true;
      spawned++;
      assert.ok(c.fx < 0 || c.fx > 1 || c.fy < 0 || c.fy > 1, 'nace fuera de la pantalla');
      edges.add(c.fy < 0 ? 'arriba' : c.fx > 1 ? 'derecha' : c.fy > 1 ? 'abajo' : 'izquierda');
    }
  }
  assert.ok(peak <= 60, `pico ${peak}`);
  // tope: aunque toque nacer en cada paso, nunca más de 60 a la vez
  const full = createCoinScene(seeded(9));
  for (let i = 0; i < 100; i++) { full.spawnT = 0; full.update(0, W, H, g, 0, 0, true); }
  assert.equal(full.coins.length, 60);
  assert.deepEqual([...edges].sort(), ['abajo', 'arriba', 'derecha', 'izquierda']);
  // 32 s de simulación, primera moneda a los 0,4 s: entre 31,6/0,22 y 31,6/0,1 monedas
  assert.ok(spawned >= Math.floor(31.6 / 0.22) && spawned <= Math.ceil(31.6 / 0.1) + 1, `nacieron ${spawned}`);
});

test('simulación: la moneda acelera hacia el hoyo, gira en Y, se hunde, se desvanece y suelta chispas y $/↑ verdes', () => {
  const { createCoinScene, holeGeom } = view();
  const W = 1000, H = 800, g = holeGeom(W, H, 0, 0);
  const sc = createCoinScene(seeded(11));
  sc.update(0.4, W, H, g, 0, 0, true);                     // nace la primera
  assert.equal(sc.coins.length, 1);
  const c = sc.coins[0];
  const dist = () => Math.hypot(c.x - g.hx, c.y - g.hy);
  const steps = [];
  const flips = new Set();
  let last = dist();
  while (!c.landed) {
    sc.update(0.02, W, H, g, 0, 0, false);
    const d = dist();
    steps.push(last - d);
    last = d;
    flips.add(c.flip.toFixed(2));
    assert.ok(c.flip >= 0.12 && c.flip <= 1, 'giro en Y con cos(ángulo), nunca de canto del todo');
  }
  assert.ok(steps[Math.floor(steps.length * 0.6)] > steps[2], 'acelera: avanza más al final que al principio');
  assert.ok(flips.size > 10, 'gira');
  assert.equal(c.fade, 0, 'se desvanece al entrar');
  assert.ok(c.size < Math.min(W, H) * 0.2 * 0.3, 'se hace pequeña al hundirse');
  assert.equal(sc.coins.length, 0, 'desaparece en el hoyo');
  assert.equal(sc.landed, 1);
  assert.equal(sc.sparks.length, 14);
  assert.equal(sc.pops.length, 3);
  for (const p of sc.pops) {
    assert.ok(p.ch === '$' || p.ch === '↑');
    assert.ok(p.vy < 0, 'suben');
    assert.ok(Math.abs(p.x - g.hx) <= g.holeR * 0.8 + 1e-9, 'salen del hoyo');
  }
  for (let i = 0; i < 100; i++) sc.update(0.02, W, H, g, 0, 0, false);
  assert.equal(sc.sparks.length, 0, 'las chispas se apagan');
  assert.equal(sc.pops.length, 0, 'los símbolos se desvanecen');
});

test('dibujo: símbolos en verde con brillo y chispas en modo lighter; sin moneda cargada no se pinta ninguna', () => {
  const { createCoinScene, holeGeom } = view();
  const W = 800, H = 600, g = holeGeom(W, H, 0, 0);
  const sc = createCoinScene(seeded(5));
  const log = [];
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : (...a) => log.push([k, ...a])),
    set: (o, k, v) => { o[k] = v; log.push([`=${String(k)}`, v]); return true; }
  });
  sc.update(0.4, W, H, g, 0, 0, true);
  sc.draw(ctx, W, H, null);
  assert.ok(!log.some((l) => l[0] === 'drawImage'));
  sc.coins.length = 0;
  sc.update(0.4, W, H, g, 0, 0, true);
  log.length = 0;
  sc.draw(ctx, W, H, { coin: true });
  assert.ok(log.some((l) => l[0] === 'drawImage'));
  // tras entrar la primera moneda hay chispas y símbolos
  const sc2 = createCoinScene(seeded(5));
  sc2.update(0.4, W, H, g, 0, 0, true);
  for (let i = 0; i < 300 && !sc2.landed; i++) sc2.update(0.02, W, H, g, 0, 0, false);
  log.length = 0;
  sc2.draw(ctx, W, H, null);
  assert.ok(log.some((l) => l[0] === '=globalCompositeOperation' && l[1] === 'lighter'));
  assert.ok(log.some((l) => l[0] === '=fillStyle' && l[1] === '#3dff7a'));
  assert.ok(log.some((l) => l[0] === 'fillText' && (l[1] === '$' || l[1] === '↑')));
});

test('estado de error: sigue la tarjeta con «Reintentar» y se ocultan barra y tip', () => {
  assert.match(SPLASH_HTML, /<div class="err" role="alert">[\s\S]*<button type="button" class="retry">Reintentar<\/button>/);
  assert.match(rule('#splash[data-state="error"] .err'), /display:\s*grid/);
  assert.match(CSS, /#splash\[data-state="error"\] \.prog, #splash\[data-state="error"\] \.tip \{ display: none; \}/);
  assert.match(rule('#splash .err'), /display:\s*none/);
});

test('barra real: progressbar con aria-valuemin/max/valuenow, estado, porcentaje, hitos y tip bajo la barra', () => {
  assert.match(SPLASH_HTML, /<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="5" aria-label="Cargando">/);
  assert.match(SPLASH_HTML, /<span class="label" role="status">/);
  assert.match(SPLASH_HTML, /<span class="pct">5 %<\/span>/);
  assert.match(SPLASH_HTML, /<span class="ticks" aria-hidden="true"><\/span>/);
  assert.ok(SPLASH_HTML.indexOf('class="tip"') > SPLASH_HTML.indexOf('class="bar"'), 'tip bajo la barra');
  assert.match(SPLASH_HTML, /<span class="tip-text">/);
  assert.match(rule('#splash .tip'), /font-size:\s*13px/);
});

test('logo pequeño arriba como marca (/logo-header.png)', () => {
  assert.match(SPLASH_HTML, /<div class="brand"><img src="\/logo-header\.png" alt="Golf Cash Battle" width="139" height="120" \/><\/div>/);
  assert.match(rule('#splash .brand img'), /height:\s*clamp\(84px, 17vh, 124px\)/);
});

test('pantalla segura: márgenes de 16 px con safe-area, sin scroll horizontal', () => {
  const loader = rule('#splash .loader');
  assert.match(loader, /left:\s*max\(16px, env\(safe-area-inset-left, 0px\)\)/);
  assert.match(loader, /right:\s*max\(16px, env\(safe-area-inset-right, 0px\)\)/);
  assert.match(loader, /bottom:\s*max\(16px, calc\(env\(safe-area-inset-bottom, 0px\)/);
  assert.match(rule('#splash .brand'), /top:\s*max\(16px, calc\(env\(safe-area-inset-top, 0px\)/);
  assert.match(rule('#splash'), /overflow:\s*hidden/);
  assert.match(rule('#splash'), /inset:\s*0/);
});

test('splash.js sigue siendo ES5 en la capa visual: sin flechas, let/const, clases ni ??', () => {
  const visual = SRC.slice(SRC.indexOf('// ---- Capa visual'));
  const code = visual.replace(/\/\/[^\n]*/g, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  assert.doesNotMatch(code, /=>|\blet\s|\bconst\s|\bclass\s|\?\?|`/);
});
