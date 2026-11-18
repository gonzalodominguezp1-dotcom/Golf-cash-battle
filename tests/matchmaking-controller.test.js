import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeEnv } from './helpers/fakeEnv.js';
import { activeSearch, createSearch, onActiveSearch, resetSearches } from '../src/match/matchmakingController.js';
import { TIERS } from '../src/config.js';

const tier = TIERS.find((x) => x.entryFee > 0);

// búsqueda con reloj falso: now() y los temporizadores avanzan juntos con env.timers.advance
function make(env, extra = {}) {
  const calls = { cancel: 0, launch: 0, show: 0 };
  const s = createSearch({
    tier, mode: 'live', seats: 4,
    timers: env.timers, now: env.timers.now,
    onCancel: () => { calls.cancel++; },
    onLaunch: () => { calls.launch++; },
    show: () => { calls.show++; },
    ...extra,
  });
  return { s, calls };
}

beforeEach(() => resetSearches());

test('controlador: fases y búsqueda activa única', () => {
  const env = fakeEnv();
  const seen = [];
  const off = onActiveSearch((a) => seen.push(a));
  const { s } = make(env);
  assert.equal(activeSearch(), s);
  assert.equal(s.phase, 'search');
  const { s: s2 } = make(env);
  assert.equal(s.phase, 'aborted', 'una búsqueda nueva aborta la anterior (sin cancelar en servidor)');
  assert.equal(activeSearch(), s2);
  s2.finish();
  assert.equal(s2.phase, 'done');
  assert.equal(activeSearch(), null);
  assert.equal(seen.at(-1), null);
  off();
});

test('controlador: la cuenta atrás emite un evento por segundo (sin sondeo) y lanza al llegar a 0', () => {
  const env = fakeEnv();
  const { s, calls } = make(env);
  const secs = [];
  s.subscribe((ev) => { if (ev.type === 'second') secs.push(ev.secs); });
  s.setStartsAt(env.timers.now() + 5000);
  assert.deepEqual(secs, [5]);
  assert.equal(s.countdown().total, 5000);
  env.timers.advance(2500);
  assert.deepEqual(secs, [5, 4, 3]);
  assert.equal(env.liveTimers(), 1, 'un solo temporizador vivo: el del próximo segundo');
  env.timers.advance(3000);
  assert.deepEqual(secs, [5, 4, 3, 2, 1, 0]);
  assert.equal(calls.launch, 1);
  assert.equal(s.phase, 'launching');
  env.timers.advance(5000);
  assert.equal(calls.launch, 1, 'se lanza una sola vez');
  assert.equal(env.liveTimers(), 0);
});

test('controlador: si el servidor retrasa el arranque, la duración total crece y no se relanza antes', () => {
  const env = fakeEnv();
  const { s, calls } = make(env);
  s.setStartsAt(env.timers.now() + 4000);
  env.timers.advance(3000);
  s.setStartsAt(env.timers.now() + 6000);
  assert.equal(s.countdown().total, 6000);
  env.timers.advance(5000);
  assert.equal(calls.launch, 0);
  env.timers.advance(1100);
  assert.equal(calls.launch, 1);
});

test('controlador: cancelar llama a onCancel una sola vez, desde cualquier sitio, y para la cuenta atrás', async () => {
  const env = fakeEnv();
  const { s, calls } = make(env);
  s.setStartsAt(env.timers.now() + 8000);
  const ends = [];
  s.subscribe((ev) => { if (ev.type === 'end') ends.push(ev.phase); });
  const a = s.cancel(); // p. ej. el botón de la sala
  const b = s.cancel(); // y a la vez la X del aviso
  assert.equal(a, b);
  assert.equal(await a, true);
  assert.equal(calls.cancel, 1);
  assert.equal(s.phase, 'cancelled');
  assert.equal(activeSearch(), null);
  assert.deepEqual(ends, ['cancelled']);
  assert.equal(env.liveTimers(), 0, 'sin temporizadores colgando');
  env.timers.advance(20000);
  assert.equal(calls.launch, 0);
});

