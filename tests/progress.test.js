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

test('ganar un desempate en práctica desbloquea el desafío y la skin Sangre fría', () => {
  const p = new Progress(null);
  assert.equal(p.challenge('tiebreak').done, false);
  const r = p.recordMatch({ position: 1, won: true, entryFee: 0, holes: [{ strokes: 2, par: 3 }], tiebreakWon: true });
  assert.equal(p.state.tiebreakWins, 1);
  assert.equal(p.challenge('tiebreak').done, true);
  assert.ok(r.newSkins.some((s) => s.id === 'ice'));
  assert.equal(p.equip('ice'), true);
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

test('el progreso de la cuenta gana si lleva más XP o el móvil era de otra cuenta', async () => {
  const { Progress } = await import('../src/progress/Progress.js');
  const mem = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  };
  const saved = [];
  const p = new Progress(mem());
  p.recordMatch({ position: 1, won: true, entryFee: 1, holes: [{ strokes: 2, par: 3 }] });
  const localXp = p.state.xp;
  p.attach('u1', { xp: 10, wins: 0 }, async (s) => saved.push({ ...s }));
  assert.equal(p.state.xp, localXp);
  assert.equal(saved.at(-1).xp, localXp);
  p.attach('u1', { xp: localXp + 500, wins: 9, equipped: 'classic' }, async () => {});
  assert.equal(p.state.wins, 9);
  p.attach('u2', { xp: 0 }, async () => {});
  assert.equal(p.state.xp, 0);
  assert.equal(p.state.owner, 'u2');
});
