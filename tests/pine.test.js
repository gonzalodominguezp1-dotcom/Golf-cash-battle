import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makePine, PINE_BUDGET, PINE_VARIANTS, PINE_DEFAULTS, pineMaterials } from '../src/game/render/assets/pine.js';
import { WIND_ATTRS, WIND_ATTR_SIZES, isWindMaterial } from '../src/game/render/assets/wind.js';
import { bakeStatic } from '../src/game/render/batch.js';
import { seededRng } from '../src/lab/assetRegistry.js';

const LEVELS = ['low', 'medium', 'high'];
const SEEDS = Array.from({ length: 30 }, (_, i) => 3 + i * 7919);
const pine = (seed, level = 'medium', opts = {}) => makePine(seededRng(seed), level, opts);
const meshesOf = (g) => {
  const out = [];
  g.traverse((o) => o.isMesh && out.push(o));
  return out;
};
const tris = (g) => meshesOf(g).reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);
const byLayer = (g, layer) => meshesOf(g).find((m) => m.material.userData.wind?.layer === layer);
const lum = (c, i) => c.getX(i) + c.getY(i) + c.getZ(i);

test('pino: presupuesto de triángulos por calidad en todas las variantes y semillas (y se aprovecha)', () => {
  assert.deepEqual(PINE_BUDGET, { low: 220, medium: 500, high: 1000 });
  for (const level of LEVELS) {
    for (let variant = 0; variant < PINE_VARIANTS; variant++) {
      for (const seed of SEEDS) {
        for (const snow of [false, true]) {
          const g = pine(seed, level, { variant, snow });
          const n = tris(g);
          assert.ok(n <= PINE_BUDGET[level], `${level} v${variant} s${seed}: ${n} tri`);
          assert.ok(n >= PINE_BUDGET[level] * 0.45, `${level} v${variant} s${seed}: solo ${n} tri`);
          assert.equal(g.userData.pine.triangles, n);
        }
      }
    }
  }
});

test('pino: más calidad, más triángulos (misma semilla y variante)', () => {
  for (let variant = 0; variant < PINE_VARIANTS; variant++) {
    for (const seed of SEEDS.slice(0, 5)) {
      const [lo, me, hi] = LEVELS.map((l) => tris(pine(seed, l, { variant })));
      assert.ok(lo < me && me < hi, `v${variant} s${seed}: ${lo} / ${me} / ${hi}`);
    }
  }
});

test('pino: determinista, y la misma semilla da el mismo pino en las tres calidades', () => {
  for (const level of LEVELS) {
    const a = meshesOf(pine(5, level)), b = meshesOf(pine(5, level));
    assert.equal(a.length, b.length);
    a.forEach((m, i) => {
      for (const name of Object.keys(m.geometry.attributes)) assert.deepEqual(m.geometry.attributes[name].array, b[i].geometry.attributes[name].array, `${level} ${name}`);
    });
  }
  for (const seed of SEEDS.slice(0, 10)) {
    const info = LEVELS.map((l) => pine(seed, l).userData.pine);
    for (const k of [1, 2]) {
      assert.equal(info[k].variant, info[0].variant);
      assert.deepEqual(info[k].tiers, info[0].tiers, `s${seed}: los pisos no dependen de la calidad`);
    }
    // la silueta es la misma: el tamaño apenas cambia de Bajo a Alto
    const sizes = LEVELS.map((l) => new THREE.Box3().setFromObject(pine(seed, l)).getSize(new THREE.Vector3()));
    for (const s of sizes) assert.ok(s.distanceTo(sizes[2]) < 0.25, `s${seed}: ${s.toArray()} vs ${sizes[2].toArray()}`);
  }
  // otra semilla, otra forma (con la misma variante)
  const v = pine(5).userData.pine.variant;
  assert.notDeepEqual(pine(6, 'medium', { variant: v }).userData.pine.tiers, pine(5).userData.pine.tiers);
});

