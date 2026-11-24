import * as THREE from 'three';
import { TAU, smooth, treeLevel } from './treeKit.js';
import { windUniforms } from './wind.js';

// Agua tóxica de los temas neón (neon, neonPink, cyber2078), 2026-11-23. Solo dibujo: la física no la ve.
//
// - Color (lo usa water.js en su paleta y su sombreador): cuerpo pútrido y oscuro (lodo verde-amarillo, más
//   oscuro donde es hondo) y una capa superficial radiactiva (verde neón) que se ve más de canto (fresnel) y en lo
//   somero, rota por el ruido del normal-map: de arriba abajo, radiactivo claro -> pútrido oscuro.
// - Motas de suciedad: UNA malla de puntos (THREE.Points + ShaderMaterial) bajo la superficie. Cada mota deriva
//   en línea recta (con algo de corriente a favor del viento compartido) durante su vida, se mece con el oleaje y
//   nace y muere invisible: al volver a empezar no se ve el salto. Se dibuja ANTES que el agua (renderOrder): el
//   agua, semitransparente, se mezcla por encima y las deja ver "dentro".
// - Vapor: UNA malla de puntos aditiva sobre la superficie. Cada voluta sube (frenando), se ensancha, se inclina
//   con el viento compartido y se desvanece; todo en el sombreador, sin trabajo por fotograma en JS.
// - Tiempo: el del viento (uWind.w, vuelve a 0 cada hora). Las vidas tienen vueltas ENTERAS por hora: sin salto.
// - Reparto: puntos al azar sobre los triángulos del agua (área x cercanía a la pista, `area`), con un rng propio
//   de semilla fija: 0 tiradas del rng del hoyo, mismo resultado en cada carga.
// - Presupuesto por calidad en NEON_FX_BUDGET (Bajo < Medio < Alto); el tamaño en pantalla tiene tope (maxPx) para
//   no disparar el relleno en el móvil. Sin texturas: la forma de la mota y de la voluta sale de gl_PointCoord.

// ---------- constantes ----------

/** Colores (sRGB) y luz del agua tóxica. glow: emisión de la capa radiactiva (base + fresnel^power), menos en lo hondo. */
export const NEON_WATER = {
  deep: 0x26300a, // lodo/bilis oscuro
  shallow: 0x4d5f12, // lodo verde-amarillo somero
  surface: 0x44ff3a, // capa radiactiva
  foam: 0xc6ff4d,
  alpha: [0.4, 0.78],
  reflect: 0.45, // parte del reflejo del cielo que se queda (el cielo neón es casi negro)
  glow: { base: 0.05, fresnel: 0.7, power: 2.2, deep: 0.55, sheen: 0.35 },
  foamGlow: 0.35,
};
/** Puntos por calidad (motas bajo el agua y volutas de vapor). Medio = el del móvil. */
export const NEON_FX_BUDGET = { dirt: { low: 90, medium: 240, high: 560 }, vapor: { low: 24, medium: 60, high: 140 } };
/** Llamadas de dibujo de los efectos: motas + vapor. */
export const NEON_FX_CALLS = 2;
/** Agua del neón: lago + río (WATER_MAX_CALLS de water.js) + motas + vapor. */
export const NEON_WATER_MAX_CALLS = 2 + NEON_FX_CALLS;
/** Motas antes que el agua (river -2, lake -1); vapor después. */
export const NEON_RENDER_ORDER = { dirt: -3, vapor: 1 };
export const NEON_FX_SEED = 0x7a11c3;
const TIME_WRAP = 3600;
/** Reparto hacia la pista: peso 1 dentro de area.r y 1 / (1 + (d / fall)^2) fuera (d = metros más allá). */
const FOCUS_FALL = 25;

/**
 * Motas: minDepth = profundidad media mínima del triángulo; top/maxBelow = m bajo la superficie (y nunca más de
 * `bottom` de la profundidad del punto: quedan sobre el fondo); drift = m en línea recta en su vida; current = m
 * a favor del viento (x fuerza); cycles = vidas por hora (enteros); wobble = vaivén horizontal (m) y vertical
 * (bob) con vueltas por hora; size = diámetro (m); bright = parte de motas claras (verde enfermizo).
 */
