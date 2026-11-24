import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// Agua tóxica del neón (2026-11-23): cuerpo pútrido, capa radiactiva, motas de suciedad y vapor verde.
// Solo dibujo: la física no cambia. Ver assets/water.js y assets/neonWater.js.

// el entorno crea texturas con canvas: en node no hay, y un doble mínimo basta
const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx()), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx(), addEventListener() {} }) };

const { addWater, waterSupported, waterMaterial, waterPalette, waterShaderSource, WATER_MAX_CALLS } = await import('../src/game/render/assets/water.js');
const { NEON_FX_BUDGET, NEON_WATER_MAX_CALLS, NEON_WATER, neonGlow, vaporPuff, dirtFade } = await import('../src/game/render/assets/neonWater.js');
const { buildEnvironment } = await import('../src/game/render/environment.js');
const { COURSES } = await import('../src/game/courses.js');
const { THEMES } = await import('../src/game/themes.js');
const { setQuality, isAutoQuality, getQuality } = await import('../src/game/render/quality.js');

const LEVELS = ['low', 'medium', 'high'];
const NEON = ['neon', 'neonPink', 'cyber2078'];
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
// cuenco sintético: 2 m de agua en el centro, orilla a 20 m
const bowl = (x, z) => -1 + 2 * (Math.hypot(x, z) / 20 - 1);
const neonWater = (level, theme = THEMES.neon) => {
  const scene = new THREE.Scene();
  const w = addWater(scene, { size: 60, y: -1, heightAt: bowl, level, theme });
  return { scene, w };
};
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

test('neón lleva agua: waterSupported, material y addWater no nulos (neon, neonPink, cyber2078); lava y caldera siguen sin ella', () => {
  for (const k of NEON) {
    assert.equal(waterSupported(THEMES[k]), true, k);
    assert.ok(waterMaterial('medium', THEMES[k]), k);
    const { scene, w } = neonWater('medium', THEMES[k]);
    assert.ok(w && w.lake, `${k}: agua`);
    assert.ok(scene.children.includes(w.group), k);
  }
  for (const [k, t] of Object.entries(THEMES).filter(([, t]) => t.lava || t.caldera)) assert.equal(waterSupported(t), false, k);
  // una ciudad sin neón (ninguno la usa hoy) seguiría sin agua nueva
  assert.equal(waterSupported({ ...THEMES.meadow, cyberCity: true }), false);
});

test('paleta del neón: fondo pútrido oscuro (verde-amarillo) y superficie radiactiva más verde y brillante; los demás temas no cambian', () => {
  for (const k of NEON) {
    const p = waterPalette(THEMES[k]);
    assert.ok(p.surface, `${k}: color de la capa superficial`);
    // fondo: verde-amarillento (pútrido) y oscuro
    assert.ok(p.deep.g > p.deep.b && p.deep.r > p.deep.b, `${k}: fondo verde-amarillo`);
    assert.ok(lum(p.deep) < 0.05, `${k}: fondo oscuro (${lum(p.deep)})`);
    // de arriba abajo: radiactivo claro -> somero -> pútrido oscuro
    assert.ok(lum(p.surface) > 4 * lum(p.shallow) || lum(p.surface) > 0.3, `${k}: superficie brillante`);
    assert.ok(lum(p.shallow) > lum(p.deep), `${k}: somero más claro que el fondo`);
    assert.ok(p.surface.g > 2 * p.surface.r && p.surface.g > 2 * p.surface.b, `${k}: superficie verde neón`);
    const sat = (c) => c.g / Math.max(1e-4, (c.r + c.b) / 2);
    assert.ok(sat(p.surface) > sat(p.deep), `${k}: superficie más verde que el fondo`);
    // los dos neón comparten el agua tóxica (no el azul/violeta de su tema)
    assert.equal(p.deep.getHex(), waterPalette(THEMES.neon).deep.getHex());
  }
  // temas naturales: la paleta de siempre (cuerpo = agua del tema), sin capa radiactiva
  for (const k of ['meadow', 'beach', 'jungle']) {
    const t = THEMES[k], m = waterPalette(t);
    assert.equal(m.surface, undefined, k);
    assert.equal(m.deep.getHex(), new THREE.Color(t.water ?? (t.sunIntensity < 2 ? 0x1b5f86 : 0x2bb3e6)).multiplyScalar(0.55).getHex(), k);
  }
});

