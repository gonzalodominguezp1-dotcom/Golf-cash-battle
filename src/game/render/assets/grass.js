import * as THREE from 'three';
import { applyWind } from './wind.js';
import { TAU, LEVELS, lerp, smooth, treeLevel } from './treeKit.js';

// Césped del estilo liso (paso 5 y 5 bis de 02-DOCS/wiki/ftd/assets-entorno-1a1.md;
// diseño en 02-DOCS/wiki/ftd/notas-cesped-mejora.md).
//
// Sustituto de addGrassField (flora.js) y de las matas sueltas (makeTuft,
// makeGrassClump). Solo es dibujo: la física del hoyo no lo ve.
// - 6 especies (GRASS_SPECIES): hierba fina, ancha, tréboles, espigas, seca alta y
//   helecho. Cada tema elige su reparto (grassMixOf): como mucho 5 especies.
// - Una InstancedMesh por especie presente (como mucho 5 llamadas de dibujo) y un solo
//   material por calidad, compartido por todas.
// - Bajo: briznas geométricas con punta, sin textura (sin sobrepintado en el móvil).
//   Medio/Alto: tarjetas cruzadas con un atlas de hojas pintado en código (grassAtlas):
//   el detalle de muchas briznas va en la textura, no en triángulos.
// - 3 variantes por especie: otra fila del atlas (atributo por instancia grassVar,
//   sumado a la uv en el sombreador) y otras proporciones alto/ancho.
// - Brizna: base en sombra (oclusión en el color de vértice), punta más clara. Normales
//   casi hacia arriba: se ilumina como el suelo.
// - Color de cada mata = color del césped en su sitio del mundo (grassColorAt) x un
//   toque propio x el tono de la especie (la seca y las espigas tiran al ocre).
// - Matas altas junto a la pista: una especie del tema (mix.tall), más alta y esbelta.
// - Viento compartido (wind.js, capa grass con la altura local de la brizna).
// - De lejos la mata se encoge en el sombreador hasta desaparecer; cada malla se
//   descarta si no se ve.
//
// Zonas libres: nada a menos de 0,45 m de la pista, nada más allá de `reach`, lo que
// diga `ok(x, z, y, d)` (agua, río, tee...) y, además, ninguna hoja a menos de
// GRASS_CLEAR.leaf de la pista (raíz - radio de la especie x escala). Las matas altas,
// a 1 m o más.
//
// Determinismo: del rng del hoyo se toma UNA tirada (la semilla del campo); el resto
// sale de un rng propio con 9 tiradas fijas por candidato. Así el rng del hoyo pierde
// lo mismo sea cual sea la calidad, la densidad, el tema o el hoyo, y las matas de Bajo
// son las primeras de Medio, y las de Medio las primeras de Alto (también por especie).

// ---------- presupuesto ----------

/**
 * Por calidad: triángulos por mata (tope), tramos por pieza, tope de matas por campo,
 * si lleva textura recortada y distancia (m) a la que la mata empieza a encogerse y
 * desaparece. Medido en tests/grass.test.js.
 */
export const GRASS_BUDGET = {
  low: { tris: 9, sections: 2, maxTufts: 1500, textured: false, fade: [22, 30] },
  medium: { tris: 12, sections: 2, maxTufts: 3000, textured: true, fade: [30, 40] },
  high: { tris: 18, sections: 3, maxTufts: 3800, textured: true, fade: [38, 48] },
};
/** Triángulos máximos de un campo entero (presupuesto móvil por calidad). */
export const GRASS_FIELD_TRIS = { low: 13500, medium: 36000, high: 70000 };
/** Llamadas de dibujo máximas por campo (una malla por especie presente). */
export const GRASS_MAX_CALLS = 5;
/** Tiradas que el campo toma del rng del hoyo (siempre las mismas). */
export const GRASS_RNG_DRAWS = 1;
/** Distancias mínimas a la pista (m): raíz, matas altas y cualquier hoja (cubre lo que tumba el viento). */
export const GRASS_CLEAR = { course: 0.45, tall: 1, leaf: 0.2 };
/** Matas altas: franja junto a la pista (m), probabilidad junto al borde y escalas. */
export const GRASS_TALL = { band: [1, 3.5], chance: 0.2, minScaleY: 1.7, scaleY: [1.7, 2.3], scaleXZ: [1.1, 1.35], shade: 0.9 };
/** Altura de referencia del viento (m de la brizna local): la de la capa grass. */
export const GRASS_WIND_HEIGHT = 0.35;
/** El suelo bajo la hierba: el mismo tono, más oscuro. */
export const GRASS_GROUND_SHADE = 0.72;

/** Atlas de hojas: 6 columnas (especies) x 3 filas (variantes), teselas de 64 x 128 px. */
export const GRASS_ATLAS = { width: 512, height: 384, tileW: 64, tileH: 128, margin: 3, cols: 6, rows: 3 };

/** Especies, en este orden = columna del atlas. */
export const GRASS_SPECIES = ['fine', 'broad', 'clover', 'seed', 'dry', 'fern'];

// proporciones de cada variante (alto y ancho de la mata): más de un 12 % entre ellas
const VARIANTS = [
  { y: 1, xz: 1 },
  { y: 1.16, xz: 0.88 },
  { y: 0.88, xz: 1.12 },
];

