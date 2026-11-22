import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeRoundTree, ROUND_TREE_BUDGET, ROUND_TREE_VARIANTS, roundTreeMaterials } from '../src/game/render/assets/roundTree.js';
import { WIND_ATTRS, WIND_ATTR_SIZES, isWindMaterial } from '../src/game/render/assets/wind.js';
import { bakeStatic } from '../src/game/render/batch.js';
import { seededRng } from '../src/lab/assetRegistry.js';

const LEVELS = ['low', 'medium', 'high'];
const SEEDS = Array.from({ length: 30 }, (_, i) => 1 + i * 7919);
const tree = (seed, level = 'medium', opts = {}) => makeRoundTree(seededRng(seed), level, opts);
const meshesOf = (g) => {
  const out = [];
  g.traverse((o) => o.isMesh && out.push(o));
  return out;
};
const tris = (g) => meshesOf(g).reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0);
const byLayer = (g, layer) => meshesOf(g).find((m) => m.material.userData.wind?.layer === layer);

test('árbol redondo: presupuesto de triángulos por calidad en todas las variantes y semillas', () => {
  assert.deepEqual(ROUND_TREE_BUDGET, { low: 250, medium: 600, high: 1200 });
  for (const level of LEVELS) {
    for (let variant = 0; variant < ROUND_TREE_VARIANTS; variant++) {
      for (const seed of SEEDS) {
        const n = tris(tree(seed, level, { variant }));
        assert.ok(n <= ROUND_TREE_BUDGET[level], `${level} v${variant} s${seed}: ${n} tri`);
        // y no se queda en nada: el presupuesto se aprovecha
        assert.ok(n >= ROUND_TREE_BUDGET[level] * 0.45, `${level} v${variant} s${seed}: solo ${n} tri`);
      }
    }
  }
});

test('árbol redondo: más calidad, más triángulos (misma semilla y variante)', () => {
  for (let variant = 0; variant < ROUND_TREE_VARIANTS; variant++) {
    const [lo, me, hi] = LEVELS.map((l) => tris(tree(42, l, { variant })));
    assert.ok(lo < me && me < hi, `v${variant}: ${lo} / ${me} / ${hi}`);
  }
});

test('árbol redondo: determinista (misma semilla, misma geometría) y la semilla cambia la forma', () => {
  for (const level of LEVELS) {
    const a = meshesOf(tree(5, level)), b = meshesOf(tree(5, level));
    assert.equal(a.length, b.length);
    a.forEach((m, i) => {
      for (const name of Object.keys(m.geometry.attributes)) assert.deepEqual(m.geometry.attributes[name].array, b[i].geometry.attributes[name].array, `${level} ${name}`);
    });
    const c = meshesOf(tree(6, level, { variant: tree(5, level).userData.roundTree.variant }));
    assert.notDeepEqual(c[1].geometry.attributes.position.array, a[1].geometry.attributes.position.array);
  }
});

test('árbol redondo: la semilla elige entre las 3-4 variantes y cada variante tiene su forma', () => {
  assert.ok(ROUND_TREE_VARIANTS >= 3 && ROUND_TREE_VARIANTS <= 4);
  const seen = new Set(SEEDS.map((s) => tree(s).userData.roundTree.variant));
  assert.equal(seen.size, ROUND_TREE_VARIANTS);
  // proporción alto/ancho media de cada variante: todas distintas entre sí
  const ratios = [];
  for (let v = 0; v < ROUND_TREE_VARIANTS; v++) {
    let r = 0;
    for (const s of SEEDS.slice(0, 10)) {
      const size = new THREE.Box3().setFromObject(tree(s, 'medium', { variant: v })).getSize(new THREE.Vector3());
      r += size.y / Math.max(size.x, size.z) / 10;
    }
    ratios.push(r);
  }
  for (let i = 0; i < ratios.length; i++) for (let j = i + 1; j < ratios.length; j++) assert.ok(Math.abs(ratios[i] - ratios[j]) > 0.04, `variantes ${i} y ${j}: ${ratios.map((x) => x.toFixed(2))}`);
});

