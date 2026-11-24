import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { treeLevel } from './treeKit.js';
import { softDotTexture } from '../textures.js';

/**
 * N3 (2026-11-23): pilones y cristales holográficos de los temas neón (neon, neonPink, cyber2078).
 * Solo entorno: sin física, sin colisiones, sin rng propio y sin texturas nuevas (el halo reutiliza el punto suave).
 *
 * Todo se comparte para no gastar llamadas de dibujo ni memoria:
 *  - las geometrías se hacen una vez por (variante, calidad) y las comparten todos los pilones/cristales;
 *  - los materiales se hacen una vez por color (colores del tema) y se comparten: `bakeStatic` junta todos los pilones
 *    en 3 mallas (metal, neón, halo) y todas las bases de cristal en la del metal;
 *  - el color de neón va en el material (tinte) y el brillo de cada pieza en el color de vértice.
 * Por eso no hay nada que liberar por objeto: `disposeNeonProps()` libera las cachés (el juego las rehace al vuelo).
 */

const LI = { low: 0, medium: 1, high: 2 };

/** Aspectos del pilón: 'beacon' (encendido, lit), 'lamp' y 'post' (apagados; uno u otro según el sitio, sin rng). */
export const PYLON_VARIANTS = ['lamp', 'post', 'beacon'];

/** Tope de triángulos por pilón (poste, 3 niveles de neón, base, cabeza y halo) y por cristal (cuerpo, anillo y base). */
export const PYLON_BUDGET = { low: 120, medium: 200, high: 260 };
export const CRYSTAL_BUDGET = { low: 70, medium: 100, high: 130 };

/**
 * Llamadas de dibujo por hoyo tras `bakeStatic`: 3 fijas (metal, neón, halo de los pilones; las bases de cristal van
 * en el metal), 2 por cristal (cuerpo animado + halo) y 1 por pilón encendido (halo suave). El diseño viejo gastaba 3
 * por pilón y 3 por cristal.
 */
export const PROPS_CALLS = { fixed: 3, perCrystal: 2, perLitPylon: 1 };

const geoCache = new Map();
const matCache = new Map();
const glowMats = []; // materiales de neón que laten con el reloj compartido
const pulsers = new WeakSet(); // un latido por lista `animated` (por hoyo)

// ---------- piezas ----------
/** Pieza lista para juntar: sin uv, sin índice, con color de vértice (gris de brillo b, o rgb) y facetas opcionales. */
function piece(geo, { x = 0, y = 0, z = 0, rx = 0, b = 1, rgb = null, facets = null } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  geo.dispose();
  g.deleteAttribute('uv');
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let k = b;
    if (facets) k = facets[Math.floor(i / 3) % facets.length];
    col[i * 3] = (rgb ? rgb[0] : 1) * k;
    col[i * 3 + 1] = (rgb ? rgb[1] : 1) * k;
    col[i * 3 + 2] = (rgb ? rgb[2] : 1) * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function join(parts) {
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  return g;
}
function cached(key, build) {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = build()));
  return g;
}
const METAL = [0.09, 0.1, 0.17];
const METAL_LIGHT = [0.15, 0.16, 0.26];

// ---------- pilón ----------
const VARIANT = {
  // H = altura del poste; bands = brillo de los 3 niveles de neón (bajo, medio, alto); head = radio de la cabeza
  lamp: { H: 1.8, bands: [0.32, 0.5, 0.8], head: 0.08, shell: 0.22 },
  post: { H: 1.35, bands: [0.28, 0.45, 0.7], head: 0.1, shell: 0.24 },
  beacon: { H: 1.9, bands: [0.55, 0.8, 1], head: 0.13, shell: 0.34 },
};

