import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NEXT_WAIT_MS, canReuseGame, nextToPrepare } from '../src/game/holeWindowRules.js';
import { NEXT_HOLE_PREBUILD, PERSISTENT_LIVE, PERSISTENT_RENDERER } from '../src/game/loadingFlags.js';

test('interruptores de F3: renderer persistente y siguiente preparado; vivo apagado', () => {
  assert.equal(PERSISTENT_RENDERER, true);
  assert.equal(NEXT_HOLE_PREBUILD, true);
  assert.equal(PERSISTENT_LIVE, false);
  assert.equal(NEXT_WAIT_MS, 1000);
});

test('práctica y mesa local: tras el hoyo i se prepara el i+1, nunca más allá', () => {
  assert.deepEqual(nextToPrepare({ mode: 'practice', index: 0, holes: 3 }), { kind: 'hole', index: 1 });
  assert.deepEqual(nextToPrepare({ mode: 'practice', index: 1, holes: 3 }), { kind: 'hole', index: 2 });
  assert.deepEqual(nextToPrepare({ mode: 'local', index: 0, holes: 2 }), { kind: 'hole', index: 1 });
});

test('último hoyo: nada sin empate; desempate si el jugador está empatado', () => {
  assert.equal(nextToPrepare({ mode: 'practice', index: 2, holes: 3 }), null);
  assert.equal(nextToPrepare({ mode: 'practice', index: 2, holes: 3, tied: false }), null);
  assert.deepEqual(nextToPrepare({ mode: 'practice', index: 2, holes: 3, tied: true }), { kind: 'tiebreak' });
  assert.deepEqual(nextToPrepare({ mode: 'practice', index: 0, holes: 1, tied: true }), { kind: 'tiebreak' }); // #hoyo3-empate
  // antes del último hoyo el empate no cuenta: se prepara el hoyo siguiente
  assert.deepEqual(nextToPrepare({ mode: 'practice', index: 0, holes: 3, tied: true }), { kind: 'hole', index: 1 });
});

test('vivo: nada con PERSISTENT_LIVE apagado', () => {
  assert.equal(nextToPrepare({ mode: 'live', index: 0, holes: 3 }), null);
  assert.equal(nextToPrepare({ mode: 'live', index: 2, holes: 3, tied: true }), null);
  assert.deepEqual(nextToPrepare({ mode: 'live', index: 0, holes: 3, persistentLive: true }), { kind: 'hole', index: 1 });
});

test('Modo Libre y desempate: nada que preparar', () => {
  assert.equal(nextToPrepare({ mode: 'freeplay', index: 0, holes: 1 }), null);
  assert.equal(nextToPrepare({ mode: 'tiebreak', index: 0, holes: 1, tied: true }), null);
  assert.equal(nextToPrepare({ mode: 'practice', index: 3, holes: 3 }), null);
  assert.equal(nextToPrepare({ mode: 'practice', index: -1, holes: 3 }), null);
  assert.equal(nextToPrepare({}), null);
});

test('canReuseGame: solo con reuse, interruptor, sin URL off, sin vivo y con un juego vivo', () => {
  const game = { disposed: false };
  assert.equal(canReuseGame({ reuse: true, enabled: true, game }), true);
  assert.equal(canReuseGame({ reuse: false, enabled: true, game }), false);
  assert.equal(canReuseGame({ reuse: true, enabled: false, game }), false);
  assert.equal(canReuseGame({ reuse: true, enabled: true, off: true, game }), false);
  assert.equal(canReuseGame({ reuse: true, enabled: true, live: true, game }), false);
  assert.equal(canReuseGame({ reuse: true, enabled: true, live: true, persistentLive: true, game }), true);
  assert.equal(canReuseGame({ reuse: true, enabled: true, prepared: true, game }), false);
  assert.equal(canReuseGame({ reuse: true, enabled: true, game: { disposed: true } }), false);
  assert.equal(canReuseGame({ reuse: true, enabled: true, game: null }), false);
});

// ---------- fuentes ----------

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const game = readFileSync(new URL('../src/game/GolfGame.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const fnBody = (src, head) => {
  const start = src.indexOf(head);
  assert.ok(start >= 0, `falta ${head}`);
  return src.slice(start, src.indexOf('\n}\n', start));
};

test('main.js: paintApp con keepGame no libera el juego (detach, sin dispose)', () => {
  const paint = fnBody(main, 'function paintApp(');
  assert.match(paint, /keepGame/);
  assert.match(paint, /keepPlay\(\)/);
  assert.match(paint, /releasePlay\(\)/); // sin keepGame, como siempre
  const keep = fnBody(main, 'function keepPlay(');
  assert.match(keep, /game\?\.detach\(\)/);
  assert.match(keep, /playScope\?\.dispose\(\)/);
  assert.match(keep, /gameGuard = null/);
  assert.doesNotMatch(keep, /game\??\.dispose|releasePlay|forceContextLoss/);
  // releasePlay sigue liberándolo todo
  const release = fnBody(main, 'function releasePlay(');
  assert.match(release, /game\?\.dispose\(\)/);
});

test('main.js: hoyo siguiente, desempate y Modo Libre (siguiente/repetir) reutilizan; Reiniciar no', () => {
  assert.match(main, /playHole\(match, index \+ 1, \{ reuse: true \}\)/);
  assert.match(fnBody(main, 'function playTiebreak('), /reuse: true/);
  const fp = fnBody(main, 'export function showFreePlayHoleResult(');
  assert.match(fp, /playFreePlay\(courseIndex, \{ reuse: true \}\)/);
  assert.match(fp, /playFreePlay\(nextIndex, \{ reuse: true \}\)/);
  assert.match(main, /onRestartHole: \(\) => playFreePlay\(courseIndex\),/);
  // el vivo no pasa reuse
  assert.doesNotMatch(fnBody(main, 'function playLiveHole('), /reuse/);
});

test('GolfGame: prepareNext no toca tick, bola de física, golpes, bots, bucle ni audio', () => {
  const start = game.indexOf('  async prepareNext(');
  assert.ok(start > 0);
  const body = game.slice(start, game.indexOf('\n  }\n', start));
  for (const bad of [/this\.tick\b/, /this\.ball\s*=/, /this\.shots/, /#buildBots/, /#resetPlayState/, /#startLoop/, /setAnimationLoop/, /sfx\./, /setAmbient/, /new Bot\(/, /\.render\(/]) {
    assert.doesNotMatch(body, bad, `prepareNext no debe usar ${bad}`);
  }
});
