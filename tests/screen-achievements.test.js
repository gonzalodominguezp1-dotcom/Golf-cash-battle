import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { createRoutes } from '../src/screens/routes.js';
import { mount } from '../src/screens/achievements.js';
import { CHALLENGES } from '../src/progress/skins.js';
import { seenSet } from '../src/screens/achievementsRules.js';
import { achievementsBadge } from '../src/screens/hubRules.js';

// Raíz falsa: reconoce [data-x] sobre el HTML pintado y devuelve elementos estables (listState usa dataset e innerHTML).
function fakeRoot(env) {
  const els = new Map();
  return {
    innerHTML: '',
    querySelector(sel) {
      const m = sel.match(/^\[(data-[\w-]+)\]$/);
      if (!m || !this.innerHTML.includes(m[1])) return null;
      if (!els.has(m[1])) els.set(m[1], env.el(m[1]));
      return els.get(m[1]);
    },
  };
}

const defaultState = (id) => ({ value: 0, goal: CHALLENGES.find((c) => c.id === id)?.goal ?? 1, done: false });

function makeCtx(env, { states = {}, challenges, progress } = {}) {
  const store = new Map();
  return {
    router: { back() {} },
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    progress: progress ?? { challenge: (id) => states[id] ?? defaultState(id) },
    backend: { user: { id: 'u1' } },
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    icon: (n) => `<svg data-icon="${n}"></svg>`,
    ...(challenges ? { challenges } : {}),
  };
}

const list = (root) => root.querySelector('[data-ach-list]');
const idsIn = (html) => [...html.matchAll(/data-ach="([^"]+)"/g)].map((m) => m[1]);
const badgeOf = (ctx) => achievementsBadge(CHALLENGES.map((c) => ({ id: c.id, done: !!ctx.progress.challenge(c.id).done })), seenSet(ctx.storage, 'u1'));

test('logros: pendientes primero (por avance) y completados al final', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const ctx = makeCtx(env, { states: {
    matches10: { value: 10, goal: 10, done: true },
    birdies5: { value: 4, goal: 5, done: false },
    birdies10: { value: 1, goal: 10, done: false },
  } });
  await mount(root, ctx, {});
  const ids = idsIn(list(root).innerHTML);
  assert.equal(ids.length, CHALLENGES.length);
  assert.equal(ids[0], 'birdies5');
  assert.equal(ids[ids.length - 1], 'matches10');
  assert.ok(ids.indexOf('birdies5') < ids.indexOf('birdies10'));
});

test('logros: rejilla de 2 por fila en CSS y sin :hover', () => {
  const css = readFileSync(new URL('../src/screens/achievements.css', import.meta.url), 'utf8');
  assert.match(css, /\.ach-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
  assert.doesNotMatch(css, /:hover/);
});

test('logros: progreso con barra y estado completado con texto e icono', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const ctx = makeCtx(env, { states: { birdies5: { value: 3, goal: 5, done: false }, ace: { value: 1, goal: 1, done: true } } });
  await mount(root, ctx, {});
  const html = list(root).innerHTML;
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="3"/);
  assert.match(html, /width:60%/);
  assert.match(html, /3 de 5/);
  assert.match(html, /Completado/);
  assert.match(html, /data-icon="check"/);
  assert.match(html, /ach-done/);
  assert.match(html, /Recompensa: /);
  assert.match(html, /<ul class="ach-grid"/);
});

test('logros: al montar marca como vistos los completados y el badge del hub queda a 0', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const ctx = makeCtx(env, { states: { matches10: { value: 10, goal: 10, done: true }, ace: { value: 1, goal: 1, done: true } } });
  assert.equal(badgeOf(ctx).count, 2);
  await mount(root, ctx, {});
  assert.equal(badgeOf(ctx).count, 0);
});

test('logros: estado vacío', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  await mount(root, makeCtx(env, { challenges: [] }), {});
  assert.equal(list(root).dataset.state, 'empty');
  assert.match(list(root).innerHTML, /Todavía no hay logros/);
});

test('logros: estado de error con reintento, y no marca nada como visto', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const progress = { challenge: () => { throw new Error('x'); } };
  const ctx = makeCtx(env, { progress });
  await mount(root, ctx, {});
  assert.equal(list(root).dataset.state, 'error');
  assert.match(list(root).innerHTML, /Inténtalo de nuevo/);
  assert.equal(seenSet(ctx.storage, 'u1').size, 0);
});

test('logros: destroy deja el scope en 0 y 20 montajes no dejan fugas', async () => {
  const env = fakeEnv();
  const ctx = makeCtx(env);
  for (let i = 0; i < 20; i++) {
    const screen = await mount(fakeRoot(env), ctx, {});
    assert.ok(ctx.scope.live().listeners > 0); // algo estaba vivo (el listener de Volver)
    screen.destroy();
    assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  }
  assert.equal(env.liveListeners(), 0);
  assert.equal(env.liveTimers(), 0);
});

test('logros: el botón Volver llama al router', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const ctx = makeCtx(env);
  let backs = 0;
  ctx.router = { back: () => { backs++; } };
  await mount(root, ctx, {});
  root.querySelector('[data-back]').emit('click');
  assert.equal(backs, 1);
});

test('logros: routes resuelve la ruta achievements a esta pantalla y no al marcador', async () => {
  const modules = { './achievements.js': () => import('../src/screens/achievements.js') };
  const route = createRoutes({ modules }).find((r) => r.id === 'achievements');
  const mod = await route.load();
  assert.equal(mod.mount, mount);
  assert.equal(route.hash, '#/logros');
  assert.notEqual(mod.manages, true); // no es el marcador «en construcción»
  assert.match(readFileSync(new URL('../src/screens/routes.js', import.meta.url), 'utf8'), /'\.\/achievements\.js'/); // el glob la incluye
});

test('logros: mount espera al css antes de pintar', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const ctx = makeCtx(env);
  let release;
  ctx.loadCss = () => new Promise((r) => { release = r; });
  const p = mount(root, ctx, {});
  await Promise.resolve();
  assert.equal(root.innerHTML, '');
  release();
  await p;
  assert.match(root.innerHTML, /data-ach-list/);
});

test('logros: sin usuario usa la clave local y apaga el badge igual', async () => {
  const env = fakeEnv();
  const ctx = makeCtx(env, { states: { ace: { value: 1, goal: 1, done: true } } });
  ctx.backend = {};
  const count = () => achievementsBadge(CHALLENGES.map((c) => ({ id: c.id, done: !!ctx.progress.challenge(c.id).done })), seenSet(ctx.storage, 'local')).count;
  assert.equal(count(), 1);
  await mount(fakeRoot(env), ctx, {});
  assert.equal(count(), 0);
  assert.ok(ctx.storage.getItem('gcb.achievements.seen.v1:local'));
});

test('logros: la recompensa muestra la miniatura de la bola cuando el contexto la ofrece', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const ctx = makeCtx(env, { states: { ace: { value: 1, goal: 1, done: true } } });
  const seen = [];
  ctx.ball = (skin, size) => { seen.push([skin.id, size]); return `<img class="ball-img" data-skin-id="${skin.id}" width="${size}" alt="">`; };
  await mount(root, ctx, {});
  assert.ok(seen.length > 0 && seen.every(([, size]) => size === 34));
  assert.match(list(root).innerHTML, /<img class="ball-img"/);
  assert.match(list(root).innerHTML, /Recompensa: /); // el texto sigue ahí: la imagen es decorativa
});