export const DIRT = {
  minDepth: 0.25,
  top: 0.08,
  maxBelow: 1.4,
  bottom: 0.85,
  drift: 0.9,
  current: 0.5,
  cycles: [220, 420],
  wobble: { amp: 0.07, bob: 0.025, cycles: [520, 610] },
  size: [0.05, 0.12],
  bright: 0.3,
  colors: [0x2e3a0c, 0x9fe03c],
  alpha: 0.85,
  maxPx: { low: 6, medium: 8, high: 10 },
};
/**
 * Vapor: rise = m que sube en su vida; size = diámetro al nacer y al morir (m); cycles = vidas por hora (enteros);
 * wind = m que lo empuja el viento al final (x fuerza); swirl = vaivén (m) con swirlCycles vueltas por hora;
 * fadeIn / fadeOut = tramos de la vida en que aparece y se va; alpha = opacidad máxima (aditivo).
 */
export const VAPOR = {
  minDepth: 0.05,
  rise: [1.4, 2.6],
  size: [0.35, 1.9],
  cycles: [300, 520],
  wind: 1.1,
  swirl: 0.25,
  swirlCycles: 700,
  fadeIn: 0.15,
  fadeOut: 0.45,
  alpha: 0.2,
  colors: [0x5dff3a, 0xb7d63a],
  maxPx: { low: 48, medium: 64, high: 110 },
};

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
const f = (n) => {
  const s = Number(n).toString();
  return /[.e]/.test(s) ? s : s + '.0';
};
const between = (r, [a, b]) => a + (b - a) * r();
const cyclesOf = (r, [a, b]) => Math.round(a + (b - a) * r());

// ---------- matemática pura (espejo de los sombreadores) ----------

/** Brillo de la capa radiactiva (x color de superficie) con el coseno de la vista y la profundidad relativa (0 somero, 1 hondo). */
export function neonGlow(cosV, deepK) {
  const g = NEON_WATER.glow;
  const c = Math.min(1, Math.max(0, cosV));
  return (g.base + g.fresnel * Math.pow(1 - c, g.power)) * (1 - g.deep * Math.min(1, Math.max(0, deepK)));
}

/** Opacidad relativa de una mota a lo largo de su vida (0..1): nace y muere invisible. */
export const dirtFade = (life) => Math.max(0, Math.sin(Math.PI * life));

/** Voluta a lo largo de su vida (0..1): rise = parte de la subida (frena arriba), size = diámetro (m), fade = opacidad relativa. */
export function vaporPuff(life) {
  const [s0, s1] = VAPOR.size;
  return {
    rise: life * (2 - life),
    size: s0 + (s1 - s0) * Math.pow(life, 0.7),
    fade: smooth(0, VAPOR.fadeIn, life) * (1 - smooth(VAPOR.fadeOut, 1, life)),
  };
}

// ---------- reparto sobre el agua ----------

/**
 * Muestreador de puntos sobre las mallas de agua (lago/río de water.js): triángulos con profundidad media >=
 * minDepth, con peso = área x cercanía a `area` ({x, z, r}). Devuelve (rng) => [x, y, z, profundidad] o null.
 */
