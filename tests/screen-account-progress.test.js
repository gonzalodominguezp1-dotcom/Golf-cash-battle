import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { mount } from '../src/screens/account/progress.js';
import { t } from '../src/screens/texts/index.js';

const settle = () => new Promise((r) => setImmediate(r));
const defer = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };

// Nodo con los [data-retry] que listState necesita
function fakeRoot(env) {
  const retry = env.el('button');
  let html = '';
  const handlers = [];
  const add = retry.addEventListener;
  retry.addEventListener = (type, fn) => { handlers.push(fn); return add.call(retry, type, fn); };
  return { handlers, dataset: {}, get innerHTML() { return html; }, set innerHTML(v) { html = v; }, querySelector: (s) => (s === '[data-retry]' && html.includes('data-retry') ? retry : null), retry };
}

function makeCtx(env, { level = { level: 30, into: 50, need: 780 }, state, load } = {}) {
  const st = state ?? { xp: 1, matches: 12, wins: 4, streak: 2, bestStreak: 5, birdies: 9, aces: 1 };
  return {
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    backend: load ? { account: { load } } : null,
    progress: { get level() { return level; }, state: st, prestige: { frame: level.level >= 25 ? { id: 'p25', name: 'Bronce', level: 25, color: '#cd7f32', glow: '#ffb067' } : null } },
  };
}

test('progreso: no bloquea, pinta Cargando y luego nivel, marco, XP y estadísticas reales', async () => {
  const env = fakeEnv();
  const d = defer();
  const ctx = makeCtx(env, { load: () => d.p });
  const root = fakeRoot(env);
  const screen = mount(root, ctx); // sin await: devuelve ya
  assert.equal(typeof screen.destroy, 'function');
  assert.match(root.innerHTML, /Cargando/);
  d.resolve({});
  await settle();
  const h = root.innerHTML;
  assert.match(h, /Nv 30 · Bronce/);
  assert.match(h, /50 \/ 780 XP/);
  assert.match(h, /Plata: te faltan 20 niveles \(Nv 50\)/);
  for (const [lab, v] of [['Partidas', 12], ['Victorias', 4], ['Racha', 2], ['Mejor racha', 5], ['Birdies', 9], ['Aces', 1]]) {
    assert.match(h, new RegExp(`${lab}</span><span class="stat-pill-val">${v}<`));
  }
  assert.doesNotMatch(h, /liga|desaf/i);
  screen.destroy();
});

test('progreso: sin marco, sin datos y todos los marcos', async () => {
  const env = fakeEnv();
  const a = fakeRoot(env);
  const s1 = mount(a, makeCtx(env, { level: { level: 3, into: 0, need: 240 }, state: { matches: 0, wins: 0, streak: 0, bestStreak: 0, birdies: 0, aces: 0 } }));
  await settle();
  assert.match(a.innerHTML, /Nv 3 · Sin marco/);
  assert.match(a.innerHTML, /Bronce: te faltan 22 niveles/);
  assert.match(a.innerHTML, /Juega tu primera partida/);
  s1.destroy();
  const b = fakeRoot(env);
  const s2 = mount(b, makeCtx(env, { level: { level: 150, into: 0, need: 3000 }, state: {} }));
  await settle();
  assert.match(b.innerHTML, /Ya tienes todos los marcos/);
  assert.match(b.innerHTML, /Todavía no hay estadísticas/);
  assert.doesNotMatch(b.innerHTML, /stat-pill-val/); // sin datos no se inventan números
  s2.destroy();
});

test('progreso: tope de 8 s con error y Reintentar que vuelve a leer', async () => {
  const env = fakeEnv();
  let calls = 0;
  const ctx = makeCtx(env, { load: () => (++calls === 1 ? new Promise(() => {}) : Promise.resolve({})) });
  const root = fakeRoot(env);
  const screen = mount(root, ctx);
  env.timers.advance(7999);
  await settle();
  assert.match(root.innerHTML, /Cargando/);
  env.timers.advance(2);
  await settle();
  assert.match(root.innerHTML, /No se pudo cargar tu progreso/);
  assert.match(root.innerHTML, /data-retry/);
  root.retry.emit('click');
  await settle();
  assert.match(root.innerHTML, /Nv 30/);
  assert.equal(calls, 2);
  screen.destroy();
});

test('progreso: una respuesta vieja no pisa a la nueva (carrera)', async () => {
  const env = fakeEnv();
  const ds = [defer(), defer(), defer()];
  let i = 0;
  const ctx = makeCtx(env, { load: () => ds[i++].p });
  const root = fakeRoot(env);
  const screen = mount(root, ctx);
  env.timers.advance(8001); // la primera lectura expira -> error
  await settle();
  const again = root.handlers[0]; // el botón se repinta en cada lectura, pero un doble toque rápido ya disparó el manejador
  again(); // segunda lectura
  again(); // tercera, antes de que acabe la segunda
  ctx.progress.state.wins = 77;
  ds[2].resolve({}); // gana la última
  await settle();
  assert.match(root.innerHTML, /stat-pill-val">77</);
  ctx.progress.state.wins = 1;
  ds[1].resolve({}); // la anterior llega tarde: se descarta y no repinta
  await settle();
  assert.match(root.innerHTML, /stat-pill-val">77</);
  screen.destroy();
});

test('progreso: destroy con la lectura en curso no pinta después', async () => {
  const env = fakeEnv();
  const d = defer();
  const ctx = makeCtx(env, { load: () => d.p });
  const root = fakeRoot(env);
  const screen = mount(root, ctx);
  screen.destroy();
  d.resolve({});
  await settle();
  assert.match(root.innerHTML, /Cargando/);
  assert.doesNotMatch(root.innerHTML, /Nv 30/);
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
});

test('progreso: 20 montajes y destroy no dejan listeners ni temporizadores (medido antes de dispose)', async () => {
  const env = fakeEnv();
  const ctx = makeCtx(env, { load: () => Promise.resolve({}) });
  for (let i = 0; i < 20; i++) {
    const root = fakeRoot(env);
    const screen = mount(root, ctx);
    if (i === 0) assert.ok(ctx.scope.live().timers > 0, 'había algo vivo (tope de red) antes de destruir');
    await settle();
    screen.destroy();
    assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  }
  // y con un error pendiente: el botón Reintentar registra un listener que destroy libera
  const ctx2 = makeCtx(env, { load: () => Promise.reject(new Error('x')) });
  const root = fakeRoot(env);
  const screen = mount(root, ctx2);
  await settle();
  assert.ok(ctx2.scope.live().listeners > 0, 'el botón Reintentar estaba enlazado antes de destruir');
  screen.destroy();
  assert.deepEqual(ctx2.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  assert.equal(env.liveListeners(), 0);
  assert.equal(env.liveTimers(), 0);
});

test('progreso: textos por t()', () => {
  assert.equal(t('progress.levelLine', { level: 7, frame: 'Plata' }), 'Nv 7 · Plata');
});
