import * as THREE from 'three';
import { treeLevel } from './treeKit.js';
import { windUniforms } from './wind.js';

// Elementos con textura ASCII de los temas neón (neon, neonPink, cyber2078), 2026-11-23. Solo dibujo y solo lejos:
// la física no los ve, no tocan la pista, las atracciones ni la ciudad del hoyo 15, y nada va al suelo de juego.
//
// - Nubes ASCII: bancos de caracteres (. : - ~ ░ ▒) en el cielo, que derivan despacio por una órbita lejana.
// - Pilares de energía: columnas de caracteres (║ | 1 0 ░ ▒ ▓) que nacen en el horizonte; el texto sube y un pulso
//   de luz recorre el pilar.
// - Naves ASCII: <=[■]=> y =[▓▓]=> con estela de caracteres (. : ~ - =) que cruzan el cielo por una órbita.
//
// Cómo se dibuja:
// - Cada elemento es UN cuadrilátero (2 triángulos) de cara al centro del hoyo; la rejilla de caracteres la hace el
//   sombreador de fragmentos: celda = floor(uv x rejilla), glifo elegido por celda, muestra del atlas con textureGrad
//   (gradiente continuo: sin costuras en el borde de las celdas al bajar de mip).
// - Una malla (una llamada de dibujo) por tipo: nubes, pilares y naves. Como mucho 3 llamadas por hoyo.
// - Atlas de glifos: DataTexture de 256 x 128 pintada en código con una fuente de 5 x 7 píxeles (sin canvas: se
//   genera igual en node); R = trazo, G = halo difuminado (brillo de neón). Uno solo, compartido entre hoyos: el
//   dispose del hoyo no lo libera.
// - Tiempo: el del viento compartido (uWind.w, vuelve a 0 cada hora). Órbitas con vueltas ENTERAS por hora y texto de
//   los pilares con filas por hora múltiplo del periodo de su secuencia: sin salto al volver a 0. Nada se mueve en JS.
// - Reparto: rng propio de semilla fija (ASCII_SEED): 0 tiradas del rng del hoyo y el decorado neón no se mueve.
// - Sin niebla (como las estrellas y el sol): están más allá de la niebla del hoyo (40..120 m); la opacidad baja de
//   cada tipo (uAlpha) hace de bruma. Mezcla aditiva y brillos contenidos para no disparar el resplandor.

// ---------- constantes ----------

/** Elementos por calidad (Medio = el del móvil). */
export const ASCII_BUDGET = {
  clouds: { low: 4, medium: 7, high: 10 },
  pillars: { low: 2, medium: 4, high: 6 },
  flyers: { low: 1, medium: 2, high: 2 },
};
/** Llamadas de dibujo añadidas por hoyo neón: nubes + pilares + naves. */
export const ASCII_MAX_CALLS = 3;
/** Tope de triángulos del conjunto (2 por elemento; medido: Bajo 14, Medio 26, Alto 36). */
export const ASCII_MAX_TRIS = 64;
export const ASCII_SEED = 0xa5c11e;
/** Filas de la secuencia de texto de un pilar (se repite cada ASCII_PERIOD filas). */
export const ASCII_PERIOD = 64;
const TIME_WRAP = 3600;
/** El cielo es una esfera de radio 180 centrada en el origen: todo queda dentro con margen. */
const SKY_FIT = 160;

/**
 * Capas (m, alrededor del centro del hoyo): r = radio de la órbita; y = altura de la base; cell = lado de una celda
 * de carácter; laps = vueltas por hora (enteras); alpha = opacidad máxima (aditiva).
 */
export const ASCII_LAYOUT = {
  clouds: { r: [122, 146], y: [32, 56], cell: 1.6, grid: [[24, 7], [34, 9]], laps: [1, 3], alpha: 0.36 },
  pillars: { r: [96, 114], y: [-6, -3], cell: 1.5, cols: [3, 4], rows: [26, 34], scroll: [90, 160], pulse: [300, 500], alpha: 0.7 },
  flyers: { r: [100, 116], y: [36, 48], cell: 1.8, trail: [10, 14], laps: [40, 55], alpha: 0.9 },
};

