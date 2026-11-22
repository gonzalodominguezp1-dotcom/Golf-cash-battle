import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGamePreloader, holdForWarm } from '../src/game/gamePreloader.js';
import { keyOf } from '../src/game/warmupRules.js';
import { HOLD_LIVE_MS, HOLD_PRACTICE_MS, WARM_IN_ROOM, WARM_LIVE, urlOff } from '../src/game/loadingFlags.js';

const COURSE = { name: 'Pradera' };
const SKIN = { id: 'classic' };
const INST = { seed: 42 };
const req = (over = {}) => ({ course: COURSE, courseIndex: 0, skin: SKIN, instance: INST, ghosts: 3, quality: 'medium', ...over });
const KEY = keyOf(COURSE, SKIN, INST, 'medium');

const flush = async (n = 6) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};

/** Montaje con un GolfGame falso cuyo prepare() se resuelve a mano. */
function setup({ enabled = true, prepareImpl } = {}) {
  const log = [];
  const games = [];
  const holders = [];
  class FakeGame {
    constructor(holder, handlers) {
      this.holder0 = holder;
      this.handlers = handlers;
      this.disposed = 0;
      this.pending = deferred();
      log.push('ctor');
      games.push(this);
    }
    prepare(course, opts) {
      log.push('prepare');
      this.opts = opts;
      return prepareImpl ? prepareImpl(this, course, opts) : this.pending.promise;
    }
    dispose() { this.disposed++; log.push('dispose'); }
  }
  const p = createGamePreloader({
    importGame: async () => { log.push('import'); return FakeGame; },
    releaseHub: () => log.push('releaseHub'),
    releaseCurrentGame: () => log.push('releaseCurrentGame'),
    makeHolder: () => {
      const h = { removed: 0, remove() { this.removed++; } };
      holders.push(h);
      return h;
    },
    enabled: () => enabled,
    probe: { mark: (name) => log.push(`mark:${name}`) },
  });
  return { p, log, games, holders };
}

test('warm llama en orden a releaseCurrentGame, releaseHub, importGame, constructor y prepare', async () => {
  const { p, log, games } = setup();
  const h = p.warm(req());
  await flush();
  assert.deepEqual(log.filter((x) => !x.startsWith('mark:')), ['releaseCurrentGame', 'releaseHub', 'import', 'ctor', 'prepare']);
  assert.equal(games[0].opts.ghosts, 3);
  assert.equal(games[0].opts.skin, SKIN);
  assert.equal(games[0].opts.instance, INST);
  assert.ok(log.includes('mark:warm:start'));
  games[0].pending.resolve(true);
  assert.equal(await h.ready, true);
  assert.ok(log.includes('mark:warm:ready'));
});

test('un segundo warm libera el primero: nunca hay dos juegos preparados', async () => {
  const { p, games, holders } = setup();
  const h1 = p.warm(req());
  await flush();
  games[0].pending.resolve(true);
  assert.equal(await h1.ready, true);
  const h2 = p.warm(req({ course: { name: 'Volcán' } }));
  assert.equal(games[0].disposed, 1, 'el primero se libera al empezar el segundo');
  assert.equal(holders[0].removed, 1);
  await flush();
  games[1].pending.resolve(true);
  assert.equal(await h2.ready, true);
  assert.equal(games.filter((g) => !g.disposed).length, 1);
  assert.equal(p.take(h1, KEY), null, 'el handle viejo ya no entrega nada');
});

test('un segundo warm durante el primer prepare: el tardío se libera al resolver', async () => {
  const { p, games, holders } = setup();
  const h1 = p.warm(req());
  await flush();
  p.warm(req());
  games[0].pending.resolve(true);
  assert.equal(await h1.ready, false);
  assert.ok(games[0].disposed >= 1);
  assert.ok(holders[0].removed >= 1);
});

