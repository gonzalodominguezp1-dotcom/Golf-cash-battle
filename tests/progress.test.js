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

test('nuevas skins de desafío desbloquean con sus hitos específicos', () => {
  const p = new Progress(null);
  assert.equal(p.equip('zephyr_nacre'), false);
  assert.equal(p.equip('supernova_solar'), false);
  assert.equal(p.equip('crimson_dragon'), false);
  assert.equal(p.equip('kintsugi_neon'), false);
  assert.equal(p.equip('damascus_imperial'), false);

  // 10 birdies para zephyr_nacre
  for (let i = 0; i < 5; i++) {
    p.recordMatch({ position: 2, won: false, entryFee: 1, holes: [{ strokes: 2, par: 3 }, { strokes: 2, par: 3 }] });
  }
  assert.equal(p.state.birdies, 10);
  assert.equal(p.challenge('birdies10').done, true);
  assert.equal(p.equip('zephyr_nacre'), true);
  assert.equal(p.skin.id, 'zephyr_nacre');

  // 5 victorias seguidas para supernova_solar
  for (let i = 0; i < 5; i++) {
    p.recordMatch({ position: 1, won: true, entryFee: 1, holes: [{ strokes: 3, par: 3 }] });
  }
  assert.equal(p.state.bestStreak, 5);
  assert.equal(p.challenge('streak5').done, true);
  assert.equal(p.equip('supernova_solar'), true);

  // 3 big wins para crimson_dragon
  for (let i = 0; i < 3; i++) {
    p.recordMatch({ position: 1, won: true, entryFee: 10, holes: [{ strokes: 3, par: 3 }] });
  }
  assert.equal(p.state.bigWins, 3);
  assert.equal(p.challenge('bigwins3').done, true);
  assert.equal(p.equip('crimson_dragon'), true);

  // 3 aces para kintsugi_neon (cada ace también es birdie ya que 1 < 3)
  for (let i = 0; i < 3; i++) {
    p.recordMatch({ position: 1, won: true, entryFee: 1, holes: [{ strokes: 1, par: 3 }] });
  }
  assert.equal(p.state.aces, 3);
  assert.equal(p.challenge('aces3').done, true);
  assert.equal(p.equip('kintsugi_neon'), true);

  // 15 birdies en total para damascus_imperial (10 iniciales + 3 aces + 2 birdies más = 15)
  for (let i = 0; i < 2; i++) {
    p.recordMatch({ position: 2, won: false, entryFee: 1, holes: [{ strokes: 2, par: 3 }] });
  }
  assert.equal(p.state.birdies, 15);
  assert.equal(p.challenge('birdies15').done, true);
  assert.equal(p.equip('damascus_imperial'), true);
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

test('las míticas se desbloquean con wins50 y aces5', () => {
  const p = new Progress(null);
  assert.equal(p.equip('event_horizon'), false);
  assert.equal(p.equip('midas_touch'), false);
  p.state.wins = 50;
  p.state.aces = 5;
  assert.equal(p.equip('event_horizon'), true);
  assert.equal(p.equip('midas_touch'), true);
});

test('una skin guardada que ya no existe se sustituye por la de serie', () => {
  const store = new Map([['gcb.progress.v1', JSON.stringify({ xp: 0, equipped: 'skin_que_no_existe' })]]);
  const p = new Progress({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
  assert.equal(p.skin.id, 'classic');
  assert.equal(p.equip('skin_que_no_existe'), false);
});

test('las skins nuevas se desbloquean con su desafío o nivel y no antes', () => {
  const p = new Progress(null);
  for (const id of ['antimatter_void', 'tormenta_voltaica', 'anima_errante', 'cronometro_laton', 'abyssal_tide']) assert.equal(p.equip(id), false, id);
  Object.assign(p.state, { bigWins: 5, matches: 150, birdies: 50, xp: 100000 });
  for (const id of ['antimatter_void', 'tormenta_voltaica', 'anima_errante', 'cronometro_laton', 'abyssal_tide']) assert.equal(p.equip(id), true, id);
  assert.equal(p.skin.id, 'abyssal_tide');
});
