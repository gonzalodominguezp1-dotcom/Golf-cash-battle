import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessRisk, holeSignals } from '../src/antibot/risk.js';
import { replayHole } from '../src/game/replay.js';
import { COURSES } from '../src/game/courses.js';

let s = 12345;
const rng = () => (s = (s * 16807) % 2147483647) / 2147483647;
const pars = COURSES.map((c) => c.par);

// un humano: tarda entre 1 y 6 s en tirar, arrastra el dedo un rato y hace
// más o menos el par
function human(n) {
  return Array.from({ length: n }, (_, i) => {
    const course = i % 5;
    const strokes = Math.max(1, pars[course] + Math.round((rng() - 0.4) * 3));
    return {
      course,
      par: pars[course],
      strokes,
      waits: Array.from({ length: strokes }, () => 120 + Math.floor(rng() * 600)),
      drags: Array.from({ length: strokes }, () => 40 + Math.floor(rng() * 200)),
    };
  });
}

// un bot: tira al instante, sin gesto, y emboca casi siempre de un golpe
function bot(n) {
  return Array.from({ length: n }, (_, i) => ({
    course: i % 5,
    par: pars[i % 5],
    strokes: 1,
    waits: [130],
    drags: [null],
  }));
}

test('un jugador normal no queda marcado', () => {
  for (let k = 0; k < 20; k++) {
    const r = assessRisk(human(30));
    assert.deepEqual(r.flags, [], JSON.stringify(r.stats));
  }
});

test('un bot que emboca siempre queda marcado', () => {
  const r = assessRisk(bot(12));
  assert.ok(r.flags.includes('too_accurate'));
  assert.ok(r.flags.includes('too_many_aces'));
  assert.ok(r.flags.includes('no_gesture'));
});

test('un bot que imita el par pero tira al instante y siempre igual', () => {
  const holes = human(20).map((h) => ({ ...h, waits: h.waits.map(() => 10), drags: h.drags.map(() => 30) }));
  const r = assessRisk(holes);
  assert.ok(r.flags.includes('instant_shots'));
  assert.ok(r.flags.includes('robotic_timing'));
  assert.ok(r.flags.includes('robotic_gesture'));
});

test('con pocos hoyos no se juzga a nadie', () => {
  assert.deepEqual(assessRisk(bot(3)).flags, []);
});

test('la media de todos los jugadores pesa más que el par', () => {
  // en un hoyo donde todos hacen 1, hacer 1 no es raro
  const holes = bot(12).map((h) => ({ ...h, drags: [80], waits: [200, 300] }));
  const baseline = Object.fromEntries(pars.map((_, i) => [i, { avg: 1.1, n: 500 }]));
  assert.ok(!assessRisk(holes, baseline).flags.includes('too_accurate'));
});

test('el servidor mide cuánto espera cada tiro con la bola parada', () => {
  const shots = Array.from({ length: 8 }, (_, i) => ({ tick: 10 + i * 1500, yaw: 1.5708, power: 0.1 }));
  const r = replayHole(COURSES[2], shots);
  assert.equal(r.ok, true);
  assert.equal(r.waits.length, 8);
  assert.equal(r.waits[0], 10);
  for (const w of r.waits.slice(1)) assert.ok(w > 0 && w < 1500, String(w));
  const sig = holeSignals(r, [{ d: 50, t: 2 }, { d: -3 }, 'x']);
  assert.deepEqual(sig.drags.slice(0, 3), [50, null, null]);
  assert.equal(sig.turns[0], 2);
  assert.equal(sig.drags.length, 8);
});
