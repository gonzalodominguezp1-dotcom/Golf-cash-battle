import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DT, isMoving, quantizeShot, segmentsOf, shotVelocity, step } from '../src/game/physics.js';
import { replayHole } from '../src/game/replay.js';
import { COURSES, TIEBREAK_COURSE } from '../src/game/courses.js';

// Un tiro flojo hacia el hoyo y devuelve el paso en el que se para la bola.
function softShot(course, tick = 300) {
  const yaw = Math.atan2(course.cup[0] - course.tee[0], -(course.cup[1] - course.tee[1]));
  const shot = { tick, ...quantizeShot(yaw, 0.15) };
  const segs = segmentsOf(course);
  const ball = { x: course.tee[0], z: course.tee[1], vx: 0, vz: 0 };
  let t = tick;
  Object.assign(ball, shotVelocity(shot.yaw, shot.power));
  while (isMoving(ball)) step(course, segs, ball, ++t * DT, DT);
  return { shot, stopTick: t };
}

test('sin tiempo y sin embocar: descalificado con el máximo', () => {
  const course = COURSES[0];
  const { shot, stopTick } = softShot(course);
  const r = replayHole(course, [shot], { maxStrokes: 8, endTick: stopTick + 600 });
  assert.equal(r.ok, true);
  assert.equal(r.timedOut, true);
  assert.equal(r.sunk, false);
  assert.equal(r.strokes, 8);
});

test('se acaba el tiempo sin haber tirado', () => {
  const r = replayHole(COURSES[0], [], { maxStrokes: 8, endTick: 2400 });
  assert.equal(r.ok, true);
  assert.equal(r.timedOut, true);
  assert.equal(r.strokes, 8);
  // sin contador, un hoyo sin tiros no vale
  assert.equal(replayHole(COURSES[0], []).ok, false);
});

test('no valen tiros después de acabarse el tiempo', () => {
  const { shot } = softShot(COURSES[0], 500);
  assert.equal(replayHole(COURSES[0], [shot], { endTick: 500 }).reason, 'bad_tick');
  assert.equal(replayHole(TIEBREAK_COURSE, [shot], { endTick: 900 }).reason, 'bad_end');
});

test('la bola que entra cuenta el paso en el que entró, y solo si es antes del límite', () => {
  // busca un tiro que emboque en algún hoyo
  for (const course of COURSES) {
    const yaw = Math.atan2(course.cup[0] - course.tee[0], -(course.cup[1] - course.tee[1]));
    for (let p = 0.1; p <= 1; p += 0.01) {
      const shot = { tick: 300, ...quantizeShot(yaw, p) };
      const r = replayHole(course, [shot], { maxStrokes: 8 });
      if (!r.ok || !r.sunk) continue;
      assert.ok(r.sunkTick > 300);
      assert.equal(replayHole(course, [shot], { endTick: r.sunkTick }).sunk, true);
      const late = replayHole(course, [shot], { endTick: r.sunkTick - 1 });
      assert.equal(late.sunk, false);
      assert.equal(late.timedOut, true);
      return;
    }
  }
  assert.fail('ningún hoyo se emboca de un tiro recto');
});