/** Glifos del atlas, en orden (índice = tesela). Solo ASCII imprimible + bloques y la doble barra. */
export const ASCII_GLYPHS = ' .:~-=+|1/0<>[]\\*#║░▒▓█■';
/** Siluetas de las naves (misma longitud); la estela va detrás (a la izquierda: avanzan hacia la derecha). */
export const ASCII_SHIPS = ['<=[■]=>', '=[▓▓]=>'];

const ATLAS = { cols: 8, rows: 4, tile: 32, px: 4 }; // fuente 5 x 7 a 4 px por punto: 20 x 28 en una tesela de 32
const GLOW = 0.55;

// fuente de 5 x 7 (de arriba abajo; # = tinta)
const FONT = {
  '.': ['.....', '.....', '.....', '.....', '.....', '..#..', '..#..'],
  ':': ['.....', '..#..', '..#..', '.....', '..#..', '..#..', '.....'],
  '~': ['.....', '.....', '.#...', '#.#.#', '...#.', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '|': ['..#..', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '<': ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '[': ['.###.', '.#...', '.#...', '.#...', '.#...', '.#...', '.###.'],
  ']': ['.###.', '...#.', '...#.', '...#.', '...#.', '...#.', '.###.'],
  '\\': ['#....', '.#...', '.#...', '..#..', '...#.', '...#.', '....#'],
  '*': ['.....', '..#..', '#.#.#', '.###.', '#.#.#', '..#..', '.....'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '║': ['.#.#.', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '.#.#.'],
  '■': ['.....', '#####', '#####', '#####', '#####', '#####', '.....'],
};
// bloques: toda la tesela (menos 1 px de borde) con trama de 4 px
const BLOCKS = {
  '░': (x, y) => x % 2 === 0 && y % 2 === 0,
  '▒': (x, y) => (x + y) % 2 === 0,
  '▓': (x, y) => !(x % 2 === 1 && y % 2 === 1),
  '█': () => true,
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
const intBetween = (r, [a, b]) => Math.round(a + (b - a) * r());

/** Índice del glifo en el atlas (-1 si no está). */
export const glyphIndex = (ch) => [...ASCII_GLYPHS].indexOf(ch);
/** Tesela [columna, fila] del glifo en el atlas (fila 0 = abajo, v = 0). */
export function glyphTile(ch) {
  const i = glyphIndex(ch);
  return [i % ATLAS.cols, Math.floor(i / ATLAS.cols)];
}
const G = (ch) => f(glyphIndex(ch));

// ---------- atlas de glifos (pintado en código, sin canvas) ----------

let atlas = null;
let atlasInk = null; // trazo (0..1) por píxel, para glyphCoverage

/** Atlas de glifos (uno, compartido; se pinta la primera vez). DataTexture RGBA lineal: R trazo, G halo. */
export function asciiGlyphAtlas() {
  if (atlas) return atlas;
  const { cols, rows, tile: T, px } = ATLAS;
  const W = cols * T, H = rows * T;
  const ink = new Float32Array(W * H);
  [...ASCII_GLYPHS].forEach((ch, i) => {
    const x0 = (i % cols) * T, y0 = Math.floor(i / cols) * T;
    const set = (x, y) => (ink[(y0 + y) * W + x0 + x] = 1);
    if (BLOCKS[ch]) {
      for (let y = 1; y < T - 1; y++) for (let x = 1; x < T - 1; x++) if (BLOCKS[ch](Math.floor(x / px), Math.floor(y / px))) set(x, y);
      return;
    }
    const rowsOf = FONT[ch];
    if (!rowsOf) return; // espacio
    const ox = (T - 5 * px) / 2, oy = (T - 7 * px) / 2;
    rowsOf.forEach((line, r) => {
      for (let c = 0; c < 5; c++) {
        if (line[c] !== '#') continue;
        // fila 0 de la fuente = arriba de la tesela (v alta)
        const yTop = T - oy - (r + 1) * px;
        for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) set(ox + c * px + x, yTop + y);
      }
    });
  });
  // halo: dos pasadas de caja (radio 3) dentro de cada tesela (sin manchar a la vecina)
  const blur = (src) => {
    const out = new Float32Array(W * H), R = 3;
    for (let pass = 0; pass < 2; pass++) {
      const from = pass === 0 ? src : out.slice();
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const tx = x - (x % T), ty = y - (y % T);
          let s = 0, n = 0;
          for (let d = -R; d <= R; d++) {
            const xx = pass === 0 ? x + d : x, yy = pass === 0 ? y : y + d;
            if (xx < tx || xx >= tx + T || yy < ty || yy >= ty + T) continue;
            s += from[yy * W + xx];
            n++;
          }
          out[y * W + x] = s / (2 * R + 1);
        }
      }
    }
    return out;
  };
  const halo = blur(ink);
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = Math.round(255 * ink[i]);
    data[i * 4 + 1] = Math.round(255 * Math.min(1, halo[i] * 1.6));
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.generateMipmaps = true; // 256 x 128: potencia de dos
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace; // máscara, no color
  tex.name = 'ascii-glyphs';
  tex.needsUpdate = true;
  atlasInk = ink;
  atlas = tex;
  return tex;
}

/** Parte de la tesela del glifo con tinta (0..1). */
export function glyphCoverage(ch) {
  asciiGlyphAtlas();
  const { cols, tile: T } = ATLAS, W = cols * T;
  const [c, r] = glyphTile(ch);
  let n = 0;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) n += atlasInk[(r * T + y) * W + c * T + x] > 0.5 ? 1 : 0;
  return n / (T * T);
}

