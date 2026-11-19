import * as THREE from 'three';
import { TAU, lerp, smooth, treeLevel, vertexLambert } from './treeKit.js';
import { floraOf } from '../flora.js';

// Rocas del estilo liso (paso 7 de 02-DOCS/wiki/ftd/assets-entorno-1a1.md).
//
// Cuatro tipos: canto rodado (una piedra redondeada), losa plana (ancha y baja), grupo de
// piedras (3-5 piedras de distinto tamaño, apoyadas en el suelo) y montón (5-8 piedras
// apiladas: grandes abajo, medianas encima y una pequeña arriba, alguna inclinada; del
// tamaño del `rockpile` de hoy, sin escalar).
// Tres piedras (`material`): gris (con musgo en temas verdes), `bare` (gris sin musgo aunque el
// tema sea verde) y `sandstone` (arenisca: ocres, arena y siena con estratos horizontales, sin musgo).
// - Forma lisa: icosaedro con los vértices soldados y normales suavizadas (sin flatShading),
//   abollado con tres ondas y con 1-2 planos tallados (la piedra se aplana contra un plano:
//   queda una cara casi plana con el borde redondeado por las normales) y la base cortada
//   plana, enterrada 3 cm.
// - Color por capas en el vértice: piedra gris con un poco de ruido; la base, donde toca el
//   suelo, más oscura; y musgo arriba según la normal hacia arriba, SOLO en temas verdes
//   (hojas verdes en preset.theme y, si el preset trae el tema entero en sceneTheme, suelo
//   de hierba: `preset.theme` por sí solo trae hojas verdes por defecto en cualquier tema).
// - Las rocas no se mueven con el viento: material sin viento, sin swayRoot.
//
// Móvil primero: un solo material Lambert compartido (color en el vértice) y una malla por
// roca (ROCK_MAX_DRAW_CALLS = 1); tras bakeStatic, todas las rocas del hoyo son una llamada.
// Presupuesto de triángulos por roca en ROCK_BUDGET. Todas las tiradas salen del rng
// recibido, son siempre las mismas y no dependen de la calidad ni del tipo: misma semilla,
// misma roca en Bajo, Medio y Alto (solo cambia la subdivisión). El ajuste al presupuesto
// no tira nada.

export const ROCK_TYPES = ['boulder', 'slab', 'group', 'pile'];
export const ROCK_TYPE_INFO = {
  boulder: { label: 'Canto rodado' },
  slab: { label: 'Losa plana' },
  group: { label: 'Grupo de piedras' },
  pile: { label: 'Montón de piedras' },
};
export const ROCK_STONES = ['gray', 'bare', 'sandstone'];
export const ROCK_STONE_INFO = {
  gray: { label: 'gris (musgo en temas verdes)' },
  bare: { label: 'sin musgo' },
  sandstone: { label: 'arenisca' },
};
export const ROCK_VARIANTS = 3;
export const ROCK_BUDGET = { low: 100, medium: 240, high: 480 }; // triángulos por roca (canto, losa y grupo)
export const ROCK_BUDGET_PILE = { low: 160, medium: 360, high: 720 }; // el montón: hasta 8 piedras (8 x 20 = 160 en Bajo)
export const ROCK_MAX_DRAW_CALLS = 1; // una malla por roca (medido en tests/rock.test.js)
export const ROCK_MAX_STONES = 8;
export const PILE_STONES = [5, 8]; // piedras del montón (mín., máx.)
const budgetOf = (type, level) => (type === 'pile' ? ROCK_BUDGET_PILE : ROCK_BUDGET)[level];
export const ROCK_DEFAULTS = { stone: 0x9a9894 };

