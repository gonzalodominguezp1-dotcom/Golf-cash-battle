import * as THREE from 'three';
import { LEVELS, TAU, lerp, smooth, treeLevel, vertexLambert, withRim } from './treeKit.js';
import { applyWind, windUniforms } from './wind.js';

// Agua del estilo liso (paso 8 de 02-DOCS/wiki/ftd/assets-entorno-1a1.md). Solo dibujo:
// la física del agua (zonas `water` de courses.js) no la ve nunca.
//
// - Superficie lisa: rejilla (lago) o cinta (río) plana con índice, sin facetas ni olas
//   en los vértices. El detalle lo da un mapa de normales que se desplaza.
// - Mapa de normales pintado en JS píxel a píxel (DataTexture 128 x 128, se genera y se
//   mide en node) a partir de olas con número de onda entero (se repite sin costura) y con
//   mipmaps propios que promedian la normal sin renormalizar: de lejos el agua se aplana
//   (sin chispas). El alfa lleva el ruido de la espuma (misma muestra, sin lectura extra).
// - Color: cuerpo del agua (del tema, más oscuro donde es hondo) + reflejo del color del
//   cielo según el ángulo (fresnel de Schlick) + brillo del sol (Blinn, la primera luz
//   direccional, la misma que usan los árboles para la luz de borde).
// - Espuma en la orilla según la distancia a la costa, SIN textura de profundidad: cada
//   vértice guarda la profundidad (nivel del agua - terreno) y la distancia a la orilla
//   (profundidad / pendiente del terreno en ese punto). Cerca de la orilla las dos son casi
//   lineales, así que interpoladas por el triángulo dan la franja bien aunque la rejilla sea
//   gruesa.
// - Río: cinta que sigue `river.along` con la u en metros aguas abajo y la dirección del
//   cauce en el vértice; el normal-map corre a lo largo de la cinta. Velocidad única en toda
//   la cinta: el desplazamiento no se cizalla con el tiempo.
// - Lago y río comparten material (uno por calidad y tema).
// - Tiempo: el del viento compartido (uWind.w, avanza con updateWind una vez por
//   fotograma). Los desplazamientos dan vueltas enteras en WATER_TIME_WRAP s: cuando el
//   tiempo del viento vuelve a 0 no hay salto.
// - Juncos y nenúfares: un material Lambert con color de vértice y el viento compartido
//   (capa grass, altura 1 m); el nenúfar flota y se mece entero (altura de viento fija).
//
// - Oleaje (más movimiento): desplazamiento vertical en el vértice con 1 (Medio) o 2 (Alto)
//   ondas largas, senos en el espacio del mundo con vueltas enteras por hora (sin salto al
//   reiniciar el viento). Amplitud de 2 a 3 cm; por vértice se atenúa hacia la orilla (la
//   profundidad manda: el agua nunca baja del terreno, la espuma no parpadea) y en el río
//   (menos oleaje en el centro, el mismo que el lago en el borde: la costura casa). Las
//   normales del sombreador llevan la derivada analítica del oleaje (más inclinación, para
//   que el brillo lo siga) y el brillo del sol se modula con la cresta (parpadeo suave,
//   frecuencia baja: sin aliasing). Bajo no tiene oleaje.
//
// - Ondas de salpicadura (peces): hasta WATER_RIPPLES.count[calidad] anillos (0 en Bajo, 4 Medio,
//   6 Alto) en un uniforme vec4[] (x, z, edad, intensidad) del MATERIAL (compartido: con lago y río
//   en el mismo hoyo los anillos sirven a todas las masas; aceptable, el anillo solo se ve donde
//   hay agua). Solo en el fragmento (normal + un toque de brillo en el frente; sin varyings ni
//   geometría nueva). La edad la calcula JS (setRipples, con vuelta de hora): el sombreador no
//   guarda estado. Sin desplazamiento vertical: sumarlo al oleaje rompería el margen de orilla
//   (margin 0,06 = 2 x 0,03 ya gastado).
//
// Móvil primero: Bajo sin normal-map (0 lecturas), Medio 1 lectura, Alto 3 lecturas de
// tamaños y sentidos distintos. Triángulos y llamadas por calidad en WATER_BUDGET /
// WATER_MAX_TRIS / WATER_MAX_CALLS. Sin rng en el agua; juncos y nenúfares gastan una
// tirada fija del rng que reciben (semilla de un rng propio), igual en las tres calidades.

// ---------- constantes ----------

/**
 * Presupuesto por calidad. lakeSeg: celdas por lado de la rejilla del lago (220 m, con el
 * mismo enfoque hacia el hoyo que el terreno si se pasa `warp`); riverStep: m entre cortes
 * de la cinta del río; riverCross: celdas a lo ancho; samples: lecturas del normal-map;
 * swell: ondas del oleaje (0 = sin oleaje).
 */
export const WATER_BUDGET = {
  low: { lakeSeg: 40, riverStep: 2, riverCross: 2, samples: 0, swell: 0 },
  medium: { lakeSeg: 64, riverStep: 1.25, riverCross: 4, samples: 1, swell: 1 },
  high: { lakeSeg: 80, riverStep: 0.8, riverCross: 6, samples: 3, swell: 2 },
};
const WATER_SIZE = 220; // el terreno del juego (environment.js)
/**
 * Tope de triángulos con la rejilla BASE (lakeSeg; rejilla entera + cinta de 220 m). Ojo: si el
 * entorno pasa `seg` (el del terreno) la rejilla es 2·seg² (hasta 19 208 en Medio no lush y
 * 64 800 en Alto lush), así que este tope solo vale sin `seg`; el máximo real por calidad sobre
 * los hoyos está medido en tests/water-env.test.js.
 */
export const WATER_MAX_TRIS = Object.fromEntries(
  LEVELS.map((l) => {
    const B = WATER_BUDGET[l];
    return [l, B.lakeSeg * B.lakeSeg * 2 + Math.ceil(WATER_SIZE / B.riverStep) * B.riverCross * 2];
  }),
);
/** Lago + río: dos mallas, una llamada cada una (sin sombras). */
export const WATER_MAX_CALLS = 2;
/** El tiempo del viento (uWind.w) vuelve a 0 cada hora (wind.js, TIME_WRAP). */
export const WATER_TIME_WRAP = 3600;
/** Orden de dibujo: el río (encima) antes que el lago; los dos antes que el resto de lo transparente. */
export const WATER_RENDER_ORDER = { river: -2, lake: -1 };
export const WATER_FRESNEL = { f0: 0.02, power: 5 };
/** Espuma: franja de `width` m desde la orilla; el ruido la rompe (soft = borde del corte). */
export const WATER_FOAM = { width: 0.9, soft: 0.18, lines: 7, lineCycles: 744 };
/** Orilla: dry = m sobre el agua a partir de los que un triángulo cuenta como seco; pendiente mínima y topes. */
export const WATER_SHORE = { dry: 0.25, minSlope: 0.08, maxDist: 6, minDepth: -2, maxDepth: 3, deep: 1.2, probe: 0.5 };
/** Río: velocidad (m/s, una para toda la cinta), orilla bajo el terreno (m más allá del agua) y altura sobre el lago. */
export const RIVER_FLOW = { speed: 0.64, bank: 1, lift: 0.01 };
/**
 * Muestras del normal-map: tile = m que ocupa la textura; cycles = vueltas enteras por
 * hora (deriva propia en x/y); flow = cuánto sigue al río. Vueltas enteras = sin salto.
 */
