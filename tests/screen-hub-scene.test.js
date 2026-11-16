import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { createContext } from '../src/screens/context.js';
import { mount } from '../src/screens/hub.js';

// Raíz falsa: elementos estables por atributo (data-hub-scene, data-focus-key).
function fakeRoot(env) {
  const els = new Map();
  const get = (k) => { if (!els.has(k)) { const e = env.el('div'); e.focused = 0; e.focus = () => { e.focused++; }; e.appendChild = (c) => { e.children = [...(e.children || []), c]; return c; }; els.set(k, e); } return els.get(k); };
  return {
    innerHTML: '', els,
    querySelectorAll(sel) {
      const m = sel.match(/^\[(data-[\w-]+)\]$/);
      return m ? [...this.innerHTML.matchAll(new RegExp(`${m[1]}="([^"]+)"`, 'g'))].map((x) => { const e = get(`${m[1]}=${x[1]}`); e.dataset = { hub: x[1] }; return e; }) : [];
    },
    querySelector(sel) {
      const m = sel.match(/^\[(data-[\w-]+)="([^"]+)"\]$/);
      return m && this.innerHTML.includes(`${m[1]}="${m[2]}"`) ? get(`${m[1]}=${m[2]}`) : null;
    },
  };
}

function fakeScene() {
  const log = [];
  return {
    log, paused: true,
    attach(el) { log.push('attach'); this.box = el; },
    resume() { log.push('resume'); this.paused = false; },
    pause() { log.push('pause'); this.paused = true; },
    setQuality(q) { log.push(`q:${q}`); },
    resize() { log.push('resize'); },
    dispose() { log.push('dispose'); },
    stats: { renderCalls: 0 },
  };
}

function setup(env, over = {}) {
  const actions = [];
  const ctx = createContext({
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    router: { push() { return true; } },
    progress: { level: { level: 1, into: 0, need: 100 }, challenge: () => ({ done: false }) },
    backend: { user: { id: 'u' }, account: null },
    icon: (n) => `<svg data-icon="${n}"></svg>`,
    quality: () => 'low',
    storage: { getItem: () => null, setItem() {} },
    actions: { claimRewards: () => actions.push('claim') },
    ...over,
  });
  ctx.scope = createScope({ win: env.win, doc: env.doc, timers: env.timers });
  // el host da una copia con su propio scope
  const mctx = { ...ctx };
  return { ctx, mctx, actions };
}

test('hub escena: attach + resume al montar', async () => {
  const env = fakeEnv();
  const sc = fakeScene();
  const { ctx, mctx } = setup(env, { hubScene: sc });
  const root = fakeRoot(env);
  await mount(root, mctx, {});
  assert.deepEqual(sc.log.filter((x) => x !== 'resize' && !x.startsWith('q:')), ['attach', 'resume']);
  assert.equal(sc.box, root.querySelector('[data-hub-scene="1"]'));
  assert.ok(sc.log.includes('q:low'));
  assert.ok(ctx);
});

test('hub escena: pausa al taparse y al ocultar la pestaña; reanuda al destapar', async () => {
  const env = fakeEnv();
  const sc = fakeScene();
  const { mctx, actions } = setup(env, { hubScene: sc });
  env.doc.hidden = false;
  const root = fakeRoot(env);
  const screen = await mount(root, mctx, {});
  screen.onCover();
  assert.equal(sc.paused, true);
  env.doc.hidden = true; env.doc.emit('visibilitychange');
  env.doc.hidden = false; env.doc.emit('visibilitychange'); // tapado: no reanuda
  assert.equal(sc.paused, true);
  const claims = actions.length;
  screen.onUncover('ranking');
  assert.equal(sc.paused, false);
  assert.equal(root.querySelector('[data-focus-key="ranking"]').focused, 1);
  assert.equal(actions.length, claims + 1);
  env.doc.hidden = true; env.doc.emit('visibilitychange');
  assert.equal(sc.paused, true);
  env.doc.hidden = false; env.doc.emit('visibilitychange');
  assert.equal(sc.paused, false);
});

test('hub escena: sin escena (null) usa la imagen fija y no falla', async () => {
  const env = fakeEnv();
  const { mctx } = setup(env, { hubScene: null });
  const root = fakeRoot(env);
  const screen = await mount(root, mctx, {});
  screen.onCover(); screen.onUncover('skins');
  screen.destroy();
  assert.doesNotMatch(root.innerHTML, /error/i);
});

test('hub escena: llega tarde (ctx.setHubScene) y se libera (null) sin romper', async () => {
  const env = fakeEnv();
  const sc = fakeScene();
  const { ctx, mctx } = setup(env);
  const root = fakeRoot(env);
  const screen = await mount(root, mctx, {});
  ctx.setHubScene(sc);
  assert.equal(sc.paused, false);
  ctx.setHubScene(null); // partida: la escena se libera
  screen.onCover(); screen.onUncover('play'); // al volver no toca la escena liberada
  assert.equal(sc.log.filter((x) => x === 'resume').length, 1);
  ctx.setHubScene(sc); // nueva escena llega mientras hay hub
  assert.equal(sc.log.filter((x) => x === 'attach').length, 2);
});

test('hub escena: tapado, una escena que llega se coloca al destapar', async () => {
  const env = fakeEnv();
  const sc = fakeScene();
  const { ctx, mctx } = setup(env);
  const screen = await mount(fakeRoot(env), mctx, {});
  screen.onCover();
  ctx.setHubScene(sc);
  assert.deepEqual(sc.log, []);
  screen.onUncover('ranking');
  assert.equal(sc.paused, false);
});