const MAX_DETAIL = { low: 1, medium: 2, high: 3 }; // subdivisión máxima del icosaedro por calidad
const GROUND = -0.03; // la base de cada piedra queda 3 cm bajo el suelo
const BASE_CUT = 0.55; // fracción de la mitad de alto que se corta por abajo
const PILE_RING = 0.78; // distancia al centro de las piedras de la base, en radios
const PILE_SINK = 0.96; // las de arriba se hunden un 4 % en las de abajo
const STONE_DRAWS = 32; // tiradas fijas por piedra (se tiran siempre, 8 piedras, se usen o no)
const tris = (detail) => 20 * (detail + 1) ** 2;

// proporciones (x, y, z respecto al radio) de cada variante por tipo
const SHAPES = {
  boulder: [
    { a: [1, 0.86, 0.94], size: [0.46, 0.6] }, // redondo
    { a: [0.84, 1.05, 0.8], size: [0.42, 0.56] }, // alto
    { a: [1.16, 0.76, 0.9], size: [0.44, 0.58] }, // ancho y tumbado
  ],
  slab: [
    { a: [1, 0.17, 0.66], size: [0.72, 0.9] }, // losa larga
    { a: [0.86, 0.22, 0.86], size: [0.65, 0.82] }, // casi cuadrada
    { a: [1.1, 0.14, 0.58], size: [0.7, 0.88] }, // fina y estrecha
  ],
  group: [
    { a: [1, 0.78, 0.92], size: [0.42, 0.5] },
    { a: [0.9, 0.9, 0.9], size: [0.4, 0.48] },
    { a: [1.1, 0.7, 0.86], size: [0.44, 0.52] },
  ],
  // montón: size = radio de las piedras de la base; lean = cuánto se inclinan las de arriba (rad)
  pile: [
    { a: [1, 0.9, 0.95], size: [0.76, 0.88], lean: 0.3 }, // montículo
    { a: [0.92, 1.05, 0.9], size: [0.66, 0.78], ring: 1.08, lean: 0.4 }, // torre
    { a: [1.1, 0.82, 0.95], size: [0.76, 0.86], lean: 0.55 }, // ancho y apoyado de lado
  ],
};

// arenisca: de siena (oscuro) a arena (claro), en estratos
const SAND = { dark: 0x9c5f34, mid: 0xc8975c, light: 0xe3c58f };
const STRATA_PERIOD = 0.27; // m entre estratos

// ---------- paleta ----------

const hueSat = (hex) => new THREE.Color(hex).getHSL({});
/** ¿Es verde esta hoja? (matiz entre amarillo-verdoso y verde azulado, con color). */
const isGreen = (hex) => {
  const { h, s } = hueSat(hex);
  return h >= 0.17 && h <= 0.45 && s >= 0.2;
};

/**
 * Paleta de la roca para un tema: { stone, moss } con moss = null si el tema no es verde.
 * theme: preset.theme ({ leaves, bark }); scene: el tema entero (preset.sceneTheme), opcional.
 * Verde = al menos la mitad de las hojas verdes Y, si hay tema entero, suelo de hierba.
 */
export function rockPalette(theme, scene = null, stone = null, material = 'gray') {
  const leaves = theme?.leaves?.length ? theme.leaves : [];
  const greens = leaves.filter(isGreen);
  const grass = !scene || (floraOf(scene).ground === 'grass' && !scene.neon);
  const green = greens.length > 0 && greens.length * 2 >= leaves.length && grass;
  const sand = material === 'sandstone';
  return { stone: stone ?? theme?.stone ?? ROCK_DEFAULTS.stone, moss: green && material !== 'bare' && !sand ? greens : null, strata: sand, material: ROCK_STONES.includes(material) ? material : 'gray' };
}

// ---------- material (compartido por todas las rocas) ----------

let MAT = null;
/** El mismo material para todas las rocas: Lambert liso, color en el vértice, sin viento. */
export function rockMaterial() {
  if (!MAT) MAT = vertexLambert();
  return MAT;
}

// ---------- plan: todas las tiradas del rng (no dependen de la calidad ni del tipo) ----------

