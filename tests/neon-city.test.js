import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// N2 (2026-11-23): ciudad lejana rediseñada de los temas neón (neon, neonPink, cyber2078 / hoyo 15). Torres
// escalonadas con cimas afiladas, franjas de neón, antenas y helipuertos, ventanas con la fachada determinista de N0.
// Solo entorno: sin física, sin rng del hoyo, lejos de la pista y sin cruzarse con el ASCII. Ver assets/neonCity.js.

const city = await import('../src/game/render/assets/neonCity.js');
const { CITY_BUDGET, CITY_LAYOUT, CITY_LEGACY_DRAWS, facadeTexture, makeNeonCity, addNeonCity } = city;
const { THEMES } = await import('../src/game/themes.js');
const { ASCII_LAYOUT, addAsciiNeon } = await import('../src/game/render/assets/asciiNeon.js');

const LEVELS = ['low', 'medium', 'high'];
const NEON = ['neon', 'neonPink', 'cyber2078'];
const BOUNDS = { minX: -4, maxX: 4, minZ: -10, maxZ: 10, maxY: 0 };

// la ciudad se monta ANTES de que exista ningún `document` (node puro, sin canvas)
const NO_DOC = typeof globalThis.document === 'undefined';
const FACADE_NO_DOC = facadeTexture(THEMES.neon.neon);
const CITY_NO_DOC = LEVELS.map((level) => addNeonCity(new THREE.Scene(), { bounds: BOUNDS, theme: THEMES.neon, level }));

// el resto del entorno (rejilla del suelo, letreros) sí usa canvas: un doble mínimo basta
const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx()), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx(), addEventListener() {} }) };

const { buildEnvironment, courseBounds } = await import('../src/game/render/environment.js');
const { setupCyberpunkEnvironment, SKYWAY_Y } = await import('../src/game/render/cyberpunkEnvironment.js');
const { COURSES } = await import('../src/game/courses.js');
const { setQuality, isAutoQuality, getQuality, qualityPreset } = await import('../src/game/render/quality.js');

