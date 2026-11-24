import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// N3 (2026-11-23): pilones y cristales holográficos rediseñados de los temas neón (neon, neonPink, cyber2078).
// Solo entorno: sin física, sin rng nuevo, materiales y geometrías compartidos (ver assets/neonProps.js).

// el resto del entorno usa canvas: un doble mínimo basta
const ctx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx()), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx(), addEventListener() {} }) };

const props = await import('../src/game/render/assets/neonProps.js');
const { PYLON_BUDGET, CRYSTAL_BUDGET, PROPS_CALLS, PYLON_VARIANTS, disposeNeonProps } = props;
const { makeCyberPylon, makeHoloCrystal } = await import('../src/game/render/cyberpunkEnvironment.js');
const { buildEnvironment, courseBounds } = await import('../src/game/render/environment.js');
const { bakeStatic } = await import('../src/game/render/batch.js');
const { THEMES } = await import('../src/game/themes.js');
const { COURSES } = await import('../src/game/courses.js');
const { setQuality, isAutoQuality, getQuality, qualityPreset } = await import('../src/game/render/quality.js');

const LEVELS = ['low', 'medium', 'high'];
const NEON = ['neon', 'neonPink', 'cyber2078'];
const neonCourses = () => COURSES.filter((c) => THEMES[c.theme].neon);

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
const trisOfGeo = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const trisOf = (root) => {
  let n = 0;
  root.traverse((o) => o.isMesh && (n += trisOfGeo(o.geometry)));
  return n;
};
const distToBounds = (b, x, z) => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));

test('presupuesto por calidad: triángulos por pilón y por cristal Bajo < Medio < Alto, medidos bajo el tope', () => {
  for (const B of [PYLON_BUDGET, CRYSTAL_BUDGET]) assert.ok(B.low < B.medium && B.medium < B.high);
  assert.ok(PYLON_VARIANTS.length >= 2 && PYLON_VARIANTS.length <= 3);
  for (const level of LEVELS) {
    for (const lit of [false, true]) {
      for (const pos of [[0, 0, 0], [1.3, 0, 7.1], [-5, 0, 2.2], [9.9, 0, -4]]) {
        const p = makeCyberPylon(pos[0], pos[1], pos[2], THEMES.neon.neon, lit, { level });
        assert.ok(trisOf(p) <= PYLON_BUDGET[level], `pilón ${level} lit=${lit}: ${trisOf(p)} (tope ${PYLON_BUDGET[level]})`);
      }
    }
    const c = makeHoloCrystal(0, 0, 0, THEMES.neon.neon, lcg(3), null, { level });
    assert.ok(trisOf(c) <= CRYSTAL_BUDGET[level], `cristal ${level}: ${trisOf(c)} (tope ${CRYSTAL_BUDGET[level]})`);
  }
  // el rediseño usa más triángulos al subir de calidad (medido, no solo el tope)
  const t = LEVELS.map((level) => trisOf(makeCyberPylon(0, 0, 0, THEMES.neon.neon, true, { level })));
  assert.ok(t[0] < t[1] && t[1] < t[2], `pilón ${t.join('/')}`);
  const k = LEVELS.map((level) => trisOf(makeHoloCrystal(0, 0, 0, THEMES.neon.neon, lcg(3), null, { level })));
  assert.ok(k[0] < k[1] && k[1] < k[2], `cristal ${k.join('/')}`);
});

test('variantes: hay 2 o 3 aspectos según lit y la forma es determinista (sin rng)', () => {
  const shapes = new Set();
  for (let i = 0; i < 40; i++) {
    const p = makeCyberPylon(i * 1.7, 0, i * 0.9 - 5, THEMES.neon.neon, i % 3 === 0, { level: 'high' });
    shapes.add(p.userData.variant);
    assert.ok(PYLON_VARIANTS.includes(p.userData.variant));
  }
  assert.ok(shapes.size >= 2, `variantes vistas: ${[...shapes]}`);
  for (let i = 0; i < 10; i++) assert.equal(makeCyberPylon(2, 0, 3, THEMES.neon.neon, true).userData.variant, 'beacon');
  const a = makeCyberPylon(4.2, 0, -1.5, THEMES.neon.neon, false, { level: 'medium' });
  const b = makeCyberPylon(4.2, 0, -1.5, THEMES.neon.neon, false, { level: 'medium' });
  assert.equal(a.userData.variant, b.userData.variant);
  // sin textura nueva: ningún material del pilón lleva mapa
  a.traverse((o) => o.isMesh && assert.equal(o.material.map ?? null, null));
});