/**
 * Por especie: reach = radio máximo de la mata sin escalar (m; lo usan las zonas libres),
 * dry = cuánto tira al ocre (0 = verde), lum = toque de luminosidad, variants = 3
 * proporciones (cada una, además, su fila del atlas).
 */
export const GRASS_SPECIES_INFO = {
  // reach medido sobre la geometría de las tres calidades (tests/grass.test.js lo comprueba)
  fine: { label: 'hierba fina', reach: 0.135, dry: 0, lum: 1, variants: VARIANTS },
  broad: { label: 'hierba ancha', reach: 0.215, dry: 0, lum: 0.94, variants: VARIANTS },
  clover: { label: 'tréboles', reach: 0.165, dry: 0, lum: 1.05, variants: VARIANTS },
  seed: { label: 'espigas', reach: 0.13, dry: 0.3, lum: 1.02, variants: VARIANTS },
  dry: { label: 'hierba seca', reach: 0.18, dry: 0.6, lum: 1.04, variants: VARIANTS },
  fern: { label: 'helecho', reach: 0.34, dry: 0, lum: 0.92, variants: VARIANTS },
};

const DRAWS_PER_TUFT = 9; // x, z, densidad, giro, escala, tono, alta, especie, variante
const MAX_TRIES = 8; // candidatos por mata pedida, como mucho

export const tuftTriangles = (level, species) => {
  if (species) return grassTuftGeometry(level, species).index.count / 3;
  return GRASS_BUDGET[treeLevel(level)].tris;
};

// ---------- repartos por tema ----------

/**
 * Repartos de especies (pesos; como mucho GRASS_MAX_CALLS especies), la especie de las
 * matas altas junto a la pista y cuánto se apaga el color (muted 0..1).
 */
export const GRASS_MIXES = {
  meadow: { weights: { fine: 0.34, broad: 0.22, clover: 0.17, seed: 0.15, dry: 0.12 }, tall: 'broad', muted: 0 },
  lush: { weights: { fine: 0.3, broad: 0.3, clover: 0.2, fern: 0.12, seed: 0.08 }, tall: 'broad', muted: 0 },
  jungle: { weights: { broad: 0.3, fern: 0.32, fine: 0.22, clover: 0.16 }, tall: 'broad', muted: 0 },
  autumn: { weights: { fine: 0.3, dry: 0.3, seed: 0.2, broad: 0.2 }, tall: 'dry', muted: 0.1 },
  beach: { weights: { dry: 0.55, fine: 0.2, seed: 0.15, broad: 0.1 }, tall: 'dry', muted: 0.1 },
  desert: { weights: { dry: 0.6, seed: 0.25, fine: 0.15 }, tall: 'dry', muted: 0.2 },
  snow: { weights: { fine: 0.45, dry: 0.35, seed: 0.2 }, tall: 'dry', muted: 0.55 },
};
for (const [name, m] of Object.entries(GRASS_MIXES)) {
  m.name = name;
  Object.freeze(m.weights);
  Object.freeze(m);
}

/**
 * Reparto de especies de un tema de escena (THEMES): null si el tema no lleva hierba
 * (neón, ciudad, lava, caldera). theme.grassMix (nombre) lo fija.
 */
export function grassMixOf(theme) {
  if (!theme) return GRASS_MIXES.meadow;
  if (theme.neon || theme.cyberCity || theme.lava || theme.caldera) return null;
  if (theme.grassMix && GRASS_MIXES[theme.grassMix]) return GRASS_MIXES[theme.grassMix];
  const trees = theme.trees ?? [];
  if (theme.snowfall || theme.snowSand || trees.includes('snowpine')) return GRASS_MIXES.snow;
  if (trees.includes('cactus')) return GRASS_MIXES.desert;
  if (trees.includes('palm')) return GRASS_MIXES.beach;
  if (theme.lowClouds && theme.stoneWalls) return GRASS_MIXES.jungle;
  if (theme.lushEnv) return GRASS_MIXES.lush;
  if (!theme.flowers && !theme.stars && trees.length && trees.every((t) => t === 'round' || t === 'pine')) return GRASS_MIXES.autumn;
  return GRASS_MIXES.meadow;
}

/** mix: nombre de GRASS_MIXES, un reparto { weights, tall, muted } o solo los pesos. */
function resolveMix(theme, mix) {
  if (mix == null) return grassMixOf(theme);
  if (typeof mix === 'string') return GRASS_MIXES[mix] ?? grassMixOf(theme);
  const weights = mix.weights ?? mix;
  const list = GRASS_SPECIES.filter((s) => weights[s] > 0).slice(0, GRASS_MAX_CALLS);
  if (!list.length) return grassMixOf(theme);
  const tall = list.includes(mix.tall) ? mix.tall : list.reduce((a, b) => (weights[b] > weights[a] ? b : a));
  return { name: mix.name ?? 'custom', weights, tall, muted: mix.muted ?? 0 };
}

// ---------- color: manchas según el mundo ----------

function hash2(ix, iz) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Ruido de valor suave (0..1) en el plano. */
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

