import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { createContext } from '../src/screens/context.js';
import { mount } from '../src/screens/hub.js';

// Raíz falsa: mismos elementos que screen-hub-scene.test.js
function fakeRoot(env) {
  const els = new Map();
  const get = (k) => { if (!els.has(k)) { const e = env.el('div'); e.focus = () => {}; e.appendChild = (c) => c; els.set(k, e); } return els.get(k); };
  return {
    innerHTML: '', els,
    querySelectorAll(sel) { const m = sel.match(/^\[(data-[\w-]+)\]$/); return m ? [...this.innerHTML.matchAll(new RegExp(`${m[1]}="([^"]+)"`, 'g'))].map((x) => { const e = get(`${m[1]}=${x[1]}`); e.dataset = { hub: x[1] }; return e; }) : []; },
    querySelector(sel) { const m = sel.match(/^\[(data-[\w-]+)="([^"]+)"\]$/); return m && this.innerHTML.includes(`${m[1]}="${m[2]}"`) ? get(`${m[1]}=${m[2]}`) : null; },
  };
}
function fakeScene() {
  const log = [];
  return { log, paused: true, attach() { log.push('attach'); }, resume() { log.push('resume'); this.paused = false; }, pause() { log.push('pause'); this.paused = true; }, setQuality() {}, resize() {}, dispose() {}, stats: {} };
}
const mkCtx = (env, sc) => createContext({
  scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
  router: { push() { return true; } },
  progress: { level: { level: 1, into: 0, need: 100 }, challenge: () => ({ done: false }) },
  backend: { user: { id: 'u' }, account: null },
  icon: (n) => `<svg data-icon="${n}"></svg>`,
  quality: () => 'low',
  storage: { getItem: () => null, setItem() {} },
  actions: { claimRewards() {} },
  hubScene: sc,
});
const tick = () => new Promise((r) => setTimeout(r, 0));

// Caso real de «práctica → cancelar»: el host monta el hub nuevo ANTES de destruir el viejo.
test('hub nuevo montado antes de destruir el viejo: la escena compartida queda reanudada', async () => {
  const env = fakeEnv(); const sc = fakeScene();
  const r1 = fakeRoot(env); r1.innerHTML = '<main class="hub"><div class="hub-scene" data-hub-scene="1"></div></main>';
  const viejo = await mount(r1, mkCtx(env, sc)); await tick();
  const r2 = fakeRoot(env); r2.innerHTML = '<main class="hub"><div class="hub-scene" data-hub-scene="1"></div></main>';
  const nuevo = await mount(r2, mkCtx(env, sc)); await tick();
  viejo.destroy(); // el host lo hace después de montar el nuevo
  assert.equal(sc.paused, false, 'la escena debe seguir reanudada para el hub nuevo');
  assert.equal(sc.log.at(-1), 'resume', sc.log.join(','));
  nuevo.destroy();
});

// Caso sin solape: el viejo se destruye antes de montar el nuevo (comportamiento que ya funcionaba).
test('destruir el hub y montar otro después deja la escena reanudada', async () => {
  const env = fakeEnv(); const sc = fakeScene();
  const r1 = fakeRoot(env); r1.innerHTML = '<main class="hub"><div class="hub-scene" data-hub-scene="1"></div></main>';
  const viejo = await mount(r1, mkCtx(env, sc)); await tick();
  viejo.destroy();
  const r2 = fakeRoot(env); r2.innerHTML = '<main class="hub"><div class="hub-scene" data-hub-scene="1"></div></main>';
  const nuevo = await mount(r2, mkCtx(env, sc)); await tick();
  assert.equal(sc.log.at(-1), 'resume', sc.log.join(','));
  nuevo.destroy();
});