function waterSampler(meshes, minDepth, area) {
  const cum = [], tri = [];
  let total = 0;
  for (const m of meshes) {
    const P = m.geometry.attributes.position.array, S = m.geometry.attributes.waterShore.array, I = m.geometry.index.array, o = m.position;
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i], b = I[i + 1], c = I[i + 2];
      if ((S[a * 2] + S[b * 2] + S[c * 2]) / 3 < minDepth) continue;
      const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], cx = P[c * 3], cz = P[c * 3 + 2];
      const A = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
      if (!(A > 0)) continue;
      let w = A;
      if (area) {
        const d = Math.max(0, Math.hypot(o.x + (ax + bx + cx) / 3 - area.x, o.z + (az + bz + cz) / 3 - area.z) - area.r);
        w /= 1 + (d / FOCUS_FALL) ** 2;
      }
      total += w;
      cum.push(total);
      tri.push(m, a, b, c);
    }
  }
  if (!(total > 0)) return null;
  return (r) => {
    const k = r() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < k) lo = mid + 1;
      else hi = mid;
    }
    const [m, a, b, c] = tri.slice(lo * 4, lo * 4 + 4);
    const P = m.geometry.attributes.position.array, S = m.geometry.attributes.waterShore.array, o = m.position;
    let u = r(), v = r();
    if (u + v > 1) (u = 1 - u), (v = 1 - v);
    const w = 1 - u - v;
    return [
      o.x + P[a * 3] * w + P[b * 3] * u + P[c * 3] * v,
      o.y,
      o.z + P[a * 3 + 2] * w + P[b * 3 + 2] * u + P[c * 3 + 2] * v,
      S[a * 2] * w + S[b * 2] * u + S[c * 2] * v,
    ];
  };
}

/** n puntos del muestreador que cumplan `ok(punto)` (como mucho 20 n intentos; pueden salir menos). */
function scatter(sample, r, n, ok) {
  const out = [];
  if (!sample) return out;
  for (let tries = 0; out.length < n && tries < n * 20; tries++) {
    const p = sample(r);
    if (ok(p)) out.push(p);
  }
  return out;
}

// ---------- sombreadores ----------

const fogFade = [
  '#ifdef USE_FOG',
  '  #ifdef FOG_EXP2',
  '    float fogK = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);',
  '  #else',
  '    float fogK = smoothstep(fogNear, fogFar, vFogDepth);',
  '  #endif',
  '  a *= 1.0 - fogK;',
  '#endif',
];

/** Sombreador de las motas de una calidad (texto GLSL). */
export function dirtShaderSource(level) {
  level = treeLevel(level);
  const W = DIRT.wobble;
  const vertexShader = [
    '#include <common>',
    '#include <fog_pars_vertex>',
    'attribute vec4 aSeed;', // fase, vidas por hora, ángulo de deriva, tamaño (m)
    'attribute float aTone;',
    'uniform vec4 uWind;',
    'uniform float uScale;',
    'varying float vFade;',
    'varying float vTone;',
    'void main() {',
    '  float t = uWind.w;',
    `  float life = fract(t * aSeed.y * ${f(1 / TIME_WRAP)} + aSeed.x);`,
    '  float k = life - 0.5;',
    '  vec3 p = position;',
    `  p.xz += vec2(cos(aSeed.z), sin(aSeed.z)) * (${f(DIRT.drift)} * k) + uWind.xy * (${f(DIRT.current)} * uWind.z * k);`,
    `  p.x += ${f(W.amp)} * sin(PI2 * fract(t * ${f(W.cycles[0] / TIME_WRAP)}) + aSeed.z * 3.0);`,
    `  p.z += ${f(W.amp)} * cos(PI2 * fract(t * ${f(W.cycles[1] / TIME_WRAP)}) + aSeed.x * 11.0);`,
    `  p.y += ${f(W.bob)} * sin(PI2 * fract(t * ${f(W.cycles[1] / TIME_WRAP)}) + aSeed.z * 5.0);`,
    '  vFade = sin(PI * life);',
    '  vTone = aTone;',
    '  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);',
    '  gl_Position = projectionMatrix * mvPosition;',
    `  gl_PointSize = min(aSeed.w * projectionMatrix[1][1] * uScale / max(-mvPosition.z, 0.1), ${f(DIRT.maxPx[level])});`,
    '  #include <fog_vertex>',
    '}',
  ].join('\n');
  const fragmentShader = [
    '#include <common>',
    '#include <fog_pars_fragment>',
    'uniform vec3 uDirtA;',
    'uniform vec3 uDirtB;',
    'varying float vFade;',
    'varying float vTone;',
    'void main() {',
    '  vec2 c = gl_PointCoord - 0.5;',
    `  float a = max(0.0, 1.0 - dot(c, c) * 4.0) * vFade * ${f(DIRT.alpha)};`,
    '  gl_FragColor = vec4(mix(uDirtA, uDirtB, vTone), a);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '  #include <fog_fragment>',
    '}',
  ].join('\n');
  return { vertexShader, fragmentShader };
}

