import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// El decorado crea texturas con canvas: en node no hay, y un doble mínimo basta.
const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx()), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx(), addEventListener() {} }) };

const { buildEnvironment } = await import('../src/game/render/environment.js');
const { addWater, waterSupported, WATER_MAX_CALLS, SHORE_RNG_DRAWS, makeReeds, makeLilyPad } = await import('../src/game/render/assets/water.js');
const { COURSES } = await import('../src/game/courses.js');
const { THEMES } = await import('../src/game/themes.js');
const { warpCoord, floraOf } = await import('../src/game/render/flora.js');
const await_import_shore = await import('../src/game/render/assets/water.js');

// Agua nueva en los entornos naturales (paso 8 integrado): ver environment.js y assets/water.js.

const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
function withQuality(level, fn) {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => level, setItem() {} } });
  try {
    return fn();
  } finally {
    if (real) Object.defineProperty(globalThis, 'localStorage', real);
    else delete globalThis.localStorage;
  }
}
function lcg(seed) {
  let s = seed;
  const f = () => (f.calls++, (s = (s * 16807) % 2147483647) / 2147483647);
  f.calls = 0;
  f.state = () => s;
  return f;
}
function build(course, theme = THEMES[course.theme], seed = 7) {
  const scene = new THREE.Scene();
  const rng = lcg(seed);
  const env = buildEnvironment(scene, course, theme, rng);
  const lake = [], river = [], plane = [];
  scene.traverse((o) => {
    if (o.name === 'water-lake') lake.push(o);
    else if (o.name === 'water-river') river.push(o);
    else if (o.isMesh && o.geometry?.parameters?.widthSegments === 90) plane.push(o); // el plano viejo (90 x 90)
  });
  return { scene, rng, env, lake, river, plane, meshes: [...river, ...lake] };
}
const isNatural = (t) => waterSupported(t);
// hoyos con agua nueva: tema natural y (no a ras de suelo, o a ras con río)
const natural = COURSES.filter((c) => isNatural(THEMES[c.theme]) && !c.grounded);
const grounded = COURSES.filter((c) => isNatural(THEMES[c.theme]) && c.grounded);
const old = COURSES.filter((c) => !isNatural(THEMES[c.theme]));
const tris = (m) => m.geometry.index.count / 3;
const geoKey = (meshes) => meshes.map((m) => [m.name, ...Array.from(m.geometry.attributes.position.array, (v) => +v.toFixed(4)), ...m.geometry.attributes.waterShore.array].join()).join('|');

