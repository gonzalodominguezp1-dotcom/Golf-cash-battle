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

// ---- Capa visual (T020b): DOM falso mínimo, sin navegador ----
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
function loadView({ reduced = false, maxMs = '15000', stored, coarse = false } = {}) {
  const t = { now: 1000 };
  const els = {};
  for (const k of ['.pct', '.bar', '.bar > i', '.tip-text', '.retry', '.label', '.sky', '.green', '.forest', '.ball', '.ball-shadow']) els[k] = fakeEl();
  const splash = fakeEl({
    dataset: { maxMs },
    querySelector: (s) => els[s] || null
  });
  const timers = { raf: new Map(), intervals: new Map(), timeouts: new Map(), nextId: 1 };
  const win = fakeEl({
    innerWidth: 1000, innerHeight: 800,
    document: { getElementById: (id) => (id === 'splash' ? splash : null) },
    localStorage: { getItem: () => (stored ? JSON.stringify({ quality: { desktop: stored, mobile: stored } }) : null) },
    matchMedia: (q) => ({ matches: /reduced-motion/.test(q) ? reduced : (/coarse/.test(q) ? coarse : false) }),
    requestAnimationFrame(fn) { const id = timers.nextId++; timers.raf.set(id, fn); return id; },
    cancelAnimationFrame(id) { timers.raf.delete(id); },
    setInterval(fn) { const id = timers.nextId++; timers.intervals.set(id, fn); return id; },
    clearInterval(id) { timers.intervals.delete(id); },
    setTimeout(fn) { const id = timers.nextId++; timers.timeouts.set(id, fn); return id; },
    clearTimeout(id) { timers.timeouts.delete(id); },
    location: { reload() { win.reloaded = (win.reloaded || 0) + 1; } },
    navigator: { userAgent: 'x' }
  });
  const ctx = vm.createContext({ window: win, Date: { now: () => t.now } });
  vm.runInContext(SRC, ctx, { filename: 'public/splash.js' });
  const tick = () => [...timers.intervals.values()].forEach((f) => f());
  const frame = (ts = 16) => { const fs = [...timers.raf.values()]; timers.raf.clear(); fs.forEach((f) => f(ts)); };
  return { win, splash, els, timers, t, tick, frame };
}

