// Esquema de efecto VFX: valida, presupuesta y genera emisiones deterministas.
// Puro: no importa three ni el DOM, así que lo prueba `node --test` y lo comparten el juego y el banco.
//
// Un efecto es un objeto plano y serializable. Sus emisores usan la forma de skinFx.js
// (cell, n, speed, spread, size, life, col, …) para que las skins los lean sin cambios.
// Las emisiones salen en un marco local: +y es la normal (suelo: arriba; pared: hacia fuera).

export const QUALITIES = ['low', 'medium', 'high'];
/** Tope de partículas del VfxPlayer por calidad, aparte del de SkinFX. */
export const PLAYER_CAP = Object.freeze({ low: 24, medium: 60, high: 120 });
export const MAX_FLASHES_PER_SECOND = 3;
/** `low` conserva al menos esta fracción de las emisiones de `high` (AC13). */
export const LOW_MIN_RATIO = 0.3;
/** Con «reducir movimiento»: menos partículas, más lentas y ningún destello. */
export const CALM = Object.freeze({ count: 0.35, speed: 0.4 });

const FAMILIES = ['portal', 'impact', 'skin'];
const TOP_KEYS = ['id', 'name', 'family', 'duration', 'loop', 'maxParticles', 'emitters', 'rings', 'lights', 'flashes'];
/** Direcciones de skinFx.js; el runtime las resuelve (el esquema solo las valida y las emite). */
const DIRS = ['fwd', 'back', 'normal', 'up', 'in'];
const EMITTER_KEYS = ['cell', 'n', 'rate', 't0', 't1', 'speed', 'spread', 'size', 'life', 'col', 'grav', 'drag', 'grow', 'spin', 'up', 'dir', 'att'];
const RING_KEYS = ['t', 'radius', 'life', 'col', 'orient'];
const LIGHT_KEYS = ['t', 'radius', 'life', 'col', 'k'];
const EPS = 1e-9;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Presupuesto de partículas de un efecto en una calidad: nunca por encima del tope. */
export function budget(effect, quality) {
  return Math.floor(Math.min(effect.maxParticles?.[quality] ?? 0, PLAYER_CAP[quality] ?? 0));
}

/** Partículas que pide un emisor, antes de aplicar el presupuesto. */
function wanted(em) {
  return em.n ?? Math.round(em.rate * ((em.t1 ?? 0) - (em.t0 ?? 0)));
}

/** Cuántas partículas emite cada emisor en una calidad. Sin azar: sirve para validar y para emitir. */
function counts(effect, quality, reduced = false, strength = 1) {
  const k = (reduced ? CALM.count : 1) * Math.min(1, Math.max(0, strength));
  // un emisor que pedía algo nunca baja a 0 solo por redondeo: lo distintivo no desaparece
  const want = effect.emitters.map((em) => (wanted(em) > 0 && k > 0 ? Math.max(1, Math.round(wanted(em) * k)) : 0));
  const total = want.reduce((a, b) => a + b, 0), cap = budget(effect, quality);
  return total <= cap ? want : fitToCap(want, total, cap);
}

/** Reparte `cap` entre emisores en proporción a lo pedido, con al menos 1 para cada uno si cabe (mayor resto). */
function fitToCap(want, total, cap) {
  const idx = want.map((_, i) => i).filter((i) => want[i] > 0);
  const byWeight = [...idx].sort((x, y) => want[y] - want[x] || x - y);
  const out = want.map(() => 0);
  if (cap < idx.length) {
    byWeight.slice(0, cap).forEach((i) => (out[i] = 1));
    return out;
  }
  const ideal = want.map((n) => (n * cap) / total);
  for (const i of idx) out[i] = Math.max(1, Math.floor(ideal[i]));
  let sum = out.reduce((x, y) => x + y, 0);
  while (sum > cap) { const i = byWeight.find((j) => out[j] > 1); out[i]--; sum--; }
  while (sum < cap) {
    const i = [...idx].filter((j) => out[j] < want[j]).sort((x, y) => ideal[y] - out[y] - (ideal[x] - out[x]) || x - y)[0];
    if (i === undefined) break;
    out[i]++; sum++;
  }
  return out;
}

/** Máximo de elementos de `times` (ordenada) que caben en una ventana semiabierta [t, t + len). Dos punteros: O(n). */
function windowMax(times, len) {
  let max = 0, j = 0;
  for (let i = 0; i < times.length; i++) {
    if (j < i) j = i;
    while (j < times.length && times[j] < times[i] + len) j++;
    max = Math.max(max, j - i);
  }
  return max;
}