function withQuality(level, fn) {
  const prev = isAutoQuality() ? null : getQuality();
  setQuality(level);
  try {
    return fn();
  } finally {
    setQuality(prev);
  }
}
function lcg(seed) {
  let s = seed;
  const f = () => (f.calls++, (s = (s * 16807) % 2147483647) / 2147483647);
  f.calls = 0;
  return f;
}
const trisOf = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
const cityGroup = (scene) => scene.children.find((o) => o.name === 'neon-city');
const neonCourses = () => COURSES.filter((c) => THEMES[c.theme].neon);
/** Vértices de la ciudad en coordenadas del mundo. */
function worldVerts(group) {
  group.updateMatrixWorld(true);
  const out = [], v = new THREE.Vector3();
  for (const m of group.children) {
    const P = m.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) out.push(v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld).toArray());
  }
  return out;
}
const distToBounds = (b, x, z) => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
const angDiff = (a, b) => Math.abs((((a - b) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);

test('fachada: DataTexture pequeña (≤ 128 px) pintada en node sin document con la fachada determinista de N0, compartida', () => {
  assert.ok(NO_DOC, 'la ciudad se montó sin document');
  assert.ok(FACADE_NO_DOC?.isDataTexture, 'DataTexture en node');
  const { width, height, data } = FACADE_NO_DOC.image;
  assert.ok(width <= 128 && height <= 128, `${width} x ${height}`);
  assert.equal(facadeTexture(THEMES.neon.neon), FACADE_NO_DOC, 'una sola textura por paleta');
  assert.equal(facadeTexture(THEMES.cyber2078.neon), FACADE_NO_DOC, 'cyber2078 comparte la del neón (misma paleta)');
  assert.notEqual(facadeTexture(THEMES.neonPink.neon), FACADE_NO_DOC, 'otra paleta, otra textura');
  assert.equal(FACADE_NO_DOC.colorSpace, THREE.SRGBColorSpace);
  assert.equal(FACADE_NO_DOC.wrapS, THREE.RepeatWrapping);
  // ventanas encendidas con los colores del tema (rejilla de N0): hay píxeles de c1 y de c2 y fondo obsidiana
  const hex = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
  const seen = new Set();
  for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  assert.ok(seen.has(hex(THEMES.neon.neon[0])) && seen.has(hex(THEMES.neon.neon[1])), 'ventanas en los dos neones');
  assert.ok(seen.has(hex(0x090b16)), 'fondo obsidiana de la fachada');
  const src = readFileSync(new URL('../src/game/render/assets/neonCity.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /document\b|Math\.random/, 'sin canvas ni azar sin semilla');
});

test('presupuesto por calidad: torres, llamadas y triángulos Bajo < Medio < Alto, medido bajo el tope', () => {
  for (const k of ['towers', 'calls', 'tris'])
    assert.ok(CITY_BUDGET[k].low < CITY_BUDGET[k].medium && CITY_BUDGET[k].medium < CITY_BUDGET[k].high, k);
  assert.ok(CITY_BUDGET.calls.high <= 4, 'como mucho 4 llamadas de dibujo');
  const measured = LEVELS.map((level, i) => {
    const h = CITY_NO_DOC[i];
    const meshes = h.group.children.filter((o) => o.isMesh);
    assert.equal(h.stats.towers, CITY_BUDGET.towers[level], `${level}: torres`);
    assert.equal(h.stats.calls, meshes.length, `${level}: llamadas = mallas`);
    assert.equal(h.stats.calls, CITY_BUDGET.calls[level], `${level}: ${h.stats.calls} llamadas`);
    assert.equal(h.stats.triangles, meshes.reduce((s, m) => s + trisOf(m), 0));
    assert.ok(h.stats.triangles <= CITY_BUDGET.tris[level], `${level}: ${h.stats.triangles} triángulos (tope ${CITY_BUDGET.tris[level]})`);
    // materiales distintos por malla: cada malla es una llamada (nada que bakeStatic junte después)
    assert.equal(new Set(meshes.map((m) => m.material.uuid)).size, meshes.length);
    return h.stats.triangles;
  });
  assert.ok(measured[0] < measured[1] && measured[1] < measured[2], `medido ${measured.join('/')}`);
  // neón y carteles con los colores (saturados) del tema en cada vértice: ni negro ni blanco/gris
  for (const h of CITY_NO_DOC)
    for (const m of h.group.children.filter((m) => m.geometry.attributes.color)) {
      const C = m.geometry.attributes.color.array;
      for (let i = 0; i < C.length; i += 3) {
        const hi = Math.max(C[i], C[i + 1], C[i + 2]), lo = Math.min(C[i], C[i + 1], C[i + 2]);
        assert.ok(hi > 0.2 && hi - lo > 0.3, `${m.name}: vértice sin color de neón (${C[i]}, ${C[i + 1]}, ${C[i + 2]})`);
      }
    }
  // la calidad del juego llega como q.lod (0..2) y da lo mismo que el nombre
  for (const [i, level] of LEVELS.entries()) {
    const h = addNeonCity(new THREE.Scene(), { bounds: BOUNDS, theme: THEMES.neon, level: qualityPreset(level).lod });
    assert.equal(h.stats.triangles, measured[i]);
  }
});

test('torres: escalonadas, cimas afiladas, antenas y helipuertos; sin chocar entre sí', () => {
  const towers = CITY_NO_DOC[2].towers;
  const styles = new Set(towers.map((t) => t.style));
  for (const s of ['spire', 'antenna', 'helipad']) assert.ok(styles.has(s), `hay torres ${s}`);
  assert.ok(towers.some((t) => t.tiers >= 3) && towers.every((t) => t.tiers >= 1), 'escalonadas (1-3 cuerpos)');
  for (let i = 0; i < towers.length; i++) {
    const a = towers[i];
    assert.ok(a.top <= CITY_LAYOUT.maxY && a.top > 0);
    for (let j = i + 1; j < towers.length; j++) {
      const b = towers[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(d > a.radius + b.radius, `torres ${i} y ${j} se cruzan (${d.toFixed(1)} m)`);
    }
  }
});

test('no se cruza con el ASCII ni con el tráfico: bajo las nubes y las naves, por delante y fuera de los pilares', () => {
  assert.ok(CITY_LAYOUT.maxY < ASCII_LAYOUT.clouds.y[0], 'bajo la capa de nubes ASCII');
  assert.ok(CITY_LAYOUT.maxY < ASCII_LAYOUT.flyers.y[0], 'bajo las naves ASCII');
  assert.ok(CITY_LAYOUT.maxY < SKYWAY_Y, 'bajo el tráfico aéreo');
  for (const [i, level] of LEVELS.entries()) {
    const h = CITY_NO_DOC[i];
    const verts = worldVerts(h.group);
    for (const [x, y, z] of verts) {
      assert.ok(y <= CITY_LAYOUT.maxY + 1e-6, `${level}: y ${y.toFixed(1)}`);
      assert.ok(Math.hypot(x, y, z) < 170, `${level}: dentro de la cúpula del cielo`);
    }
    // pilares reales del ASCII de esta calidad: ninguna torre delante (se ven entre las torres) ni detrás
    const s = new THREE.Scene();
    const ascii = addAsciiNeon(s, { bounds: BOUNDS, theme: THEMES.neon, level });
    const pillars = ascii.group.children.find((m) => m.name === 'ascii-pillars');
    const O = pillars.geometry.attributes.aOrbit.array, S = pillars.geometry.attributes.aShape.array;
    for (let p = 0; p < O.length; p += 16) {
      const pa = O[p], pr = O[p + 1], half = S[p] / 2 / pr;
      for (const t of h.towers) {
        assert.ok(Math.hypot(t.x, t.z) + t.radius < pr - 2, `${level}: torre por delante del anillo de pilares`);
        const gap = angDiff(Math.atan2(t.z, t.x), pa) - half - t.radius / Math.hypot(t.x, t.z);
        assert.ok(gap > 0.02, `${level}: torre tapa un pilar (${gap.toFixed(3)} rad)`);
      }
    }
    ascii.dispose();
  }
});

test('distancia mínima a la pista y fuera de los letreros del hoyo 15, en todos los hoyos neón', () => {
  assert.ok(CITY_LAYOUT.minGap >= 40);
  for (const c of neonCourses()) {
    const b = courseBounds(c);
    for (const level of LEVELS) {
      const h = addNeonCity(new THREE.Scene(), { bounds: b, theme: THEMES[c.theme], level });
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      let min = Infinity;
      for (const [x, , z] of worldVerts(h.group)) {
        min = Math.min(min, distToBounds(b, x, z));
        // letreros verticales de buildCyberCity: a 52-62 m del centro
        assert.ok(Math.hypot(x - cx, z - cz) > 63, `${c.name}: delante de los letreros`);
      }
      assert.ok(min >= CITY_LAYOUT.minGap, `${c.name} (${level}): ${min.toFixed(1)} m de la pista`);
      h.dispose();
    }
  }
});

test('no toca física: sin sombras, sin rayos, sin colliders; el hoyo no cambia', () => {
  for (const k of NEON) {
    const c = COURSES.find((c) => c.theme === k);
    const before = JSON.stringify(c);
    const scene = new THREE.Scene();
    const h = addNeonCity(scene, { bounds: courseBounds(c), theme: THEMES[k], level: 'high' });
    assert.equal(JSON.stringify(c), before);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(1, 0, 0));
    ray.far = 1000;
    for (let i = 0; i < 32; i++) {
      ray.ray.direction.set(Math.cos(i), 0.05, Math.sin(i)).normalize();
      assert.equal(ray.intersectObject(h.group, true).length, 0, `${k}: sin rayos`);
    }
    h.group.traverse((o) => {
      assert.equal(o.castShadow, false);
      assert.equal(o.receiveShadow, false);
      assert.equal(o.userData.collider, undefined);
      if (o.isMesh) assert.equal(o.userData.keep, true, 'bakeStatic no la toca (ya va junta)');
    });
  }
  const src = readFileSync(new URL('../src/game/render/assets/neonCity.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /physics|course\.js/, 'no importa la física ni el hoyo');
});

test('entorno neón real: la ciudad nueva sale en los 4 hoyos neón y en ningún tema natural; los focos nacen en sus torres', () => {
  for (const level of LEVELS)
    withQuality(level, () => {
      for (const c of neonCourses()) {
        const scene = new THREE.Scene();
        const env = buildEnvironment(scene, c, THEMES[c.theme], lcg(7));
        const g = cityGroup(scene);
        assert.ok(g, `${c.name} (${level}): ciudad`);
        const meshes = g.children.filter((o) => o.isMesh);
        assert.equal(meshes.length, CITY_BUDGET.calls[level], `${c.name} (${level}): llamadas`);
        assert.ok(meshes.reduce((s, m) => s + trisOf(m), 0) <= CITY_BUDGET.tris[level]);
        assert.equal(meshes[0].material.map, facadeTexture(THEMES[c.theme].neon), 'fachada compartida');
        // los dos focos (conos aditivos) salen de la cima de dos torres
        const beams = scene.children.filter((o) => o.isMesh && o.geometry.type === 'ConeGeometry');
        assert.equal(beams.length, 2);
        const tops = g.userData.beamBases;
        for (const b of beams) assert.ok(tops.some((p) => b.position.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) < 1e-6), `${c.name}: foco en una torre`);
        env.dispose();
      }
    });
  for (const c of COURSES.filter((c) => !THEMES[c.theme].neon).slice(0, 3)) {
    const scene = new THREE.Scene();
    buildEnvironment(scene, c, THEMES[c.theme], lcg(7));
    assert.ok(!cityGroup(scene), c.name);
  }
});

test('niebla: la ciudad la recibe (cyberFog en el hoyo 15) y queda dentro de su alcance', () => {
  for (const k of NEON) {
    const c = COURSES.find((c) => c.theme === k);
    const scene = new THREE.Scene();
    const env = buildEnvironment(scene, c, THEMES[k], lcg(7));
    assert.equal(scene.fog.color.getHex(), new THREE.Color(THEMES[k].cyberFog ?? THEMES[k].skyHorizon).getHex(), k);
    const g = cityGroup(scene);
    for (const m of g.children) assert.equal(m.material.fog, true, `${k}/${m.name}: con niebla`);
    const b = courseBounds(c);
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    for (const [x, , z] of worldVerts(g)) assert.ok(Math.hypot(x - cx, z - cz) < scene.fog.far - 20, `${k}: se ve a través de la niebla`);
    env.dispose();
  }
  assert.ok(THEMES.cyber2078.cyberFog != null);
});

test('rng del hoyo: la ciudad no tira (0 tiradas propias) y el decorado neón no se mueve', () => {
  // la ciudad vieja tiraba 3 veces por torre (12 torres); se conservan esas tiradas fuera del módulo nuevo
  assert.equal(CITY_LEGACY_DRAWS, 36);
  const c = COURSES.find((c) => c.theme === 'neon');
  const rng = lcg(7);
  setupCyberpunkEnvironment(new THREE.Scene(), new THREE.Group(), courseBounds(c), THEMES.neon, rng, [], qualityPreset('high'));
  assert.equal(rng.calls, CITY_LEGACY_DRAWS, 'mismas tiradas que la ciudad vieja');
  // totales medidos con la ciudad vieja (N0/N6/N7): el resto del decorado sale en el mismo sitio
  const BASE = {
    low: { 'Looping Neón': 1419, 'Doble Looping': 1418, 'Tubos Neón': 1419, Cyberpunk2078: 1435 },
    medium: { 'Looping Neón': 1434, 'Doble Looping': 1434, 'Tubos Neón': 1434, Cyberpunk2078: 1449 },
    high: { 'Looping Neón': 1447, 'Doble Looping': 1447, 'Tubos Neón': 1445, Cyberpunk2078: 1475 },
  };
  for (const level of LEVELS)
    withQuality(level, () => {
      for (const c of neonCourses()) {
        const base = lcg(7);
        let fromCity = 0;
        const rng = () => {
          const lim = Error.stackTraceLimit;
          Error.stackTraceLimit = 60;
          const st = new Error().stack;
          Error.stackTraceLimit = lim;
          if (/assets[\\/]neonCity\.js/.test(st)) fromCity++;
          return base();
        };
        buildEnvironment(new THREE.Scene(), c, THEMES[c.theme], rng);
        assert.equal(fromCity, 0, `${c.name} (${level}): la ciudad no tira del rng del hoyo`);
        assert.equal(base.calls, BASE[level][c.name], `${c.name} (${level}): tiradas totales`);
      }
    });
  // determinista: dos montajes, mismos vértices
  const p = () => worldVerts(addNeonCity(new THREE.Scene(), { bounds: BOUNDS, theme: THEMES.neonPink, level: 'high' }).group);
  assert.deepEqual(p(), p());
});

test('dispose seguro: env.dispose quita la ciudad y libera geometrías y materiales una vez; la fachada compartida se queda', () => {
  const c = COURSES.find((c) => c.theme === 'cyber2078');
  const scene = new THREE.Scene();
  const env = buildEnvironment(scene, c, THEMES.cyber2078, lcg(7));
  const g = cityGroup(scene);
  const freed = [];
  for (const m of g.children) {
    m.geometry.addEventListener('dispose', () => freed.push(`${m.name}-geo`));
    m.material.addEventListener('dispose', () => freed.push(`${m.name}-mat`));
  }
  const tex = facadeTexture(THEMES.cyber2078.neon);
  let texFreed = 0;
  const onTex = () => texFreed++;
  tex.addEventListener('dispose', onTex);
  env.dispose();
  assert.ok(!cityGroup(scene), 'la ciudad sale de la escena');
  assert.equal(freed.length, g.children.length * 2);
  assert.doesNotThrow(() => env.dispose());
  assert.equal(freed.length, g.children.length * 2, 'sin doble liberación');
  assert.equal(texFreed, 0, 'la fachada es compartida entre hoyos');
  tex.removeEventListener('dispose', onTex);
  // update por fotograma: no crea objetos
  const s2 = new THREE.Scene(), animated = [];
  const h = addNeonCity(s2, { bounds: BOUNDS, theme: THEMES.neon, level: 'medium', animated });
  assert.ok(animated.includes(h.update));
  const snap = () => h.group.children.map((m) => [m.uuid, m.geometry.uuid, m.material.uuid]);
  const s0 = snap();
  for (let i = 0; i < 120; i++) h.update(i / 60, 1 / 60);
  assert.deepEqual(snap(), s0);
  h.dispose();
  assert.doesNotThrow(() => h.dispose());
  // sin tema neón: nada
  const s3 = new THREE.Scene();
  const none = addNeonCity(s3, { bounds: BOUNDS, theme: THEMES.meadow, level: 'high' });
  assert.equal(s3.children.length, 0);
  assert.equal(none.stats.calls, 0);
  assert.doesNotThrow(() => (none.update(1, 1 / 60), none.dispose()));
});

test('laboratorio: «Neón · ciudad lejana» registrada', async () => {
  const src = readFileSync(new URL('../src/lab/assets/examples.js', import.meta.url), 'utf8');
  assert.match(src, /id: 'neon-city'/);
  assert.match(src, /Neón · ciudad lejana/);
  assert.match(src, /makeNeonCity/);
  assert.equal(typeof makeNeonCity, 'function');
  const g = makeNeonCity({ level: 'low', theme: THEMES.neonPink });
  assert.ok(g.isGroup && g.children.length === CITY_BUDGET.calls.low);
});