function planRock(rng, opts) {
  const vr = rng();
  const variant = Number.isInteger(opts.variant) ? ((opts.variant % ROCK_VARIANTS) + ROCK_VARIANTS) % ROCK_VARIANTS : Math.floor(vr * ROCK_VARIANTS);
  const mossPick = rng();
  const nr = rng();
  const stones = Array.from({ length: ROCK_MAX_STONES }, () => {
    const u = Array.from({ length: STONE_DRAWS }, () => rng());
    return { u, waves: [0, 1, 2].map((k) => ({ d: new THREE.Vector3(u[8 + k * 4] - 0.5, u[9 + k * 4] - 0.5, u[10 + k * 4] - 0.5).normalize(), f: 2.2 * (0.7 + u[11 + k * 4] * 0.9), ph: u[20 + k] * TAU })) };
  });
  return { variant, mossPick, nr, count: 3 + Math.min(2, Math.floor(nr * 3)), stones };
}

// ---------- geometría ----------

const ICO = new Map();
/** Icosaedro unitario sin índice, con una clave por posición (vértices soldados). */
function unitIco(detail) {
  if (!ICO.has(detail)) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const pos = g.attributes.position.array.slice();
    const ids = new Map();
    const key = new Int32Array(pos.length / 3);
    for (let i = 0; i < key.length; i++) {
      const k = `${pos[i * 3].toFixed(4)},${pos[i * 3 + 1].toFixed(4)},${pos[i * 3 + 2].toFixed(4)}`;
      if (!ids.has(k)) ids.set(k, ids.size);
      key[i] = ids.get(k);
    }
    g.dispose();
    ICO.set(detail, { pos, key, n: ids.size });
  }
  return ICO.get(detail);
}

/**
 * Las piedras del plan que entran en la roca, ya con sitio, tamaño y planos.
 * Cada piedra: { c (centro), h (medio alto), ex (semiejes), planes, ... }.
 */
function layout(plan, type) {
  if (type === 'pile') return layoutPile(plan);
  const S = SHAPES[type][plan.variant];
  const n = type === 'group' ? plan.count : 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const { u, waves } = plan.stones[i];
    // el grupo: la primera piedra es la mayor, las demás bajan de tamaño
    const R = lerp(S.size[0], S.size[1], u[0]) * (type === 'group' ? lerp(1, 0.45, i / 4) * (1 + (u[1] - 0.5) * 0.2) : 1);
    const st = stoneSpec(u, waves, S, R, type, i);
    let x = 0, z = 0;
    if (i > 0) {
      const a = (i / (n - 1)) * TAU + u[3] * 1.6; // reparto en anillo con algo de desorden
      const first = out[0].ex.x;
      const dist = (first + st.ex.x) * lerp(0.62, 0.82, u[4]);
      x = Math.cos(a) * dist;
      z = Math.sin(a) * dist;
    }
    st.c.set(x, st.hb + GROUND, z);
    out.push(st);
  }
  return out;
}

/** Una piedra sin colocar: semiejes, planos tallados, base y ruido (c = 0, se coloca después). */
function stoneSpec(u, waves, S, R, type, rank) {
  const asp = S.a.map((v, k) => v * (0.94 + 0.12 * u[2 + k]));
  const ex = new THREE.Vector3(R * asp[0], R * asp[1], R * asp[2]);
  // planos tallados: normal en el hemisferio de arriba (la losa lleva el primero casi vertical)
  const planes = [0, 1].map((k) => {
    const az = u[23 + k * 3] * TAU;
    const el = type === 'slab' && k === 0 ? lerp(1.35, 1.5, u[24 + k * 3]) : lerp(0.1, 1.25, u[24 + k * 3]);
    const nrm = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const support = Math.hypot(ex.x * nrm.x, ex.y * nrm.y, ex.z * nrm.z);
    const cut = type === 'slab' && k === 0 ? lerp(0.5, 0.62, u[25 + k * 3]) : lerp(0.64, 0.84, u[25 + k * 3]);
    return { n: nrm, h: support * cut };
  });
  const hb = ex.y * BASE_CUT;
  return { ex, planes, hb, c: new THREE.Vector3(), amp: 0.07 + 0.05 * u[5], waves, tint: (u[6] - 0.5) * 0.14, patch: u[7] * TAU, rank, q: null };
}

