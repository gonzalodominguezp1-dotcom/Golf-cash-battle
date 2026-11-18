import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makePalm, PALM_BUDGET, PALM_VARIANTS, PALM_DEFAULTS, palmMaterials } from '../src/game/render/assets/palm.js';
import { WIND_ATTRS, WIND_ATTR_SIZES, isWindMaterial } from '../src/game/render/assets/wind.js';
import { bakeStatic } from '../src/game/render/batch.js';
import { seededRng } from '../src/lab/assetRegistry.js';

const LEVELS = ['low', 'medium', 'high'];
const SEEDS = Array.from({ length: 30 }, (_, i) => 3 + i * 7919);
const palm = (seed, level = 'medium', opts = {}) => makePalm(seededRng(seed), level, opts);
const meshesOf = (g) => {
  const out = [];
  g.traverse((o) => o.isMesh && out.push(o));
  return out;
};
const tris = (g) => meshesOf(g).reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);
const byLayer = (g, layer) => meshesOf(g).find((m) => m.material.userData.wind?.layer === layer);
const lum = (c, i) => c.getX(i) + c.getY(i) + c.getZ(i);

test('palmera: presupuesto de triángulos por calidad en todas las variantes y semillas (y se aprovecha)', () => {
  assert.deepEqual(PALM_BUDGET, { low: 250, medium: 600, high: 1200 });
  for (const level of LEVELS) {
    for (let variant = 0; variant < PALM_VARIANTS; variant++) {
      for (const seed of SEEDS) {
        const g = palm(seed, level, { variant });
        const n = tris(g);
        assert.ok(n <= PALM_BUDGET[level], `${level} v${variant} s${seed}: ${n} tri`);
        assert.ok(n >= PALM_BUDGET[level] * 0.45, `${level} v${variant} s${seed}: solo ${n} tri`);
        assert.equal(g.userData.palm.triangles, n);
      }
    }
  }
});

test('palmera: más calidad, más triángulos (misma semilla y variante)', () => {
  for (let variant = 0; variant < PALM_VARIANTS; variant++) {
    for (const seed of SEEDS.slice(0, 5)) {
      const [lo, me, hi] = LEVELS.map((l) => tris(palm(seed, l, { variant })));
      assert.ok(lo < me && me < hi, `v${variant} s${seed}: ${lo} / ${me} / ${hi}`);
    }
  }
});

test('palmera: determinista, y la misma semilla da la misma palmera en las tres calidades', () => {
  for (const level of LEVELS) {
    const a = meshesOf(palm(5, level)), b = meshesOf(palm(5, level));
    assert.equal(a.length, b.length);
    a.forEach((m, i) => {
      for (const name of Object.keys(m.geometry.attributes)) assert.deepEqual(m.geometry.attributes[name].array, b[i].geometry.attributes[name].array, `${level} ${name}`);
    });
  }
  for (const seed of SEEDS.slice(0, 10)) {
    const info = LEVELS.map((l) => palm(seed, l).userData.palm);
    for (const k of [1, 2]) {
      assert.equal(info[k].variant, info[0].variant);
      assert.deepEqual(info[k].fronds, info[0].fronds, `s${seed}: las hojas no dependen de la calidad`);
      assert.deepEqual(info[k].crown, info[0].crown);
    }
    const sizes = LEVELS.map((l) => new THREE.Box3().setFromObject(palm(seed, l)).getSize(new THREE.Vector3()));
    for (const s of sizes) assert.ok(s.distanceTo(sizes[2]) < 0.3, `s${seed}: ${s.toArray()} vs ${sizes[2].toArray()}`);
  }
  const v = palm(5).userData.palm.variant;
  assert.notDeepEqual(palm(6, 'medium', { variant: v }).userData.palm.fronds, palm(5).userData.palm.fronds);
});