// ---------- sombreadores ----------

const VERTEX = [
  '#include <common>',
  'attribute vec2 aCorner;', // 0..1 en el cuadrilátero (= uv)
  'attribute vec4 aOrbit;', // ángulo inicial, radio, altura de la base, vueltas por hora
  'attribute vec4 aShape;', // ancho, alto (m), columnas, filas
  'attribute vec4 aSeed;', // semilla y parámetros del tipo
  'uniform vec4 uWind;',
  'varying vec2 vUv;',
  'varying vec4 vShape;',
  'varying vec4 vSeed;',
  'void main() {',
  `  float a = aOrbit.x + PI2 * fract(uWind.w * aOrbit.w * ${f(1 / TIME_WRAP)});`,
  '  vec3 d = vec3(cos(a), 0.0, sin(a));',
  '  vec3 T = vec3(-d.z, 0.0, d.x);', // tangente = derecha vista desde el centro
  '  vec3 p = d * aOrbit.y + T * ((aCorner.x - 0.5) * aShape.x) + vec3(0.0, aOrbit.z + aCorner.y * aShape.y, 0.0);',
  '  vUv = aCorner;',
  '  vShape = aShape;',
  '  vSeed = aSeed;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
  '}',
].join('\n');

const FRAG_HEAD = [
  '#include <common>',
  'uniform sampler2D uAtlas;',
  'uniform vec4 uWind;',
  'uniform vec3 uColA;',
  'uniform vec3 uColB;',
  'uniform float uAlpha;',
  'varying vec2 vUv;',
  'varying vec4 vShape;',
  'varying vec4 vSeed;',
  `const vec2 AG = vec2(${f(ATLAS.cols)}, ${f(ATLAS.rows)});`,
  'float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
  // trazo + halo del glifo idx en la posición f (0..1) de su celda; gx/gy: gradiente de la rejilla (continuo)
  'float ink(float idx, vec2 f, vec2 gx, vec2 gy) {',
  `  vec2 tile = vec2(mod(idx, AG.x), floor((idx + 0.5) / AG.x));`,
  '  vec4 s = textureGrad(uAtlas, (tile + f) / AG, gx / AG, gy / AG);',
  `  return s.r + ${f(GLOW)} * s.g;`,
  '}',
];
const FRAG_TAIL = ['  #include <tonemapping_fragment>', '  #include <colorspace_fragment>', '}'];

