import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoHome } from '../src/screens/playLifecycle.js';

test('goHome libera final, sala en vivo y partida antes de navegar, en orden', () => {
  const log = [];
  const goHome = createGoHome({
    leaveFinale: () => log.push('finale'),
    stopLive: () => log.push('live'),
    releasePlay: () => log.push('release'),
    go: (to) => log.push(`go:${to}`),
  });
  goHome();
  assert.deepEqual(log, ['finale', 'live', 'release', 'go:home']);
});

test('tras goHome el guard de partida ya no existe: atrás en el hub no hace nada', () => {
  const state = { gameGuard: () => true, game: {}, finale: true, live: {} };
  const backGuard = () => (state.gameGuard ? state.gameGuard() : false);
  const goHome = createGoHome({
    leaveFinale: () => { state.finale = false; },
    stopLive: () => { state.live = null; },
    releasePlay: () => { state.game = null; state.gameGuard = null; },
    go: () => { assert.equal(state.game, null); assert.equal(state.live, null); assert.equal(state.finale, false); },
  });
  assert.equal(backGuard(), true);
  goHome();
  assert.equal(backGuard(), false);
});