function pylonParts(variant, level) {
  const V = VARIANT[variant], L = LI[level];
  const s = [4, 6, 8][L]; // lados del poste y de los anillos
  const base = [6, 8, 10][L];
  const metal = [
    piece(new THREE.CylinderGeometry(0.2, 0.32, 0.14, base), { y: 0.07, rgb: METAL_LIGHT }), // base ancha
    piece(new THREE.CylinderGeometry(0.04, 0.055, V.H - 0.2, s, 1, true), { y: 0.14 + (V.H - 0.2) / 2, rgb: METAL }), // poste
  ];
  if (L > 0) metal.push(piece(new THREE.CylinderGeometry(0.1, 0.16, 0.1, [0, 6, 8][L]), { y: 0.19, rgb: METAL_LIGHT })); // collar
  const glow = [];
  [0.22, 0.55, 0.86].forEach((f, i) => glow.push(piece(new THREE.CylinderGeometry(0.062, 0.062, 0.07, s), { y: V.H * f, b: V.bands[i] })));
  const headY = V.H + 0.05;
  glow.push(piece(L === 0 ? new THREE.OctahedronGeometry(V.head, 0) : new THREE.IcosahedronGeometry(V.head, 0), { y: headY, b: 1 }));
  if (variant === 'beacon') glow.push(piece(new THREE.CylinderGeometry(0.17, 0.17, 0.025, s + 4, 1, true), { y: headY, b: 0.75 })); // visera
  const shell = [piece(L === 0 ? new THREE.OctahedronGeometry(V.shell, 0) : new THREE.IcosahedronGeometry(V.shell, 0), { y: headY, b: 0.6 })];
  return { metal, glow, shell };
}
const pylonGeos = (variant, level) =>
  cached(`pylon:${variant}:${level}`, () => {
    const p = pylonParts(variant, level);
    return { metal: join(p.metal), glow: join(p.glow), shell: join(p.shell) };
  });

