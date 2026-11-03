import { DT, isMoving, shotVelocity, step } from './physics.js';
import { maxStrokesOf } from '../config.js';

// Bola de otro jugador real en una partida en vivo. No llegan posiciones: llegan
// sus tiros ({ tick, yaw, power }, lo mismo que se manda al servidor) y, como la
// física es determinista, este móvil repite cada tiro y ve exactamente la misma
// trayectoria. Tiene la misma forma que un Bot para que GolfGame la pinte igual.

const MAX_CATCH_UP = 120 * 60 * 10;

/** Lo que ha llegado de un jugador en un hoyo: sus tiros y, al acabar, su resultado. */
export function newFeed() {
  return { shots: [], final: null };
}

/** Tiros válidos para repetir: enteros crecientes y números finitos (llegan de la red). */
export function cleanShots(list) {
  if (!Array.isArray(list) || list.length > 12) return null;
  let prev = -1;
  const out = [];
  for (const s of list) {
    if (!s || !Number.isInteger(s.tick) || s.tick <= prev || s.tick > MAX_CATCH_UP) return null;
    if (!Number.isFinite(s.yaw) || !Number.isFinite(s.power)) return null;
    out.push({ tick: s.tick, yaw: s.yaw, power: s.power });
    prev = s.tick;
  }
  return out;
}

/** Mete en el feed una lista de tiros más nueva (llega entera cada vez: si se pierde un mensaje no pasa nada). */
export function mergeShots(feed, list) {
  const shots = cleanShots(list);
  if (!shots || shots.length < feed.shots.length) return false;
  feed.shots = shots;
  return true;
}

export class RemoteBall {
  constructor(player, course, segs, feed) {
    Object.assign(this, { player, course, segs, feed });
    this.remote = true;
    this.reset();
  }

  reset() {
    this.ball = { x: this.course.tee[0], z: this.course.tee[1], vx: 0, vz: 0 };
    this.rt = 0; // pasos de física simulados (en el reloj del otro jugador)
    this.applied = 0;
    this.seen = [];
    this.strokes = 0;
    this.done = false;
    this.sunk = false;
    this.dq = false;
  }

  #step() {
    const r = step(this.course, this.segs, this.ball, (this.rt + 1) * DT, DT);
    this.rt++;
    if (r.sunk) {
      this.done = true;
      this.sunk = true;
      return { ...r, finished: true, sunkTick: this.rt };
    }
    return r;
  }

  #finalize() {
    const f = this.feed.final;
    this.done = true;
    this.dq = !!f.dq;
    this.strokes = Number.isInteger(f.strokes) ? f.strokes : maxStrokesOf(this.course);
    if (f.sunk && !this.dq) {
      this.sunk = true;
      return { finished: true, sunk: true, sunkTick: Number.isInteger(f.sunkTick) ? f.sunkTick : null };
    }
    return { finished: true, dq: this.dq };
  }

  /** Avanza un paso de pantalla. Devuelve los eventos del paso (o null si espera al siguiente tiro). */
  tick() {
    if (this.done) return null;
    const shots = this.feed.shots;
    // si la lista no empieza igual que lo ya jugado (no debería pasar), se repite desde el tee
    for (let i = 0; i < this.applied; i++) {
      if (shots[i]?.tick !== this.seen[i]?.tick || shots[i]?.yaw !== this.seen[i]?.yaw || shots[i]?.power !== this.seen[i]?.power) {
        this.reset();
        break;
      }
    }
    if (this.feed.final?.dq) return this.#finalize();
    const next = shots[this.applied];
    if (!isMoving(this.ball)) {
      if (!next) return this.feed.final ? this.#finalize() : null;
      // parada hasta el momento del tiro (un aspa puede empujarla mientras tanto)
      for (let guard = 0; this.rt < next.tick && guard < MAX_CATCH_UP; guard++) {
        const r = this.#step();
        if (r.sunk) return r;
        if (isMoving(this.ball)) return r;
      }
      const v = shotVelocity(next.yaw, next.power);
      this.ball.vx = v.vx;
      this.ball.vz = v.vz;
      this.seen[this.applied] = next;
      this.applied++;
      this.strokes++;
      return { shot: next.power, ...this.#step() };
    }
    // en movimiento: si ya hay otro tiro esperando, va al doble para no quedarse atrás
    let r = this.#step();
    if (!r.sunk && next && isMoving(this.ball)) {
      const r2 = this.#step();
      r = { ...r2, hit: Math.max(r.hit ?? 0, r2.hit ?? 0), lava: r.lava ?? r2.lava, portal: r.portal >= 0 ? r.portal : r2.portal };
    }
    return r;
  }

  /** Sin render: lleva la bola hasta donde se sepa (para cerrar el hoyo). */
  finishInstantly() {
    for (let i = 0; i < MAX_CATCH_UP && !this.done; i++) {
      if (this.tick() === null && !this.done) break;
    }
    return this.strokes;
  }
}