test('sombreador del neón: dos tonos por profundidad, capa radiactiva con fresnel verde; espuma, oleaje y ondas se mantienen', () => {
  for (const level of LEVELS) {
    const n = waterShaderSource(level, { neon: true }), w = waterShaderSource(level);
    assert.match(n.fragmentShader, /uniform vec3 uSurface;/, level);
    assert.match(n.fragmentShader, /col \+= uSurface \* glowK/, `${level}: la capa radiactiva suma al color`);
    assert.match(n.fragmentShader, /pow\(1\.0 - cosV, /, `${level}: fresnel de la capa`);
    assert.match(n.fragmentShader, /mix\(uShallow, uDeep, deepK\)/, level);
    assert.match(n.fragmentShader, /float foam = /, level);
    assert.doesNotMatch(w.fragmentShader, /uSurface/, `${level}: el agua natural no cambia`);
    assert.equal(n.vertexShader, w.vertexShader, `${level}: mismo vértice (oleaje igual)`);
    const mat = waterMaterial(level, THEMES.neon);
    assert.ok(mat.uniforms.uSurface, level);
    assert.equal(mat.fragmentShader, n.fragmentShader, level);
    assert.notEqual(mat, waterMaterial(level, THEMES.meadow));
    assert.equal(!!mat.uniforms.uNormalMap, level !== 'low', level);
  }
  // fresnel: de canto se ve más capa radiactiva que mirando de frente; somero más que hondo
  assert.ok(neonGlow(0.05, 0) > neonGlow(0.95, 0));
  assert.ok(neonGlow(0.6, 0) > neonGlow(0.6, 1));
  assert.ok(neonGlow(1, 1) > 0, 'algo de brillo siempre');
  assert.ok(NEON_WATER.alpha[0] < NEON_WATER.alpha[1] && NEON_WATER.alpha[1] < 0.9, 'deja ver las motas');
});

test('motas y vapor: una malla de puntos cada una, número por calidad dentro del presupuesto (Bajo < Medio < Alto)', () => {
  const counts = {};
  for (const level of LEVELS) {
    const { w } = neonWater(level);
    const { dirt, vapor } = w;
    for (const [name, p] of [['dirt', dirt], ['vapor', vapor]]) {
      assert.ok(p?.isPoints, `${level}: ${name} es THREE.Points`);
      assert.ok(p.material.isShaderMaterial && !Array.isArray(p.material), `${level}: ${name} un material`);
      assert.equal(p.geometry.groups.length, 0, `${level}: ${name} una sola llamada`);
      assert.equal(p.geometry.attributes.position.count, NEON_FX_BUDGET[name][level], `${level}: ${name}`);
      assert.ok(w.group.children.includes(p), `${level}: ${name} en el grupo del agua`);
      assert.equal(p.material.uniforms.uWind?.value, w.material.uniforms.uWind.value, `${level}: ${name} con el tiempo del viento`);
    }
    counts[level] = [dirt.geometry.attributes.position.count, vapor.geometry.attributes.position.count];
    assert.equal(w.stats.calls, w.meshes.length + 2, level);
    assert.ok(w.stats.calls <= NEON_WATER_MAX_CALLS && NEON_WATER_MAX_CALLS === WATER_MAX_CALLS + 2, level);
    assert.deepEqual(w.stats.points, { dirt: counts[level][0], vapor: counts[level][1] }, level);
    // motas dentro del agua (bajo la superficie, sobre el fondo); vapor saliendo de la superficie
    const dp = dirt.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      const y = dp.getY(i), h = bowl(dp.getX(i), dp.getZ(i));
      assert.ok(y < -1 - 0.05 && y > h, `${level}: mota ${i} fuera del agua (${y}, fondo ${h})`);
    }
    const vp = vapor.geometry.attributes.position;
    for (let i = 0; i < vp.count; i++) assert.ok(Math.abs(vp.getY(i) + 1) < 1e-6 && bowl(vp.getX(i), vp.getZ(i)) < -1, `${level}: vapor ${i} sobre el agua`);
    // vapor: aditivo y sin escribir profundidad; las motas se dibujan antes que el agua (se ven a través)
    assert.equal(vapor.material.blending, THREE.AdditiveBlending);
    assert.equal(vapor.material.depthWrite, false);
    assert.equal(dirt.material.depthWrite, false);
    assert.ok(dirt.renderOrder < Math.min(...w.meshes.map((m) => m.renderOrder)), 'motas antes que el agua');
    assert.ok(vapor.renderOrder > Math.max(...w.meshes.map((m) => m.renderOrder)), 'vapor después del agua');
  }
  assert.ok(counts.low[0] < counts.medium[0] && counts.medium[0] < counts.high[0], JSON.stringify(counts));
  assert.ok(counts.low[1] < counts.medium[1] && counts.medium[1] < counts.high[1], JSON.stringify(counts));
  // móvil (Bajo/Medio): pocas partículas
  assert.ok(NEON_FX_BUDGET.dirt.medium <= 300 && NEON_FX_BUDGET.vapor.medium <= 80, JSON.stringify(NEON_FX_BUDGET));
  // los temas naturales no llevan motas ni vapor
  const sc = new THREE.Scene();
  const nat = addWater(sc, { size: 60, y: -1, heightAt: bowl, level: 'high', theme: THEMES.meadow });
  assert.equal(nat.dirt ?? null, null);
  assert.equal(nat.vapor ?? null, null);
  assert.equal(nat.stats.calls, nat.meshes.length);
});

