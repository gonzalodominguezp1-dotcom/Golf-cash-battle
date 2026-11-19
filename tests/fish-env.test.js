import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// El decorado crea texturas con canvas: en node no hay, y un doble mínimo basta.
const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx()), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx(), addEventListener() {} }) };

const { buildEnvironment, courseBounds } = await import('../src/game/render/environment.js');
const { addFish, fishSupported, FISH_CLEAR, FISH_FAR, FISH_RNG_DRAWS, FISH_MAX_CALLS, FISH_SPLASH_CALLS, FISH_SPLASH, splashLift } = await import('../src/game/render/assets/fish.js');
const { waterMaterial, waterSupported, WATER_RIPPLES } = await import('../src/game/render/assets/water.js');
const { windUniforms } = await import('../src/game/render/assets/wind.js');
const { COURSES } = await import('../src/game/courses.js');
const { THEMES } = await import('../src/game/themes.js');

// Peces en los entornos naturales (entre los pasos 8 y 9, integrados): ver environment.js y assets/fish.js.

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
  const water = [];
  let fish = null, terrain = null;
  scene.traverse((o) => {
    if (o.name === 'water-lake' || o.name === 'water-river') water.push(o);
    if (o.isGroup && o.name === 'fish') fish = o;
    if (o.isMesh && o.geometry?.parameters?.width === 220 && o.geometry.parameters.heightSegments > 20 && !o.name) terrain ??= o;
  });
  return { scene, rng, env, water, fish, terrain, fishMesh: fish?.children.find((o) => o.name === 'fish'), splashMesh: fish?.children.find((o) => o.name === 'fish-splash') };
}
const levelOf = { low: 0, medium: 1, high: 2 };
const natural = COURSES.filter((c) => waterSupported(THEMES[c.theme]));
// hoyos que dibujan agua y admiten peces
const withFish = (level = 'medium') => withQuality(level, () => natural.filter((c) => fishSupported(THEMES[c.theme]) && build(c).water.length > 0));
const dist = (b, x, z) => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));

