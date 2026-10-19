import { BALL_R, MAX_SHOT_SPEED, isMoving, step } from './physics.js';
import { MAX_STROKES_PER_HOLE } from '../config.js';

// Rivales simulados que juegan el mismo hoyo con la misma física que tú.
// Solo para la demo: en producción cada bola será un jugador real.

const DT = 1 / 120;

function segBlocked(ax, az, bx, bz, segs, course) {
  const cross = (ux, uz, vx, vz) => ux * vz - uz * vx;
  const rx = bx - ax, rz = bz - az;
  for (const [[cx, cz], [dx, dz]] of segs) {
    const sx = dx - cx, sz = dz - cz;
    const den = cross(rx, rz, sx, sz);
    if (Math.abs(den) < 1e-9) continue;
    const t = cross(cx - ax, cz - az, sx, sz) / den;
    const u = cross(cx - ax, cz - az, rx, rz) / den;
    const pad = 0.35 / Math.hypot(sx, sz);
    if (t > 0 && t < 1 && u > -pad && u < 1 + pad) return true;
  }
  for (const b of course.bumpers) {
    const len2 = rx * rx + rz * rz;
    const t = Math.max(0, Math.min(1, ((b.x - ax) * rx + (b.z - az) * rz) / len2));
    if (Math.hypot(ax + rx * t - b.x, az + rz * t - b.z) < b.r + BALL_R + 0.1) return true;
  }
  return false;
}

function chooseTarget(ball, course, segs) {
  const targets = [...(course.waypoints ?? []), course.cup];
  for (let i = targets.length - 1; i >= 0; i--) {
    const [x, z] = targets[i];
    if (i < targets.length - 1 && Math.hypot(x - ball.x, z - ball.z) < 0.8) continue;
    if (!segBlocked(ball.x, ball.z, x, z, segs, course)) return { x, z, isCup: i === targets.length - 1 };
  }
  const [x, z] = targets[0];
  return { x, z, isCup: false };
}

/** Distancia recorrida por un tiro (sin aspas ni bloques, para que sea estable). */
function travel(course, segs, from, dirX, dirZ, power) {
  const sim = { x: from.x, z: from.z, vx: dirX * power * MAX_SHOT_SPEED, vz: dirZ * power * MAX_SHOT_SPEED };
  const c = { ...course, spinners: [], movers: [] };
  let d = 0;
  for (let i = 0; i < 2400 && isMoving(sim); i++) {
    const px = sim.x, pz = sim.z;
    if (step(c, segs, sim, 0, DT).sunk) return Infinity;
    d += Math.hypot(sim.x - px, sim.z - pz);
  }
  return d;
}

function powerFor(course, segs, from, dirX, dirZ, dist) {
  let lo = 0.05, hi = 1;
  for (let i = 0; i < 11; i++) {
    const mid = (lo + hi) / 2;
    if (travel(course, segs, from, dirX, dirZ, mid) < dist) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function gauss(rng) {
  return Math.sqrt(-2 * Math.log(rng() || 1e-9)) * Math.cos(2 * Math.PI * rng());
}

export class Bot {
  constructor(player, course, segs, rng) {
    Object.assign(this, { player, course, segs, rng });
    this.ball = { x: course.tee[0], z: course.tee[1], vx: 0, vz: 0 };
    this.strokes = 0;
    this.done = false;
    this.wait = 0.8 + rng() * 2.2;
  }

  /** Decide y lanza el siguiente tiro. */
  shoot() {
    const { ball, course, segs, rng } = this;
    const target = chooseTarget(ball, course, segs);
    const dx = target.x - ball.x, dz = target.z - ball.z;
    const dist = Math.hypot(dx, dz);
    const miss = 1 - this.player.skill;
    const ang = Math.atan2(dx, -dz) + gauss(rng) * (0.015 + miss * 0.09);
    const dirX = Math.sin(ang), dirZ = -Math.cos(ang);
    const firm = target.isCup && !course.noCup;
    let power = powerFor(course, segs, ball, dirX, dirZ, firm ? dist + 0.4 : dist);
    // al hoyo se le pega con firmeza: la búsqueda da justo el mínimo para llegar
    if (firm) power *= 1.15;
    power = Math.min(1, Math.max(0.05, power * (1 + gauss(rng) * (0.04 + miss * 0.12))));
    ball.vx = dirX * power * MAX_SHOT_SPEED;
    ball.vz = dirZ * power * MAX_SHOT_SPEED;
    this.strokes++;
    return power;
  }

  /**
   * Avanza un paso de física. Devuelve los eventos del paso para el render.
   */
  tick(t, dt) {
    if (this.done) return null;
    if (!isMoving(this.ball)) {
      // desempate: un tiro y donde pare
      if (this.strokes >= (this.course.noCup ? 1 : MAX_STROKES_PER_HOLE)) {
        this.done = true;
        return { finished: true };
      }
      this.wait -= dt;
      if (this.wait <= 0) {
        this.wait = 1 + this.rng() * 1.8;
        return { shot: this.shoot(), ...step(this.course, this.segs, this.ball, t, dt) };
      }
    }
    const r = step(this.course, this.segs, this.ball, t, dt);
    if (r.sunk) {
      this.done = true;
      return { ...r, finished: true };
    }
    return r;
  }

  /** Juega lo que le queda del hoyo sin render (cuando tú ya has terminado). */
  finishInstantly(t0) {
    let t = t0;
    for (let i = 0; i < 120 * 300 && !this.done; i++) {
      this.wait = Math.min(this.wait, 0);
      this.tick(t, DT);
      t += DT;
    }
    if (!this.done) {
      this.strokes = MAX_STROKES_PER_HOLE;
      this.done = true;
    }
    return this.strokes;
  }
}