export const WATER_SAMPLES = [
  { tile: 6.4, cycles: [33, 14], flow: 1 },
  { tile: 2.4, cycles: [-47, 60], flow: 1.5 },
  { tile: 3.2, cycles: [-20, -75], flow: 1.25 },
];
/**
 * Oleaje: ondas largas y suaves en el espacio del mundo (x, z). len = longitud de onda (m),
 * dir = sentido (rad), amp = amplitud (m), cycles = vueltas ENTERAS por hora (sin salto al
 * volver el tiempo a 0). shade = cuánto se exagera la inclinación en las normales (el
 * desplazamiento es de centímetros, el brillo necesita más); spark = modulación del brillo del
 * sol con la cresta; riverK = oleaje del centro del río respecto al lago; riverEdge = tramo
 * (|l| / medio ancho) en que vuelve a valer 1; margin = profundidad (m) a la que el oleaje
 * llega entero (por debajo se atenúa lineal: nunca baja del terreno).
 */
export const WATER_SWELL = {
  waves: [
    { len: 17, dir: 0.5, amp: 0.02, cycles: 320, ph: 0 },
    { len: 9.5, dir: -0.9, amp: 0.01, cycles: 600, ph: 2.1 },
  ],
  shade: 8,
  spark: 0.35,
  riverK: 0.6,
  riverEdge: [0.55, 1],
  margin: 0.06,
};
/**
 * Ondas de salpicadura: count = anillos simultáneos por calidad; speed = m/s al nacer; tau = s
 * de frenado (r = speed*tau*(1-exp(-edad/tau))); life = s de vida; width = ancho del frente
 * (gaussiana, m); wavelength = longitud de onda dentro del frente (m); amp = amplitud (m) con
 * intensidad 1 a 0 m; shade = exageración de la pendiente en la normal; glint = brillo del frente.
 * Amplitud = intensidad * (1 - edad/life)^2 / (1 + r).
 */
export const WATER_RIPPLES = { count: { low: 0, medium: 4, high: 6 }, speed: 3.5, tau: 1.2, life: 2.5, width: 0.25, wavelength: 0.6, amp: 0.012, shade: 8, glint: 0.6 };
export const WATER_NORMAL_MAP = { size: 128, seed: 4242, waves: 18, slope: 0.32, foamWaves: 14 };
/** Luz del agua: transparencia somera/honda, fuerza de las normales y del brillo del sol por calidad. */
const LOOK = {
  alpha: [0.5, 0.9],
  strength: 0.75,
  spec: { low: [0.25, 60], medium: [0.6, 160], high: [0.6, 200] },
};

// orilla: juncos y nenúfares
/** Triángulos máx.: juncos = 8 hojas + 3 espadañas; nenúfar = hoja + flor (tope exacto por calidad). */
export const SHORE_BUDGET = { reeds: { low: 60, medium: 115, high: 146 }, pad: { low: 18, medium: 38, high: 54 } };
/** Juncos y nenúfares comparten material: tras bakeStatic, juncos (con sombra) y nenúfares (sin sombra). */
export const SHORE_MAX_CALLS = 2;
export const SHORE_RNG_DRAWS = 1;
export const REED_WIND = { layer: 'grass', height: 1 };
/** Altura de viento fija del nenúfar (m): se mece entero unos centímetros, sin doblarse. */
export const PAD_SWAY = 0.6;
const REED_MAX_BLADES = 8;
const REED_MAX_TAILS = 3; // espadañas por mata, como mucho
const REED_DRAWS = 3 + REED_MAX_BLADES * 7; // tiradas fijas del rng propio
const PAD_DRAWS = 8;
// hoja: 2*segs - 1 triángulos; espadaña: sides*bands*2 + sides
const REED_DETAIL = { low: { segs: 2, sides: 4, bands: 1 }, medium: { segs: 3, sides: 5, bands: 2 }, high: { segs: 4, sides: 6, bands: 2 } };
const PAD_DETAIL = { low: { segs: 8, petals: 5, layers: 1 }, medium: { segs: 14, petals: 6, layers: 2 }, high: { segs: 22, petals: 8, layers: 2 } };

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
const fract = (v) => v - Math.floor(v);
const hash = (x, z) => fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const f = (n) => {
  const s = Number(n).toString();
  return /[.e]/.test(s) ? s : s + '.0';
};

// ---------- matemática pura (espejo del sombreador) ----------

/** Fresnel de Schlick: reflejo según el coseno entre la normal y la vista (1 = mirando de frente). */
export function waterFresnel(cosTheta, f0 = WATER_FRESNEL.f0) {
  const c = clamp(cosTheta, 0, 1);
  return f0 + (1 - f0) * Math.pow(1 - c, WATER_FRESNEL.power);
}

/** Color del cielo en la dirección reflejada (altura ry): el mismo degradado que la cúpula del cielo. */
export function skyReflection(ry, top, horizon, out = new THREE.Color()) {
  return out.copy(horizon).lerp(top, Math.pow(clamp(ry, 0, 1), 0.55));
}

/** Distancia (m) a la orilla a partir de la profundidad y la pendiente del terreno; negativa en seco. */
export function shoreDistance(depth, slope) {
  return clamp(depth / Math.max(slope, WATER_SHORE.minSlope), -WATER_SHORE.maxDist, WATER_SHORE.maxDist);
}

/** Espuma (0..1) a `dist` m de la orilla con el ruido `noise` (0..1): llena en la orilla, rota hacia fuera, nada a `width`. */
export function waterFoam(dist, noise) {
  const { width, soft } = WATER_FOAM;
  const band = 1 - smooth(0, width, Math.max(0, dist));
  const cut = 1 - band;
  return band * smooth(cut - soft, cut + soft, noise);
}

/** Desplazamiento (en texturas, 0..1) de una muestra del normal-map en el tiempo t con el flujo `flow` (m/s). */
export function waterScroll(t, sample, flow = 0) {
  const ru = sample.cycles[0] / WATER_TIME_WRAP + (flow * sample.flow) / sample.tile;
  const rv = sample.cycles[1] / WATER_TIME_WRAP;
  return [fract(-t * ru), fract(-t * rv)];
}

/** Las ondas del oleaje de una calidad (ninguna en Bajo). */
export const swellWaves = (level) => WATER_SWELL.waves.slice(0, WATER_BUDGET[treeLevel(level)].swell);
const swellPhase = (w, x, z, t) => (TAU / w.len) * (Math.cos(w.dir) * x + Math.sin(w.dir) * z) - TAU * fract((t * w.cycles) / WATER_TIME_WRAP) + w.ph;

/** Altura (m) del oleaje en (x, z) del mundo en el tiempo t (espejo del vértice del sombreador). 0 en Bajo. */
export function waterSwell(x, z, t, level) {
  let h = 0;
  for (const w of swellWaves(level)) h += w.amp * Math.sin(swellPhase(w, x, z, t));
  return h;
}

/** Derivada analítica [dh/dx, dh/dz] del oleaje (la inclinación que ve el sombreador, sin exagerar). */
export function waterSwellSlope(x, z, t, level) {
  let dx = 0, dz = 0;
  for (const w of swellWaves(level)) {
    const c = w.amp * (TAU / w.len) * Math.cos(swellPhase(w, x, z, t));
    dx += c * Math.cos(w.dir);
    dz += c * Math.sin(w.dir);
  }
  return [dx, dz];
}

/** Amplitud máxima (m) del oleaje de una calidad. */
export const swellMaxAmp = (level) => swellWaves(level).reduce((s, w) => s + w.amp, 0);

