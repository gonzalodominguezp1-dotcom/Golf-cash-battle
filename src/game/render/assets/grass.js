import * as THREE from 'three';
import { applyWind } from './wind.js';
import { TAU, LEVELS, lerp, smooth, treeLevel } from './treeKit.js';

// Césped del estilo liso (paso 5 de 02-DOCS/wiki/ftd/assets-entorno-1a1.md).
//
// Sustituto de addGrassField (flora.js) y de las matas sueltas (makeTuft,
// makeGrassClump). Solo es dibujo: la física del hoyo no lo ve.
// - Matas de briznas curvas instanciadas: una sola InstancedMesh por campo (= una
//   llamada de dibujo). Más briznas por mata y más curva en Alto.
// - Brizna: base en sombra (oclusión en el color de vértice), punta más clara y algo
//   amarilla. Normales casi hacia arriba: se ilumina como el suelo.
// - Color de cada mata = color del césped en su sitio del mundo (grassColorAt):
//   manchas más amarillas, más verdes y más oscuras, de varios metros. Sin rng: el
//   suelo puede pedir el mismo color (grassGroundColor) y combinar con las briznas.
// - Matas altas junto a la pista: la misma mata, más alta y más esbelta.
// - Viento compartido (wind.js, capa grass con la altura local de la brizna): brisa
//   que rueda y ráfagas que viajan por el campo.
// - De lejos la brizna se encoge en el sombreador hasta desaparecer (sin trozos que
//   aparecen de golpe); el campo entero se descarta si no se ve.
//
// Zonas libres: las mismas que addGrassField hoy (nada a menos de 0,45 m de la pista,
// nada más allá de `reach`, y lo que diga `ok(x, z, y, d)`: agua, río, tee...). Las
// matas altas, además, a 1 m o más de la pista.
//
// Determinismo: del rng del hoyo se toma UNA tirada (la semilla del campo); el resto
// sale de un rng propio con 7 tiradas fijas por candidato. Así el rng del hoyo pierde
// lo mismo sea cual sea la calidad, la densidad o el hoyo, y las matas de Bajo son las
// primeras de Medio, y las de Medio las primeras de Alto.

// ---------- presupuesto ----------

/**
 * Por calidad: briznas por mata, tramos por brizna (2 tramos = 3 triángulos; 3 = 5),
 * tope de matas por campo y distancia (m) a la que la brizna empieza a encogerse y
 * desaparece. Medido en tests/grass.test.js.
 */
export const GRASS_BUDGET = {
  low: { blades: 3, sections: 2, maxTufts: 1500, fade: [22, 30] },
  medium: { blades: 4, sections: 2, maxTufts: 3000, fade: [30, 40] },
  high: { blades: 5, sections: 3, maxTufts: 3600, fade: [38, 48] },
};
/** Triángulos máximos de un campo entero (tope de matas x triángulos por mata). */
export const GRASS_FIELD_TRIS = { low: 13500, medium: 36000, high: 90000 };
/** Tiradas que el campo toma del rng del hoyo (siempre las mismas). */
export const GRASS_RNG_DRAWS = 1;
/** Distancia mínima a la pista (m): la de addGrassField hoy, y la de las matas altas. */
export const GRASS_CLEAR = { course: 0.45, tall: 1 };
/** Matas altas: franja junto a la pista (m), probabilidad junto al borde y escalas. */
export const GRASS_TALL = { band: [1, 3.5], chance: 0.2, minScaleY: 1.7, scaleY: [1.7, 2.3], scaleXZ: [1.1, 1.35], shade: 0.9 };
/** Altura de referencia del viento (m de la brizna local): la de la capa grass. */
export const GRASS_WIND_HEIGHT = 0.35;
/** El suelo bajo la hierba: el mismo tono, más oscuro. */
export const GRASS_GROUND_SHADE = 0.72;

const BLADE_H = 0.32; // brizna más alta de la mata (m, sin escala)
const BLADE_W = 0.034; // medio ancho en la base
const DRAWS_PER_TUFT = 7; // x, z, densidad, giro, escala, tono, alta
const MAX_TRIES = 8; // candidatos por mata pedida, como mucho

export const tuftTriangles = (level) => {
  const b = GRASS_BUDGET[treeLevel(level)];
  return b.blades * (2 * b.sections - 1);
};

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

/**
 * Color del césped en un punto del mundo (sin rng: siempre el mismo). tint = [base, punta]
 * como en addGrassField. Manchas de ~8 m (más claras/oscuras) y de ~20 m (zonas secas,
 * más amarillas, y zonas más oscuras).
 */
