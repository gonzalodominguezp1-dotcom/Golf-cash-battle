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
    replaceChildren(v) { this.innerHTML = v.html; },
    querySelector(sel) {
      const m = sel.match(/^\[(data-[\w-]+)\]$/);
      if (!m || !this.innerHTML.includes(m[1])) return null;
      if (!els.has(m[1])) els.set(m[1], env.el('button'));
      return els.get(m[1]);
    },
  };
}

// Vista falsa: el diseño real (src/ui/matchmakingView.js) necesita DOM; aquí solo se comprueba qué le pide la pantalla.
function fakeView(env, log) {
  return (o) => {
    log.opts = o;
    const classes = new Set();
    return {
      view: { html: `<main class="screen matchmaking">${o.title}${o.kicker}${o.footHtml}</main>`, classList: { contains: (c) => classes.has(c) } },
      cancelButton: env.el('button'),
      setSeat(i, p) { log.seats[i] = p; },
      setPot(v) { log.pot = v; },
      go() { log.went = true; classes.add('is-go'); },
      leave: async () => { log.left = true; },
      stop() { log.stopped = true; },
    };
  };
}

function makeCtx(env, router, log = { seats: [] }) {
  return {
    router,
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    icon: (n) => `<svg data-icon="${n}"></svg>`,
    ball: () => '<i class="ball"></i>',
    progress: { skin: 'classic' },
    matchmakingView: fakeView(env, log),
  };
}

const tier = TIERS.find((x) => x.entryFee > 0) ?? TIERS[0];

test('emparejar: pide la vista con título, mesa y asientos de la sesión y pinta el botón de cancelar', () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const log = { seats: [] };
  const session = createMatchmaking({ tier, cancel() {}, abandon() {} });
  mount(root, makeCtx(env, { reset() {} }, log));
  assert.match(root.innerHTML, /Buscando rivales/);
  assert.match(root.innerHTML, new RegExp(tier.name));
  assert.equal(log.opts.seats, session.seats);
  assert.equal(log.opts.tier, tier);
  assert.ok(log.opts.cancelLabel);
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
  const log = { seats: [] };
  createMatchmaking({ tier, cancel() { cancelled++; }, abandon() {} });
  // la vista falsa crea su botón al montar: se recoge de la vista devuelta
  let btn;
  const ctx = makeCtx(env, { reset() {} }, log);
  const make = ctx.matchmakingView;
  ctx.matchmakingView = (o) => { const r = make(o); btn = r.cancelButton; return r; };
  mount(root, ctx);
  btn.emit('click');
  assert.equal(cancelled, 1);
  assert.equal(btn.disabled, true);
});

test('emparejar: los asientos y el bote se repintan al rellenarse la sesión', () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const log = { seats: [] };
  const session = createMatchmaking({ tier, cancel() {}, abandon() {} });
  mount(root, makeCtx(env, { reset() {} }, log));
  assert.equal(log.seats.length, session.seats);
  assert.ok(log.seats.every((p) => p === null));
  session.fill(0, { id: 'me', name: 'Tú', color: '#fff' });
  session.fill(1, { id: 'b1', name: 'Ana', color: '#000' });
  assert.equal(log.seats[0].me, true);
  assert.equal(log.seats[1].name, 'Ana');
  assert.equal(log.pot, tier.entryFee * 2);
});

test('emparejar: finish() pinta «¡YA!», dispara la salida animada y resuelve', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const log = { seats: [] };
  const session = createMatchmaking({ tier, cancel() {}, abandon() {} });
  mount(root, makeCtx(env, { reset() {} }, log));
  await session.finish();
  assert.equal(session.phase, 'leaving');
  assert.equal(log.went, true);
  assert.equal(log.left, true);
});

test('emparejar: sin sesión abierta muestra un aviso y el lobby, sin fallar', () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  createMatchmaking({ tier, cancel() {}, abandon() {} });
  closeMatchmaking();
  mount(root, makeCtx(env, { reset() {} }));
  assert.match(root.innerHTML, /No hay ninguna partida/);
  assert.match(root.innerHTML, /data-lobby/);
  assert.doesNotMatch(root.innerHTML, /Buscando rivales/);
});

test('emparejar: 20 ciclos de montar, rellenar y destruir no dejan listeners ni timers vivos', () => {
  const env = fakeEnv();
  const base = env.liveListeners();
  for (let n = 0; n < 20; n++) {
    const root = fakeRoot(env);
    const log = { seats: [] };
    const session = createMatchmaking({ tier, cancel() {}, abandon() {} });
    const screen = mount(root, makeCtx(env, { reset() {} }, log));
    session.fill(0, { id: 'me', name: 'Tú', color: '#fff' });
    session.fill(1, { id: 'b1', name: 'Ana', color: '#000' });
    assert.ok(env.liveListeners() > base, 'con la pantalla montada hay listeners vivos');
    screen.destroy();
    assert.equal(log.stopped, true);
    assert.equal(env.liveListeners(), base, `ciclo ${n}: sin fugas tras destroy`);
    assert.equal(env.liveTimers(), 0);
  }
});