/**
 * Escala (0..1) del oleaje en un vértice: lineal con la profundidad hasta `margin` (con
 * margin = 2 x la amplitud máxima, el agua baja como mucho la mitad de la profundidad: nunca
 * deja ver el terreno) y, en el río, menos oleaje en el centro (`across` = |l| / medio ancho;
 * sin él, lago = 1; en el borde del río vale lo mismo que el lago: la costura casa).
 */
export function swellVertexScale(depth, across = null) {
  const fade = clamp(depth / WATER_SWELL.margin, 0, 1);
  if (across === null) return fade;
  const [a, b] = WATER_SWELL.riverEdge;
  return fade * lerp(WATER_SWELL.riverK, 1, smooth(a, b, across));
}

const posMod = (v, m) => ((v % m) + m) % m;
/** Anillos simultáneos de una calidad (0 en Bajo). */
export const rippleCount = (level) => WATER_RIPPLES.count[treeLevel(level)];
/** Edad (s) en el tiempo `t` de un evento nacido en `te`, con la vuelta de la hora (tiempo del viento). */
export const rippleAge = (t, te) => posMod(t - te, WATER_TIME_WRAP);
/** Radio (m) del frente a esa edad: nace a `speed` m/s y frena. */
export const rippleRadius = (age) => WATER_RIPPLES.speed * WATER_RIPPLES.tau * (1 - Math.exp(-age / WATER_RIPPLES.tau));

/**
 * Anillo a `dist` m del centro con `age` s de edad e `intensity` (0..1): { h (altura, m), dh
 * (dh/d(dist), sin exagerar), glint (brillo del frente), r (radio), env (amplitud relativa) }.
 * Todo 0 fuera de la vida [0, life) o sin intensidad (espejo del sombreador).
 */
export function waterRipple(dist, age, intensity) {
  const R = WATER_RIPPLES;
  if (!(age >= 0 && age < R.life && intensity > 0)) return { h: 0, dh: 0, glint: 0, r: 0, env: 0 };
  const r = rippleRadius(age), x = dist - r, k = TAU / R.wavelength;
  const env = (intensity * (1 - age / R.life) ** 2) / (1 + r);
  const gs = Math.exp(-((x / R.width) ** 2));
  return {
    h: R.amp * env * gs * Math.cos(k * x),
    dh: R.amp * env * gs * (-k * Math.sin(k * x) - ((2 * x) / (R.width * R.width)) * Math.cos(k * x)),
    glint: env * gs,
    r,
    env,
  };
}

/** Suma de anillos en (x, z): filas [x, z, edad, intensidad] como el uniforme; devuelve { gx, gz (pendiente exagerada con shade), glint, h }. */
export function waterRippleField(x, z, rows) {
  let gx = 0, gz = 0, glint = 0, h = 0;
  for (const [ex, ez, age, inten] of rows) {
    const dx = x - ex, dz = z - ez, d = Math.hypot(dx, dz), o = waterRipple(d, age, inten);
    const q = (o.dh * WATER_RIPPLES.shade) / Math.max(d, 1e-3);
    gx += q * dx;
    gz += q * dz;
    glint += o.glint;
    h += o.h;
  }
  return { gx, gz, glint, h };
}

/**
 * Filas del uniforme (n de [x, z, edad, intensidad]) para los eventos de salpicadura (`{x, z, t,
 * intensity}`, t en tiempo del viento) en el tiempo `t`: los n más jóvenes vivos; el resto, ceros.
 */
export function rippleRows(events, t, n) {
  const live = [];
  for (const e of events ?? []) {
    if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.z) || !Number.isFinite(e.t)) continue; // NaN/Infinity: descartado
    const age = rippleAge(t, e.t);
    if (age < WATER_RIPPLES.life && e.intensity > 0) live.push([e.x, e.z, age, Math.min(1, e.intensity)]);
  }
  live.sort((a, b) => a[2] - b[2]);
  return Array.from({ length: n }, (_, i) => live[i] ?? [0, 0, 0, 0]);
}

/**
 * Pone los anillos de `events` en el material del agua (uniforme compartido por lago y río).
 * t = tiempo del viento (def. el actual). Devuelve cuántos anillos quedan vivos (0 en Bajo o sin
 * material de agua). Llamar una vez por fotograma. REEMPLAZA los anillos (no fusiona con los de la
 * llamada anterior ni con otros grupos): con varios grupos de peces, concatenar sus eventos y llamar
 * una sola vez. Los eventos con x, z o t no finitos se descartan.
 */
export function setWaterRipples(material, events, t = windUniforms.uWind.value.w) {
  const u = material?.uniforms?.uRipples;
  if (!u) return 0;
  const rows = rippleRows(events, t, u.value.length);
  rows.forEach((r, i) => u.value[i].set(r[0], r[1], r[2], r[3]));
  return rows.filter((r) => r[3] > 0).length;
}

/** Medio ancho de la cinta del río: el agua más un trozo que queda bajo la orilla. */
export const riverHalfWidth = (river) => river.w + RIVER_FLOW.bank;

// ---------- temas y paleta ----------

/** ¿Lleva este tema agua de la nueva? Neón, ciudad, lava y caldera no (siguen como estaban). */
export const waterSupported = (theme) => !!theme && !theme.neon && !theme.cyberCity && !theme.lava && !theme.caldera;

/**
 * Colores (lineales) del agua de un tema: cuerpo somero y hondo (el agua del tema, como hoy),
 * espuma y cielo. El cielo del juego se pinta sin tono ni espacio de color (environment.js):
 * se pasa una vez más a lineal para que, tras el tono del agua, el reflejo se parezca al cielo.
 */
export function waterPalette(theme) {
  const body = new THREE.Color(theme.water ?? (theme.sunIntensity < 2 ? 0x1b5f86 : 0x2bb3e6));
  const skyTop = new THREE.Color(theme.skyTop ?? 0x2f8fe3).convertSRGBToLinear();
  const skyHorizon = new THREE.Color(theme.skyHorizon ?? 0xcdeedd).convertSRGBToLinear();
  return {
    deep: body.clone().multiplyScalar(0.55),
    shallow: body.clone().lerp(new THREE.Color(0xffffff), 0.12),
    foam: new THREE.Color(0xf2f8fa),
    skyTop,
    skyHorizon,
  };
}

// ---------- mapa de normales ----------

/**
 * Datos del mapa de normales (RGBA8, lineal): rgb = normal (x a lo largo de u, y a lo largo
 * de v, z arriba) y alfa = ruido de la espuma. Olas con número de onda entero: se repite sin
 * costura. Siempre la misma (semilla fija, no depende de la calidad).
 */