/** Sombreador del vapor de una calidad (texto GLSL). Bajo: voluta redonda; Medio y Alto: borde irregular. */
export function vaporShaderSource(level) {
  level = treeLevel(level);
  const [s0, s1] = VAPOR.size;
  const lumpy = level !== 'low';
  const vertexShader = [
    '#include <common>',
    '#include <fog_pars_vertex>',
    'attribute vec4 aSeed;', // fase, vidas por hora, tamaño relativo, subida (m)
    'attribute float aSway;',
    'uniform vec4 uWind;',
    'uniform float uScale;',
    'varying float vFade;',
    'varying float vLife;',
    'varying float vSeed;',
    'void main() {',
    '  float t = uWind.w;',
    `  float life = fract(t * aSeed.y * ${f(1 / TIME_WRAP)} + aSeed.x);`,
    '  vec3 p = position;',
    // sube frenando (vaporPuff.rise), el viento la inclina cada vez más y se mece un poco
    '  p.y += aSeed.w * life * (2.0 - life);',
    `  p.xz += uWind.xy * (${f(VAPOR.wind)} * uWind.z * life * life);`,
    `  float sw = PI2 * fract(t * ${f(VAPOR.swirlCycles / TIME_WRAP)}) + aSway;`,
    `  p.xz += ${f(VAPOR.swirl)} * life * vec2(sin(sw), cos(sw));`,
    `  float size = aSeed.z * (${f(s0)} + ${f(s1 - s0)} * pow(life, 0.7));`,
    `  vFade = smoothstep(0.0, ${f(VAPOR.fadeIn)}, life) * (1.0 - smoothstep(${f(VAPOR.fadeOut)}, 1.0, life)) * ${f(VAPOR.alpha)};`,
    '  vLife = life;',
    '  vSeed = aSway;',
    '  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);',
    '  gl_Position = projectionMatrix * mvPosition;',
    `  gl_PointSize = min(size * projectionMatrix[1][1] * uScale / max(-mvPosition.z, 0.1), ${f(VAPOR.maxPx[level])});`,
    '  #include <fog_vertex>',
    '}',
  ].join('\n');
  const fragmentShader = [
    '#include <common>',
    '#include <fog_pars_fragment>',
    'uniform vec3 uVaporA;',
    'uniform vec3 uVaporB;',
    'varying float vFade;',
    'varying float vLife;',
    'varying float vSeed;',
    'void main() {',
    '  vec2 c = gl_PointCoord - 0.5;',
    '  float d = length(c) * 2.0;',
    ...(lumpy
      ? // atan(0, 0) no está definido en todas las GPU: + 1e-5
        ['  float ang = atan(c.y, c.x + 1e-5);', '  float edge = 0.8 + 0.12 * sin(ang * 3.0 + vSeed) + 0.08 * sin(ang * 5.0 - vSeed * 2.0);']
      : ['  float edge = 0.9;']),
    '  float a = (1.0 - smoothstep(edge * 0.3, edge, d)) * vFade;',
    ...fogFade,
    '  gl_FragColor = vec4(mix(uVaporA, uVaporB, vLife), a);',
    '  #include <tonemapping_fragment>',
    '  #include <colorspace_fragment>',
    '}',
  ].join('\n');
  return { vertexShader, fragmentShader };
}

// ---------- mallas ----------

const DEFAULT_SCALE = 400; // mitad del alto del lienzo en píxeles; lo pone onBeforeRender
const tmpSize = new THREE.Vector2();

