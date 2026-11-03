import * as THREE from 'three';

// Naturaleza alrededor del hoyo: textura del suelo, hierba instanciada, ríos y
// vegetación de orilla. Todo es dibujo: la física del hoyo no lo ve.
//
// Pensado para el móvil:
// - la hierba es una sola geometría pequeña repetida con InstancedMesh, partida
//   en trozos de 16 m para que la cámara descarte los que no ve y los lejanos;
// - el río se excava en el terreno que ya existe y usa su misma agua (o un plano
//   de agua cuando el hoyo va a ras de suelo): no añade mallas caras;
// - la densidad sale de quality().grass (Bajo dibuja mucha menos).

// ---------- qué naturaleza lleva cada tema ----------

/**
 * Ajustes de flora de un tema (se pueden fijar en themes.js con `flora`).
 * ground: textura del terreno ('grass' | 'snow' | 'sand' | 'ash' | null)
 * grass: densidad de hierba (0 = ninguna); tint: [base, punta] de las briznas
 * river: si hay río que cruce el paisaje
 */
export function floraOf(theme) {
  if (theme.neon) return { ground: null, grass: 0, river: false };
  const base = theme.lava || theme.caldera
    ? { ground: 'ash', grass: 0, river: false }
    : theme.snowfall || theme.snowSand
    ? { ground: 'snow', grass: 0.22, tint: [0x7d8a5a, 0xc9d4b0], river: true }
    : theme.trees?.includes('cactus')
    ? { ground: 'sand', grass: 0.35, tint: [0x7a5a2a, 0xc9a25a], river: false }
    : theme.trees?.includes('palm')
    ? { ground: 'sand', grass: 0.3, river: false }
    : { ground: 'grass', grass: 1, river: true };
  return { ...base, ...(theme.flora ?? {}) };
}

// ---------- textura del suelo ----------

const groundTex = new Map();

/**
 * Textura de detalle del terreno (casi blanca: multiplica el color por vértice).
 * Briznas para la hierba, granos y brillos para la nieve, arena con piedrecitas.
 */
