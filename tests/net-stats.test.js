import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNetStats, netStatsLevel } from '../src/ui/netStats.js';
import { HOLE_TIME_LIMIT } from '../src/config.js';

test('HUD: texto de FPS y latencia', () => {
  assert.equal(formatNetStats(59.6, 44.2), '60 FPS · 44 ms');
  assert.equal(formatNetStats(60, null), '60 FPS · — ms');
  assert.equal(formatNetStats(null, null), '— FPS · — ms');
});

test('HUD: color según FPS y latencia (manda el peor)', () => {
  assert.equal(netStatsLevel(60, 40), 'ok');
  assert.equal(netStatsLevel(60, null), 'ok');
  assert.equal(netStatsLevel(45, 40), 'meh');
  assert.equal(netStatsLevel(60, 180), 'meh');
  assert.equal(netStatsLevel(25, 40), 'bad');
  assert.equal(netStatsLevel(60, 400), 'bad');
});

test('contador del hoyo: 30 s', () => {
  assert.equal(HOLE_TIME_LIMIT, 30);
});