test('visual: pct, ancho de barra y aria-valuenow siguen al núcleo', () => {
  const v = loadView();
  assert.equal(v.els['.pct'].textContent, '5 %');
  v.win.gcbSplash.mark('bundle');
  assert.equal(v.els['.pct'].textContent, '25 %');
  assert.equal(v.els['.bar > i'].style.width, '25%');
  assert.equal(v.els['.bar'].getAttribute('aria-valuenow'), '25');
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

test('visual: parallax mueve 3 capas a velocidades distintas con rAF', () => {
  const v = loadView();
  assert.equal(v.timers.raf.size, 1);
  v.win.fire('pointermove', { clientX: 1000 });
  for (let i = 1; i <= 80; i++) v.frame(100 + i * 16);
  const tx = (k) => Number(/translate3d\((-?[\d.]+)px/.exec(v.els[k].style.transform)[1]);
  assert.ok(Math.abs(tx('.green')) > Math.abs(tx('.forest')));
  assert.ok(Math.abs(tx('.forest')) > Math.abs(tx('.sky')));
  assert.ok(tx('.sky') < 0 && tx('.green') > 0);
  assert.match(v.els['.green'].style.transform, /scale\(1\.08\)/);
  assert.match(v.els['.forest'].style.transform, /scale\(1\.04\)/);
});

test('visual: sin input deriva sola', () => {
  const v = loadView();
  v.frame(10000);
  const a = v.els['.green'].style.transform;
  for (let i = 1; i < 30; i++) v.frame(10000 + i * 500);
  assert.notEqual(v.els['.green'].style.transform, a);
});

test('visual: calidad low muestra 2 capas; alta 3', () => {
  assert.equal(loadView({ stored: 'low' }).els['.forest'].hidden, true);
  const hi = loadView({ stored: 'high' });
  assert.equal(hi.els['.forest'].hidden, false);
  assert.equal(hi.els['.sky'].hidden, false);
});

test('visual: reduced-motion es estático, sin rAF ni listeners de parallax', () => {
  const v = loadView({ reduced: true, stored: 'low' });
  assert.equal(v.timers.raf.size, 0);
  assert.equal(v.win.count('pointermove'), 0);
  assert.equal(v.els['.forest'].hidden, false); // reduced: 3 capas estáticas
});

test('visual: fundido al ocultar: is-hiding y hidden por transitionend o por seguridad', () => {
  const v = loadView();
  v.win.gcbSplash.done();
  v.t.now += 700; v.tick();
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
  v.win.gcbSplash.hideNow();
  v.splash.fire('transitionend', { target: v.splash, propertyName: 'opacity' });
  assert.equal(v.timers.raf.size, 0);
  assert.equal(v.timers.intervals.size, 0);
  assert.equal(v.timers.timeouts.size, 0);
  assert.equal(v.win.count('pointermove'), 0);
  assert.equal(v.els['.retry'].count('click'), 0);
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

// ---- Capa visual: robustez, rendimiento y ciclo de vida (correcciones de revisión) ----
function loadView2({ reduced = false, noRaf = false, deferDoc = false, throwPointer = false } = {}) {
  const t = { now: 1000 };
  const els = {};
  for (const k of ['.pct', '.bar', '.bar > i', '.tip-text', '.retry', '.label', '.sky', '.green', '.forest', '.ball', '.ball-shadow']) els[k] = fakeEl();
  const child = fakeEl();
  const splash = fakeEl({ dataset: { maxMs: '15000' }, querySelector: (s) => els[s] || null });
  const timers = { raf: new Map(), intervals: new Map(), timeouts: new Map(), nextId: 1, rafCalls: 0 };
  const mqls = {};
  const doc = fakeEl({ hidden: false, getElementById: (id) => (id === 'splash' ? splash : null) });
  const win = fakeEl({
    innerWidth: 1000, innerHeight: 800,
    matchMedia: (q) => {
      if (!mqls[q]) mqls[q] = fakeEl({ matches: /reduced-motion/.test(q) ? reduced : false });
      return mqls[q];
    },
    setInterval(fn) { const id = timers.nextId++; timers.intervals.set(id, fn); return id; },
    clearInterval(id) { timers.intervals.delete(id); },
    setTimeout(fn) { const id = timers.nextId++; timers.timeouts.set(id, fn); return id; },
    clearTimeout(id) { timers.timeouts.delete(id); },
    location: { reload() { win.reloaded = (win.reloaded || 0) + 1; } },
    navigator: { userAgent: 'x' }
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
  const ctx = vm.createContext({ window: win, Date: { now: () => t.now } });
  vm.runInContext(SRC, ctx, { filename: 'public/splash.js' });
  const frame = (ts) => { const fs = [...timers.raf.values()]; timers.raf.clear(); fs.forEach((f) => f(ts)); };
  const tick = () => [...timers.intervals.values()].forEach((f) => f());
  return { win, doc, splash, els, child, timers, mqls, t, frame, tick };
}

test('visual2: destroy a mitad de fundido y en error deja #splash oculto', () => {
  const v = loadView2();
  v.win.gcbSplash.fail('x');
  v.win.gcbSplash.hideNow(); // is-hiding puesto (state sigue en error, pero canHide)
  v.win.__gcbSplashView.instance.destroy();
  assert.equal(v.splash.hidden, true);
  assert.equal(v.splash.getAttribute('aria-hidden'), 'true');
  const w = loadView2();
  w.win.gcbSplash.done();
  w.t.now += 700; w.tick();
  assert.equal(w.splash.classList.contains('is-hiding'), true);
  assert.equal(w.splash.hidden, false);
  w.win.__gcbSplashView.instance.destroy();
  assert.equal(w.splash.hidden, true);
  assert.equal(w.timers.timeouts.size, 0);
});

test('visual2: destroy es idempotente', () => {
  const v = loadView2();
  const inst = v.win.__gcbSplashView.instance;
  inst.destroy();
  inst.destroy();
  assert.equal(inst.destroyed, true);
  assert.equal(v.timers.intervals.size, 0);
  assert.equal(v.timers.raf.size, 0);
});

test('visual2: sin requestAnimationFrame no rompe y sigue funcionando', () => {
  const v = loadView2({ noRaf: true });
  assert.ok(v.win.__gcbSplashView.instance);
  v.win.gcbSplash.mark('bundle');
  assert.equal(v.els['.pct'].textContent, '25 %');
  assert.equal(v.splash.hidden, false);
});

test('visual2: si initView lanza, limpia lo creado y queda en modo mínimo visible', () => {
  const v = loadView2({ throwPointer: true });
  const inst = v.win.__gcbSplashView.instance;
  assert.ok(inst && inst.minimal === true);
  assert.equal(v.timers.raf.size, 0);
  assert.equal(v.timers.intervals.size, 1); // solo el del modo mínimo
  assert.equal(v.doc.count('visibilitychange'), 0);
  v.win.gcbSplash.mark('bundle');
  assert.equal(v.els['.pct'].textContent, '25 %');
  assert.equal(v.splash.hidden, false);
  v.win.gcbSplash.hideNow();
  assert.equal(v.splash.hidden, true); // modo mínimo oculta sin esperar fundido
});

test('visual2: si todo falla no hay error sin capturar', () => {
  const v = loadView2({ deferDoc: true });
  v.win.document = { getElementById: () => ({ querySelector() { throw new Error('x'); }, hidden: false }) };
  assert.doesNotThrow(() => v.win.__gcbSplashView.init());
  assert.equal(v.win.__gcbSplashView.instance, null);
});

test('visual2: en reposo el parallax converge y deja de pedir frames; pointermove lo reanuda', () => {
  const v = loadView2();
  v.win.fire('pointermove', { clientX: 0 });   // target = -1, cur = 1
  let ts = 1000, n = 0;
  while (v.timers.raf.size && n < 400) { v.frame(ts); ts += 40; n++; }
  assert.equal(v.timers.raf.size, 0, 'se paró');
  assert.ok(n < 400);
  const calls = v.timers.rafCalls;
  v.frame(ts + 40);
  assert.equal(v.timers.rafCalls, calls, 'sin frames nuevos');
  v.win.fire('pointermove', { clientX: 1000 });
  assert.equal(v.timers.raf.size, 1, 'pointermove reanuda');
  assert.equal(v.timers.timeouts.size, 0);
});

test('visual2: la deriva se limita a ~30 fps y no reescribe transforms iguales', () => {
  const v = loadView2();
  v.frame(5000);
  const writes = () => v.els['.green'].style.transform;
  const a = writes();
  v.frame(5010); // <30 ms: salta
  assert.equal(writes(), a);
  v.frame(5100);
  assert.notEqual(writes(), a);
  v.win.fire('pointermove', { clientX: 1000 });
  let ts = 20000, n = 0;
  while (v.timers.raf.size && n < 400) { v.frame(ts); ts += 40; n++; }
  assert.equal(v.timers.raf.size, 0);
  let sets = 0;
  let val = v.els['.sky'].style.transform;
  Object.defineProperty(v.els['.sky'].style, 'transform', { get: () => val, set: (x) => { sets++; val = x; } });
  v.win.fire('pointermove', { clientX: 1000 });
  v.frame(ts + 100);
  assert.equal(sets, 0, 'mismo valor no se reescribe');
});

test('visual2: pestaña oculta pausa rAF e intervalo y al volver reanuda', () => {
  const v = loadView2();
  v.doc.hidden = true; v.doc.fire('visibilitychange');
  assert.equal(v.timers.raf.size, 0);
  assert.equal(v.timers.intervals.size, 0);
  v.doc.hidden = false; v.doc.fire('visibilitychange');
  assert.equal(v.timers.raf.size, 1);
  assert.equal(v.timers.intervals.size, 1);
  v.win.__gcbSplashView.instance.destroy();
  assert.equal(v.doc.count('visibilitychange'), 0);
});

test('visual2: init doble devuelve la misma instancia sin duplicar listeners ni timers', () => {
  const v = loadView2();
  const a = v.win.__gcbSplashView.instance;
  const b = v.win.__gcbSplashView.init();
  assert.equal(a, b);
  assert.equal(v.win.count('pointermove'), 1);
  assert.equal(v.timers.intervals.size, 1);
  assert.equal(v.els['.retry'].count('click'), 1);
});

test('visual2: hideNow antes de init oculta en cuanto se inicia', () => {
  const v = loadView2({ deferDoc: true });
  assert.equal(v.win.__gcbSplashView.instance, null);
  v.win.gcbSplash.hideNow();
  v.win.document = v.doc;
  const inst = v.win.__gcbSplashView.init();
  assert.ok(inst);
  assert.equal(v.splash.classList.contains('is-hiding'), true);
});

test('visual2: Reintentar se deshabilita tras el primer clic (un solo reload)', () => {
  const v = loadView2();
  v.win.gcbSplash.fail('x');
  v.els['.retry'].fire('click');
  v.els['.retry'].fire('click');
  assert.equal(v.win.reloaded, 1);
  assert.equal(v.els['.retry'].disabled, true);
});

test('visual2: reduced-motion en caliente para rAF y parallax; se quita en destroy', () => {
  const v = loadView2();
  const mq = v.mqls['(prefers-reduced-motion: reduce)'];
  assert.equal(mq.count('change'), 1);
  v.frame(1000);
  assert.ok(v.els['.green'].style.transform);
  mq.fire('change', { matches: true });
  assert.equal(v.timers.raf.size, 0);
  assert.equal(v.win.count('pointermove'), 0);
  assert.equal(v.els['.green'].style.transform, '');
  v.win.__gcbSplashView.instance.destroy();
  assert.equal(mq.count('change'), 0);
});

test('visual2: transitionend de un hijo no cierra; el del propio #splash sí y se quita el listener', () => {
  const v = loadView2();
  v.win.gcbSplash.hideNow();
  assert.equal(v.splash.count('transitionend'), 1);
  v.splash.fire('transitionend', { target: v.child, propertyName: 'opacity' });
  assert.equal(v.splash.hidden, false);
  v.splash.fire('transitionend', { target: v.splash, propertyName: 'opacity' });
  assert.equal(v.splash.hidden, true);
  assert.equal(v.splash.count('transitionend'), 0);
});

test('visual2: transición error → loading al marcar session', () => {
  const v = loadView2();
  v.t.now += 15001; v.tick();
  assert.equal(v.splash.getAttribute('data-state'), 'error');
  v.win.gcbSplash.mark('session');
  assert.equal(v.splash.getAttribute('data-state'), null);
  assert.equal(v.els['.bar'].getAttribute('aria-label'), 'Cargando');
});
