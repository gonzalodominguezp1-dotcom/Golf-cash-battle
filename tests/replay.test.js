import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DT, dcos, dsin, isMoving, quantizeShot, segmentsOf, shotVelocity, step } from '../src/game/physics.js';
import { replayHole } from '../src/game/replay.js';
import { COURSES, TIEBREAK_COURSE } from '../src/game/courses.js';

test('seno y coseno deterministas casi iguales a Math', () => {
  for (let x = -1300; x < 1300; x += 0.737) {
    assert.ok(Math.abs(dsin(x) - Math.sin(x)) < 1e-12, `sin ${x}`);
    assert.ok(Math.abs(dcos(x) - Math.cos(x)) < 1e-12, `cos ${x}`);
  }
});

// Juega un hoyo como lo hace GolfGame (paso fijo, golpe entre pasos) con un
// jugador que apunta más o menos al hoyo, y devuelve lo que vio el cliente.
function playLikeClient(course, seed, maxStrokes = 8) {
  let s = seed;
  const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const segs = segmentsOf(course);
  const ball = { x: course.tee[0], z: course.tee[1], vx: 0, vz: 0 };
  const shots = [];
  let tick = 0, wait = 60 + Math.floor(rng() * 200), result = null;
  while (tick < 120 * 120 && !result) {
    if (!isMoving(ball) && --wait <= 0 && shots.length < (course.noCup ? 1 : maxStrokes)) {
      const yaw = Math.atan2(course.cup[0] - ball.x, -(course.cup[1] - ball.z)) + (rng() - 0.5) * 0.6;
      const q = quantizeShot(yaw, 0.2 + rng() * 0.8);
      Object.assign(ball, shotVelocity(q.yaw, q.power));
      shots.push({ tick, ...q });
      wait = 30 + Math.floor(rng() * 300);
    }
    const was = isMoving(ball);
    tick++;
    const r = step(course, segs, ball, tick * DT, DT);
    if (r.sunk) result = { strokes: shots.length, sunk: true };
    else if (was && !isMoving(ball) && (course.noCup || shots.length >= maxStrokes)) {
      result = { strokes: shots.length, sunk: false, distance: Math.sqrt((ball.x - course.cup[0]) * (ball.x - course.cup[0]) + (ball.z - course.cup[1]) * (ball.z - course.cup[1])) };
    }
  }
  return { shots, result };
}

test('el servidor obtiene los mismos golpes que el cliente en todos los hoyos', () => {
  let checked = 0;
  for (const course of [...COURSES, TIEBREAK_COURSE]) {
    for (let seed = 1; seed <= 40; seed++) {
      const { shots, result } = playLikeClient(course, seed * 7919, course.maxStrokes ?? 8);
      if (!result) continue;
      const r = replayHole(course, shots);
      assert.equal(r.ok, true, `${course.name} ${seed}: ${r.reason}`);
      assert.equal(r.strokes, result.strokes);
      assert.equal(r.sunk, result.sunk);
      if (course.noCup) assert.equal(r.distance, result.distance);
      checked++;
    }
  }
  assert.ok(checked > 150);
});

test('no se puede inventar el resultado', () => {
  const course = COURSES[0];
  let seed = 1, game;
  while (!(game = playLikeClient(course, seed)).result?.sunk) seed++;
  const { shots } = game;
  // quitar el último golpe: el hoyo queda sin terminar
  if (shots.length > 1) assert.equal(replayHole(course, shots.slice(0, -1)).reason, 'unfinished');
  // golpear con la bola en movimiento
  const moving = [...shots.slice(0, 1), { ...shots[0], tick: shots[0].tick + 5 }];
  assert.equal(replayHole(course, moving).reason, 'ball_moving');
  // valores sin redondear, potencia fuera de rango o ticks desordenados
  assert.equal(replayHole(course, [{ tick: 10, yaw: 0.00001234, power: 0.5 }]).ok, false);
  assert.equal(replayHole(course, [{ tick: 10, yaw: 0, power: 1.5 }]).ok, false);
  assert.equal(replayHole(course, [{ tick: 10, yaw: 0, power: 0.5 }, { tick: 10, yaw: 0, power: 0.5 }]).reason, 'bad_tick');
  // un solo golpe flojo no termina el hoyo
  assert.equal(replayHole(course, [{ tick: 10, yaw: 0, power: 0.1 }]).reason, 'unfinished');
  // el desempate es de un tiro
  assert.equal(replayHole(TIEBREAK_COURSE, [{ tick: 1, yaw: 0, power: 0.5 }, { tick: 900, yaw: 0, power: 0.5 }]).reason, 'too_many_shots');
});

test('ocho golpes sin embocar cuentan como el máximo', () => {
  const course = COURSES[2];
  const shots = Array.from({ length: 8 }, (_, i) => ({ tick: 10 + i * 1500, yaw: 1.5708, power: 0.1 }));
  const r = replayHole(course, shots);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.strokes, 8);
  assert.equal(r.sunk, false);
});

test('la función del servidor usa la misma física que el juego', async () => {
  const { readFileSync } = await import('node:fs');
  const { SHARED } = await import('../scripts/sync-functions.mjs');
  for (const [f, to] of SHARED) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    const fn = readFileSync(new URL(`../supabase/functions/submit-hole/${to}`, import.meta.url), 'utf8');
    assert.equal(fn, src, `${f} desactualizado: pnpm run sync:functions`);
  }
});