export function grassColorAt(x, z, tint, out = new THREE.Color()) {
  const p = paletteOf(tint);
  const n1 = vnoise(x / 8 + 3.7, z / 8 - 1.3);
  const n2 = vnoise(x / 21 - 7.1, z / 21 + 5.9);
  out.copy(p.base).lerp(p.tip, 0.25 + 0.5 * n1);
  out.lerp(p.dry, smooth(0.55, 0.85, n2) * 0.55);
  return out.multiplyScalar(1 - 0.24 * (1 - smooth(0.1, 0.45, n2)));
}

/** Color del suelo bajo la hierba en ese punto: el mismo tono, más oscuro (para el terreno). */
export function grassGroundColor(x, z, tint, out = new THREE.Color()) {
  return grassColorAt(x, z, tint, out).multiplyScalar(GRASS_GROUND_SHADE);
}

// ---------- geometría de una mata ----------

const tuftGeos = new Map();
const fract = (v) => v - Math.floor(v);

/**
 * Mata de briznas curvas (una por calidad, compartida). Cada brizna: `sections` pares
 * de vértices más la punta; se estrecha hacia arriba y se curva hacia fuera (t²).
 * Color de vértice: base en sombra, punta más clara y cálida (x el color de la mata).
 */
export function grassTuftGeometry(level) {
  level = treeLevel(level);
  if (tuftGeos.has(level)) return tuftGeos.get(level);
  const { blades, sections } = GRASS_BUDGET[level];
  const pos = [], col = [], nor = [], idx = [];
  const color = (t) => {
    if (t < 0.65) {
      const k = lerp(0.5, 1, t / 0.65);
      return [k, k, k];
    }
    const k = (t - 0.65) / 0.35;
    return [lerp(1, 1.2, k), lerp(1, 1.18, k), lerp(1, 1.02, k)];
  };
  for (let b = 0; b < blades; b++) {
    // reparto en ángulo áureo: las briznas miran a todos lados sin repetirse
    const a = b * 2.39996 + 0.3, j = fract(b * 0.618034 + 0.17);
    const ca = Math.cos(a), sa = Math.sin(a);
    const h = BLADE_H * (0.74 + 0.26 * fract(j + 0.5)), lean = 0.07 + 0.08 * j, r0 = 0.015 + 0.02 * j;
    // normal: casi hacia arriba, algo hacia fuera (da volumen sin caras negras)
    const n = new THREE.Vector3(-sa * 0.3, 1, ca * 0.3).normalize();
    const start = pos.length / 3;
    const put = (u, t) => {
      const bend = r0 + t * t * lean;
      pos.push(u * ca - bend * sa, t * h, u * sa + bend * ca);
      col.push(...color(t));
      nor.push(n.x, n.y, n.z);
    };
    for (let s = 0; s < sections; s++) {
      const t = s / sections, w = BLADE_W * (1 - 0.7 * t);
      put(-w, t);
      put(w, t);
    }
    put(0, 1);
    for (let s = 0; s < sections - 1; s++) {
      const q = start + s * 2;
      idx.push(q, q + 1, q + 3, q, q + 3, q + 2);
    }
    const q = start + (sections - 1) * 2;
    idx.push(q, q + 1, q + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  tuftGeos.set(level, g);
  return g;
}

// ---------- material ----------

const mats = new Map();
const f1 = (v) => Number(v).toFixed(1);

/**
 * Material de la hierba (uno por calidad, compartido): Lambert con color de vértice y
 * de instancia, dos caras con la normal hacia arriba, viento compartido (capa grass,
 * altura local) y la brizna que se encoge con la distancia a la cámara.
 */
export function grassMaterial(level) {
  level = treeLevel(level);
  if (mats.has(level)) return mats.get(level);
  const [f0, fEnd] = GRASS_BUDGET[level].fade;
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    // de lejos la brizna se encoge hacia su raíz: menos píxeles que pintar en el móvil
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
  m.customProgramCacheKey = () => `gcb-grass2:${f0}:${fEnd}`;
  applyWind(m, { layer: 'grass', source: 'y', height: GRASS_WIND_HEIGHT });
  mats.set(level, m);
  return m;
}

// ---------- campo ----------

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
 * Siembra el césped alrededor de la pista. Mismas opciones que addGrassField (flora.js):
 * bounds, heightAt(x, z), ok(x, z, y, d), rng (del hoyo), density (del tema, 0..1),
 * tint [base, punta], reach (m) y además level ('low'|'medium'|'high', preset o lod).
 * Devuelve { group, mesh, stats } (mesh = null si no cabe ninguna mata).
 */
export function makeGrassField({ bounds, heightAt, ok = () => true, rng, density = 1, tint, reach = 15, level }) {
  level = treeLevel(level);
  const seed = Math.floor(rng() * 4294967296); // la única tirada del rng del hoyo
  const r = mulberry32(seed ^ 0x9e3779b9);
  const budget = GRASS_BUDGET[level];
  const want = Math.round(budget.maxTufts * THREE.MathUtils.clamp(Number(density) || 0, 0, 1));
  const group = new THREE.Group();
  group.name = 'grass';
  const stats = { level, tufts: 0, tall: 0, triangles: 0, vertices: 0, calls: 0, seed };
  group.userData.grass = stats;
  if (want <= 0) return { group, mesh: null, stats };

  const minX = bounds.minX - reach, maxX = bounds.maxX + reach, minZ = bounds.minZ - reach, maxZ = bounds.maxZ + reach;
  const distBox = (x, z) => Math.hypot(Math.max(bounds.minX - x, 0, x - bounds.maxX), Math.max(bounds.minZ - z, 0, z - bounds.maxZ));
  const list = [];
  for (let tries = 0; list.length < want && tries < want * MAX_TRIES; tries++) {
    // siempre las mismas tiradas por candidato, se use o no
    const x = minX + r() * (maxX - minX), z = minZ + r() * (maxZ - minZ);
    const keep = r(), rot = r() * TAU, size = r(), shade = r(), tallRoll = r();
    const d = distBox(x, z);
    if (d < GRASS_CLEAR.course || d > reach) continue;
    // más hierba cerca de la pista, menos hacia fuera (como addGrassField)
    if (keep > 1 - (d / reach) * 0.7) continue;
    const y = heightAt(x, z);
    if (!ok(x, z, y, d)) continue;
    const near = 1 - smooth(GRASS_TALL.band[0] + 0.5, GRASS_TALL.band[1], d);
    const tall = d >= Math.max(GRASS_CLEAR.tall, GRASS_TALL.band[0]) && d <= GRASS_TALL.band[1] && tallRoll < GRASS_TALL.chance * near;
    list.push({ x, y, z, rot, size, shade, tall });
  }
  if (!list.length) return { group, mesh: null, stats };

  const geo = grassTuftGeometry(level);
  const mesh = new THREE.InstancedMesh(geo, grassMaterial(level), list.length);
  mesh.name = 'grass-field';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
  list.forEach((t, i) => {
    q.setFromAxisAngle(up, t.rot);
    if (t.tall) {
      // la misma mata, más alta y más esbelta (y algo más verde y oscura)
      const k = lerp(GRASS_TALL.scaleXZ[0], GRASS_TALL.scaleXZ[1], t.size);
      sc.set(k, lerp(GRASS_TALL.scaleY[0], GRASS_TALL.scaleY[1], fract(t.size * 7.31)), k);
      stats.tall++;
    } else {
      const s = lerp(0.65, 1.1, t.size);
      sc.set(s, s * lerp(0.8, 1.25, fract(t.size * 5.17)), s);
    }
    m4.compose(v.set(t.x, t.y - 0.01, t.z), q, sc);
    mesh.setMatrixAt(i, m4);
    grassColorAt(t.x, t.z, tint, c).multiplyScalar(lerp(0.92, 1.08, t.shade) * (t.tall ? GRASS_TALL.shade : 1));
    mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.castShadow = false; // como hoy: la hierba no proyecta sombra (caro en el móvil)
  mesh.receiveShadow = false;
  group.add(mesh);
  Object.assign(stats, {
    tufts: list.length,
    triangles: list.length * (geo.index.count / 3),
    vertices: list.length * geo.attributes.position.count,
    calls: 1,
  });
  return { group, mesh, stats };
}

/**
 * Como addGrassField: siembra el campo y lo añade a `scene`. Devuelve
 * { mesh, meshes, stats, update(cam) } (update esconde el campo si la cámara queda
 * más lejos que el fundido) o null si no hay hierba.
 */
export function addGrass(scene, opts) {
  const { group, mesh, stats } = makeGrassField(opts);
  if (!mesh) return null;
  scene.add(group);
  const far = GRASS_BUDGET[stats.level].fade[1];
  const center = mesh.boundingSphere.center.clone(), radius = mesh.boundingSphere.radius;
  return {
    mesh,
    meshes: [mesh],
    stats,
    update(cam) {
      mesh.visible = center.distanceTo(cam) - radius < far;
    },
  };
}

export { LEVELS as GRASS_LEVELS };
