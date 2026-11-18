import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { mount } from '../src/screens/matchmaking.js';
import { createSearch, resetSearches } from '../src/match/matchmakingController.js';
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
    log.seatCalls = [];
    const classes = new Set();
    const r = {
      view: { html: `<main class="screen matchmaking">${o.title}${o.kicker}<i data-mm-cancel></i><i data-mm-lobby></i></main>`, classList: { contains: (c) => classes.has(c) } },
      cancelButton: env.el('button'),
      lobbyButton: env.el('button'),
      setSeat(i, p, opts = {}) { log.seats[i] = p; log.seatCalls.push({ i, p, ...opts }); },
      settle() {},
      setPot(v, opts = {}) { log.pot = v; log.potOpts = opts; },
      setCountdown(ms, total) { log.count = { ms, total }; },
      setStatus(s) { log.status = s; },
      go(opts = {}) { log.went = true; log.goOpts = opts; classes.add('is-go'); },
      lock(on) { log.locked = on; },
      leave: async () => { log.left = true; },
      stop() { log.stopped = true; },
    };
    log.room = r;
    return r;
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
const search = (env, extra = {}) => createSearch({ tier, mode: 'local', seats: 8, timers: env.timers, now: env.timers.now, ...extra });

beforeEach(() => resetSearches());

test('emparejar: pide la vista con título, mesa, asientos y los dos botones de la búsqueda activa', () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const log = { seats: [] };
  const s = search(env);
  mount(root, makeCtx(env, { reset() {} }, log));
  assert.match(root.innerHTML, /Buscando rivales/);
  assert.match(root.innerHTML, new RegExp(tier.name));
  assert.equal(log.opts.seats, s.seats);
  assert.equal(log.opts.tier, tier);
  assert.match(log.opts.cancelLabel, /Cancelar emparejamiento/);
  assert.match(log.opts.lobbyLabel, /Volver al lobby/);
  assert.equal(log.opts.fresh, true);
});

test('emparejar: sin cabecera, sin scr-back, sin botón flotante del lobby ni barras del HUD anterior', () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  search(env);
  const log = { seats: [] };
  mount(root, makeCtx(env, { reset() {} }, log));
  const html = root.innerHTML;
  assert.doesNotMatch(html, /<header/);
  assert.doesNotMatch(html, /scr-back/);
  assert.doesNotMatch(html, /scr-lobby|data-lobby/, 'los botones van bajo los jugadores, no flotando');
  assert.doesNotMatch(html, /topbar/);
  assert.doesNotMatch(html, /tabbar/);
  assert.doesNotMatch(html, /desktop-nav/);
  assert.equal(log.opts.footHtml, undefined);
  assert.equal(log.opts.legalHtml, undefined);
});

test('emparejar: «Volver al lobby» va a la raíz SIN cancelar; la búsqueda sigue sin vista', () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  let resets = 0, cancels = 0;
  const log = { seats: [] };
  const s = search(env, { onCancel() { cancels++; } });
  const screen = mount(root, makeCtx(env, { reset() { resets++; } }, log));
  assert.equal(s.visible, true);
  log.room.lobbyButton.emit('click');
  assert.equal(resets, 1);
  assert.equal(cancels, 0);
  screen.destroy(); // el host desmonta la sala
  assert.equal(s.visible, false);
  assert.equal(s.ended, false);
  assert.equal(s.phase, 'search');
});

test('emparejar: «Cancelar emparejamiento» cancela una vez, bloquea los botones y vuelve al lobby', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  let cancels = 0, resets = 0;
  const log = { seats: [] };
  const s = search(env, { onCancel() { cancels++; } });
  mount(root, makeCtx(env, { reset() { resets++; } }, log));
  const btn = log.room.cancelButton;
  btn.emit('click');
  btn.emit('click');
  assert.equal(btn.disabled, true);
  assert.equal(log.locked, true);
  await new Promise((r) => setImmediate(r));
  assert.equal(cancels, 1);
  assert.equal(s.phase, 'cancelled');
  assert.ok(resets >= 1);
});

