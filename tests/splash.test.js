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