test('palmera: la semilla elige entre 3-4 variantes y cada una tiene su silueta', () => {
  assert.ok(PALM_VARIANTS >= 3 && PALM_VARIANTS <= 4);
  assert.equal(new Set(SEEDS.map((s) => palm(s).userData.palm.variant)).size, PALM_VARIANTS);
  const heights = [];
  for (let v = 0; v < PALM_VARIANTS; v++) {
    let h = 0;
    for (const s of SEEDS.slice(0, 10)) h += palm(s, 'medium', { variant: v }).userData.palm.height / 10;
    heights.push(h);
  }
  // la joven es la más baja y la esbelta la más alta
  assert.ok(heights[2] < heights[0] && heights[0] < heights[1]);
  // la inclinada echa la copa mucho más lejos que la esbelta
  const lean = (v) => SEEDS.slice(0, 10).reduce((s, sd) => (c => s + Math.hypot(c.x, c.z) / 10)(palm(sd, 'medium', { variant: v }).userData.palm.crown), 0);
  assert.ok(lean(3) > lean(1) * 2.5, `${lean(3)} vs ${lean(1)}`);
});

test('palmera: tronco curvo con anillos en el color y hojas arqueadas que suben y caen', () => {
  for (let variant = 0; variant < PALM_VARIANTS; variant++) {
    for (const seed of SEEDS.slice(0, 8)) {
      const g = palm(seed, 'high', { variant });
      const { fronds, crown, height } = g.userData.palm;
      assert.ok(fronds.length >= 8);
      assert.ok(Math.abs(crown.y - height) < 1e-6);
      // arco: cada hoja sube al principio (cabeceo inicial hacia arriba) y acaba cayendo
      for (const f of fronds) {
        assert.ok(f.e0 > 0, 'sale hacia arriba');
        assert.ok(f.e0 - f.d < -0.2, 'acaba cayendo');
      }
      // hay hojas en varias direcciones (copa repartida)
      const dirs = fronds.map((f) => [Math.cos(f.a), Math.sin(f.a)]);
      const mean = dirs.reduce((s, d) => [s[0] + d[0] / dirs.length, s[1] + d[1] / dirs.length], [0, 0]);
      assert.ok(Math.hypot(...mean) < 0.35);
      // anillos: el tronco alterna franjas claras y oscuras entre un anillo de vértices y el siguiente
      const { color: c, position: p } = byLayer(g, 'trunk').geometry.attributes;
      // vértices agrupados por altura (un grupo por anillo; fuera los cocos de la corona)
      const ys = [];
      for (let i = 0; i < p.count; i++) if (p.getY(i) < height - 0.5) ys.push([p.getY(i), lum(c, i)]);
      ys.sort((x, y) => x[0] - y[0]);
      const groups = [];
      for (const [y, l] of ys) {
        const g0 = groups.at(-1);
        if (g0 && y - g0.y1 < 0.07) (g0.y1 = y), (g0.s += l), g0.n++;
        else groups.push({ y1: y, s: l, n: 1 });
      }
      const ls = groups.slice(3, -1).map((q) => q.s / q.n);
      let flips = 0;
      for (let i = 2; i < ls.length; i++) if ((ls[i - 1] - ls[i - 2]) * (ls[i] - ls[i - 1]) < 0) flips++;
      assert.ok(flips >= 3, `v${variant} s${seed}: ${flips} cambios de franja`);
    }
  }
  // tronco curvo: el centro del tronco a media altura se aparta de la recta suelo-corona
  const g = palm(9, 'high', { variant: 3 });
  const { crown } = g.userData.palm;
  const p = byLayer(g, 'trunk').geometry.attributes.position;
  let sx = 0, sz = 0, n = 0;
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - crown.y / 2) < 0.2) (sx += p.getX(i)), (sz += p.getZ(i)), n++;
  const off = Math.hypot(sx / n - crown.x / 2, sz / n - crown.z / 2);
  assert.ok(off > 0.05, `tronco recto: ${off.toFixed(3)}`);
});

test('palmera: sin NaN, normales unitarias, caras hacia fuera y atributos de viento completos', () => {
  for (const level of LEVELS) {
    for (let variant = 0; variant < PALM_VARIANTS; variant++) {
      for (const seed of SEEDS.slice(0, 6)) {
        const g = palm(seed, level, { variant });
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
          assert.equal(at.windPhase.getX(0), byLayer(g, 'trunk').geometry.attributes.windPhase.getX(0));
        }
      }
    }
  }
});

