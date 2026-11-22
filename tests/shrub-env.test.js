import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx()), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx(), addEventListener() {} }) };

const { buildEnvironment, makeNatureShrub, shrubPaletteOpts, SHRUB_SCALE } = await import('../src/game/render/environment.js');
const { makeBush } = await import('../src/game/render/flora.js');
const { makeLushBush } = await import('../src/game/render/lushEnvironment.js');
const { makeShrub, shrubMaterial } = await import('../src/game/render/assets/shrub.js');
const { COURSES } = await import('../src/game/courses.js');
const { THEMES } = await import('../src/game/themes.js');
const { floraOf } = await import('../src/game/render/flora.js');
const { seededRng } = await import('../src/lab/assetRegistry.js');

function lcg(seed) {
  let s = seed;
  const f = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  f.state = () => s;
  return f;
}
function build(course) {
  const scene = new THREE.Scene();
  const rng = lcg(7);
  buildEnvironment(scene, course, THEMES[course.theme], rng);
  const meshes = [];
  scene.traverse((o) => o.isMesh && meshes.push(o));
  return { scene, rng, meshes };
}
const usesShrub = (meshes) => meshes.some((o) => o.material === shrubMaterial());
const hasShrubs = (t) => t && !t.neon && (t.lushEnv || floraOf(t).ground === 'grass');
const withShrubs = COURSES.filter((c) => hasShrubs(THEMES[c.theme]));

test('entorno natural: los temas con arbustos los construyen con shrub.js', () => {
  assert.ok(withShrubs.length >= 1);
  for (const c of withShrubs) assert.ok(usesShrub(build(c).meshes), `${c.name} (${c.theme})`);
});

test('entorno: neón y cyberpunk no llevan arbusto nuevo', () => {
  const neon = COURSES.filter((c) => THEMES[c.theme]?.neon);
  assert.ok(neon.length >= 1);
  for (const c of neon) assert.ok(!usesShrub(build(c).meshes), c.name);
});

test('entorno: mismo hoyo y misma semilla, mismo decorado', () => {
  for (const c of withShrubs.slice(0, 3)) {
    const a = build(c), b = build(c);
    assert.equal(a.meshes.length, b.meshes.length, c.name);
    assert.equal(a.rng.state(), b.rng.state(), c.name);
  }
});

test('arbusto del decorado: gasta 3 tiradas siempre, sea cual sea la calidad', () => {
  for (const level of [0, 1, 2, 'low', 'high']) {
    const r = lcg(11);
    makeNatureShrub(r, 1, 0, 2, THEMES.meadowDay, level);
    const r2 = lcg(11);
    r2(); r2(); r2();
    assert.equal(r.state(), r2.state(), `nivel ${level}`);
  }
});

// El arbusto nuevo (mediterráneo, 4 formas) es más alto y vertical que el liso viejo y se parece más al facetado
// en proporciones: se exige que alto y ancho medios caigan entre los de los dos viejos (con 5 cm de margen),
// en vez de pegarlos al liso. Se mide con un rng bien repartido (seededRng): la primera tirada de lcg(i * 101)
// es casi 0 para i pequeño y dejaba el factor de escala siempre en x0,8.
test('arbusto del decorado: escala nombrada y tamaño medio entre el del liso y el del facetado viejos', () => {
  assert.ok(SHRUB_SCALE > 0.5 && SHRUB_SCALE < 2);
  const dim = (g) => {
    g.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(g);
    return [b.max.y - b.min.y, Math.max(b.max.x - b.min.x, b.max.z - b.min.z)];
  };
  const mat = new THREE.MeshLambertMaterial();
  const sum = { nu: [0, 0], lush: [0, 0], fac: [0, 0] };
  const N = 80;
  const theme = THEMES[withShrubs[0].theme];
  const add = (k, [h, w]) => ((sum[k][0] += h / N), (sum[k][1] += w / N));
  for (let i = 1; i <= N; i++) {
    const g = makeNatureShrub(seededRng(i * 101), 3, 1, -2, theme, 1);
    assert.equal(g.userData.swayRoot, true);
    assert.deepEqual(g.position.toArray(), [3, 0.96, -2]);
    add('nu', dim(g));
    add('lush', dim(makeLushBush(seededRng(i * 101), 0, 0, 0, [mat], 2)));
    add('fac', dim(makeBush(seededRng(i * 101), 0, 0, 0, [mat])));
  }
  const between = (k) => {
    const v = sum.nu[k], a = Math.min(sum.lush[k], sum.fac[k]), b = Math.max(sum.lush[k], sum.fac[k]);
    return v > a - 0.05 && v < b + 0.05;
  };
  const msg = () => `nuevo ${sum.nu.map((v) => v.toFixed(2))} liso ${sum.lush.map((v) => v.toFixed(2))} facetado ${sum.fac.map((v) => v.toFixed(2))}`;
  assert.ok(between(0), `alto: ${msg()}`);
  assert.ok(between(1), `ancho: ${msg()}`);
  assert.equal(typeof makeBush, 'function'); // el «Antes» del laboratorio sigue disponible
});

test('paleta: las hojas del tema llegan al arbusto', () => {
  assert.deepEqual(shrubPaletteOpts(undefined), {});
  assert.deepEqual(shrubPaletteOpts(THEMES.meadowDay).leaves, THEMES.meadowDay.leaves);
  const meanR = (g) => {
    const a = g.children[0].geometry.attributes.color;
    let s = 0;
    for (let i = 0; i < a.count; i++) s += a.getX(i);
    return s / a.count;
  };
  const red = meanR(makeShrub(seededRng(5), 'low', { leaves: [0xff0000] }));
  const green = meanR(makeShrub(seededRng(5), 'low', { leaves: [0x00ff00] }));
  assert.notEqual(red, green);
});