export function groundDetailTexture(kind) {
  if (groundTex.has(kind)) return groundTex.get(kind);
  const n = 256, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  let s = 1234567;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, n, n);
  // manchas grandes y suaves (se repiten en mosaico: deben cerrar por los bordes)
  const blot = (x, y, rad, col) => {
    for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) {
      const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      grd.addColorStop(0, col);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    }
  };
  for (let i = 0; i < 14; i++) blot(r() * n, r() * n, 20 + r() * 45, r() > 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.07)');
  if (kind === 'grass') {
    for (let i = 0; i < 6500; i++) {
      const x = r() * n, y = r() * n, l = 2 + r() * 5, v = 150 + Math.floor(r() * 105);
      g.strokeStyle = `rgba(${v},${v},${Math.floor(v * 0.9)},${0.35 + r() * 0.35})`;
      g.lineWidth = 0.8 + r() * 0.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 2.5, y - l);
      g.stroke();
    }
  } else if (kind === 'snow') {
    for (let i = 0; i < 2600; i++) {
      const v = 200 + Math.floor(r() * 55);
      g.fillStyle = `rgba(${v},${v},255,${0.25 + r() * 0.3})`;
      g.fillRect(r() * n, r() * n, 1 + r() * 2, 1 + r() * 2);
    }
    // huellas de viento: ondas suaves
    for (let i = 0; i < 40; i++) {
      const y = r() * n;
      g.strokeStyle = 'rgba(150,170,200,0.12)';
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x <= n; x += 8) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 4);
      g.stroke();
    }
  } else if (kind === 'sand' || kind === 'ash') {
    const ash = kind === 'ash';
    for (let i = 0; i < 9000; i++) {
      const v = (ash ? 90 : 150) + Math.floor(r() * 105);
      g.fillStyle = `rgba(${v},${Math.floor(v * (ash ? 0.95 : 0.92))},${Math.floor(v * (ash ? 0.9 : 0.8))},0.35)`;
      g.fillRect(r() * n, r() * n, 1, 1);
    }
    for (let i = 0; i < 90; i++) {
      const x = r() * n, y = r() * n, rad = 1 + r() * 2.5;
      g.fillStyle = `rgba(${ash ? '40,36,34' : '120,100,80'},0.45)`;
      g.beginPath();
      g.ellipse(x, y, rad, rad * 0.7, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  groundTex.set(kind, t);
  return t;
}

// ---------- terreno con más detalle cerca del hoyo ----------

/**
 * Reparte las filas y columnas del terreno: muy juntas cerca del hoyo y más
 * separadas hacia el horizonte. Con los mismos triángulos, el río y las orillas
 * salen lisos junto a la pista. u en [-1, 1] -> metros.
 */
export const TERRAIN_FOCUS = 0.38;
export function warpCoord(u, half) {
  return half * (TERRAIN_FOCUS * u + (1 - TERRAIN_FOCUS) * u * u * u);
}

// ---------- río ----------

/**
 * Río que cruza el paisaje en paralelo al lado largo del hoyo, serpenteando a
 * unos metros de la pista. Devuelve null si el tema no lleva río.
 * - dist(x, z): distancia (aprox.) al centro del cauce
 * - carve(x, z, h): altura del terreno con el cauce y las orillas excavados
 * - y: nivel del agua; w: medio ancho del agua
 */
export function makeRiver(bounds, theme, rng, { grounded, enabled }) {
  if (!enabled) return null;
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  const hx = (bounds.maxX - bounds.minX) / 2, hz = (bounds.maxZ - bounds.minZ) / 2;
  const alongZ = hz >= hx; // corre a lo largo del lado largo
  const side = rng() < 0.5 ? -1 : 1;
  const w = 2.1; // medio ancho del agua
  const off = (alongZ ? hx : hz) + 10;
  const ph1 = rng() * 6.28, ph2 = rng() * 6.28;
  const y = grounded ? -0.95 : theme.waterLevel;
  const bed = y - 0.7;
  // centro del cauce (coordenada "lateral") para una posición a lo largo
  const center = (t) => side * off + Math.sin(t * 0.075 + ph1) * 2.4 + Math.sin(t * 0.19 + ph2) * 0.9;
  const slope = (t) => 0.075 * 2.4 * Math.cos(t * 0.075 + ph1) + 0.19 * 0.9 * Math.cos(t * 0.19 + ph2);
  const dist = (x, z) => {
    const t = alongZ ? z - cz : x - cx, lat = alongZ ? x - cx : z - cz;
    const k = slope(t);
    return Math.abs(lat - center(t)) / Math.sqrt(1 + k * k);
  };
  const carve = (x, z, h) => {
    const d = dist(x, z);
    if (d > w + 9) return h;
    // la orilla se abre más donde el terreno está más alto (valle, no zanja)
    const bank = THREE.MathUtils.clamp(2.6 + (h - y) * 0.9, 2.6, 6);
    const k = 1 - THREE.MathUtils.smoothstep(d, w, w + bank);
    // fondo del cauce: más hondo en el centro y subiendo hacia la orilla
    const floor = bed + (y + 0.25 - bed) * THREE.MathUtils.smoothstep(d, w * 0.35, w * 1.25);
    return h + (Math.min(h, floor) - h) * k;
  };
  // puntos del centro del cauce, para colocar cosas en la orilla
  const along = (t, lateral = 0) => {
    const c = center(t) + lateral;
    return alongZ ? [cx + c, cz + t] : [cx + t, cz + c];
  };
  return { dist, carve, y, w, along, grounded };
}

/** Agua de río a ras de suelo: un plano con olas suaves que solo asoma por el cauce. */
export function riverWaterPlane(size, river, theme) {
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshPhongMaterial({ color: theme.water ?? 0x2bb3e6, shininess: 110, specular: 0xffffff, transparent: true, opacity: 0.88 });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = river.y;
  m.receiveShadow = true;
  return m;
}

// ---------- hierba instanciada ----------

const BLADES = 3;
/** Mata de tres briznas en abanico (9 triángulos), con color de la base a la punta. */
function tuftGeometry() {
  const pos = [], col = [], idx = [];
  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * Math.PI + 0.3;
    const ca = Math.cos(a), sa = Math.sin(a);
    const lean = 0.06 + b * 0.03, h = 0.22 + b * 0.05, wd = 0.035;
    const base = pos.length / 3;
    // 2 pares de vértices + punta
    const ring = [
      [-wd, 0], [wd, 0], [-wd * 0.6, h * 0.55], [wd * 0.6, h * 0.55], [0, h],
    ];
    ring.forEach(([u, v]) => {
      const t = v / h;
      const bend = t * t * lean;
      // la brizna mira a un lado distinto cada vez y se curva hacia fuera
      pos.push(u * ca - bend * sa, v, u * sa + bend * ca);
      const c = 0.45 + t * 0.55;
      col.push(c, c, c);
    });
    idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  // normales hacia arriba: la hierba se ilumina como el suelo (sin caras negras por detrás)
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

/** Briznas que se mecen con el viento según su altura y su sitio (todo en la tarjeta gráfica). */
function grassMaterial(uniforms) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    // las dos caras de la brizna con la normal hacia arriba (si no, la cara de atrás sale negra)
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      'float faceDirection = gl_FrontFacing ? 1.0 : -1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;',
    );
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        float sway = position.y * position.y * 3.0;
        transformed.x += (sin(uTime * 1.8 + ip.x * 0.45 + ip.z * 0.3) * 0.6 + sin(uTime * 3.1 + ip.z * 1.3) * 0.25) * 0.09 * sway;
        transformed.z += cos(uTime * 1.4 + ip.x * 0.35) * 0.05 * sway;`,
      );
  };
  m.customProgramCacheKey = () => 'gcb-grass';
  return m;
}

const CHUNK = 16;
/**
 * Siembra hierba alrededor del hoyo: más densa junto a la pista y menos lejos.
 * `ok(x, z, y)` dice si cabe en ese punto (fuera del agua, del río, del tee...).
 * Devuelve { update(cam) } para esconder los trozos lejanos.
 */
export function addGrassField(scene, { bounds, heightAt, ok, rng, density, tint, uniforms, reach = 15 }) {
  const count = Math.round(5200 * density);
  if (count <= 0) return null;
  const geo = tuftGeometry();
  const mat = grassMaterial(uniforms);
  const minX = bounds.minX - reach, maxX = bounds.maxX + reach, minZ = bounds.minZ - reach, maxZ = bounds.maxZ + reach;
  const nx = Math.max(1, Math.ceil((maxX - minX) / CHUNK)), nz = Math.max(1, Math.ceil((maxZ - minZ) / CHUNK));
  const cells = Array.from({ length: nx * nz }, () => []);
  const base = new THREE.Color(tint[0]), tip = new THREE.Color(tint[1]);
  const distBox = (x, z) => Math.hypot(Math.max(bounds.minX - x, 0, x - bounds.maxX), Math.max(bounds.minZ - z, 0, z - bounds.maxZ));
  let tries = 0;
  for (let placed = 0; placed < count && tries < count * 4; tries++) {
    const x = minX + rng() * (maxX - minX), z = minZ + rng() * (maxZ - minZ);
    const d = distBox(x, z);
    if (d < 0.45 || d > reach) continue;
    // más hierba cerca de la pista, menos hacia fuera
    if (rng() > 1 - (d / reach) * 0.7) continue;
    const y = heightAt(x, z);
    if (!ok(x, z, y, d)) continue;
    const cell = Math.min(nx - 1, Math.floor((x - minX) / CHUNK)) + Math.min(nz - 1, Math.floor((z - minZ) / CHUNK)) * nx;
    cells[cell].push([x, y, z, rng() * 6.28, 0.7 + rng() * 0.8, rng()]);
    placed++;
  }
  const meshes = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
  for (const list of cells) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, y, z, rot, s, shade], i) => {
      q.setFromAxisAngle(up, rot);
      sc.set(s, s * (0.8 + shade * 0.5), s);
      m4.compose(v.set(x, y - 0.01, z), q, sc);
      im.setMatrixAt(i, m4);
      // cada mata con su tono: unas más verdes, otras más secas
      im.setColorAt(i, c.copy(base).lerp(tip, 0.35 + shade * 0.65));
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.userData.center = im.boundingSphere.center.clone();
    im.userData.radius = im.boundingSphere.radius;
    scene.add(im);
    meshes.push(im);
  }
  // de lejos la hierba ni se distingue: esos trozos no se dibujan
  const far = 42;
  return {
    meshes,
    update(cam) {
      for (const m of meshes) m.visible = m.userData.center.distanceTo(cam) - m.userData.radius < far;
    },
  };
}

// ---------- orillas ----------

const reedMat = new THREE.MeshLambertMaterial({ color: 0x6f8f3a, flatShading: true });
const cattailMat = new THREE.MeshLambertMaterial({ color: 0x6b4423, flatShading: true });
const padMat = new THREE.MeshLambertMaterial({ color: 0x3f9a3a, flatShading: true, side: THREE.DoubleSide });
const lotusMat = new THREE.MeshLambertMaterial({ color: 0xffb6d5, flatShading: true });

/** Juncos con espadañas en la orilla. */
export function makeReeds(rng, x, y, z) {
  const g = new THREE.Group();
  const n = 4 + Math.floor(rng() * 4);
  for (let k = 0; k < n; k++) {
    const h = 0.55 + rng() * 0.5;
    const a = rng() * 6.28, r = rng() * 0.25;
    const stem = new THREE.Mesh(new THREE.ConeGeometry(0.025, h, 3), reedMat);
    stem.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    stem.rotation.set((rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3);
    g.add(stem);
    if (rng() < 0.45) {
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 5), cattailMat);
      tail.position.set(stem.position.x, h * 0.85, stem.position.z);
      g.add(tail);
    }
  }
  g.userData.swayRoot = true;
  g.position.set(x, y - 0.03, z);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

/** Nenúfar flotando en el agua (a veces con flor). */
export function makeLilyPad(rng, x, y, z) {
  const g = new THREE.Group();
  const r = 0.22 + rng() * 0.2;
  const pad = new THREE.Mesh(new THREE.CircleGeometry(r, 9, 0.3, Math.PI * 2 - 0.5), padMat);
  pad.rotation.x = -Math.PI / 2;
  g.add(pad);
  if (rng() < 0.3) {
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.1, 6, 1, true), lotusMat);
    fl.rotation.x = Math.PI;
    fl.position.y = 0.05;
    g.add(fl);
  }
  g.position.set(x, y + 0.02, z);
  g.rotation.y = rng() * 6.28;
  return g;
}

/** Arbusto bajo de bolas facetadas (para los temas low-poly). */
export function makeBush(rng, x, y, z, leaves) {
  const g = new THREE.Group();
  const n = 2 + Math.floor(rng() * 3);
  const mat = leaves[Math.floor(rng() * leaves.length)];
  for (let i = 0; i < n; i++) {
    const r = 0.25 + rng() * 0.25;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
    b.position.set((rng() - 0.5) * 0.6, r * 0.7, (rng() - 0.5) * 0.6);
    b.scale.y = 0.8;
    b.rotation.set(rng(), rng(), rng());
    g.add(b);
  }
  g.position.set(x, y - 0.04, z);
  g.userData.swayRoot = true;
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}