/**
 * Máximo de destellos de pantalla completa en cualquier ventana de 1 s. Con reducción de movimiento, 0.
 * En un bucle el efecto vuelve a empezar, así que se cuentan las repeticiones, pero en forma cerrada:
 * una ventana de 1 s abarca q periodos enteros (q × destellos) más un resto menor que un periodo.
 * El coste depende solo del número de destellos, nunca de lo corta que sea la duración.
 */
export function flashRate(effect, reduced = false) {
  if (reduced) return 0;
  const f = [...(effect.flashes ?? [])].sort((x, y) => x - y);
  if (!f.length) return 0;
  const W = 1 - EPS, D = effect.duration;
  if (!effect.loop || !(D > 0) || !Number.isFinite(D)) return windowMax(f, W);
  const q = Math.floor(W / D), r = W - q * D, g = f.concat(f.map((t) => t + D));
  let best = 0, j = 0;
  for (let i = 0; i < f.length; i++) {
    if (j < i) j = i;
    while (j < g.length && g[j] < g[i] + r) j++;
    best = Math.max(best, j - i);
  }
  return q * f.length + best;
}

function checkKeys(obj, allowed, where, errors) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) errors.push(`${where}: campo desconocido «${k}»`);
}

/** Valida un efecto. Devuelve { ok: true } o { ok: false, errors } con el campo en cada mensaje. Nunca lanza. */
export function validate(effect) {
  const errors = [];
  if (!isObj(effect)) return { ok: false, errors: ['efecto: debe ser un objeto'] };
  checkKeys(effect, TOP_KEYS, 'efecto', errors);
  if (typeof effect.id !== 'string' || !effect.id.trim()) errors.push('id: debe ser un texto no vacío');
  if (typeof effect.name !== 'string' || !effect.name.trim()) errors.push('name: debe ser un texto no vacío');
  if (!FAMILIES.includes(effect.family)) errors.push(`family: debe ser ${FAMILIES.join(', ')}`);
  if (!isNum(effect.duration) || effect.duration <= 0) errors.push('duration: debe ser un número mayor que 0');
  if (typeof effect.loop !== 'boolean') errors.push('loop: debe ser true o false');
  const mp = effect.maxParticles;
  if (!isObj(mp)) errors.push('maxParticles: debe indicar low, medium y high');
  else {
    for (const q of QUALITIES) {
      if (!Number.isInteger(mp[q]) || mp[q] < 1) errors.push(`maxParticles.${q}: debe ser un entero de 1 o más`);
      else if (mp[q] > PLAYER_CAP[q]) errors.push(`maxParticles.${q}: ${mp[q]} supera el tope de ${PLAYER_CAP[q]}`);
    }
  }
  if (!Array.isArray(effect.emitters) || !effect.emitters.length) errors.push('emitters: debe haber al menos un emisor');
  else effect.emitters.forEach((em, i) => checkEmitter(effect, em, `emitters[${i}]`, errors));
  for (const [key, keys] of [['rings', RING_KEYS], ['lights', LIGHT_KEYS]]) {
    const list = effect[key];
    if (list === undefined) continue;
    if (!Array.isArray(list)) { errors.push(`${key}: debe ser una lista`); continue; }
    list.forEach((item, i) => checkTimed(effect, item, keys, `${key}[${i}]`, errors, key === 'rings' && item?.orient !== undefined && !['floor', 'wall'].includes(item.orient) ? 'orient: debe ser floor o wall' : null));
  }
  if (effect.flashes !== undefined) {
    if (!Array.isArray(effect.flashes) || !effect.flashes.every((t) => isNum(t) && t >= 0 && t < effect.duration)) errors.push('flashes: debe ser una lista de tiempos en segundos dentro de la duración');
    else if (flashRate(effect) > MAX_FLASHES_PER_SECOND) errors.push(`flashes: más de ${MAX_FLASHES_PER_SECOND} destellos en 1 s`);
  }
  if (!errors.length) {
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const high = sum(counts(effect, 'high')), low = sum(counts(effect, 'low'));
    if (low < Math.floor(high * LOW_MIN_RATIO)) errors.push(`maxParticles.low: en calidad baja emite ${low}, menos del ${LOW_MIN_RATIO * 100} % de las ${high} de la alta`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

function checkEmitter(effect, em, where, errors) {
  if (!isObj(em)) return void errors.push(`${where}: debe ser un objeto`);
  checkKeys(em, EMITTER_KEYS, where, errors);
  if (typeof em.cell !== 'string' || !em.cell) errors.push(`${where}.cell: debe ser un texto`);
  if (typeof em.col !== 'string' || !em.col) errors.push(`${where}.col: debe ser un texto`);
  if (!isNum(em.size) || em.size <= 0) errors.push(`${where}.size: debe ser mayor que 0`);
  if (!isNum(em.life) || em.life <= 0) errors.push(`${where}.life: debe ser mayor que 0`);
  if (!isNum(em.speed) || em.speed < 0) errors.push(`${where}.speed: debe ser 0 o más`);
  if (!isNum(em.spread) || em.spread < 0 || em.spread > 1) errors.push(`${where}.spread: debe estar entre 0 y 1`);
  if (em.dir !== undefined && !DIRS.includes(em.dir)) errors.push(`${where}.dir: debe ser ${DIRS.join(', ')}`);
  const burst = em.n !== undefined, cont = em.rate !== undefined;
  if (burst === cont) return void errors.push(`${where}: debe tener n (ráfaga) o rate (continuo), no ambos ni ninguno`);
  const t0 = em.t0 ?? 0;
  if (!isNum(t0) || t0 < 0) errors.push(`${where}.t0: debe ser 0 o más`);
  if (burst) {
    if (!isNum(em.n) || em.n < 1) errors.push(`${where}.n: debe ser 1 o más`);
    if (effect.loop) errors.push(`${where}: un bucle no admite ráfagas sueltas, usa rate`);
    else if (isNum(em.life) && t0 + em.life > effect.duration + EPS) errors.push(`${where}: t0 + life (${t0 + em.life}) supera la duración ${effect.duration}`);
    return;
  }
  if (!isNum(em.rate) || em.rate <= 0) return void errors.push(`${where}.rate: debe ser mayor que 0`);
  if (!isNum(em.t1) || em.t1 <= t0) return void errors.push(`${where}.t1: debe ser mayor que t0`);
  if (effect.loop) {
    const n = em.rate * (em.t1 - t0);
    if (t0 !== 0 || Math.abs(em.t1 - effect.duration) > EPS) errors.push(`${where}: en un bucle el emisor cubre de 0 a la duración`);
    else if (Math.abs(n - Math.round(n)) > 1e-6) errors.push(`${where}.rate: rate × duración debe ser entero para cerrar sin salto (da ${n})`);
  } else if (isNum(em.life) && em.t1 + em.life > effect.duration + EPS) errors.push(`${where}: t1 + life (${em.t1 + em.life}) supera la duración ${effect.duration}`);
}

function checkTimed(effect, item, allowed, where, errors, extra) {
  if (!isObj(item)) return void errors.push(`${where}: debe ser un objeto`);
  checkKeys(item, allowed, where, errors);
  if (extra) errors.push(`${where}.${extra}`);
  if (item.k !== undefined && (!isNum(item.k) || item.k < 0 || item.k > 1)) errors.push(`${where}.k: debe estar entre 0 y 1 (brillo del destello)`);
  if (!isNum(item.t) || item.t < 0) errors.push(`${where}.t: debe ser 0 o más`);
  if (!isNum(item.life) || item.life <= 0) errors.push(`${where}.life: debe ser mayor que 0`);
  else if (!effect.loop && isNum(item.t) && item.t + item.life > effect.duration + EPS) errors.push(`${where}: t + life supera la duración ${effect.duration}`);
}

/** Generador con semilla (mulberry32). Un `Math.random()` aquí rompería la paridad entre banco y juego. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Lista de emisiones de un efecto: determinista (misma semilla, misma lista) y nunca más larga que su presupuesto.
 * strength va de 0 a 1 y escala la cantidad; reduced aplica CALM.
 */
export function emissions(effect, seed, quality, reduced = false, strength = 1) {
  if (!QUALITIES.includes(quality)) throw new RangeError(`calidad desconocida «${quality}»`);
  if (!Number.isFinite(strength) || !Number.isFinite(seed)) throw new RangeError('seed y strength deben ser números finitos');
  const rand = rng(seed), out = [], n = counts(effect, quality, reduced, strength);
  const speedK = reduced ? CALM.speed : 1;
  effect.emitters.forEach((em, i) => {
    const t0 = em.t0 ?? 0, span = em.rate !== undefined ? em.t1 - t0 : 0, cosMax = 1 - 2 * em.spread;
    for (let j = 0; j < n[i]; j++) {
      const cos = 1 - rand() * (1 - cosMax), sin = Math.sqrt(Math.max(0, 1 - cos * cos)), phi = rand() * Math.PI * 2;
      out.push({
        t: span ? t0 + (j * span) / n[i] : t0,
        cell: em.cell, col: em.col, size: em.size, life: em.life,
        speed: em.speed * (0.7 + 0.6 * rand()) * speedK,
        dx: sin * Math.cos(phi), dy: cos, dz: sin * Math.sin(phi),
        dir: em.dir ?? 'back', grav: em.grav ?? 0, drag: em.drag ?? 1.5, grow: em.grow ?? 0, spin: em.spin ?? 0, up: em.up ?? 0, att: em.att ?? 0,
      });
    }
  });
  return out;
}