/** Altura (y) del punto más alto de una piedra ya colocada (muestreo del icosaedro 1, sin tiradas). */
function stoneTop(st) {
  const { pos } = unitIco(1);
  const d = new THREE.Vector3(), p = new THREE.Vector3();
  let top = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    d.fromArray(pos, i);
    stonePoint(st, d, p);
    if (st.q) p.applyQuaternion(st.q);
    top = Math.max(top, p.y);
  }
  return st.c.y + top;
}

/**
 * Montón: 5-8 piedras en tres pisos. Base (3-4 piedras grandes en anillo, en el suelo), medio
 * (1-2 medianas sobre los huecos de la base) y cima (1-2 pequeñas, la última inclinada).
 * Las de arriba se hunden algo en las de abajo y se inclinan (S.lean); el sitio sale de las
 * tiradas fijas de cada piedra (u[3], u[4], u[29]-u[31]).
 */
function layoutPile(plan) {
  const S = SHAPES.pile[plan.variant];
  const span = PILE_STONES[1] - PILE_STONES[0];
  const n = PILE_STONES[0] + Math.min(span, Math.floor(plan.nr * (span + 1)));
  const nb = n >= 7 ? 4 : 3, nt = n >= 8 ? 2 : 1, nm = n - nb - nt;
  const R0 = lerp(S.size[0], S.size[1], plan.stones[0].u[0]);
  const ring = R0 * (S.ring ?? PILE_RING);
  const spin = plan.stones[0].u[3] * TAU; // giro del conjunto
  const out = [];
  const mk = (i, R) => {
    const { u, waves } = plan.stones[i];
    return stoneSpec(u, waves, S, R * (1 + (u[1] - 0.5) * 0.2), 'pile', i);
  };
  const tilt = (st, u, k) => {
    const az = u[30] * TAU;
    st.q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(az), 0, Math.sin(az)), S.lean * k * (0.5 + 0.5 * u[31]) * (u[31] > 0.5 ? 1 : -1));
  };
  for (let i = 0; i < nb; i++) {
    const st = mk(i, R0 * lerp(1, 0.82, i / 3));
    const u = plan.stones[i].u;
    const a = spin + (i / nb) * TAU + (u[29] - 0.5) * 0.5;
    const dist = ring * lerp(0.85, 1.1, u[4]);
    st.c.set(Math.cos(a) * dist, st.hb + GROUND, Math.sin(a) * dist);
    out.push(st);
  }
  const baseTop = out.reduce((m, st) => m + stoneTop(st), 0) / nb;
  for (let j = 0; j < nm; j++) {
    const i = nb + j, u = plan.stones[i].u;
    const st = mk(i, R0 * lerp(0.7, 0.56, j / 2));
    const a = spin + ((j + 0.5) / nm) * TAU + (u[29] - 0.5) * 0.6;
    const dist = ring * lerp(0.22, 0.48, u[4]);
    tilt(st, u, 0.8);
    st.c.set(Math.cos(a) * dist, baseTop * PILE_SINK + st.hb, Math.sin(a) * dist);
    out.push(st);
  }
  const midTop = nm ? out.slice(nb).reduce((m, st) => Math.max(m, stoneTop(st)), 0) : baseTop;
  for (let k = 0; k < nt; k++) {
    const i = nb + nm + k, u = plan.stones[i].u;
    const st = mk(i, R0 * lerp(0.46, 0.34, k));
    const a = spin + u[29] * TAU;
    const dist = k === 0 ? ring * 0.12 * u[4] : ring * lerp(0.35, 0.55, u[4]);
    tilt(st, u, k === 0 ? 0.6 : 1.1);
    st.c.set(Math.cos(a) * dist, (k === 0 ? midTop : (baseTop + midTop) / 2) * PILE_SINK + st.hb, Math.sin(a) * dist);
    out.push(st);
  }
  return out;
}

