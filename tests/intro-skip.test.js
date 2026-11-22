import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { introSkipAction } from '../src/game/introSkip.js';
import { INTRO_SKIP } from '../src/game/loadingFlags.js';

test('INTRO_SKIP activo', () => assert.equal(INTRO_SKIP, true));

test('solo se salta fuera del vivo, con la intro en curso y el interruptor activo', () => {
  assert.equal(introSkipAction({ live: false, intro: 0.3, skipEnabled: true }), 'skip');
  assert.equal(introSkipAction({ live: true, intro: 0.3, skipEnabled: true }), 'none');
  assert.equal(introSkipAction({ live: false, intro: 0.3, skipEnabled: false }), 'none');
  assert.equal(introSkipAction({ live: false, intro: 1, skipEnabled: true }), 'none');
});

test('GolfGame: el salto se evalúa antes del golpe, con live e INTRO_SKIP; la intro en vivo no cambia', () => {
  const src = readFileSync(new URL('../src/game/GolfGame.js', import.meta.url), 'utf8');
  assert.match(src, /introSkipAction\(\{ live: this\.live, intro: this\.intro, skipEnabled: INTRO_SKIP \}\)/);
  const skip = src.indexOf("=== 'skip'");
  const guard = src.indexOf('this.locked || this.intro < 1) return;', skip);
  assert.ok(skip > 0 && guard > skip);
  assert.match(src, /this\.botStartTick = live \? Math\.round\(INTRO_SECONDS \/ DT\) : null/);
  assert.match(src, /const INTRO_SECONDS = 2\.2;/);
});