// ---------- materiales ----------
function metalMat() {
  let m = matCache.get('metal');
  if (!m) matCache.set('metal', (m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, metalness: 0.8, roughness: 0.35 })));
  return m;
}
function glowMat(color) {
  const k = `glow:${color}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, vertexColors: true });
    m.userData.base = new THREE.Color(color);
    matCache.set(k, m);
    glowMats.push(m);
  }
  return m;
}
function shellMat(color) {
  const k = `shell:${color}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    matCache.set(k, m);
  }
  return m;
}
function crystalMat(color) {
  const k = `crystal:${color}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, vertexColors: true, side: THREE.DoubleSide });
    m.userData.base = new THREE.Color(color);
    matCache.set(k, m);
  }
  return m;
}
function haloMat(color, opacity) {
  const k = `halo:${color}:${opacity}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.SpriteMaterial({ map: softDotTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    matCache.set(k, m);
  }
  return m;
}
const pyIdx = (x, z) => Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;

/** Un latido suave del neón de todos los pilones, una sola función por lista `animated` (sin objetos por fotograma). */
function addPulse(animated) {
  if (!animated || pulsers.has(animated)) return;
  pulsers.add(animated);
  animated.push((t) => {
    const k = 0.86 + 0.14 * Math.sin(t * 2.2);
    for (let i = 0; i < glowMats.length; i++) glowMats[i].color.copy(glowMats[i].userData.base).multiplyScalar(k);
  });
}

/**
 * Baliza de neón perimetral: base ancha, poste de metal, tres niveles de neón y cabeza con halo.
 * `lit` (la tirada del hoyo, ya hecha fuera) la enciende: 'beacon'. Apagados: 'lamp' o 'post' según el sitio (sin rng).
 * opts: { level ('low'|'medium'|'high' o 0..2), animated, variant }.
 */
export function makeCyberPylon(x, y, z, themeColors, lit = false, opts = {}) {
  const level = treeLevel(opts.level);
  const variant = opts.variant ?? (lit ? 'beacon' : pyIdx(x, z) < 0.5 ? 'lamp' : 'post');
  const color = themeColors[0];
  const geos = pylonGeos(variant, level);
  const g = new THREE.Group();
  g.userData.variant = variant;
  g.add(new THREE.Mesh(geos.metal, metalMat()));
  g.add(new THREE.Mesh(geos.glow, glowMat(color)));
  g.add(new THREE.Mesh(geos.shell, shellMat(color)));
  if (lit) {
    const halo = new THREE.Sprite(haloMat(color, 0.35));
    halo.scale.setScalar(1.6);
    halo.position.y = VARIANT[variant].H + 0.05;
    g.add(halo);
  }
  addPulse(opts.animated);
  g.position.set(x, y, z);
  return g;
}

// ---------- cristal ----------
function crystalBody(level) {
  const L = LI[level];
  const n = [4, 6, 8][L]; // lados del cristal
  const R = 0.2;
  const facets = [1, 0.3, 0.7, 0.2]; // facetas de neón: unas encendidas y otras de vidrio oscuro
  const parts = [
    piece(new THREE.ConeGeometry(R, 0.28, n, 1, true), { y: 0.22, facets }),
    piece(new THREE.CylinderGeometry(R, R, 0.16, n, 1, true), { facets: [0.55, 0.9, 0.35] }),
    piece(new THREE.ConeGeometry(R, 0.28, n, 1, true).rotateX(Math.PI), { y: -0.22, facets: [0.4, 0.8, 0.25, 0.65] }),
  ];
  // anillo de datos suave: trazos sueltos alrededor del cristal, algo inclinado
  const d = n; // 4 / 6 / 8 trazos
  for (let i = 0; i < d; i++) {
    const len = ((Math.PI * 2) / d) * 0.6;
    parts.push(piece(new THREE.CylinderGeometry(0.34, 0.34, 0.025, 3, 1, true, (i * Math.PI * 2) / d, len), { rx: 0.25, b: 0.35 + 0.2 * (i % 3) }));
  }
  return join(parts);
}
const crystalGeos = (level) =>
  cached(`crystal:${level}`, () => ({
    body: crystalBody(level),
    base: join([piece(new THREE.CylinderGeometry(0.2, 0.28, 0.25, [5, 6, 8][LI[level]]), { y: 0.125, rgb: METAL_LIGHT })]),
  }));

/**
 * Cristal holográfico de datos: cuerpo facetado de neón con un anillo de datos, halo y base de metal.
 * El color sale de UNA tirada del rng del hoyo (igual que antes: floor(rng() * n)); nada más tira.
 * Gira y flota con el reloj compartido (`animated`); el cuerpo no se junta (keep) y lleva el anillo dentro.
 * opts: { level }.
 */
export function makeHoloCrystal(x, y, z, themeColors, rng, animated, opts = {}) {
  const level = treeLevel(opts.level);
  const g = new THREE.Group();
  const c = themeColors[Math.floor(rng() * themeColors.length)];
  g.userData.color = c;
  const geos = crystalGeos(level);

  g.add(new THREE.Mesh(geos.base, metalMat()));

  const crystal = new THREE.Mesh(geos.body, crystalMat(c));
  crystal.position.y = 0.9;
  crystal.userData.keep = true;
  crystal.userData.neonProp = true;
  g.add(crystal);

  const halo = new THREE.Sprite(haloMat(c, 0.3));
  halo.scale.setScalar(1.2);
  halo.position.y = 0.9;
  g.add(halo);

  g.position.set(x, y, z);

  if (animated) {
    // bakeStatic cuelga el cuerpo de la escena con la posición mundial: la altura base se toma en el primer fotograma
    let baseY = null;
    let haloDy = 0;
    animated.push((t, dt = 1 / 60) => {
      if (baseY === null) {
        baseY = crystal.position.y;
        haloDy = halo.position.y - crystal.position.y;
      }
      crystal.rotation.y += dt * 1.2;
      crystal.position.y = baseY + Math.sin(t * 2 + z) * 0.08;
      halo.position.y = crystal.position.y + haloDy;
      halo.scale.setScalar(1.2 + Math.sin(t * 3 + x) * 0.06);
    });
  }
  return g;
}

/** Libera las geometrías y los materiales compartidos (se rehacen solos al pedir otro pilón o cristal). */
export function disposeNeonProps() {
  for (const v of geoCache.values()) for (const g of Object.values(v)) g.dispose();
  for (const m of matCache.values()) m.dispose();
  geoCache.clear();
  matCache.clear();
  glowMats.length = 0;
}