const _d = new THREE.Vector3(), _p = new THREE.Vector3();
const _mid = new THREE.Color(), _light = new THREE.Color();
/** Punto de la piedra en la dirección unitaria d (en el espacio de la piedra, sin colocar). */
function stonePoint(st, d, out) {
  let bump = 0;
  for (const w of st.waves) bump += Math.sin(d.dot(w.d) * w.f + w.ph);
  const s = 1 + (bump / st.waves.length) * st.amp;
  out.set(d.x * st.ex.x * s, d.y * st.ex.y * s, d.z * st.ex.z * s);
  for (const pl of st.planes) {
    const excess = out.dot(pl.n) - pl.h;
    if (excess > 0) out.addScaledVector(pl.n, -excess); // plano tallado
  }
  if (out.y < -st.hb) out.y = -st.hb; // base plana, apoyada en el suelo
  return out;
}

const noise3 = (p, st) => {
  let s = 0;
  for (const w of st.waves) s += Math.sin(p.x * w.d.x * 5 + p.y * w.d.y * 5 + p.z * w.d.z * 5 + w.ph * 1.7);
  return s / 3; // -1..1
};

/** Triángulos de la piedra en `detail`; devuelve { pos, nor, col } (sin índice) o solo la cuenta. */
function buildStone(st, detail, palette, mossColor, out) {
  const { pos: unit, key, n } = unitIco(detail);
  const count = unit.length / 9;
  if (!out) return count;
  const pts = Array.from({ length: n }, () => null);
  const nrm = Array.from({ length: n }, () => new THREE.Vector3());
  const P = new Array(count * 3);
  for (let i = 0; i < count * 3; i++) {
    _d.fromArray(unit, i * 3);
    const k = key[i];
    if (!pts[k]) {
      pts[k] = stonePoint(st, _d, new THREE.Vector3());
      if (st.q) pts[k].applyQuaternion(st.q); // piedra inclinada (solo las de arriba del montón)
      pts[k].add(st.c);
    }
    P[i] = pts[k];
  }
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let f = 0; f < count; f++) {
    const a = P[f * 3], b = P[f * 3 + 1], c = P[f * 3 + 2];
    fn.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)); // sin normalizar: pesa por área
    for (let v = 0; v < 3; v++) nrm[key[f * 3 + v]].add(fn);
  }
  nrm.forEach((v) => v.normalize());
  const yMax = Math.max(...pts.map((p) => p.y));
  const yMin = st.q ? Math.min(...pts.map((p) => p.y)) : st.c.y - st.hb;
  const stone = new THREE.Color(palette.stone);
  const shade = (p, nn, out2) => {
    const q = _p.copy(p).sub(st.c);
    const r = 1 + 0.07 * noise3(q, st) + st.tint;
    let c;
    if (palette.strata) {
      // estratos horizontales suaves: bandas por altura (en el espacio de la roca) con el borde ondulado por el ruido
      const wave = Math.sin((p.y / STRATA_PERIOD + 0.25 * noise3(q, st)) * TAU);
      const wave2 = Math.sin((p.y / (STRATA_PERIOD * 0.37) + 0.5 * st.patch) * TAU);
      const band = Math.max(0, Math.min(1, 0.5 + 0.3 * wave + 0.1 * wave2));
      c = new THREE.Color(SAND.dark).lerp(_mid.set(SAND.mid), Math.min(1, band * 2)).lerp(_light.set(SAND.light), Math.max(0, band * 2 - 1));
      c.multiplyScalar(r);
      c.lerp(_light, 0.12 * smooth(0, 1.4, p.y)); // más claro arriba
    } else c = stone.clone().multiplyScalar(r);
    if (mossColor) {
      // musgo arriba (normal hacia arriba) con manchas: algo de ruido mueve el borde
      const w = smooth(0.4, 0.78, nn.y + 0.2 * noise3(q, st));
      c.lerp(mossColor, 0.95 * w);
    }
    // base oscura donde toca el suelo
    const t = Math.max(0, Math.min(1, (p.y - yMin) / Math.max(1e-6, yMax - yMin)));
    c.multiplyScalar(0.5 + 0.5 * smooth(0, 0.42, t));
    return out2.copy(c);
  };
  const col = new THREE.Color();
  for (let i = 0; i < count * 3; i++) {
    const p = P[i];
    let nn = nrm[key[i]];
    out.pos.push(p.x, p.y, p.z);
    // la base plana (bajo tierra) no mira hacia abajo: así la losa fina no tiene saltos de 180 grados en el borde
    if (p.y <= yMin + 1e-5 && nn.y < -0.25) {
      _p.set(p.x - st.c.x, 0, p.z - st.c.z);
      nn = _p.lengthSq() > 1e-8 ? _p.normalize().setY(-0.25).normalize().clone() : nn;
    }
    out.nor.push(nn.x, nn.y, nn.z);
    shade(p, nn, col);
    out.col.push(col.r, col.g, col.b);
  }
  return count;
}

