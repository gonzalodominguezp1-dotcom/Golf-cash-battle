import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { mount as mountTables } from '../src/screens/tables.js';
import { mount as mountAchievements } from '../src/screens/achievements.js';
import { mount as mountFriends } from '../src/screens/friends.js';
import { mount as mountRanking } from '../src/screens/ranking.js';
import { mount as mountSkins } from '../src/screens/skins.js';
import { mount as mountSkinInspect } from '../src/screens/skinInspect.js';
import { mount as mountAccount } from '../src/screens/account.js';
import { mount as mountSettings } from '../src/screens/settings.js';
import { SKINS } from '../src/progress/skins.js';

const settle = () => new Promise((r) => setImmediate(r));

// Raíz falsa: reconoce [data-x] sobre el HTML pintado; devuelve siempre el mismo elemento por selector.
function fakeRoot(env) {
  const els = new Map();
  return {
    innerHTML: '',
    querySelectorAll() { return []; },
    querySelector(sel) {
      const m = sel.match(/^\[(data-[\w-]+)\]$/);
      if (!m || !this.innerHTML.includes(m[1])) return null;
      if (!els.has(m[1])) {
        const e = env.el(m[1]);
        const kids = new Map();
        e.querySelector = (q) => { if (!kids.has(q)) kids.set(q, env.el(q)); return kids.get(q); };
        els.set(m[1], e);
      }
      return els.get(m[1]);
    },
  };
}

// Router falso: cuenta cada método. El lobby debe usar reset; back es «atrás».
function fakeRouter() {
  const calls = { back: 0, reset: 0, push: [], replace: [] };
  return {
    calls,
    back: () => { calls.back++; },
    reset: () => { calls.reset++; },
    push: (...a) => calls.push.push(a),
    replace: (...a) => calls.replace.push(a),
  };
}

function baseCtx(env, router) {
  return {
    router,
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    icon: (n) => `<svg data-icon="${n}"></svg>`,
    notify: () => {},
    sfx: {},
    legacy: {},
  };
}

const SKIN = SKINS[0];

// Cada entrada monta la pantalla real con dependencias mínimas y devuelve { root, made }.
const SCREENS = [
  {
    id: 'tables',
    mount: (env, router, root) => mountTables(root, {
      ...baseCtx(env, router),
      backend: { mode: 'local', account: { profile: {} } },
      storage: { getItem: () => null, setItem: () => {} },
    }),
  },
  {
    id: 'achievements',
    mount: (env, router, root) => mountAchievements(root, { ...baseCtx(env, router), progress: { challenge: () => null }, challenges: [] }),
  },
  {
    id: 'friends',
    mount: (env, router, root) => mountFriends(root, { ...baseCtx(env, router), backend: null }),
  },
  {
    id: 'ranking',
    mount: (env, router, root) => mountRanking(root, { ...baseCtx(env, router), backend: null }),
  },
  {
    id: 'skins',
    mount: (env, router, root) => mountSkins(root, {
      ...baseCtx(env, router),
      progress: { isUnlocked: () => false, requirement: () => ({ text: '', ratio: 0 }), instance: () => null, skin: SKIN, equip: () => false },
      thumbs: { cached: () => null, preview: () => '' },
    }),
  },
  {
    id: 'skin',
    mount: (env, router, root) => mountSkinInspect(root, {
      ...baseCtx(env, router),
      progress: { instance: () => null, requirement: () => ({ text: '', ratio: 0 }), skin: SKIN, equip: () => false },
      thumbs: { cached: () => null, preview: () => '' },
      loadViewer: () => new Promise(() => {}),
    }, { id: SKIN.id }),
  },
  {
    id: 'account',
    mount: (env, router, root) => mountAccount(root, baseCtx(env, router), {}, { modules: {} }),
  },
  {
    id: 'settings',
    mount: (env, router, root) => mountSettings(root, { ...baseCtx(env, router), loadPanel: () => new Promise(() => {}) }),
  },
];

for (const s of SCREENS) {
  test(`lobby: ${s.id} tiene [data-lobby] y al pulsarlo llama a router.reset (no a back)`, async () => {
    const env = fakeEnv();
    const router = fakeRouter();
    const root = fakeRoot(env);
    const made = await s.mount(env, router, root);
    await settle();
    const btn = root.querySelector('[data-lobby]');
    assert.ok(btn, `${s.id}: falta [data-lobby] al montar`);
    const html = root.innerHTML;
    const m = html.match(/<button[^>]*data-lobby[^>]*>([\s\S]*?)<\/button>/);
    assert.ok(m, `${s.id}: no se encuentra el botón lobby en el HTML`);
    assert.match(m[0], /aria-label="[^"]+"/, `${s.id}: el lobby necesita aria-label`);
    assert.match(m[1], /<svg[\s>]/, `${s.id}: el lobby lleva un icono svg`);
    assert.equal(m[1].replace(/<svg[\s\S]*?<\/svg>/g, '').trim(), '', `${s.id}: el lobby no lleva texto visible`);
    btn.emit('click');
    assert.equal(router.calls.reset, 1, `${s.id}: el lobby debe llamar a router.reset`);
    assert.equal(router.calls.back, 0, `${s.id}: el lobby no debe llamar a router.back`);
    made?.destroy?.();
  });
}

test('lobby: el hub NO lleva botón lobby (es la raíz)', () => {
  const src = readFileSync(new URL('../src/screens/hub.js', import.meta.url), 'utf8');
  assert.equal(src.includes('lobbyButton'), false);
  assert.equal(src.includes('data-lobby'), false);
});

test('lobby: Mapas manda su pie «Volver al Menú Principal» al lobby (reset), no a back', () => {
  const src = readFileSync(new URL('../src/screens/maps.js', import.meta.url), 'utf8');
  assert.match(src, /class="ghost back-to-lobby" data-home data-lobby/);
  assert.match(src, /if \(el\.dataset\.home !== undefined\) \{ ctx\.router\.reset\(\); return; \}/);
});