test('cancel durante prepare libera al resolver y ready da false', async () => {
  const { p, games, holders, log } = setup();
  const h = p.warm(req());
  await flush();
  assert.equal(p.holds(), true);
  h.cancel();
  assert.equal(p.holds(), false);
  assert.ok(log.includes('mark:warm:cancel'));
  assert.equal(games[0].opts.signal.cancelled, true, 'prepare ve la señal cancelada');
  games[0].pending.resolve(true);
  assert.equal(await h.ready, false);
  assert.ok(games[0].disposed >= 1);
  assert.ok(holders[0].removed >= 1);
  assert.equal(p.take(h, KEY), null);
});

test('cancel antes de que llegue el motor: no se crea el juego', async () => {
  const { p, games } = setup();
  const h = p.warm(req());
  h.cancel();
  assert.equal(await h.ready, false);
  await flush();
  assert.equal(games.length, 0);
});

test('release() con la sala esperando: ready resuelve ya a false (no espera al prepare en vuelo)', async () => {
  const { p, games } = setup();
  const h = p.warm(req());
  await flush();
  assert.equal(h.settled, false);
  p.release(); // p. ej. «Volver al lobby» con la búsqueda activa
  assert.equal(h.settled, true);
  assert.equal(h.cancelled, true);
  assert.equal(await h.ready, false);
  assert.equal(games[0].disposed, 1);
  // la sala no espera: holdForWarm sale sin poner estado
  const search = { status: null, setStatus() { throw new Error('no debería tocar la sala'); } };
  assert.equal(await holdForWarm(h, search, 2000), false);
  games[0].pending.resolve(true); // el prepare tardío no resucita nada
  await flush();
  assert.equal(p.holds(), false);
});

test('take con la misma clave entrega el juego; con otra libera y devuelve null', async () => {
  const a = setup();
  const h = a.p.warm(req());
  await flush();
  a.games[0].pending.resolve(true);
  await h.ready;
  const g = a.p.take(h, KEY);
  assert.equal(g, a.games[0]);
  assert.equal(g.disposed, 0);
  assert.equal(g.holder, a.holders[0], 'el juego lleva su holder (attach lo quita)');
  assert.equal(a.p.holds(), false);
  a.p.release();
  assert.equal(g.disposed, 0, 'tras take, release no toca el juego entregado');
  assert.ok(a.log.includes('mark:warm:take:hit'));

  const b = setup();
  const h2 = b.p.warm(req());
  await flush();
  b.games[0].pending.resolve(true);
  await h2.ready;
  assert.equal(b.p.take(h2, keyOf(COURSE, SKIN, INST, 'high')), null);
  assert.equal(b.games[0].disposed, 1);
  assert.equal(b.holders[0].removed, 1);
  assert.equal(b.p.holds(), false);
  assert.ok(b.log.includes('mark:warm:take:miss'));
});

test('take antes de que esté listo: libera y null', async () => {
  const { p, games } = setup();
  const h = p.warm(req());
  await flush();
  assert.equal(p.take(h, KEY), null);
  assert.equal(games[0].disposed, 1);
  games[0].pending.resolve(true);
  assert.equal(await h.ready, false);
});

test('un error en prepare da ready=false y libera', async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { p, games, holders } = setup({ prepareImpl: async () => { throw new Error('sin webgl'); } });
    const h = p.warm(req());
    assert.equal(await h.ready, false);
    assert.equal(games[0].disposed, 1);
    assert.equal(holders[0].removed, 1);
    assert.equal(p.holds(), false);
  } finally {
    console.warn = warn;
  }
});

test('prepare que resuelve false (cancelado por dentro) libera', async () => {
  const { p, games } = setup({ prepareImpl: async () => false });
  const h = p.warm(req());
  assert.equal(await h.ready, false);
  assert.equal(games[0].disposed, 1);
  assert.equal(p.holds(), false);
});

