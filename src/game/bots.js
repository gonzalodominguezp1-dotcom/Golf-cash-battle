import { BALL_R, LOOP_CAPTURE, LOOP_LANE, LOOP_PAD, MAX_SHOT_SPEED, WALL_HALF, insidePoly, isMoving, loopWalls, step } from './physics.js';
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
  if (lavaBlocks(ax, az, bx, bz, course) || loopBlocks(ax, az, bx, bz, course)) return true;
  for (const b of course.bumpers) {
    const len2 = rx * rx + rz * rz;
    const t = Math.max(0, Math.min(1, ((b.x - ax) * rx + (b.z - az) * rz) / len2));
    if (Math.hypot(ax + rx * t - b.x, az + rz * t - b.z) < b.r + BALL_R + 0.1) return true;
  }
  return false;
}

/**
 * ¿La línea de a a b atraviesa un looping sin entrar por su carril? Solo se
 * puede cruzar entrando hacia delante por la boca, centrada en el carril de
 * entrada (el carril obliga a salir en la dirección del looping).
 */
function loopBlocks(ax, az, bx, bz, course) {
  for (const l of course.loops ?? []) {
    const [dx, dz] = l.dir, sx = -dz, sz = dx;
    const aA = (ax - l.x) * dx + (az - l.z) * dz, bA = (ax - l.x) * sx + (az - l.z) * sz;
    const aB = (bx - l.x) * dx + (bz - l.z) * dz, bB = (bx - l.x) * sx + (bz - l.z) * sz;
    // ¿toca la caja del looping (a lo largo ±LOOP_PAD, a lo ancho ±w/2)?
    let t0 = 0, t1 = 1;
    for (const [p, d, h] of [[aA, aB - aA, LOOP_PAD], [bA, bB - bA, l.w / 2]]) {
      if (Math.abs(d) < 1e-9) {
        if (Math.abs(p) > h) t0 = 2;
        continue;
      }
      const u = (-h - p) / d, v = (h - p) / d;
      t0 = Math.max(t0, Math.min(u, v));
      t1 = Math.min(t1, Math.max(u, v));
    }
    if (t0 > t1) continue;
    const da = aB - aA;
    if (aA > -LOOP_PAD || da <= 0) return true;
    const mouth = bA + ((bB - bA) * (-LOOP_PAD - aA)) / da;
    if (Math.abs(mouth - LOOP_LANE) > LOOP_CAPTURE * 0.6) return true;
  }
  return false;
}

// tras el labio de una rampa la bola vuela este trecho: la lava que se cruce ahí no cuenta
const JUMP_REACH = 3.2;

/**
 * ¿La línea de a a b pasa por lava o por un agujero? No cuenta la que cruza justo después de
 * subir por una rampa (la salta), ni la de la lava en la que ya está a.
 */
function lavaBlocks(ax, az, bx, bz, course) {
  if (!course.lava && !course.pits) return false;
  const rx = bx - ax, rz = bz - az, len = Math.hypot(rx, rz);
  if (len < 1e-6) return false;
  // dónde pasa la línea por el labio de cada rampa (en metros desde a)
  const lips = [];
  for (const r of course.ramps ?? []) {
    const u = (rx * r.dir[0] + rz * r.dir[1]) / len;
    if (u <= 0.5) continue; // de lado o hacia atrás no se salta
    const half = (r.dir[0] !== 0 ? r.w : r.d) / 2, across = (r.dir[0] !== 0 ? r.d : r.w) / 2 - WALL_PAD;
    const lipX = r.x + r.dir[0] * half, lipZ = r.z + r.dir[1] * half;
    const s = ((lipX - ax) * r.dir[0] + (lipZ - az) * r.dir[1]) / u;
    if (s < 0 || s > len) continue;
    const lat = (ax + (rx / len) * s - r.x) * r.dir[1] - (az + (rz / len) * s - r.z) * r.dir[0];
    if (Math.abs(lat) < across) lips.push(s);
  }
  const cross = (ux, uz, vx, vz) => ux * vz - uz * vx;
  // los agujeros cortan el paso igual que la lava
  for (const { poly } of [...(course.lava ?? []), ...(course.pits ?? [])]) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [cx, cz] = poly[j], [dx, dz] = poly[i];
      const sx = dx - cx, sz = dz - cz;
      const den = cross(rx, rz, sx, sz);
      if (Math.abs(den) < 1e-9) continue;
      const t = cross(cx - ax, cz - az, sx, sz) / den;
      const u = cross(cx - ax, cz - az, rx, rz) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const s = t * len;
      if (!lips.some((l) => s >= l && s - l < JUMP_REACH)) return true;
    }
    if (insidePoly(poly, bx, bz)) return true;
  }
  return false;
}
const WALL_PAD = WALL_HALF + BALL_R;

