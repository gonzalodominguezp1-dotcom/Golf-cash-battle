// Reproduce el bucle de GolfGame (#frame): durante la pausa tick++ pero no se llama a step().
import { COURSES } from '../../src/game/courses.js';
import { DT, isMoving, segmentsOf, shotVelocity, step, quantizeShot } from '../../src/game/physics.js';
import { replayHole } from '../../src/game/replay.js';
const course = COURSES[0];
const segs = segmentsOf(course);
function client(pauseFrom, pauseTo) {
  const ball = { x: course.tee[0], z: course.tee[1], vx: 0, vz: 0 };
  const shot = { tick: 1, ...quantizeShot(0.05, 0.55) };
  for (let tick = 1; tick < 120 * 60; tick++) {
    if (tick === shot.tick) { const v = shotVelocity(shot.yaw, shot.power); ball.vx = v.vx; ball.vz = v.vz; }
    const paused = tick >= pauseFrom && tick < pauseTo;
    if (paused) continue; // como GolfGame: tick avanza, la física no
    const was = isMoving(ball);
    const r = step(course, segs, ball, tick * DT, DT);
    if (r.sunk) return { sunk: true, tick };
    if (was && !isMoving(ball)) return { x: ball.x.toFixed(4), z: ball.z.toFixed(4), restTick: tick, shot };
  }
}
const noPause = client(-1, -1);
const withPause = client(40, 400);
console.log('cliente sin pausa :', JSON.stringify(noPause));
console.log('cliente con pausa :', JSON.stringify(withPause));
