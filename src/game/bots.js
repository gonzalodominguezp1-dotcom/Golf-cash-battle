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

/** Distancia recorrida por un tiro (sin aspas, bloques ni molinos, para que sea estable). */
function travel(course, segs, from, dirX, dirZ, power) {
  const sim = { x: from.x, z: from.z, vx: dirX * power * MAX_SHOT_SPEED, vz: dirZ * power * MAX_SHOT_SPEED };
  const c = { ...course, spinners: [], movers: [], windmills: [] };
  let d = 0;
  for (let i = 0; i < 2400 && isMoving(sim); i++) {
    const px = sim.x, pz = sim.z;
    const r = step(c, segs, sim, 0, DT);
    if (r.sunk) return Infinity;
    // el salto de un portal no cuenta como recorrido
    if (r.portal < 0) d += Math.hypot(sim.x - px, sim.z - pz);
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

/** Dónde para un tiro (o null si entra). */
function landing(course, segs, from, dirX, dirZ, power) {
  const sim = { x: from.x, z: from.z, vx: dirX * power * MAX_SHOT_SPEED, vz: dirZ * power * MAX_SHOT_SPEED };
  const c = { ...course, spinners: [], movers: [], windmills: [] };
  for (let i = 0; i < 3600 && isMoving(sim); i++) if (step(c, segs, sim, 0, DT).sunk) return null;
  return sim;
}

const SEARCH_POWERS = Array.from({ length: 32 }, (_, i) => 0.06 + i * 0.03);

/**
 * Con pendientes, montículos o portales la distancia no crece con la potencia, así que se
 * prueban potencias (una por paso de física, para no trabar la imagen) y se
 * elige la que deja la bola más cerca, o la del medio de las que entran.
 */
class PowerSearch {
  constructor(course, segs, from, dirX, dirZ, target) {
    Object.assign(this, { course, segs, from: { ...from }, dirX, dirZ, target, i: 0, scored: [] });
  }

  get done() {
    return this.i >= SEARCH_POWERS.length;
  }

  advance() {
    const p = SEARCH_POWERS[this.i++];
    const end = landing(this.course, this.segs, this.from, this.dirX, this.dirZ, p);
    this.scored.push({ p, d: end ? Math.hypot(end.x - this.target.x, end.z - this.target.z) : 0 });
  }

  best() {
    const sunk = this.scored.filter((s) => s.d === 0);
    if (sunk.length) return sunk[Math.floor(sunk.length / 2)].p;
    return this.scored.reduce((a, b) => (b.d < a.d ? b : a)).p;
  }
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

  /** Decide el siguiente tiro: hacia dónde y, si hace falta, empieza a buscar la potencia. */
  plan() {
    const { ball, course, segs, rng } = this;
    const target = chooseTarget(ball, course, segs);
    const dx = target.x - ball.x, dz = target.z - ball.z;
    const dist = Math.hypot(dx, dz);
    const miss = 1 - this.player.skill;
    const ang = Math.atan2(dx, -dz) + gauss(rng) * (0.015 + miss * 0.09);
    const dirX = Math.sin(ang), dirZ = -Math.cos(ang);
    if (course.slopes || course.mounds || course.portals) return { dirX, dirZ, search: new PowerSearch(course, segs, ball, dirX, dirZ, target) };
    const firm = target.isCup && !course.noCup;
    let power = powerFor(course, segs, ball, dirX, dirZ, firm ? dist + 0.4 : dist);
    // al hoyo se le pega con firmeza: la búsqueda da justo el mínimo para llegar
    if (firm) power *= 1.15;
    return { dirX, dirZ, power };
  }

  /** Lanza el tiro planeado. */
  shoot() {
    const { ball, rng } = this;
    const { dirX, dirZ, search } = this.next;
    let power = search ? search.best() : this.next.power;
    this.next = null;
    const miss = 1 - this.player.skill;
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
      this.next ??= this.plan();
      if (this.next.search && !this.next.search.done) this.next.search.advance();
      this.wait -= dt;
      if (this.wait <= 0 && !(this.next.search && !this.next.search.done)) {
        this.wait = 1 + this.rng() * 1.8;
        return { shot: this.shoot(), ...step(this.course, this.segs, this.ball, t, dt) };
      }
    } else this.next = null; // un aspa o un bloque la ha movido: hay que volver a apuntar
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