test('palmera: viento — tronco en la capa trunk sin aleteo, hojas en leaf, la punta aletea más que la base', () => {
  const g = palm(21, 'medium', { variant: 0 });
  const trunk = byLayer(g, 'trunk'), frond = byLayer(g, 'leaf');
  assert.ok(trunk && frond);
  for (let i = 0; i < trunk.geometry.attributes.windFlutter.count; i++) assert.equal(trunk.geometry.attributes.windFlutter.getX(i), 0);
  const { windFlutter: w, windPhase: ph, position: p } = frond.geometry.attributes;
  // el aleteo crece con la distancia a la corona
  const { crown } = g.userData.palm;
  let near = 0, nn = 0, far = 0, nf = 0, maxW = 0;
  for (let i = 0; i < p.count; i++) {
    const d = Math.hypot(p.getX(i) - crown.x, p.getY(i) - crown.y, p.getZ(i) - crown.z);
    assert.ok(w.getX(i) >= 0 && w.getX(i) <= 1);
    maxW = Math.max(maxW, w.getX(i));
    if (d < 0.6) (near += w.getX(i)), nn++;
    if (d > 1.4) (far += w.getX(i)), nf++;
  }
  assert.ok(nn && nf && far / nf > (near / nn) * 1.6, `aleteo lejos ${(far / nf).toFixed(3)} cerca ${(near / nn).toFixed(3)}`);
  assert.ok(maxW > 0.8);
  // cada hoja con su fase
  const phases = new Set();
  for (let i = 0; i < ph.count; i++) phases.add(ph.getY(i));
  assert.equal(phases.size, g.userData.palm.fronds.length);
});

test('palmera: materiales compartidos, lisos, con color de vértice, viento y luz de borde', () => {
  const a = palm(1, 'high'), b = palm(2, 'low', { leaves: [0xff6b35] });
  const ma = meshesOf(a).map((m) => m.material), mb = meshesOf(b).map((m) => m.material);
  assert.deepEqual(ma, mb);
  assert.deepEqual(ma.map((m) => m.userData.wind.layer).sort(), ['leaf', 'trunk']);
  for (const m of ma) {
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
  }
  // las hojas se ven por las dos caras y no dan la vuelta a la normal por detrás
  const leafMat = ma.find((m) => m.userData.wind.layer === 'leaf');
  assert.equal(leafMat.side, THREE.DoubleSide);
  const lib = THREE.ShaderLib.lambert;
  const sh = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  leafMat.onBeforeCompile(sh);
  assert.match(sh.fragmentShader, /normal \*= faceDirection/);
  assert.deepEqual(Object.values(palmMaterials()).sort((x, y) => x.id - y.id), ma.slice().sort((x, y) => x.id - y.id));
});

test('palmera: oclusión por color (base de las hojas más oscura que la punta) y cocos solo en Medio/Alto', () => {
  const g = palm(3, 'medium', { variant: 0 });
  const { position: p, color: c } = byLayer(g, 'leaf').geometry.attributes;
  const { crown } = g.userData.palm;
  let near = 0, nn = 0, far = 0, nf = 0;
  for (let i = 0; i < p.count; i++) {
    const d = Math.hypot(p.getX(i) - crown.x, p.getY(i) - crown.y, p.getZ(i) - crown.z);
    if (d < 0.6) (near += lum(c, i)), nn++;
    if (d > 1.6) (far += lum(c, i)), nf++;
  }
  assert.ok(nn && nf && near / nn < (far / nf) * 0.85, `base ${(near / nn).toFixed(3)} punta ${(far / nf).toFixed(3)}`);
  assert.equal(palm(3, 'low').userData.palm.coconuts, false);
  assert.equal(palm(3, 'medium').userData.palm.coconuts, true);
  assert.equal(palm(3, 'high').userData.palm.coconuts, true);
});

