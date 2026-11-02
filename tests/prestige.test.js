import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Progress } from '../src/progress/Progress.js';
import { FRAMES, frameFor, framesUnlocked } from '../src/progress/prestige.js';
import { CHALLENGES, SKINS } from '../src/progress/skins.js';

// XP acumulada para llegar al nivel n (200 por nivel).
const xpAt = (n) => 200 * (n - 1);

test('hay seis marcos, en los niveles 25-50-75-100-125-150', () => {
  assert.deepEqual(FRAMES.map((f) => f.level), [25, 50, 75, 100, 125, 150]);
  assert.equal(new Set(FRAMES.map((f) => f.id)).size, 6);
});

test('sin marco antes del nivel 25 y uno nuevo en cada tramo', () => {
  assert.equal(frameFor(24), null);
  assert.equal(frameFor(25).id, 'p25');
  assert.equal(frameFor(74).id, 'p50');
  assert.equal(framesUnlocked(150).length, 6);
  assert.equal(framesUnlocked(200).length, 6);
});

test('el marco elegido se respeta si está alcanzado y si no, vale el más alto', () => {
  assert.equal(frameFor(80, 'p25').id, 'p25');
  assert.equal(frameFor(80, 'p150').id, 'p75');
  assert.equal(frameFor(80, 'inventado').id, 'p75');
});

test('Progress: nivel y marco salen de la XP y se puede elegir', () => {
  const p = new Progress(null);
  assert.equal(p.prestige.frame, null);
  assert.equal(p.equipFrame('p25'), false);
  p.state.xp = xpAt(60);
  assert.equal(p.level.level, 60);
  assert.deepEqual(p.prestige.unlocked.map((f) => f.id), ['p25', 'p50']);
  assert.equal(p.prestige.frame.id, 'p50');
  const saved = [];
  p.frameSaver = (id) => (saved.push(id), Promise.resolve());
  assert.equal(p.equipFrame('p25'), true);
  assert.equal(p.prestige.frame.id, 'p25');
  assert.deepEqual(saved, ['p25']);
  assert.equal(p.equipFrame('p100'), false, 'un marco sin alcanzar no se guarda');
});

test('el desafío de prestigio desbloquea su bola al llegar al nivel', () => {
  const p = new Progress(null);
  assert.equal(p.challenge('prestige25').done, false);
  assert.equal(p.equip('prestigio_bronce'), false);
  p.state.xp = xpAt(25);
  assert.equal(p.challenge('prestige25').done, true);
  assert.equal(p.equip('prestigio_bronce'), true);
});

test('los hitos de ranking del servidor completan sus desafíos y ofrecen la bola', () => {
  const p = new Progress(null);
  assert.equal(p.challenge('rankWeekTop10').done, false);
  p.setServerStats({ weeklyTop10: 1, weeklyFirst: 0, frame: 'p25' });
  assert.equal(p.challenge('rankWeekTop10').done, true);
  assert.equal(p.challenge('rankWeekFirst').done, false);
  assert.ok(p.claimable.some((s) => s.id === 'rank_semanal'));
  assert.equal(p.state.framePick, 'p25');
});

test('cada desafío nuevo tiene una única bola', () => {
  for (const id of CHALLENGES.map((c) => c.id).filter((i) => /^(prestige|rank)/.test(i))) {
    assert.equal(SKINS.filter((s) => s.unlock?.challenge === id).length, 1, id);
  }
});
