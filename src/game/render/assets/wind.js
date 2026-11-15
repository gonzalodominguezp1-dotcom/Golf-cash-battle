import * as THREE from 'three';

// Viento compartido de todos los entornos naturales: una sola fuente de verdad
// que mueve árboles, arbustos, césped, flores y juncos. Solo es dibujo: la física
// del hoyo no lo ve.
//
// Tres capas, todas en el sombreador de vértices (nada se mueve desde el procesador):
// - doblado del tronco: lento, crece con la altura al cuadrado, a favor del viento;
// - balanceo de copa/rama: medio, con una fase propia por pieza;
// - aleteo de hojas y puntas: rápido y pequeño.
// La fuerza en cada punto es una brisa que rueda por el campo más las ráfagas, que
// son frentes que VIAJAN por el mundo a favor del viento: la ola se ve pasar por el
// césped y luego por los árboles que están detrás.
//
// Móvil primero: unos pocos senos y una exp por vértice, sin texturas ni bucles.
// La matemática está duplicada en JS (windDisplacement) para poder probarla; el
// sombreador se genera desde las mismas constantes.

// ---------- constantes (las mismas en JS y en GLSL) ----------

/** Nombres de los atributos de vértice del viento (bakeStatic los conserva). */
export const WIND_ATTRS = ['sway', 'windPhase', 'windFlutter'];
/** Tamaño de cada atributo: sway = altura sobre la base (m); windPhase = (fase del árbol, fase de la pieza); windFlutter = peso del aleteo (0..1). */
export const WIND_ATTR_SIZES = { sway: 1, windPhase: 2, windFlutter: 1 };

/**
 * Capas. bend/sway/flutter: metros de movimiento con fuerza 1 y brisa media, a la
 * altura `height` (m) del asset. piecePhase: el balanceo usa la fase de cada pieza
 * (copas) o la del conjunto entero (flores: tallo, pétalos y botón van juntos).
 * El tronco y la copa de un mismo árbol comparten bend y height: se doblan igual
 * y la copa no se despega del tronco.
 */
export const WIND_LAYERS = {
  trunk: { bend: 0.14, sway: 0, flutter: 0, height: 3, piecePhase: false },
  canopy: { bend: 0.14, sway: 0.04, flutter: 0.012, height: 3, piecePhase: true },
  leaf: { bend: 0.14, sway: 0.07, flutter: 0.035, height: 3, piecePhase: true },
  grass: { bend: 0.05, sway: 0.015, flutter: 0.006, height: 0.35, piecePhase: true },
  flower: { bend: 0.04, sway: 0.012, flutter: 0.003, height: 0.35, piecePhase: false },
};

const GUST_GAIN = 1.8; // cuánto suma una ráfaga encima de la brisa (x fuerza)
const GUST_SPEED = 12; // m/s a los que viaja el frente
const GUST_WIDTH = 7; // m de ancho del frente (detrás cae el doble de despacio)
const GUST_SLOTS = 2; // ráfagas a la vez (dos huecos en el uniforme)
const GUST_FADE = 0.5; // s de fundido de la ráfaga que deja su hueco a otra
const TIME_WRAP = 3600; // el tiempo del sombreador vuelve a 0 cada hora (precisión de float)
const MAX_DT = 0.1;
// brisa de fondo: dos ondas que ruedan a favor del viento (0,4..1 con fuerza 1)
const BREEZE = [0.7, 0.2, 0.16, 1.2, 0.1, 0.41, 2.3, 1.7];
// frecuencias (rad/s) de cada capa
const F_BEND = 0.7, F_SWAY_A = 1.9, F_SWAY_B = 1.45, F_FLUT = [7.3, 8.9, 6.1];
const FLUT_Q = [3.1, 4.3, 2.7];

// ---------- matemática pura (espejo del sombreador) ----------

/** Envolvente de una ráfaga en la coordenada d (a lo largo del viento): 1 en el frente. */
export function gustEnvelope(d, front, width = GUST_WIDTH) {
  const k = (d - front) / (width * (d < front ? 2 : 1));
  return Math.exp(-k * k);
}

/** Fuerza del viento (x fuerza) en la coordenada d y el tiempo t: brisa + ráfagas. */
export function windAmp(d, t, strength, gusts = [], width = GUST_WIDTH) {
  const [b0, b1, k1, w1, b2, k2, w2, ph2] = BREEZE;
  let g = 0;
  for (const q of gusts) g += q.amp * gustEnvelope(d, q.front, width);
  return strength * (b0 + b1 * Math.sin(d * k1 - t * w1) + b2 * Math.sin(d * k2 - t * w2 + ph2) + GUST_GAIN * g);
}