export function waterNormalData() {
  const { size: N, seed, waves, slope, foamWaves } = WATER_NORMAL_MAP;
  const rng = mulberry32(seed);
  const wave = (kMin, kMax) => {
    const a = rng() * TAU, mag = lerp(kMin, kMax, rng());
    let kx = Math.round(Math.cos(a) * mag), ky = Math.round(Math.sin(a) * mag);
    if (!kx && !ky) kx = 1;
    return { kx, ky, amp: Math.pow(Math.hypot(kx, ky), -1.6) * (0.6 + 0.4 * rng()), ph: rng() * TAU };
  };
  const W = Array.from({ length: waves }, () => wave(1, 8));
  const Fw = Array.from({ length: foamWaves }, () => wave(3, 12));
  const gx = new Float32Array(N * N), gy = new Float32Array(N * N), fm = new Float32Array(N * N);
  let s2 = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, i = y * N + x;
      let dx = 0, dy = 0, h2 = 0;
      for (const w of W) {
        const c = Math.cos(TAU * (w.kx * u + w.ky * v) + w.ph) * w.amp * TAU;
        dx += c * w.kx;
        dy += c * w.ky;
      }
      for (const w of Fw) h2 += Math.sin(TAU * (w.kx * u + w.ky * v) + w.ph) * w.amp;
      gx[i] = dx;
      gy[i] = dy;
      fm[i] = h2;
      s2 += dx * dx + dy * dy;
    }
  }
  const k = slope / Math.sqrt(s2 / (N * N));
  let lo = Infinity, hi = -Infinity;
  for (const v of fm) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const nx = -gx[i] * k, ny = -gy[i] * k, l = Math.hypot(nx, ny, 1);
    data[i * 4] = Math.round((nx / l) * 127.5 + 127.5);
    data[i * 4 + 1] = Math.round((ny / l) * 127.5 + 127.5);
    data[i * 4 + 2] = Math.round((1 / l) * 127.5 + 127.5);
    // espuma con algo de contraste (manchas más definidas)
    const t = (fm[i] - lo) / (hi - lo);
    data[i * 4 + 3] = Math.round(255 * smooth(0.12, 0.88, t));
  }
  return { size: N, data };
}

/**
 * Mipmaps propios (incluye el nivel 0) hasta 1 x 1: media de la normal sin renormalizar
 * (de lejos la normal se acorta y el agua se aplana: sin chispas) y media del alfa.
 */
export function waterNormalMipmaps(data, size) {
  const mips = [{ data, width: size, height: size }];
  let src = Array.from(data, (b, i) => (i % 4 === 3 ? b / 255 : b / 127.5 - 1));
  for (let w = size; w > 1; ) {
    const nw = w >> 1;
    const out = new Float32Array(nw * nw * 4);
    for (let y = 0; y < nw; y++) {
      for (let x = 0; x < nw; x++) {
        for (let c = 0; c < 4; c++) {
          const at = (xx, yy) => src[(yy * w + xx) * 4 + c];
          out[(y * nw + x) * 4 + c] = (at(2 * x, 2 * y) + at(2 * x + 1, 2 * y) + at(2 * x, 2 * y + 1) + at(2 * x + 1, 2 * y + 1)) / 4;
        }
      }
    }
    const bytes = new Uint8Array(nw * nw * 4);
    for (let i = 0; i < out.length; i++) bytes[i] = Math.round(i % 4 === 3 ? out[i] * 255 : clamp(out[i], -1, 1) * 127.5 + 127.5);
    mips.push({ data: bytes, width: nw, height: nw });
    src = out;
    w = nw;
  }
  return mips;
}

let NORMAL_MAP = null;
/** El mapa de normales (uno, compartido). */
export function waterNormalMap() {
  if (NORMAL_MAP) return NORMAL_MAP;
  const { size, data } = waterNormalData();
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = waterNormalMipmaps(data, size);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 2;
  tex.name = 'water-normals';
  tex.needsUpdate = true;
  NORMAL_MAP = tex;
  return tex;
}

// ---------- sombreador ----------

