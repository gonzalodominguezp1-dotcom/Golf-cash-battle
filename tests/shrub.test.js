import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeShrub, SHRUB_BUDGET, SHRUB_VARIANTS, SHRUB_DEFAULTS, shrubMaterial, shrubMaterials } from '../src/game/render/assets/shrub.js';
import { WIND_ATTRS, WIND_ATTR_SIZES, isWindMaterial } from '../src/game/render/assets/wind.js';
import { bakeStatic } from '../src/game/render/batch.js';
import { seededRng } from '../src/lab/assetRegistry.js';

// Arbusto mediterráneo (paso 4, rediseño): tronquito + ramas finas + penachos de follaje
// con borde de hojas (tarjetas en Medio/Alto, puntas en Bajo). Ver assets/shrub.js.

const LEVELS = ['low', 'medium', 'high'];
const SEEDS = Array.from({ length: 30 }, (_, i) => 3 + i * 7919);
const FORMS = { alto: 0, monticulo: 1, bajo: 2, abierto: 3 };
const shrub = (seed, level = 'medium', opts = {}) => makeShrub(seededRng(seed), level, opts);
const meshesOf = (g) => {
  const out = [];
  g.traverse((o) => o.isMesh && out.push(o));
  return out;
};
const tris = (g) => meshesOf(g).reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0);
const foliageOf = (g) => meshesOf(g).find((m) => m.material === shrubMaterials().foliage);
const twigsOf = (g) => meshesOf(g).find((m) => m.material === shrubMaterials().twigs);
const isCardUv = (uv, i) => uv.getX(i) < 0.5; // las tarjetas usan la mitad izquierda de la textura; los volúmenes, el parche opaco de la derecha
const lum = (c, i) => c.getX(i) + c.getY(i) + c.getZ(i);