const layerOf = (layer) => {
  const L = typeof layer === 'string' ? WIND_LAYERS[layer] : layer;
  if (!L) throw new Error(`viento: capa desconocida (${layer})`);
  return L;
};

/**
 * Desplazamiento (m, en el mundo) de un vértice. Igual que el sombreador.
 * p: { x, y, z } posición en el mundo (x, z también es donde se mide la fuerza),
 *    h altura sobre la base (m), p0 fase del conjunto, p1 fase de la pieza, w peso del aleteo.
 * layer: nombre de WIND_LAYERS o un objeto con sus mismos campos.
 * state: { strength, dirX, dirZ, gusts: [{ front, amp }], gustWidth } (ver windSample()).
 */
export function windDisplacement(p, layer, t, state) {
  const L = layerOf(layer);
  const { strength, dirX, dirZ } = state;
  const h = Math.max(0, p.h);
  const A = windAmp(p.x * dirX + p.z * dirZ, t, strength, state.gusts, state.gustWidth ?? GUST_WIDTH);
  const r = h / L.height;
  const bend = L.bend * r * r * A * (0.8 + 0.2 * Math.sin(t * F_BEND + p.p0));
  let x = dirX * bend, y = 0, z = dirZ * bend;
  if (L.sway) {
    const ph = L.piecePhase ? p.p1 : p.p0;
    const s = L.sway * r * A;
    const s1 = Math.sin(t * F_SWAY_A + ph), s2 = 0.6 * Math.sin(t * F_SWAY_B + ph * 1.3);
    x += (dirX * s1 - dirZ * s2) * s;
    z += (dirZ * s1 + dirX * s2) * s;
  }
  if (L.flutter) {
    const f = L.flutter * (p.w ?? 1) * A * Math.min(r, 1);
    const q = p.x * FLUT_Q[0] + p.y * FLUT_Q[1] + p.z * FLUT_Q[2];
    x += Math.sin(t * F_FLUT[0] + q) * f;
    y += 0.5 * Math.sin(t * F_FLUT[1] + q * 1.3) * f;
    z += Math.sin(t * F_FLUT[2] + q * 0.7) * f;
  }
  // al doblarse, la punta baja: la pieza no se estira
  y -= (x * x + z * z) / (2 * Math.max(h, 0.05));
  return { x, y, z };
}

// ---------- estado global ----------

/** Estado del viento. strength 0..2 (def 1); dirX/dirZ unitario; gust = intensidad de ráfaga en el centro del campo (0..1). */
export const windState = { strength: 1, dirX: 1, dirZ: 0, gust: 0, angle: 0, autoGusts: true };

/** Uniformes compartidos por todos los materiales con viento. */
export const windUniforms = {
  uWind: { value: new THREE.Vector4(1, 0, 1, 0) }, // dirX, dirZ, fuerza, tiempo
  uGust: { value: new THREE.Vector4(0, 0, 0, 0) }, // frente A, amp A, frente B, amp B
  uGustW: { value: GUST_WIDTH },
};

let time = 0;
let gusts = []; // { s: avance relativo al centro del campo (m), amp, fading, fade: s que le quedan al fundido }
let pending = null; // ráfaga que espera hueco (entra al acabar el fundido)
const field = { x: 0, z: 0, radius: 30 };
let rng = mulberry32(1);
let nextAuto = 4;

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

const fieldD = () => field.x * windState.dirX + field.z * windState.dirZ;
const gustStart = () => -(field.radius + 3 * GUST_WIDTH);
const gustEnd = () => field.radius + 6 * GUST_WIDTH;

/** Muestra del viento actual para windDisplacement/windAmp: { strength, dirX, dirZ, gusts: [{front, amp}], gustWidth, t }. */
export function windSample() {
  const c = fieldD();
  return {
    strength: windState.strength,
    dirX: windState.dirX,
    dirZ: windState.dirZ,
    gusts: gusts.map((g) => ({ front: c + g.s, amp: g.fading ? (g.amp * Math.max(0, g.fade)) / GUST_FADE : g.amp })),
    gustWidth: GUST_WIDTH,
    t: time % TIME_WRAP,
  };
}

/** Fuerza del viento ahora mismo en un punto del mundo (x fuerza; brisa ~0,4..1, con ráfaga hasta ~2,8). */
export function windAmplitude(x, z) {
  const s = windSample();
  return windAmp(x * s.dirX + z * s.dirZ, s.t, s.strength, s.gusts, s.gustWidth);
}

