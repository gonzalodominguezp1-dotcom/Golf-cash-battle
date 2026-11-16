import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { closeMatchmaking, mount, createMatchmaking } from '../src/screens/matchmaking.js';
import { TIERS } from '../src/config.js';

// Raíz falsa: reconoce [data-x] sobre el HTML pintado y devuelve elementos estables (cacheados por atributo).
function fakeRoot(env) {
  const els = new Map();
  return {
    innerHTML: '',
    querySelector(sel) {
      const m = sel.match(/^\[(data-[\w-]+)\]$/);
      if (!m || !this.innerHTML.includes(m[1])) return null;
      if (!els.has(m[1])) els.set(m[1], env.el('button'));
      return els.get(m[1]);
    },
  };
}

function makeCtx(env, router) {
  return {
    router,
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    icon: (n) => `<svg data-icon="${n}"></svg>`,
    ball: () => '<i class="ball"></i>',
    progress: { skin: 'classic' },
  };
}

const tier = TIERS.find((x) => x.entryFee > 0) ?? TIERS[0];

test('emparejar: pinta título, mesa y asientos vacíos y el botón de cancelar', () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  createMatchmaking({ tier, cancel() {}, abandon() {} });
  mount(root, makeCtx(env, { reset() {} }));
  assert.match(root.innerHTML, /Buscando rivales/);
  assert.match(root.innerHTML, /data-mm-seats/);
  assert.match(root.innerHTML, /data-mm-cancel/);
  assert.match(root.innerHTML, new RegExp(tier.name));
});

test('emparejar: sin cabecera, sin scr-back ni barras del HUD anterior', () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  createMatchmaking({ tier, cancel() {}, abandon() {} });
  mount(root, makeCtx(env, { reset() {} }));
  const html = root.innerHTML;
  assert.doesNotMatch(html, /<header/);
  assert.doesNotMatch(html, /scr-back/);
  assert.doesNotMatch(html, /topbar/);
  assert.doesNotMatch(html, /tabbar/);
  assert.doesNotMatch(html, /desktop-nav/);
});

test('emparejar: el lobby flotante existe y lleva a la raíz; deja la búsqueda sin navegar a otro sitio', () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  let resets = 0, abandoned = 0;
  createMatchmaking({ tier, cancel() {}, abandon() { abandoned++; } });
  mount(root, makeCtx(env, { reset() { resets++; } }));
  assert.match(root.innerHTML, /data-lobby/);
  const lobby = root.querySelector('[data-lobby]');
  lobby.emit('click');
  assert.equal(resets, 1);
  assert.equal(abandoned, 1);
});

test('emparejar: cancelar llama a cancel() de la sesión y deshabilita el botón', () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  let cancelled = 0;
  createMatchmaking({ tier, cancel() { cancelled++; }, abandon() {} });
  mount(root, makeCtx(env, { reset() {} }));
  const btn = root.querySelector('[data-mm-cancel]');
  btn.emit('click');
  assert.equal(cancelled, 1);
  assert.equal(btn.disabled, true);
});

test('emparejar: los asientos se repintan al rellenarse la sesión', () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const session = createMatchmaking({ tier, cancel() {}, abandon() {} });
  mount(root, makeCtx(env, { reset() {} }));
  const seats = root.querySelector('[data-mm-seats]');
  assert.equal((seats.innerHTML.match(/class="seat"/g) ?? []).length, session.seats);
  session.fill(0, { id: 'me', name: 'Tú', color: '#fff' });
  session.fill(1, { id: 'b1', name: 'Ana', color: '#000' });
  assert.match(seats.innerHTML, /seat filled me/);
  assert.match(seats.innerHTML, /Ana/);
});

test('emparejar: sin sesión abierta muestra un aviso y el lobby, sin fallar', () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  createMatchmaking({ tier, cancel() {}, abandon() {} });
  closeMatchmaking();
  mount(root, makeCtx(env, { reset() {} }));
  assert.match(root.innerHTML, /No hay ninguna partida/);
  assert.match(root.innerHTML, /data-lobby/);
  assert.doesNotMatch(root.innerHTML, /data-mm-cancel/);
});

test('emparejar: 20 ciclos de montar, rellenar y destruir no dejan listeners ni timers vivos', () => {
  const env = fakeEnv();
  const base = env.liveListeners();
  for (let n = 0; n < 20; n++) {
    const root = fakeRoot(env);
    const session = createMatchmaking({ tier, cancel() {}, abandon() {} });
    const screen = mount(root, makeCtx(env, { reset() {} }));
    session.fill(0, { id: 'me', name: 'Tú', color: '#fff' });
    session.fill(1, { id: 'b1', name: 'Ana', color: '#000' });
    assert.ok(env.liveListeners() > base, 'con la pantalla montada hay listeners vivos');
    screen.destroy();
    assert.equal(env.liveListeners(), base, `ciclo ${n}: sin fugas tras destroy`);
    assert.equal(env.liveTimers(), 0);
  }
});