/** Sombreador de las nubes (texto GLSL). Bajo: sin la segunda capa de ruido. */
export function cloudShaderSource(level) {
  level = treeLevel(level);
  const ramp = ['.', ':', '-', '~', '░', '▒'];
  const fragmentShader = [
    ...FRAG_HEAD,
    `const float RAMP[${ramp.length}] = float[${ramp.length}](${ramp.map(G).join(', ')});`,
    'float vnoise(vec2 p) {',
    '  vec2 i = floor(p), u = fract(p);',
    '  u = u * u * (3.0 - 2.0 * u);',
    '  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y);',
    '}',
    'void main() {',
    '  vec2 grid = vShape.zw;',
    '  vec2 g = vUv * grid;',
    '  vec2 gx = dFdx(g), gy = dFdy(g);',
    '  vec2 cell = floor(g), fr = fract(g);',
    '  vec2 c = (cell + 0.5) / grid * 2.0 - 1.0;',
    '  float s = vSeed.x * 37.0;',
    level === 'low'
      ? '  float n = vnoise(cell * vec2(0.22, 0.45) + s);'
      : '  float n = vnoise(cell * vec2(0.22, 0.45) + s) * 0.65 + vnoise(cell * vec2(0.55, 0.9) + s * 1.7) * 0.35;',
    // banco ancho de base plana y techo con bultos
    '  float ey = c.y < 0.0 ? c.y * 1.9 : c.y * 1.15;',
    '  float d = 1.0 - (c.x * c.x * 0.9 + ey * ey) + (n - 0.5) * 1.1;',
    // cada carácter cambia de vez en cuando (paso entero: estilo ASCII)
    '  float tw = h12(cell + s + floor(uWind.w * 1.4 + h12(cell * 1.31 + s) * 9.0));',
    '  d += (tw - 0.5) * 0.22;',
    '  if (d < 0.12) discard;',
    '  float k = clamp((d - 0.12) / 0.75, 0.0, 0.999);',
    `  float idx = RAMP[int(k * ${f(ramp.length)})];`,
    '  float a = ink(idx, fr, gx, gy) * uAlpha * (0.45 + 0.55 * k);',
    '  vec3 col = mix(uColA, uColB, clamp(vUv.y * 1.2 + (vSeed.y - 0.5) * 0.5, 0.0, 1.0));',
    '  gl_FragColor = vec4(col, a);',
    ...FRAG_TAIL,
  ].join('\n');
  return { vertexShader: VERTEX, fragmentShader };
}

