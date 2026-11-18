import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Progress, xpToReach } from '../src/progress/Progress.js';
import { FRAMES, frameFor, framesUnlocked } from '../src/progress/prestige.js';
import { CHALLENGES, SKINS } from '../src/progress/skins.js';

const xpAt = xpToReach;

test('hay 18 marcos: 10 por nivel y 8 por reto, y ya no quedan los antiguos', () => {
  assert.equal(FRAMES.length, 18);
  assert.equal(FRAMES.filter((f) => f.level != null).length, 10);
  assert.equal(FRAMES.filter((f) => f.challenge).length, 8);
  assert.equal(new Set(FRAMES.map((f) => f.id)).size, 18);
  assert.ok(FRAMES.every((f) => /^f_/.test(f.id) && f.art), 'solo ilustrados');
});

test('sin marco por debajo del primer nivel y uno nuevo en cada tramo', () => {
  assert.equal(frameFor(4), null);
  assert.equal(frameFor(5).id, 'f_rustic');
  assert.equal(frameFor(39).id, 'f_cyber');
  assert.equal(frameFor(74).id, 'f_frost');
  assert.equal(framesUnlocked(150).length, 10, 'sin retos hechos solo los de nivel');
  assert.equal(framesUnlocked(1000).length, 10);
  assert.equal(framesUnlocked(1000, () => true).length, 18);
});

test('el marco elegido se respeta si está conseguido y si no, vale el de nivel más alto', () => {
  assert.equal(frameFor(80, 'f_rustic').id, 'f_rustic');
  assert.equal(frameFor(80, 'f_emperor').id, 'f_frost');
  assert.equal(frameFor(80, 'inventado').id, 'f_frost');
  assert.equal(frameFor(80, 'f_oni').id, 'f_frost', 'un marco de reto sin hacer no vale');
  assert.equal(frameFor(80, 'f_oni', (id) => id === 'streak5').id, 'f_oni');
  assert.equal(frameFor(80, 'p75').id, 'f_frost', 'los marcos antiguos ya no existen');
});

test('Progress: nivel y marco salen de la XP y se puede elegir', () => {
  const p = new Progress(null);
  assert.equal(p.prestige.frame, null);
  assert.equal(p.equipFrame('f_rustic'), false);
  p.state.xp = xpAt(60);
  assert.equal(p.level.level, 60);
  assert.deepEqual(p.prestige.unlocked.map((f) => f.id), ['f_rustic', 'f_scifi', 'f_cyber', 'f_sakura', 'f_toxic']);
  assert.equal(p.prestige.frame.id, 'f_toxic');
  const saved = [];
  p.frameSaver = (id) => (saved.push(id), Promise.resolve());
  assert.equal(p.equipFrame('f_scifi'), true);
  assert.equal(p.prestige.frame.id, 'f_scifi');
  assert.deepEqual(saved, ['f_scifi']);
  assert.equal(p.equipFrame('f_frost'), false, 'un marco sin alcanzar no se guarda');
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

test('equipar un marco que el servidor rechaza vuelve al anterior y avisa', async () => {
  const p = new Progress(null);
  p.state.xp = xpAt(60);
  p.frameSaver = () => Promise.resolve();
  p.equipFrame('f_scifi');
  const errors = [];
  p.onFrameSaveError = (e) => errors.push(e.message);
  p.frameSaver = () => Promise.reject(new Error('bad_request'));
  assert.equal(p.equipFrame('f_rustic'), true, 'se aplica al momento');
  assert.equal(p.prestige.frame.id, 'f_rustic');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(p.prestige.frame.id, 'f_scifi', 'vuelve al que estaba');
  assert.deepEqual(errors, ['bad_request']);
});