/** Sombreador del agua de una calidad (texto GLSL): Bajo sin normal-map, Medio 1 lectura, Alto 3. */
export function waterShaderSource(level) {
  level = treeLevel(level);
  const n = WATER_BUDGET[level].samples;
  const S = WATER_SAMPLES.slice(0, n);
  const [specK, shin] = LOOK.spec[level];
  const { width: FW, soft: FS, lines, lineCycles } = WATER_FOAM;
  const rate = (s) => [`(${f(s.cycles[0] / WATER_TIME_WRAP)} + waterFlow.z * ${f(s.flow / s.tile)})`, f(s.cycles[1] / WATER_TIME_WRAP)];
  const names = ['A', 'B', 'C'];
  const W = swellWaves(level);
  const RN = rippleCount(level);
  const sumA = W.reduce((s, w) => s + w.amp, 0);
  const vertexShader = [
    '#include <common>',
    '#include <fog_pars_vertex>',
    'attribute vec2 waterUv;',
    'attribute vec3 waterFlow;',
    'attribute vec2 waterShore;',
    'uniform vec4 uWind;',
    ...(W.length ? ['attribute float waterSwell;', 'varying vec3 vSwell;'] : []),
    'varying vec3 vWorld;',
    'varying vec2 vShore;',
    'varying vec2 vDir;',
    ...S.map((_, i) => `varying vec2 vUv${names[i]};`),
    'void main() {',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  float t = uWind.w;',
    ...(W.length
      ? [
          // oleaje: senos en el mundo, vueltas enteras por hora; waterSwell = escala por vértice (orilla, río)
          '  float swH = 0.0, swC = 0.0;',
          '  vec2 swG = vec2(0.0);',
          ...W.map((w) => {
            const k = TAU / w.len, dx = Math.cos(w.dir), dz = Math.sin(w.dir);
            return `  { float p = ${f(k)} * dot(wp.xz, vec2(${f(dx)}, ${f(dz)})) - PI2 * fract(t * ${f(w.cycles / WATER_TIME_WRAP)}) + ${f(w.ph)}; float s = sin(p); swH += ${f(w.amp)} * s; swC += ${f(w.amp / sumA)} * s; swG += ${f(w.amp * k)} * cos(p) * vec2(${f(dx)}, ${f(dz)}); }`;
          }),
          '  wp.y += swH * waterSwell;',
          `  vSwell = vec3(swG * ${f(WATER_SWELL.shade)} * waterSwell, swC * waterSwell);`,
        ]
      : []),
    '  vWorld = wp.xyz;',
    '  vShore = waterShore;',
    '  vDir = waterFlow.xy;',
    // la velocidad es la misma en toda la malla: fract() da lo mismo en todos sus vértices
    ...S.map((s, i) => {
      const [ru, rv] = rate(s);
      return `  vUv${names[i]} = waterUv * ${f(1 / s.tile)} - fract(t * vec2(${ru}, ${rv}));`;
    }),
    '  vec4 mvPosition = viewMatrix * wp;',
    '  gl_Position = projectionMatrix * mvPosition;',
    '  #include <fog_vertex>',
    '}',
  ].join('\n');
  const fragmentShader = [
    '#include <common>',
    '#include <fog_pars_fragment>',
    '#include <lights_pars_begin>',
    n ? 'uniform sampler2D uNormalMap;' : '',
    'uniform vec3 uDeep;',
    'uniform vec3 uShallow;',
    'uniform vec3 uFoam;',
    'uniform vec3 uSkyTop;',
    'uniform vec3 uSkyHorizon;',
    'uniform vec4 uWind;',
    ...(RN ? [`uniform vec4 uRipples[${RN}];`] : []),
    ...(W.length ? ['varying vec3 vSwell;'] : []),
    'varying vec3 vWorld;',
    'varying vec2 vShore;',
    'varying vec2 vDir;',
    ...S.map((_, i) => `varying vec2 vUv${names[i]};`),
    `float gcbFresnel(float c) { return ${f(WATER_FRESNEL.f0)} + ${f(1 - WATER_FRESNEL.f0)} * pow(1.0 - c, ${f(WATER_FRESNEL.power)}); }`,
    'void main() {',
    '  vec3 V = normalize(cameraPosition - vWorld);',
    '  vec3 N = vec3(0.0, 1.0, 0.0);',
    ...(n === 0
      ? // Bajo: sin textura; la espuma se rompe con líneas que llegan a la orilla
        [`  float noise = 0.5 + 0.5 * sin(vShore.y * ${f(lines)} + uWind.w * ${f((TAU * lineCycles) / WATER_TIME_WRAP)});`]
      : [
          '  vec4 sa = texture2D(uNormalMap, vUvA);',
          // n lecturas: media de las normales ((suma xy) - n/2) y media del ruido
          ...(n > 1
            ? [
                ...S.slice(1).map((_, i) => `  vec4 s${'bc'[i]} = texture2D(uNormalMap, vUv${names[i + 1]});`),
                `  vec2 d = (${S.map((_, i) => `s${'abc'[i]}.xy`).join(' + ')}) - ${f(n / 2)};`,
                `  float noise = ${f(1 / n)} * (${S.map((_, i) => `s${'abc'[i]}.w`).join(' + ')});`,
              ]
            : ['  vec2 d = sa.xy * 2.0 - 1.0;', '  float noise = sa.w;']),
          // más viento, agua más picada
          `  d *= ${f(LOOK.strength)} * (0.7 + 0.3 * uWind.z);`,
          // la u de la textura va a lo largo de vDir (la corriente); la v, a su izquierda
          '  vec2 T = normalize(vDir + vec2(1e-5, 0.0));',
          '  vec2 g = T * d.x + vec2(-T.y, T.x) * d.y;',
          // el oleaje inclina la normal con su derivada analítica (vSwell.xy ya va exagerada y escalada)
          W.length ? '  N = normalize(vec3(g.x - vSwell.x, 1.0, g.y - vSwell.y));' : '  N = normalize(vec3(g.x, 1.0, g.y));',
        ]),
    ...(RN
      ? [
          // ondas de salpicadura: filas (x, z, edad, intensidad); frente gaussiano que se expande y frena
          '  vec2 rg = vec2(0.0);',
          '  float rGlint = 0.0;',
          `  for (int i = 0; i < ${RN}; i++) {`,
          '    vec4 e = uRipples[i];',
          '    if (e.w > 0.0) {',
          '      vec2 dv = vWorld.xz - e.xy;',
          '      float d = length(dv);',
          `      float r = ${f(WATER_RIPPLES.speed * WATER_RIPPLES.tau)} * (1.0 - exp(-e.z * ${f(1 / WATER_RIPPLES.tau)}));`,
          '      float x = d - r;',
          `      float k = saturate(1.0 - e.z * ${f(1 / WATER_RIPPLES.life)});`,
          '      float env = e.w * k * k / (1.0 + r);',
          `      float gs = exp(-x * x * ${f(1 / WATER_RIPPLES.width ** 2)});`,
          `      float ph = x * ${f(TAU / WATER_RIPPLES.wavelength)};`,
          `      float dh = ${f(WATER_RIPPLES.amp * WATER_RIPPLES.shade)} * env * gs * (-${f(TAU / WATER_RIPPLES.wavelength)} * sin(ph) - ${f(2 / WATER_RIPPLES.width ** 2)} * x * cos(ph));`,
          '      rg += dh * dv / max(d, 0.001);',
          '      rGlint += env * gs;',
          '    }',
          '  }',
          '  N = normalize(vec3(N.x - rg.x * N.y, N.y, N.z - rg.y * N.y));',
        ]
      : []),
    '  float cosV = saturate(dot(N, V));',
    '  float F = gcbFresnel(cosV);',
    '  vec3 R = reflect(-V, N);',
    '  vec3 sky = mix(uSkyHorizon, uSkyTop, pow(saturate(R.y), 0.55));',
    `  float deepK = smoothstep(0.0, ${f(WATER_SHORE.deep)}, vShore.x);`,
    '  vec3 body = mix(uShallow, uDeep, deepK);',
    // luz como el Lambert de la escena: ambiente + cielo/suelo + sol (primera luz direccional)
    '  vec3 irr = ambientLightColor;',
    '  vec3 sunCol = vec3(0.0);',
    '  vec3 L = vec3(0.0, 1.0, 0.0);',
    '#if NUM_HEMI_LIGHTS > 0',
    '  irr += getHemisphereLightIrradiance(hemisphereLights[0], (viewMatrix * vec4(N, 0.0)).xyz);',
    '#endif',
    '#if NUM_DIR_LIGHTS > 0',
    '  sunCol = directionalLights[0].color;',
    '  L = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);',
    '#endif',
    '  vec3 col = body * RECIPROCAL_PI * (irr + sunCol * saturate(dot(N, L)));',
    '  col = mix(col, sky, F);',
    '  vec3 H = normalize(L + V);',
    // el brillo sigue la cresta del oleaje: parpadeo suave (frecuencia baja, sin aliasing)
    `  col += sunCol * (${f(specK)} * pow(saturate(dot(N, H)), ${f(shin)})${W.length ? ` * (1.0 + ${f(WATER_SWELL.spark)} * vSwell.z)` : ''});`,
    // espuma (waterFoam): franja desde la orilla rota por el ruido
    `  float band = 1.0 - smoothstep(0.0, ${f(FW)}, max(vShore.y, 0.0));`,
    `  float foam = band * smoothstep(1.0 - band - ${f(FS)}, 1.0 - band + ${f(FS)}, noise);`,
    '  vec3 foamCol = uFoam * RECIPROCAL_PI * (irr + sunCol * saturate(L.y));',
    '  col = mix(col, foamCol, foam);',
    ...(RN ? [`  float ripK = saturate(rGlint * ${f(WATER_RIPPLES.glint)});`, '  col = mix(col, foamCol, ripK);'] : []),
    `  float alpha = mix(${f(LOOK.alpha[0])}, ${f(LOOK.alpha[1])}, deepK);`,
    `  alpha += (1.0 - alpha) * max(F, ${RN ? 'max(foam, ripK)' : 'foam'});`,
    '  gl_FragColor = vec4(col, alpha);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '  #include <fog_fragment>',
    '}',
  ]
    .filter((l) => l !== '')
    .join('\n');
  return { vertexShader, fragmentShader };
}

const materials = new Map();
const paletteKey = (theme) => [theme.water, theme.sunIntensity < 2 ? 1 : 0, theme.skyTop, theme.skyHorizon].join(':');

/**
 * Material del agua (lago y río), uno por calidad y paleta, compartido. Transparente y
 * escribiendo profundidad (lo que queda debajo del agua no se mezcla dos veces), con luces
 * y niebla de la escena. null si el tema no lleva agua nueva.
 */
export function waterMaterial(level, theme) {
  if (!waterSupported(theme)) return null;
  level = treeLevel(level);
  const key = `${level}|${paletteKey(theme)}`;
  if (materials.has(key)) return materials.get(key);
  const pal = waterPalette(theme);
  const { vertexShader, fragmentShader } = waterShaderSource(level);
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.lights,
    THREE.UniformsLib.fog,
    {
      uDeep: { value: pal.deep },
      uShallow: { value: pal.shallow },
      uFoam: { value: pal.foam },
      uSkyTop: { value: pal.skyTop },
      uSkyHorizon: { value: pal.skyHorizon },
    },
  ]);
  // compartidos por referencia (merge clona)
  uniforms.uWind = windUniforms.uWind;
  if (WATER_BUDGET[level].samples) uniforms.uNormalMap = { value: waterNormalMap() };
  if (rippleCount(level)) uniforms.uRipples = { value: Array.from({ length: rippleCount(level) }, () => new THREE.Vector4(0, 0, 0, 0)) };
  const m = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, lights: true, fog: true, transparent: true, depthWrite: true });
  m.name = `water-${level}`;
  materials.set(key, m);
  return m;
}

