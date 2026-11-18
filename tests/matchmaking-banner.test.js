import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createSearch, resetSearches } from '../src/match/matchmakingController.js';
import { mountMatchmakingBanner } from '../src/ui/matchmakingBanner.js';
import { TIERS } from '../src/config.js';

const tier = TIERS.find((x) => x.entryFee > 0);

// documento falso mínimo: el aviso se construye con createElement y se cuelga de body
function fakeDoc(env) {
  const created = [];
  return {
    created,
    body: env.el('body'),
    documentElement: env.el('html'),
    createElement(tag) {
      const e = env.el(tag);
      created.push(e);
      return e;
    },
  };
}

beforeEach(() => resetSearches());

function setup() {
  const env = fakeEnv();
  const doc = fakeDoc(env);
  const opened = [];
  const ticks = [];
  const banner = mountMatchmakingBanner({ doc, timers: env.timers, onOpen: (s) => opened.push(s), sound: () => ticks.push(1) });
  const byClass = (c) => doc.created.find((e) => e.className.split(' ').includes(c));
  return { env, doc, banner, opened, ticks, byClass };
}

test('aviso: oculto sin búsqueda; aparece al volver al lobby sin cancelar y se esconde con la sala a la vista', () => {
  const { env, doc, banner, byClass } = setup();
  assert.equal(banner.shown, false);
  const s = createSearch({ tier, mode: 'live', seats: 4, timers: env.timers, now: env.timers.now, onLaunch() {} });
  assert.equal(banner.shown, false, 'al empezar la búsqueda se abre la sala, no el aviso');
  const detach = s.attachView(); // la sala abierta: no hace falta aviso
  assert.equal(banner.shown, false);
  detach(); // «Volver al lobby»
  assert.equal(banner.shown, true);
  assert.equal(doc.documentElement.classList.contains('has-mmb'), true, 'los avisos emergentes se apartan');
  assert.equal(banner.el.hidden, false);
  s.attachView(); // tocar el aviso: vuelve a la sala
  assert.equal(banner.shown, false);
  env.timers.advance(300);
  assert.equal(banner.el.hidden, true, 'sale con animación y luego se oculta');
  assert.ok(byClass('mmb-title'));
});

test('aviso: cuenta atrás en vivo, tic en los últimos segundos y oculto al lanzar la partida', () => {
  const { env, banner, ticks, byClass } = setup();
  const s = createSearch({ tier, mode: 'live', seats: 4, timers: env.timers, now: env.timers.now, onLaunch() {} });
  s.attachView()(); // se vio la sala y se volvió al lobby
  s.setSeat(0, { name: 'Tú', color: '#fff', me: true });
  s.setStartsAt(env.timers.now() + 6000);
  const sub = byClass('mmb-sub');
  assert.match(sub.textContent, /Empieza en 6 s/);
  assert.match(sub.textContent, /1\/4/);
  env.timers.advance(2100);
  assert.match(sub.textContent, /Empieza en 4 s/);
  assert.equal(ticks.length, 0);
  env.timers.advance(3000);
  assert.ok(ticks.length >= 2, 'tic en los segundos urgentes');
  s.finish(); // la partida empieza
  assert.equal(banner.shown, false);
});

test('aviso: la X cancela una sola vez y tocar el cuerpo vuelve a la sala', async () => {
  const { env, banner, opened, byClass } = setup();
  let cancels = 0;
  const s = createSearch({ tier, mode: 'practice', seats: 4, timers: env.timers, now: env.timers.now, onCancel: () => { cancels++; } });
  assert.equal(banner.shown, false, 'sin aviso mientras la sala se abre');
  s.attachView()();
  assert.equal(banner.shown, true);
  byClass('mmb-open').emit('click');
  assert.equal(opened[0], s);
  const x = byClass('mmb-cancel');
  x.emit('click');
  x.emit('click');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(cancels, 1);
  assert.equal(banner.shown, false);
  assert.equal(s.phase, 'cancelled');
});

test('aviso: refleja el estado de error si el arranque falla y permite cancelar desde la X', async () => {
  const { env, banner, byClass } = setup();
  let cancels = 0;
  const s = createSearch({
    tier,
    mode: 'live',
    seats: 4,
    timers: env.timers,
    now: env.timers.now,
    onCancel: () => { cancels++; },
    onLaunch: async () => { throw new Error('fallo al arrancar'); },
  });
  s.attachView()(); // sala vista y vuelta al lobby
  assert.equal(banner.shown, true);
  s.setStartsAt(env.timers.now() + 1000);
  env.timers.advance(1100);
  await Promise.resolve();
  assert.equal(s.phase, 'error');
  assert.equal(banner.shown, true);
  assert.match(byClass('mmb').className, /\bis-error\b/);
  assert.match(byClass('mmb-title').textContent, /Error al iniciar partida/);
  const x = byClass('mmb-cancel');
  assert.equal(x.disabled, false, 'cancelar está habilitado en estado de error');
  x.emit('click');
  await Promise.resolve();
  assert.equal(cancels, 1);
  assert.equal(s.phase, 'cancelled');
  assert.equal(banner.shown, false);
});

test('aviso: destroy quita listeners y temporizadores', () => {
  const { env, banner } = setup();
  const base = env.liveListeners();
  createSearch({ tier, mode: 'practice', seats: 4, timers: env.timers, now: env.timers.now }).abort();
  banner.destroy();
  assert.ok(env.liveListeners() < base);
  env.timers.advance(1000);
  assert.equal(env.liveTimers(), 0);
});