// las paredes del looping no cuentan para ver el objetivo: loopBlocks ya decide
const losCache = new WeakMap();
function losSegs(course, segs) {
  if (!course.loops) return segs;
  let c = losCache.get(segs);
  if (!c) {
    const skip = new Set(course.loops.flatMap(loopWalls).map((w) => JSON.stringify(w)));
    c = segs.filter((w) => !skip.has(JSON.stringify(w)));
    losCache.set(segs, c);
  }
  return c;
}

/**
 * El objetivo más lejano a la vista, sin volver a puntos de paso anteriores a
 * from (el último al que ya apuntó).
 */
function chooseTarget(ball, course, allSegs, from = 0) {
  const segs = losSegs(course, allSegs);
  const targets = [...(course.waypoints ?? []), course.cup];
  for (let i = targets.length - 1; i >= from; i--) {
    const [x, z] = targets[i];
    if (i < targets.length - 1 && Math.hypot(x - ball.x, z - ball.z) < 0.8) continue;
    if (!segBlocked(ball.x, ball.z, x, z, segs, course)) return { x, z, isCup: i === targets.length - 1, index: i };
  }
  // delante de un looping: por el centro de su boca, hasta pasada la salida
  for (const l of course.loops ?? []) {
    const [dx, dz] = l.dir, sx = -dz, sz = dx;
    const a = (ball.x - l.x) * dx + (ball.z - l.z) * dz, b = (ball.x - l.x) * sx + (ball.z - l.z) * sz;
    if (a > -LOOP_PAD - 0.05 || a < -LOOP_PAD - 4 || Math.abs(b) > l.w / 2 + 0.5) continue;
    const k = (LOOP_PAD + 1 - a) / (-LOOP_PAD - a);
    const ta = a + (-LOOP_PAD - a) * k, tb = b + (LOOP_LANE - b) * k;
    const x = l.x + dx * ta + sx * tb, z = l.z + dz * ta + sz * tb;
    if (!segBlocked(ball.x, ball.z, x, z, segs, course)) return { x, z, isCup: false };
  }
  // nada a la vista: al punto de paso pendiente más cercano que no sea el de al lado
  let best = targets[Math.min(from, targets.length - 1)], bestD = Infinity;
  for (const [x, z] of targets.slice(from, -1)) {
    const d = Math.hypot(x - ball.x, z - ball.z);
    if (d >= 0.8 && d < bestD) [best, bestD] = [[x, z], d];
  }
  return { x: best[0], z: best[1], isCup: false };
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

/** Dónde para un tiro (o null si entra en el hoyo o, si se apunta a uno, en ese portal). */
function landing(course, segs, from, dirX, dirZ, power, portal = -1) {
  const sim = { x: from.x, z: from.z, vx: dirX * power * MAX_SHOT_SPEED, vz: dirZ * power * MAX_SHOT_SPEED };
  const c = { ...course, spinners: [], movers: [], windmills: [] };
  for (let i = 0; i < 3600 && isMoving(sim); i++) {
    const r = step(c, segs, sim, 0, DT);
    if (r.sunk || (portal >= 0 && r.portal === portal)) return null;
  }
  return sim;
}

const SEARCH_POWERS = Array.from({ length: 32 }, (_, i) => 0.06 + i * 0.03);

/**
 * Con pendientes, montículos, loopings, portales, rampas o lava la distancia no crece con la potencia, así que se
 * prueban potencias (una por paso de física, para no trabar la imagen) y se
 * elige la que deja la bola más cerca, o la del medio de las que entran.
 */
class PowerSearch {
  constructor(course, segs, from, dirX, dirZ, target) {
    Object.assign(this, { course, segs, from: { ...from }, dirX, dirZ, target, i: 0, scored: [] });
    // si el objetivo es la boca de un portal, meterse en él es acertar
    this.portal = (course.portals ?? []).findIndex((p) => p.a[0] === target.x && p.a[1] === target.z);
  }

  get done() {
    return this.i >= SEARCH_POWERS.length;
  }

  advance() {
    const p = SEARCH_POWERS[this.i++];
    const end = landing(this.course, this.segs, this.from, this.dirX, this.dirZ, p, this.portal);
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
    this.progress = 0;
    this.done = false;
    this.wait = 0.8 + rng() * 2.2;
  }

  /** Decide el siguiente tiro: hacia dónde y, si hace falta, empieza a buscar la potencia. */
  plan() {
    const { ball, course, segs, rng } = this;
    const target = chooseTarget(ball, course, segs, this.progress);
    if (target.index !== undefined) this.progress = target.index;
    const dx = target.x - ball.x, dz = target.z - ball.z;
    const dist = Math.hypot(dx, dz);
    const miss = 1 - this.player.skill;
    const ang = Math.atan2(dx, -dz) + gauss(rng) * (0.015 + miss * 0.09);
    const dirX = Math.sin(ang), dirZ = -Math.cos(ang);
    if (course.slopes || course.mounds || course.loops || course.portals || course.lava || course.pits || course.ramps) return { dirX, dirZ, search: new PowerSearch(course, segs, ball, dirX, dirZ, target) };
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