test('pino: la semilla elige entre 3-4 variantes y cada una tiene su silueta', () => {
  assert.ok(PINE_VARIANTS >= 3 && PINE_VARIANTS <= 4);
  assert.equal(new Set(SEEDS.map((s) => pine(s).userData.pine.variant)).size, PINE_VARIANTS);
  const ratios = [];
  for (let v = 0; v < PINE_VARIANTS; v++) {
    let r = 0;
    for (const s of SEEDS.slice(0, 10)) {
      const size = new THREE.Box3().setFromObject(pine(s, 'medium', { variant: v })).getSize(new THREE.Vector3());
      r += size.y / Math.max(size.x, size.z) / 10;
    }
    ratios.push(r);
  }
  for (let i = 0; i < ratios.length; i++) for (let j = i + 1; j < ratios.length; j++) assert.ok(Math.abs(ratios[i] - ratios[j]) > 0.08, `variantes ${i} y ${j}: ${ratios.map((x) => x.toFixed(2))}`);
});

test('pino: pisos que se estrechan hacia una punta fina, y el tronco se ve entre pisos', () => {
  for (let variant = 0; variant < PINE_VARIANTS; variant++) {
    for (const seed of SEEDS.slice(0, 10)) {
      const { tiers, height } = pine(seed, 'medium', { variant }).userData.pine;
      assert.ok(tiers.length >= 3 && tiers.length <= 5);
      for (let i = 1; i < tiers.length; i++) {
        assert.ok(tiers[i].r < tiers[i - 1].r, `v${variant}: el piso ${i} es más estrecho`);
        assert.ok(tiers[i].rim > tiers[i - 1].rim, `v${variant}: el piso ${i} está más alto`);
      }
      const tip = tiers.at(-1);
      // punta fina: el último piso es alto y estrecho y acaba en la cima del árbol
      assert.ok(tip.top - tip.rim > tip.r * 1.6, `v${variant}: punta ${(tip.top - tip.rim).toFixed(2)} / r ${tip.r.toFixed(2)}`);
      assert.ok(Math.abs(tip.top - height) < 1e-6);
      // tronco visible: el pie del primer piso queda despejado y bajo cada falda hay hueco (el reverso sube hacia el tronco)
      assert.ok(tiers[0].rim > 0.5);
      for (const t of tiers.slice(0, -1)) assert.ok(t.hub > t.rim + 0.15 * (t.top - t.rim), `v${variant}: reverso de falda plano`);
    }
  }
  // la variante de pisos separados deja tronco a la vista entre un piso y el siguiente
  const sep = pine(7, 'medium', { variant: 3 }).userData.pine;
  assert.equal(sep.name, 'separado');
  for (let i = 1; i < sep.tiers.length; i++) assert.ok(sep.tiers[i].rim > sep.tiers[i - 1].top, `piso ${i} pisa al de abajo`);
});