test('rng del hoyo: el cristal tira UNA vez (el color), el pilón ninguna; las tiradas totales de los hoyos neón no cambian', () => {
  for (const level of LEVELS) {
    const rng = lcg(11);
    makeHoloCrystal(0, 0, 0, THEMES.neon.neon, rng, [], { level });
    assert.equal(rng.calls, 1, `${level}: el cristal tira una vez`);
    const r2 = lcg(11);
    makeCyberPylon(0, 0, 0, THEMES.neon.neon, false, { level });
    assert.equal(r2.calls, 0);
  }
  // el color sale de la misma tirada: mismo índice que antes (floor(rng() * n))
  const pal = THEMES.neonPink.neon;
  for (let seed = 1; seed < 20; seed++) {
    const r = lcg(seed);
    const expect = pal[Math.floor(lcg(seed)() * pal.length)];
    const c = makeHoloCrystal(0, 0, 0, pal, r, null, { level: 'low' });
    assert.equal(c.userData.color, expect, `semilla ${seed}`);
  }
  // totales medidos antes de N3 (iguales a los de neon-city.test.js)
  const BASE = {
    low: { 'Looping Neón': 1419, 'Doble Looping': 1418, 'Tubos Neón': 1419, Cyberpunk2078: 1435 },
    medium: { 'Looping Neón': 1434, 'Doble Looping': 1434, 'Tubos Neón': 1434, Cyberpunk2078: 1449 },
    high: { 'Looping Neón': 1447, 'Doble Looping': 1447, 'Tubos Neón': 1445, Cyberpunk2078: 1475 },
  };
  for (const level of LEVELS)
    withQuality(level, () => {
      for (const c of neonCourses()) {
        const rng = lcg(7);
        buildEnvironment(new THREE.Scene(), c, THEMES[c.theme], rng);
        assert.equal(rng.calls, BASE[level][c.name], `${c.name} (${level}): tiradas totales`);
      }
    });
});

test('llamadas de dibujo: pilones y cristales juntos caben en PROPS_CALLS (menos que las del diseño viejo)', () => {
  const decor = new THREE.Group();
  const animated = [];
  const N_PYL = 12, N_CRY = 8;
  for (let i = 0; i < N_PYL; i++) decor.add(makeCyberPylon(i * 2, 0, 3 + i, THEMES.neon.neon, i % 3 === 0, { level: 'high', animated }));
  for (let i = 0; i < N_CRY; i++) decor.add(makeHoloCrystal(-i * 2, 0, 4 + i, THEMES.neon.neon, lcg(i + 1), animated, { level: 'high' }));
  const scene = new THREE.Scene();
  bakeStatic(decor, scene);
  let calls = 0;
  scene.traverse((o) => (o.isMesh || o.isSprite) && calls++);
  const lit = Array.from({ length: N_PYL }, (_, i) => i % 3 === 0).filter(Boolean).length;
  const cap = PROPS_CALLS.fixed + N_CRY * PROPS_CALLS.perCrystal + lit * PROPS_CALLS.perLitPylon;
  assert.ok(calls <= cap, `${calls} llamadas (tope ${cap})`);
  // el diseño viejo gastaba 3 por pilón y 3 por cristal
  assert.ok(calls < (N_PYL + N_CRY) * 3, `${calls} < ${(N_PYL + N_CRY) * 3}`);
});