test('árbol redondo: sin NaN, normales unitarias y atributos de viento completos en cada malla', () => {
  for (const level of LEVELS) {
    for (let variant = 0; variant < ROUND_TREE_VARIANTS; variant++) {
      for (const seed of SEEDS.slice(0, 8)) {
        const g = tree(seed, level, { variant });
        assert.equal(g.userData.swayRoot, true);
        for (const m of meshesOf(g)) {
          const at = m.geometry.attributes;
          for (const [name, a] of Object.entries(at)) for (const v of a.array) assert.ok(Number.isFinite(v), `${level} ${name} NaN`);
          for (const name of WIND_ATTRS) assert.equal(at[name]?.itemSize, WIND_ATTR_SIZES[name], `${level} falta ${name}`);
          assert.ok(at.color && at.normal);
          for (let i = 0; i < at.normal.count; i++) {
            const l = Math.hypot(at.normal.getX(i), at.normal.getY(i), at.normal.getZ(i));
            assert.ok(Math.abs(l - 1) < 1e-4, `normal ${l}`);
          }
          // sway = altura sobre la base (las mallas no llevan transformación propia)
          assert.ok(m.matrix.equals(new THREE.Matrix4()));
          for (let i = 0; i < at.sway.count; i++) assert.ok(Math.abs(at.sway.getX(i) - Math.max(0, at.position.getY(i))) < 1e-5);
          // el tronco y la copa comparten la fase del árbol: se doblan juntos
          assert.equal(at.windPhase.getX(0), byLayer(g, 'trunk').geometry.attributes.windPhase.getX(0));
        }
      }
    }
  }
});

test('árbol redondo: materiales compartidos, lisos, con color de vértice y viento de tres capas', () => {
  const a = tree(1, 'high'), b = tree(2, 'high', { leaves: [0xff6b35] });
  const ma = meshesOf(a).map((m) => m.material), mb = meshesOf(b).map((m) => m.material);
  assert.deepEqual(ma, mb, 'el mismo material en todos los árboles (bakeStatic los junta en una llamada)');
  assert.deepEqual(ma.map((m) => m.userData.wind.layer).sort(), ['canopy', 'leaf', 'trunk']);
  for (const m of ma) {
    assert.ok(isWindMaterial(m));
    assert.equal(m.flatShading, false);
    assert.equal(m.vertexColors, true);
  }
  const mats = roundTreeMaterials();
  assert.equal(mats.cards.userData.keepUv, true);
  assert.ok(mats.cards.alphaTest > 0 && mats.cards.side === THREE.DoubleSide);
});

test('árbol redondo: tarjetas de hojas (con uv) solo en Alto', () => {
  for (const seed of SEEDS.slice(0, 6)) {
    assert.equal(byLayer(tree(seed, 'low'), 'leaf'), undefined);
    assert.equal(byLayer(tree(seed, 'medium'), 'leaf'), undefined);
    const cards = byLayer(tree(seed, 'high'), 'leaf');
    assert.ok(cards, 'Alto lleva tarjetas');
    assert.ok(cards.geometry.attributes.uv);
    assert.ok(cards.geometry.attributes.position.count / 3 >= 16, 'al menos 8 tarjetas');
  }
});

test('árbol redondo: la calidad se acepta como nombre, preset del laboratorio o lod', () => {
  for (const [i, level] of LEVELS.entries()) {
    const n = tris(tree(9, level));
    assert.equal(tris(tree(9, { level })), n);
    assert.equal(tris(makeRoundTree(seededRng(9), { lod: i })), n);
    assert.equal(tris(makeRoundTree(seededRng(9), i)), n);
  }
  assert.equal(tris(tree(9, 'nope')), tris(tree(9, 'medium')));
});

test('árbol redondo: oclusión por color (más oscuro abajo) y normales esferizadas hacia fuera', () => {
  for (let variant = 0; variant < ROUND_TREE_VARIANTS; variant++) {
    const g = tree(3, 'medium', { variant });
    const { position: p, color: c, normal: n } = byLayer(g, 'canopy').geometry.attributes;
    const box = new THREE.Box3().setFromBufferAttribute(p);
    const mid = box.getCenter(new THREE.Vector3());
    let lo = 0, nlo = 0, hi = 0, nhi = 0, out = 0;
    const v = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const y = (p.getY(i) - box.min.y) / (box.max.y - box.min.y);
      const lum = c.getX(i) + c.getY(i) + c.getZ(i);
      if (y < 0.25) (lo += lum), nlo++;
      if (y > 0.75) (hi += lum), nhi++;
      v.fromBufferAttribute(p, i).sub(mid);
      nn.fromBufferAttribute(n, i);
      if (v.dot(nn) > 0) out++;
    }
    assert.ok(lo / nlo < (hi / nhi) * 0.8, `v${variant}: abajo ${(lo / nlo).toFixed(3)} arriba ${(hi / nhi).toFixed(3)}`);
    assert.ok(out / p.count > 0.9, `v${variant}: ${((out / p.count) * 100).toFixed(1)}% de normales hacia fuera`);
  }
});