test('pino: el borde de los pisos es ondulado y suave (no facetas planas)', () => {
  for (const level of LEVELS) {
    const g = pine(11, level, { variant: 0 });
    const { position: p, normal: n } = byLayer(g, 'canopy').geometry.attributes;
    const { tiers } = g.userData.pine;
    // radio del borde del primer piso en cada vértice del borde: varía (ondas), pero poco (suave)
    const t0 = tiers[0];
    const rims = [];
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(p.getY(i) - t0.rim) > 0.35 * (t0.top - t0.rim)) continue;
      const d = Math.hypot(p.getX(i) - t0.x, p.getZ(i) - t0.z);
      if (d > t0.r * 0.8) rims.push(d / t0.r);
    }
    assert.ok(rims.length > 6, `${level}: ${rims.length}`);
    const span = Math.max(...rims) - Math.min(...rims);
    assert.ok(span > 0.08 && span < 0.5, `${level}: ondulación ${span.toFixed(3)}`);
    // normales lisas: vértices repetidos en el mismo sitio y la misma cara (arriba / reverso)
    // comparten normal: sin facetas dentro de un piso (el borde sí es arista entre las dos caras)
    const seen = new Map();
    let shared = 0, same = 0;
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)},${n.getY(i) > 0}`;
      const nn = [n.getX(i), n.getY(i), n.getZ(i)];
      if (seen.has(k)) {
        shared++;
        const o = seen.get(k);
        if (Math.hypot(o[0] - nn[0], o[1] - nn[1], o[2] - nn[2]) < 1e-3) same++;
      } else seen.set(k, nn);
    }
    assert.ok(shared > p.count * 0.5, `${level}: malla poco conectada`);
    assert.ok(same / shared > 0.97, `${level}: ${(100 * same / shared).toFixed(1)}% de vértices con la misma normal`);
  }
});

test('pino: sin NaN, normales unitarias, caras hacia fuera y atributos de viento completos', () => {
  for (const level of LEVELS) {
    for (let variant = 0; variant < PINE_VARIANTS; variant++) {
      for (const seed of SEEDS.slice(0, 6)) {
        const g = pine(seed, level, { variant, snow: seed % 2 === 0 });
        assert.equal(g.userData.swayRoot, true);
        for (const m of meshesOf(g)) {
          const at = m.geometry.attributes;
          for (const [name, a] of Object.entries(at)) for (const v of a.array) assert.ok(Number.isFinite(v), `${level} ${name} NaN`);
          for (const name of WIND_ATTRS) assert.equal(at[name]?.itemSize, WIND_ATTR_SIZES[name], `${level} falta ${name}`);
          assert.ok(at.color && at.normal);
          assert.equal(at.uv, undefined, 'el pino no paga uv');
          const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
          let front = 0;
          for (let i = 0; i < at.normal.count; i++) {
            const l = Math.hypot(at.normal.getX(i), at.normal.getY(i), at.normal.getZ(i));
            assert.ok(Math.abs(l - 1) < 1e-4, `normal ${l}`);
          }
          // el orden de los vértices (cara visible) va con la normal: el material es de una cara
          for (let i = 0; i < at.position.count; i += 3) {
            A.fromBufferAttribute(at.position, i);
            B.fromBufferAttribute(at.position, i + 1).sub(A);
            C.fromBufferAttribute(at.position, i + 2).sub(A);
            N.fromBufferAttribute(at.normal, i).add(new THREE.Vector3().fromBufferAttribute(at.normal, i + 1)).add(new THREE.Vector3().fromBufferAttribute(at.normal, i + 2));
            if (B.cross(C).dot(N) > 0) front++;
          }
          assert.equal(front, at.position.count / 3, `${level} v${variant}: caras del revés`);
          assert.ok(m.matrix.equals(new THREE.Matrix4()));
          for (let i = 0; i < at.sway.count; i++) assert.ok(Math.abs(at.sway.getX(i) - Math.max(0, at.position.getY(i))) < 1e-5);
          // tronco y pisos comparten la fase del árbol: se doblan juntos
          assert.equal(at.windPhase.getX(0), byLayer(g, 'trunk').geometry.attributes.windPhase.getX(0));
        }
      }
    }
  }
});

test('pino: viento — tronco en la capa trunk, pisos en canopy, la punta aletea más que la base', () => {
  const g = pine(21, 'medium', { variant: 1 });
  const trunk = byLayer(g, 'trunk'), canopy = byLayer(g, 'canopy');
  assert.ok(trunk && canopy);
  for (let i = 0; i < trunk.geometry.attributes.windFlutter.count; i++) assert.equal(trunk.geometry.attributes.windFlutter.getX(i), 0);
  const { position: p, windFlutter: w, windPhase: ph } = canopy.geometry.attributes;
  const box = new THREE.Box3().setFromBufferAttribute(p);
  let lo = 0, nlo = 0, hi = 0, nhi = 0;
  for (let i = 0; i < p.count; i++) {
    const y = (p.getY(i) - box.min.y) / (box.max.y - box.min.y);
    assert.ok(w.getX(i) >= 0 && w.getX(i) <= 1);
    if (y < 0.3) (lo += w.getX(i)), nlo++;
    if (y > 0.7) (hi += w.getX(i)), nhi++;
  }
  assert.ok(hi / nhi > (lo / nlo) * 1.2, `aleteo arriba ${(hi / nhi).toFixed(3)} abajo ${(lo / nlo).toFixed(3)}`);
  // cada piso con su fase, pero parecidas (no se abren huecos entre pisos)
  const phases = new Set();
  for (let i = 0; i < ph.count; i++) phases.add(ph.getY(i));
  assert.equal(phases.size, g.userData.pine.tiers.length);
  assert.ok(Math.max(...phases) - Math.min(...phases) < 1.6);
});

test('pino: materiales compartidos, lisos, con color de vértice, viento y luz de borde', () => {
  const a = pine(1, 'high'), b = pine(2, 'low', { leaves: [0xff6b35], snow: true });
  const ma = meshesOf(a).map((m) => m.material), mb = meshesOf(b).map((m) => m.material);
  assert.deepEqual(ma, mb, 'el mismo material en todos los pinos (también con nieve)');
  assert.deepEqual(ma.map((m) => m.userData.wind.layer).sort(), ['canopy', 'trunk']);
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
  assert.deepEqual(Object.values(pineMaterials()).sort((x, y) => x.id - y.id), ma.slice().sort((x, y) => x.id - y.id));
});

test('pino: oclusión por color (reverso de las faldas y abajo más oscuros) y normales hacia fuera', () => {
  for (let variant = 0; variant < PINE_VARIANTS; variant++) {
    const g = pine(3, 'medium', { variant });
    const { position: p, color: c, normal: n } = byLayer(g, 'canopy').geometry.attributes;
    const box = new THREE.Box3().setFromBufferAttribute(p);
    let lo = 0, nlo = 0, hi = 0, nhi = 0, up = 0, nup = 0, down = 0, ndown = 0, out = 0;
    const { tiers } = g.userData.pine;
    for (let i = 0; i < p.count; i++) {
      const y = (p.getY(i) - box.min.y) / (box.max.y - box.min.y);
      const L = lum(c, i);
      if (y < 0.25) (lo += L), nlo++;
      if (y > 0.75) (hi += L), nhi++;
      if (n.getY(i) > 0.5) (up += L), nup++;
      if (n.getY(i) < -0.5) (down += L), ndown++;
      // hacia fuera del eje del árbol (o hacia arriba/abajo cerca del eje)
      const t = tiers.reduce((best, tt) => (Math.abs(tt.rim - p.getY(i)) < Math.abs(best.rim - p.getY(i)) ? tt : best));
      const dx = p.getX(i) - t.x, dz = p.getZ(i) - t.z;
      if (dx * n.getX(i) + dz * n.getZ(i) > -0.02 || Math.abs(n.getY(i)) > 0.6) out++;
    }
    assert.ok(lo / nlo < (hi / nhi) * 0.85, `v${variant}: abajo ${(lo / nlo).toFixed(3)} arriba ${(hi / nhi).toFixed(3)}`);
    assert.ok(ndown > 0 && down / ndown < (up / nup) * 0.7, `v${variant}: reverso ${(down / ndown).toFixed(3)} cara ${(up / nup).toFixed(3)}`);
    assert.ok(out / p.count > 0.9, `v${variant}: ${((out / p.count) * 100).toFixed(1)}% hacia fuera`);
  }
});

test('pino: paleta por parámetro, por tema (opts.theme o quality.theme) y por defecto verde oscuro', () => {
  const mean = (g, layer) => {
    const a = byLayer(g, layer).geometry.attributes.color;
    const s = [0, 0, 0];
    for (let i = 0; i < a.count; i++) (s[0] += a.getX(i)), (s[1] += a.getY(i)), (s[2] += a.getZ(i));
    return s.map((v) => v / a.count);
  };
  const red = mean(pine(4, 'low', { leaves: [0xff2000] }), 'canopy');
  assert.ok(red[0] > red[1] * 3, 'copa roja');
  const themed = mean(pine(4, 'low', { theme: { leaves: [0xff2000], bark: 0x0000ff } }), 'canopy');
  assert.ok(themed[0] > themed[1] * 3, 'copa roja por tema');
  const fromQuality = makePine(seededRng(4), { level: 'low', theme: { leaves: [0xff2000], bark: 0x0000ff } });
  assert.deepEqual(mean(fromQuality, 'canopy'), themed, 'el laboratorio pasa el tema en la calidad');
  const bark = mean(fromQuality, 'trunk');
  assert.ok(bark[2] > bark[0] * 3, 'tronco azul');
  // opts manda sobre quality.theme
  const both = makePine(seededRng(4), { level: 'low', theme: { leaves: [0x0000ff] } }, { leaves: [0xff2000] });
  assert.ok(mean(both, 'canopy')[0] > mean(both, 'canopy')[2] * 3);
  // por defecto: verde oscuro de pino (más oscuro que un verde de árbol de hoja ancha)
  const def = mean(pine(4, 'low'), 'canopy');
  assert.ok(def[1] > def[0] && def[1] > def[2]);
  const leafAvg = PINE_DEFAULTS.leaves.map((h) => new THREE.Color(h)).reduce((s, c) => s + c.getHSL({}).l, 0) / PINE_DEFAULTS.leaves.length;
  assert.ok(leafAvg < 0.32, `verde por defecto claro: ${leafAvg.toFixed(2)}`);
});

test('pino: nieve opcional en color de vértice, solo encima de los pisos, sin cambiar la forma', () => {
  for (let variant = 0; variant < PINE_VARIANTS; variant++) {
    const plain = pine(8, 'medium', { variant }), snowy = pine(8, 'medium', { variant, snow: true });
    const a = byLayer(plain, 'canopy').geometry.attributes, b = byLayer(snowy, 'canopy').geometry.attributes;
    assert.deepEqual(a.position.array, b.position.array, 'la nieve no cambia la geometría');
    assert.deepEqual(a.normal.array, b.normal.array);
    let whiter = 0, under = 0;
    for (let i = 0; i < b.color.count; i++) {
      const d = lum(b.color, i) - lum(a.color, i);
      if (d > 0.3) {
        whiter++;
        if (b.normal.getY(i) < 0) under++;
      }
    }
    assert.ok(whiter > b.color.count * 0.15, `v${variant}: poca nieve (${whiter}/${b.color.count})`);
    assert.equal(under, 0, `v${variant}: nieve debajo de las faldas`);
    // intensidad parcial: menos nieve
    const half = byLayer(pine(8, 'medium', { variant, snow: 0.4 }), 'canopy').geometry.attributes.color;
    let sumHalf = 0, sumFull = 0;
    for (let i = 0; i < half.count; i++) (sumHalf += lum(half, i)), (sumFull += lum(b.color, i));
    assert.ok(sumHalf < sumFull);
    // el tronco no se nieva
    assert.deepEqual(byLayer(plain, 'trunk').geometry.attributes.color.array, byLayer(snowy, 'trunk').geometry.attributes.color.array);
  }
});

test('pino: la calidad se acepta como nombre, preset del laboratorio o lod', () => {
  for (const [i, level] of LEVELS.entries()) {
    const n = tris(pine(9, level));
    assert.equal(tris(pine(9, { level })), n);
    assert.equal(tris(makePine(seededRng(9), { lod: i })), n);
    assert.equal(tris(makePine(seededRng(9), i)), n);
  }
  assert.equal(tris(pine(9, 'nope')), tris(pine(9, 'medium')));
  assert.equal(tris(makePine(seededRng(9))), tris(pine(9, 'medium')));
});

test('pino: sobrevive a bakeStatic (bosque entero en dos llamadas, viento y color intactos)', () => {
  const root = new THREE.Group();
  const trees = [];
  for (let i = 0; i < 12; i++) {
    const t = pine(100 + i, LEVELS[i % 3], { variant: i % PINE_VARIANTS, snow: i % 4 === 0 });
    t.position.set(i * 5, 0, (i % 3) * -4);
    t.rotation.y = i;
    t.scale.setScalar(0.8 + (i % 5) * 0.15);
    root.add(t);
    trees.push(t);
  }
  const before = trees.reduce((n, t) => n + tris(t), 0);
  const out = bakeStatic(root, new THREE.Group());
  assert.equal(out.length, 2, 'tronco y pisos: dos llamadas para todo el bosque');
  assert.equal(out.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0), before);
  for (const m of out) {
    for (const name of WIND_ATTRS) assert.equal(m.geometry.attributes[name]?.itemSize, WIND_ATTR_SIZES[name], `falta ${name}`);
    assert.ok(m.geometry.attributes.color);
    assert.equal(m.geometry.attributes.uv, undefined);
  }
  // el aleteo de los pisos (peso por vértice) llega tal cual, no se pisa con 1
  const canopy = out.find((m) => m.material === pineMaterials().canopy).geometry.attributes.windFlutter;
  let ones = 0;
  for (let i = 0; i < canopy.count; i++) if (canopy.getX(i) === 1) ones++;
  assert.ok(ones < canopy.count * 0.5);
  // cada pino conserva su fase
  const trunk = out.find((m) => m.material === pineMaterials().trunk).geometry.attributes.windPhase;
  const phases = new Set();
  for (let i = 0; i < trunk.count; i++) phases.add(trunk.getX(i));
  assert.equal(phases.size, trees.length);
});