// terreno del juego: la malla de 220 m (cuadrícula deformada con warpCoord)
function terrainOf(scene) {
  let t = null;
  scene.traverse((o) => o.isMesh && o.geometry?.parameters?.width === 220 && o.geometry.parameters.heightSegments > 20 && !o.name && (t ??= o));
  return t;
}
function terrainHeight(geo) {
  const { widthSegments: n } = geo.parameters, p = geo.attributes.position, W1 = n + 1;
  const xs = Array.from({ length: W1 }, (_, i) => p.getX(i)), zs = Array.from({ length: W1 }, (_, i) => p.getZ(i * W1));
  const find = (a, v) => {
    let lo = 0, hi = a.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] <= v) lo = m; else hi = m; }
    return lo;
  };
  return (x, z) => {
    const i = find(xs, x), j = find(zs, z);
    const u = (x - xs[i]) / (xs[i + 1] - xs[i]), v = (z - zs[j]) / (zs[j + 1] - zs[j]);
    const h = (a, b) => p.getY(a + W1 * b);
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  };
}
function inTri(x, z, a, b, c) {
  const d1 = (x - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (z - b[1]);
  const d2 = (x - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (z - c[1]);
  const d3 = (x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (z - a[1]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
function covers(meshes) {
  const tl = [];
  for (const m of meshes) {
    const idx = m.geometry.index.array, p = m.geometry.attributes.position;
    const w = (i) => [p.getX(i) + m.position.x, p.getZ(i) + m.position.z];
    for (let i = 0; i < idx.length; i += 3) tl.push([w(idx[i]), w(idx[i + 1]), w(idx[i + 2])]);
  }
  return (x, z) => tl.some(([a, b, c]) => inTri(x, z, a, b, c));
}
const inPoly = (x, z, poly) => {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
};

let withWater = 0;
test('entorno natural: la malla de agua nueva (lago y/o cinta, un grupo) sustituye al plano viejo de 90 x 90', () => {
  assert.ok(natural.length >= 8);
  for (const level of ['low', 'medium', 'high'])
    withQuality(level, () => {
      for (const c of natural) {
        const { scene, meshes, plane, river, env } = build(c);
        assert.ok(meshes.length <= WATER_MAX_CALLS, `${c.name} (${level}): ${meshes.length} mallas de agua`);
        assert.equal(plane.length, 0, `${c.name}: sigue el plano viejo`);
        if (!meshes.length) {
          // sin agua visible (el terreno no baja al nivel del agua, p. ej. los cañones): ni grupo ni plano, 0 triángulos
          assert.equal(scene.children.some((o) => o.name === 'water'), false, c.name);
          continue;
        }
        withWater++;
        assert.equal(river.length, env.river ? 1 : 0, `${c.name}: la cinta del río (una) solo si hay río`);
        assert.equal(scene.children.filter((o) => o.name === 'water').length, 1, c.name);
        assert.ok(meshes.every((m) => !!m.material.uniforms.uRipples === (level !== 'low') && !m.castShadow && !m.receiveShadow), c.name);
        assert.ok(meshes.every((m) => m.material === meshes[0].material), `${c.name}: un material compartido`);
      }
    });
  assert.ok(withWater >= 3 * 6, `${withWater} (hoyo, calidad) con agua`);
});

test('entorno: a ras de suelo sin río no se dibuja agua (como antes); con río, solo la cinta', () => {
  for (const c of grounded) {
    const { meshes, plane, env } = build(c);
    assert.equal(plane.length, 0, c.name);
    assert.equal(meshes.length > 0, !!env.river, `${c.name}: agua solo si hay río`);
  }
});

test('entorno: neón, ciudad, lava y caldera quedan intactos (plano viejo o lava, sin malla de agua nueva)', () => {
  assert.ok(old.some((c) => THEMES[c.theme].neon) && old.some((c) => THEMES[c.theme].caldera));
  for (const c of old) {
    const { scene, meshes, plane } = build(c);
    assert.equal(meshes.length, 0, `${c.name} (${c.theme})`);
    assert.equal(scene.children.some((o) => o.name === 'water' || o.name === 'fish'), false, c.name);
    if (!THEMES[c.theme].caldera) assert.equal(plane.length, 1, `${c.name}: el plano viejo`);
  }
  // un tema de lava sintético (ningún hoyo lo usa suelto): plano de lava, sin agua nueva
  const lavaCourse = COURSES.find((c) => !c.grounded && isNatural(THEMES[c.theme]));
  const { meshes, plane } = build(lavaCourse, { ...THEMES[lavaCourse.theme], lava: true, water: 0x551100 });
  assert.equal(meshes.length, 0);
  assert.equal(plane.length, 1);
});

test('entorno: mismo hoyo y misma semilla, mismo agua y mismo estado del rng', () => {
  for (const c of natural.slice(0, 5)) {
    const a = build(c), b = build(c);
    assert.equal(a.rng.state(), b.rng.state(), c.name);
    assert.equal(a.rng.calls, b.rng.calls, c.name);
    assert.equal(geoKey(a.meshes), geoKey(b.meshes), c.name);
  }
});

test('rng del hoyo: agua 0 tiradas, pez 1 (tras el agua); juncos y nenúfares 1 cada uno, en las tres calidades', () => {
  assert.equal(SHORE_RNG_DRAWS, 1);
  for (const level of ['low', 'medium', 'high']) {
    for (const make of [makeReeds, makeLilyPad]) {
      const r = lcg(3);
      make(r, 0, 0, 0, { level });
      assert.equal(r.calls, SHORE_RNG_DRAWS, `${make.name} ${level}`);
    }
  }
  // en el entorno: entre añadir el agua y añadir el pez solo hay UNA tirada
  for (const c of natural.filter((c) => THEMES[c.theme].trees && !THEMES[c.theme].snowSand)) {
    const scene = new THREE.Scene(), rng = lcg(7), at = {};
    const add = scene.add.bind(scene);
    scene.add = (...o) => {
      for (const x of o) if (x.name === 'water' || x.name === 'fish') at[x.name] ??= rng.calls;
      return add(...o);
    };
    buildEnvironment(scene, c, THEMES[c.theme], rng);
    if (at.fish === undefined) continue;
    assert.equal(at.fish - at.water, 1, `${c.name}: el pez gasta 1 tirada y el agua 0`);
  }
});

test('zonas water de courses.js (selva y glaciar): el terreno queda por encima del agua, así que no se exige agua dibujada (la pista las pinta); y la rejilla del lago coincide con la del terreno', () => {
  const withZones = COURSES.filter((c) => (c.lava ?? []).some((z) => z.water) && isNatural(THEMES[c.theme]));
  assert.ok(withZones.length >= 2, 'selva y glaciar');
  for (const level of ['low', 'medium', 'high'])
    withQuality(level, () => {
      for (const c of withZones) {
        const { scene, meshes, lake } = build(c);
        const ty = terrainHeight(terrainOf(scene).geometry);
        const waterY = (lake[0] ?? meshes[0])?.position.y ?? c.waterLevel ?? THEMES[c.theme].waterLevel;
        let n = 0, wet = 0;
        for (const z of c.lava.filter((z) => z.water)) {
          const xs = z.poly.map((p) => p[0]), zs = z.poly.map((p) => p[1]);
          for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.15)
            for (let zz = Math.min(...zs); zz <= Math.max(...zs); zz += 0.15) {
              if (!inPoly(x, zz, z.poly)) continue;
              n++;
              if (ty(x, zz) < waterY - 1e-3) wet++;
            }
        }
        assert.ok(n > 50, `${c.name}: ${n} puntos en las zonas`);
        // hoy ninguna zona real baja del agua: si algún día baja, hay que exigir cobertura aquí (ver el test sintético de debajo)
        assert.equal(wet, 0, `${c.name} (${level}): ${wet} puntos de zona bajo el agua: pasar a exigir cobertura`);
      }
    });
});

test('el agua cubre una zona sintética que SÍ baja del nivel del agua (cuenco redondo de 8 m de radio), en las tres calidades', () => {
  const c = natural[0], theme = THEMES[c.theme];
  const [cx, cz] = [10, -20];
  const heightAt = (x, z) => Math.min(2, -0.8 + 0.7 * Math.max(0, Math.hypot(x - cx, z - cz) - 8)); // fondo -0,8 hasta 8 m y orilla suave
  for (const level of ['low', 'medium', 'high'])
    withQuality(level, () => {
      const scene = new THREE.Scene();
      const w = addWater(scene, { y: 0, heightAt, level: { low: 0, medium: 1, high: 2 }[level], theme });
      assert.ok(w, `${level}: hay agua`);
      const covered = covers(w.meshes);
      let n = 0;
      for (let x = cx - 8; x <= cx + 8; x += 0.2)
        for (let z = cz - 8; z <= cz + 8; z += 0.2) {
          if (Math.hypot(x - cx, z - cz) > 8) continue;
          n++;
          assert.ok(covered(x, z), `${level}: (${x.toFixed(2)}, ${z.toFixed(2)}) bajo el agua sin agua dibujada`);
        }
      assert.ok(n > 300, `${n} puntos`);
    });
});

test('el agua cubre todo el terreno que queda bajo el nivel del agua (lo que cubría el plano viejo), también charcas pequeñas', () => {
  let probed = 0;
  for (const level of ['low', 'medium', 'high'])
    withQuality(level, () => {
      for (const c of natural) {
        const { scene, meshes, lake, river } = build(c);
        if (!meshes.length) continue;
        const covered = covers(meshes), ty = terrainHeight(terrainOf(scene).geometry);
        const waterY = (lake[0] ?? river[0]).position.y - (lake[0] ? 0 : 0.01);
        const b = { minX: -60, maxX: 60, minZ: -60, maxZ: 60 };
        for (let x = b.minX; x <= b.maxX; x += 0.5)
          for (let z = b.minZ; z <= b.maxZ; z += 0.5) {
            // 5 cm bajo el agua: por encima de eso hay agua, y dentro de 1 cm de la orilla el relieve interpolado miente
            if (ty(x, z) >= waterY - 0.05) continue;
            probed++;
            assert.ok(covered(x, z), `${c.name} (${level}): (${x}, ${z}) a ${(waterY - ty(x, z)).toFixed(2)} m bajo el agua sin agua dibujada`);
          }
      }
    });
  assert.ok(probed > 500, `${probed} puntos mojados comprobados`);
});

test('rejilla del lago = rejilla del terreno: cada vértice del lago cae sobre un vértice del terreno', () => {
  for (const c of COURSES.filter((c) => /Herradura|Tuber/.test(c.name))) {
    const { scene, lake } = build(c);
    assert.ok(lake.length, c.name);
    const t = terrainOf(scene), p = t.geometry.attributes.position;
    const W1 = t.geometry.parameters.widthSegments + 1;
    const xs = Array.from({ length: W1 }, (_, i) => p.getX(i)), zs = Array.from({ length: W1 }, (_, i) => p.getZ(i * W1));
    const near = (a, v) => a.some((q) => Math.abs(q - v) < 1e-3); // float32 del terreno frente a la coordenada exacta
    const lp = lake[0].geometry.attributes.position, idx = lake[0].geometry.index.array;
    for (const i of idx) assert.ok(near(xs, lp.getX(i) + lake[0].position.x) && near(zs, lp.getZ(i) + lake[0].position.z), `${c.name}: vértice ${i} fuera de la rejilla del terreno`);
    assert.equal(warpCoord(1, 110), 110, 'el warp conserva el borde');
  }
});

test('triángulos de agua por calidad: muy por debajo de los 16 200 fijos de antes, siempre ≤ 2 llamadas', () => {
  const max = {};
  for (const level of ['low', 'medium', 'high'])
    withQuality(level, () => {
      for (const c of natural) {
        const { meshes } = build(c);
        const n = meshes.reduce((s, m) => s + tris(m), 0);
        max[level] = Math.max(max[level] ?? 0, n);
        assert.ok(n < 16200 && meshes.length <= 2, `${c.name} (${level}): ${n}`);
      }
    });
  // presupuesto del agua en los hoyos reales (medido: 1 131 / 2 038 / 3 491; ~25 % de margen). WATER_MAX_TRIS no vale con el `seg` del terreno.
  const CAP = { low: 1500, medium: 2600, high: 4400 };
  for (const l of ['low', 'medium', 'high']) assert.ok(max[l] <= CAP[l], `${l}: máx. ${max[l]} > ${CAP[l]}`);
  assert.ok(max.low < 16200 / 4 && max.medium < 16200 / 3 && max.high < 16200 / 2, JSON.stringify(max));
});

test('dispose: quita el agua y libera sus geometrías una sola vez; segundo dispose y lod tras dispose no lanzan', () => {
  for (const c of natural.slice(0, 4)) {
    const { scene, meshes, env } = build(c);
    let disposed = 0;
    for (const m of meshes) m.geometry.addEventListener('dispose', () => disposed++);
    assert.doesNotThrow(() => env.lod(new THREE.Vector3()), c.name);
    assert.doesNotThrow(() => env.dispose(), c.name);
    assert.equal(disposed, meshes.length, `${c.name}: geometrías liberadas`);
    assert.equal(scene.children.some((o) => o.name === 'water'), false, c.name);
    assert.doesNotThrow(() => env.dispose(), `${c.name}: doble dispose`);
    assert.doesNotThrow(() => env.lod(new THREE.Vector3()), `${c.name}: lod tras dispose`);
    assert.equal(disposed, meshes.length, `${c.name}: sin doble liberación`);
  }
});

test('juncos y nenúfares del río: usan el material de orilla de water.js (el viejo de flora.js ya no)', () => {
  const { shoreMaterial } = await_import_shore;
  const withRiver = natural.filter((c) => build(c).env.river && THEMES[c.theme].flora?.ground !== 'sand');
  let found = 0;
  for (const c of withRiver) {
    const { scene } = build(c);
    scene.traverse((o) => o.isMesh && o.material === shoreMaterial() && found++);
  }
  assert.ok(found > 0, 'hay mallas con el material de orilla nuevo');
});

// ---------- orilla del río por calidad (nenúfares y juncos) ----------

const { SHORE_BUDGET, padLift, swellMaxAmp, padTriangles, reedTriangles } = await import('../src/game/render/assets/water.js');
const { readFileSync } = await import('node:fs');

/** Construye el hoyo y devuelve los juncos y nenúfares tal como los añade el entorno (antes de bakeStatic). */
function shoreParts(course, seed = 7) {
  const pads = [], reeds = [];
  const orig = THREE.Object3D.prototype.add;
  THREE.Object3D.prototype.add = function (...o) {
    for (const x of o) {
      if (x?.userData?.shape) pads.push(x);
      else if (x?.userData?.blades) reeds.push(x);
    }
    return orig.apply(this, o);
  };
  try {
    const b = build(course, THEMES[course.theme], seed);
    return { ...b, pads, reeds };
  } finally {
    THREE.Object3D.prototype.add = orig;
  }
}
const greenRiver = () => natural.filter((c) => floraOf(THEMES[c.theme]).ground === 'grass' && build(c).env.river);

test('orilla del entorno: juncos y nenúfares usan el nivel de calidad (Bajo < Medio < Alto en triángulos, dentro de su presupuesto)', () => {
  const list = greenRiver();
  assert.ok(list.length >= 1);
  const maxPad = {}, maxReed = {};
  for (const level of ['low', 'medium', 'high'])
    withQuality(level, () => {
      for (const c of list) {
        const { pads, reeds } = shoreParts(c);
        for (const p of pads) maxPad[level] = Math.max(maxPad[level] ?? 0, padTriangles(p));
        for (const r of reeds) maxReed[level] = Math.max(maxReed[level] ?? 0, reedTriangles(r));
      }
    });
  for (const level of ['low', 'medium', 'high']) {
    assert.ok(maxPad[level] > 0 && maxReed[level] > 0, `${level}: sin nenúfares o juncos (${maxPad[level]}, ${maxReed[level]})`);
    assert.ok(maxPad[level] <= SHORE_BUDGET.pad[level] && maxReed[level] <= SHORE_BUDGET.reeds[level], `${level}: ${maxPad[level]} / ${maxReed[level]} pasa del presupuesto`);
  }
  assert.ok(maxPad.low < maxPad.medium && maxPad.medium < maxPad.high, JSON.stringify(maxPad));
  assert.ok(maxReed.low < maxReed.medium && maxReed.medium < maxReed.high, JSON.stringify(maxReed));
});

test('nenúfares del entorno: flotan sobre la cresta máxima del oleaje de su calidad + 1 cm (padLift)', () => {
  for (const level of ['low', 'medium', 'high'])
    withQuality(level, () => {
      assert.ok(padLift(level) >= swellMaxAmp(level) + 0.01 - 1e-12, `${level}: padLift ${padLift(level)}`);
      let n = 0;
      for (const c of greenRiver()) {
        const { pads, env } = shoreParts(c);
        for (const p of pads) {
          assert.ok(Math.abs(p.position.y - env.river.y - padLift(level)) < 1e-6, `${c.name} (${level}): nenúfar a ${(p.position.y - env.river.y).toFixed(4)}`);
          assert.ok(p.position.y - env.river.y >= swellMaxAmp(level) + 0.01 - 1e-9);
          n++;
        }
      }
      assert.ok(n > 0, `${level}: sin nenúfares`);
    });
});

test('GolfGame.dispose libera el entorno (anillos del material de agua compartido) antes de soltar el renderer (contrato estático: GolfGame no se instancia en node)', () => {
  const src = readFileSync(new URL('../src/game/GolfGame.js', import.meta.url), 'utf8');
  const start = src.indexOf('\n  dispose() {');
  assert.ok(start > 0, 'dispose() existe');
  const body = src.slice(start, src.indexOf('\n  }\n', start));
  const at = body.indexOf('this.env?.dispose?.()');
  assert.ok(at > 0, 'dispose llama a this.env?.dispose?.()');
  assert.ok(at < body.indexOf('this.renderer.dispose()'), 'antes de liberar el renderer');
});