function pointsMesh(name, pts, attrs, { vertexShader, fragmentShader }, colors, opts) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => p.slice(0, 3)), 3));
  for (const [k, [data, size]] of Object.entries(attrs)) g.setAttribute(k, new THREE.Float32BufferAttribute(data, size));
  g.computeBoundingSphere();
  g.boundingSphere.radius += opts.reach; // lo que se mueve en el sombreador
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: DEFAULT_SCALE }, ...colors }]);
  uniforms.uWind = windUniforms.uWind; // compartido por referencia (merge clona)
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: true, transparent: true, depthWrite: false, blending: opts.blending });
  mat.name = name;
  const p = new THREE.Points(g, mat);
  p.name = name;
  p.renderOrder = opts.order;
  p.userData.keep = true;
  p.raycast = () => {};
  p.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(tmpSize);
    uniforms.uScale.value = tmpSize.y / 2;
  };
  return p;
}

/**
 * Motas y vapor del agua tóxica sobre las mallas de agua `meshes` (lago/río ya creados). opts: { level, area?
 * ({x, z, r}: la pista, para repartir cerca de donde mira la cámara) }. Devuelve { dirt, vapor, calls, points,
 * dispose() }; dirt/vapor pueden ser null si el agua no tiene sitio (muy somera).
 */
export function makeNeonWaterFx(meshes, { level, area = null } = {}) {
  level = treeLevel(level);
  const col = (hex) => ({ value: new THREE.Color(hex) });

  // motas: bajo la superficie, sobre el fondo
  const rd = mulberry32(NEON_FX_SEED);
  const dirtPts = scatter(waterSampler(meshes, DIRT.minDepth, area), rd, NEON_FX_BUDGET.dirt[level], (p) => p[3] * DIRT.bottom > DIRT.top);
  const dSeed = [], dTone = [];
  for (const p of dirtPts) {
    const below = Math.min(DIRT.maxBelow, Math.max(DIRT.top, p[3] * DIRT.bottom * between(rd, [0.15, 1])));
    p[1] -= below;
    dSeed.push(rd(), cyclesOf(rd, DIRT.cycles), rd() * TAU, between(rd, DIRT.size));
    dTone.push(rd() < DIRT.bright ? 0.7 + 0.3 * rd() : 0.25 * rd());
  }
  const dirt = dirtPts.length
    ? pointsMesh('water-dirt', dirtPts, { aSeed: [dSeed, 4], aTone: [dTone, 1] }, dirtShaderSource(level), { uDirtA: col(DIRT.colors[0]), uDirtB: col(DIRT.colors[1]) }, {
        order: NEON_RENDER_ORDER.dirt,
        blending: THREE.NormalBlending,
        reach: DIRT.drift + DIRT.current + DIRT.wobble.amp,
      })
    : null;

  // vapor: nace en la superficie
  const rv = mulberry32(NEON_FX_SEED + 1);
  const vapPts = scatter(waterSampler(meshes, VAPOR.minDepth, area), rv, NEON_FX_BUDGET.vapor[level], (p) => p[3] > VAPOR.minDepth);
  const vSeed = [], vSway = [];
  for (const p of vapPts) {
    vSeed.push(rv(), cyclesOf(rv, VAPOR.cycles), between(rv, [0.7, 1.3]), between(rv, VAPOR.rise));
    vSway.push(rv() * TAU);
  }
  const vapor = vapPts.length
    ? pointsMesh('water-vapor', vapPts, { aSeed: [vSeed, 4], aSway: [vSway, 1] }, vaporShaderSource(level), { uVaporA: col(VAPOR.colors[0]), uVaporB: col(VAPOR.colors[1]) }, {
        order: NEON_RENDER_ORDER.vapor,
        blending: THREE.AdditiveBlending,
        reach: VAPOR.rise[1] + VAPOR.wind + VAPOR.swirl + VAPOR.size[1],
      })
    : null;

  const list = [dirt, vapor].filter(Boolean);
  let alive = true;
  return {
    dirt,
    vapor,
    calls: list.length,
    points: { dirt: dirtPts.length, vapor: vapPts.length },
    /** Libera geometrías y materiales (propios de este hoyo). Quitar de la escena lo hace quien los añadió. */
    dispose() {
      if (!alive) return;
      alive = false;
      for (const p of list) {
        p.geometry.dispose();
        p.material.dispose();
      }
    },
  };
}