test('motas y vapor: deterministas (sin Math.random ni rng del hoyo) y el movimiento va en el sombreador', () => {
  const a = neonWater('high').w, b = neonWater('high').w;
  assert.deepEqual(Array.from(a.dirt.geometry.attributes.position.array), Array.from(b.dirt.geometry.attributes.position.array));
  assert.deepEqual(Array.from(a.vapor.geometry.attributes.position.array), Array.from(b.vapor.geometry.attributes.position.array));
  const src = readFileSync(new URL('../src/game/render/assets/neonWater.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /Math\.random/);
  assert.match(a.dirt.material.vertexShader, /uWind\.w/);
  assert.match(a.vapor.material.vertexShader, /uWind\.w/);
  assert.match(a.vapor.material.vertexShader, /uWind\.xy/, 'el vapor se inclina con el viento');
  // ciclo del vapor: sube, se ensancha y se desvanece (nace y muere invisible)
  let prev = vaporPuff(0);
  assert.ok(prev.fade < 1e-6);
  for (let i = 1; i <= 20; i++) {
    const s = vaporPuff(i / 20);
    assert.ok(s.rise > prev.rise && s.size > prev.size, `vida ${i / 20}`);
    prev = s;
  }
  assert.ok(prev.fade < 1e-6 && vaporPuff(0.3).fade > 0.5);
  assert.ok(dirtFade(0) < 1e-6 && dirtFade(1) < 1e-6 && dirtFade(0.5) > 0.9);
});

test('dispose: quita el agua del neón y libera geometrías y materiales de motas y vapor una sola vez', () => {
  const { scene, w } = neonWater('high');
  const freed = [];
  for (const p of [w.dirt, w.vapor]) {
    p.geometry.addEventListener('dispose', () => freed.push(`${p.name}-geo`));
    p.material.addEventListener('dispose', () => freed.push(`${p.name}-mat`));
  }
  w.dispose();
  assert.equal(scene.children.includes(w.group), false);
  assert.deepEqual(freed.sort(), [`${w.dirt.name}-geo`, `${w.dirt.name}-mat`, `${w.vapor.name}-geo`, `${w.vapor.name}-mat`].sort());
  assert.doesNotThrow(() => w.dispose());
  assert.equal(freed.length, 4, 'sin doble liberación');
});

test('entorno neón: agua tóxica con motas y vapor, sin pez, sin plano viejo, 0 tiradas del rng del hoyo y dispose', () => {
  const neonCourses = COURSES.filter((c) => THEMES[c.theme].neon);
  assert.ok(neonCourses.length >= 4);
  let withWater = 0;
  for (const level of LEVELS)
    withQuality(level, () => {
      for (const c of neonCourses) {
        const scene = new THREE.Scene(), base = lcg(7), at = {};
        // tiradas del rng del hoyo hechas desde el agua, los efectos o el pez (por la pila de llamadas)
        let fromWater = 0;
        const rng = () => {
          const lim = Error.stackTraceLimit;
          Error.stackTraceLimit = 60;
          const st = new Error().stack;
          Error.stackTraceLimit = lim;
          if (/assets[\\/](water|neonWater|fish)\.js/.test(st)) fromWater++;
          return base();
        };
        Object.defineProperty(rng, 'calls', { get: () => base.calls });
        const add = scene.add.bind(scene);
        let lastMesh = null;
        scene.add = (...o) => {
          for (const x of o) {
            if (x.name === 'water') at.water = rng.calls;
            if (x.isMesh && x.geometry?.parameters?.width === 220) at.terrain ??= rng.calls;
            lastMesh = x;
          }
          return add(...o);
        };
        const env = buildEnvironment(scene, c, THEMES[c.theme], rng);
        assert.ok(lastMesh);
        assert.equal(fromWater, 0, `${c.name} (${level}): agua, motas, vapor y pez no tiran del rng del hoyo`);
        assert.equal(scene.children.some((o) => o.name === 'fish'), false, `${c.name}: sin pez en el agua tóxica`);
        let plane = 0;
        scene.traverse((o) => o.isMesh && o.geometry?.parameters?.widthSegments === 90 && plane++);
        assert.equal(plane, 0, `${c.name}: sin plano viejo`);
        const g = scene.children.find((o) => o.name === 'water');
        if (!g) continue;
        withWater++;
        assert.equal(at.water, at.terrain, `${c.name} (${level}): el agua no gasta tiradas del rng del hoyo`);
        const dirt = g.children.find((o) => o.name === 'water-dirt'), vapor = g.children.find((o) => o.name === 'water-vapor');
        assert.ok(dirt && vapor, `${c.name} (${level}): motas y vapor`);
        assert.ok(dirt.geometry.attributes.position.count <= NEON_FX_BUDGET.dirt[level], c.name);
        assert.ok(vapor.geometry.attributes.position.count <= NEON_FX_BUDGET.vapor[level], c.name);
        const lake = g.children.find((o) => o.name === 'water-lake');
        assert.ok(lake.material.uniforms.uSurface, `${c.name}: material tóxico`);
        let disposed = 0;
        for (const o of g.children) {
          o.geometry.addEventListener('dispose', () => disposed++);
          if (o.isPoints) o.material.addEventListener('dispose', () => disposed++);
        }
        env.dispose();
        assert.equal(disposed, g.children.length + 2, `${c.name}: dispose libera agua, motas y vapor`);
        assert.equal(scene.children.includes(g), false);
      }
    });
  assert.ok(withWater >= 3, `${withWater} (hoyo, calidad) neón con agua`);
});

test('presupuesto del agua del neón en los hoyos reales: triángulos por calidad bajo tope (y bajo los 16 200 del plano viejo), ≤ 4 llamadas', () => {
  // medido 2026-11-23 (rejilla = la del terreno neón, sin enfoque): 3 451 / 5 867 / 9 700; ~25 % de margen
  const CAP = { low: 4300, medium: 7300, high: 12100 };
  for (const level of LEVELS)
    withQuality(level, () => {
      for (const c of COURSES.filter((c) => THEMES[c.theme].neon)) {
        const scene = new THREE.Scene();
        buildEnvironment(scene, c, THEMES[c.theme], lcg(7));
        const g = scene.children.find((o) => o.name === 'water');
        if (!g) continue;
        const tris = g.children.filter((o) => o.isMesh).reduce((s, m) => s + m.geometry.index.count / 3, 0);
        assert.ok(tris <= CAP[level] && tris < 16200, `${c.name} (${level}): ${tris}`);
        assert.ok(g.children.length <= NEON_WATER_MAX_CALLS, `${c.name} (${level}): ${g.children.length} llamadas`);
      }
    });
});