// ---------- geometría ----------

const DEFAULT_THEME = { water: 0x2bb3e6, sunIntensity: 2.6, skyTop: 0x2f8fe3, skyHorizon: 0xcdeedd };

/** Profundidad y distancia a la orilla del punto (x, z) con el agua a `y`. */
function shoreAt(heightAt, y, x, z, h = heightAt(x, z)) {
  const e = WATER_SHORE.probe;
  const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e), gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  const depth = y - h;
  return [clamp(depth, WATER_SHORE.minDepth, WATER_SHORE.maxDepth), shoreDistance(depth, Math.hypot(gx, gz))];
}

/** Triángulo hacia arriba (visto desde el cielo, en sentido antihorario). */
function upTri(pos, idx, a, b, c) {
  const ax = pos[a * 3], az = pos[a * 3 + 2];
  const ny = (pos[b * 3 + 2] - az) * (pos[c * 3] - ax) - (pos[b * 3] - ax) * (pos[c * 3 + 2] - az);
  if (ny >= 0) idx.push(a, b, c);
  else idx.push(a, c, b);
}

function waterMesh(name, { pos, uv, flow, shore, swell, idx }, at, material, order) {
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('waterUv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('waterFlow', new THREE.Float32BufferAttribute(flow, 3));
  g.setAttribute('waterShore', new THREE.Float32BufferAttribute(shore, 2));
  g.setAttribute('waterSwell', new THREE.Float32BufferAttribute(swell, 1));
  g.setIndex(idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.name = name;
  m.position.copy(at);
  m.renderOrder = order;
  m.castShadow = false;
  m.receiveShadow = false;
  // bakeStatic no lo junta con el decorado (otro material, otros atributos, se mueve)
  m.userData.keep = true;
  m.updateMatrixWorld(true);
  return m;
}

/** Eje del río a partir de river.along: dirección (a lo largo de z o de x) y centro. */
function riverAxis(river) {
  const p0 = river.along(0, 0), p1 = river.along(1, 0);
  const alongZ = Math.abs(p1[1] - p0[1]) > Math.abs(p1[0] - p0[0]);
  return { alongZ, c: alongZ ? p0[1] : p0[0] };
}

/**
 * Lago: rejilla plana de `size` m al nivel `y` con solo los triángulos con agua.
 * opts: { size = 220, center = [0, 0], y, heightAt(x, z), level, theme, material?,
 *   warp?(u, half) (el enfoque del terreno: warpCoord de flora.js), river? (el río:
 *   lo que cubre su cinta no se dibuja dos veces), seg? (celdas por lado; def. el lakeSeg de la calidad: el
 *   juego pasa las del terreno para que la rejilla del agua y la de la tierra coincidan) }. null si no hay agua.
 */
export function makeLake({ size = WATER_SIZE, center = [0, 0], y, heightAt, level, theme = DEFAULT_THEME, material, warp = null, river = null, seg = null }) {
  level = treeLevel(level);
  const mat = material ?? waterMaterial(level, theme);
  if (!mat) return null;
  const n = seg > 0 ? Math.round(seg) : WATER_BUDGET[level].lakeSeg, half = size / 2, [cx, cz] = center, W1 = n + 1;
  const pos = [], uv = [], flow = [], shore = [], swell = [], wet = [], inBand = [], hs = [];
  const band = river ? riverHalfWidth(river) : 0;
  const coord = (i) => (warp ? warp(-1 + (2 * i) / n, half) : -half + (size * i) / n);
  for (let iz = 0; iz <= n; iz++) {
    for (let ix = 0; ix <= n; ix++) {
      const lx = coord(ix), lz = coord(iz), x = cx + lx, z = cz + lz;
      // una sola lectura de altura por vértice; la orilla (4 lecturas más) solo donde se dibuja algún triángulo
      const h = heightAt(x, z), depth = clamp(y - h, WATER_SHORE.minDepth, WATER_SHORE.maxDepth);
      pos.push(lx, 0, lz);
      uv.push(lx, lz);
      flow.push(1, 0, 0);
      hs.push(h);
      shore.push(depth, 0);
      swell.push(swellVertexScale(depth));
      wet.push(y - h >= -WATER_SHORE.dry);
      inBand.push(river ? river.dist(x, z) < band : false);
    }
  }
  const used = new Uint8Array(wet.length);
  const idx = [];
  // un triángulo se dibuja si alguna esquina tiene agua que no cubre ya la cinta del río
  // (en el borde de la cinta el terreno está por encima del agua: lo que sobresale queda tapado)
  const open = (v) => wet[v] && !inBand[v];
  const keep = (a, b, c) => open(a) || open(b) || open(c);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      // mismo reparto en triángulos que el PlaneGeometry del terreno
      const a = ix + W1 * iz, b = ix + W1 * (iz + 1), c = ix + 1 + W1 * (iz + 1), d = ix + 1 + W1 * iz;
      if (keep(a, b, d)) (upTri(pos, idx, a, b, d), (used[a] = used[b] = used[d] = 1));
      if (keep(b, c, d)) (upTri(pos, idx, b, c, d), (used[b] = used[c] = used[d] = 1));
    }
  }
  for (let v = 0; v < used.length; v++) {
    if (!used[v]) continue;
    const ix = v % W1, iz = (v - ix) / W1;
    const [depth, dist] = shoreAt(heightAt, y, cx + coord(ix), cz + coord(iz), hs[v]);
    shore[v * 2] = depth;
    shore[v * 2 + 1] = dist;
    swell[v] = swellVertexScale(depth);
  }
  return waterMesh('water-lake', { pos, uv, flow, shore, swell, idx }, new THREE.Vector3(cx, y, cz), mat, WATER_RENDER_ORDER.lake);
}

/**
 * Río: cinta que sigue el cauce (`river.along`) a lo largo del cuadrado de `size` m (o de
 * `range` = [t0, t1] en la coordenada de river.along), con medio ancho riverHalfWidth.
 * opts: { river, heightAt, level, theme, material?, size = 220, center = [0, 0], range? }.
 */
export function makeRiverWater({ river, heightAt, level, theme = DEFAULT_THEME, material, size = WATER_SIZE, center = [0, 0], range = null }) {
  level = treeLevel(level);
  const mat = material ?? waterMaterial(level, theme);
  if (!mat || !river) return null;
  const { riverStep, riverCross: C } = WATER_BUDGET[level];
  const { alongZ, c } = riverAxis(river);
  const [t0, t1] = range ?? [(alongZ ? center[1] : center[0]) - size / 2 - c, (alongZ ? center[1] : center[0]) + size / 2 - c];
  const steps = Math.max(1, Math.ceil((t1 - t0) / riverStep));
  const W = riverHalfWidth(river), y = river.y;
  const mid = river.along((t0 + t1) / 2, 0);
  const pos = [], uv = [], flow = [], shore = [], swell = [], wet = [];
  let s = 0, prev = null;
  for (let i = 0; i <= steps; i++) {
    const t = lerp(t0, t1, i / steps);
    const p = river.along(t, 0), a = river.along(t - 0.5, 0), b = river.along(t + 0.5, 0);
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz);
    tx /= tl;
    tz /= tl;
    if (prev) s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
    for (let j = 0; j <= C; j++) {
      const l = -W + (2 * W * j) / C;
      const x = p[0] - tz * l, z = p[1] + tx * l;
      const [depth, dist] = shoreAt(heightAt, y, x, z);
      pos.push(x - mid[0], 0, z - mid[1]);
      uv.push(s, l);
      flow.push(tx, tz, RIVER_FLOW.speed);
      shore.push(depth, dist);
      swell.push(swellVertexScale(depth, Math.abs(l) / W));
      wet.push(depth >= -WATER_SHORE.dry);
    }
  }
  // la u, centrada (números pequeños en el sombreador)
  const s0 = s / 2;
  for (let i = 0; i < uv.length; i += 2) uv[i] -= s0;
  const idx = [];
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < C; j++) {
      const a = i * (C + 1) + j, b = (i + 1) * (C + 1) + j, cc = (i + 1) * (C + 1) + j + 1, d = i * (C + 1) + j + 1;
      if (wet[a] || wet[b] || wet[d]) upTri(pos, idx, a, b, d);
      if (wet[b] || wet[cc] || wet[d]) upTri(pos, idx, b, cc, d);
    }
  }
  return waterMesh('water-river', { pos, uv, flow, shore, swell, idx }, new THREE.Vector3(mid[0], y + RIVER_FLOW.lift, mid[1]), mat, WATER_RENDER_ORDER.river);
}