test('árbol redondo: paleta por parámetro o tema, con valores por defecto', () => {
  const red = byLayer(tree(4, 'low', { leaves: [0xff2000] }), 'canopy').geometry.attributes.color;
  let r = 0, gr = 0;
  for (let i = 0; i < red.count; i++) (r += red.getX(i)), (gr += red.getY(i));
  assert.ok(r > gr * 3, 'copa roja');
  const themed = byLayer(tree(4, 'low', { theme: { leaves: [0xff2000] } }), 'canopy').geometry.attributes.color;
  assert.deepEqual(themed.array, red.array);
  const bark = byLayer(tree(4, 'low', { bark: 0x0000ff }), 'trunk').geometry.attributes.color;
  assert.ok(bark.getZ(0) > bark.getX(0) * 3, 'tronco azul');
  // sin paleta: verde por defecto
  const def = byLayer(tree(4, 'low'), 'canopy').geometry.attributes.color;
  assert.ok(def.getY(0) > def.getX(0) && def.getY(0) > def.getZ(0));
});

test('árbol redondo: el sombreador añade la luz de borde (contraluz) y el viento sobre el Lambert real', () => {
  const mats = roundTreeMaterials();
  for (const [key, m] of Object.entries(mats)) {
    const lib = THREE.ShaderLib.lambert;
    const sh = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
    m.onBeforeCompile(sh);
    assert.match(sh.vertexShader, /attribute vec2 windPhase;/, key);
    assert.match(sh.vertexShader, /transformed \+=/, key);
    assert.match(sh.fragmentShader, /gcbRim/, `${key} sin luz de borde`);
    assert.match(sh.fragmentShader, /#include <opaque_fragment>/, key);
    assert.equal((sh.fragmentShader.match(/\{/g) ?? []).length, (sh.fragmentShader.match(/\}/g) ?? []).length);
  }
  // las tarjetas son de dos caras pero su normal no se da la vuelta (luz igual por los dos lados)
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  mats.cards.onBeforeCompile(sh);
  assert.match(sh.fragmentShader, /#include <normal_fragment_begin>\s*#ifdef DOUBLE_SIDED\s*normal \*= faceDirection;/);
});

test('árbol redondo: sobrevive a bakeStatic (una malla por material, viento, color y uv de las tarjetas)', () => {
  const root = new THREE.Group();
  const trees = [tree(1, 'high', { variant: 0 }), tree(2, 'high', { variant: 3 }), tree(3, 'high', { variant: 1 })];
  trees.forEach((t, i) => {
    t.position.set(i * 6, 0, i * -3);
    t.scale.setScalar(1 + i * 0.2);
    root.add(t);
  });
  const before = trees.reduce((n, t) => n + tris(t), 0);
  const out = bakeStatic(root, new THREE.Group());
  assert.equal(out.length, 3, 'tronco, copa y tarjetas: tres llamadas para todos los árboles');
  assert.equal(out.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0), before);
  for (const m of out) {
    for (const name of WIND_ATTRS) assert.equal(m.geometry.attributes[name]?.itemSize, WIND_ATTR_SIZES[name], `falta ${name}`);
    assert.ok(m.geometry.attributes.color);
    if (m.material === roundTreeMaterials().cards) assert.ok(m.geometry.attributes.uv, 'las tarjetas conservan su uv');
    else assert.equal(m.geometry.attributes.uv, undefined, 'el resto no paga uv');
  }
  // las fases de cada árbol se respetan (cada árbol se mece a su aire)
  const trunk = out.find((m) => m.material === roundTreeMaterials().trunk).geometry.attributes.windPhase;
  const phases = new Set();
  for (let i = 0; i < trunk.count; i++) phases.add(trunk.getX(i));
  assert.equal(phases.size, 3);
});
