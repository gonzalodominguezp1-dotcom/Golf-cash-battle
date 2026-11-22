import * as THREE from 'three';
import { TAU, lerp, smooth, treeLevel, withRim } from './treeKit.js';
import { windUniforms } from './wind.js';
import { swellMaxAmp } from './water.js';

// Pez que asoma y salta de vez en cuando en el agua (lago o río), entre los pasos 8 y 9 de
// 02-DOCS/wiki/ftd/assets-entorno-1a1.md. Solo dibujo: la física del hoyo no lo ve nunca.
//
// - Estilo liso: cuerpo fusiforme (anillos elípticos con la columna algo arqueada), aleta
//   caudal ahorquillada, dorsal, pectorales, anal (Medio/Alto) y ojos. Una geometría para
//   todas las especies: la forma de cada una sale de la escala de su instancia (largo, alto,
//   ancho) y el color de tres colores por instancia (lomo, vientre, acento) mezclados con
//   pesos por vértice (fishTone: lomo, línea lateral, bandas, aletas), como las flores.
// - Una InstancedMesh para todos los peces del hoyo (1 llamada) y otra para las
//   salpicaduras (anillos + corona + gotas, aditiva). Las dos se esconden cuando no hay
//   salto: casi siempre cuestan 0 llamadas. Sin sombras.
// - Calendario determinista con el tiempo del viento (uWind.w, que vuelve a 0 cada hora):
//   la hora se parte en huecos de FISH_SCHEDULE.period s y cada hueco tiene un salto que
//   empieza en un punto al azar (hash de la semilla y el hueco) dentro de ±jitter: intervalos
//   irregulares de 6 a 19 s, uno a la vez, reproducibles y sin estado (se puede preguntar
//   por cualquier t). La altura sigue la secuencia áurea: dos saltos seguidos nunca son
//   iguales (difieren al menos un 29 % del rango de alturas).
// - Salto: aleta asomando bajo la superficie (acercamiento), tiro parabólico desde debajo del
//   agua con el morro siguiendo la tangente y coletazo (onda lateral en el sombreador de
//   vértices), entrada de cabeza y se hunde hasta desaparecer. La pose se calcula en JS (es
//   un pez a la vez: unas pocas operaciones por fotograma).
// - Salpicaduras: eventos puros (fishSplashEvents) en la salida y la entrada, para que el
//   agua pueda dibujar ondas; la malla de salpicadura los dibuja con su edad.
// - Zonas válidas: el plan (planFish) busca sitios sobre agua honda, con el carril entero
//   (acercamiento + vuelo + hundimiento) a ≥ FISH_CLEAR.shore de la orilla, lejos de la
//   pista y del tee; en el río, por el centro del cauce y a lo largo de river.along.
//
// Determinismo: del rng del hoyo sale UNA tirada (FISH_RNG_DRAWS), haya peces o no; el resto
// sale de un rng propio con un número fijo de tiradas. El plan no depende de la calidad.
// Compatible con bakeStatic: el grupo y sus mallas llevan userData.keep.

// ---------- constantes ----------

/** Triángulos máximos de UN pez por calidad (medidos en tests/fish.test.js). */
export const FISH_BUDGET = { low: 40, medium: 90, high: 160 };
/** Triángulos máximos de UNA salpicadura (Bajo: solo un anillo, sin corona ni gotas). */
export const FISH_SPLASH_BUDGET = { low: 48, medium: 128, high: 200 };
/** Peces (instancias) por hoyo, como mucho; uno salta a la vez. */
export const FISH_MAX = 3;
/** Llamadas de dibujo: una para todos los peces y otra para las salpicaduras (solo mientras se ven). */
export const FISH_MAX_CALLS = 1;
export const FISH_SPLASH_CALLS = 1;
/** Tiradas que el plan toma del rng del hoyo (siempre). */
export const FISH_RNG_DRAWS = 1;
/**
 * Zonas libres (m): shore = distancia mínima a la orilla de todo el carril del salto; course =
 * a la pista; tee = al tee; depth = profundidad mínima del agua bajo el carril.
 */
export const FISH_CLEAR = { shore: 1.5, course: 3.5, tee: 8, depth: 0.4 };
/** Distancia máxima (m) de un sitio de salto a la pista (más lejos no se vería). */
export const FISH_REACH = 35;
/** Calendario: hueco medio y desplazamiento (s); wrap = vuelta del tiempo del viento. fast: laboratorio. */
export const FISH_SCHEDULE = { period: 12.5, jitter: 3.25, wrap: 3600, fast: { period: 2.5, jitter: 0.2 } };
/**
 * Salto: gravedad (m/s²), altura del vértice sobre el agua (m), largo en planta (m),
 * profundidad del centro al salir y al entrar (m), profundidad a la que desaparece (m; con
 * el medio alto del pez más alto, 0,13 x 0,63 m, ha de caber en FISH_CLEAR.depth + 0,05 sin tocar el lecho),
 * acercamiento (s y m/s; fast en el laboratorio).
 */
export const FISH_JUMP = { gravity: 8, height: [0.25, 0.7], length: [0.6, 1.4], startDepth: 0.15, dive: 0.3, approach: 1.6, approachFast: 0.5, approachSpeed: 0.45 };
/** Salpicadura: vida (s), radio máximo (m, x intensidad), alto de la corona (m), huecos a la vez. */
export const FISH_SPLASH = { life: 1.4, radius: 0.9, height: 0.35, slots: 4 };
/** Coletazo: onda lateral de número de onda k (rad por largo de cuerpo) que crece hacia la cola. */
export const FISH_BEND = { k: 5.5 };
/** Distancia (m) a la que deja de dibujarse (si update recibe la cámara). */
export const FISH_FAR = 90;

const GOLDEN = 0.6180339887498949;
const WRAP = FISH_SCHEDULE.wrap;
const BAND = { freq: 23.6, phase: 1.3 };
const SPOTS_MAX = 6;
const RIVER_SPOTS_MAX = 3;
const N_LAKE = 96; // candidatos (2 tiradas cada uno)
const N_RIVER = 24;
const LANE_STEP = 0.3; // m entre puntos comprobados del carril
const RING_PROBES = 12;
const RING_MARGIN = 0.15; // el anillo de la orilla se comprueba a shore + margen (cubre lo que hay entre sondas)
const SPOT_GAP = 2; // m entre sitios

// ---------- especies y paletas ----------

/**
 * Especies: label, length (m), hk/wk (alto y ancho frente al cuerpo base), colores (hex sRGB) de
 * lomo, vientre y acento, y pat = peso del acento en [línea lateral, bandas, aletas].
 */
