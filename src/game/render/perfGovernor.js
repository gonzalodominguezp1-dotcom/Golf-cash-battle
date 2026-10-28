// Gobernador de rendimiento de los FX de skin .
//
// Mide el tiempo de frame con una media móvil exponencial (~0,5 s) y ajusta el
// nivel de FX de skin del jugador en escalones, con histéresis:
//   - frame suavizado > 20 ms durante 2 s  -> baja un escalón;
//   - frame suavizado < 14 ms durante 10 s -> sube un escalón (nunca por encima
//     de quality().skinFx, es decir, de la calidad elegida).
// Entre 14 y 20 ms no cambia nada. Solo llama a skinFx.setLevel(): no toca la
// calidad global, la física ni la bola. Un cambio pendiente no se aplica mientras
// `busy()` sea true (golpe en curso); se aplica en cuanto la bola para.
//
// Uso (no está enganchado en GolfGame.js; hacerlo en la integración):
//   import { PerfGovernor } from './render/perfGovernor.js';
//   this.perf = new PerfGovernor({
//     getSkinFx: () => this.skinFx,   // SkinFX del jugador, no el de los rivales
//     busy: () => this.ballMoving,    // true desde el golpe hasta bola parada
//   });
//   // una vez por frame, en el bucle de render:
//   this.perf.tick(performance.now());
//   // al cambiar de hoyo: this.perf.reset() (un SkinFX nuevo recibe el nivel actual solo)
//   // al salir: this.perf = null (no hay recursos que liberar)
// Con ?skinlab=1 se expone window.__skinlabPerf() -> metrics().

import { quality } from './quality.js';

export const SKIN_FX_LEVELS = ['low', 'medium', 'high'];

/** Umbrales del gobernador (ms). Exportados para ajustes y pruebas. */
export const GOVERNOR = Object.freeze({
  SLOW_MS: 20, // frame suavizado por encima: cuenta para bajar
  FAST_MS: 14, // frame suavizado por debajo: cuenta para subir
  DOWN_MS: 2000, // tiempo sostenido lento antes de bajar un escalón
  UP_MS: 10000, // tiempo sostenido rápido antes de subir un escalón
  EMA_MS: 500, // constante de tiempo de la media móvil
  GAP_MS: 1000, // huecos mayores (pestaña oculta, pausa) no cuentan ni miden
});

export function skinlabRequested() {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('skinlab') === '1';
  } catch {
    return false;
  }
}

function ceilingIndex() {
  const i = SKIN_FX_LEVELS.indexOf(quality().skinFx);
  return i < 0 ? 1 : i;
}

export class PerfGovernor {
  /**
   * @param {object} [opts]
   * @param {() => ({ setLevel: (l: string) => void } | null)} [opts.getSkinFx]
   * @param {() => boolean} [opts.busy] true mientras hay un golpe en curso
   */
  constructor({ getSkinFx = () => null, busy = () => false } = {}) {
    this.getSkinFx = getSkinFx;
    this.busy = busy;
    this.lastFx = null;
    this.ceiling = ceilingIndex(); // máximo permitido por la calidad elegida
    this.level = this.ceiling; // nivel objetivo actual
    this.applied = -1; // nivel aplicado al SkinFX (-1 = ninguno)
    this.pending = true;
    this.changes = 0;
    this.ema = 0; // frame suavizado en ms (0 = sin muestras)
    this.slowAcc = 0;
    this.fastAcc = 0;
    this.last = null;
    if (skinlabRequested() && typeof window !== 'undefined') {
      window.__skinlabPerf = () => this.metrics();
    }
  }

  /** Llamar una vez por frame con performance.now(). No asigna memoria. */
  tick(now) {
    const fx = this.getSkinFx();
    if (fx !== this.lastFx) {
      this.lastFx = fx;
      this.applied = -1;
      this.pending = true; // SkinFX nuevo (cambio de hoyo/skin): aplicar el nivel actual
    }
    const dt = this.last === null ? 0 : now - this.last;
    this.last = now;
    if (dt >= GOVERNOR.GAP_MS) {
      this.ema = 0;
      this.slowAcc = 0;
      this.fastAcc = 0;
    } else if (dt > 0) {
      this.#measure(dt);
    }
    if (this.pending) this.#apply();
  }

  /** Nuevo hoyo: relee la calidad elegida. Conserva el nivel aprendido, acotado al nuevo máximo. */
  reset() {
    this.ceiling = ceilingIndex();
    this.level = Math.min(this.level, this.ceiling);
    this.ema = 0;
    this.slowAcc = 0;
    this.fastAcc = 0;
    this.last = null;
    this.pending = true;
  }

  /** Métricas para ?skinlab=1 (no se llama por frame). */
  metrics() {
    const ema = this.ema;
    return {
      fps: ema > 0 ? Math.round((1000 / ema) * 10) / 10 : null,
      frameMs: ema > 0 ? Math.round(ema * 10) / 10 : null,
      level: SKIN_FX_LEVELS[this.level],
      applied: this.applied >= 0 ? SKIN_FX_LEVELS[this.applied] : null,
      ceiling: SKIN_FX_LEVELS[this.ceiling],
      pending: this.pending,
      busy: !!this.busy(),
      changes: this.changes,
      slowMs: Math.round(this.slowAcc),
      fastMs: Math.round(this.fastAcc),
    };
  }

  #measure(dt) {
    const a = 1 - Math.exp(-dt / GOVERNOR.EMA_MS);
    this.ema = this.ema > 0 ? this.ema + (dt - this.ema) * a : dt;
    if (this.ema > GOVERNOR.SLOW_MS) {
      this.fastAcc = 0;
      this.slowAcc += dt;
      if (this.slowAcc >= GOVERNOR.DOWN_MS) {
        this.slowAcc = 0;
        this.#step(-1);
      }
    } else if (this.ema < GOVERNOR.FAST_MS) {
      this.slowAcc = 0;
      this.fastAcc += dt;
      if (this.fastAcc >= GOVERNOR.UP_MS) {
        this.fastAcc = 0;
        this.#step(1);
      }
    } else {
      // zona intermedia (histéresis): no acumula ni para bajar ni para subir
      this.slowAcc = 0;
      this.fastAcc = 0;
    }
  }

  #step(dir) {
    const next = Math.max(0, Math.min(this.ceiling, this.level + dir));
    if (next === this.level) return;
    this.level = next;
    this.changes++;
    this.pending = true;
  }

  #apply() {
    if (this.busy()) return; // nunca cambiar la skin a mitad de un golpe
    const fx = this.lastFx;
    if (!fx) return;
    if (this.applied !== this.level) {
      fx.setLevel(SKIN_FX_LEVELS[this.level]);
      this.applied = this.level;
    }
    this.pending = false;
  }
}
