import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { defaultQuality } from '../src/game/render/quality.js';

const SRC = readFileSync(new URL('../public/splash.js', import.meta.url), 'utf8');

function load(env = {}) {
  const window = env.window ?? {};
  const ctx = vm.createContext({ window, navigator: env.navigator, Date });
  vm.runInContext(SRC, ctx, { filename: 'public/splash.js' });
  return window;
}
function clock(t0 = 1000) {
  const c = { t: t0, now: () => c.t };
  return c;
}
function make(opts = {}) {
  const w = load();
  const c = clock();
  const core = w.__gcbSplashCore.createSplashCore({ now: c.now, ...opts });
  return { w, c, core, api: w.__gcbSplashCore };
}
const ORDER = ['html', 'bundle', 'session', 'progress', 'three', 'scene'];

test('se expone la API en window (script clásico) y el núcleo puro', () => {
  const w = load();
  for (const k of ['mark', 'done', 'fail', 'hideNow']) assert.equal(typeof w.gcbSplash[k], 'function', k);
  assert.equal(typeof w.__gcbSplashCore.createSplashCore, 'function');
});

test('progreso: % monotónico, nunca baja y <100 sin hub', () => {
  const { core } = make();
  let prev = 0;
  for (const n of ORDER) {
    const p = core.mark(n);
    assert.ok(p > prev, `${n} sube`);
    assert.ok(p < 100, `${n} <100 sin hub`);
    prev = p;
  }
  assert.equal(core.mark('html'), prev, 'repetir un hito no baja ni sube');
  assert.equal(core.mark('desconocido'), prev, 'hito desconocido se ignora');
  assert.equal(core.mark('hub'), 100);
  assert.equal(core.mark('html'), 100);
});