const DRY = new THREE.Color(0xc9b458); // ocre de la hierba seca
const palettes = new Map();
function paletteOf(tint) {
  const base = new THREE.Color(tint?.[0] ?? 0x4f9a3a), tip = new THREE.Color(tint?.[1] ?? 0x9fd36a);
  const key = `${base.getHex()}-${tip.getHex()}`;
  let p = palettes.get(key);
  if (!p) {
    p = { base, tip, dry: tip.clone().lerp(DRY, 0.6) };
    palettes.set(key, p);
  }
  return p;
}

// las manchas grandes (~20 m): secas (más amarillas) y oscuras
const bigPatch = (x, z) => vnoise(x / 21 - 7.1, z / 21 + 5.9);

/**
 * Color del césped en un punto del mundo (sin rng: siempre el mismo). tint = [base, punta]
 * como en addGrassField. Manchas de ~8 m (más claras/oscuras) y de ~20 m (zonas secas,
 * más amarillas, y zonas más oscuras).
 */
export function grassColorAt(x, z, tint, out = new THREE.Color()) {
  const p = paletteOf(tint);
  const n1 = vnoise(x / 8 + 3.7, z / 8 - 1.3);
  const n2 = bigPatch(x, z);
  out.copy(p.base).lerp(p.tip, 0.25 + 0.5 * n1);
  out.lerp(p.dry, smooth(0.55, 0.85, n2) * 0.55);
  return out.multiplyScalar(1 - 0.24 * (1 - smooth(0.1, 0.45, n2)));
}

/** Color del suelo bajo la hierba en ese punto: el mismo tono, más oscuro (para el terreno). */
export function grassGroundColor(x, z, tint, out = new THREE.Color()) {
  return grassColorAt(x, z, tint, out).multiplyScalar(GRASS_GROUND_SHADE);
}

const lumOf = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const _target = new THREE.Color();
/** Lleva el color hacia `to` (0..1) sin cambiar su luminosidad. */
function toward(c, to, k) {
  if (!(k > 0)) return c;
  const l = lumOf(c), lt = lumOf(to);
  _target.copy(to).multiplyScalar(lt > 0 ? l / lt : 0);
  return c.lerp(_target, k);
}
const GREY = new THREE.Color(1, 1, 1);

// ---------- atlas de hojas (pintado en código, sin canvas) ----------

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

/**
 * Pincel de una tesela: alfa, luminosidad y calidez (ocre) en coma flotante. Todo se
 * pinta en gris (el color lo ponen el vértice y la instancia) y queda dentro del borde
 * transparente de la tesela.
 */
function tilePainter(buf, col, row) {
  const { width: W, tileW: TW, tileH: TH, margin: M } = GRASS_ATLAS;
  const ox = col * TW, oy = row * TH;
  const dot = (x, y, r, lum, warm = 0) => {
    const x0 = Math.max(M, Math.floor(x - r - 1)), x1 = Math.min(TW - M - 1, Math.ceil(x + r + 1));
    const y0 = Math.max(M, Math.floor(y - r - 1)), y1 = Math.min(TH - M - 1, Math.ceil(y + r + 1));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const a = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(px + 0.5 - x, py + 0.5 - y)));
        if (a <= 0) continue;
        const i = (oy + py) * W + ox + px;
        const A = buf.a[i], na = a + A * (1 - a);
        buf.l[i] = (lum * a + buf.l[i] * A * (1 - a)) / na;
        buf.w[i] = (warm * a + buf.w[i] * A * (1 - a)) / na;
        buf.a[i] = na;
      }
    }
  };
  /**
   * Trazo: desde (x, y) hacia arriba girado `ang` (rad), se curva `curve` rad/px, ancho
   * de w0 a w1 px; shade(t) = luminosidad. Devuelve los puntos del eje (para hojitas).
   */
  const stroke = (x, y, ang, len, curve, w0, w1, shade, warm = () => 0, kink = null) => {
    const ds = 0.5, n = Math.max(2, Math.ceil(len / ds)), pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      dot(x, y, Math.max(0.4, lerp(w0, w1, t) / 2), shade(t), warm(t));
      pts.push({ x, y, ang, t });
      if (kink && Math.abs(t - kink.at) < ds / len) ang += kink.by;
      x += Math.sin(ang) * ds;
      y += Math.cos(ang) * ds;
      ang += curve * ds;
    }
    return pts;
  };
  return { dot, stroke, TW, TH };
}

