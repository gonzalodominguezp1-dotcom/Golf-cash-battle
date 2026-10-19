import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quantizeShot } from '../src/game/physics.js';
import { replayHole } from '../src/game/replay.js';
import { COURSES, TIEBREAK_COURSE } from '../src/game/courses.js';
import { replayHole as serverReplay } from '../supabase/functions/submit-hole/game/replay.js';
import { COURSES as SERVER_COURSES, TIEBREAK_COURSE as SERVER_TIEBREAK } from '../supabase/functions/submit-hole/game/courses.js';

const ALL = [...COURSES, TIEBREAK_COURSE];
const SERVER_ALL = [...SERVER_COURSES, SERVER_TIEBREAK];

// golpes al azar (ya redondeados) bien separados para que la bola se pare
function randomShots(seed, n) {
  let s = seed;
  const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let tick = 0;
  return Array.from({ length: n }, () => {
    tick += 1 + Math.floor(rng() * 2400);
    return { tick, ...quantizeShot((rng() - 0.5) * 7, 0.05 + rng() * 0.95) };
  });
}

test('repetir los mismos golpes da siempre el mismo resultado', () => {
  for (const course of ALL) {
    for (let seed = 1; seed <= 15; seed++) {
      const shots = randomShots(seed * 104729, course.noCup ? 1 : 1 + (seed % 8));
      const a = replayHole(course, shots);
      const b = replayHole(course, structuredClone(shots));
      assert.deepEqual(b, a, `${course.name} ${seed}`);
    }
  }
});

test('el juego y la función del servidor calculan lo mismo', () => {
  assert.equal(SERVER_ALL.length, ALL.length);
  for (let i = 0; i < ALL.length; i++) {
    for (let seed = 1; seed <= 10; seed++) {
      const shots = randomShots(seed * 7727 + i, ALL[i].noCup ? 1 : 1 + (seed % 8));
      assert.deepEqual(serverReplay(SERVER_ALL[i], shots), replayHole(ALL[i], shots), `${ALL[i].name} ${seed}`);
    }
  }
});

test('un hoyo no guarda estado entre partidas', () => {
  // los obstáculos móviles dependen del tiempo, no de partidas anteriores
  const course = COURSES.find((c) => c.spinners?.length || c.movers?.length) ?? COURSES[0];
  const shots = randomShots(99991, 4);
  const first = replayHole(course, shots);
  for (const other of ALL) replayHole(other, randomShots(31337, other.noCup ? 1 : 3));
  assert.deepEqual(replayHole(course, shots), first);
});

const inside = ([x, z], poly) => {
  let ok = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ok = !ok;
  }
  return ok;
};

test('los hoyos están bien definidos', () => {
  const names = new Set();
  for (const c of ALL) {
    assert.ok(!names.has(c.name), `nombre repetido: ${c.name}`);
    names.add(c.name);
    assert.ok(Number.isInteger(c.par) && c.par >= 1 && c.par <= 8, `${c.name}: par`);
    assert.ok(inside(c.tee, c.outline), `${c.name}: salida fuera del campo`);
    assert.ok(inside(c.cup, c.outline), `${c.name}: hoyo fuera del campo`);
  }
});