test('pesos por defecto suman 100', () => {
  const { api } = make();
  assert.equal(Object.values(api.WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test('phase: último hito alcanzado según el orden de arranque', () => {
  const { core } = make();
  assert.equal(core.phase(), null, 'sin hitos');
  core.mark('html');
  assert.equal(core.phase(), 'html');
  core.mark('session');
  core.mark('bundle');
  assert.equal(core.phase(), 'session', 'bundle va antes que session');
  core.mark('hub');
  assert.equal(core.phase(), 'hub');
});

test('canHide: falso antes de 600 ms aunque haya hub; verdadero después', () => {
  const { core, c } = make();
  assert.equal(core.canHide(c.now()), false, 'sin hub');
  ORDER.forEach((n) => core.mark(n));
  core.mark('hub');
  c.t += 599;
  assert.equal(core.canHide(c.now()), false);
  assert.equal(core.state(c.now()), 'loading');
  c.t += 1;
  assert.equal(core.canHide(c.now()), true);
  assert.equal(core.state(c.now()), 'ready');
});

test('canHide: sin hub nunca, ni pasado el tiempo', () => {
  const { core, c } = make();
  core.mark('session');
  c.t += 5000;
  assert.equal(core.canHide(c.now()), false);
});

test('error al llegar a maxMs sin session; con session no hay error', () => {
  const a = make({ maxMs: 15000 });
  a.c.t += 14999;
  assert.equal(a.core.state(a.c.now()), 'loading');
  a.c.t += 1;
  assert.equal(a.core.state(a.c.now()), 'error');

  const b = make({ maxMs: 15000 });
  b.core.mark('session');
  b.c.t += 60000;
  assert.notEqual(b.core.state(b.c.now()), 'error');
});

test('maxMs configurable y 15000 por defecto', () => {
  const { core, c } = make();
  c.t += 14999;
  assert.notEqual(core.state(c.now()), 'error');
  c.t += 1;
  assert.equal(core.state(c.now()), 'error');
  const s = make({ maxMs: 3000 });
  s.c.t += 3000;
  assert.equal(s.core.state(s.c.now()), 'error');
});

test('fail(reason) fuerza el estado error; hideNow permite ocultar', () => {
  const w = load();
  w.gcbSplash.fail('x');
  assert.equal(w.gcbSplash.core.state(Date.now()), 'error');
  const w2 = load();
  assert.equal(w2.gcbSplash.core.canHide(Date.now()), false);
  w2.gcbSplash.hideNow();
  assert.equal(w2.gcbSplash.core.canHide(Date.now()), true);
});

test('done() completa la barra (login sin sesión)', () => {
  const w = load();
  w.gcbSplash.done();
  assert.equal(w.gcbSplash.core.pct(), 100);
});

test('TIP rota cada 4 s y da la vuelta', () => {
  const { core, api, c } = make();
  const t0 = c.now();
  const tips = ['a', 'b', 'c'];
  assert.equal(core.tipAt(t0, tips), 0);
  assert.equal(core.tipAt(t0 + 3999, tips), 0);
  assert.equal(core.tipAt(t0 + 4000, tips), 1);
  assert.equal(core.tipAt(t0 + 8000, tips), 2);
  assert.equal(core.tipAt(t0 + 12000, tips), 0);
  assert.equal(core.tipAt(t0 + 500, tips, 500), 1);
  assert.equal(core.tipAt(t0 - 5, tips), 0);
  assert.equal(core.tipAt(t0 + 10, []), 0);
  assert.ok(api.TIPS.length >= 3 && api.TIPS.every((t) => typeof t === 'string' && t.length));
});

test('capas: low < high; reducido 3 estáticas', () => {
  const { core } = make();
  assert.ok(core.layersFor('low') < core.layersFor('high'));
  assert.equal(core.layersFor('high'), 3);
  assert.equal(core.layersFor('medium'), 3);
  assert.equal(core.layersFor('low'), 2);
  assert.equal(core.layersFor('low', true), 3);
  assert.equal(core.layersFor('xx'), 3);
});

test('destello/parpadeo: periodo mínimo 500 ms (<=2 Hz, AC33)', () => {
  const { api } = make();
  assert.ok(api.FLASH_MIN_MS >= 500);
  assert.equal(api.flashPeriod(100), 500);
  assert.equal(api.flashPeriod(0), 500);
  assert.equal(api.flashPeriod(NaN), 500);
  assert.equal(api.flashPeriod(1200), 1200);
});

test('calidad: lo guardado manda; paridad con defaultQuality()', () => {
  const { api } = make();
  assert.equal(api.qualityFor({ stored: 'low' }), 'low');
  assert.equal(api.qualityFor({ stored: 'basura', width: 1920, finePointer: true }), 'high');
  const g = globalThis;
  const saved = { window: g.window, navigator: Object.getOwnPropertyDescriptor(g, 'navigator') };
  const cases = [
    { width: 1920, fine: true, mem: 8, cores: 8, ua: 'Windows' },
    { width: 1920, fine: false, mem: 8, cores: 8, ua: 'Windows' },
    { width: 390, fine: false, mem: 4, cores: 8, ua: 'iPhone' },
    { width: 390, fine: false, mem: 2, cores: 8, ua: 'iPhone' },
    { width: 390, fine: false, mem: 8, cores: 4, ua: 'Android' },
    { width: 390, fine: false, mem: 8, cores: 8, ua: 'Android' },
    { width: 390, fine: false, mem: undefined, cores: undefined, ua: 'iPhone' },
    { width: 900, fine: true, mem: 8, cores: 8, ua: 'Mac' },
  ];
  try {
    for (const k of cases) {
      g.window = { innerWidth: k.width, matchMedia: () => ({ matches: k.fine }) };
      Object.defineProperty(g, 'navigator', {
        configurable: true,
        value: { deviceMemory: k.mem, hardwareConcurrency: k.cores, userAgent: k.ua },
      });
      const expected = defaultQuality();
      const got = api.qualityFor({
        stored: null, width: k.width, finePointer: k.fine, deviceMemory: k.mem, cores: k.cores, userAgent: k.ua,
      });
      assert.equal(got, expected, JSON.stringify(k));
    }
  } finally {
    g.window = saved.window;
    if (saved.navigator) Object.defineProperty(g, 'navigator', saved.navigator);
    else delete g.navigator;
  }
});

test('configure({maxMs}) cambia el máximo de la instancia real; ignora inválidos', () => {
  const w = load();
  const g = w.gcbSplash;
  assert.equal(g.core.getMaxMs(), 15000);
  g.configure({ maxMs: 3000 });
  assert.equal(g.core.getMaxMs(), 3000);
  for (const bad of [0, -1, NaN, Infinity, '5000', null, undefined]) {
    g.configure({ maxMs: bad });
    assert.equal(g.core.getMaxMs(), 3000, String(bad));
  }
  g.configure();
  g.configure(null);
  assert.equal(g.core.getMaxMs(), 3000);
  const t0 = g.core.startedAt();
  assert.equal(g.core.state(t0 + 2999), 'loading');
  assert.equal(g.core.state(t0 + 3000), 'error');
});

test('readStoredQuality: válido, ausente, corrupto, inválido y storage que lanza', () => {
  const { api } = make();
  const st = (v) => ({ getItem: () => v });
  const ok = JSON.stringify({ quality: { mobile: 'low', desktop: 'high' } });
  assert.equal(api.readStoredQuality(st(ok), 'mobile'), 'low');
  assert.equal(api.readStoredQuality(st(ok), 'desktop'), 'high');
  assert.equal(api.readStoredQuality(st(null), 'mobile'), undefined);
  assert.equal(api.readStoredQuality(st(JSON.stringify({ quality: {} })), 'mobile'), undefined);
  assert.equal(api.readStoredQuality(st(JSON.stringify({})), 'mobile'), undefined);
  assert.equal(api.readStoredQuality(st('{no json'), 'mobile'), undefined);
  assert.equal(api.readStoredQuality(st('null'), 'mobile'), undefined);
  assert.equal(api.readStoredQuality(st(JSON.stringify({ quality: { mobile: 'ultra' } })), 'mobile'), undefined);
  assert.equal(api.readStoredQuality({ getItem() { throw new Error('private'); } }, 'mobile'), undefined);
  assert.equal(api.readStoredQuality(undefined, 'mobile'), undefined);
});

test('qualityKind: puntero grueso = mobile, si no desktop', () => {
  const { api } = make();
  assert.equal(api.qualityKind({ coarsePointer: true }), 'mobile');
  assert.equal(api.qualityKind({ coarsePointer: false }), 'desktop');
  assert.equal(api.qualityKind(), 'desktop');
});

test('reloj: un t anterior al inicio cuenta como 0', () => {
  const { core, c } = make();
  ORDER.forEach((n) => core.mark(n));
  core.mark('hub');
  assert.equal(core.canHide(c.now() - 5000), false);
  assert.equal(core.state(c.now() - 5000), 'loading');
  assert.equal(core.tipAt(c.now() - 5000, ['a', 'b']), 0);
  const e = make({ maxMs: 100 });
  assert.equal(e.core.state(e.c.now() - 1e6), 'loading');
});

test('emit itera sobre una copia: desuscribir dentro de un oyente no salta al siguiente', () => {
  const w = load();
  const calls = [];
  const un1 = w.gcbSplash.subscribe(() => { calls.push('a'); un1(); });
  w.gcbSplash.subscribe(() => calls.push('b'));
  w.gcbSplash.subscribe(() => { throw new Error('roto'); });
  w.gcbSplash.subscribe(() => calls.push('c'));
  w.gcbSplash.mark('bundle');
  assert.deepEqual(calls, ['a', 'b', 'c']);
  w.gcbSplash.mark('session');
  assert.deepEqual(calls, ['a', 'b', 'c', 'b', 'c']);
});

test('pesos personalizados: tope 99 sin hub, 100 con hub', () => {
  const { core } = make({ weights: { html: 50, bundle: 50, hub: 10 } });
  assert.equal(core.mark('html'), 50);
  assert.equal(core.mark('bundle'), 99);
  assert.equal(core.mark('hub'), 100);
});

test('qualityFor: umbrales exactos (memoria 3/4, núcleos 4/5, ancho 899/900)', () => {
  const { api } = make();
  const mob = { width: 390, finePointer: false, userAgent: 'iPhone' };
  assert.equal(api.qualityFor({ ...mob, deviceMemory: 3 }), 'low');
  assert.equal(api.qualityFor({ ...mob, deviceMemory: 4 }), 'medium');
  const and = { ...mob, userAgent: 'Android' };
  assert.equal(api.qualityFor({ ...and, cores: 4 }), 'low');
  assert.equal(api.qualityFor({ ...and, cores: 5 }), 'medium');
  assert.equal(api.qualityFor({ ...mob, cores: 2 }), 'medium');
  assert.equal(api.qualityFor({ width: 899, finePointer: true }), 'medium');
  assert.equal(api.qualityFor({ width: 900, finePointer: true }), 'high');
  assert.equal(api.qualityFor({ width: 1920, finePointer: false }), 'medium');
});

// ---- Capa visual: la moneda cae al hoyo. DOM falso mínimo, sin navegador ----
function fakeEl(extra = {}) {
  const attrs = {};
  const cls = new Set();
  const ls = {};
  return Object.assign({
    hidden: false, textContent: '', style: {},
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return k in attrs ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
    addEventListener(t, fn) { (ls[t] = ls[t] || []).push(fn); },
    removeEventListener(t, fn) { ls[t] = (ls[t] || []).filter((f) => f !== fn); },
    fire(t, ev) { (ls[t] || []).slice().forEach((f) => f(ev || {})); },
    count(t) { return (ls[t] || []).length; }
  }, extra);
}
// Contexto 2D falso: cuenta llamadas y guarda los textos pintados.
function fakeCtx() {
  const calls = {};
  const texts = [];
  const hit = (k) => () => { calls[k] = (calls[k] || 0) + 1; };
  const c = { calls, texts, globalAlpha: 1, globalCompositeOperation: 'source-over' };
  for (const k of ['clearRect', 'save', 'restore', 'translate', 'scale', 'drawImage', 'beginPath', 'arc', 'fill', 'setTransform']) c[k] = hit(k);
  c.fillText = (t) => { calls.fillText = (calls.fillText || 0) + 1; texts.push(t); };
  return c;
}
const VIEW_ELS = ['.pct', '.bar', '.bar > i', '.tip-text', '.retry', '.label', '.hole'];
function loadView({
  reduced = false, maxMs = '15000', stored = 'high', coarse = false, noRaf = false, deferDoc = false,
  throwPointer = false, saveData = false, canvas = true, ticks = false, w = 1280, h = 720
} = {}) {
  const t = { now: 1000 };
  const els = {};
  for (const k of VIEW_ELS) els[k] = fakeEl();
  const ctx2d = fakeCtx();
  if (canvas) els['.coins'] = fakeEl({ width: 0, height: 0, getContext: (kind) => (kind === '2d' ? ctx2d : null) });
  if (ticks) {
    const box = fakeEl({ kids: [], appendChild(c) { this.kids.push(c); } });
    Object.defineProperty(box, 'textContent', { get: () => '', set() { box.kids = []; } });
    els['.ticks'] = box;
  }
  const child = fakeEl();
  const splash = fakeEl({ dataset: { maxMs }, querySelector: (s) => els[s] || null });
  const timers = { raf: new Map(), intervals: new Map(), timeouts: new Map(), nextId: 1, rafCalls: 0 };
  const mqls = {};
  const images = [];
  const doc = fakeEl({ hidden: false, getElementById: (id) => (id === 'splash' ? splash : null), createElement: () => fakeEl({ className: '' }) });
  const win = fakeEl({
    innerWidth: w, innerHeight: h, devicePixelRatio: 3,
    localStorage: { getItem: () => (stored ? JSON.stringify({ quality: { desktop: stored, mobile: stored } }) : null) },
    matchMedia: (q) => {
      if (!mqls[q]) mqls[q] = fakeEl({ matches: /reduced-motion/.test(q) ? reduced : (/coarse/.test(q) ? coarse : false) });
      return mqls[q];
    },
    Image: function FakeImage() { images.push(this); },
    setInterval(fn) { const id = timers.nextId++; timers.intervals.set(id, fn); return id; },
    clearInterval(id) { timers.intervals.delete(id); },
    setTimeout(fn) { const id = timers.nextId++; timers.timeouts.set(id, fn); return id; },
    clearTimeout(id) { timers.timeouts.delete(id); },
    location: { reload() { win.reloaded = (win.reloaded || 0) + 1; } },
    navigator: { userAgent: 'x', connection: { saveData } }
  });
  if (!noRaf) {
    win.requestAnimationFrame = (fn) => { timers.rafCalls++; const id = timers.nextId++; timers.raf.set(id, fn); return id; };
    win.cancelAnimationFrame = (id) => { timers.raf.delete(id); };
  }
  if (throwPointer) {
    const orig = win.addEventListener;
    win.addEventListener = (t2, fn) => { if (t2 === 'pointermove') throw new Error('boom'); orig(t2, fn); };
  }
  if (!deferDoc) win.document = doc;
  vm.runInContext(SRC, vm.createContext({ window: win, Date: { now: () => t.now } }), { filename: 'public/splash.js' });
  const tick = () => [...timers.intervals.values()].forEach((f) => f());
  const frame = (ts) => { const fs = [...timers.raf.values()]; timers.raf.clear(); fs.forEach((f) => f(ts)); };
  const run = (n, from = 100, step = 16) => { for (let i = 0; i < n; i++) frame(from + i * step); return from + n * step; };
  return { win, doc, splash, els, child, timers, mqls, images, ctx2d, t, tick, frame, run };
}
const inst = (v) => v.win.__gcbSplashView.instance;

test('visual: pct, ancho de barra y aria-valuenow siguen al núcleo', () => {
  const v = loadView();
  assert.equal(v.els['.pct'].textContent, '5 %');
  assert.equal(v.els['.bar'].getAttribute('aria-valuenow'), '5');
  v.win.gcbSplash.mark('bundle');
  assert.equal(v.els['.pct'].textContent, '25 %');
  assert.equal(v.els['.bar > i'].style.width, '25%');
  assert.equal(v.els['.bar'].getAttribute('aria-valuenow'), '25');
  v.win.gcbSplash.done();
  assert.equal(v.els['.bar'].getAttribute('aria-valuenow'), '100');
});

test('visual: data-max-ms configura el núcleo; error por maxMs con sondeo', () => {
  const v = loadView({ maxMs: '3000' });
  assert.equal(v.win.gcbSplash.core.getMaxMs(), 3000);
  v.tick();
  assert.equal(v.splash.getAttribute('data-state'), null);
  v.t.now += 3001;
  v.tick();
  assert.equal(v.splash.getAttribute('data-state'), 'error');
  assert.equal(v.els['.bar'].getAttribute('aria-label'), 'Error de carga');
});

test('visual: fail() pone error al instante y Reintentar recarga con listener', () => {
  const v = loadView();
  assert.equal(v.els['.retry'].count('click'), 1);
  assert.equal(v.els['.retry'].onclick, undefined);
  v.win.gcbSplash.fail('x');
  assert.equal(v.splash.getAttribute('data-state'), 'error');
  v.els['.retry'].fire('click');
  assert.equal(v.win.reloaded, 1);
});

test('visual: TIP rotatorio cada 4 s con aria-live apagado', () => {
  const v = loadView();
  const el = v.els['.tip-text'];
  assert.equal(el.getAttribute('aria-live'), 'off');
  v.tick();
  const first = el.textContent;
  assert.ok(v.win.__gcbSplashCore.TIPS.includes(first));
  v.t.now += 4000; v.tick();
  assert.notEqual(el.textContent, first);
  assert.equal(el.textContent, v.win.__gcbSplashCore.TIPS[1]);
});

test('escena: canvas animado con rAF; la moneda se pide con prioridad alta; caen monedas desde el primer fotograma', () => {
  const v = loadView();
  assert.equal(inst(v).animated, true);
  assert.equal(v.els['.coins'].hidden, false);
  assert.equal(v.timers.raf.size, 1);
  assert.equal(v.images.length, 1);
  assert.equal(v.images[0].src, '/splash/coin.png');
  assert.equal(v.images[0].fetchPriority, 'high');
  v.run(60);
  assert.equal(v.ctx2d.calls.drawImage ?? 0, 0, 'sin moneda cargada no se pinta ninguna');
  assert.ok(inst(v).scene.coins.length > 0, 'las monedas ya están en vuelo al empezar (prewarm)');
  v.images[0].onload();
  v.run(120, 2000);
  assert.ok(v.ctx2d.calls.drawImage > 0, 'pinta monedas');
  assert.ok(inst(v).scene.coins.length > 0);
  v.run(400, 5000);
  assert.ok(inst(v).scene.landed > 0, 'alguna moneda entra en el hoyo');
  assert.ok(v.ctx2d.texts.some((s) => s === '$' || s === '↑'), 'símbolos $ o ↑ al entrar');
  assert.ok(v.ctx2d.calls.arc > 0, 'chispas');
});

test('escena: canvas a la medida de la pantalla con DPR limitado (2 en high, 1,5 en medium)', () => {
  const v = loadView({ stored: 'high', w: 1000, h: 500 });
  assert.equal(v.els['.coins'].width, 2000);
  assert.equal(v.els['.coins'].height, 1000);
  const m = loadView({ stored: 'medium', w: 1000, h: 500 });
  assert.equal(m.els['.coins'].width, 1500);
  m.win.innerWidth = 400; m.win.innerHeight = 800; m.win.fire('resize');
  assert.equal(m.els['.coins'].width, 600);
  assert.equal(m.els['.coins'].height, 1200);
});

test('escena: el puntero (o el dedo) mueve el hoyo en sentido contrario; vertical = 150 % del ancho', () => {
  const base = loadView();
  base.run(3);
  const left0 = parseFloat(base.els['.hole'].style.left), top0 = parseFloat(base.els['.hole'].style.top);
  const v = loadView();
  assert.equal(v.splash.style.touchAction, 'none', 'arrastrar con el dedo no hace scroll');
  v.win.fire('pointermove', { clientX: 1280, clientY: 720 });   // esquina inferior derecha
  v.run(120);
  assert.equal(v.els['.hole'].style.transform, 'none', 'posición fija por píxeles, sin transform');
  assert.ok(parseFloat(v.els['.hole'].style.left) - left0 < -12, 'el fondo se aleja del puntero (x)');
  assert.ok(parseFloat(v.els['.hole'].style.top) - top0 < -8, 'el fondo se aleja del puntero (y)');
  const p = loadView({ w: 400, h: 800 });
  p.run(3);
  assert.ok(Math.abs(parseFloat(p.els['.hole'].style.height) - 820) < 1, 'vertical: la foto ocupa toda la pantalla (800 px + margen de parallax)');
});

test('escena: deviceorientation (Android) mueve el parallax sin pedir permiso', () => {
  const base = loadView();
  base.run(3);
  const left0 = parseFloat(base.els['.hole'].style.left);
  const v = loadView();
  assert.equal(v.win.count('deviceorientation'), 1);
  v.win.fire('deviceorientation', { gamma: 60, beta: 45 });       // gamma 60 → x = 1
  v.run(120);
  const x = parseFloat(v.els['.hole'].style.left) - left0;
  assert.ok(x < -12, String(x));
  const w = loadView();
  w.win.fire('deviceorientation', { gamma: null, beta: null });   // iOS sin permiso: no cambia nada
  w.run(60);
  assert.equal(parseFloat(w.els['.hole'].style.left), left0);
  assert.doesNotMatch(SRC, /requestPermission/, 'nunca pide permiso del sensor');
});

test('escena: calidad low = hoyo fijo, sin monedas, sin chispas, sin rAF ni carga de la moneda', () => {
  const v = loadView({ stored: 'low' });
  assert.equal(inst(v).animated, false);
  assert.equal(v.els['.coins'].hidden, true);
  assert.equal(v.timers.raf.size, 0);
  assert.equal(v.images.length, 0);
  assert.equal(v.win.count('pointermove'), 0);
  assert.equal(v.win.count('deviceorientation'), 0);
  assert.equal(v.splash.getAttribute('data-quality'), 'low');
  assert.equal(v.els['.hole'].style.transform, undefined, 'el CSS deja el hoyo quieto');
  assert.equal(v.ctx2d.calls.arc ?? 0, 0);
  for (const q of ['medium', 'high']) assert.equal(inst(loadView({ stored: q })).animated, true, q);
});

test('escena: movimiento reducido = hoyo estático, sin monedas, sin rAF ni listeners', () => {
  const v = loadView({ reduced: true });
  assert.equal(inst(v).animated, false);
  assert.equal(v.els['.coins'].hidden, true);
  assert.equal(v.timers.raf.size, 0);
  assert.equal(v.images.length, 0);
  assert.equal(v.win.count('pointermove'), 0);
  assert.equal(v.win.count('deviceorientation'), 0);
  assert.equal(v.win.count('resize'), 0);
});

test('escena: con ahorro de datos no se anima (hoyo fijo, sin pedir la moneda)', () => {
  const v = loadView({ saveData: true });
  assert.equal(inst(v).animated, false);
  assert.equal(v.images.length, 0);
});

test('visual: fundido al ocultar: is-hiding y hidden por transitionend o por seguridad', () => {
  const v = loadView();
  v.win.gcbSplash.done();
  v.t.now += 3001; v.tick(); // minMs del splash en vivo: 3000 ms
  assert.equal(v.splash.classList.contains('is-hiding'), true);
  assert.equal(v.splash.hidden, false);
  v.splash.fire('transitionend', { target: v.splash, propertyName: 'opacity' });
  assert.equal(v.splash.hidden, true);
  const w = loadView();
  w.win.gcbSplash.hideNow();
  assert.equal(w.splash.classList.contains('is-hiding'), true);
  [...w.timers.timeouts.values()].forEach((f) => f());
  assert.equal(w.splash.hidden, true);
});

test('visual: hideNow limpia rAF, intervalos y listeners (sin fugas)', () => {
  const v = loadView();
  v.images[0].onload();
  v.run(30);
  v.win.gcbSplash.hideNow();
  v.splash.fire('transitionend', { target: v.splash, propertyName: 'opacity' });
  assert.equal(v.timers.raf.size, 0);
  assert.equal(v.timers.intervals.size, 0);
  assert.equal(v.timers.timeouts.size, 0);
  for (const ev of ['pointermove', 'deviceorientation', 'resize']) assert.equal(v.win.count(ev), 0, ev);
  assert.equal(v.doc.count('visibilitychange'), 0);
  assert.equal(v.els['.retry'].count('click'), 0);
  assert.equal(v.images[0].onload, null);
  assert.equal(inst(v).scene.coins.length, 0);
  const before = v.els['.pct'].textContent;
  v.win.gcbSplash.mark('session');
  assert.equal(v.els['.pct'].textContent, before); // sin oyente: ya no pinta
});

test('visual: reduced-motion oculta sin esperar transitionend', () => {
  const v = loadView({ reduced: true });
  v.win.gcbSplash.hideNow();
  assert.equal(v.splash.hidden, true);
  assert.equal(v.timers.intervals.size, 0);
});

test('visual: sin document el núcleo carga igual', () => {
  const w = load();
  assert.equal(typeof w.gcbSplash.mark, 'function');
});

test('visual: sin canvas en el marcado el splash funciona igual (barra y error)', () => {
  const v = loadView({ canvas: false });
  assert.ok(inst(v));
  assert.equal(inst(v).animated, false);
  assert.equal(v.timers.raf.size, 0);
  v.win.gcbSplash.mark('bundle');
  assert.equal(v.els['.bar'].getAttribute('aria-valuenow'), '25');
});

test('visual2: destroy a mitad de fundido y en error deja #splash oculto', () => {
  const v = loadView();
  v.win.gcbSplash.fail('x');
  v.win.gcbSplash.hideNow(); // is-hiding puesto (state sigue en error, pero canHide)
  inst(v).destroy();
  assert.equal(v.splash.hidden, true);
  assert.equal(v.splash.getAttribute('aria-hidden'), 'true');
  const w = loadView();
  w.win.gcbSplash.done();
  w.t.now += 3001; w.tick(); // minMs del splash en vivo: 3000 ms
  assert.equal(w.splash.classList.contains('is-hiding'), true);
  assert.equal(w.splash.hidden, false);
  inst(w).destroy();
  assert.equal(w.splash.hidden, true);
  assert.equal(w.timers.timeouts.size, 0);
});

test('visual2: destroy es idempotente', () => {
  const v = loadView();
  const i = inst(v);
  i.destroy();
  i.destroy();
  assert.equal(i.destroyed, true);
  assert.equal(v.timers.intervals.size, 0);
  assert.equal(v.timers.raf.size, 0);
});

test('visual2: sin requestAnimationFrame no rompe y sigue funcionando', () => {
  const v = loadView({ noRaf: true });
  assert.ok(inst(v));
  v.win.gcbSplash.mark('bundle');
  assert.equal(v.els['.pct'].textContent, '25 %');
  assert.equal(v.splash.hidden, false);
});

test('visual2: si initView lanza, limpia lo creado y queda en modo mínimo visible', () => {
  const v = loadView({ throwPointer: true });
  const i = inst(v);
  assert.ok(i && i.minimal === true);
  assert.equal(v.timers.raf.size, 0);
  assert.equal(v.timers.intervals.size, 1); // solo el del modo mínimo
  assert.equal(v.doc.count('visibilitychange'), 0);
  assert.equal(v.win.count('deviceorientation'), 0);
  assert.equal(v.els['.coins'].hidden, true);
  v.win.gcbSplash.mark('bundle');
  assert.equal(v.els['.pct'].textContent, '25 %');
  assert.equal(v.splash.hidden, false);
  v.win.gcbSplash.hideNow();
  assert.equal(v.splash.hidden, true); // modo mínimo oculta sin esperar fundido
});

test('visual2: si todo falla no hay error sin capturar', () => {
  const v = loadView({ deferDoc: true });
  v.win.document = { getElementById: () => ({ querySelector() { throw new Error('x'); }, hidden: false }) };
  assert.doesNotThrow(() => v.win.__gcbSplashView.init());
  assert.equal(inst(v), null);
});

test('visual2: pestaña oculta pausa rAF e intervalo y al volver reanuda sin salto de tiempo', () => {
  const v = loadView();
  v.images[0].onload();
  v.run(10);
  v.doc.hidden = true; v.doc.fire('visibilitychange');
  assert.equal(v.timers.raf.size, 0);
  assert.equal(v.timers.intervals.size, 0);
  v.doc.hidden = false; v.doc.fire('visibilitychange');
  assert.equal(v.timers.raf.size, 1);
  assert.equal(v.timers.intervals.size, 1);
  const before = new Map(inst(v).scene.coins.map((c) => [c, c.t]));
  v.frame(999999);                                  // primer frame tras volver: dt = 0
  for (const [c, t0] of before) assert.equal(c.t, t0);
  inst(v).destroy();
  assert.equal(v.doc.count('visibilitychange'), 0);
});

test('visual2: init doble devuelve la misma instancia sin duplicar listeners ni timers', () => {
  const v = loadView();
  const a = inst(v);
  const b = v.win.__gcbSplashView.init();
  assert.equal(a, b);
  assert.equal(v.win.count('pointermove'), 1);
  assert.equal(v.win.count('deviceorientation'), 1);
  assert.equal(v.timers.intervals.size, 1);
  assert.equal(v.els['.retry'].count('click'), 1);
  assert.equal(v.images.length, 1);
});

test('visual2: hideNow antes de init oculta en cuanto se inicia', () => {
  const v = loadView({ deferDoc: true });
  assert.equal(inst(v), null);
  v.win.gcbSplash.hideNow();
  v.win.document = v.doc;
  const i = v.win.__gcbSplashView.init();
  assert.ok(i);
  assert.equal(v.splash.classList.contains('is-hiding'), true);
});

test('visual2: Reintentar se deshabilita tras el primer clic (un solo reload)', () => {
  const v = loadView();
  v.win.gcbSplash.fail('x');
  v.els['.retry'].fire('click');
  v.els['.retry'].fire('click');
  assert.equal(v.win.reloaded, 1);
  assert.equal(v.els['.retry'].disabled, true);
});

test('visual2: reduced-motion en caliente para la escena y deja el hoyo quieto; se quita en destroy', () => {
  const v = loadView();
  const mq = v.mqls['(prefers-reduced-motion: reduce)'];
  assert.equal(mq.count('change'), 1);
  v.images[0].onload();
  v.run(5);
  assert.ok(v.els['.hole'].style.transform);
  mq.fire('change', { matches: true });
  assert.equal(v.timers.raf.size, 0);
  assert.equal(v.win.count('pointermove'), 0);
  assert.equal(v.win.count('deviceorientation'), 0);
  assert.equal(v.els['.hole'].style.transform, '');
  assert.equal(v.els['.coins'].hidden, true);
  assert.equal(inst(v).animated, false);
  inst(v).destroy();
  assert.equal(mq.count('change'), 0);
});

test('visual2: transitionend de un hijo no cierra; el del propio #splash sí y se quita el listener', () => {
  const v = loadView();
  v.win.gcbSplash.hideNow();
  assert.equal(v.splash.count('transitionend'), 1);
  v.splash.fire('transitionend', { target: v.child, propertyName: 'opacity' });
  assert.equal(v.splash.hidden, false);
  v.splash.fire('transitionend', { target: v.splash, propertyName: 'opacity' });
  assert.equal(v.splash.hidden, true);
  assert.equal(v.splash.count('transitionend'), 0);
});

test('visual2: transición error → loading al marcar session', () => {
  const v = loadView();
  v.t.now += 15001; v.tick();
  assert.equal(v.splash.getAttribute('data-state'), 'error');
  v.win.gcbSplash.mark('session');
  assert.equal(v.splash.getAttribute('data-state'), null);
  assert.equal(v.els['.bar'].getAttribute('aria-label'), 'Cargando');
});

test('barra: hitos en el % acumulado de los pesos y se encienden al pasarlos; destello al 100 %', () => {
  const v = loadView({ ticks: true });
  const kids = v.els['.ticks'].kids;
  assert.deepEqual(kids.map((k) => k.style.left), ['25%', '45%', '60%', '80%', '95%']);
  assert.deepEqual(kids.map((k) => k.className), ['tick', 'tick', 'tick', 'tick', 'tick']);
  v.win.gcbSplash.mark('bundle');
  v.win.gcbSplash.mark('session');
  assert.deepEqual(kids.map((k) => k.className), ['tick on', 'tick on', 'tick', 'tick', 'tick']);
  assert.equal(v.splash.classList.contains('is-full'), false);
  v.win.gcbSplash.done();
  assert.ok(kids.every((k) => k.className === 'tick on'));
  assert.equal(v.splash.classList.contains('is-full'), true);
});