// dibujo de cada especie en su tesela (v = fila: misma especie, otro dibujo)
const PAINT = {
  fine(P, r, v) {
    const n = 10 + v * 2;
    for (let k = 0; k < n; k++) {
      const tone = 0.82 + r() * 0.2;
      const x = 32 + (r() - 0.5) * (14 + v * 6), ang = (r() - 0.5) * (0.55 + v * 0.15);
      const len = 72 + r() * 46 - v * 6, curve = (r() - 0.5) * 0.009;
      P.stroke(x, 4, ang, len, curve, 2.6 + r() * 0.8, 0.5, (t) => tone * (0.62 + 0.38 * t));
    }
  },
  broad(P, r, v) {
    const n = 4 + v;
    for (let k = 0; k < n; k++) {
      const tone = 0.84 + r() * 0.18, side = k % 2 ? 1 : -1;
      const x = 32 + (r() - 0.5) * 12, ang = side * (0.08 + r() * 0.3), len = 82 + r() * 34 - v * 8;
      const curve = side * (0.004 + r() * 0.006 + v * 0.002), w = 6.5 + r() * 2.5 - v * 0.6;
      const pts = P.stroke(x, 4, ang, len, curve, w, 0.6, (t) => tone * (0.6 + 0.4 * t));
      // nervio central, más oscuro
      pts.forEach((p, i) => p.t < 0.85 && i % 2 === 0 && P.dot(p.x, p.y, 0.45, tone * (0.5 + 0.32 * p.t)));
    }
  },
  clover(P, r, v) {
    const n = 5 + v;
    for (let k = 0; k < n; k++) {
      const cx = 12 + r() * 40, cy = 26 + (k / (n - 1)) * 80 + (r() - 0.5) * 10, rad = 7 + r() * 2.5 - v * 0.5;
      const bx = 32 + (r() - 0.5) * 10;
      const ang = Math.atan2(cx - bx, cy - 4);
      P.stroke(bx, 4, ang, Math.hypot(cx - bx, cy - 4), 0, 1.6, 1.2, (t) => 0.62 + 0.2 * t);
      const tone = 0.8 + r() * 0.18, spin = r() * TAU;
      for (let f = 0; f < 3; f++) {
        const a = spin + (f * TAU) / 3;
        const fx = cx + Math.cos(a) * rad * 0.62, fy = cy + Math.sin(a) * rad * 0.62;
        P.dot(fx, fy, rad * 0.6, tone);
        // la marca clara en «V» de cada foliolo
        P.dot(cx + Math.cos(a) * rad * 0.55, cy + Math.sin(a) * rad * 0.55, rad * 0.16, Math.min(1, tone * 1.22));
      }
      P.dot(cx, cy, rad * 0.18, tone * 0.7);
    }
  },
  seed(P, r, v) {
    // relleno bajo de hojitas
    for (let k = 0; k < 7; k++) {
      const tone = 0.78 + r() * 0.18;
      P.stroke(32 + (r() - 0.5) * 26, 4, (r() - 0.5) * 1.2, 24 + r() * 22, (r() - 0.5) * 0.02, 2.4, 0.5, (t) => tone * (0.6 + 0.35 * t));
    }
    // tallos con espiga arriba
    const n = 3 + v;
    for (let k = 0; k < n; k++) {
      const tone = 0.86 + r() * 0.14, len = 90 + r() * 26 - v * 5;
      const pts = P.stroke(32 + (r() - 0.5) * 18, 4, (r() - 0.5) * 0.45, len, (r() - 0.5) * 0.006, 1.7, 1.2, (t) => tone * (0.66 + 0.3 * t), (t) => t * 0.6);
      const from = 0.68 - v * 0.05;
      pts.forEach((p, i) => {
        if (p.t < from || i % 5) return;
        const side = (i / 5) % 2 ? 1 : -1, s = 1 - (p.t - from) / (1 - from) * 0.5;
        P.dot(p.x + Math.cos(p.ang) * side * 1.6, p.y - Math.sin(p.ang) * side * 1.6, 2.1 * s, Math.min(1, tone * 1.1), 1);
      });
    }
  },
  dry(P, r, v) {
    const n = 8 + v;
    for (let k = 0; k < n; k++) {
      const tone = 0.86 + r() * 0.16, ph = r() * 6;
      const kink = r() < 0.35 + v * 0.1 ? { at: 0.45 + r() * 0.3, by: (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5) } : null;
      P.stroke(32 + (r() - 0.5) * (20 + v * 8), 4, (r() - 0.5) * 0.7, 80 + r() * 40, (r() - 0.5) * 0.014, 2 + r() * 0.8, 0.5,
        (t) => tone * (0.66 + 0.34 * t) * (0.93 + 0.07 * Math.sin(t * 40 + ph)), (t) => 0.4 + 0.6 * t, kink);
    }
  },
  fern(P, r, v) {
    const fronds = v === 2 ? 2 : 1;
    for (let k = 0; k < fronds; k++) {
      const tone = 0.82 + r() * 0.16, main = k === 0;
      const len = main ? 112 - v * 6 : 74, bx = main ? 32 + (r() - 0.5) * 6 : 32 + (r() < 0.5 ? -10 : 10);
      const ang = main ? (r() - 0.5) * 0.12 : (bx < 32 ? -0.35 : 0.35), curve = (r() - 0.5) * 0.004;
      const rachis = P.stroke(bx, 4, ang, len, curve, 2.2, 0.8, (t) => tone * (0.55 + 0.3 * t));
      const step = 12 - v * 2, size = main ? 24 + v * 2 : 16;
      rachis.forEach((p, i) => {
        if (p.t < 0.1 || i % step) return;
        for (const side of [-1, 1]) {
          const L = size * (1 - p.t * 0.78) * (0.85 + r() * 0.3);
          P.stroke(p.x, p.y, p.ang + side * (1.05 - p.t * 0.3), L, -side * 0.012, 3.6 - p.t * 1.2, 0.5, (t) => tone * (0.62 + 0.38 * p.t) * (0.9 + 0.1 * t));
        }
      });
    }
  },
};

let ATLAS = null;

