// Resolución dinámica: si el móvil no llega a los fotogramas, se dibuja con
// menos píxeles (lo que más cuesta en un móvil es rellenar la pantalla) y,
// cuando sobra, se vuelve a subir hasta el máximo de la calidad elegida.
//
// Mide el tiempo de frame con una media móvil (~0,4 s):
//   - por encima de SLOW_MS durante DOWN_MS -> baja la escala un STEP;
//   - por debajo de FAST_MS durante UP_MS   -> la sube un STEP (hasta max).
// Entre medias no hace nada (histéresis). Nunca cambia más de una vez cada
// HOLD_MS, y los huecos largos (pestaña oculta) no cuentan. Solo toca el
// tamaño de dibujo: la física y la simulación no cambian.

export const RESOLUTION = Object.freeze({
  SLOW_MS: 21, // < ~48 fps: va justo
  FAST_MS: 14.5, // > ~69 fps: sobra margen (en pantallas de 60 Hz sube solo con holgura)
  DOWN_MS: 900,
  UP_MS: 5000,
  EMA_MS: 400,
  HOLD_MS: 1200,
  GAP_MS: 1000,
  STEP: 0.15,
});

export class ResolutionGovernor {
  /**
   * @param {object} o
   * @param {number} o.min escala mínima (pixelRatio)
   * @param {number} o.max escala máxima (pixelRatio)
   * @param {(pr: number) => void} o.apply aplica la nueva escala
   */
  constructor({ min, max, apply }) {
    this.apply = apply;
    this.configure(min, max);
  }

  /** Nueva calidad: nuevo margen. Empieza arriba y baja si hace falta. */
  configure(min, max) {
    this.min = Math.min(min, max);
    this.max = max;
    this.value = max;
    this.ema = 0;
    this.slow = 0;
    this.fast = 0;
    this.last = null;
    this.lastChange = -Infinity;
    this.changes = 0;
  }

  /** Una vez por frame con performance.now(). No asigna memoria. */
  tick(now) {
    const dt = this.last === null ? 0 : now - this.last;
    this.last = now;
    if (dt <= 0) return;
    if (dt >= RESOLUTION.GAP_MS) {
      this.ema = 0;
      this.slow = this.fast = 0;
      return;
    }
    const a = 1 - Math.exp(-dt / RESOLUTION.EMA_MS);
    this.ema = this.ema > 0 ? this.ema + (dt - this.ema) * a : dt;
    if (this.ema > RESOLUTION.SLOW_MS) {
      this.fast = 0;
      this.slow += dt;
    } else if (this.ema < RESOLUTION.FAST_MS) {
      this.slow = 0;
      this.fast += dt;
    } else {
      this.slow = this.fast = 0;
    }
    if (now - this.lastChange < RESOLUTION.HOLD_MS) return;
    if (this.slow >= RESOLUTION.DOWN_MS && this.value > this.min) this.#set(Math.max(this.min, this.value - RESOLUTION.STEP), now);
    else if (this.fast >= RESOLUTION.UP_MS && this.value < this.max) this.#set(Math.min(this.max, this.value + RESOLUTION.STEP), now);
  }

  #set(v, now) {
    this.value = Math.round(v * 100) / 100;
    this.slow = this.fast = 0;
    this.lastChange = now;
    this.changes++;
    this.apply(this.value);
  }
}
