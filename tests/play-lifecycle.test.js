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