test('entorno neón real: los 4 hoyos montan pilones y cristales nuevos en cada calidad, bajo el tope de llamadas', () => {
  for (const level of LEVELS)
    withQuality(level, () => {
      for (const c of neonCourses()) {
        const scene = new THREE.Scene();
        const env = buildEnvironment(scene, c, THEMES[c.theme], lcg(7));
        const props = [];
        scene.traverse((o) => o.userData.neonProp && props.push(o));
        assert.ok(props.length > 0, `${c.name} (${level}): hay pilones/cristales`);
        env.dispose();
      }
    });
});

test('sin colisiones ni física: sin colliders, sin sombras propias, lejos de la pista y pequeños', () => {
  for (const level of LEVELS)
    withQuality(level, () => {
      for (const c of neonCourses()) {
        const before = JSON.stringify(c);
        const b = courseBounds(c);
        // varias semillas: el mínimo de todas debe respetar los 3 m (un place(2,5) lo rompería)
        let minD = Infinity;
        for (const seed of [7, 13, 29, 101, 977]) {
          const sc = new THREE.Scene();
          const e = buildEnvironment(sc, c, THEMES[c.theme], lcg(seed));
          sc.traverse((o) => {
            if (!o.userData.neonProp) return;
            o.updateMatrixWorld(true);
            const bx = new THREE.Box3().setFromObject(o);
            minD = Math.min(minD, distToBounds(b, (bx.min.x + bx.max.x) / 2, (bx.min.z + bx.max.z) / 2));
          });
          e.dispose();
        }
        assert.ok(minD >= 2.9, `${c.name} (${level}): mínimo ${minD.toFixed(2)} m de la pista en 5 semillas`);
        const scene = new THREE.Scene();
        const env = buildEnvironment(scene, c, THEMES[c.theme], lcg(7));
        assert.equal(JSON.stringify(c), before);
        let n = 0;
        scene.traverse((o) => {
          if (!o.userData.neonProp) return;
          n++;
          o.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(o);
          // pilón/cristal de menos de 0,8 m de ancho y 2,4 m de alto; colocados a ≥ 3 m del borde de la pista
          assert.ok(box.max.x - box.min.x < 0.8 && box.max.z - box.min.z < 0.8, `${c.name}: ancho`);
          assert.ok(box.max.y - box.min.y < 2.4, `${c.name}: alto`);
          const d = distToBounds(b, (box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2);
          assert.ok(d >= 2.9, `${c.name} (${level}): a ${d.toFixed(2)} m de la pista`);
          o.traverse((m) => assert.equal(m.userData.collider, undefined));
        });
        assert.ok(n > 0);
        env.dispose();
      }
    });
  // pilones (se juntan en el entorno): tamaño del malla de cada variante, sin contar el halo sprite
  for (const level of LEVELS)
    for (const variant of PYLON_VARIANTS) {
      const p = makeCyberPylon(0, 0, 0, THEMES.neon.neon, false, { level, variant });
      const box = new THREE.Box3();
      p.traverse((o) => o.isMesh && box.union(new THREE.Box3().setFromObject(o)));
      assert.ok(box.max.x - box.min.x < 0.8 && box.max.z - box.min.z < 0.8 && box.max.y < 2.4, `${variant}/${level}`);
      p.traverse((o) => assert.equal(o.userData.collider, undefined));
    }
  const src = readFileSync(new URL('../src/game/render/assets/neonProps.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /physics|course\.js|Math\.random|\bnew\s+THREE\.CanvasTexture|TextureLoader/, 'sin física, azar sin semilla ni texturas nuevas');
  // nada lejano nuevo: el módulo no añade nada a la escena por su cuenta
  assert.doesNotMatch(src, /scene\.add/);
});

test('animación: usa el reloj compartido sin crear objetos por fotograma', () => {
  const animated = [];
  const c = makeHoloCrystal(1, 0, 2, THEMES.neon.neon, lcg(5), animated, { level: 'high' });
  const p = makeCyberPylon(2, 0, 2, THEMES.neon.neon, true, { level: 'high', animated });
  makeCyberPylon(3, 0, 2, THEMES.neon.neon, true, { level: 'high', animated });
  assert.ok(animated.length >= 2, 'cristal y pulso del neón');
  const snap = () => {
    const out = [];
    for (const o of [c, p]) o.traverse((n) => out.push(n.uuid, n.geometry?.uuid, n.material?.uuid));
    return out;
  };
  const s0 = snap();
  const y0 = c.children.find((o) => o.isMesh && o.userData.keep).position.y;
  for (let i = 0; i < 300; i++) for (const f of animated) f(i / 60, 1 / 60);
  assert.deepEqual(snap(), s0, 'mismos objetos tras 300 fotogramas');
  const body = c.children.find((o) => o.isMesh && o.userData.keep);
  assert.ok(Math.abs(body.rotation.y) > 0.1, 'gira');
  assert.notEqual(body.position.y, y0, 'flota');
  // un solo pulso por hoyo aunque haya muchos pilones
  const fresh = [];
  for (let i = 0; i < 5; i++) makeCyberPylon(i, 0, 0, THEMES.neon.neon, i % 2 === 0, { level: 'low', animated: fresh });
  assert.equal(fresh.length, 1);
});

test('animación en el entorno real: tras bakeStatic el cristal no salta de altura entre fotogramas', () => {
  for (const c of neonCourses()) {
    const scene = new THREE.Scene();
    const env = buildEnvironment(scene, c, THEMES[c.theme], lcg(7));
    const bodies = [];
    scene.traverse((o) => o.isMesh && o.userData.keep && o.userData.neonProp && bodies.push(o));
    assert.ok(bodies.length > 0, `${c.name}: hay cristales`);
    const worldY = (o) => (o.updateMatrixWorld(true), new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).y);
    const y0 = bodies.map(worldY); // tal como queda tras bakeStatic, antes de animar
    env.update(1, 1 / 60);
    const y1 = bodies.map(worldY);
    env.update(1.5, 1 / 60);
    const y2 = bodies.map(worldY);
    bodies.forEach((_, i) => assert.ok(Math.abs(y1[i] - y0[i]) < 0.2, `${c.name}: cristal ${i} salta al primer fotograma ${Math.abs(y1[i] - y0[i]).toFixed(2)} m`));
    bodies.forEach((_, i) => assert.ok(Math.abs(y2[i] - y1[i]) < 0.2, `${c.name}: cristal ${i} salta ${Math.abs(y2[i] - y1[i]).toFixed(2)} m`));
    env.dispose();
  }
});

test('dispose: nada nuevo por objeto (materiales y geometrías compartidos); disposeNeonProps los libera y se puede rehacer', () => {
  const a = makeCyberPylon(0, 0, 0, THEMES.neon.neon, true, { level: 'medium' });
  const b = makeCyberPylon(5, 0, 5, THEMES.neon.neon, true, { level: 'medium' });
  const mats = (g) => new Set([...(function* () { const out = []; g.traverse((o) => o.material && out.push(o.material)); yield* out; })()]);
  for (const m of mats(a)) assert.ok(mats(b).has(m), 'material compartido entre pilones');
  const geos = [];
  a.traverse((o) => o.geometry && geos.push(o.geometry));
  let freed = 0;
  for (const g of geos) g.addEventListener('dispose', () => freed++);
  disposeNeonProps();
  assert.ok(freed >= 1);
  assert.doesNotThrow(() => disposeNeonProps());
  const c = makeCyberPylon(0, 0, 0, THEMES.neon.neon, true, { level: 'medium' });
  assert.ok(trisOf(c) > 0);
});

test('laboratorio: «Neón · pilón» y «Neón · cristal» registrados', () => {
  const src = readFileSync(new URL('../src/lab/assets/examples.js', import.meta.url), 'utf8');
  assert.match(src, /id: 'neon-pylon'/);
  assert.match(src, /Neón · pilón/);
  assert.match(src, /id: 'neon-crystal'/);
  assert.match(src, /Neón · cristal/);
  assert.match(src, /neonProps\.js/);
  for (const k of NEON) assert.ok(THEMES[k].neon.length >= 2);
});

test('quality.js: lod de los tres niveles', () => {
  assert.deepEqual(LEVELS.map((l) => qualityPreset(l).lod), [0, 1, 2]);
});