function sync() {
  const s = windSample();
  windUniforms.uWind.value.set(s.dirX, s.dirZ, s.strength, s.t);
  const [a, b] = s.gusts;
  windUniforms.uGust.value.set(a?.front ?? 0, a?.amp ?? 0, b?.front ?? 0, b?.amp ?? 0);
  windUniforms.uGustW.value = GUST_WIDTH;
  windState.gust = s.gusts.reduce((m, g) => Math.max(m, g.amp * gustEnvelope(fieldD(), g.front)), 0);
}

/** Cambia fuerza (0..2) y/o dirección (angle en radianes; 0 = hacia +X). autoGusts: ráfagas solas cada pocos segundos. */
export function setWind({ strength, angle, autoGusts } = {}) {
  if (Number.isFinite(strength)) windState.strength = Math.min(2, Math.max(0, strength));
  if (Number.isFinite(angle)) {
    windState.angle = angle;
    windState.dirX = Math.cos(angle);
    windState.dirZ = Math.sin(angle);
  }
  if (typeof autoGusts === 'boolean') windState.autoGusts = autoGusts;
  sync();
}

/** Zona que cruzan las ráfagas (el hoyo y su decorado): centro y radio en metros. */
export function setWindField({ x = 0, z = 0, radius = 30 } = {}) {
  Object.assign(field, { x, z, radius: Math.max(1, radius) });
  sync();
}

/**
 * Lanza una ráfaga que entra por barlovento y cruza el campo. amp 0..1 (def 1).
 * Sin hueco libre, la más avanzada se funde en GUST_FADE s (nunca se quita de golpe:
 * sería un salto visible) y la nueva entra al acabar el fundido, aún fuera del campo.
 */
export function triggerGust({ amp = 1 } = {}) {
  const g = { s: gustStart(), amp: Math.min(1, Math.max(0, amp)), fading: false, fade: 0 };
  if (gusts.length < GUST_SLOTS) gusts.push(g);
  else {
    if (!gusts.some((q) => q.fading)) Object.assign(gusts.reduce((a, b) => (b.s > a.s ? b : a)), { fading: true, fade: GUST_FADE });
    pending = g; // si ya esperaba otra, la última manda
  }
  sync();
}

/** Avanza el viento (tiempo y ráfagas). Llamar una vez por fotograma. */
export function updateWind(dt) {
  dt = Number.isFinite(dt) ? Math.min(MAX_DT, Math.max(0, dt)) : 0;
  time += dt;
  for (const g of gusts) {
    g.s += GUST_SPEED * dt;
    if (g.fading) g.fade -= dt;
  }
  gusts = gusts.filter((g) => g.s < gustEnd() && !(g.fading && g.fade <= 0));
  if (pending && gusts.length < GUST_SLOTS) {
    gusts.push(pending);
    pending = null;
  }
  if (windState.autoGusts) {
    nextAuto -= dt;
    if (nextAuto <= 0) {
      // la automática solo sale si hay hueco; si no, se vuelve a intentar en un rato
      if (gusts.length < GUST_SLOTS && !pending) {
        triggerGust({ amp: 0.6 + rng() * 0.4 });
        nextAuto = 6 + rng() * 8;
      } else nextAuto = 1;
    }
  }
  sync();
}

/** Vuelve al viento por defecto (tiempo 0, sin ráfagas). seed: semilla de las ráfagas automáticas. */
export function resetWind({ seed = 1 } = {}) {
  time = 0;
  gusts = [];
  pending = null;
  rng = mulberry32(seed);
  nextAuto = 4;
  Object.assign(field, { x: 0, z: 0, radius: 30 });
  Object.assign(windState, { strength: 1, dirX: 1, dirZ: 0, gust: 0, angle: 0, autoGusts: true });
  sync();
}

// ---------- sombreador ----------

const f = (n) => {
  const s = Number(n).toString();
  return /[.e]/.test(s) ? s : s + '.0';
};

