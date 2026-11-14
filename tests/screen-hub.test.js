import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { mount } from '../src/screens/hub.js';
import { CHALLENGES } from '../src/progress/skins.js';
import { seenSet, markSeen } from '../src/screens/achievementsRules.js';

// Raíz falsa: reconoce [data-x] y [data-x="v"] sobre el HTML pintado y devuelve elementos estables.
function fakeRoot(env) {
  const els = new Map();
  const camel = (a) => a.replace(/^data-/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const get = (attr, val) => {
    const k = `${attr}=${val}`;
    if (!els.has(k)) { const e = env.el('button'); e.dataset = { [camel(attr)]: val }; els.set(k, e); }
    return els.get(k);
  };
  return {
    innerHTML: '',
    els,
    querySelectorAll(sel) {
      const attr = sel.match(/^\[(data-[\w-]+)\]$/)[1];
      return [...this.innerHTML.matchAll(new RegExp(`${attr}="([^"]+)"`, 'g'))].map((m) => get(attr, m[1]));
    },
    querySelector(sel) {
      const m = sel.match(/^\[(data-[\w-]+)="([^"]+)"\]$/);
      return m && this.innerHTML.includes(`${m[1]}="${m[2]}"`) ? get(m[1], m[2]) : null;
    },
  };
}

function makeCtx(env, over = {}) {
  const calls = { push: [], actions: [] };
  const subs = new Set();
  const notifier = {
    counts: { friendRequests: 0, partyInvites: 0 },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    emit(c) { this.counts = c; for (const f of [...subs]) f(c); },
  };
  const store = new Map();
  const ctx = {
    router: { push: (id, p) => { calls.push.push(id); return true; } },
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    progress: { level: { level: 7, into: 40, need: 100 }, challenge: () => ({ value: 0, goal: 1, done: false }) },
    backend: { user: { id: 'u1' }, account: { profile: { username: 'ana', is_anonymous: false } } },
    notifier,
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    icon: (n) => `<svg data-icon="${n}"></svg>`,
    sfx: { tap() {} },
    actions: {
      startPractice: () => calls.actions.push('practice'),
      toggleFullscreen: () => calls.actions.push('fullscreen'),
      claimRewards: () => calls.actions.push('claim'),
    },
    ...over,
  };
  return { ctx, calls, notifier, subs };
}

const click = (root, key) => root.querySelector(`[data-hub="${key}"]`).emit('click');

test('hub: composición C10 con textos en español y sin saldo ni silencio', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env);
  await mount(root, ctx, {});
  for (const key of ['account', 'settings', 'fullscreen', 'ranking', 'achievements', 'skins', 'friends', 'maps', 'play', 'practice']) {
    assert.match(root.innerHTML, new RegExp(`data-hub="${key}"`), key);
  }
  for (const txt of ['Ranking', 'Logros', 'Skins', 'Amigos', 'Mapas', 'JUGAR', 'Práctica', 'Ajustes']) assert.ok(root.innerHTML.includes(txt), txt);
  assert.match(root.innerHTML, /Nivel 7, 40 % al siguiente/);
  assert.match(root.innerHTML, /--pct:40/);
  assert.doesNotMatch(root.innerHTML, /balance|saldo|mute|silencio/i);
  // iconos del set existente
  for (const n of ['trophy', 'medal', 'skins', 'users', 'map', 'tee', 'gear', 'fullscreen', 'user']) assert.ok(root.innerHTML.includes(`data-icon="${n}"`), n);
});

test('hub: cada acceso navega a su destino', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, calls } = makeCtx(env);
  await mount(root, ctx, {});
  const dest = { account: 'account', settings: 'settings', ranking: 'ranking', achievements: 'achievements', skins: 'skins', friends: 'friends', maps: 'maps', play: 'tables' };
  for (const [k, id] of Object.entries(dest)) click(root, k);
  assert.deepEqual(calls.push, Object.values(dest));
  click(root, 'practice');
  click(root, 'fullscreen');
  assert.deepEqual(calls.actions.filter((a) => a !== 'claim'), ['practice', 'fullscreen']);
});

test('hub: reclama recompensas al montar', async () => {
  const env = fakeEnv();
  const { ctx, calls } = makeCtx(env);
  await mount(fakeRoot(env), ctx, {});
  assert.ok(calls.actions.includes('claim'));
});

test('hub: badge de amigos sigue al notifier (petición + invitación)', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx, notifier } = makeCtx(env);
  notifier.counts = { friendRequests: 1, partyInvites: 1 };
  await mount(root, ctx, {});
  assert.match(root.innerHTML, /2 novedades/);
  notifier.emit({ friendRequests: 1, partyInvites: 0 });
  assert.match(root.querySelector('[data-badge="friends"]').innerHTML, /1 novedad/);
  notifier.emit({ friendRequests: 0, partyInvites: 0 });
  assert.equal(root.querySelector('[data-badge="friends"]').innerHTML, '');
});

test('hub: badge de logros = completados no vistos', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const done = new Set([CHALLENGES[0].id, CHALLENGES[1].id]);
  const { ctx } = makeCtx(env, { progress: { level: { level: 1, into: 0, need: 100 }, challenge: (id) => ({ value: 1, goal: 1, done: done.has(id) }) } });
  markSeen(ctx.storage, 'u1', [CHALLENGES[0].id]);
  assert.equal(seenSet(ctx.storage, 'u1').size, 1);
  await mount(root, ctx, {});
  const html = root.querySelector('[data-badge="achievements"]').innerHTML;
  assert.match(root.innerHTML, /1 novedad/);
  assert.ok(html === '' || /1 novedad/.test(html));
});

test('hub: invitado marca los huecos de cuenta', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env, { backend: { user: { id: 'g' }, account: { profile: { is_anonymous: true } } } });
  await mount(root, ctx, {});
  assert.match(root.innerHTML, /Requiere cuenta/);
  assert.match(root.innerHTML, /hub-needs-account/);
  const { ctx: ctx2 } = makeCtx(env);
  const root2 = fakeRoot(env);
  await mount(root2, ctx2, {});
  assert.doesNotMatch(root2.innerHTML, /Requiere cuenta/);
});

test('hub: sin notifier (modo local) monta igual', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const { ctx } = makeCtx(env, { notifier: null, backend: { user: { id: 'l' }, account: null } });
  const s = await mount(root, ctx, {});
  assert.ok(root.innerHTML.includes('JUGAR'));
  s.destroy();
});

test('hub: 20 montajes y destruidos no dejan listeners, timers ni suscripciones', async () => {
  const env = fakeEnv();
  const { ctx: base, subs } = makeCtx(env);
  for (let i = 0; i < 20; i++) {
    const scope = createScope({ win: env.win, doc: env.doc, timers: env.timers }); // el host da un scope por montaje
    const root = fakeRoot(env);
    const s = await mount(root, { ...base, scope }, {});
    assert.equal(subs.size, 1);
    assert.ok(scope.live().listeners >= 8);
    s.destroy();
    scope.dispose(); // el host lo libera tras destroy()
    assert.deepEqual(scope.live(), { listeners: 0, timers: 0, subs: 0 });
    assert.equal(subs.size, 0);
  }
  assert.equal(env.liveListeners(), 0);
  assert.equal(env.liveTimers(), 0);
});
