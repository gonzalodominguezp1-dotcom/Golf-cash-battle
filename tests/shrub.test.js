import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeShrub, SHRUB_BUDGET, SHRUB_VARIANTS, SHRUB_DEFAULTS, shrubMaterial } from '../src/game/render/assets/shrub.js';
import { WIND_ATTRS, WIND_ATTR_SIZES, isWindMaterial } from '../src/game/render/assets/wind.js';
import { bakeStatic } from '../src/game/render/batch.js';
import { seededRng } from '../src/lab/assetRegistry.js';

const LEVELS = ['low', 'medium', 'high'];
const SEEDS = Array.from({ length: 30 }, (_, i) => 3 + i * 7919);
const shrub = (seed, level = 'medium', opts = {}) => makeShrub(seededRng(seed), level, opts);
const meshesOf = (g) => {
  const out = [];
  g.traverse((o) => o.isMesh && out.push(o));
  return out;
};
const tris = (g) => meshesOf(g).reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);

test('arbusto: presupuesto de triángulos por calidad en 30 semillas x todas las formas (y se aprovecha)', () => {
  assert.deepEqual(SHRUB_BUDGET, { low: 120, medium: 300, high: 600 });
  assert.ok(SHRUB_VARIANTS >= 2 && SHRUB_VARIANTS <= 3);
  for (const level of LEVELS) {
    for (let variant = 0; variant < SHRUB_VARIANTS; variant++) {
      for (const seed of SEEDS) {
        const g = shrub(seed, level, { variant });
        const n = tris(g);
        assert.ok(n <= SHRUB_BUDGET[level], `${level} v${variant} s${seed}: ${n} tri`);
        assert.ok(n >= SHRUB_BUDGET[level] * 0.45, `${level} v${variant} s${seed}: solo ${n} tri`);
        assert.equal(g.userData.shrub.triangles, n);
        assert.equal(meshesOf(g).length, 1, 'una sola malla');
      }
    }
  }
});

test('arbusto: más calidad, más triángulos (misma semilla y forma)', () => {
  for (let variant = 0; variant < SHRUB_VARIANTS; variant++) {
    for (const seed of SEEDS.slice(0, 5)) {
      const [lo, me, hi] = LEVELS.map((l) => tris(shrub(seed, l, { variant })));
      assert.ok(lo < me && me < hi, `v${variant} s${seed}: ${lo} / ${me} / ${hi}`);
    }
  }
});

test('arbusto: determinista, y la misma semilla da el mismo arbusto en las tres calidades', () => {
  for (const level of LEVELS) {
    const a = meshesOf(shrub(5, level)), b = meshesOf(shrub(5, level));
    assert.equal(a.length, b.length);
    a.forEach((m, i) => {
      for (const name of Object.keys(m.geometry.attributes)) assert.deepEqual(m.geometry.attributes[name].array, b[i].geometry.attributes[name].array, `${level} ${name}`);
    });
  }
  for (const seed of SEEDS.slice(0, 10)) {
    const info = LEVELS.map((l) => shrub(seed, l).userData.shrub);
    for (const k of [1, 2]) {
      assert.equal(info[k].variant, info[0].variant);
      assert.deepEqual(info[k].allLumps, info[0].allLumps, `s${seed}: los racimos no dependen de la calidad`);
    }
  }
  // el rng consume siempre las mismas tiradas, sea cual sea la calidad y la forma
  const draws = (level, variant) => {
    let n = 0;
    const r = seededRng(11);
    makeShrub(() => (n++, r()), level, { variant });
    return n;
  };
  const d0 = draws('medium', 0);
  for (const level of LEVELS) for (let v = 0; v < SHRUB_VARIANTS; v++) assert.equal(draws(level, v), d0, `${level} v${v}`);
  assert.notDeepEqual(shrub(6, 'medium', { variant: 0 }).userData.shrub.allLumps, shrub(5, 'medium', { variant: 0 }).userData.shrub.allLumps);
});

test('arbusto: la semilla elige entre 2-3 formas bajas y anchas', () => {
  assert.equal(new Set(SEEDS.map((s) => shrub(s).userData.shrub.variant)).size, SHRUB_VARIANTS);
  for (let variant = 0; variant < SHRUB_VARIANTS; variant++) {
    for (const seed of SEEDS.slice(0, 10)) {
      const size = new THREE.Box3().setFromObject(shrub(seed, 'high', { variant })).getSize(new THREE.Vector3());
      assert.ok(size.y < 1.1, `v${variant} s${seed}: alto ${size.y}`);
      assert.ok(Math.max(size.x, size.z) > size.y * 1.1, `v${variant} s${seed}: no es más ancho que alto ${size.toArray()}`);
      const box = new THREE.Box3().setFromObject(shrub(seed, 'high', { variant }));
      assert.ok(box.min.y > -0.35 && box.max.y > 0.3, 'pegado al suelo');
    }
  }
});