/**
 * Subdivisión de cada piedra sin pasar del presupuesto. Una piedra sola: la mayor que cabe.
 * Un grupo: todas en 0 y se sube de una en una, de la mayor a la menor, mientras quepa.
 */
function fitDetail(stones, level, type) {
  const budget = budgetOf(type, level), max = MAX_DETAIL[level];
  const lv = stones.map(() => 0);
  let total = lv.reduce((s, d) => s + tris(d), 0);
  for (let moved = true; moved; ) {
    moved = false;
    for (let i = 0; i < lv.length; i++) {
      if (lv[i] >= max) continue;
      const add = tris(lv[i] + 1) - tris(lv[i]);
      if (total + add > budget) continue;
      lv[i]++;
      total += add;
      moved = true;
    }
  }
  return lv;
}

/**
 * Roca lisa. Devuelve un Group en el origen (base en y ≈ 0) con una malla (material
 * rockMaterial()); quien la usa la coloca, gira y escala. No lleva swayRoot (no se mueve).
 * - rng: generador con semilla (todas las formas salen de él)
 * - quality: 'low' | 'medium' | 'high', el preset del laboratorio ({ level, theme?, sceneTheme? }), { lod } o 0/1/2
 * - opts: { type?: 'boulder'|'slab'|'group'|'pile', variant?: 0..2, material?: 'gray'|'bare'|'sandstone',
 *   theme?, sceneTheme?, stone? (color hex de la piedra gris) }
 *   Musgo solo si la paleta es verde (rockPalette).
 */
export function makeRock(rng, quality = 'medium', opts = {}) {
  const level = treeLevel(quality);
  const type = ROCK_TYPES.includes(opts.type) ? opts.type : 'boulder';
  const q = quality && typeof quality === 'object' ? quality : {};
  const palette = rockPalette(opts.theme ?? q.theme, opts.sceneTheme ?? q.sceneTheme, opts.stone, opts.material);
  const plan = planRock(rng, opts);
  const stones = layout(plan, type);
  const lv = fitDetail(stones, level, type);
  const moss = palette.moss ? new THREE.Color(palette.moss[Math.floor(plan.mossPick * palette.moss.length) % palette.moss.length]).offsetHSL(0, -0.05, 0) : null;
  const buf = { pos: [], nor: [], col: [] };
  let total = 0;
  stones.forEach((st, i) => {
    total += buildStone(st, lv[i], palette, moss, buf);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, rockMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.userData.rock = { type, material: palette.material, variant: plan.variant, level, triangles: total, stones: stones.length, mossy: !!moss, details: lv, planes: stones.map((st) => ({ center: st.c.toArray(), cuts: st.planes.map((pl) => ({ n: pl.n.toArray(), h: pl.h })) })) };
  return g;
}