export const FISH_SPECIES = {
  trout: { label: 'trucha', length: 0.42, hk: 0.95, wk: 0.9, back: 0x5f6f3c, belly: 0xe4e8e0, accent: 0xe07a8c, pat: [1, 0, 0.15] },
  carp: { label: 'carpa dorada', length: 0.48, hk: 1.2, wk: 1.1, back: 0xc9621c, belly: 0xf7c46a, accent: 0xffe3a0, pat: [0, 0, 0.6] },
  perch: { label: 'perca', length: 0.34, hk: 1.15, wk: 0.95, back: 0x4f6a2c, belly: 0xece2a8, accent: 0x2a3518, pat: [0, 1, 0] },
  koiRed: { label: 'koi kohaku', length: 0.5, hk: 1.05, wk: 1.05, back: 0xf4f0e8, belly: 0xffffff, accent: 0xd8321e, pat: [0, 1, 0.3] },
  koiGold: { label: 'koi dorado', length: 0.46, hk: 1.05, wk: 1.05, back: 0xf0a020, belly: 0xffe08a, accent: 0xffffff, pat: [0, 0.6, 0.8] },
  char: { label: 'salvelino', length: 0.4, hk: 1, wk: 0.9, back: 0x34506a, belly: 0xe9eef2, accent: 0xd9603b, pat: [0.3, 0, 1] },
  grayling: { label: 'tímalo', length: 0.38, hk: 1.05, wk: 0.85, back: 0x5a6680, belly: 0xd8dde6, accent: 0x7a5aa0, pat: [0.2, 0, 1] },
  tangYellow: { label: 'cirujano amarillo', length: 0.3, hk: 1.55, wk: 0.7, back: 0xffd21f, belly: 0xfff19a, accent: 0xffffff, pat: [0, 0, 0.4] },
  tangBlue: { label: 'cirujano azul', length: 0.32, hk: 1.45, wk: 0.7, back: 0x2456d6, belly: 0x4a8ef2, accent: 0xffd21f, pat: [0, 0, 1] },
  clown: { label: 'pez payaso', length: 0.26, hk: 1.2, wk: 0.9, back: 0xff7a1a, belly: 0xff9a40, accent: 0xffffff, pat: [0, 1, 0] },
  piranha: { label: 'piraña', length: 0.34, hk: 1.35, wk: 0.85, back: 0x7c8890, belly: 0xd8452e, accent: 0x30363a, pat: [0, 0, 0.7] },
  tetra: { label: 'tetra', length: 0.3, hk: 1, wk: 0.85, back: 0x1f6ad0, belly: 0xe0453a, accent: 0x40e6ff, pat: [1, 0, 0] },
};

/** Paletas: 2–3 especies por tipo de agua. */
export const FISH_PALETTES = {
  temperate: { species: ['trout', 'carp', 'perch'] },
  koi: { species: ['koiRed', 'koiGold', 'carp'] },
  cold: { species: ['char', 'grayling'] },
  tropical: { species: ['tangYellow', 'tangBlue', 'clown'] },
  jungle: { species: ['piranha', 'tetra', 'tangYellow'] },
};

/**
 * Paleta de peces de un tema de escena (THEMES) o null si no lleva: neón, ciudad, lava,
 * caldera y el glaciar (snowSand: agua de deshielo helada y turbia; también `frozen`/`ice`).
 * Nieve con agua líquida: peces de agua fría. Sin tema: 'temperate'.
 */
export function fishPaletteName(theme) {
  if (!theme) return 'temperate';
  if (theme.neon || theme.cyberCity || theme.lava || theme.caldera) return null;
  if (theme.frozen || theme.ice || theme.snowSand) return null;
  if (theme.snowfall) return 'cold';
  if (theme.trees?.includes('palm')) return 'tropical';
  if (theme.lowClouds && theme.stoneWalls) return 'jungle';
  if (theme.stars && theme.flowers) return 'koi';
  return 'temperate';
}
export const fishPaletteOf = (theme) => {
  const name = fishPaletteName(theme);
  return name ? { name, ...FISH_PALETTES[name] } : null;
};
export const fishSupported = (theme) => fishPaletteName(theme) !== null;