/** Sombreador de los pilares (texto GLSL): el texto sube (filas por segundo en vSeed.y) y un pulso lo recorre. */
export function pillarShaderSource(level) {
  level = treeLevel(level);
  const fragmentShader = [
    ...FRAG_HEAD,
    'void main() {',
    '  vec2 grid = vShape.zw;',
    // el texto sube: la celda de una altura muestra la fila que estaba debajo (secuencia periódica: sin salto)
    '  vec2 g = vec2(vUv.x * grid.x, vUv.y * grid.y - uWind.w * vSeed.y);',
    '  vec2 gx = dFdx(g), gy = dFdy(g);',
    '  vec2 cell = floor(g), fr = fract(g);',
    `  float row = mod(cell.y, ${f(ASCII_PERIOD)});`,
    '  float s = vSeed.x * 53.0;',
    '  float h = h12(vec2(cell.x + s, row));',
    '  float mid = abs(cell.x - (grid.x - 1.0) * 0.5);',
    '  bool core = mid < 0.6;',
    '  float idx;',
    `  if (core) idx = h < 0.5 ? ${G('║')} : (h < 0.75 ? ${G('|')} : (h < 0.9 ? ${G('▓')} : ${G('▒')}));`,
    `  else idx = h < 0.28 ? ${G('1')} : (h < 0.56 ? ${G('0')} : (h < 0.7 ? ${G('░')} : (h < 0.8 ? ${G('▒')} : (h < 0.86 ? ${G('|')} : ${G(' ')}))));`,
    '  float y = vUv.y;',
    '  float body = smoothstep(0.0, 0.05, y) * (1.0 - smoothstep(0.4, 1.0, y));',
    `  float band = fract(uWind.w * vSeed.z * ${f(1 / TIME_WRAP)}) * 1.3 - 0.15;`,
    // (pow con base negativa no está definido en GLSL: se eleva al cuadrado a mano)
    ...(level === 'low' ? ['  float pulse = 0.0;'] : ['  float pz = (y - band) * 9.0;', '  float pulse = exp(-pz * pz);']),
    '  float b = body * (0.55 + 0.9 * pulse) * (core ? 1.0 : 0.55);',
    '  float a = ink(idx, fr, gx, gy) * b * uAlpha;',
    '  vec3 col = mix(uColA, uColB, y);',
    '  if (core) col = mix(col, vec3(1.0), 0.35 * pulse);',
    '  gl_FragColor = vec4(col, a);',
    ...FRAG_TAIL,
  ].join('\n');
  return { vertexShader: VERTEX, fragmentShader };
}

/** Sombreador de las naves (texto GLSL): silueta de uShip (vSeed.y = variante) y estela que parpadea detrás. */
export function flyerShaderSource(level) {
  level = treeLevel(level);
  const len = [...ASCII_SHIPS[0]].length;
  const trail = ['.', ':', '~', '-', '='];
  const fragmentShader = [
    ...FRAG_HEAD,
    `uniform float uShip[${ASCII_SHIPS.length * len}];`,
    `const float TRAIL[${trail.length}] = float[${trail.length}](${trail.map(G).join(', ')});`,
    'void main() {',
    '  vec2 grid = vShape.zw;',
    '  vec2 g = vUv * grid;',
    '  vec2 gx = dFdx(g), gy = dFdy(g);',
    '  vec2 cell = floor(g), fr = fract(g);',
    '  float tl = vSeed.z;', // celdas de estela
    '  float i = cell.x;',
    '  float idx, b;',
    '  vec3 col;',
    '  if (i >= tl - 0.5) {',
    `    idx = uShip[int(vSeed.y + 0.5) * ${len} + int(i - tl + 0.5)];`,
    '    b = 1.0;',
    `    if (abs(idx - ${G('■')}) < 0.5) b = 0.6 + 0.4 * step(0.5, fract(uWind.w * 1.7 + vSeed.x * 7.0));`,
    '    col = uColA;',
    '  } else {',
    '    float k = (i + 1.0) / tl;', // 0 lejos de la nave .. 1 junto a ella
    `    float tw = h12(vec2(i + vSeed.x * 41.0, floor(uWind.w * ${level === 'low' ? '5.0' : '9.0'})));`,
    `    idx = TRAIL[int(clamp(k + (tw - 0.5) * 0.35, 0.0, 0.999) * ${f(trail.length)})];`,
    '    b = k * k * step(0.12, tw);',
    '    col = mix(uColB * 0.6, uColB, k);',
    '  }',
    '  float a = ink(idx, fr, gx, gy) * b * uAlpha;',
    '  gl_FragColor = vec4(col, a);',
    ...FRAG_TAIL,
  ].join('\n');
  return { vertexShader: VERTEX, fragmentShader };
}

// ---------- mallas ----------

const CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/** Malla de cuadriláteros (uno por elemento). items: [{ orbit: [a0, r, y, laps], shape: [w, h, cols, rows], seed: [4] }]. */
function quadsMesh(name, items, shader, uniforms) {
  const pos = [], corner = [], orbit = [], shape = [], seed = [], index = [];
  items.forEach((it, q) => {
    const [a0, r, y0] = it.orbit, [w, h] = it.shape;
    const dx = Math.cos(a0), dz = Math.sin(a0);
    for (const [u, v] of CORNERS) {
      // posición en t = 0 (la misma cuenta que el sombreador): para la caja y para los tests
      const s = (u - 0.5) * w;
      pos.push(dx * r - dz * s, y0 + v * h, dz * r + dx * s);
      corner.push(u, v);
      orbit.push(...it.orbit);
      shape.push(...it.shape);
      seed.push(...it.seed);
    }
    const o = q * 4;
    index.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('aOrbit', new THREE.Float32BufferAttribute(orbit, 4));
  g.setAttribute('aShape', new THREE.Float32BufferAttribute(shape, 4));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
  g.setIndex(index);
  const u = { uAtlas: { value: asciiGlyphAtlas() }, uAlpha: { value: 1 }, ...uniforms };
  u.uWind = windUniforms.uWind; // compartido por referencia
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  mat.name = name;
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.frustumCulled = false; // se mueve en el sombreador alrededor de la cámara
  m.castShadow = m.receiveShadow = false;
  m.userData.keep = true;
  m.raycast = () => {}; // ni suelo ni pared: los rayos lo atraviesan
  return m;
}

const neonOf = (theme) => (theme?.neon?.length ? theme.neon : [0x00f0ff, 0xff007f, 0xffd23f]);
const color = (hex) => ({ value: new THREE.Color(hex) });
/** Ángulos repartidos alrededor con algo de azar (n, desfase, rng). */
const spread = (r, n, off) => Array.from({ length: n }, (_, i) => off + ((i + 0.5 + (r() - 0.5) * 0.6) / n) * Math.PI * 2);

/** Nubes ASCII: opts { level, theme, fit (escala de los radios, 1) }. Una malla, ASCII_BUDGET.clouds[level] bancos. */
export function makeAsciiClouds({ level, theme, fit = 1 } = {}) {
  level = treeLevel(level);
  const L = ASCII_LAYOUT.clouds, r = mulberry32(ASCII_SEED);
  const n = ASCII_BUDGET.clouds[level];
  const items = spread(r, n, 0.3).map((a) => {
    const cols = intBetween(r, [L.grid[0][0], L.grid[1][0]]), rows = intBetween(r, [L.grid[0][1], L.grid[1][1]]);
    const laps = intBetween(r, L.laps) * (r() < 0.5 ? -1 : 1);
    return { orbit: [a, between(r, L.r) * fit, between(r, L.y), laps], shape: [cols * L.cell, rows * L.cell, cols, rows], seed: [r(), r(), 0, 0] };
  });
  const [c0, c1] = neonOf(theme);
  const m = quadsMesh('ascii-clouds', items, cloudShaderSource(level), { uColA: color(c1), uColB: color(c0) });
  m.material.uniforms.uAlpha.value = L.alpha;
  return m;
}

/** Pilares de energía ASCII en el horizonte: opts { level, theme, fit }. Una malla, ASCII_BUDGET.pillars[level] pilares. */
export function makeAsciiPillars({ level, theme, fit = 1 } = {}) {
  level = treeLevel(level);
  const L = ASCII_LAYOUT.pillars, r = mulberry32(ASCII_SEED + 1);
  const n = ASCII_BUDGET.pillars[level];
  const items = spread(r, n, 1.1).map((a) => {
    const cols = intBetween(r, L.cols), rows = intBetween(r, L.rows);
    // filas por segundo = periodo x vueltas por hora / 3600 (entero de vueltas: sin salto a la hora)
    const rowsPerSec = (ASCII_PERIOD * intBetween(r, L.scroll)) / TIME_WRAP;
    return { orbit: [a, between(r, L.r) * fit, between(r, L.y), 0], shape: [cols * L.cell, rows * L.cell, cols, rows], seed: [r(), rowsPerSec, intBetween(r, L.pulse), 0] };
  });
  const [c0, c1] = neonOf(theme);
  const m = quadsMesh('ascii-pillars', items, pillarShaderSource(level), { uColA: color(c0), uColB: color(c1) });
  m.material.uniforms.uAlpha.value = L.alpha;
  return m;
}

/** Naves ASCII con estela: opts { level, theme, fit }. Una malla, ASCII_BUDGET.flyers[level] naves. */
export function makeAsciiFlyers({ level, theme, fit = 1 } = {}) {
  level = treeLevel(level);
  const L = ASCII_LAYOUT.flyers, r = mulberry32(ASCII_SEED + 2);
  const n = ASCII_BUDGET.flyers[level];
  const len = [...ASCII_SHIPS[0]].length;
  const items = spread(r, n, 2.4).map((a, i) => {
    const trail = intBetween(r, L.trail), cols = trail + len;
    // siempre en el sentido de la estela (vueltas > 0: avanzan hacia la derecha vistas desde el hoyo)
    return { orbit: [a, between(r, L.r) * fit, between(r, L.y), intBetween(r, L.laps)], shape: [cols * L.cell, L.cell, cols, 1], seed: [r(), i % ASCII_SHIPS.length, trail, 0] };
  });
  const neon = neonOf(theme);
  const ship = new THREE.Color(neon[2] ?? neon[0]).lerp(new THREE.Color(0xffffff), 0.35);
  const m = quadsMesh('ascii-flyers', items, flyerShaderSource(level), {
    uColA: { value: ship },
    uColB: color(neon[1] ?? neon[0]),
    uShip: { value: ASCII_SHIPS.flatMap((s) => [...s].map(glyphIndex)) },
  });
  m.material.uniforms.uAlpha.value = L.alpha;
  return m;
}

const EMPTY_STATS = Object.freeze({ calls: 0, triangles: 0, points: 0 });

/**
 * Nubes, pilares y naves ASCII alrededor del hoyo (solo temas neón). opts: { bounds, theme, level (0..2 o
 * 'low'|'medium'|'high'), animated? (lista de funciones por fotograma: se le añade update) }. Devuelve
 * { group, update, dispose, stats: { calls, triangles, points } }. Sin rng del hoyo.
 */
export function addAsciiNeon(scene, { bounds, theme, level, animated } = {}) {
  const noop = () => {};
  if (!theme?.neon) return { group: null, update: noop, dispose: noop, stats: EMPTY_STATS };
  const cx = bounds ? (bounds.minX + bounds.maxX) / 2 : 0, cz = bounds ? (bounds.minZ + bounds.maxZ) / 2 : 0;
  // que nada salga de la cúpula del cielo (radio 180 en el origen) si el hoyo no está centrado
  const fit = Math.min(1, Math.max(0.5, (SKY_FIT - Math.hypot(cx, cz)) / ASCII_LAYOUT.clouds.r[1]));
  const opts = { level, theme, fit };
  const group = new THREE.Group();
  group.name = 'ascii-neon';
  group.userData.keep = true;
  group.position.set(cx, 0, cz);
  const meshes = [makeAsciiClouds(opts), makeAsciiPillars(opts), makeAsciiFlyers(opts)].filter((m) => m.geometry.index.count > 0);
  group.add(...meshes);
  scene.add(group);
  const stats = {
    calls: meshes.length,
    triangles: meshes.reduce((s, m) => s + m.geometry.index.count / 3, 0),
    points: 0,
  };
  // el movimiento sale del tiempo del viento (uWind.w) en el sombreador: aquí no hay nada que hacer por fotograma
  const update = noop;
  animated?.push(update);
  let alive = true;
  return {
    group,
    update,
    stats,
    /** Quita el grupo y libera sus geometrías y materiales; el atlas de glifos es compartido y no se toca. */
    dispose() {
      if (!alive) return;
      alive = false;
      group.removeFromParent();
      for (const m of meshes) {
        m.geometry.dispose();
        m.material.dispose();
      }
    },
  };
}
