import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Progress, levelOf } from '../src/progress/Progress.js';
import { TIEBREAK_COURSE } from '../src/game/courses.js';
import { segmentsOf, step, isMoving } from '../src/game/physics.js';
import { Bot } from '../src/game/bots.js';

test('niveles por XP', () => {
  assert.equal(levelOf(0).level, 1);
  assert.equal(levelOf(100).level, 2);
  assert.equal(levelOf(259).level, 2);
  assert.equal(levelOf(260).level, 3);
});

test('ganar desbloquea skins y no se puede equipar una bloqueada', () => {
  const p = new Progress(null);
  assert.equal(p.equip('gold'), false);
  const r = p.recordMatch({ position: 1, won: true, entryFee: 10, holes: [{ strokes: 1, par: 3 }, { strokes: 2, par: 3 }], tiebreakWon: true });
  const ids = r.newSkins.map((s) => s.id);
  for (const id of ['champ', 'star', 'ice', 'highroller', 'mint']) assert.ok(ids.includes(id), id);
  assert.equal(p.equip('champ'), true);
  assert.equal(p.skin.id, 'champ');
});

test('hoyo de desempate: la bola nunca entra y el bot tira una sola vez', () => {
  const segs = segmentsOf(TIEBREAK_COURSE);
  const ball = { x: 0, z: -6, vx: 0, vz: -0.5 };
  assert.equal(step(TIEBREAK_COURSE, segs, ball, 0, 1 / 120).sunk, false);
  const bot = new Bot({ id: 'b', skill: 0.9 }, TIEBREAK_COURSE, segs, Math.random);
  bot.finishInstantly(0);
  assert.equal(bot.strokes, 1);
  assert.ok(!isMoving(bot.ball));
  assert.ok(Math.hypot(bot.ball.x, bot.ball.z + 6) < 3);
});