// ---------- utilidades ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Hash entero (semilla, hueco, sal) -> [0, 1). */
function hashU(seed, k, salt) {
  let h = (seed ^ Math.imul(k + 7, 0x9e3779b1) ^ Math.imul(salt + 13, 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fract = (v) => v - Math.floor(v);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mod = (v, m) => ((v % m) + m) % m;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const f = (n) => {
  const s = Number(n).toString();
  return /[.e]/.test(s) ? s : s + '.0';
};

// ---------- calendario (puro) ----------

const sched = (opts) => (opts?.fast ? FISH_SCHEDULE.fast : FISH_SCHEDULE);
const slotsOf = (opts) => Math.round(WRAP / sched(opts).period);

/** Inicio sin envolver del hueco kk (entero, puede salirse de [0, N)): k = kk mod N para el hash. */
function rawStart(kk, seed, opts) {
  const { period: P, jitter: J } = sched(opts);
  const k = mod(kk, slotsOf(opts));
  return kk * P + hashU(seed, -1, 0) * P + (hashU(seed, k, 1) - 0.5) * 2 * J;
}

/** Hueco k del calendario: { k, start } (start en [0, wrap) s del tiempo del viento). */
export function fishSlot(k, seed, opts = {}) {
  const N = slotsOf(opts);
  k = mod(Math.round(k), N);
  return { k, start: mod(rawStart(k, seed, opts), WRAP) };
}

/** Huecos cuyo inicio cae en [t0, t1) (dentro de una vuelta, 0 ≤ t0 ≤ t1 ≤ wrap), por orden. */
export function fishSchedule(seed, t0, t1, opts = {}) {
  const { period: P, jitter: J } = sched(opts);
  const N = slotsOf(opts);
  const out = [];
  const seen = new Set();
  for (let kk = Math.floor((t0 - J) / P) - 2; kk <= Math.ceil((t1 + J) / P) + 1; kk++) {
    const k = mod(kk, N);
    if (seen.has(k)) continue;
    const start = mod(rawStart(k, seed, opts), WRAP);
    if (start >= t0 && start < t1) {
      seen.add(k);
      out.push({ k, start });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Tiempos de un salto (solo de la semilla y el hueco): altura del vértice, velocidad vertical,
 * duración del vuelo (de -startDepth a -startDepth), final (hundido a `dive`), acercamiento y
 * los instantes (desde el despegue) en que el centro cruza la superficie al salir y al entrar.
 */
export function fishTiming(seed, k, opts = {}) {
  const N = slotsOf(opts);
  k = mod(k, N);
  const { gravity: g, height: [h0, h1], startDepth: D, dive } = FISH_JUMP;
  // altura con la secuencia áurea (vecinos siempre distintos) + un poco de azar
  const u = clamp(fract(k * GOLDEN + hashU(seed, -1, 2)) + (hashU(seed, k, 6) - 0.5) * 0.06, 0, 1);
  const height = lerp(h0, h1, u);
  const vy = Math.sqrt(2 * g * (height + D));
  const air = (2 * vy) / g;
  const end = (vy + Math.sqrt(vy * vy + 2 * g * (dive - D))) / g;
  const disc = Math.sqrt(vy * vy - 2 * g * D);
  return {
    k,
    start: fishSlot(k, seed, opts).start,
    height,
    vy,
    air,
    end,
    approach: opts.fast ? FISH_JUMP.approachFast : FISH_JUMP.approach,
    exit: (vy - disc) / g,
    entry: (vy + disc) / g,
  };
}

/**
 * Salto visible en el instante t (s del tiempo del viento; se toma módulo wrap) o null:
 * { k, start, local (s desde el despegue; negativo = acercándose), approach, end, ... }.
 */
export function fishJumpAt(t, seed, opts = {}) {
  const { period: P, jitter: J } = sched(opts);
  const tm = mod(t, WRAP);
  const lo = Math.floor((tm - 3 - J) / P) - 1, hi = Math.ceil((tm + 3 + J) / P) + 1;
  for (let kk = lo; kk <= hi; kk++) {
    const s = rawStart(kk, seed, opts);
    const local = tm - s;
    if (local < -FISH_JUMP.approach - 0.01 || local > 3) continue;
    const T = fishTiming(seed, kk, opts);
    if (local >= -T.approach && local <= T.end) return { ...T, local };
  }
  return null;
}

// ---------- plan del hoyo ----------

const LANE_BACK = FISH_JUMP.length[1] / 2 + FISH_JUMP.approach * FISH_JUMP.approachSpeed;
const LANE_FRONT = (() => {
  // lo que avanza el pez hundiéndose tras volver al agua: lo máximo con el salto más bajo y largo
  const { gravity: g, height: [h0], startDepth: D, dive, length: [, L1] } = FISH_JUMP;
  const vy = Math.sqrt(2 * g * (h0 + D)), air = (2 * vy) / g;
  const end = (vy + Math.sqrt(vy * vy + 2 * g * (dive - D))) / g;
  return L1 / 2 + (L1 / air) * (end - air) + 0.05;
})();

/**
 * Busca los sitios de salto y los peces del hoyo. opts: { rng (del hoyo: 1 tirada), y (nivel
 * del agua; si no, river.y), heightAt(x, z), river? (flora.makeRiver), courseDist?(x, z) (m a
 * la pista), tee? [x, z], area? { x, z, r } (caja donde buscar), theme, fast?, count? (tope
 * de peces) }. Devuelve datos planos { seed, y, fast, palette, spots, fish }: spots =
 * [{ x, z, kind ('lake' | 'river'), lanes (ángulos válidos), extent [a, b] (m del carril
 * comprobados a lo largo de cada ángulo) }], fish = [{ species, length, hk, wk, tint }].
 */
export function planFish({ rng, y, heightAt, river = null, courseDist = null, tee = null, area = null, theme, fast = false, count = FISH_MAX }) {
  const seed = Math.floor(rng() * 4294967296); // la única tirada del rng del hoyo
  const level = y ?? river?.y ?? 0;
  const palette = fishPaletteOf(theme);
  const plan = { seed, y: level, fast: !!fast, palette: palette?.name ?? null, spots: [], fish: [] };
  if (!palette || typeof heightAt !== 'function') return plan;
  // un río sin cauce (along/dist/w) no sirve: plan vacío, como con un heightAt inválido
  if (river && (typeof river.along !== 'function' || typeof river.dist !== 'function' || !Number.isFinite(river.w))) return plan;
  const r = mulberry32(seed ^ 0x2545f491);
  // siempre las mismas tiradas, se usen o no
  const riverDraws = Array.from({ length: N_RIVER * 2 }, r);
  const lakeDraws = Array.from({ length: N_LAKE * 2 }, r);
  const fishDraws = Array.from({ length: 2 + FISH_MAX * 3 }, r);
  const A = area ?? { x: 0, z: 0, r: 40 };
  const { shore, course, tee: teeClear, depth } = FISH_CLEAR;
  const deep = (x, z) => heightAt(x, z) <= level - depth - 0.05;
  const wetRing = (x, z) => {
    const R = shore + RING_MARGIN;
    for (let i = 0; i < RING_PROBES; i++) {
      const a = (i / RING_PROBES) * TAU;
      if (!(heightAt(x + Math.cos(a) * R, z + Math.sin(a) * R) < level - 0.01)) return false; // NaN = no apto
    }
    return true;
  };
  const clearOf = (x, z) =>
    (!courseDist || courseDist(x, z) >= course + LANE_STEP / 2 + 0.05) && (!tee || Math.hypot(x - tee[0], z - tee[1]) >= teeClear + LANE_STEP / 2 + 0.05);
  const extent = [-LANE_BACK, LANE_FRONT];
  const laneOk = (x, z, ang) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    const n = Math.ceil((extent[1] - extent[0]) / LANE_STEP);
    for (let i = 0; i <= n; i++) {
      const d = extent[0] + ((extent[1] - extent[0]) * i) / n;
      const px = x + c * d, pz = z + s * d;
      if (!clearOf(px, pz) || !deep(px, pz) || !wetRing(px, pz)) return false;
    }
    return true;
  };
  const near = (x, z) => !courseDist || courseDist(x, z) <= FISH_REACH;
  const apart = (x, z) => plan.spots.every((q) => Math.hypot(q.x - x, q.z - z) >= SPOT_GAP);
  const round = (v) => +v.toFixed(5);
  if (river) {
    const maxLat = Math.max(0, river.w - shore - 0.3);
    const p0 = river.along(0, 0), p1 = river.along(1, 0);
    const alongZ = Math.abs(p1[1] - p0[1]) > Math.abs(p1[0] - p0[0]);
    const t0 = alongZ ? A.z - p0[1] : A.x - p0[0];
    for (let i = 0; i < N_RIVER && plan.spots.length < RIVER_SPOTS_MAX; i++) {
      const t = t0 + (riverDraws[i * 2] - 0.5) * 2 * A.r, lat = (riverDraws[i * 2 + 1] - 0.5) * 2 * maxLat;
      const [x, z] = river.along(t, lat);
      if (!near(x, z) || !apart(x, z) || !deep(x, z)) continue;
      const a = river.along(t - 0.5, lat), b = river.along(t + 0.5, lat);
      const h = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const lanes = [h, wrapAngle(h + Math.PI)].filter((ang) => laneOk(x, z, ang)).map(round);
      if (lanes.length) plan.spots.push({ x: round(x), z: round(z), kind: 'river', lanes, extent: extent.map(round) });
    }
  }
  for (let i = 0; i < N_LAKE && plan.spots.length < SPOTS_MAX; i++) {
    const x = A.x + (lakeDraws[i * 2] - 0.5) * 2 * A.r, z = A.z + (lakeDraws[i * 2 + 1] - 0.5) * 2 * A.r;
    if (!deep(x, z) || !near(x, z) || !apart(x, z)) continue;
    if (river && river.dist(x, z) < river.w + 1) continue; // el río ya tiene sus sitios (a lo largo del cauce)
    const lanes = [];
    for (let d = 0; d < 8; d++) {
      const ang = wrapAngle((d / 8) * TAU);
      if (laneOk(x, z, ang)) lanes.push(round(ang));
    }
    if (lanes.length) plan.spots.push({ x: round(x), z: round(z), kind: 'lake', lanes, extent: extent.map(round) });
  }
  if (!plan.spots.length) return plan;
  const list = palette.species;
  const n = Math.max(0, Math.min(Math.floor(count) || 0, list.length, fishDraws[0] < 0.5 ? 2 : 3));
  const first = Math.floor(fishDraws[1] * list.length);
  for (let i = 0; i < n; i++) {
    const species = list[(first + i) % list.length];
    const S = FISH_SPECIES[species];
    const k = 0.9 + 0.2 * fishDraws[2 + i * 3];
    plan.fish.push({ species, length: round(S.length * k), hk: S.hk, wk: S.wk, tint: round(0.92 + 0.16 * fishDraws[3 + i * 3]) });
  }
  return plan;
}

/**
 * Salto completo del hueco k con el plan: tiempos, pez, sitio, dirección (heading, rad en el
 * plano xz: 0 = +x), largo, punto de despegue (x0, z0) y alabeo. null si el plan no tiene peces.
 */
export function fishJump(plan, k) {
  if (!plan.spots.length || !plan.fish.length) return null;
  const opts = { fast: plan.fast };
  const N = slotsOf(opts);
  k = mod(k, N);
  const T = fishTiming(plan.seed, k, opts);
  const n = plan.spots.length;
  const pick = (kk) => Math.floor(hashU(plan.seed, kk, 2) * n);
  let si = pick(k);
  if (n > 1 && si === pick(mod(k - 1, N))) si = (si + 1) % n;
  const spot = plan.spots[si];
  const heading = spot.lanes[Math.floor(hashU(plan.seed, k, 3) * spot.lanes.length)];
  const length = lerp(FISH_JUMP.length[0], FISH_JUMP.length[1], hashU(plan.seed, k, 4));
  const fish = Math.floor(hashU(plan.seed, k, 5) * plan.fish.length);
  return {
    ...T,
    fish,
    spot: si,
    heading,
    length,
    x0: spot.x - Math.cos(heading) * (length / 2),
    z0: spot.z - Math.sin(heading) * (length / 2),
    roll: (hashU(plan.seed, k, 7) - 0.5) * 0.6,
    wag0: hashU(plan.seed, k, 8) * TAU,
  };
}

// ---------- pose (pura) ----------

/** Alto local del vértice más alto de la aleta dorsal (fracción del largo, sin hk). */
const FIN_TOP = 0.225;
const SWIM = 0.6; // el centro va a SWIM x (alto de la aleta) bajo el agua: asoma el 40 % de la aleta
const DIP = 0.25; // s antes del despegue en los que coge impulso (baja y levanta el morro)
const RISE = 0.35; // s que tarda en subir desde el fondo al empezar el acercamiento
const _e = new THREE.Euler();

/** Desplazamiento lateral (z local) del coletazo en la x local del cuerpo (nariz +0,5, cola -0,5). Espejo del sombreador. */
export function fishBendOffset(x, phase, amp) {
  const a = clamp(0.5 - x, 0, 1);
  return amp * a * a * Math.sin(phase - a * FISH_BEND.k);
}

/**
 * Pose del pez en el instante t o null: { fish, x, y, z, heading, pitch, roll, quaternion,
 * scale [x, y, z], wagPhase, wagAmp, finTop (m de la aleta sobre el centro), phase }.
 */
export function fishPoseAt(plan, t) {
  if (!plan.spots.length || !plan.fish.length) return null;
  const at = fishJumpAt(t, plan.seed, { fast: plan.fast });
  if (!at) return null;
  const j = fishJump(plan, at.k);
  const F = plan.fish[j.fish];
  const tau = at.local;
  const g = FISH_JUMP.gravity, D = FISH_JUMP.startDepth;
  const vx = j.length / j.air;
  const finTop = FIN_TOP * F.length * F.hk;
  const swim = SWIM * finTop;
  const pitch0 = Math.atan2(j.vy, vx);
  let s, dy, pitch, phase, wagPhase, wagAmp;
  if (tau < 0) {
    phase = 'approach';
    s = -j.length / 2 + FISH_JUMP.approachSpeed * tau;
    const rise = smooth(-j.approach, -j.approach + RISE, tau), dip = smooth(-DIP, 0, tau);
    dy = lerp(lerp(-FISH_JUMP.dive, -swim, rise), -D, dip);
    pitch = pitch0 * dip;
    wagPhase = j.wag0 + 9 * (tau + j.approach);
    wagAmp = 0.05 + 0.05 * dip;
  } else {
    phase = tau <= j.air ? 'air' : 'dive';
    s = -j.length / 2 + vx * tau;
    dy = -D + j.vy * tau - 0.5 * g * tau * tau;
    pitch = Math.atan2(j.vy - g * tau, vx);
    wagPhase = j.wag0 + 9 * j.approach + 18 * tau;
    // coletazo al salir del agua
    wagAmp = 0.1 + 0.07 * Math.exp(-(((tau - j.exit) / 0.1) ** 2));
  }
  const c = Math.cos(j.heading), sn = Math.sin(j.heading);
  const spot = plan.spots[j.spot];
  const roll = j.roll * (tau < 0 ? 0 : Math.min(1, tau / 0.2));
  _e.set(roll, -j.heading, pitch, 'YZX');
  return {
    fish: j.fish,
    k: j.k,
    x: spot.x + c * s,
    y: plan.y + dy,
    z: spot.z + sn * s,
    heading: j.heading,
    pitch,
    roll,
    quaternion: new THREE.Quaternion().setFromEuler(_e),
    scale: [F.length, F.length * F.hk, F.length * F.wk],
    wagPhase,
    wagAmp,
    finTop,
    phase,
  };
}

/**
 * Eventos de salpicadura (puros) con t en [t0, t1) del tiempo del viento: { k, kind ('exit' |
 * 'entry'), t, x, y, z, intensity (0..1) }, por orden de t. Si t1 < t0, el intervalo cruza la
 * vuelta del tiempo: [t0, wrap) y luego [0, t1). Para que el agua dibuje ondas en esos puntos.
 */
export function fishSplashEvents(plan, t0, t1) {
  if (t1 < t0) return [...fishSplashEvents(plan, t0, WRAP), ...fishSplashEvents(plan, 0, t1)];
  if (!plan.spots.length || !plan.fish.length) return [];
  const opts = { fast: plan.fast };
  const { period: P, jitter: J } = sched(opts);
  const out = [];
  const [h0, h1] = FISH_JUMP.height;
  for (let kk = Math.floor((t0 - 3 - J) / P) - 1; kk <= Math.ceil((t1 + J) / P) + 1; kk++) {
    const s = rawStart(kk, plan.seed, opts);
    if (s + 3 < t0 || s > t1) continue;
    const j = fishJump(plan, kk);
    const F = plan.fish[j.fish];
    const entry = Math.min(1, (0.62 + 0.3 * ((j.height - h0) / (h1 - h0))) * clamp(F.length / 0.42, 0.8, 1.1));
    for (const [kind, tau, intensity] of [['exit', j.exit, entry * 0.6], ['entry', j.entry, entry]]) {
      const t = s + tau;
      if (t < t0 || t >= t1) continue;
      const d = -j.length / 2 + (j.length / j.air) * tau;
      const spot = plan.spots[j.spot];
      out.push({ k: j.k, kind, t, x: spot.x + Math.cos(j.heading) * d, y: plan.y, z: spot.z + Math.sin(j.heading) * d, intensity });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Altura sobre el agua en calma a la que se dibuja la salpicadura: por encima de la cresta máxima del oleaje + 1 cm. */
export const splashLift = (level) => swellMaxAmp(treeLevel(level)) + 0.01;

/** Estado de una salpicadura de edad `age` s e intensidad 0..1: { radius, height, fade } o null si no se ve. */
export function splashState(age, intensity = 1) {
  const { life, radius, height } = FISH_SPLASH;
  if (!(age >= 0) || age > life) return null;
  const a = age / life;
  return {
    radius: radius * intensity * (0.25 + 0.75 * (1 - (1 - a) * (1 - a))),
    height: height * intensity * (a < 0.6 ? Math.sin((Math.PI * a) / 0.6) : 0),
    fade: Math.pow(1 - a, 1.5),
  };
}

// ---------- geometría del pez (sin rng) ----------

/** Detalle por calidad: lados y anillos del cuerpo, triángulos por lóbulo de la cola, dorsal, pectoral, anal y ojo. */
const DETAIL = {
  low: { sides: 5, rings: 3, caudal: 1, dorsal: 1, pect: 1, anal: 0, eye: 1 },
  medium: { sides: 7, rings: 5, caudal: 2, dorsal: 2, pect: 1, anal: 1, eye: 4 },
  high: { sides: 9, rings: 7, caudal: 3, dorsal: 4, pect: 2, anal: 2, eye: 6 },
};
const NOSE = 0.5, PED = -0.3, TAIL = -0.5; // x local: nariz, pedúnculo y punta de la cola
const H0 = 0.13, W0 = 0.065, ARCH = 0.015;
const xOf = (u) => NOSE - (NOSE - PED) * u;
const halfH = (u) => H0 * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, 0.62))), 0.85);
const halfW = (u) => (W0 / H0) * halfH(u);
const arch = (u) => ARCH * Math.sin(Math.PI * u);
const bodyMid = (u) => smooth(0.05, 0.25, u) * (1 - smooth(0.75, 0.95, u));

class FishBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.tone = [];
  }
  vert(v) {
    this.pos.push(...v.p);
    this.nor.push(...v.n);
    this.col.push(v.c, v.c, v.c);
    this.tone.push(...v.t);
  }
  /** Triángulo con la cara hacia `out` (si se da) o hacia sus normales. */
  tri(a, b, c, out = null) {
    const ab = [b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]], ac = [c.p[0] - a.p[0], c.p[1] - a.p[1], c.p[2] - a.p[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const o = out ?? [a.n[0] + b.n[0] + c.n[0], a.n[1] + b.n[1] + c.n[1], a.n[2] + b.n[2] + c.n[2]];
    const flip = n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0;
    for (const v of flip ? [a, c, b] : [a, b, c]) this.vert(v);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('fishTone', new THREE.Float32BufferAttribute(this.tone, 4));
    g.computeBoundingSphere();
    return g;
  }
}

const norm = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};
const FIN = (p, back = 0.5) => ({ p, n: [0, 1, 0], c: 0.95, t: [back, 0, 0, 1] });

function buildFish(level) {
  const D = DETAIL[level];
  const b = new FishBuilder();
  const S = D.sides, R = D.rings;
  // cuerpo: anillos elípticos de la nariz al pedúnculo
  const rings = [];
  for (let i = 1; i <= R; i++) {
    const u = i / (R + 1), x = xOf(u), h = halfH(u), w = halfW(u), cy = arch(u);
    const e = 1e-3, dhdx = (halfH(u + e) - halfH(u - e)) / (2 * e) / -(NOSE - PED);
    const ring = [];
    for (let k = 0; k < S; k++) {
      const th = (k / S) * TAU, cs = Math.cos(th), sn = Math.sin(th);
      ring.push({
        p: [x, cy + h * cs, w * sn],
        n: norm([-dhdx / Math.max(h, 1e-3), cs / h, sn / w]),
        c: 1 - 0.18 * Math.max(0, -cs),
        t: [smooth(-0.35, 0.45, cs), Math.exp(-((cs / 0.35) ** 2)) * bodyMid(u), smooth(0.12, 0.25, u) * (1 - smooth(0.8, 0.95, u)), 0],
      });
    }
    rings.push(ring);
  }
  const nose = { p: [NOSE, -0.005, 0], n: [1, 0, 0], c: 1, t: [0.5, 0, 0, 0] };
  const ped = { p: [PED, arch(1), 0], n: [-1, 0, 0], c: 0.95, t: [0.5, 0, 0, 0] };
  const center = (ring) => [ring[0].p[0], (ring[0].p[1] + ring[Math.floor(S / 2)].p[1]) / 2, 0];
  const outFrom = (c, ...vs) => vs.reduce((o, v) => [o[0] + v.p[0] - c[0], o[1] + v.p[1] - c[1], o[2] + v.p[2] - c[2]], [0, 0, 0]);
  for (let k = 0; k < S; k++) {
    const a = rings[0][k], c = rings[0][(k + 1) % S];
    b.tri(nose, a, c, outFrom(center(rings[0]), a, c));
  }
  for (let i = 0; i < R - 1; i++) {
    for (let k = 0; k < S; k++) {
      const a = rings[i][k], c = rings[i][(k + 1) % S], d = rings[i + 1][k], e = rings[i + 1][(k + 1) % S];
      b.tri(a, c, d, outFrom(center(rings[i]), a, c));
      b.tri(c, e, d, outFrom(center(rings[i + 1]), d, e));
    }
  }
  const last = rings[R - 1];
  for (let k = 0; k < S; k++) {
    const a = last[k], c = last[(k + 1) % S];
    b.tri(ped, a, c, outFrom(center(last), a, c));
  }
  // cola ahorquillada: dos lóbulos de 1, 2 o 3 triángulos
  const py = arch(1);
  const tip = (sgn) => FIN([TAIL, py + sgn * 0.15, 0]);
  const notch = FIN([TAIL + 0.08, py, 0]);
  const root = FIN([PED, py, 0]);
  for (const sgn of [1, -1]) {
    const T = tip(sgn), rootEdge = FIN([PED + 0.01, py + sgn * 0.03, 0]), mid = FIN([TAIL + 0.07, py + sgn * 0.11, 0]);
    if (D.caudal === 1) b.tri(root, T, notch);
    else if (D.caudal === 2) {
      b.tri(root, rootEdge, T);
      b.tri(root, T, notch);
    } else {
      b.tri(root, rootEdge, mid);
      b.tri(root, mid, T);
      b.tri(root, T, notch);
    }
  }
  // aleta dorsal sobre el lomo (u 0,3 a 0,62), con la punta echada hacia atrás
  const top = (u) => [xOf(u), arch(u) + halfH(u) - 0.004, 0];
  const dTop = (u, lift) => [xOf(u), arch(u) + halfH(u) + lift, 0];
  if (D.dorsal === 1) b.tri(FIN(top(0.3)), FIN(top(0.62)), FIN(dTop(0.48, 0.08)));
  else if (D.dorsal === 2) {
    b.tri(FIN(top(0.3)), FIN(top(0.46)), FIN(dTop(0.42, 0.085)));
    b.tri(FIN(top(0.46)), FIN(top(0.62)), FIN(dTop(0.42, 0.085)));
  } else {
    const b0 = FIN(top(0.28)), b1 = FIN(top(0.4)), b2 = FIN(top(0.52)), b3 = FIN(top(0.64));
    const t0 = FIN(dTop(0.36, 0.08)), t1 = FIN(dTop(0.5, 0.07));
    b.tri(b0, b1, t0);
    b.tri(b1, t1, t0);
    b.tri(b1, b2, t1);
    b.tri(b2, b3, t1);
  }
  // pectorales: bajo el costado, hacia atrás, abajo y afuera
  for (const side of [1, -1]) {
    const u = 0.24, x = xOf(u), y = arch(u) - 0.35 * halfH(u), z = side * halfW(u) * 0.9;
    const r0 = FIN([x + 0.02, y, z], 0.2), r1 = FIN([x - 0.04, y, z], 0.2), tp = FIN([x - 0.12, y - 0.035, z + side * 0.07], 0.2);
    if (D.pect === 1) b.tri(r0, r1, tp);
    else {
      const tq = FIN([x - 0.07, y - 0.045, z + side * 0.075], 0.2);
      b.tri(r0, tq, tp);
      b.tri(r0, tp, r1);
    }
  }
  // anal (Medio, Alto): bajo el vientre, cerca de la cola
  const bot = (u) => [xOf(u), arch(u) - halfH(u) + 0.004, 0];
  if (D.anal === 1) b.tri(FIN(bot(0.62), 0.1), FIN(bot(0.78), 0.1), FIN([xOf(0.74), arch(0.74) - halfH(0.74) - 0.05, 0], 0.1));
  else if (D.anal === 2) {
    const a0 = FIN(bot(0.6), 0.1), a1 = FIN(bot(0.7), 0.1), a2 = FIN(bot(0.8), 0.1), at = FIN([xOf(0.74), arch(0.74) - halfH(0.74) - 0.05, 0], 0.1);
    b.tri(a0, a1, at);
    b.tri(a1, a2, at);
  }
  // ojos: disco oscuro sobre la cabeza a cada lado (1, 4 o 6 triángulos)
  const ue = 0.13, ex = xOf(ue), ey = arch(ue) + 0.3 * halfH(ue), ez = halfW(ue) * Math.sqrt(1 - 0.09) + 0.004, er = 0.022;
  for (const side of [1, -1]) {
    const n = norm([0.15, 0.2, side]);
    const eye = (p, c = 0.04) => ({ p, n, c, t: [0, 0, 0, 0] });
    if (D.eye === 1) {
      b.tri(eye([ex + er, ey, side * ez]), eye([ex - er * 0.6, ey + er, side * ez]), eye([ex - er * 0.6, ey - er, side * ez]), [0, 0, side]);
    } else {
      const c = eye([ex, ey, side * (ez + 0.002)], 0.06);
      const pts = Array.from({ length: D.eye }, (_, i) => {
        const a = (i / D.eye) * TAU;
        return eye([ex + Math.cos(a) * er, ey + Math.sin(a) * er, side * ez]);
      });
      for (let i = 0; i < D.eye; i++) b.tri(c, pts[i], pts[(i + 1) % D.eye], [0, 0, side]);
    }
  }
  return b.geometry();
}

const GEOS = new Map();
/**
 * Geometría de un pez (cacheada; clónala por hoyo): cuerpo de largo 1 (nariz en +x, lomo en +y),
 * position, normal, color (oclusión; ojos casi negros) y fishTone (lomo, línea lateral, bandas,
 * aletas). Sin índice.
 */
export function fishGeometry(level) {
  level = treeLevel(level);
  if (!GEOS.has(level)) GEOS.set(level, buildFish(level));
  return GEOS.get(level);
}
export const fishTriangles = (level) => fishGeometry(level).attributes.position.count / 3;

// ---------- geometría de la salpicadura (unidad: radio 1, corona de alto 1) ----------

const SPLASH_DETAIL = {
  low: { rings: [[1, 12]], crown: 0, drops: 0 },
  medium: { rings: [[1, 12], [0.55, 10]], crown: 10, drops: 5 },
  high: { rings: [[1, 16], [0.55, 12]], crown: 14, drops: 12 },
};

function buildSplash(level) {
  const D = SPLASH_DETAIL[level];
  const pos = [], col = [];
  const v = (x, y, z, c) => {
    pos.push(x, y, z);
    col.push(c, c, c);
  };
  const quad = (a, b, c, d) => {
    // a-b abajo, c-d arriba (o dentro / fuera)
    v(...a.p, a.c);
    v(...b.p, b.c);
    v(...d.p, d.c);
    v(...a.p, a.c);
    v(...d.p, d.c);
    v(...c.p, c.c);
  };
  for (const [rm, segs] of D.rings) {
    const radii = [[rm * 0.82, 0], [rm * 0.93, 0.8], [rm * 1.06, 0]];
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * TAU, a1 = ((s + 1) / segs) * TAU;
      const at = (a, [r, c]) => ({ p: [Math.cos(a) * r, 0, Math.sin(a) * r], c });
      for (let q = 0; q < 2; q++) quad(at(a0, radii[q]), at(a1, radii[q]), at(a0, radii[q + 1]), at(a1, radii[q + 1]));
    }
  }
  for (let s = 0; s < D.crown; s++) {
    const a0 = (s / D.crown) * TAU, a1 = ((s + 1) / D.crown) * TAU;
    const at = (a, r, y, c) => ({ p: [Math.cos(a) * r, y, Math.sin(a) * r], c });
    quad(at(a0, 0.3, 0, 0.6), at(a1, 0.3, 0, 0.6), at(a0, 0.42, 1, 0), at(a1, 0.42, 1, 0));
  }
  for (let i = 0; i < D.drops; i++) {
    // gotas fijas (ángulo áureo): con la escala del anillo y la corona salen hacia fuera y arriba y caen
    const a = i * 2.39996, r = 0.3 + 0.35 * fract(i * 0.618 + 0.2), y = 0.45 + 0.5 * fract(i * 0.381 + 0.1);
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r, s = 0.045;
    const top = [cx, y + 0.07, cz];
    const bs = [0, 1, 2].map((k) => [cx + Math.cos(a + (k * TAU) / 3) * s, y - 0.05, cz + Math.sin(a + (k * TAU) / 3) * s]);
    for (let k = 0; k < 3; k++) {
      v(...bs[k], 0.9);
      v(...bs[(k + 1) % 3], 0.9);
      v(...top, 0.9);
    }
    v(...bs[0], 0.7);
    v(...bs[2], 0.7);
    v(...bs[1], 0.7);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

const SPLASH_GEOS = new Map();
/** Geometría de una salpicadura (cacheada; clónala por hoyo): anillos planos; corona y gotas en Medio/Alto. */
export function splashGeometry(level) {
  level = treeLevel(level);
  if (!SPLASH_GEOS.has(level)) SPLASH_GEOS.set(level, buildSplash(level));
  return SPLASH_GEOS.get(level);
}
export const splashTriangles = (level) => splashGeometry(level).attributes.position.count / 3;

// ---------- materiales (compartidos) ----------

let FISH_MAT = null;
/**
 * Lambert liso de dos caras con color de vértice, luz de borde y, en el sombreador: color por
 * instancia (lomo/vientre/acento con los pesos fishTone), bandas en el fragmento y coletazo
 * (onda lateral que crece hacia la cola, fishBendOffset). Uno para todos los peces.
 */
export function fishMaterial() {
  if (FISH_MAT) return FISH_MAT;
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide });
  withRim(m, 0.3, true);
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.call(m);
  const vCommon = [
    'attribute vec4 fishTone;',
    'attribute vec3 fishBack;',
    'attribute vec3 fishBelly;',
    'attribute vec3 fishAccent;',
    'attribute vec3 fishPat;',
    'attribute vec2 fishWag;',
    'varying float vFishX;',
    'varying float vFishBand;',
    'varying vec3 vFishAccent;',
  ].join('\n');
  const bend = [
    '{',
    '  float fishA = clamp(0.5 - position.x, 0.0, 1.0);',
    `  transformed.z += fishWag.y * fishA * fishA * sin(fishWag.x - fishA * ${f(FISH_BEND.k)});`,
    '}',
  ].join('\n');
  const color = [
    '#ifdef USE_COLOR',
    '  vColor.rgb *= mix(mix(fishBelly, fishBack, fishTone.x), fishAccent, clamp(fishPat.x * fishTone.y + fishPat.z * fishTone.w, 0.0, 1.0));',
    '#endif',
    '  vFishX = position.x;',
    '  vFishBand = fishPat.y * fishTone.z;',
    '  vFishAccent = fishAccent;',
  ].join('\n');
  const band = `  diffuseColor.rgb = mix(diffuseColor.rgb, vFishAccent, 0.85 * vFishBand * smoothstep(0.25, 0.75, sin(vFishX * ${f(BAND.freq)} + ${f(BAND.phase)})));`;
  m.onBeforeCompile = function (sh, renderer) {
    prev?.call(this, sh, renderer);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${vCommon}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${bend}`)
      .replace('#include <color_vertex>', `#include <color_vertex>\n${color}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFishX;\nvarying float vFishBand;\nvarying vec3 vFishAccent;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n${band}`);
  };
  m.customProgramCacheKey = () => `gcb-fish1|${prevKey}`;
  m.name = 'fish';
  FISH_MAT = m;
  return m;
}

let SPLASH_MAT = null;
/** Salpicadura: básico aditivo (blanco que se apaga hacia negro), sin escribir profundidad ni niebla. */
export function splashMaterial() {
  if (SPLASH_MAT) return SPLASH_MAT;
  SPLASH_MAT = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  SPLASH_MAT.name = 'fish-splash';
  return SPLASH_MAT;
}

// ---------- peces del hoyo ----------

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _q = new THREE.Quaternion();

/**
 * Peces del hoyo: plan (planFish) + una InstancedMesh de peces y otra de salpicaduras en un
 * grupo. opts: los de planFish más level (nombre, preset o lod) y auto (def. true: el grupo se
 * actualiza solo en cada render con el tiempo del viento). Devuelve { group, fishMesh,
 * splashMesh, plan, stats, update(t?, cam?), splashEvents(t0, t1) } o null si no hay peces.
 */
export function makeFish(opts) {
  const plan = planFish(opts);
  if (!plan.fish.length) return null;
  const level = treeLevel(opts.level);
  const n = plan.fish.length;
  const geo = fishGeometry(level).clone();
  const back = new Float32Array(n * 3), belly = new Float32Array(n * 3), accent = new Float32Array(n * 3), pat = new Float32Array(n * 3);
  plan.fish.forEach((F, i) => {
    const S = FISH_SPECIES[F.species];
    _c.set(S.back).multiplyScalar(F.tint).toArray(back, i * 3);
    _c.set(S.belly).toArray(belly, i * 3);
    _c.set(S.accent).toArray(accent, i * 3);
    pat.set(S.pat, i * 3);
  });
  // el lomo con su matiz por pez (tint), sin pasarse de 1
  for (let i = 0; i < back.length; i++) back[i] = Math.min(1, back[i]);
  geo.setAttribute('fishBack', new THREE.InstancedBufferAttribute(back, 3));
  geo.setAttribute('fishBelly', new THREE.InstancedBufferAttribute(belly, 3));
  geo.setAttribute('fishAccent', new THREE.InstancedBufferAttribute(accent, 3));
  geo.setAttribute('fishPat', new THREE.InstancedBufferAttribute(pat, 3));
  const wag = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
  wag.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('fishWag', wag);
  const fishMesh = new THREE.InstancedMesh(geo, fishMaterial(), n);
  fishMesh.name = 'fish';
  fishMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < n; i++) fishMesh.setMatrixAt(i, ZERO);
  const splashMesh = new THREE.InstancedMesh(splashGeometry(level).clone(), splashMaterial(), FISH_SPLASH.slots);
  splashMesh.name = 'fish-splash';
  splashMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < FISH_SPLASH.slots; i++) {
    splashMesh.setMatrixAt(i, ZERO);
    splashMesh.setColorAt(i, _c.setScalar(0));
  }
  splashMesh.renderOrder = 2; // después del agua (renderOrder -2/-1)
  for (const m of [fishMesh, splashMesh]) {
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false; // las instancias se mueven: la esfera de la malla no vale
    m.visible = false;
    m.userData.keep = true;
  }
  const group = new THREE.Group();
  group.name = 'fish';
  group.add(fishMesh, splashMesh);
  group.userData.keep = true;
  const stats = {
    level,
    fish: n,
    spots: plan.spots.length,
    species: plan.fish.map((F) => F.species),
    trianglesPerFish: fishTriangles(level),
    splashTriangles: splashTriangles(level),
    calls: FISH_MAX_CALLS,
    splashCalls: FISH_SPLASH_CALLS,
    fast: plan.fast,
    palette: plan.palette,
  };
  group.userData.fish = stats;

  // última cámara recibida: el gancho automático la reutiliza para no deshacer la ocultación por distancia
  let lastCam = null;
  function update(t = windUniforms.uWind.value.w, cam = null) {
    lastCam = cam ? { x: cam.x, y: cam.y, z: cam.z } : null;
    const pose = fishPoseAt(plan, t);
    const far = cam && pose ? Math.hypot(cam.x - pose.x, cam.y - pose.y, cam.z - pose.z) > FISH_FAR : false;
    for (let i = 0; i < n; i++) {
      if (pose && !far && i === pose.fish) {
        _m.compose(_v.set(pose.x, pose.y, pose.z), pose.quaternion, _s.set(...pose.scale));
        fishMesh.setMatrixAt(i, _m);
        wag.setXY(i, pose.wagPhase, pose.wagAmp);
      } else fishMesh.setMatrixAt(i, ZERO);
    }
    fishMesh.instanceMatrix.needsUpdate = true;
    wag.needsUpdate = true;
    fishMesh.visible = !!pose && !far;
    // salpicaduras vivas: las de la última FISH_SPLASH.life s, de la más nueva a la más vieja
    const tm = mod(t, WRAP);
    const live = far ? [] : fishSplashEvents(plan, mod(tm - FISH_SPLASH.life, WRAP), tm).reverse();
    let used = 0;
    const lift = splashLift(level);
    for (const e of live) {
      if (used >= FISH_SPLASH.slots) break;
      // sin pose (el pez ya volvió al agua) `far` no sabe la distancia: cada salpicadura se mira por su sitio
      if (cam && Math.hypot(cam.x - e.x, cam.y - e.y, cam.z - e.z) > FISH_FAR) continue;
      const st = splashState(mod(tm - e.t, WRAP), e.intensity);
      if (!st) continue;
      _m.compose(_v.set(e.x, e.y + lift, e.z), _q.identity(), _s.set(st.radius, Math.max(st.height, 1e-4), st.radius));
      splashMesh.setMatrixAt(used, _m);
      splashMesh.setColorAt(used, _c.setScalar(st.fade));
      used++;
    }
    for (let i = used; i < FISH_SPLASH.slots; i++) {
      splashMesh.setMatrixAt(i, ZERO);
      splashMesh.setColorAt(i, _c.setScalar(0));
    }
    splashMesh.instanceMatrix.needsUpdate = true;
    splashMesh.instanceColor.needsUpdate = true;
    splashMesh.visible = used > 0;
  }
  if (opts.auto !== false) {
    // el renderer llama a scene.updateMatrixWorld() en cada render: el pez se mueve sin que nadie
    // llame a update (la pose es una función pura del tiempo: llamarla de más no cambia nada)
    group.updateMatrixWorld = function (force) {
      update(undefined, lastCam);
      THREE.Object3D.prototype.updateMatrixWorld.call(this, force);
    };
  }
  update(0);
  return { group, fishMesh, splashMesh, plan, stats, update, splashEvents: (t0, t1) => fishSplashEvents(plan, t0, t1) };
}

/**
 * Como makeFish, añadiendo el grupo a `scene`. Devuelve { group, fishMesh, splashMesh, plan,
 * stats, update(t?, cam?), splashEvents(t0, t1), dispose() } o null si no hay peces. dispose
 * quita el grupo y libera las InstancedMesh y sus geometrías clonadas (no los materiales).
 */
export function addFish(scene, opts) {
  const f = makeFish(opts);
  if (!f) return null;
  scene.add(f.group);
  return {
    ...f,
    dispose() {
      scene.remove(f.group);
      for (const m of [f.fishMesh, f.splashMesh]) {
        m.geometry.dispose();
        m.dispose();
      }
    },
  };
}