/** makeLake (kind 'lake') o makeRiverWater (kind 'river'). */
export function makeWater({ kind, ...opts } = {}) {
  if (kind === 'lake') return makeLake(opts);
  if (kind === 'river') return makeRiverWater(opts);
  throw new Error(`agua: tipo desconocido (${kind})`);
}

/**
 * Agua del hoyo: lago (lo que queda bajo `y`) y río (si hay), con un material compartido,
 * en un grupo añadido a `scene`. opts: { size, center, y, heightAt, river?, level, theme, warp? }.
 * Devuelve { group, lake, river, meshes, material, stats, update(cam), setRipples(events, t?), dispose() } o null si el
 * tema no lleva agua nueva (neón, ciudad, lava, caldera) o no hay agua.
 */
export function addWater(scene, { size = WATER_SIZE, center = [0, 0], y, heightAt, river = null, level, theme, warp = null, seg = null }) {
  if (!waterSupported(theme)) return null;
  level = treeLevel(level);
  const material = waterMaterial(level, theme);
  const riverMesh = river ? makeRiverWater({ river, heightAt, level, theme, material, size, center }) : null;
  const lake = makeLake({ size, center, y, heightAt, level, theme, material, warp, seg, river: riverMesh ? river : null });
  const meshes = [riverMesh, lake].filter(Boolean);
  if (!meshes.length) return null;
  const group = new THREE.Group();
  group.name = 'water';
  group.add(...meshes);
  scene.add(group);
  const count = (m) => (m ? m.geometry.index.count / 3 : 0);
  const stats = { level, triangles: count(lake) + count(riverMesh), calls: meshes.length, lake: count(lake), river: count(riverMesh) };
  return {
    group,
    lake,
    river: riverMesh,
    meshes,
    material,
    stats,
    /**
     * Ondas de salpicadura: events = eventos de fish.splashEvents ({x, z, t, intensity}); t = tiempo del
     * viento (def. el actual). Llamar cada fotograma. Devuelve los anillos vivos (0 en Bajo).
     */
    setRipples: (events, t) => setWaterRipples(material, events, t),
    /** Nada que hacer: el tiempo es el del viento (updateWind, una vez por fotograma). Se deja por simetría con césped y flores. */
    update() {},
    /** Quita el agua de la escena y libera sus geometrías; material y normal-map son compartidos y no se tocan. */
    dispose() {
      scene.remove(group);
      for (const m of meshes) m.geometry.dispose();
    },
  };
}

// ---------- orilla: juncos y nenúfares ----------

let SHORE_MAT = null;
/** Material de juncos y nenúfares (uno, compartido): Lambert liso con color de vértice, dos caras, luz de borde y viento (capa grass, 1 m). */
export function shoreMaterial() {
  if (SHORE_MAT) return SHORE_MAT;
  const m = withRim(vertexLambert({ side: THREE.DoubleSide }), 0.25, true);
  SHORE_MAT = applyWind(m, { layer: REED_WIND.layer, height: REED_WIND.height });
  return SHORE_MAT;
}

const C_REED = [new THREE.Color(0x4f6f2a), new THREE.Color(0x8aa64a)];
const C_TAIL = new THREE.Color(0x6b4423);
const C_PAD = [new THREE.Color(0x2f7f34), new THREE.Color(0x5fae4a)];
const C_LOTUS = [new THREE.Color(0xffb6d5), new THREE.Color(0xfff4f8)];