test('emparejar: los asientos y el bote se repintan al rellenarse la búsqueda (los bots no suman al bote)', () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const log = { seats: [] };
  const s = search(env);
  mount(root, makeCtx(env, { reset() {} }, log));
  assert.equal(log.seats.length, s.seats);
  assert.ok(log.seats.every((p) => p === null));
  s.setSeat(0, { name: 'Tú', color: '#fff', me: true });
  s.setSeat(1, { name: 'Ana', color: '#000' });
  s.setSeat(2, { name: 'Bot', color: '#000', isBot: true });
  assert.equal(log.seats[0].me, true);
  assert.equal(log.seats[1].name, 'Ana');
  assert.equal(log.pot, tier.entryFee * 2);
});

test('emparejar: al volver a la sala (desde el aviso) se pinta el estado actual sin repetir entradas', () => {
  const env = fakeEnv();
  const log = { seats: [] };
  const s = search(env);
  const first = mount(fakeRoot(env), makeCtx(env, { reset() {} }, log));
  s.setSeat(0, { name: 'Tú', color: '#fff', me: true });
  s.setStartsAt(env.timers.now() + 7000);
  first.destroy();
  env.timers.advance(2000);
  mount(fakeRoot(env), makeCtx(env, { reset() {} }, log));
  assert.equal(log.opts.fresh, false);
  assert.equal(log.seatCalls[0].animate, false);
  assert.equal(log.seatCalls[0].p.name, 'Tú');
  assert.equal(log.potOpts.instant, true);
  assert.equal(log.count.ms, 5000);
  assert.equal(log.count.total, 7000);
});

test('emparejar: la cuenta atrás llega por eventos de segundo y la salida la pinta la sala', async () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  const log = { seats: [] };
  const s = search(env);
  mount(root, makeCtx(env, { reset() {} }, log));
  s.setStartsAt(env.timers.now() + 3000);
  env.timers.advance(1010);
  assert.equal(log.count.ms, 1996, 'el tic cae justo tras el cambio de segundo (3000 - 1004)');
  s.setPhase('launching');
  assert.equal(log.locked, true);
  s.go();
  assert.equal(log.went, true);
  await s.leave();
  assert.equal(log.left, true);
  assert.equal(s.phase, 'leaving');
});

test('emparejar: sin búsqueda activa muestra un aviso y un botón para volver, sin fallar', () => {
  const env = fakeEnv();
  const root = fakeRoot(env);
  let resets = 0;
  mount(root, makeCtx(env, { reset() { resets++; } }));
  assert.match(root.innerHTML, /No hay ninguna partida/);
  assert.match(root.innerHTML, /data-mm-lobby/);
  assert.doesNotMatch(root.innerHTML, /Buscando rivales|scr-lobby/);
  root.querySelector('[data-mm-lobby]').emit('click');
  assert.equal(resets, 1);
});

test('emparejar: 20 ciclos de montar, rellenar y destruir no dejan listeners ni temporizadores vivos', () => {
  const env = fakeEnv();
  const base = env.liveListeners();
  for (let n = 0; n < 20; n++) {
    resetSearches();
    const root = fakeRoot(env);
    const log = { seats: [] };
    const s = search(env);
    const screen = mount(root, makeCtx(env, { reset() {} }, log));
    s.setSeat(0, { name: 'Tú', color: '#fff', me: true });
    s.setSeat(1, { name: 'Ana', color: '#000' });
    assert.ok(env.liveListeners() > base, 'con la pantalla montada hay listeners vivos');
    screen.destroy();
    assert.equal(log.stopped, true);
    assert.equal(s.visible, false);
    assert.equal(env.liveListeners(), base, `ciclo ${n}: sin fugas tras destroy`);
    assert.equal(env.liveTimers(), 0);
  }
});