test('arbusto: sin NaN, normales unitarias, caras hacia fuera, atributos de viento completos y sin uv', () => {
  for (const level of LEVELS) {
    for (let variant = 0; variant < SHRUB_VARIANTS; variant++) {
      for (const seed of SEEDS.slice(0, 6)) {
        const g = shrub(seed, level, { variant });
        assert.equal(g.userData.swayRoot, true);
        for (const m of meshesOf(g)) {
          const at = m.geometry.attributes;
          for (const [name, a] of Object.entries(at)) for (const v of a.array) assert.ok(Number.isFinite(v), `${level} ${name} NaN`);
          for (const name of WIND_ATTRS) assert.equal(at[name]?.itemSize, WIND_ATTR_SIZES[name], `${level} falta ${name}`);
          assert.ok(at.color && at.normal);
          assert.equal(at.uv, undefined);
          for (let i = 0; i < at.normal.count; i++) {
            const l = Math.hypot(at.normal.getX(i), at.normal.getY(i), at.normal.getZ(i));
            assert.ok(Math.abs(l - 1) < 1e-4, `normal ${l}`);
          }
          const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
          for (let i = 0; i < at.position.count; i += 3) {
            A.fromBufferAttribute(at.position, i);
            B.fromBufferAttribute(at.position, i + 1).sub(A);
            C.fromBufferAttribute(at.position, i + 2).sub(A);
            N.set(0, 0, 0);
            for (let k = 0; k < 3; k++) N.add(new THREE.Vector3().fromBufferAttribute(at.normal, i + k));
            assert.ok(B.cross(C).dot(N) >= 0, `${level} v${variant}: cara del revés`);
          }
          for (let i = 0; i < at.sway.count; i++) assert.ok(Math.abs(at.sway.getX(i) - Math.max(0, at.position.getY(i))) < 1e-5);
        }
      }
    }
  }
});

test('arbusto: no dibuja caras bajo el suelo', () => {
  for (const seed of SEEDS.slice(0, 10)) {
    const p = meshesOf(shrub(seed, 'high')).map((m) => m.geometry.attributes.position)[0];
    for (let i = 0; i < p.count; i += 3) {
      assert.ok(p.getY(i) >= -0.03 || p.getY(i + 1) >= -0.03 || p.getY(i + 2) >= -0.03, 'cara bajo el suelo');
    }
  }
});

test('arbusto: viento suave — todo en capa canopy con aleteo creciente con la altura y una fase por racimo', () => {
  const g = shrub(21, 'high', { variant: 0 });
  const [m] = meshesOf(g);
  const { windFlutter: w, windPhase: ph, position: p } = m.geometry.attributes;
  let lo = 0, nl = 0, hi = 0, nh = 0;
  const top = Math.max(...Array.from({ length: p.count }, (_, i) => p.getY(i)));
  for (let i = 0; i < p.count; i++) {
    assert.ok(w.getX(i) >= 0 && w.getX(i) <= 1);
    if (p.getY(i) < top * 0.3) (lo += w.getX(i)), nl++;
    if (p.getY(i) > top * 0.7) (hi += w.getX(i)), nh++;
  }
  assert.ok(nl && nh && hi / nh > (lo / nl) * 1.5, `aleteo arriba ${(hi / nh).toFixed(3)} abajo ${(lo / nl).toFixed(3)}`);
  const phases = new Set();
  for (let i = 0; i < ph.count; i++) phases.add(ph.getY(i));
  assert.ok(phases.size >= 2 && phases.size <= g.userData.shrub.lumps.length, `${phases.size} fases`);
  const base = ph.getX(0);
  for (let i = 0; i < ph.count; i++) assert.equal(ph.getX(i), base);
  // suave: el viento de la capa canopy se escala a una altura de referencia baja, no a la de un árbol
  assert.ok(m.material.userData.wind.height <= 1.5);
  assert.equal(m.material.userData.wind.layer, 'canopy');
});

test('arbusto: material compartido, liso, con color de vértice, viento y luz de borde', () => {
  const a = shrub(1, 'high'), b = shrub(2, 'low', { leaves: [0xff6b35] });
  const ma = meshesOf(a).map((m) => m.material), mb = meshesOf(b).map((m) => m.material);
  assert.deepEqual(ma, mb);
  assert.equal(ma[0], shrubMaterial());
  const m = ma[0];
  assert.ok(isWindMaterial(m));
  assert.equal(m.flatShading, false);
  assert.equal(m.vertexColors, true);
  assert.ok(m.isMeshLambertMaterial);
  const lib = THREE.ShaderLib.lambert;
  const sh = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  m.onBeforeCompile(sh);
  assert.match(sh.vertexShader, /attribute vec2 windPhase;/);
  assert.match(sh.fragmentShader, /gcbRim/);
  assert.equal((sh.fragmentShader.match(/\{/g) ?? []).length, (sh.fragmentShader.match(/\}/g) ?? []).length);
});