/** Trozo GLSL que mueve `transformed` (para begin_vertex). cfg: { bend, sway, flutter, height, piecePhase, source }. */
export function windVertexChunk(cfg) {
  const [b0, b1, k1, w1, b2, k2, w2, ph2] = BREEZE.map(f);
  const attr = cfg.source !== 'y';
  const lines = [
    '{',
    '#ifdef USE_INSTANCING',
    '  mat4 gwM = modelMatrix * instanceMatrix;',
    '#else',
    '  mat4 gwM = modelMatrix;',
    '#endif',
    '  vec3 gwP = (gwM * vec4(transformed, 1.0)).xyz;',
  ];
  if (attr) {
    lines.push('  float gwH = max(sway, 0.0);', '  float gwP0 = windPhase.x;', '  float gwP1 = windPhase.y;', '  float gwW = windFlutter;', '  vec2 gwS = gwP.xz;');
  } else {
    // instanciado (hierba): la altura es la local y la fase sale del sitio de la mata
    lines.push(
      '  vec2 gwS = gwM[3].xz;',
      '  float gwH = max(transformed.y, 0.0);',
      '  float gwP0 = fract(sin(dot(gwS, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;',
      '  float gwP1 = gwP0;',
      '  float gwW = 1.0;',
    );
  }
  lines.push(
    '  vec2 gwD = uWind.xy;',
    '  float gwT = uWind.w;',
    '  float gwd = dot(gwS, gwD);',
    `  float gwA = uWind.z * (${b0} + ${b1} * sin(gwd * ${k1} - gwT * ${w1}) + ${b2} * sin(gwd * ${k2} - gwT * ${w2} + ${ph2})`,
    `    + ${f(GUST_GAIN)} * (gcbGust(gwd, uGust.x, uGust.y) + gcbGust(gwd, uGust.z, uGust.w)));`,
    `  float gwR = gwH / ${f(cfg.height)};`,
    `  float gwBend = ${f(cfg.bend)} * gwR * gwR * gwA * (0.8 + 0.2 * sin(gwT * ${f(F_BEND)} + gwP0));`,
    '  vec3 gwO = vec3(gwD.x, 0.0, gwD.y) * gwBend;',
  );
  if (cfg.sway) {
    lines.push(
      `  float gwPh = ${cfg.piecePhase ? 'gwP1' : 'gwP0'};`,
      `  float gwSw = ${f(cfg.sway)} * gwR * gwA;`,
      `  float gwS1 = sin(gwT * ${f(F_SWAY_A)} + gwPh);`,
      `  float gwS2 = 0.6 * sin(gwT * ${f(F_SWAY_B)} + gwPh * 1.3);`,
      '  gwO.x += (gwD.x * gwS1 - gwD.y * gwS2) * gwSw;',
      '  gwO.z += (gwD.y * gwS1 + gwD.x * gwS2) * gwSw;',
    );
  }
  if (cfg.flutter) {
    lines.push(
      `  float gwF = ${f(cfg.flutter)} * gwW * gwA * min(gwR, 1.0);`,
      `  float gwQ = dot(gwP, vec3(${FLUT_Q.map(f).join(', ')}));`,
      `  gwO += vec3(sin(gwT * ${f(F_FLUT[0])} + gwQ), 0.5 * sin(gwT * ${f(F_FLUT[1])} + gwQ * 1.3), sin(gwT * ${f(F_FLUT[2])} + gwQ * 0.7)) * gwF;`,
    );
  }
  lines.push(
    '  gwO.y -= dot(gwO.xz, gwO.xz) / (2.0 * max(gwH, 0.05));',
    // del mundo al espacio del objeto: exacto con giro + escala uniforme (lo habitual aquí)
    '  mat3 gwM3 = mat3(gwM);',
    '  transformed += transpose(gwM3) * gwO / dot(gwM3[0], gwM3[0]);',
    '}',
  );
  return lines.join('\n');
}

function windCommonChunk(attr) {
  return [
    'uniform vec4 uWind;',
    'uniform vec4 uGust;',
    'uniform float uGustW;',
    attr ? 'attribute float sway;\nattribute vec2 windPhase;\nattribute float windFlutter;' : '',
    'float gcbGust(float d, float f, float a) {',
    '  float k = (d - f) / (uGustW * (d < f ? 2.0 : 1.0));',
    '  return a * exp(-k * k);',
    '}',
  ].join('\n');
}

/** ¿Lleva viento este material (applyWind o el addWind antiguo)? */
export const isWindMaterial = (m) => !!m?.userData?.wind;

/**
 * Engancha el viento a un material existente (Lambert, Standard...) con onBeforeCompile
 * y devuelve el mismo material. opts: { layer, height?, bend?, sway?, flutter?, source? }
 * - layer: 'trunk' | 'canopy' | 'leaf' | 'grass' | 'flower' (WIND_LAYERS)
 * - height: altura (m) del asset a la que se aplican bend/sway/flutter
 * - source: 'sway' (def.; atributos de viento, ver bakeStatic/prepareWind) o 'y'
 *   (altura local del vértice; para InstancedMesh como la hierba)
 * Respeta el onBeforeCompile y la llave de programa que ya tuviera el material.
 */