/** Mipmaps propios: media con peso del alfa y, por tesela, la cobertura de la silueta conservada. */
function buildMipmaps(data, W, H) {
  const { tileW: TW, tileH: TH } = GRASS_ATLAS;
  const cols = W / TW, rows = H / TH;
  // cobertura (alfa >= 0,5) de cada tesela en la base
  const cover = [];
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      let on = 0;
      for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (data[((ty * TH + y) * W + tx * TW + x) * 4 + 3] >= 128) on++;
      cover.push(on / (TW * TH));
    }
  }
  const mips = [{ data, width: W, height: H }];
  let src = data, w = W, h = H;
  for (let L = 1; w > 1 || h > 1; L++) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
    const out = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      const y0 = Math.floor((y * h) / nh), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / nh));
      for (let x = 0; x < nw; x++) {
        const x0 = Math.floor((x * w) / nw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / nw));
        let sa = 0, n = 0;
        const sc = [0, 0, 0], plain = [0, 0, 0];
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            const i = (yy * w + xx) * 4, a = src[i + 3];
            for (let c = 0; c < 3; c++) (sc[c] += src[i + c] * a), (plain[c] += src[i + c]);
            sa += a;
            n++;
          }
        }
        const o = (y * nw + x) * 4;
        for (let c = 0; c < 3; c++) out[o + c] = Math.round(sa > 0 ? sc[c] / sa : plain[c] / n);
        out[o + 3] = Math.round(sa / n);
      }
    }
    // conserva la cobertura: escala el alfa de la tesela para que el mismo cuantil pase el recorte
    const tw = TW >> L, th = TH >> L;
    if (tw >= 1 && th >= 1) {
      for (let ty = 0; ty < rows; ty++) {
        for (let tx = 0; tx < cols; tx++) {
          const want = Math.round(cover[ty * cols + tx] * tw * th);
          if (want <= 0) continue;
          const idx = [];
          for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) idx.push(((ty * th + y) * nw + tx * tw + x) * 4 + 3);
          const sorted = idx.map((i) => out[i]).sort((a, b) => b - a);
          const q = sorted[want - 1];
          const k = q > 0 ? 128.5 / q : 0;
          if (!(k > 0)) continue;
          for (const i of idx) out[i] = Math.min(255, Math.round(out[i] * k));
        }
      }
    }
    mips.push({ data: out, width: nw, height: nh });
    src = out;
    w = nw;
    h = nh;
  }
  return mips;
}

/**
 * Atlas de hojas de todas las especies (uno, compartido; se pinta una vez). DataTexture
 * RGBA sRGB pintada píxel a píxel (se puede generar en node, sin canvas), con borde
 * transparente por tesela y mipmaps propios que no adelgazan la silueta de lejos.
 */