test('palmera: paleta por parámetro, por tema (opts.theme o quality.theme) y por defecto verde', () => {
  const mean = (g, layer) => {
    const a = byLayer(g, layer).geometry.attributes.color;
    const s = [0, 0, 0];
    for (let i = 0; i < a.count; i++) (s[0] += a.getX(i)), (s[1] += a.getY(i)), (s[2] += a.getZ(i));
    return s.map((v) => v / a.count);
  };
  const red = mean(palm(4, 'low', { leaves: [0xff2000] }), 'leaf');
  assert.ok(red[0] > red[1] * 3, 'hojas rojas');
  const themed = mean(palm(4, 'low', { theme: { leaves: [0xff2000], bark: 0x0000ff } }), 'leaf');
  assert.ok(themed[0] > themed[1] * 3);
  const fromQuality = makePalm(seededRng(4), { level: 'low', theme: { leaves: [0xff2000], bark: 0x0000ff } });
  assert.deepEqual(mean(fromQuality, 'leaf'), themed);
  const bark = mean(fromQuality, 'trunk');
  assert.ok(bark[2] > bark[0] * 3, 'tronco azul');
  const both = makePalm(seededRng(4), { level: 'low', theme: { leaves: [0x0000ff] } }, { leaves: [0xff2000] });
  assert.ok(mean(both, 'leaf')[0] > mean(both, 'leaf')[2] * 3);
  const def = mean(palm(4, 'low'), 'leaf');
  assert.ok(def[1] > def[0] && def[1] > def[2]);
  assert.ok(PALM_DEFAULTS.leaves.length >= 3);
});

test('palmera: la calidad se acepta como nombre, preset del laboratorio o lod', () => {
  for (const [i, level] of LEVELS.entries()) {
    const n = tris(palm(9, level));
    assert.equal(tris(palm(9, { level })), n);
    assert.equal(tris(makePalm(seededRng(9), { lod: i })), n);
    assert.equal(tris(makePalm(seededRng(9), i)), n);
  }
  assert.equal(tris(palm(9, 'nope')), tris(palm(9, 'medium')));
  assert.equal(tris(makePalm(seededRng(9))), tris(palm(9, 'medium')));
});

test('palmera: sobrevive a bakeStatic (palmeral entero en dos llamadas, viento y color intactos)', () => {
  const root = new THREE.Group();
  const trees = [];
  for (let i = 0; i < 12; i++) {
    const t = palm(100 + i, LEVELS[i % 3], { variant: i % PALM_VARIANTS });
    t.position.set(i * 5, 0, (i % 3) * -4);
    t.rotation.y = i;
    t.scale.setScalar(0.8 + (i % 5) * 0.15);
    root.add(t);
    trees.push(t);
  }
  const before = trees.reduce((n, t) => n + tris(t), 0);
  const out = bakeStatic(root, new THREE.Group());
  assert.equal(out.length, 2, 'tronco y hojas: dos llamadas para todo el palmeral');
  assert.equal(out.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0), before);
  for (const m of out) {
    for (const name of WIND_ATTRS) assert.equal(m.geometry.attributes[name]?.itemSize, WIND_ATTR_SIZES[name], `falta ${name}`);
    assert.ok(m.geometry.attributes.color);
    assert.equal(m.geometry.attributes.uv, undefined);
  }
  // el aleteo de las hojas (peso por vértice) llega tal cual, no se pisa con 1
  const frond = out.find((m) => m.material === palmMaterials().frond).geometry.attributes.windFlutter;
  let ones = 0;
  for (let i = 0; i < frond.count; i++) if (frond.getX(i) === 1) ones++;
  assert.ok(ones < frond.count * 0.2);
  // cada palmera conserva su fase y cada hoja la suya
  const trunk = out.find((m) => m.material === palmMaterials().trunk).geometry.attributes.windPhase;
  const phases = new Set();
  for (let i = 0; i < trunk.count; i++) phases.add(trunk.getX(i));
  assert.equal(phases.size, trees.length);
  const leaf = out.find((m) => m.material === palmMaterials().frond).geometry.attributes.windPhase;
  const leafPh = new Set();
  for (let i = 0; i < leaf.count; i++) leafPh.add(leaf.getY(i));
  assert.ok(leafPh.size > trees.length * 6);
});
