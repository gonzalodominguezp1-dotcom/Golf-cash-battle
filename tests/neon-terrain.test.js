import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// N4 (2026-11-23): suelo y montañas de los temas neón (neon, neonPink, cyber2078 / hoyo 15). Solo dibujo:
// - las montañas de delante ya no tapan la parte baja de la ciudad lejana (la base de las torres se ve desde el
//   centro del hoyo); la sierra queda detrás del anillo de la ciudad;
// - suelo con rejilla de neón de brillo suave en el color del tema, apagada bajo la pista;
// - heightAt no cambia en la zona de juego ni en la banda de 5 m; el rng del hoyo tampoco; sin llamadas nuevas.
// Ver assets/neonTerrain.js.

// el entorno usa canvas (rejilla, letreros): un doble mínimo basta
const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx()), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx(), addEventListener() {} }) };

const { NEON_TERRAIN } = await import('../src/game/render/assets/neonTerrain.js');
const { buildEnvironment, courseBounds } = await import('../src/game/render/environment.js');
const { getCyberGridTexture } = await import('../src/game/render/cyberpunkEnvironment.js');
const { THEMES } = await import('../src/game/themes.js');
const { COURSES } = await import('../src/game/courses.js');
const { setQuality, isAutoQuality, getQuality } = await import('../src/game/render/quality.js');

const LEVELS = ['low', 'medium', 'high'];
const neonCourses = () => COURSES.filter((c) => THEMES[c.theme].neon);
/** Altura del ojo sobre la pista: la cámara que sigue a la bola va a 1,45-1,6 m (GolfGame FOLLOW_HEIGHT). */
const EYE = 1.45;

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
const distToBounds = (b, x, z) => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
const terrainOf = (scene) => scene.children.find((o) => o.name === 'neon-terrain');
const cityOf = (scene) => scene.children.find((o) => o.name === 'neon-city');
function drawables(scene) {
  let n = 0;
  scene.traverse((o) => (o.isMesh || o.isPoints || o.isSprite || o.isLine) && n++);
  return n;
}

// referencia: el terreno neón de antes de N4 (copia literal de environment.js), para comparar heightAt
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function legacyHeight(theme, bounds) {
  return (x, z) => {
    const d = distToBounds(bounds, x, z);
    const ramp = THREE.MathUtils.smoothstep(d, 8, 30);
    const nx = x * 0.045, nz = z * 0.045;
    const ridge1 = 1.0 - Math.abs(noise(nx + 1.7, nz + 3.1) * 2 - 1);
    const ridge2 = 1.0 - Math.abs(noise(nx * 2.2 + 5.8, nz * 2.2 + 8.4) * 2 - 1);
    const sharpPeak = Math.pow(ridge1, 2.6) * 16.0 + Math.pow(ridge2, 2.2) * 6.0;
    return theme.terrainOffset - 0.6 + (sharpPeak - 4.5) * ramp;
  };
}

test('la base de las torres queda por encima de la línea de las montañas desde el centro del hoyo (4 hoyos neón, 3 calidades)', () => {
  for (const level of LEVELS)
    withQuality(level, () => {
      for (const c of neonCourses()) {
        const theme = THEMES[c.theme];
        const scene = new THREE.Scene();
        const env = buildEnvironment(scene, c, theme, lcg(7));
        const b = courseBounds(c);
        const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
        const eye = Math.max(0, b.maxY) + EYE;
        const g = cityOf(scene);
        assert.ok(g, `${c.name}: ciudad`);
        let worst = -Infinity, where = '';
        for (const t of g.userData.city.towers) {
          const dx = Math.cos(t.a), dz = Math.sin(t.a), tx = -Math.sin(t.a), tz = Math.cos(t.a);
          // pie de la fachada que mira al hoyo: centro y cerca de las dos esquinas
          for (const k of [-0.9, 0, 0.9]) {
            const px = cx + t.x + tx * k * (t.w / 2) - dx * (t.d / 2), pz = cz + t.z + tz * k * (t.w / 2) - dz * (t.d / 2);
            const R = Math.hypot(px - cx, pz - cz), ux = (px - cx) / R, uz = (pz - cz) / R;
            // lo que se ve del pie: el suelo (o el agua, si el pie cayera en un charco)
            const base = Math.max(env.heightAt(px, pz), theme.waterLevel);
            for (let s = 0.5; s < R - 0.25; s += 0.5) {
              const over = env.heightAt(cx + ux * s, cz + uz * s) - (eye + ((base - eye) * s) / R);
              if (over > worst) (worst = over), (where = `torre a ${R.toFixed(0)} m, monte a ${s.toFixed(1)} m`);
            }
          }
        }
        assert.ok(worst < 0, `${c.name} (${level}): las montañas tapan el pie de una torre ${worst.toFixed(2)} m (${where})`);
        env.dispose();
      }
    });
});