test('hub escena: destroy pausa y libera; 20 mount/destroy sin fugas', async () => {
  const env = fakeEnv();
  const sc = fakeScene();
  const { ctx } = setup(env, { hubScene: sc });
  for (let i = 0; i < 20; i++) {
    const scope = createScope({ win: env.win, doc: env.doc, timers: env.timers });
    const screen = await mount(fakeRoot(env), { ...ctx, scope }, {});
    screen.destroy();
    scope.dispose();
  }
  assert.equal(sc.paused, true);
  assert.equal(sc.log.includes('dispose'), false); // la escena es del contexto, no del hub
  assert.equal(env.liveListeners() + env.liveTimers(), 0);
  ctx.setHubScene(null);
});

test('hub tapado: al destapar repinta badges, anillo y aria-label con los datos actuales (DOM guardado fuera de la raíz)', async () => {
  const env = fakeEnv();
  const base = fakeRoot(env);
  let detached = false;
  const root = {
    get innerHTML() { return base.innerHTML; }, set innerHTML(v) { base.innerHTML = v; },
    querySelectorAll: (s) => base.querySelectorAll(s),
    // tapado, la raíz viva contiene otra pantalla: ya no encuentra nada del hub
    querySelector: (s) => (detached ? null : base.querySelector(s)),
  };
  let emit = null;
  const notifier = { counts: { friendRequests: 0, partyInvites: 0 }, subscribe(fn) { emit = fn; return () => {}; } };
  const level = { level: 3, into: 10, need: 100 };
  let done = new Set();
  const store = new Map();
  const { mctx } = setup(env, {
    notifier,
    progress: { level, challenge: (id) => ({ done: done.has(id) }) },
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
  });
  const screen = await mount(root, mctx, {});
  const user = base.querySelector('[data-hub="account"]');
  const attrs = {}; const props = {};
  user.setAttribute = (k, v) => { attrs[k] = v; };
  user.style = { setProperty: (k, v) => { props[k] = v; } };
  const friends = base.querySelector('[data-badge="friends"]');
  const ach = base.querySelector('[data-badge="achievements"]');
  const lv = base.querySelector('[data-hub-lv="1"]');
  assert.equal(friends.innerHTML, '');
  screen.onCover(); detached = true;
  notifier.counts = { friendRequests: 1, partyInvites: 0 };
  emit(notifier.counts); // el aviso llega con el hub tapado: debe pintar en el nodo guardado
  assert.match(friends.innerHTML, /1 novedad/);
  const { CHALLENGES } = await import('../src/progress/skins.js');
  done = new Set([CHALLENGES[0].id]);
  level.level = 4; level.into = 50;
  detached = false; screen.onUncover('tables');
  assert.match(friends.innerHTML, /1 novedad/);
  assert.match(ach.innerHTML, /1 novedad/);
  assert.equal(props['--pct'], '50');
  assert.match(attrs['aria-label'], /Nivel 4/);
  assert.equal(lv.textContent, '4');
});

// Mutación manual hecha a mano: quitando el `scope.on(doc, 'visibilitychange', ...)` de hub.js el test de 20 ciclos
// falla (liveListeners > 0); se comprobó y se restauró.

// ---------- recreación de la escena al llegar (ctx.actions.reviveHubScene) ----------
function reviveSetup(env, over = {}) {
  const calls = [];
  const s = setup(env, { actions: { claimRewards() {}, reviveHubScene: () => calls.push('revive') }, ...over });
  return { ...s, calls };
}

test('hub llegada: sin escena pide recrearla una vez al montar, no por repintado', async () => {
  const env = fakeEnv();
  const { mctx, calls } = reviveSetup(env, { hubScene: null });
  const screen = await mount(fakeRoot(env), mctx, {});
  assert.deepEqual(calls, ['revive']);
  screen.onCover();
  assert.deepEqual(calls, ['revive']); // tapado no dispara
  screen.onUncover('skins');
  assert.deepEqual(calls, ['revive', 'revive']); // destapar sin escena: una por llegada
});

test('hub llegada: con escena viva no pide nada, ni al montar ni al destapar', async () => {
  const env = fakeEnv();
  const { mctx, calls } = reviveSetup(env, { hubScene: fakeScene() });
  const screen = await mount(fakeRoot(env), mctx, {});
  screen.onCover(); screen.onUncover();
  assert.deepEqual(calls, []);
});

test('hub llegada: pestaña oculta que vuelve a verse sin escena la pide; tapado no', async () => {
  const env = fakeEnv();
  const { mctx, calls } = reviveSetup(env, { hubScene: null });
  env.doc.hidden = false;
  const screen = await mount(fakeRoot(env), mctx, {});
  calls.length = 0;
  screen.onCover();
  env.doc.emit('visibilitychange');
  assert.deepEqual(calls, []);
  screen.onUncover();
  calls.length = 0;
  env.doc.hidden = true; env.doc.emit('visibilitychange');
  assert.deepEqual(calls, []);
  env.doc.hidden = false; env.doc.emit('visibilitychange');
  assert.deepEqual(calls, ['revive']);
});

test('hub llegada: una acción que lanza no tumba el hub', async () => {
  const env = fakeEnv();
  const { mctx } = setup(env, { hubScene: null, actions: { claimRewards() {}, reviveHubScene() { throw new Error('x'); } } });
  await assert.doesNotReject(mount(fakeRoot(env), mctx, {}));
});