test('holds() en cada estado', async () => {
  const { p, games } = setup();
  assert.equal(p.holds(), false);
  const h = p.warm(req());
  assert.equal(p.holds(), true, 'en preparación (antes del motor)');
  await flush();
  assert.equal(p.holds(), true, 'en preparación');
  games[0].pending.resolve(true);
  await h.ready;
  assert.equal(p.holds(), true, 'preparado');
  p.release();
  assert.equal(p.holds(), false, 'liberado');
});

test('enabled=false no crea nada', async () => {
  const { p, log, games } = setup({ enabled: false });
  const h = p.warm(req());
  assert.equal(await h.ready, false);
  assert.equal(h.settled, true);
  assert.equal(games.length, 0);
  assert.deepEqual(log, []);
  assert.equal(p.holds(), false);
  assert.equal(p.take(h, KEY), null);
});

test('el progreso de prepare llega al handle', async () => {
  const { p } = setup({ prepareImpl: async (_g, _c, opts) => { opts.onProgress(0.5); opts.onStep('static'); opts.onProgress(1); return true; } });
  const h = p.warm(req());
  assert.equal(await h.ready, true);
  assert.equal(h.progress, 1);
});

test('las marcas de paso llevan el nombre', async () => {
  const { p, log } = setup({ prepareImpl: async (_g, _c, opts) => { opts.onStep('static'); return true; } });
  await p.warm(req()).ready;
  assert.ok(log.includes('mark:warm:step:static'));
});

// ---------- holdForWarm ----------

function fakeSearch() {
  const statuses = [];
  return { status: null, ended: false, statuses, setStatus(t) { this.status = t; statuses.push(t); } };
}

test('holdForWarm respeta el tope y pone el estado', async () => {
  let fire;
  const timers = { setTimeout: (fn, ms) => { fire = fn; assert.equal(ms, 2000); return 1; }, clearTimeout: () => {} };
  const marks = [];
  const handle = { ready: new Promise(() => {}), settled: false, cancelled: false };
  const search = fakeSearch();
  const p = holdForWarm(handle, search, 2000, { timers, mark: (n) => marks.push(n) });
  assert.equal(search.status, 'Preparando el campo…');
  fire();
  assert.equal(await p, false);
  assert.deepEqual(marks, ['hold:start', 'hold:end']);
  assert.equal(search.status, null, 'vuelve al estado de antes');
});

test('holdForWarm espera a que esté listo', async () => {
  const d = deferred();
  let cleared = 0;
  const timers = { setTimeout: () => 9, clearTimeout: (id) => { if (id === 9) cleared++; } };
  const search = fakeSearch();
  const p = holdForWarm({ ready: d.promise, settled: false, cancelled: false }, search, 2000, { timers });
  d.resolve(true);
  assert.equal(await p, true);
  assert.equal(cleared, 1);
});

test('holdForWarm sin esperar si ya terminó, se canceló o no hay handle', async () => {
  const search = fakeSearch();
  assert.equal(await holdForWarm({ ready: Promise.resolve(true), settled: true }, search, 2000), true);
  assert.equal(await holdForWarm({ ready: Promise.resolve(false), settled: true }, search, 2000), false);
  assert.equal(await holdForWarm({ ready: new Promise(() => {}), settled: false, cancelled: true }, search, 2000), false);
  assert.equal(await holdForWarm(null, search, 2000), false);
  assert.deepEqual(search.statuses, [], 'no toca el estado de la sala');
});

test('hold del preloader usa sus timers y su sonda', async () => {
  let fire;
  const log = [];
  const p = createGamePreloader({
    importGame: () => new Promise(() => {}),
    enabled: () => true,
    timers: { setTimeout: (fn) => { fire = fn; return 1; }, clearTimeout: () => {} },
    probe: { mark: (n) => log.push(n) },
  });
  const h = p.warm(req());
  const search = fakeSearch();
  const r = p.hold(h, search, HOLD_PRACTICE_MS);
  fire();
  assert.equal(await r, false);
  assert.ok(log.includes('hold:start') && log.includes('hold:end'));
});