test('la sierra sigue ahí, detrás de la ciudad, y no es una pared: alturas distintas según el rumbo', () => {
  for (const c of neonCourses()) {
    const theme = THEMES[c.theme];
    const env = buildEnvironment(new THREE.Scene(), c, theme, lcg(7));
    const b = courseBounds(c);
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const tops = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      let top = -Infinity;
      for (let r = NEON_TERRAIN.back[0]; r <= 108; r += 1) top = Math.max(top, env.heightAt(cx + Math.cos(a) * r, cz + Math.sin(a) * r));
      tops.push(top);
    }
    const hi = Math.max(...tops), lo = Math.min(...tops);
    assert.ok(hi > 8, `${c.name}: sierra lejana de más de 8 m (${hi.toFixed(1)})`);
    assert.ok(lo < hi * 0.6, `${c.name}: la cresta sube y baja (${lo.toFixed(1)}..${hi.toFixed(1)})`);
    // el llano de la ciudad, sin cerros ni charcos entre las torres
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      for (let r = NEON_TERRAIN.front; r <= NEON_TERRAIN.back[0]; r += 2) {
        const h = env.heightAt(cx + Math.cos(a) * r, cz + Math.sin(a) * r);
        assert.ok(Math.abs(h - (theme.terrainOffset - 0.6)) < 1e-9, `${c.name}: llano de la ciudad a ${r} m (${h.toFixed(2)})`);
      }
    }
    env.dispose();
  }
});

test('física: heightAt idéntico en la zona de juego y en la banda de 5 m (y el terreno dibujado ahí, igual)', () => {
  for (const c of neonCourses()) {
    const theme = THEMES[c.theme];
    const b = courseBounds(c);
    const ref = legacyHeight(theme, b);
    const scene = new THREE.Scene();
    const env = buildEnvironment(scene, c, theme, lcg(7));
    let n = 0;
    for (let x = b.minX - 5; x <= b.maxX + 5; x += 0.25)
      for (let z = b.minZ - 5; z <= b.maxZ + 5; z += 0.25) {
        if (distToBounds(b, x, z) > 5) continue;
        assert.equal(env.heightAt(x, z), ref(x, z), `${c.name}: heightAt(${x}, ${z})`);
        n++;
      }
    assert.ok(n > 1000, `${n} puntos`);
    const P = terrainOf(scene).geometry.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i);
      // la malla guarda float32
      if (distToBounds(b, x, z) <= 5) assert.equal(P.getY(i), Math.fround(ref(x, z)), `${c.name}: vértice (${x}, ${z})`);
    }
    // y fuera sí cambia (lo que tapaba la ciudad)
    let changed = 0;
    for (let a = 0; a < Math.PI * 2; a += 0.1) changed += env.heightAt(Math.cos(a) * 45, Math.sin(a) * 45) !== ref(Math.cos(a) * 45, Math.sin(a) * 45);
    assert.ok(changed > 0, `${c.name}: las montañas de delante cambian`);
    env.dispose();
  }
});

test('presupuesto: triángulos del terreno por calidad bajo el tope y sin llamadas de dibujo nuevas', () => {
  for (const k of LEVELS) assert.ok(NEON_TERRAIN.tris[k] > 0);
  assert.ok(NEON_TERRAIN.tris.low < NEON_TERRAIN.tris.medium && NEON_TERRAIN.tris.medium < NEON_TERRAIN.tris.high);
  assert.ok(NEON_TERRAIN.tris.high <= 34000, 'tope de Alto');
  // objetos que se dibujan, medidos antes de N4 (mismo rng): el suelo y las montañas son la misma malla de siempre
  const DRAWS = {
    low: { 'Looping Neón': 43, 'Doble Looping': 42, 'Tubos Neón': 43, Cyberpunk2078: 50 },
    medium: { 'Looping Neón': 48, 'Doble Looping': 47, 'Tubos Neón': 48, Cyberpunk2078: 51 },
    high: { 'Looping Neón': 52, 'Doble Looping': 52, 'Tubos Neón': 49, Cyberpunk2078: 56 },
  };
  const measured = {};
  for (const level of LEVELS)
    withQuality(level, () => {
      for (const c of neonCourses()) {
        const scene = new THREE.Scene();
        const env = buildEnvironment(scene, c, THEMES[c.theme], lcg(7));
        const t = terrainOf(scene);
        assert.ok(t?.isMesh, `${c.name}: una malla de terreno`);
        assert.equal(scene.children.filter((o) => o.name === 'neon-terrain').length, 1);
        const tris = t.geometry.index.count / 3;
        assert.ok(tris <= NEON_TERRAIN.tris[level], `${c.name} (${level}): ${tris} triángulos (tope ${NEON_TERRAIN.tris[level]})`);
        measured[level] = tris;
        assert.equal(drawables(scene), DRAWS[level][c.name], `${c.name} (${level}): objetos que se dibujan`);
        env.dispose();
      }
    });
  assert.ok(measured.low < measured.medium && measured.medium < measured.high, JSON.stringify(measured));
});

