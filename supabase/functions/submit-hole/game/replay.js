import { DT, isMoving, segmentsOf, shotVelocity, step, quantizeShot } from './physics.js';

// Repite un hoyo a partir de los golpes del jugador. El servidor lo usa para
// calcular los golpes de verdad: el cliente solo manda qué tiro hizo y cuándo.
//
// Cada golpe es { tick, yaw, power }: tick es el número de pasos de física
// que llevaba el hoyo cuando se soltó el dedo.

export const MAX_HOLE_TICKS = 120 * 60 * 10; // 10 minutos por hoyo
const SETTLE_TICKS = 120 * 30; // tras el último golpe se espera a que pare la bola

/**
 * Devuelve { ok, reason?, strokes, sunk, distance, waits }. distance es lo que
 * queda hasta el hoyo (o la diana del desempate) cuando la bola se para.
 * waits[i] son los pasos que llevaba la bola parada antes del golpe i (el
 * antibots lo usa para ver si alguien tira sin pararse a apuntar).
 */
export function replayHole(course, shots, { maxStrokes = 8 } = {}) {
  const fail = (reason) => ({ ok: false, reason, strokes: 0, sunk: false, distance: null });
  if (!Array.isArray(shots) || shots.length === 0) return fail('no_shots');
  const limit = course.noCup ? 1 : maxStrokes;
  if (shots.length > limit) return fail('too_many_shots');
  let prev = -1;
  for (const s of shots) {
    if (!s || !Number.isInteger(s.tick) || s.tick <= prev || s.tick > MAX_HOLE_TICKS) return fail('bad_tick');
    if (!Number.isFinite(s.yaw) || !Number.isFinite(s.power) || Math.abs(s.yaw) > 1e4) return fail('bad_shot');
    const q = quantizeShot(s.yaw, s.power);
    if (q.yaw !== s.yaw || q.power !== s.power || s.power < 0.05) return fail('bad_shot');
    prev = s.tick;
  }

  const segs = segmentsOf(course);
  const ball = { x: course.tee[0], z: course.tee[1], vx: 0, vz: 0 };
  const dist = () => Math.sqrt((ball.x - course.cup[0]) * (ball.x - course.cup[0]) + (ball.z - course.cup[1]) * (ball.z - course.cup[1]));
  const end = shots[shots.length - 1].tick + SETTLE_TICKS;
  const waits = [];
  let restSince = 0;
  let next = 0;
  for (let tick = 0; tick <= end; tick++) {
    if (next < shots.length && shots[next].tick === tick) {
      // como en el juego: solo se puede golpear con la bola parada
      if (isMoving(ball)) return fail('ball_moving');
      waits.push(tick - restSince);
      const v = shotVelocity(shots[next].yaw, shots[next].power);
      ball.vx = v.vx;
      ball.vz = v.vz;
      next++;
    }
    const wasMoving = isMoving(ball);
    const r = step(course, segs, ball, (tick + 1) * DT, DT);
    if (r.sunk) {
      if (next < shots.length) return fail('shots_after_sunk');
      return { ok: true, strokes: shots.length, sunk: true, distance: 0, waits };
    }
    if (wasMoving && !isMoving(ball)) restSince = tick + 1;
    if (next === shots.length && wasMoving && !isMoving(ball)) {
      // la bola se ha parado tras el último golpe
      if (course.noCup) return { ok: true, strokes: 1, sunk: false, distance: dist(), waits };
      if (shots.length >= maxStrokes) return { ok: true, strokes: maxStrokes, sunk: false, distance: dist(), waits };
    }
  }
  if (next < shots.length) return fail('bad_tick');
  // el hoyo no está terminado: faltan golpes
  return fail('unfinished');
}