// la altura del terreno bajo (x, z): interpolación bilineal de la malla de 220 m
function terrainHeight(geo) {
  const n = geo.parameters.widthSegments, p = geo.attributes.position, W1 = n + 1;
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
const setTime = (t) => (windUniforms.uWind.value.w = t);
const posOf = (mesh, i) => new THREE.Matrix4().fromArray(mesh.instanceMatrix.array, i * 16);
/** Posiciones visibles del pez (instancias con escala > 0) cada `step` s de 0 a `to`, con la cámara en `cam`. */
function sweep(env, fishMesh, cam, to = 240, step = 0.25, each = () => {}) {
  const out = [];
  for (let t = 0; t <= to; t += step) {
    setTime(t);
    env.lod(cam);
    each(t);
    if (!fishMesh.visible) continue;
    for (let i = 0; i < fishMesh.count; i++) {
      const m = posOf(fishMesh, i), e = m.elements;
      if (Math.hypot(e[0], e[1], e[2]) < 1e-6) continue;
      out.push({ t, x: e[12], y: e[13], z: e[14] });
    }
  }
  return out;
}
const centerCam = (c) => {
  const b = courseBounds(c);
  return new THREE.Vector3((b.minX + b.maxX) / 2, 2, (b.minZ + b.maxZ) / 2);
};

test('entorno natural con agua dibujada: peces tras el agua (1 InstancedMesh de peces + 1 de salpicaduras, 0 sombras)', () => {
  for (const level of ['low', 'medium', 'high'])
    withQuality(level, () => {
      let n = 0;
      for (const c of natural.filter((c) => fishSupported(THEMES[c.theme]))) {
        const { scene, water, fish, fishMesh, splashMesh } = build(c);
        if (!water.length) {
          assert.equal(fish, null, `${c.name}: sin agua dibujada, sin peces`);
          continue;
        }
        if (!fish) continue; // sin sitios aptos
        n++;
        assert.ok(fishMesh?.isInstancedMesh && splashMesh?.isInstancedMesh, c.name);
        assert.equal(fish.children.length, FISH_MAX_CALLS + FISH_SPLASH_CALLS, c.name);
        assert.ok(!fishMesh.castShadow && !splashMesh.castShadow, c.name);
        assert.ok(scene.children.findIndex((o) => o.name === 'water') < scene.children.indexOf(fish), `${c.name}: el pez se añade después del agua`);
      }
      assert.ok(n >= 4, `${level}: ${n} hoyos con peces`);
    });
});

test('entorno: neón, ciudad, lava, caldera, glaciar/helados y hoyos sin agua dibujada no llevan peces; lod y dispose no lanzan', () => {
  const none = COURSES.filter((c) => !fishSupported(THEMES[c.theme]));
  assert.ok(none.some((c) => THEMES[c.theme].neon) && none.some((c) => THEMES[c.theme].caldera) && none.some((c) => c.theme === 'glacier'));
  for (const c of none) {
    const { fish, env } = build(c);
    assert.equal(fish, null, `${c.name} (${c.theme})`);
    assert.doesNotThrow(() => env.lod(new THREE.Vector3()));
    assert.doesNotThrow(() => env.dispose());
  }
});

test('peces solo sobre agua honda, lejos de la pista y del tee, en los hoyos reales', () => {
  const list = withFish();
  assert.ok(list.length >= 4);
  let samples = 0;
  for (const c of list) {
    const { env, fishMesh, water, terrain, fish } = build(c);
    if (!fish) continue;
    const b = courseBounds(c), ty = terrainHeight(terrain.geometry);
    const waterY = water[0].position.y - (water[0].name === 'water-river' ? 0.01 : 0);
    for (const s of sweep(env, fishMesh, centerCam(c), 260)) {
      samples++;
      assert.ok(ty(s.x, s.z) < waterY - 0.2, `${c.name}: pez en (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) sobre terreno a ${ty(s.x, s.z).toFixed(2)} (agua ${waterY.toFixed(2)})`);
      assert.ok(dist(b, s.x, s.z) >= FISH_CLEAR.course - 0.1, `${c.name}: a ${dist(b, s.x, s.z).toFixed(2)} m de la pista`);
      assert.ok(Math.hypot(s.x - c.tee[0], s.z - c.tee[1]) >= FISH_CLEAR.tee - 0.1, `${c.name}: cerca del tee`);
    }
  }
  assert.ok(samples > 40, `${samples} muestras del pez`);
});

test('determinismo: mismo hoyo y semilla, mismos peces, mismas posiciones y mismo estado del rng', () => {
  for (const c of withFish().slice(0, 4)) {
    const a = build(c), b = build(c);
    assert.equal(a.rng.state(), b.rng.state(), c.name);
    if (!a.fish) { assert.equal(b.fish, null); continue; }
    const key = (x) => sweep(x.env, x.fishMesh, centerCam(c), 120, 0.5).map((s) => [s.t, +s.x.toFixed(4), +s.y.toFixed(4), +s.z.toFixed(4)].join());
    assert.deepEqual(key(a), key(b), c.name);
  }
});

test('rng del hoyo: el pez gasta FISH_RNG_DRAWS tirada, haya sitios o no, con o sin peces en el tema', () => {
  assert.equal(FISH_RNG_DRAWS, 1);
  const c = withFish()[0];
  const heightAt = () => 10; // todo seco: ningún sitio
  for (const theme of [THEMES[c.theme], THEMES.glacier, THEMES.neon ?? THEMES[COURSES.find((k) => THEMES[k.theme].neon).theme]]) {
    for (const h of [heightAt, () => -5]) {
      const r = lcg(3);
      addFish(new THREE.Scene(), { rng: r, y: 0, heightAt: h, theme, level: 'medium', area: { x: 0, z: 0, r: 30 } });
      assert.equal(r.calls, FISH_RNG_DRAWS);
    }
  }
});

test('sin llamadas de dibujo extra: el grupo de peces son 2 mallas (peces + salpicaduras) y solo la de peces se ve casi siempre', () => {
  const c = withFish()[0];
  const { env, fish, fishMesh, splashMesh, scene } = build(c);
  const before = scene.children.length;
  let fishVisible = 0, splashVisible = 0, n = 0;
  sweep(env, fishMesh, centerCam(c), 300, 0.25, () => {
    n++;
    fishVisible += fishMesh.visible;
    splashVisible += splashMesh.visible;
  });
  assert.equal(scene.children.length, before, 'lod no añade nada a la escena');
  assert.ok(fishVisible / n < 0.3, `pez visible ${fishVisible}/${n}: salta de vez en cuando`);
  assert.ok(fishVisible > 0 && splashVisible > 0);
  assert.equal(fish.children.filter((o) => o.visible).length <= 2, true);
});

test('ocultación a más de FISH_FAR: con la cámara lejos el pez y su salpicadura no se dibujan', () => {
  const c = withFish()[0];
  const { env, fishMesh, splashMesh } = build(c);
  const near = centerCam(c), far = near.clone().add(new THREE.Vector3(FISH_FAR + 200, 0, 0));
  assert.ok(sweep(env, fishMesh, near, 260).length > 0);
  let shown = 0;
  sweep(env, fishMesh, far, 260, 0.25, () => (shown += fishMesh.visible + splashMesh.visible));
  assert.equal(shown, 0);
});

test('ondas: env.lod pasa al agua los eventos de salpicadura del pez en el tiempo correcto (una llamada, reemplaza)', () => {
  withQuality('medium', () => {
    const c = withFish('medium')[0];
    const { env, fishMesh, splashMesh } = build(c);
    const mat = waterMaterial(1, THEMES[c.theme]);
    const rows = () => mat.uniforms.uRipples.value.map((v) => [v.x, v.y, v.z, v.w]);
    assert.equal(rows().length, WATER_RIPPLES.count.medium);
    let checked = 0, quiet = 0, lastSplash = -1e9;
    const cam = centerCam(c);
    for (let t = 0; t <= 300; t += 0.25) {
      setTime(t);
      env.lod(cam);
      const live = rows().filter((r) => r[3] > 0);
      if (splashMesh.visible) {
        lastSplash = t;
        // cada salpicadura viva (x, y+lift, z) tiene su anillo en (x, z) y con una edad menor que la vida de la salpicadura
        for (let i = 0; i < splashMesh.count; i++) {
          const e = posOf(splashMesh, i).elements, sc = Math.hypot(e[0], e[1], e[2]);
          if (sc < 1e-6) continue;
          const row = live.find((r) => Math.hypot(r[0] - e[12], r[1] - e[14]) < 1e-3);
          assert.ok(row, `t=${t}: sin anillo en (${e[12].toFixed(2)}, ${e[14].toFixed(2)})`);
          assert.ok(row[2] >= 0 && row[2] <= 1.4 + 1e-6, `t=${t}: edad ${row[2]}`);
          checked++;
        }
      }
      // pasado el tiempo de vida de un anillo (2,5 s) sin saltos, el agua queda sin anillos (se REEMPLAZA en cada fotograma)
      if (t - lastSplash > WATER_RIPPLES.life + 0.3 && t > 20) {
        assert.equal(live.length, 0, `t=${t}: anillos colgados`);
        quiet++;
      }
      for (const r of live) assert.ok(r[2] >= 0 && r[2] < WATER_RIPPLES.life, `t=${t}: edad ${r[2]}`);
    }
    assert.ok(checked >= 4 && quiet >= 20, `${checked} salpicaduras comprobadas, ${quiet} instantes sin anillos`);
    assert.doesNotThrow(() => (setTime(0), env.lod(centerCam(c))));
    void fishMesh;
  });
});

test('ondas: la vuelta de la hora del viento conserva los anillos de salpicaduras de antes de la vuelta, con la edad que toca', () => {
  // Se busca (hoyo, semilla) con una salpicadura viva justo antes de la hora (t = WRAP - 0,05) y se avanza el reloj a 0,05 s:
  // los mismos anillos deben seguir ahí con 0,1 s más de edad. Sin la rama de vuelta de fishSplashEvents (t1 < t0) o sin el
  // módulo de lod() se pierden. (El mutante que quita solo el `+ WIND_WRAP) % WIND_WRAP` de environment.js es EQUIVALENTE:
  // con t < RIPPLE_WINDOW el % de JS da un negativo que fishSplashEvents trata igual que la vuelta; por eso no se pretende cubrirlo.)
  withQuality('medium', () => {
    const WRAP = 3600, mat = waterMaterial(1, THEMES[natural[0].theme]);
    const live = () => mat.uniforms.uRipples.value.filter((v) => v.w > 0).map((v) => ({ x: v.x, z: v.y, age: v.z, w: v.w }));
    let found = null;
    for (const c of withFish('medium')) {
      for (const seed of [7, 3, 11, 19, 23, 29, 31, 37]) {
        const { env } = build(c, THEMES[c.theme], seed);
        const cam = centerCam(c);
        setTime(WRAP - 0.05);
        env.lod(cam);
        const before = live().filter((r) => r.age < WATER_RIPPLES.life - 0.3);
        if (!before.length) { env.dispose(); continue; }
        setTime(0.05);
        env.lod(cam);
        found = { c, before, after: live() };
        env.dispose();
        break;
      }
      if (found) break;
    }
    assert.ok(found, 'ningún hoyo/semilla con salpicadura viva en la vuelta de hora');
    for (const r of found.before) {
      const a = found.after.find((q) => Math.hypot(q.x - r.x, q.z - r.z) < 1e-3);
      assert.ok(a, `${found.c.name}: el anillo en (${r.x.toFixed(2)}, ${r.z.toFixed(2)}) se perdió en la vuelta`);
      assert.ok(Math.abs(a.age - (r.age + 0.1)) < 1e-3, `edad tras la vuelta ${a.age} (antes ${r.age})`);
    }
    for (const q of found.after) assert.ok(q.age >= 0 && q.age < WATER_RIPPLES.life, `edad ${q.age}`);
  });
});

test('pez: lleva el nivel de calidad (stats.level, triángulos Bajo < Medio < Alto) y la salpicadura va a la altura del agua + splashLift (y del pez = waterY)', () => {
  const names = ['low', 'medium', 'high'], tri = {};
  for (const level of names) {
    const c = withFish(level)[0]; // fuera de withQuality (anidar restaura el almacén y vuelve a Medio)
    withQuality(level, () => {
      const { env, fish, splashMesh, water } = build(c);
      assert.equal(fish.userData.fish.level, level, 'stats.level = calidad del entorno');
      tri[level] = fish.userData.fish.trianglesPerFish;
      const waterY = water[0].position.y - (water[0].name === 'water-river' ? 0.01 : 0);
      let checked = 0;
      for (let t = 0; t <= 300 && checked < 3; t += 0.25) {
        setTime(t);
        env.lod(centerCam(c));
        if (!splashMesh.visible) continue;
        for (let i = 0; i < splashMesh.count; i++) {
          const e = posOf(splashMesh, i).elements;
          if (Math.hypot(e[0], e[1], e[2]) < 1e-6) continue;
          assert.ok(Math.abs(e[13] - splashLift(level) - waterY) < 2e-3, `${c.name} (${level}): salpicadura a ${(e[13] - waterY).toFixed(4)} sobre el agua, no splashLift ${splashLift(level).toFixed(4)}`);
          checked++;
        }
      }
      assert.ok(checked >= 1, `${level}: sin salpicaduras que comprobar`);
    });
  }
  assert.ok(tri.low < tri.medium && tri.medium < tri.high, JSON.stringify(tri));
});

test('dispose: quita los peces y libera sus geometrías una vez, deja el agua sin anillos; doble dispose y lod posterior no lanzan', () => {
  withQuality('medium', () => {
    const c = withFish('medium')[0];
    const { env, scene, fish, fishMesh, splashMesh } = build(c);
    const mat = waterMaterial(1, THEMES[c.theme]);
    // deja un anillo vivo para comprobar que dispose lo limpia (el material es compartido entre hoyos)
    const cam = centerCam(c);
    for (let t = 0; t < 120 && !mat.uniforms.uRipples.value.some((v) => v.w > 0); t += 0.25) (setTime(t), env.lod(cam));
    assert.ok(mat.uniforms.uRipples.value.some((v) => v.w > 0));
    let disposed = 0;
    for (const m of [fishMesh, splashMesh]) m.geometry.addEventListener('dispose', () => disposed++);
    assert.doesNotThrow(() => env.dispose());
    assert.equal(disposed, 2);
    assert.equal(scene.children.includes(fish), false);
    assert.equal(mat.uniforms.uRipples.value.some((v) => v.w > 0), false, 'sin anillos colgados');
    assert.doesNotThrow(() => env.dispose());
    assert.doesNotThrow(() => env.lod(cam));
    assert.equal(disposed, 2, 'sin doble liberación');
    assert.equal(mat.uniforms.uRipples.value.some((v) => v.w > 0), false, 'lod tras dispose no vuelve a poner anillos');
  });
});

test('calidad Bajo: peces sin anillos de agua (0 filas); Medio 4, Alto 6', () => {
  for (const level of ['low', 'medium', 'high'])
    withQuality(level, () => {
      const c = withFish(level)[0];
      const { env } = build(c);
      const m = waterMaterial(levelOf[level], THEMES[c.theme]);
      assert.equal(m.uniforms.uRipples?.value.length ?? 0, WATER_RIPPLES.count[level]);
      assert.doesNotThrow(() => { setTime(50); env.lod(centerCam(c)); });
    });
});