// ---------- reglas e interruptores ----------

test('keyOf distingue calidad, skin, acabado y curso', () => {
  const base = keyOf(COURSE, SKIN, INST, 'medium');
  assert.equal(base, keyOf({ name: 'Pradera' }, { id: 'classic' }, { seed: 42 }, 'medium'));
  assert.notEqual(base, keyOf(COURSE, SKIN, INST, 'low'));
  assert.notEqual(base, keyOf(COURSE, { id: 'lava' }, INST, 'medium'));
  assert.notEqual(base, keyOf({ name: 'Volcán' }, SKIN, INST, 'medium'));
  assert.notEqual(base, keyOf(COURSE, SKIN, { seed: 7 }, 'medium'));
  assert.equal(keyOf(COURSE, SKIN, null, 'medium'), 'Pradera|classic||medium');
});

test('interruptores de la carga', () => {
  assert.equal(WARM_IN_ROOM, true);
  assert.equal(WARM_LIVE, false);
  assert.equal(HOLD_PRACTICE_MS, 2000);
  assert.equal(HOLD_LIVE_MS, 1000);
  assert.equal(urlOff('warm', '?perf=1&warm=0'), true);
  assert.equal(urlOff('warm', '?perf=1'), false);
  assert.equal(urlOff('warm', '?warm=1'), false);
});

// ---------- fuentes ----------

// sin \r: el repositorio puede tener los fuentes con CRLF en Windows
const game = readFileSync(new URL('../src/game/GolfGame.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('GolfGame: el constructor ya no enlaza la entrada; load() la enlaza y tiene el camino rápido', () => {
  const ctor = game.slice(game.indexOf('  constructor('), game.indexOf('  load('));
  assert.ok(ctor.length > 0);
  assert.doesNotMatch(ctor, /#bindInput\(\)/);
  assert.match(ctor, /this\.setHandlers\(handlers\)/);
  const load = game.slice(game.indexOf('  load('), game.indexOf('  setHandlers('));
  assert.match(load, /this\.preparedKey === keyOf\(course, skin, instance, getQuality\(\)\)/);
  assert.match(load, /#ensureInput\(\)/);
  assert.match(game, /#ensureInput\(\) \{\s*if \(this\.#inputBound\) return;/);
});

test('GolfGame: prepare no toca tick, bola de física, golpes, bots, bucle ni audio', () => {
  const start = game.indexOf('  async prepare(');
  const prep = game.slice(start, game.indexOf('\n  }\n', start));
  assert.ok(prep.length > 0);
  for (const bad of [/this\.tick\b/, /this\.ball\s*=/, /this\.shots/, /#buildBots/, /#resetPlayState/, /#startLoop/, /setAnimationLoop/, /sfx\./, /setAmbient/, /new Bot\(/]) {
    assert.doesNotMatch(prep, bad, `prepare no debe usar ${bad}`);
  }
  assert.match(prep, /runSteps\(/);
  assert.match(prep, /#warmGpu\(/);
  assert.match(prep, /this\.preparedKey = keyOf\(/);
});

test('main.js: la preparación se suelta al volver al hub y en vivo queda tras WARM_LIVE', () => {
  assert.match(main, /reviveHubScene: \(\) => \{ gamePreloader\.release\(\); reviveHubScene\(\); \}/);
  assert.match(main, /if \(WARM_LIVE\) live\.warm = gamePreloader\.warm\(/);
  assert.match(main, /enabled: \(\) => WARM_IN_ROOM && !urlOff\('warm'\)/);
  // reviveHubScene no mira la preparación
  const revive = main.slice(main.indexOf('function reviveHubScene()'), main.indexOf('const goHomeBase'));
  assert.doesNotMatch(revive, /gamePreloader/);
});
