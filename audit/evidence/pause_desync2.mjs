import { COURSES } from '../../src/game/courses.js';
import { DT, isMoving, segmentsOf, shotVelocity, step, quantizeShot } from '../../src/game/physics.js';
function run(course, segs, shot, pauseFrom, pauseTo) {
  const ball = { x: course.tee[0], z: course.tee[1], vx: 0, vz: 0 };
  for (let tick = 1; tick < 120 * 40; tick++) {
    if (tick === shot.tick) { const v = shotVelocity(shot.yaw, shot.power); ball.vx = v.vx; ball.vz = v.vz; }
    if (tick >= pauseFrom && tick < pauseTo) continue;
    const was = isMoving(ball);
    const r = step(course, segs, ball, tick * DT, DT);
    if (r.sunk) return 'SUNK';
    if (tick > shot.tick && was && !isMoving(ball)) return `${ball.x.toFixed(3)},${ball.z.toFixed(3)}`;
  }
  return 'TIMEOUT';
}
let total = 0, diff = 0; const examples = [];
COURSES.forEach((c, i) => {
  if (!(c.windmills?.length || c.spinners?.length || c.movers?.length)) return;
  const segs = segmentsOf(c);
  for (let k = 0; k < 40; k++) {
    const shot = { tick: 1, ...quantizeShot(-0.6 + k * 0.03, 0.35 + (k % 7) * 0.09) };
    const a = run(c, segs, shot, -1, -1), b = run(c, segs, shot, 30, 97);
    total++; if (a !== b) { diff++; if (examples.length < 6) examples.push(`${i} ${c.name}: servidor=${a} cliente(pausa 30-97)=${b}`); }
  }
});
console.log(`tiros con obstáculos móviles: ${total}, resultados distintos tras pausar: ${diff}`); examples.forEach((e) => console.log(' ', e));
