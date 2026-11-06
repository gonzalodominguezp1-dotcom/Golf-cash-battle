import * as THREE from 'three';
import { AdditiveParticles } from '../effects.js';
import { reducedMotion } from '../skins/fxRules.js';
import { PLAYER_CAP, emissions, validate } from './schema.js';

// Reproduce efectos VFX con las clases reales del juego (AdditiveParticles).
// Solo dibuja: nunca toca la física. `update` no asigna memoria: los efectos activos viven en casillas
// fijas y sus emisiones se empaquetan en un Float32Array al hacer `play` (que sí puede asignar).

/** Efectos que pueden sonar a la vez; el siguiente se rechaza. */
export const MAX_ACTIVE = 8;

// Campos por emisión en el paquete: t, cell, vx, vy, vz, size, life, r, g, b, grav, drag, grow, spin, att
const STRIDE = 15;
const SURFACE_LIFT = 0.05;
/** Vueltas de un bucle que se procesan en un solo update; si dt es mayor (pestaña oculta), se salta el resto. */
const MAX_WRAPS = 4;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const finite3 = (v) => v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

const WHITE = new THREE.Color('#ffffff');
const UP = new THREE.Vector3(0, 1, 0);

/** Base ortonormal (t, axis, b) alrededor de `axis`: el marco local de las emisiones, con +y = axis. */
function frame(axis) {
  const ref = Math.abs(axis.y) < 0.99 ? UP : new THREE.Vector3(1, 0, 0);
  const t = new THREE.Vector3().crossVectors(axis, ref).normalize();
  const b = new THREE.Vector3().crossVectors(axis, t).normalize();
  return { t, axis, b };
}

class Slot {
  constructor() {
    this.active = false;
    this.gen = 0;
    this.t = 0; this.ptr = 0; this.count = 0;
    this.loop = false; this.duration = 0;
    this.data = null;
    this.ox = 0; this.oy = 0; this.oz = 0;
  }
}

export class VfxPlayer {
  /**
   * @param scene Escena de Three.
   * @param opts.quality 'low' | 'medium' | 'high'
   * @param opts.atlas  Textura del atlas de sprites (skinSpriteAtlas() en el juego).
   * @param opts.cells  Nombre de sprite -> índice de celda (SKIN_SPRITES en el juego).
   */
  constructor(scene, { quality = 'medium', atlas, cells = {} } = {}) {
    this.cells = cells;
    this.quality = quality;
    this.pool = new AdditiveParticles(scene, atlas, PLAYER_CAP.high);
    this.pool.setLimit(PLAYER_CAP[quality]);
    this.slots = Array.from({ length: MAX_ACTIVE }, () => new Slot());
    this.lastErrors = [];
  }

  /** Partículas vivas ahora. */
  get live() {
    return this.pool.n;
  }

  setLevel(quality) {
    this.quality = quality;
    this.pool.setLimit(PLAYER_CAP[quality]);
  }

  /**
   * Reproduce un efecto. Devuelve un asa { done, stop() } o null si el efecto es inválido
   * (los motivos quedan en `lastErrors`) o ya hay MAX_ACTIVE efectos sonando.
   * opts: { pos, normal?, seed, strength?, palette?, reduced? }. Con `dir` el efecto se orienta así:
   * back y normal salen en cono alrededor de la normal, up alrededor de +y del mundo, in hacia dentro
   * (−normal) y fwd a lo largo de la superficie.
   */
  play(effect, { pos, normal, seed = 0, strength = 1, palette = {}, reduced = reducedMotion() } = {}) {
    const v = validate(effect);
    if (!v.ok) { this.lastErrors = v.errors; return null; }
    this.lastErrors = [];
    const slot = this.slots.find((s) => !s.active);
    if (!slot) return null;

    if (!finite3(pos)) { this.lastErrors = ['pos: debe tener x, y y z finitos']; return null; }
    const n = finite3(normal) && Math.hypot(normal.x, normal.y, normal.z) > 1e-6 ? new THREE.Vector3(normal.x, normal.y, normal.z).normalize() : UP.clone();
    const frames = { back: frame(n), normal: frame(n), up: frame(UP), in: frame(n.clone().negate()), fwd: frame(frame(n).t) };
    const list = emissions(effect, seed, this.quality, reduced, strength).sort((a, b) => a.t - b.t);
    const data = new Float32Array(list.length * STRIDE);
    const colors = new Map();
    const colorOf = (token) => {
      let c = colors.get(token);
      if (!c) {
        const css = palette[token] ?? token;
        colors.set(token, (c = HEX.test(css) ? new THREE.Color(css) : WHITE));
      }
      return c;
    };
    list.forEach((e, i) => {
      const f = frames[e.dir] ?? frames.back, c = colorOf(e.col), o = i * STRIDE;
      const wx = e.dx * f.t.x + e.dy * f.axis.x + e.dz * f.b.x;
      const wy = e.dx * f.t.y + e.dy * f.axis.y + e.dz * f.b.y;
      const wz = e.dx * f.t.z + e.dy * f.axis.z + e.dz * f.b.z;
      data.set([e.t, this.cells[e.cell] ?? 0, wx * e.speed, wy * e.speed + e.up, wz * e.speed, e.size, e.life, c.r, c.g, c.b, e.grav, e.drag, e.grow, e.spin, e.att], o);
    });

    slot.active = true; slot.gen++;
    slot.t = 0; slot.ptr = 0; slot.count = list.length; slot.data = data;
    slot.loop = effect.loop; slot.duration = effect.duration;
    slot.ox = pos.x + n.x * SURFACE_LIFT; slot.oy = pos.y + n.y * SURFACE_LIFT; slot.oz = pos.z + n.z * SURFACE_LIFT;
    const gen = slot.gen;
    return {
      get done() { return !slot.active || slot.gen !== gen; },
      stop() { if (slot.gen === gen) slot.active = false; },
    };
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt < 0) return; // un dt roto no debe envenenar las casillas ni el pool
    const pool = this.pool, slots = this.slots;
    for (let k = 0; k < slots.length; k++) {
      const s = slots[k];
      if (!s.active) continue;
      s.t += dt;
      const d = s.data;
      for (let wraps = 0; ; wraps++) {
        while (s.ptr < s.count && d[s.ptr * STRIDE] <= s.t) {
          const o = s.ptr++ * STRIDE;
          // si el pool está lleno, emit devuelve false y esta emisión se descarta: nunca se corta una viva
          pool.emit(d[o + 1], s.ox, s.oy, s.oz, d[o + 2], d[o + 3], d[o + 4], d[o + 5], d[o + 6], d[o + 7], d[o + 8], d[o + 9], d[o + 10], d[o + 11], d[o + 12], d[o + 13], d[o + 14]);
        }
        if (!s.loop) { if (s.t >= s.duration) s.active = false; break; }
        if (s.t < s.duration) break;
        s.t -= s.duration; s.ptr = 0;
        if (wraps >= MAX_WRAPS) { s.t %= s.duration; break; }
      }
    }
    pool.update(dt);
  }

  /** Velocidad de cada partícula viva. Asigna memoria: solo para pruebas y el banco. */
  velocities() {
    const out = [];
    for (let i = 0; i < this.pool.n; i++) out.push({ x: this.pool.vel[i * 3], y: this.pool.vel[i * 3 + 1], z: this.pool.vel[i * 3 + 2] });
    return out;
  }

  dispose() {
    for (const s of this.slots) s.active = false;
    this.pool.dispose();
  }
}