export function applyWind(material, opts = {}) {
  const L = layerOf(opts.layer ?? 'canopy');
  const cfg = {
    layer: opts.layer ?? 'canopy',
    bend: opts.bend ?? L.bend,
    sway: opts.sway ?? L.sway,
    flutter: opts.flutter ?? L.flutter,
    height: opts.height ?? L.height,
    piecePhase: opts.piecePhase ?? L.piecePhase,
    source: opts.source === 'y' ? 'y' : 'sway',
  };
  if (!(cfg.height > 0)) throw new Error('viento: height debe ser > 0');
  if (isWindMaterial(material)) throw new Error('viento: este material ya tiene viento');
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey.call(material);
  const key = `wind:${cfg.layer}:${cfg.source}:${cfg.bend}:${cfg.sway}:${cfg.flutter}:${cfg.height}:${cfg.piecePhase ? 1 : 0}|${prevKey}`;
  const vertex = windVertexChunk(cfg);
  const common = windCommonChunk(cfg.source !== 'y');
  material.onBeforeCompile = function (sh, renderer) {
    prev?.call(this, sh, renderer);
    sh.uniforms.uWind = windUniforms.uWind;
    sh.uniforms.uGust = windUniforms.uGust;
    sh.uniforms.uGustW = windUniforms.uGustW;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${common}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertex}`);
  };
  material.customProgramCacheKey = () => key;
  material.userData.wind = cfg;
  material.needsUpdate = true;
  return material;
}

// ---------- atributos de viento en la geometría ----------

const TAU = Math.PI * 2;
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const _rel = new THREE.Matrix4(), _v = new THREE.Vector3(), _root = new THREE.Vector3();

/** Base del conjunto que se mece: el antepasado con userData.swayRoot o, si no hay, la propia malla. */
export function windRootOf(mesh) {
  let o = mesh;
  while (o && !o.userData.swayRoot) o = o.parent;
  return o ?? mesh;
}

/**
 * Escribe en `geometry` (en el espacio de `mesh`, antes de llevarla al mundo) los
 * atributos de viento que le falten; los que ya traiga se respetan tal cual.
 * Necesita las matrices del mundo al día. Sin azar: las fases salen del sitio.
 * - sway: altura del vértice sobre la base del conjunto (m, sin la escala de la base)
 * - windPhase: (fase del conjunto, fase de la pieza); las piezas en la misma
 *   columna (p. ej. nieve sobre un piso de pino) comparten fase y no se separan
 * - windFlutter: 1
 */
export function writeWindAttributes(geometry, mesh, root = windRootOf(mesh)) {
  const n = geometry.attributes.position.count;
  _rel.copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
  if (!geometry.attributes.sway) {
    const sway = new Float32Array(n);
    const p = geometry.attributes.position;
    for (let i = 0; i < n; i++) sway[i] = Math.max(0, _v.fromBufferAttribute(p, i).applyMatrix4(_rel).y);
    geometry.setAttribute('sway', new THREE.BufferAttribute(sway, 1));
  }
  if (!geometry.attributes.windPhase) {
    _root.setFromMatrixPosition(root.matrixWorld);
    _v.setFromMatrixPosition(_rel);
    const qx = Math.round(_v.x * 10), qz = Math.round(_v.z * 10);
    const p0 = hash(_root.x, _root.z) * TAU;
    const p1 = hash(_root.x + qx * 0.731 + 0.37, _root.z + qz * 0.519 - 0.21) * TAU;
    const ph = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      ph[i * 2] = p0;
      ph[i * 2 + 1] = p1;
    }
    geometry.setAttribute('windPhase', new THREE.BufferAttribute(ph, 2));
  }
  if (!geometry.attributes.windFlutter) geometry.setAttribute('windFlutter', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  return geometry;
}

/**
 * Prepara para el viento un objeto que NO pasa por bakeStatic (laboratorio, piezas
 * sueltas): cada malla con material de viento recibe una copia de su geometría con
 * los atributos de viento. Devuelve el mismo objeto.
 */
export function prepareWind(root) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !isWindMaterial(o.material) || o.material.userData.wind.source === 'y') return;
    if (WIND_ATTRS.every((a) => o.geometry.attributes[a])) return;
    o.geometry = writeWindAttributes(o.geometry.clone(), o);
  });
  return root;
}

sync();