test('arbusto: oclusión por color (abajo más oscuro que arriba) y paleta por parámetro, tema o defecto', () => {
  const lum = (c, i) => c.getX(i) + c.getY(i) + c.getZ(i);
  const g = shrub(3, 'high', { variant: 0 });
  const { position: p, color: c } = meshesOf(g)[0].geometry.attributes;
  let lo = 0, nl = 0, hi = 0, nh = 0;
  const top = Math.max(...Array.from({ length: p.count }, (_, i) => p.getY(i)));
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < top * 0.3) (lo += lum(c, i)), nl++;
    if (p.getY(i) > top * 0.75) (hi += lum(c, i)), nh++;
  }
  assert.ok(nl && nh && lo / nl < (hi / nh) * 0.85, `abajo ${(lo / nl).toFixed(3)} arriba ${(hi / nh).toFixed(3)}`);

  const mean = (gr) => {
    const a = meshesOf(gr)[0].geometry.attributes.color;
    const s = [0, 0, 0];
    for (let i = 0; i < a.count; i++) (s[0] += a.getX(i)), (s[1] += a.getY(i)), (s[2] += a.getZ(i));
    return s.map((v) => v / a.count);
  };
  const red = mean(shrub(4, 'low', { leaves: [0xff2000] }));
  assert.ok(red[0] > red[1] * 3, 'hojas rojas');
  const themed = mean(shrub(4, 'low', { theme: { leaves: [0xff2000] } }));
  assert.deepEqual(themed, red);
  assert.deepEqual(mean(makeShrub(seededRng(4), { level: 'low', theme: { leaves: [0xff2000] } })), red);
  const both = mean(makeShrub(seededRng(4), { level: 'low', theme: { leaves: [0x0000ff] } }, { leaves: [0xff2000] }));
  assert.deepEqual(both, red);
  const def = mean(shrub(4, 'low'));
  assert.ok(def[1] > def[0] && def[1] > def[2]);
  assert.ok(SHRUB_DEFAULTS.leaves.length >= 3);
});

test('arbusto: la calidad se acepta como nombre, preset del laboratorio o lod', () => {
  for (const [i, level] of LEVELS.entries()) {
    const n = tris(shrub(9, level));
    assert.equal(tris(shrub(9, { level })), n);
    assert.equal(tris(makeShrub(seededRng(9), { lod: i })), n);
    assert.equal(tris(makeShrub(seededRng(9), i)), n);
  }
  assert.equal(tris(shrub(9, 'nope')), tris(shrub(9, 'medium')));
  assert.equal(tris(makeShrub(seededRng(9))), tris(shrub(9, 'medium')));
});

test('arbusto: sobrevive a bakeStatic (matorral entero en una llamada, viento y color intactos)', () => {
  const root = new THREE.Group();
  const items = [];
  for (let i = 0; i < 12; i++) {
    const t = shrub(100 + i, LEVELS[i % 3], { variant: i % SHRUB_VARIANTS });
    t.position.set(i * 3, 0, (i % 3) * -2);
    t.rotation.y = i;
    t.scale.setScalar(0.8 + (i % 5) * 0.15);
    root.add(t);
    items.push(t);
  }
  const before = items.reduce((n, t) => n + tris(t), 0);
  const out = bakeStatic(root, new THREE.Group());
  assert.equal(out.length, 1, 'una sola llamada de dibujo para todos los arbustos');
  assert.equal(out[0].geometry.attributes.position.count / 3, before);
  const at = out[0].geometry.attributes;
  for (const name of WIND_ATTRS) assert.equal(at[name]?.itemSize, WIND_ATTR_SIZES[name], `falta ${name}`);
  assert.ok(at.color);
  assert.equal(at.uv, undefined);
  // el aleteo (peso por vértice) llega tal cual, no se pisa con 1
  let ones = 0;
  for (let i = 0; i < at.windFlutter.count; i++) if (at.windFlutter.getX(i) === 1) ones++;
  assert.ok(ones < at.windFlutter.count * 0.2);
  // cada arbusto conserva su fase
  const phases = new Set();
  for (let i = 0; i < at.windPhase.count; i++) phases.add(at.windPhase.getX(i));
  assert.equal(phases.size, items.length);
  // la altura sobre la base (sway) no se escala con la escala del arbusto: sigue siendo metros del asset
  let maxSway = 0;
  for (let i = 0; i < at.sway.count; i++) maxSway = Math.max(maxSway, at.sway.getX(i));
  assert.ok(maxSway > 0.3 && maxSway < 1.2, `sway máx ${maxSway}`);
});
