import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PREFETCH_DECISION, shouldIdlePrefetch } from '../src/game/prefetchRules.js';

test('shouldIdlePrefetch: reglas', () => {
  assert.equal(shouldIdlePrefetch({ saveData: true, effectiveType: '4g', decision: 'idle' }), false);
  assert.equal(shouldIdlePrefetch({ saveData: false, effectiveType: '2g', decision: 'idle' }), false);
  assert.equal(shouldIdlePrefetch({ saveData: false, effectiveType: 'slow-2g', decision: 'idle' }), false);
  assert.equal(shouldIdlePrefetch({ saveData: false, effectiveType: '4g', decision: 'idle' }), true);
  assert.equal(shouldIdlePrefetch({ saveData: false, effectiveType: '4g', decision: 'onPlay' }), false);
  assert.equal(shouldIdlePrefetch({ decision: 'idle' }), true);
  assert.equal(PREFETCH_DECISION, 'idle');
});

const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const bodyOf = (name) => {
  const i = src.indexOf(`const ${name} = `);
  assert.ok(i >= 0, `${name} existe`);
  const next = src.indexOf('\nconst ', i + 1);
  return src.slice(i, next);
};

test('loadGolfGame libera el hub; importGolfGame no', () => {
  assert.match(bodyOf('loadGolfGame'), /hubPreloader\.release\(\)/);
  assert.doesNotMatch(bodyOf('importGolfGame'), /hubPreloader\.release/);
});