test('controlador: no se cancela una partida que ya se está lanzando', async () => {
  const env = fakeEnv();
  const { s, calls } = make(env);
  s.setStartsAt(env.timers.now() + 1000);
  env.timers.advance(1100);
  assert.equal(s.phase, 'launching');
  assert.equal(await s.cancel(), false);
  assert.equal(calls.cancel, 0);
});

test('controlador: la búsqueda sobrevive al desmontaje de la vista', () => {
  const env = fakeEnv();
  const { s, calls } = make(env);
  s.setStartsAt(env.timers.now() + 3000);
  const detach = s.attachView();
  assert.equal(s.visible, true);
  assert.equal(s.seen, true);
  detach();
  detach(); // idempotente
  assert.equal(s.visible, false);
  s.setSeat(0, { name: 'Ana', color: '#fff' });
  env.timers.advance(3100);
  assert.equal(calls.launch, 1, 'sin vista la cuenta atrás sigue y arranca sola');
  assert.equal(s.players[0].name, 'Ana');
});

test('controlador: present() lleva a la sala y resuelve al montarse (o tras el margen)', async () => {
  const env = fakeEnv();
  const { s, calls } = make(env, { presentMs: 500 });
  const p = s.present();
  assert.equal(calls.show, 1);
  s.attachView();
  await p;
  assert.equal(env.liveTimers(), 0);
  await s.present(); // ya a la vista: no navega
  assert.equal(calls.show, 1);

  resetSearches();
  const { s: s2 } = make(env, { presentMs: 500 });
  let done = false;
  s2.present().then(() => { done = true; });
  env.timers.advance(600);
  await Promise.resolve();
  assert.equal(done, true, 'sin sala montada no se queda esperando');
});

test('controlador: asientos solo emiten si cambian y marcan quién entra', () => {
  const env = fakeEnv();
  const { s } = make(env);
  const evs = [];
  s.subscribe((ev) => { if (ev.type === 'seat') evs.push(ev); });
  s.setSeat(1, { name: 'Ana', color: '#000' });
  s.setSeat(1, { name: 'Ana', color: '#000' });
  s.setSeat(9, { name: 'X', color: '#000' });
  assert.equal(evs.length, 1);
  assert.equal(evs[0].joined, true);
  assert.equal(s.filled(), 1);
});

test('controlador: si launch() falla, la fase pasa a error y la búsqueda puede cancelarse limpiamente', async () => {
  const env = fakeEnv();
  const { s, calls } = make(env, {
    onLaunch: async () => { throw new Error('fallo de red en tournaments.start'); },
  });
  s.setStartsAt(env.timers.now() + 1000);
  env.timers.advance(1100);
  await Promise.resolve();
  assert.equal(s.phase, 'error');
  assert.equal(await s.cancel(), true);
  assert.equal(calls.cancel, 1);
  assert.equal(s.phase, 'cancelled');
  assert.equal(activeSearch(), null);
});

test('controlador: tras fallo en launch(), se puede reintentar el arranque', async () => {
  const env = fakeEnv();
  let attempts = 0;
  const { s } = make(env, {
    onLaunch: async () => {
      attempts++;
      if (attempts === 1) throw new Error('fallo temporal');
    },
  });
  await s.launch().catch(() => {});
  assert.equal(s.phase, 'error');
  assert.equal(attempts, 1);
  await s.launch();
  assert.equal(s.phase, 'launching');
  assert.equal(attempts, 2);
});

test('main.js: stopLive no mata la búsqueda salvo al cancelar (force) y goHome sigue igual', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const stop = main.slice(main.indexOf('function stopLive('), main.indexOf('const liveNow'));
  assert.match(stop, /if \(live\.searching && !force\) return;/);
  assert.match(main, /onCancel: \(\) => stopLive\(\{ force: true \}\)/);
  // la búsqueda deja de estar «en espera» al empezar la partida: salir ya cuenta como abandono
  const begin = main.slice(main.indexOf('async function beginLive'), main.indexOf('function playLiveHole'));
  assert.match(begin, /live\.searching = false/);
  // la sala en vivo ya no se repinta por sondeo cada 250 ms ni depende de que la vista siga montada
  const room = main.slice(main.indexOf('function showLiveRoom'), main.indexOf('async function beginLive'));
  assert.doesNotMatch(room, /setInterval|isConnected|\b250\b/);
});
