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

// Vídeo de fondo: el elemento falso registra play/pause; el win falso decide la orientación.
function fakeVideo(root) {
  const v = root.querySelector('[data-hub-video="1"]');
  v.log = [];
  v.play = () => { v.log.push('play'); return Promise.resolve(); };
  v.pause = () => { v.log.push('pause'); };
  v.load = () => { v.log.push('load'); };
  return v;
}
const portraitWin = (env, state) => { env.win.matchMedia = (q) => ({ matches: q.includes('portrait') && state.portrait }); };
const tick = () => new Promise((r) => setTimeout(r, 0));

test('hub vídeo: lleva los atributos pedidos, webm antes que mp4 y póster 16x9 en horizontal', async () => {
  const env = fakeEnv();
  portraitWin(env, { portrait: false });
  const { mctx } = setup(env);
  const root = fakeRoot(env);
  await mount(root, mctx, {});
  const html = root.innerHTML;
  const tag = html.match(/<video[^>]*>/)[0];
  for (const a of ['muted', 'loop', 'playsinline', 'autoplay', 'preload="auto"', 'disablepictureinpicture', 'aria-hidden="true"', 'poster="/hub/lobby-poster-16x9.webp"']) assert.ok(tag.includes(a), a);
  assert.ok(html.indexOf('lobby-loop-16x9.webm') > 0 && html.indexOf('lobby-loop-16x9.webm') < html.indexOf('lobby-loop-16x9.mp4'));
  assert.doesNotMatch(html, /9x16/);
});

test('hub vídeo: en vertical usa los ficheros 9x16', async () => {
  const env = fakeEnv();
  portraitWin(env, { portrait: true });
  const { mctx } = setup(env);
  const root = fakeRoot(env);
  await mount(root, mctx, {});
  assert.match(root.innerHTML, /lobby-loop-9x16\.webm[\s\S]*lobby-loop-9x16\.mp4/);
  assert.match(root.innerHTML, /poster="\/hub\/lobby-poster-9x16\.webp"/);
  assert.doesNotMatch(root.innerHTML, /16x9/);
});

test('hub vídeo: al girar recarga solo si cambia la variante', async () => {
  const env = fakeEnv();
  const st = { portrait: false };
  portraitWin(env, st);
  const { mctx } = setup(env);
  const root = fakeRoot(env);
  await mount(root, mctx, {});
  const v = fakeVideo(root);
  env.win.emit('resize'); // mismo formato: nada
  assert.deepEqual(v.log, []);
  st.portrait = true; env.win.emit('orientationchange');
  assert.equal(v.log.filter((x) => x === 'load').length, 1);
  assert.equal(v.poster, '/hub/lobby-poster-9x16.webp');
  assert.match(v.innerHTML, /lobby-loop-9x16\.webm[\s\S]*lobby-loop-9x16\.mp4/);
  env.win.emit('resize'); // sigue vertical: no recarga
  assert.equal(v.log.filter((x) => x === 'load').length, 1);
});

test('hub vídeo: pausa al taparse y con la pestaña oculta; reanuda al destapar', async () => {
  const env = fakeEnv();
  const { mctx, actions } = setup(env);
  env.doc.hidden = false;
  const root = fakeRoot(env);
  const screen = await mount(root, mctx, {});
  const v = fakeVideo(root);
  screen.onCover();
  assert.equal(v.log.at(-1), 'pause');
  env.doc.hidden = true; env.doc.emit('visibilitychange');
  env.doc.hidden = false; env.doc.emit('visibilitychange'); // tapado: no reanuda
  assert.equal(v.log.at(-1), 'pause');
  const claims = actions.length;
  screen.onUncover('ranking');
  await tick();
  assert.equal(v.log.at(-1), 'play');
  assert.equal(root.querySelector('[data-focus-key="ranking"]').focused, 1);
  assert.equal(actions.length, claims + 1);
  env.doc.hidden = true; env.doc.emit('visibilitychange');
  assert.equal(v.log.at(-1), 'pause');
  env.doc.hidden = false; env.doc.emit('visibilitychange');
  assert.equal(v.log.at(-1), 'play');
});

test('hub vídeo: un play() rechazado no rompe nada', async () => {
  const env = fakeEnv();
  const { mctx } = setup(env);
  const root = fakeRoot(env);
  const screen = await mount(root, mctx, {});
  const v = fakeVideo(root);
  v.play = () => Promise.reject(new Error('NotAllowedError'));
  screen.onCover(); screen.onUncover();
  await tick();
});

test('hub vídeo: movimiento reducido deja solo el póster (sin autoplay y siempre pausado)', async () => {
  const env = fakeEnv();
  const { mctx } = setup(env, { reducedMotion: () => true });
  const root = fakeRoot(env);
  const screen = await mount(root, mctx, {});
  assert.doesNotMatch(root.innerHTML.match(/<video[^>]*>/)[0], /autoplay/);
  const v = fakeVideo(root);
  screen.onCover(); screen.onUncover();
  env.doc.hidden = false; env.doc.emit('visibilitychange');
  assert.equal(v.log.includes('play'), false);
});

test('hub vídeo: destroy pausa; 20 mount/destroy sin fugas', async () => {
  const env = fakeEnv();
  const { ctx } = setup(env);
  let last;
  for (let i = 0; i < 20; i++) {
    const scope = createScope({ win: env.win, doc: env.doc, timers: env.timers });
    const root = fakeRoot(env);
    const screen = await mount(root, { ...ctx, scope }, {});
    last = fakeVideo(root);
    screen.destroy();
    scope.dispose();
  }
  assert.equal(last.log.at(-1), 'pause');
  assert.equal(env.liveListeners() + env.liveTimers(), 0);
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