test('suelo: rejilla de neón con brillo suave del color del tema, apagada bajo la pista', () => {
  for (const k of ['neon', 'neonPink', 'cyber2078']) {
    const c = COURSES.find((c) => c.theme === k);
    const theme = THEMES[k];
    const scene = new THREE.Scene();
    const env = buildEnvironment(scene, c, theme, lcg(7));
    const m = terrainOf(scene).material;
    const grid = getCyberGridTexture(theme.neon[0], theme.groundLow ?? 0x070814);
    assert.equal(m.map, grid, `${k}: rejilla compartida`);
    assert.equal(m.emissiveMap, grid, `${k}: la rejilla brilla`);
    assert.ok(m.emissiveIntensity > 0 && m.emissiveIntensity <= 0.6, `${k}: brillo suave (${m.emissiveIntensity})`);
    assert.equal(m.emissive.getHex(), 0xffffff, 'el color lo pone la rejilla (neón del tema)');
    assert.equal(typeof m.customProgramCacheKey(), 'string');
    // el brillo se apaga bajo la pista y junto a ella (aGlow por vértice)
    const b = courseBounds(c);
    const geo = terrainOf(scene).geometry, P = geo.attributes.position, G = geo.attributes.aGlow;
    assert.ok(G, 'atributo aGlow');
    let far = 0;
    for (let i = 0; i < P.count; i++) {
      const d = distToBounds(b, P.getX(i), P.getZ(i));
      const gl = G.getX(i);
      assert.ok(gl >= 0 && gl <= 1);
      if (d <= NEON_TERRAIN.glowNear[0]) assert.equal(gl, 0, `${k}: sin brillo bajo la pista`);
      if (d >= NEON_TERRAIN.glowNear[1]) far++, assert.equal(gl, 1);
    }
    assert.ok(far > 100);
    // el sombreador real de three acepta el parche (aGlow → totalEmissiveRadiance)
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    m.onBeforeCompile(sh);
    assert.match(sh.vertexShader, /attribute float aGlow;/);
    assert.match(sh.vertexShader, /vGlow = aGlow;/);
    assert.match(sh.fragmentShader, /totalEmissiveRadiance \*= vGlow;/);
    env.dispose();
  }
  // la cuadrícula fina también va en el neón del tema (antes, blanca)
  const strokes = [];
  const doc = globalThis.document;
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {}, set: (t, k, v) => (k === 'strokeStyle' && strokes.push(v), true) }) }),
  };
  try {
    getCyberGridTexture(0x123456, 0x000000);
  } finally {
    globalThis.document = doc;
  }
  assert.ok(strokes.some((s) => /^rgba\(18, 52, 86, 0\.\d+\)$/.test(s)), strokes.join(' '));
  assert.ok(!strokes.some((s) => /255, 255, 255/.test(s)), 'sin líneas blancas');
});

test('rng del hoyo: totales de tiradas sin cambios (Looping Neón 1419/1434/1447)', () => {
  const BASE = {
    low: { 'Looping Neón': 1419, 'Doble Looping': 1418, 'Tubos Neón': 1419, Cyberpunk2078: 1435 },
    medium: { 'Looping Neón': 1434, 'Doble Looping': 1434, 'Tubos Neón': 1434, Cyberpunk2078: 1449 },
    high: { 'Looping Neón': 1447, 'Doble Looping': 1447, 'Tubos Neón': 1445, Cyberpunk2078: 1475 },
  };
  for (const level of LEVELS)
    withQuality(level, () => {
      for (const c of neonCourses()) {
        const rng = lcg(7);
        buildEnvironment(new THREE.Scene(), c, THEMES[c.theme], rng).dispose();
        assert.equal(rng.calls, BASE[level][c.name], `${c.name} (${level})`);
      }
    });
});

test('dispose seguro: el terreno neón libera su geometría y su material una vez; la rejilla compartida se queda', () => {
  const c = COURSES.find((c) => c.theme === 'cyber2078');
  const theme = THEMES.cyber2078;
  const scene = new THREE.Scene();
  const env = buildEnvironment(scene, c, theme, lcg(7));
  const t = terrainOf(scene);
  const freed = [];
  t.geometry.addEventListener('dispose', () => freed.push('geo'));
  t.material.addEventListener('dispose', () => freed.push('mat'));
  const grid = t.material.map;
  let gridFreed = 0;
  const onGrid = () => gridFreed++;
  grid.addEventListener('dispose', onGrid);
  env.dispose();
  assert.deepEqual(freed.sort(), ['geo', 'mat']);
  assert.doesNotThrow(() => env.dispose());
  assert.equal(freed.length, 2, 'sin doble liberación');
  assert.equal(gridFreed, 0, 'la rejilla es compartida entre hoyos');
  grid.removeEventListener('dispose', onGrid);
  // otro hoyo después: misma rejilla, material nuevo
  const s2 = new THREE.Scene();
  const env2 = buildEnvironment(s2, c, theme, lcg(7));
  assert.equal(terrainOf(s2).material.map, grid);
  assert.notEqual(terrainOf(s2).material, t.material);
  env2.dispose();
});