test('arbusto: presupuesto nuevo por calidad en 30 semillas x 4 formas (y se aprovecha), máx. 2 mallas', () => {
  assert.deepEqual(SHRUB_BUDGET, { low: 160, medium: 450, high: 900 });
  assert.equal(SHRUB_VARIANTS, 4);
  const mats = Object.values(shrubMaterials());
  for (const level of LEVELS) {
    for (let variant = 0; variant < SHRUB_VARIANTS; variant++) {
      for (const seed of SEEDS) {
        const g = shrub(seed, level, { variant });
        const n = tris(g);
        assert.ok(n <= SHRUB_BUDGET[level], `${level} v${variant} s${seed}: ${n} tri`);
        assert.ok(n >= SHRUB_BUDGET[level] * 0.45, `${level} v${variant} s${seed}: solo ${n} tri`);
        assert.equal(g.userData.shrub.triangles, n);
        const ms = meshesOf(g);
        assert.ok(ms.length >= 1 && ms.length <= 2, `${ms.length} mallas`);
        for (const m of ms) assert.ok(mats.includes(m.material), 'material compartido');
        assert.equal(ms[0].material, shrubMaterial(), 'el follaje va primero');
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

test('arbusto: determinista, tiradas fijas y la misma semilla da el mismo arbusto en las tres calidades', () => {
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
      assert.equal(info[k].branches, info[0].branches);
      assert.deepEqual(info[k].allLumps, info[0].allLumps, `s${seed}: los penachos no dependen de la calidad`);
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

test('arbusto: la semilla elige entre 4 formas con siluetas distintas (alto, montículo, bajo, abierto)', () => {
  assert.equal(new Set(SEEDS.map((s) => shrub(s).userData.shrub.variant)).size, SHRUB_VARIANTS);
  const avg = {};
  for (const [name, variant] of Object.entries(FORMS)) {
    let h = 0, w = 0;
    const N = 10;
    for (const seed of SEEDS.slice(0, N)) {
      const g = shrub(seed, 'high', { variant });
      assert.equal(g.userData.shrub.variant, variant);
      const box = new THREE.Box3().setFromObject(g);
      const size = box.getSize(new THREE.Vector3());
      assert.ok(box.min.y > -0.1 && box.max.y > 0.3, `${name} s${seed}: pegado al suelo`);
      h += size.y / N;
      w += Math.max(size.x, size.z) / N;
    }
    avg[name] = { h, w };
  }
  const { alto, monticulo, bajo, abierto } = avg;
  assert.ok(alto.h > alto.w * 1.1, `alto: ${alto.h.toFixed(2)} x ${alto.w.toFixed(2)}`);
  assert.ok(monticulo.w > monticulo.h * 1.7, `montículo: ${monticulo.h.toFixed(2)} x ${monticulo.w.toFixed(2)}`);
  assert.ok(bajo.h < 0.7 && bajo.h < alto.h * 0.55 && bajo.w < monticulo.w * 0.75, `bajo: ${bajo.h.toFixed(2)} x ${bajo.w.toFixed(2)}`);
  assert.ok(abierto.h > bajo.h * 1.4 && abierto.w > alto.w, `abierto: ${abierto.h.toFixed(2)} x ${abierto.w.toFixed(2)}`);
});

test('arbusto: tronquito y 3-6 ramas finas visibles (en el abierto se ve el suelo entre ramas)', () => {
  for (const level of LEVELS) {
    for (let variant = 0; variant < SHRUB_VARIANTS; variant++) {
      for (const seed of SEEDS.slice(0, 6)) {
        const g = shrub(seed, level, { variant });
        const { branches } = g.userData.shrub;
        assert.ok(branches >= 3 && branches <= 6, `${branches} ramas`);
        const tw = twigsOf(g);
        assert.ok(tw && tw.geometry.attributes.position.count > 0, `${level} v${variant}: sin ramas`);
      }
    }
  }
  // por debajo del follaje asoman tronco y ramas: el alto deja ver el tronquito, el abierto las ramas abiertas
  for (const seed of SEEDS.slice(0, 10)) {
    for (const level of LEVELS) {
      for (const [name, variant] of [['alto', FORMS.alto], ['abierto', FORMS.abierto]]) {
        const g = shrub(seed, level, { variant });
        const fp = foliageOf(g).geometry.attributes.position, tp = twigsOf(g).geometry.attributes.position;
        let fMin = Infinity;
        for (let i = 0; i < fp.count; i++) fMin = Math.min(fMin, fp.getY(i));
        // centro de cada triángulo de rama: los tubos de Bajo tienen un solo tramo (sin vértices a media rama)
        let bare = 0, spread = 0;
        const m = new THREE.Vector3(), q = new THREE.Vector3();
        for (let i = 0; i < tp.count; i += 3) {
          m.set(0, 0, 0);
          for (let k = 0; k < 3; k++) m.add(q.fromBufferAttribute(tp, i + k));
          m.divideScalar(3);
          if (m.y > 0.02 && m.y < fMin) {
            bare++;
            if (Math.hypot(m.x, m.z) > 0.08) spread++;
          }
        }
        assert.ok(bare >= 4, `${name} ${level} s${seed}: tronco tapado (${bare})`);
        if (name === 'abierto') {
          assert.ok(fMin > 0.3, `abierto ${level} s${seed}: el follaje baja hasta ${fMin.toFixed(2)}`);
          assert.ok(spread >= 4, `abierto ${level} s${seed}: no se ven ramas abiertas (${spread})`);
        }
      }
    }
  }
});

test('arbusto: la silueta se rompe con puntas de hojas (tarjetas en Medio/Alto, puntas en Bajo)', () => {
  const outside = (p, lumps) =>
    lumps.every(({ center: [x, y, z], r, sy }) => ((p.x - x) / r) ** 2 + ((p.y - y) / (r * sy)) ** 2 + ((p.z - z) / r) ** 2 > 1.05 ** 2);
  for (const level of LEVELS) {
    for (let variant = 0; variant < SHRUB_VARIANTS; variant++) {
      for (const seed of SEEDS.slice(0, 6)) {
        const g = shrub(seed, level, { variant });
        const { lumps } = g.userData.shrub;
        const { position: p, uv } = foliageOf(g).geometry.attributes;
        const v = new THREE.Vector3();
        let tips = 0, cards = 0;
        const owners = new Set();
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i);
          if (isCardUv(uv, i)) cards++;
          if (outside(v, lumps)) {
            tips++;
            // penacho más cercano: las puntas salen de varios penachos, no de uno
            let best = 0, bd = Infinity;
            lumps.forEach((l, k) => {
              const d = v.distanceTo(new THREE.Vector3(...l.center)) / l.r;
              if (d < bd) (bd = d), (best = k);
            });
            owners.add(best);
          }
        }
        const tag = `${level} v${variant} s${seed}`;
        assert.ok(tips >= p.count * 0.04, `${tag}: silueta lisa (${tips}/${p.count} puntas)`);
        assert.ok(owners.size >= Math.min(3, lumps.length), `${tag}: puntas en ${owners.size} penachos`);
        if (level === 'low') assert.equal(cards, 0, `${tag}: Bajo sin tarjetas`);
        else assert.ok(cards >= 6 * 4, `${tag}: pocas tarjetas (${cards / 6})`);
      }
    }
  }
});

test('arbusto: sin NaN, normales unitarias, caras hacia fuera, viento completo; uv solo en el follaje', () => {
  for (const level of LEVELS) {
    for (let variant = 0; variant < SHRUB_VARIANTS; variant++) {
      for (const seed of SEEDS.slice(0, 6)) {
        const g = shrub(seed, level, { variant });
        assert.equal(g.userData.swayRoot, true);
        for (const m of meshesOf(g)) {
          const at = m.geometry.attributes;
          for (const [name, a] of Object.entries(at)) for (const x of a.array) assert.ok(Number.isFinite(x), `${level} ${name} NaN`);
          for (const name of WIND_ATTRS) assert.equal(at[name]?.itemSize, WIND_ATTR_SIZES[name], `${level} falta ${name}`);
          assert.ok(at.color && at.normal);
          if (m.material === shrubMaterials().foliage) {
            assert.equal(at.uv?.itemSize, 2, 'el follaje lleva uv (tarjetas y parche opaco)');
            for (const x of at.uv.array) assert.ok(x >= 0 && x <= 1);
          } else assert.equal(at.uv, undefined, 'las ramas no llevan uv');
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
  for (const level of LEVELS) {
    for (let variant = 0; variant < SHRUB_VARIANTS; variant++) {
      for (const seed of SEEDS.slice(0, 5)) {
        for (const m of meshesOf(shrub(seed, level, { variant }))) {
          const p = m.geometry.attributes.position;
          for (let i = 0; i < p.count; i += 3) {
            assert.ok(p.getY(i) >= -0.03 || p.getY(i + 1) >= -0.03 || p.getY(i + 2) >= -0.03, 'cara bajo el suelo');
          }
        }
      }
    }
  }
});

test('arbusto: viento suave — follaje en capa canopy con fase por penacho y puntas que aletean; ramas casi quietas', () => {
  const g = shrub(21, 'high', { variant: FORMS.monticulo });
  const f = foliageOf(g);
  const { windFlutter: w, windPhase: ph, position: p, uv } = f.geometry.attributes;
  let lo = 0, nl = 0, hi = 0, nh = 0, tip = 0, nt = 0, vol = 0, nv = 0;
  const top = Math.max(...Array.from({ length: p.count }, (_, i) => p.getY(i)));
  for (let i = 0; i < p.count; i++) {
    assert.ok(w.getX(i) >= 0 && w.getX(i) <= 1);
    if (p.getY(i) < top * 0.3) (lo += w.getX(i)), nl++;
    if (p.getY(i) > top * 0.7) (hi += w.getX(i)), nh++;
    if (isCardUv(uv, i) && uv.getY(i) > 0.5) (tip += w.getX(i)), nt++;
    if (!isCardUv(uv, i)) (vol += w.getX(i)), nv++;
  }
  assert.ok(nl && nh && hi / nh > (lo / nl) * 1.5, `aleteo arriba ${(hi / nh).toFixed(3)} abajo ${(lo / nl).toFixed(3)}`);
  assert.ok(nt && nv && tip / nt > (vol / nv) * 2, `puntas ${(tip / nt).toFixed(3)} frente a volumen ${(vol / nv).toFixed(3)}`);
  const phases = new Set();
  for (let i = 0; i < ph.count; i++) phases.add(ph.getY(i));
  assert.ok(phases.size >= 3 && phases.size <= g.userData.shrub.lumps.length, `${phases.size} fases`);
  const base = ph.getX(0);
  for (let i = 0; i < ph.count; i++) assert.equal(ph.getX(i), base);
  const fw = f.material.userData.wind, tw = twigsOf(g).material.userData.wind;
  assert.equal(fw.layer, 'canopy');
  assert.ok(fw.height <= 1.5, 'escalado a una altura de arbusto, no de árbol');
  // ramas: solo se doblan (sin balanceo ni aleteo) y con la misma curva que el follaje, que no se despega
  assert.equal(tw.layer, 'trunk');
  assert.equal(tw.sway, 0);
  assert.equal(tw.flutter, 0);
  assert.equal(tw.height, fw.height);
  assert.equal(tw.bend, fw.bend);
  const tph = twigsOf(g).geometry.attributes.windPhase;
  for (let i = 0; i < tph.count; i++) assert.equal(tph.getX(i), base, 'misma fase de conjunto');
});

test('arbusto: materiales compartidos, lisos, con color de vértice, viento y luz de borde; tarjetas recortadas', () => {
  const a = shrub(1, 'high'), b = shrub(2, 'low', { leaves: [0xff6b35] });
  const { foliage, twigs } = shrubMaterials();
  assert.equal(shrubMaterial(), foliage);
  assert.equal(shrubMaterials(), shrubMaterials());
  for (const g of [a, b]) {
    assert.equal(foliageOf(g).material, foliage);
    assert.equal(twigsOf(g).material, twigs);
  }
  for (const m of [foliage, twigs]) {
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
    if (m === foliage) assert.match(sh.fragmentShader, /normal \*= faceDirection/, 'dos caras sin dar la vuelta a la normal');
  }
  assert.equal(foliage.side, THREE.DoubleSide);
  assert.equal(foliage.alphaTest, 0.5);
  assert.equal(foliage.userData.keepUv, true);
  assert.equal(twigs.userData.keepUv, undefined);
});

test('arbusto: color — abajo y dentro más oscuro, puntas más claras; paleta por parámetro, tema o defecto', () => {
  const g = shrub(3, 'high', { variant: FORMS.alto });
  const { position: p, color: c, uv } = foliageOf(g).geometry.attributes;
  let lo = 0, nl = 0, hi = 0, nh = 0, tb = 0, nb = 0, tt = 0, nt = 0;
  const top = Math.max(...Array.from({ length: p.count }, (_, i) => p.getY(i)));
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < top * 0.3) (lo += lum(c, i)), nl++;
    if (p.getY(i) > top * 0.75) (hi += lum(c, i)), nh++;
    if (isCardUv(uv, i)) {
      if (uv.getY(i) < 0.5) (tb += lum(c, i)), nb++;
      else (tt += lum(c, i)), nt++;
    }
  }
  assert.ok(nl && nh && lo / nl < (hi / nh) * 0.85, `abajo ${(lo / nl).toFixed(3)} arriba ${(hi / nh).toFixed(3)}`);
  assert.ok(nb && nt && tt / nt > (tb / nb) * 1.1, `puntas ${(tt / nt).toFixed(3)} base ${(tb / nb).toFixed(3)}`);

  const mean = (gr) => {
    const a = foliageOf(gr).geometry.attributes.color;
    const s = [0, 0, 0];
    for (let i = 0; i < a.count; i++) (s[0] += a.getX(i)), (s[1] += a.getY(i)), (s[2] += a.getZ(i));
    return s.map((v) => v / a.count);
  };
  const red = mean(shrub(4, 'low', { leaves: [0xff2000] }));
  assert.ok(red[0] > red[1] * 3, 'hojas rojas');
  assert.deepEqual(mean(shrub(4, 'low', { theme: { leaves: [0xff2000] } })), red);
  assert.deepEqual(mean(makeShrub(seededRng(4), { level: 'low', theme: { leaves: [0xff2000] } })), red);
  assert.deepEqual(mean(makeShrub(seededRng(4), { level: 'low', theme: { leaves: [0x0000ff] } }, { leaves: [0xff2000] })), red);
  const def = mean(shrub(4, 'low'));
  assert.ok(def[1] > def[0] && def[1] > def[2]);
  assert.ok(SHRUB_DEFAULTS.leaves.length >= 3);
  // las ramas toman el color de corteza pedido
  const bark = (gr) => {
    const a = twigsOf(gr).geometry.attributes.color;
    let r = 0, b = 0;
    for (let i = 0; i < a.count; i++) (r += a.getX(i)), (b += a.getZ(i));
    return r / Math.max(1e-6, b);
  };
  assert.ok(bark(shrub(4, 'low', { bark: 0xff0000 })) > bark(shrub(4, 'low', { bark: 0x0000ff })) * 5);
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

test('arbusto: sobrevive a bakeStatic (matorral entero en 2 llamadas; viento, color y uv intactos)', () => {
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
  const cards = items.reduce((n, t) => {
    const uv = foliageOf(t).geometry.attributes.uv;
    let k = 0;
    for (let i = 0; i < uv.count; i++) if (isCardUv(uv, i)) k++;
    return n + k;
  }, 0);
  const out = bakeStatic(root, new THREE.Group());
  assert.equal(out.length, 2, 'dos llamadas de dibujo para todos los arbustos (follaje y ramas)');
  assert.equal(out.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0), before);
  const fol = out.find((m) => m.material === shrubMaterials().foliage), tw = out.find((m) => m.material === shrubMaterials().twigs);
  assert.ok(fol && tw);
  for (const m of out) {
    const at = m.geometry.attributes;
    for (const name of WIND_ATTRS) assert.equal(at[name]?.itemSize, WIND_ATTR_SIZES[name], `falta ${name}`);
    assert.ok(at.color);
    // cada arbusto conserva su fase
    const phases = new Set();
    for (let i = 0; i < at.windPhase.count; i++) phases.add(at.windPhase.getX(i));
    assert.equal(phases.size, items.length);
    // la altura sobre la base (sway) no se escala con la escala del arbusto: sigue siendo metros del asset
    let maxSway = 0;
    for (let i = 0; i < at.sway.count; i++) maxSway = Math.max(maxSway, at.sway.getX(i));
    assert.ok(maxSway > 0.2 && maxSway < 1.9, `sway máx ${maxSway}`);
  }
  // uv: las tarjetas conservan su recorte tras juntarlas; las ramas siguen sin uv
  assert.equal(fol.geometry.attributes.uv?.itemSize, 2);
  let k = 0;
  for (let i = 0; i < fol.geometry.attributes.uv.count; i++) if (isCardUv(fol.geometry.attributes.uv, i)) k++;
  assert.equal(k, cards);
  assert.equal(tw.geometry.attributes.uv, undefined);
  // el aleteo (peso por vértice) llega tal cual, no se pisa con 1
  const wf = fol.geometry.attributes.windFlutter;
  let ones = 0;
  for (let i = 0; i < wf.count; i++) if (wf.getX(i) === 1) ones++;
  assert.ok(ones < wf.count * 0.3);
});