export function grassAtlas() {
  if (ATLAS) return ATLAS;
  const { width: W, height: H, tileW: TW, tileH: TH, rows } = GRASS_ATLAS;
  const buf = { a: new Float32Array(W * H), l: new Float32Array(W * H), w: new Float32Array(W * H) };
  GRASS_SPECIES.forEach((sp, col) => {
    for (let row = 0; row < rows; row++) PAINT[sp](tilePainter(buf, col, row), mulberry32(1009 + col * 97 + row * 31), row);
  });
  const data = new Uint8Array(W * H * 4);
  for (let ty = 0; ty < H / TH; ty++) {
    for (let tx = 0; tx < W / TW; tx++) {
      // los píxeles transparentes toman el gris medio de su tesela (sin orla oscura al filtrar)
      let sl = 0, n = 0;
      for (let y = 0; y < TH; y++) {
        for (let x = 0; x < TW; x++) {
          const i = (ty * TH + y) * W + tx * TW + x;
          if (buf.a[i] > 0.5) (sl += buf.l[i] * (0.8 + 0.2 * (y / TH))), n++;
        }
      }
      const fill = n ? sl / n : 0.8;
      for (let y = 0; y < TH; y++) {
        for (let x = 0; x < TW; x++) {
          const i = (ty * TH + y) * W + tx * TW + x, o = i * 4;
          const a = buf.a[i];
          // la base de la tesela algo más oscura que la punta (oclusión dentro de la mata)
          const l = a > 0 ? buf.l[i] * (0.8 + 0.2 * (y / TH)) : fill, wm = a > 0 ? buf.w[i] : 0;
          const rgb = [l, l * (1 - 0.05 * wm), l * (1 - 0.32 * wm)];
          for (let c = 0; c < 3; c++) data[o + c] = Math.round(255 * Math.min(1, Math.max(0, rgb[c])));
          data[o + 3] = Math.round(255 * Math.min(1, a));
        }
      }
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = buildMipmaps(data, W, H);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.name = 'grass-atlas';
  tex.needsUpdate = true;
  ATLAS = tex;
  return tex;
}

// ---------- geometría de una mata ----------

/**
 * Forma de cada especie (m, sin escala). h alto; lean cuánto sale la punta hacia fuera
 * (curva t^p); r0 radio de la raíz de cada pieza; arc > 0 = la punta cae (fronda);
 * bw medio ancho de la brizna de Bajo; cw medio ancho de la tarjeta de Medio/Alto;
 * hs alto relativo de cada una de las 3 piezas; spread: piezas cruzadas (false) o en
 * estrella hacia fuera (true).
 */
const FORM = {
  fine: { h: 0.17, lean: 0.09, p: 2, r0: 0.015, arc: 0, bw: 0.022, cw: 0.09, hs: [1, 0.86, 0.76], spread: false },
  broad: { h: 0.26, lean: 0.17, p: 1.7, r0: 0.02, arc: 0, bw: 0.045, cw: 0.11, hs: [1, 0.9, 0.8], spread: false },
  clover: { h: 0.09, lean: 0.14, p: 1, r0: 0.01, arc: 0, bw: 0.045, cw: 0.07, hs: [1, 0.85, 0.75], spread: true },
  seed: { h: 0.31, lean: 0.09, p: 2, r0: 0.012, arc: 0, bw: 0.016, cw: 0.085, hs: [1, 0.9, 0.82], spread: false },
  dry: { h: 0.36, lean: 0.13, p: 2, r0: 0.015, arc: 0, bw: 0.02, cw: 0.11, hs: [1, 0.88, 0.78], spread: false },
  fern: { h: 0.22, lean: 0.31, p: 1.2, r0: 0.02, arc: 0.3, bw: 0.05, cw: 0.07, hs: [1, 0.9, 0.82], spread: true },
};

const tuftGeos = new Map();

/**
 * Mata de una especie (una por calidad y especie, compartida; los campos la clonan).
 * Bajo: 3 briznas con punta (3 tri cada una), sin textura. Medio/Alto: 3 tarjetas
 * (2 tri por tramo) con la tesela de la especie en la primera fila del atlas (la fila
 * de la variante la pone grassVar). Color de vértice: base en sombra, punta más clara
 * y cálida; normales casi hacia arriba.
 */
export function grassTuftGeometry(level, species = 'fine') {
  level = treeLevel(level);
  if (!FORM[species]) species = 'fine';
  const key = `${level}:${species}`;
  if (tuftGeos.has(key)) return tuftGeos.get(key);
  const F = FORM[species];
  const { sections, textured } = GRASS_BUDGET[level];
  const { width: AW, height: AH, tileW: TW, tileH: TH } = GRASS_ATLAS;
  const col = GRASS_SPECIES.indexOf(species);
  const pos = [], col3 = [], nor = [], uvs = [], idx = [];
  // con textura el degradado del vértice es más suave (la textura ya lo lleva)
  const [shadeBase, tipWarm] = textured ? [0.68, [1.12, 1.1, 1.0]] : [0.52, [1.2, 1.18, 1.02]];
  const color = (y) => {
    const t = Math.min(1, y / F.h);
    if (t < 0.65) {
      const k = lerp(shadeBase, 1, t / 0.65);
      return [k, k, k];
    }
    const k = (t - 0.65) / 0.35;
    return [lerp(1, tipWarm[0], k), lerp(1, tipWarm[1], k), lerp(1, tipWarm[2], k)];
  };
  const theta = Math.PI * (0.5 + F.arc);
  const yf = (t) => (F.arc > 0 ? Math.sin(t * theta) : t);
  for (let b = 0; b < 3; b++) {
    // cruzadas cada 60° (o en estrella cada 120°) con un pequeño giro propio
    const a = F.spread ? (b * TAU) / 3 + 0.4 : textured ? (b * Math.PI) / 3 + 0.2 : b * 2.39996 + 0.3;
    const dx = Math.cos(a), dz = Math.sin(a); // hacia fuera
    const wx = -dz, wz = dx; // a lo ancho
    const h = F.h * F.hs[b];
    const n = new THREE.Vector3(dx * 0.3, 1, dz * 0.3).normalize();
    const start = pos.length / 3;
    const put = (u, t, uu) => {
      const R = F.r0 + F.lean * Math.pow(t, F.p), y = h * yf(t);
      pos.push(u * wx + R * dx, y, u * wz + R * dz);
      col3.push(...color(y));
      nor.push(n.x, n.y, n.z);
      // medio píxel hacia dentro: la uv nunca cae en la tesela de al lado (redondeo de float32)
      uvs.push((col * TW + 0.5 + uu * (TW - 1)) / AW, (0.5 + t * (TH - 1)) / AH);
    };
    if (!textured) {
      for (let s = 0; s < sections; s++) {
        const t = s / sections, w = F.bw * (1 - 0.7 * t);
        put(-w, t, 0.5 - w / (2 * F.cw));
        put(w, t, 0.5 + w / (2 * F.cw));
      }
      put(0, 1, 0.5);
      for (let s = 0; s < sections - 1; s++) {
        const q = start + s * 2;
        idx.push(q, q + 1, q + 3, q, q + 3, q + 2);
      }
      const q = start + (sections - 1) * 2;
      idx.push(q, q + 1, q + 2);
    } else {
      for (let s = 0; s <= sections; s++) {
        const t = s / sections, w = F.cw * (1 - 0.15 * t);
        put(-w, t, 0.5 - w / (2 * F.cw));
        put(w, t, 0.5 + w / (2 * F.cw));
      }
      for (let s = 0; s < sections; s++) {
        const q = start + s * 2;
        idx.push(q, q + 1, q + 3, q, q + 3, q + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col3, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  tuftGeos.set(key, g);
  return g;
}

// ---------- material ----------

const mats = new Map();
const f1 = (v) => Number(v).toFixed(1);

/**
 * Material de la hierba (uno por calidad, compartido por todas las especies): Lambert
 * con color de vértice y de instancia, dos caras con la normal hacia arriba, viento
 * compartido (capa grass, altura local) y la mata que se encoge con la distancia a la
 * cámara. Medio/Alto: el atlas de hojas recortado (alphaTest) y la fila de la variante
 * (atributo grassVar por instancia).
 */
export function grassMaterial(level) {
  level = treeLevel(level);
  if (mats.has(level)) return mats.get(level);
  const { fade: [f0, fEnd], textured } = GRASS_BUDGET[level];
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  if (textured) {
    m.map = grassAtlas();
    m.alphaTest = 0.5;
    // bakeStatic borra las uv salvo que el material lo pida
    m.userData.keepUv = true;
  }
  m.onBeforeCompile = (sh) => {
    // la variante elige la fila del atlas: desplaza la v de la tesela
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n#ifdef USE_MAP\nattribute float grassVar;\n#endif')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv.y += grassVar;\n#endif');
    // de lejos la mata se encoge hacia su raíz: menos píxeles que pintar en el móvil
    sh.vertexShader = sh.vertexShader.replace(
      '#include <project_vertex>',
      [
        '#ifdef USE_INSTANCING',
        '{',
        '  vec3 gcbRoot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;',
        `  float gcbGrassFade = 1.0 - smoothstep(${f1(f0)}, ${f1(fEnd)}, distance(gcbRoot, cameraPosition));`,
        '  transformed *= gcbGrassFade;',
        '}',
        '#endif',
        '#include <project_vertex>',
      ].join('\n'),
    );
    // las dos caras con la normal hacia arriba (si no, la cara de atrás sale negra)
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      'float faceDirection = gl_FrontFacing ? 1.0 : -1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;',
    );
  };
  m.customProgramCacheKey = () => `gcb-grass3:${f0}:${fEnd}:${textured ? 1 : 0}`;
  applyWind(m, { layer: 'grass', source: 'y', height: GRASS_WIND_HEIGHT });
  mats.set(level, m);
  return m;
}

// ---------- campo ----------

/**
 * Especie de una mata normal: el reparto del tema, con el helecho más en las manchas
 * oscuras y la seca más en las zonas secas y hacia fuera. Sin rng extra: `roll` es una
 * de las tiradas fijas y el resto sale de la posición.
 */
function pickSpecies(mix, list, roll, x, z, d, reach) {
  const n2 = bigPatch(x, z);
  const dark = 1 - smooth(0.1, 0.45, n2), dryZone = smooth(0.55, 0.85, n2), outer = smooth(0.5, 1, d / reach);
  let sum = 0;
  const w = list.map((sp) => {
    let k = mix.weights[sp];
    if (sp === 'fern') k *= 0.35 + 2.2 * dark;
    if (sp === 'dry') k *= 0.6 + 1.2 * dryZone + 0.8 * outer;
    sum += k;
    return k;
  });
  let acc = 0;
  for (let i = 0; i < list.length; i++) {
    acc += w[i] / sum;
    if (roll < acc) return list[i];
  }
  return list[list.length - 1];
}

const fract = (v) => v - Math.floor(v);
const noGrass = (group, stats) => ({ group, mesh: null, meshes: [], stats });

/**
 * Siembra el césped alrededor de la pista. Mismas opciones que addGrassField (flora.js):
 * bounds, heightAt(x, z), ok(x, z, y, d), rng (del hoyo), density (del tema, 0..1),
 * tint [base, punta], reach (m) y además level ('low'|'medium'|'high', preset o lod),
 * theme (tema de escena: elige el reparto con grassMixOf), mix (nombre de GRASS_MIXES o
 * pesos; manda sobre theme) y only (una sola especie, para el laboratorio: las mismas
 * tiradas y los mismos sitios salvo la franja junto a la pista que cambia con el radio
 * de la especie). Devuelve { group, mesh, meshes, stats }: una InstancedMesh por especie
 * presente (mesh = meshes[0]; null y [] si no cabe ninguna mata o el tema no lleva hierba).
 */
export function makeGrassField({ bounds, heightAt, ok = () => true, rng, density = 1, tint, reach = 15, level, theme, mix, only }) {
  level = treeLevel(level);
  const seed = Math.floor(rng() * 4294967296); // la única tirada del rng del hoyo
  const r = mulberry32(seed ^ 0x9e3779b9);
  const budget = GRASS_BUDGET[level];
  const M = resolveMix(theme, mix);
  const solo = GRASS_SPECIES.includes(only) ? only : null;
  const want = M ? Math.round(budget.maxTufts * THREE.MathUtils.clamp(Number(density) || 0, 0, 1)) : 0;
  const group = new THREE.Group();
  group.name = 'grass';
  const stats = { level, tufts: 0, tall: 0, triangles: 0, vertices: 0, calls: 0, seed, mix: M?.name ?? null, species: {} };
  group.userData.grass = stats;
  if (want <= 0) return noGrass(group, stats);
  const list = GRASS_SPECIES.filter((s) => M.weights[s] > 0).slice(0, GRASS_MAX_CALLS);

  const minX = bounds.minX - reach, maxX = bounds.maxX + reach, minZ = bounds.minZ - reach, maxZ = bounds.maxZ + reach;
  const distBox = (x, z) => Math.hypot(Math.max(bounds.minX - x, 0, x - bounds.maxX), Math.max(bounds.minZ - z, 0, z - bounds.maxZ));
  const tufts = [];
  for (let tries = 0; tufts.length < want && tries < want * MAX_TRIES; tries++) {
    // siempre las mismas DRAWS_PER_TUFT tiradas por candidato, se use o no
    const x = minX + r() * (maxX - minX), z = minZ + r() * (maxZ - minZ);
    const keep = r(), rot = r() * TAU, size = r(), shade = r(), tallRoll = r(), spRoll = r(), varRoll = r();
    const d = distBox(x, z);
    if (d < GRASS_CLEAR.course || d > reach) continue;
    // más hierba cerca de la pista, menos hacia fuera (como addGrassField)
    if (keep > 1 - (d / reach) * 0.7) continue;
    const y = heightAt(x, z);
    if (!ok(x, z, y, d)) continue;
    const near = 1 - smooth(GRASS_TALL.band[0] + 0.5, GRASS_TALL.band[1], d);
    const tall = d >= Math.max(GRASS_CLEAR.tall, GRASS_TALL.band[0]) && d <= GRASS_TALL.band[1] && tallRoll < GRASS_TALL.chance * near;
    const sp = solo ?? (tall ? M.tall : pickSpecies(M, list, spRoll, x, z, d, reach));
    const info = GRASS_SPECIES_INFO[sp];
    const variant = Math.min(info.variants.length - 1, Math.floor(varRoll * info.variants.length));
    let sxz, sy;
    if (tall) {
      // la misma mata, más alta y más esbelta (y algo más oscura)
      sxz = lerp(GRASS_TALL.scaleXZ[0], GRASS_TALL.scaleXZ[1], size);
      sy = lerp(GRASS_TALL.scaleY[0], GRASS_TALL.scaleY[1], fract(size * 7.31));
    } else {
      const s = lerp(0.65, 1.1, size), V = info.variants[variant];
      sxz = s * V.xz;
      sy = s * lerp(0.8, 1.25, fract(size * 5.17)) * V.y;
    }
    // ninguna hoja sobre la pista: la raíz menos el radio de la mata escalado
    if (d - info.reach * sxz < GRASS_CLEAR.leaf) continue;
    tufts.push({ x, y, z, rot, sxz, sy, shade, tall, sp, variant });
  }
  if (!tufts.length) return noGrass(group, stats);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
  const mat = grassMaterial(level);
  const rowStep = GRASS_ATLAS.tileH / GRASS_ATLAS.height;
  const meshes = [];
  for (const sp of GRASS_SPECIES) {
    const items = tufts.filter((t) => t.sp === sp);
    if (!items.length) continue;
    const info = GRASS_SPECIES_INFO[sp];
    // copia propia por campo: borrar un campo no toca los búferes de otro
    const geo = grassTuftGeometry(level, sp).clone();
    const vars = new Float32Array(items.length);
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    mesh.name = `grass-${sp}`;
    items.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot);
      m4.compose(v.set(t.x, t.y - 0.01, t.z), q, sc.set(t.sxz, t.sy, t.sxz));
      mesh.setMatrixAt(i, m4);
      grassColorAt(t.x, t.z, tint, c).multiplyScalar(lerp(0.92, 1.08, t.shade) * (t.tall ? GRASS_TALL.shade : 1));
      toward(c, DRY, info.dry);
      toward(c, GREY, M.muted);
      c.multiplyScalar(info.lum);
      mesh.setColorAt(i, c);
      vars[i] = t.variant * rowStep;
      if (t.tall) stats.tall++;
    });
    geo.setAttribute('grassVar', new THREE.InstancedBufferAttribute(vars, 1));
    mesh.userData.species = sp;
    mesh.userData.variants = items.map((t) => t.variant);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.castShadow = false; // como hoy: la hierba no proyecta sombra (caro en el móvil)
    mesh.receiveShadow = false;
    group.add(mesh);
    meshes.push(mesh);
    stats.species[sp] = items.length;
    stats.triangles += items.length * (geo.index.count / 3);
    stats.vertices += items.length * geo.attributes.position.count;
  }
  stats.tufts = tufts.length;
  stats.calls = meshes.length;
  return { group, mesh: meshes[0], meshes, stats };
}

/**
 * Como addGrassField: siembra el campo y lo añade a `scene`. Devuelve
 * { mesh, meshes, stats, update(cam) } (update esconde cada malla si la cámara queda
 * más lejos que el fundido) o null si no hay hierba.
 */
export function addGrass(scene, opts) {
  const { group, mesh, meshes, stats } = makeGrassField(opts);
  if (!mesh) return null;
  scene.add(group);
  const far = GRASS_BUDGET[stats.level].fade[1];
  const spheres = meshes.map((m) => ({ m, center: m.boundingSphere.center.clone(), radius: m.boundingSphere.radius }));
  return {
    mesh,
    meshes,
    stats,
    update(cam) {
      for (const s of spheres) s.m.visible = s.center.distanceTo(cam) - s.radius < far;
    },
    /** Quita el campo de la escena y libera sus InstancedMesh (geometría propia incluida); material y atlas son compartidos y no se tocan. */
    dispose() {
      scene.remove(group);
      for (const m of meshes) {
        m.geometry.dispose();
        m.dispose();
      }
    },
  };
}

export { LEVELS as GRASS_LEVELS, DRAWS_PER_TUFT as GRASS_DRAWS_PER_TUFT };