function geometryOf({ pos, nor, col, ph, sway }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (ph) g.setAttribute('windPhase', new THREE.Float32BufferAttribute(ph, 2));
  if (sway) g.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Juncos con espadañas en la orilla (sustituto de flora.makeReeds): 5-8 hojas largas que
 * se estrechan y se curvan, algunas con espadaña. Una malla con el material compartido; el
 * viento dobla cada hoja con su propia fase (la espadaña va con su hoja). Gasta una tirada
 * de `rng`; la forma es la misma en las tres calidades (solo cambia la subdivisión).
 * opts: { level }.
 */
export function makeReeds(rng, x, y, z, opts = {}) {
  const level = treeLevel(opts.level ?? opts);
  const r = mulberry32(Math.floor(rng() * 4294967296));
  const draws = Array.from({ length: REED_DRAWS }, r);
  let k = 0;
  const next = () => draws[k++];
  const count = 5 + Math.floor(next() * 4);
  const spin = next() * TAU, spread = 0.12 + next() * 0.14;
  const blades = [];
  let tails = 0;
  for (let b = 0; b < REED_MAX_BLADES; b++) {
    const v = [next(), next(), next(), next(), next(), next(), next()];
    if (b >= count) continue;
    const a = spin + (b / count) * TAU + (v[0] - 0.5) * 0.9;
    blades.push({
      bx: +(Math.cos(a) * spread * v[1]).toFixed(5),
      bz: +(Math.sin(a) * spread * v[1]).toFixed(5),
      h: +(0.55 + v[2] * 0.5).toFixed(5),
      lean: +(0.08 + v[3] * 0.22).toFixed(5),
      dir: +(a + (v[4] - 0.5) * 0.8).toFixed(5),
      width: +(0.018 + v[5] * 0.012).toFixed(5),
      tail: v[6] < 0.45 && tails < REED_MAX_TAILS,
    });
    if (blades[blades.length - 1].tail) tails++;
  }
  const { segs, sides, bands } = REED_DETAIL[level];
  const pos = [], nor = [], col = [], ph = [];
  const p0 = hash(x, z) * TAU;
  const c = new THREE.Color(), n = new THREE.Vector3();
  const vert = (px, py, pz, nn, cc, p1) => {
    pos.push(px, py, pz);
    nor.push(nn.x, nn.y, nn.z);
    col.push(cc.r, cc.g, cc.b);
    ph.push(p0, p1);
  };
  blades.forEach((B, bi) => {
    const p1 = hash(x + bi * 0.731 + 0.37, z + bi * 0.519 - 0.21) * TAU;
    const dx = Math.cos(B.dir), dz = Math.sin(B.dir);
    const wx = -dz, wz = dx;
    // la normal mira hacia fuera y arriba (las dos caras con la misma luz)
    n.set(dx * 0.5, 0.85, dz * 0.5).normalize();
    const at = (t) => {
      const R = B.lean * t * t;
      return [B.bx + dx * R, B.h * t, B.bz + dz * R];
    };
    const ring = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, [px, py, pz] = at(t), w = s === segs ? 0 : B.width * (1 - 0.75 * t);
      c.copy(C_REED[0]).lerp(C_REED[1], Math.pow(t, 0.8));
      ring.push([[px - wx * w, py, pz - wz * w], [px + wx * w, py, pz + wz * w], c.clone()]);
    }
    for (let s = 0; s < segs; s++) {
      const [l0, r0, c0] = ring[s], [l1, r1, c1] = ring[s + 1];
      vert(...l0, n, c0, p1);
      vert(...r0, n, c0, p1);
      vert(...r1, n, c1, p1);
      if (s < segs - 1) {
        vert(...l0, n, c0, p1);
        vert(...r1, n, c1, p1);
        vert(...l1, n, c1, p1);
      }
    }
    if (B.tail) {
      // espadaña: huso marrón a 3/4 de la hoja, con la misma fase (se mueve con ella)
      const [qx, qy, qz] = at(0.78), len = 0.14, rad = 0.032;
      const rings = bands > 1 ? [[0, 0.65], [0.45, 1], [1, 0.7]] : [[0, 0.9], [1, 0.8]];
      const pts = rings.map(([u, k2]) => Array.from({ length: sides }, (_, j) => {
        const aj = (j / sides) * TAU;
        return { p: [qx + Math.cos(aj) * rad * k2, qy + (u - 0.5) * len, qz + Math.sin(aj) * rad * k2], n: new THREE.Vector3(Math.cos(aj), 0.25, Math.sin(aj)).normalize() };
      }));
      const tc = C_TAIL.clone();
      for (let q = 0; q < rings.length - 1; q++) {
        for (let j = 0; j < sides; j++) {
          const a0 = pts[q][j], a1 = pts[q][(j + 1) % sides], b0 = pts[q + 1][j], b1 = pts[q + 1][(j + 1) % sides];
          vert(...a0.p, a0.n, tc, p1);
          vert(...b0.p, b0.n, tc, p1);
          vert(...b1.p, b1.n, tc, p1);
          vert(...a0.p, a0.n, tc, p1);
          vert(...b1.p, b1.n, tc, p1);
          vert(...a1.p, a1.n, tc, p1);
        }
      }
      // punta de la espadaña: un cono corto
      const top = [qx, qy + len / 2 + 0.03, qz], up = new THREE.Vector3(0, 1, 0);
      for (let j = 0; j < sides; j++) {
        const a0 = pts[rings.length - 1][j], a1 = pts[rings.length - 1][(j + 1) % sides];
        vert(...a0.p, a0.n, tc, p1);
        vert(...top, up, tc, p1);
        vert(...a1.p, a1.n, tc, p1);
      }
    }
  });
  const mesh = new THREE.Mesh(geometryOf({ pos, nor, col, ph }), shoreMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  const g = new THREE.Group();
  g.add(mesh);
  g.position.set(x, y - 0.03, z);
  g.userData.swayRoot = true;
  g.userData.blades = blades;
  return g;
}

/**
 * Nenúfar flotando (sustituto de flora.makeLilyPad): hoja redonda con su muesca, el borde
 * algo levantado, y a veces una flor de dos capas de pétalos. Una malla con el material
 * compartido; flota y se mece entero con el viento (altura de viento fija PAD_SWAY). Gasta
 * una tirada de `rng`; misma forma en las tres calidades. opts: { level }.
 */
/** Altura del nenúfar sobre y: por encima de la cresta máxima del oleaje de la calidad + 1 cm (mínimo 1,5 cm). */
export const padLift = (level) => Math.max(0.015, swellMaxAmp(treeLevel(level)) + 0.01);

export function makeLilyPad(rng, x, y, z, opts = {}) {
  const level = treeLevel(opts.level ?? opts);
  const r = mulberry32(Math.floor(rng() * 4294967296));
  const v = Array.from({ length: PAD_DRAWS }, r);
  const shape = {
    radius: +(0.22 + v[0] * 0.2).toFixed(5),
    notch: +(0.35 + v[1] * 0.25).toFixed(5),
    spin: +(v[2] * TAU).toFixed(5),
    tone: +v[3].toFixed(5),
    flower: v[4] < 0.3,
    petal: +(0.07 + v[5] * 0.03).toFixed(5),
    pink: v[6] < 0.6,
  };
  const { segs, petals, layers } = PAD_DETAIL[level];
  const pos = [], nor = [], col = [];
  const c = new THREE.Color(), cc = new THREE.Color();
  const vert = (p, n, k) => {
    pos.push(p[0], p[1], p[2]);
    nor.push(n.x, n.y, n.z);
    col.push(k.r, k.g, k.b);
  };
  const up = new THREE.Vector3(0, 1, 0);
  c.copy(C_PAD[0]).lerp(C_PAD[1], 0.3 + 0.5 * shape.tone);
  cc.copy(c).multiplyScalar(0.75);
  const R = shape.radius, a0 = shape.spin + shape.notch / 2, span = TAU - shape.notch;
  const rim = Array.from({ length: segs + 1 }, (_, i) => {
    const a = a0 + (span * i) / segs;
    return [Math.cos(a) * R, 0.012, Math.sin(a) * R];
  });
  // el borde algo más claro y levantado; la normal se abre un poco hacia fuera (luz suave)
  const nr = rim.map(([px, , pz]) => new THREE.Vector3(px * 0.6, 1, pz * 0.6).normalize());
  for (let i = 0; i < segs; i++) {
    vert([0, 0, 0], up, cc);
    vert(rim[i + 1], nr[i + 1], c);
    vert(rim[i], nr[i], c);
  }
  if (shape.flower) {
    const lc = (shape.pink ? C_LOTUS[0] : C_LOTUS[1]).clone(), core = new THREE.Color(0xffd34d);
    for (let L = 0; L < layers; L++) {
      const len = shape.petal * (L ? 0.75 : 1), rise = L ? 0.09 : 0.06, off = L ? Math.PI / petals : 0;
      for (let p = 0; p < petals; p++) {
        const a = shape.spin + off + (p / petals) * TAU, w = (Math.PI / petals) * 0.8;
        const tip = [Math.cos(a) * len, 0.02 + rise, Math.sin(a) * len];
        const l = [Math.cos(a - w) * len * 0.35, 0.02, Math.sin(a - w) * len * 0.35], rr = [Math.cos(a + w) * len * 0.35, 0.02, Math.sin(a + w) * len * 0.35];
        const n = new THREE.Vector3(-Math.cos(a) * 0.4, 1, -Math.sin(a) * 0.4).normalize();
        vert([0, 0.02, 0], n, core);
        vert(rr, n, lc);
        vert(tip, n, lc);
        vert([0, 0.02, 0], n, core);
        vert(tip, n, lc);
        vert(l, n, lc);
      }
    }
  }
  const sway = new Float32Array(pos.length / 3).fill(PAD_SWAY);
  const mesh = new THREE.Mesh(geometryOf({ pos, nor, col, sway }), shoreMaterial());
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const g = new THREE.Group();
  g.add(mesh);
  g.position.set(x, y + padLift(level), z);
  g.userData.swayRoot = true;
  g.userData.shape = shape;
  return g;
}

const triCount = (g) => {
  let n = 0;
  g.traverse((o) => o.isMesh && (n += o.geometry.attributes.position.count / 3));
  return n;
};
/** Triángulos de unos juncos (makeReeds). */
export const reedTriangles = triCount;
/** Triángulos de un nenúfar (makeLilyPad). */
export const padTriangles = triCount;
