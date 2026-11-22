import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  makeFlowerField, addFlowers, flowerGeometry, flowerMaterial, flowerTriangles, flowerPaletteOf, flowerPaletteName,
  FLOWER_BUDGET, FLOWER_MAX, FLOWER_FIELD_TRIS, FLOWER_MAX_CALLS, FLOWER_RNG_DRAWS, FLOWER_CLEAR, FLOWER_WIND_HEIGHT,
  FLOWER_SPECIES, FLOWER_INFO, FLOWER_PALETTES,
} from '../src/game/render/assets/flower.js';
import { GRASS_CLEAR } from '../src/game/render/assets/grass.js';
import { isWindMaterial, windDisplacement, windSample, resetWind, setWind, triggerGust, updateWind } from '../src/game/render/assets/wind.js';
import { bakeStatic } from '../src/game/render/batch.js';
import { seededRng } from '../src/lab/assetRegistry.js';
import { THEMES } from '../src/game/themes.js';

// Flores del estilo liso (paso 6): margarita, tulipán y campanilla instanciadas. Ver assets/flower.js.

const LEVELS = ['low', 'medium', 'high'];
const SEEDS = [1, 7, 42, 1234, 99991];

// Hoyo de prueba: pista de 6 x 24 m, tee pegado al borde y una charca fuera de la pista
const bounds = { minX: -3, maxX: 3, minZ: -12, maxZ: 12 };
const tee = [2.8, -11.8];
const pond = { x: 7, z: 2, r: 2.5 };
const heightAt = (x, z) => (Math.hypot(x - pond.x, z - pond.z) < pond.r ? -1 : 0);
const ok = (x, z, y) => y > -0.32 && Math.hypot(x - tee[0], z - tee[1]) > 1.2;
const day = THEMES.meadowDay;
const field = (seed = 1, level = 'medium', extra = {}) => makeFlowerField({ bounds, heightAt, ok, rng: seededRng(seed), level, theme: day, ...extra });
const distBox = (x, z) => Math.hypot(Math.max(bounds.minX - x, 0, x - bounds.maxX), Math.max(bounds.minZ - z, 0, z - bounds.maxZ));

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
/** Todas las flores de un campo, de todas sus mallas. */
function flowers(f) {
  const out = [];
  for (const mesh of f.meshes) {
    const col = mesh.geometry.getAttribute('flowerColor');
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, _m);
      _m.decompose(_p, _q, _s);
      out.push({ mesh, i, species: mesh.userData.species, variant: mesh.userData.variants[i], x: _p.x, y: _p.y, z: _p.z, sy: _s.y, sxz: _s.x, m: _m.clone(), color: [col.getX(i), col.getY(i), col.getZ(i)] });
    }
  }
  return out;
}
const keyOf = (t) => `${t.species}:${t.x.toFixed(5)},${t.z.toFixed(5)}`;

// ---------- presupuesto ----------

test('flores: presupuesto de triángulos por flor y calidad medido, y se aprovecha', () => {
  assert.deepEqual(FLOWER_BUDGET, { low: 24, medium: 70, high: 110 });
  assert.equal(FLOWER_MAX_CALLS, 3);
  assert.equal(FLOWER_SPECIES.length, 3);
  for (const level of LEVELS) {
    for (const sp of FLOWER_SPECIES) {
      const n = flowerTriangles(level, sp);
      assert.ok(n <= FLOWER_BUDGET[level], `${level}/${sp}: ${n} tri`);
      assert.ok(n >= FLOWER_BUDGET[level] * 0.5, `${level}/${sp}: solo ${n} tri`);
      const g = flowerGeometry(level, sp);
      assert.equal(g.index, null);
      assert.equal(g.attributes.position.count % 3, 0);
    }
  }
  for (const sp of FLOWER_SPECIES) {
    const [lo, me, hi] = LEVELS.map((l) => flowerTriangles(l, sp));
    assert.ok(lo < me && me < hi, `${sp}: ${lo} / ${me} / ${hi}`);
  }
});

test('flores: campo entero dentro del presupuesto, como mucho 3 llamadas y una InstancedMesh por especie', () => {
  for (const level of LEVELS) assert.ok(FLOWER_FIELD_TRIS[level] <= FLOWER_MAX[level] * FLOWER_BUDGET[level]);
  assert.ok(FLOWER_MAX.low < FLOWER_MAX.medium && FLOWER_MAX.medium < FLOWER_MAX.high);
  const mat = flowerMaterial();
  for (const level of LEVELS) {
    for (const seed of SEEDS) {
      const f = field(seed, level);
      assert.ok(f.stats.flowers > FLOWER_MAX[level] * 0.4, `${level} s${seed}: solo ${f.stats.flowers} flores`);
      assert.ok(f.stats.flowers <= FLOWER_MAX[level]);
      assert.ok(f.meshes.length >= 1 && f.meshes.length <= FLOWER_MAX_CALLS);
      assert.equal(f.stats.calls, f.meshes.length);
      assert.ok(f.stats.triangles <= FLOWER_FIELD_TRIS[level], `${level} s${seed}: ${f.stats.triangles} tri`);
      let total = 0, count = 0;
      for (const m of f.meshes) {
        assert.ok(m.isInstancedMesh, 'una InstancedMesh por especie, no grupos sueltos');
        assert.equal(m.material, mat, 'material compartido');
        total += m.count * (m.geometry.attributes.position.count / 3);
        count += m.count;
      }
      assert.equal(total, f.stats.triangles);
      assert.equal(count, f.stats.flowers);
      assert.equal(new Set(f.meshes.map((m) => m.userData.species)).size, f.meshes.length, 'una malla por especie');
    }
  }
});

test('flores: las tres especies aparecen en un campo de tema con flores', () => {
  for (const seed of SEEDS) {
    const f = field(seed, 'high');
    assert.deepEqual(Object.keys(f.stats.species).sort(), [...FLOWER_SPECIES].sort(), `s${seed}: ${JSON.stringify(f.stats.species)}`);
    for (const sp of FLOWER_SPECIES) assert.ok(f.stats.species[sp] >= f.stats.flowers * 0.08, `${sp} apenas aparece`);
  }
  // only: una sola especie y una sola llamada
  for (const sp of FLOWER_SPECIES) {
    const f = field(3, 'medium', { only: sp });
    assert.equal(f.meshes.length, 1);
    assert.equal(f.meshes[0].userData.species, sp);
  }
});

// ---------- determinismo y rng ----------

test('flores: determinista; la semilla cambia el campo; las variantes salen de la semilla', () => {
  for (const level of LEVELS) {
    const a = flowers(field(5, level)), b = flowers(field(5, level));
    assert.equal(a.length, b.length);
    a.forEach((t, i) => {
      assert.deepEqual(t.m.elements, b[i].m.elements);
      assert.deepEqual(t.color, b[i].color);
    });
  }
  assert.notDeepEqual(flowers(field(5)).map(keyOf), flowers(field(6)).map(keyOf));
  const all = flowers(field(9, 'high'));
  assert.equal(new Set(all.map((t) => t.variant)).size, 3, 'tres variantes');
  assert.ok(new Set(all.map((t) => t.sy.toFixed(3))).size > 50, 'tamaños distintos');
  // las variantes se distinguen por proporciones (más de un 12 %)
  const ratio = (v) => {
    const xs = all.filter((t) => t.variant === v);
    return xs.reduce((n, t) => n + t.sy / t.sxz, 0) / xs.length;
  };
  assert.ok(ratio(1) > ratio(0) * 1.12 && ratio(0) > ratio(2) * 1.12, `${ratio(0)} ${ratio(1)} ${ratio(2)}`);
  // giro del tallo: ninguna flor derecha idéntica
  assert.ok(new Set(all.map((t) => t.m.elements[4].toFixed(3))).size > 20);
});

test('flores: el rng del hoyo pierde SIEMPRE una tirada (FLOWER_RNG_DRAWS), sea cual sea calidad, densidad, tema o paleta', () => {
  assert.equal(FLOWER_RNG_DRAWS, 1);
  const draws = (extra) => {
    let n = 0;
    const r = seededRng(11);
    makeFlowerField({ bounds, heightAt, ok, rng: () => (n++, r()), ...extra });
    return n;
  };
  for (const level of LEVELS) for (const density of [0, 0.2, 1]) {
    for (const theme of [day, THEMES.jungle, THEMES.neonCity ?? THEMES.cyberpunk ?? { neon: true }, THEMES.lava ?? { lava: true }, undefined]) {
      assert.equal(draws({ level, density, theme }), 1, `${level} d${density}`);
    }
  }
  assert.equal(draws({ level: 'high', theme: day, only: 'bell' }), 1);
  assert.equal(draws({ level: 'low', palette: 'night' }), 1);
});

test('flores: Bajo ⊂ Medio ⊂ Alto (mismo sitio, especie, variante y color)', () => {
  for (const seed of SEEDS) {
    const [lo, me, hi] = LEVELS.map((l) => flowers(field(seed, l)));
    const idx = (xs) => new Map(xs.map((t) => [keyOf(t), t]));
    const mi = idx(me), hi_ = idx(hi);
    assert.ok(lo.length < me.length && me.length < hi.length, `${lo.length} / ${me.length} / ${hi.length}`);
    for (const t of lo) {
      const u = mi.get(keyOf(t));
      assert.ok(u, `s${seed}: una flor de Bajo no está en Medio`);
      assert.deepEqual(u.color, t.color);
      assert.equal(u.variant, t.variant);
    }
    for (const t of me) {
      const u = hi_.get(keyOf(t));
      assert.ok(u, `s${seed}: una flor de Medio no está en Alto`);
      assert.deepEqual(u.m.elements, t.m.elements);
    }
  }
});

// ---------- zonas libres ----------

test('flores: zonas libres como el césped (raíz, pétalos y hojas fuera de la pista; nada en el agua ni en el tee)', () => {
  assert.ok(FLOWER_CLEAR.course >= GRASS_CLEAR.course && FLOWER_CLEAR.leaf >= GRASS_CLEAR.leaf);
  // el alcance declarado cubre la geometría real de las tres calidades
  for (const sp of FLOWER_SPECIES) {
    let reach = 0;
    for (const level of LEVELS) {
      const p = flowerGeometry(level, sp).attributes.position;
      for (let i = 0; i < p.count; i++) reach = Math.max(reach, Math.hypot(p.getX(i), p.getZ(i)));
    }
    assert.ok(FLOWER_INFO[sp].reach >= reach, `${sp}: reach ${FLOWER_INFO[sp].reach} < ${reach}`);
    assert.ok(FLOWER_INFO[sp].reach <= reach + 0.03, `${sp}: reach ${FLOWER_INFO[sp].reach} demasiado holgado (${reach})`);
  }
  const v = new THREE.Vector3();
  let nearest = Infinity, checked = 0;
  for (const level of LEVELS) {
    for (const seed of SEEDS) {
      for (const t of flowers(field(seed, level))) {
        const d = distBox(t.x, t.z);
        assert.ok(d >= FLOWER_CLEAR.course, `${level} s${seed}: raíz a ${d.toFixed(2)} m de la pista`);
        assert.ok(d - FLOWER_INFO[t.species].reach * t.sxz >= FLOWER_CLEAR.leaf - 1e-9, `${level}/${t.species} s${seed}: hoja a ${(d - FLOWER_INFO[t.species].reach * t.sxz).toFixed(3)} m de la pista`);
        assert.ok(heightAt(t.x, t.z) > -0.32, 'en el agua');
        assert.ok(Math.hypot(t.x - tee[0], t.z - tee[1]) > 1.2, 'sobre el tee');
        // cada vértice de cada flor, ya girado y escalado
        const p = t.mesh.geometry.attributes.position;
        for (let i = 0; i < p.count; i += 5) {
          v.fromBufferAttribute(p, i).applyMatrix4(t.m);
          const dv = distBox(v.x, v.z);
          nearest = Math.min(nearest, dv);
          checked++;
          assert.ok(dv >= FLOWER_CLEAR.leaf * 0.5, `${level}/${t.species} s${seed}: un vértice a ${dv.toFixed(3)} m de la pista`);
        }
      }
    }
  }
  assert.ok(checked > 10000);
  assert.ok(nearest > 0, `más cercano ${nearest}`);
  // franja estrecha junto a la pista (0,45-0,9 m): ahí manda la regla de la hoja (los pétalos y hojas largos se quedan más lejos)
  const band = [];
  for (const seed of SEEDS) for (const t of flowers(field(seed, 'high', { reach: 0.9 }))) band.push({ ...t, d: distBox(t.x, t.z) });
  assert.ok(band.length > 100, `${band.length} flores en la franja`);
  for (const t of band) assert.ok(t.d - FLOWER_INFO[t.species].reach * t.sxz >= FLOWER_CLEAR.leaf - 1e-9, `${t.species} a ${t.d.toFixed(3)} m`);
  assert.ok(band.some((t) => t.species === 'daisy' && t.d < 0.55), 'la margarita (pétalos cortos) llega más cerca');
  // alcance máximo: nada pasado `reach`
  const far = flowers(field(2, 'high', { reach: 6 }));
  assert.ok(far.length > 20);
  for (const t of far) assert.ok(distBox(t.x, t.z) <= 6);
  // la densidad recorta el campo
  assert.ok(flowers(field(2, 'high', { density: 0.25 })).length < FLOWER_MAX.high * 0.25 + 1);
});

test('flores: el viento fuerte no tumba la punta sobre la pista (tallo más alto, ráfaga a fuerza 1)', () => {
  const L = flowerMaterial().userData.wind;
  resetWind();
  setWind({ strength: 1, angle: 0, autoGusts: false });
  triggerGust({ amp: 1 });
  let worst = 0;
  for (let k = 0; k < 400; k++) {
    updateWind(0.1);
    const s = windSample();
    for (const h of [0.2, 0.3, 0.41]) {
      const d = windDisplacement({ x: 0, y: h, z: 0, h, p0: 0.7, p1: 0, w: 1 }, L, s.t, s);
      worst = Math.max(worst, Math.hypot(d.x, d.z));
    }
  }
  resetWind();
  assert.ok(worst > 0.02, `no se mueve (${worst})`);
  assert.ok(worst < FLOWER_CLEAR.leaf, `la punta se tumba ${worst.toFixed(3)} m >= margen ${FLOWER_CLEAR.leaf}`);
});

// ---------- paletas y temas ----------

test('flores: los temas sin flores no llevan ninguna (floraOf.flowers = 0, neón, lava, caldera, sin theme.flowers)', () => {
  const noFlowers = (theme) => {
    const f = makeFlowerField({ bounds, heightAt, ok, rng: seededRng(1), level: 'high', theme });
    assert.equal(f.mesh, null);
    assert.deepEqual(f.meshes, []);
    assert.equal(f.stats.flowers, 0);
    assert.equal(f.group.children.length, 0);
    assert.equal(addFlowers(new THREE.Scene(), { bounds, heightAt, ok, rng: seededRng(1), level: 'high', theme }), null);
  };
  for (const [id, theme] of Object.entries(THEMES)) {
    const expected = !!theme.flowers && !theme.neon && !theme.cyberCity && !theme.lava && !theme.caldera;
    assert.equal(flowerPaletteName(theme) !== null, expected, id);
    if (!expected) noFlowers(theme);
    else assert.ok(field(1, 'medium', { theme }).stats.flowers > 50, `${id}: sin flores`);
  }
  noFlowers({ ...day, flora: { flowers: 0 } });
  noFlowers({ ...day, flowers: false });
  noFlowers({ ...day, neon: true });
  assert.equal(flowerPaletteName(undefined), 'day');
  assert.equal(flowerPaletteOf({ ...day, flora: { flowers: 0 } }), null);
  // flora.flowers numérico = multiplicador de densidad
  assert.ok(field(1, 'high', { theme: { ...day, flora: { flowers: 0.3 } } }).stats.flowers < field(1, 'high').stats.flowers * 0.4);
});

test('flores: cada especie lleva la paleta de su tema', () => {
  const names = new Set(Object.entries(THEMES).map(([, t]) => flowerPaletteName(t)).filter(Boolean));
  assert.ok(names.size >= 3, `solo ${[...names]}`);
  assert.equal(flowerPaletteName(THEMES.jungle), 'jungle');
  assert.equal(flowerPaletteName(THEMES.sunset), 'sunset');
  assert.equal(flowerPaletteName(THEMES.gardenNight), 'night');
  assert.equal(flowerPaletteName(THEMES.meadow), 'night');
  assert.equal(flowerPaletteName(THEMES.meadowDay), 'day');
  assert.equal(flowerPaletteName({ ...day, flowerPalette: 'sunset' }), 'sunset');
  for (const p of Object.values(FLOWER_PALETTES)) {
    for (const sp of FLOWER_SPECIES) assert.ok(p[sp].length >= 2 && p.weights[sp] > 0);
  }
  // los colores de instancia salen de la paleta (hasta el ±7 % de luz): paleta roja → pétalos rojos
  const red = { name: 'red', daisy: [0xff0000], tulip: [0xff0000], bell: [0xff0000], weights: { daisy: 1, tulip: 1, bell: 1 } };
  for (const t of flowers(field(4, 'medium', { palette: red }))) assert.ok(t.color[0] > t.color[1] * 8 && t.color[0] > t.color[2] * 8, `${t.species} ${t.color}`);
  // varios colores por especie y un toque de luz propio por flor
  for (const t of FLOWER_SPECIES) {
    const own = flowers(field(4, 'high')).filter((f) => f.species === t);
    const distinct = new Set(own.map((f) => f.color.map((v) => v.toFixed(2)).join()));
    assert.ok(distinct.size > FLOWER_PALETTES.day[t].length, `${t}: ${distinct.size} colores`);
  }
  // y paletas distintas dan colores distintos en los mismos sitios
  const a = flowers(field(4, 'medium', { palette: 'jungle' })), b = flowers(field(4, 'medium', { palette: 'night' }));
  assert.equal(a.length, b.length);
  assert.notDeepEqual(a.map((t) => t.color), b.map((t) => t.color));
  assert.equal(field(4, 'low', { theme: THEMES.jungle }).stats.palette, 'jungle');
});

test('flores: el color de pétalo va en la instancia; tallo, hojas y botón conservan el suyo (fMask)', () => {
  for (const level of LEVELS) {
    for (const sp of FLOWER_SPECIES) {
      const g = flowerGeometry(level, sp);
      const { position: p, color: c, fMask: m, normal: n } = g.attributes;
      assert.equal(m.itemSize, 1);
      assert.equal(n.count, p.count);
      let petals = 0, green = 0, other = 0;
      for (let i = 0; i < p.count; i++) {
        const r = c.getX(i), gg = c.getY(i), b = c.getZ(i);
        assert.ok(m.getX(i) === 0 || m.getX(i) === 1);
        if (m.getX(i) === 1) {
          petals++;
          assert.ok(Math.abs(r - gg) < 1e-4 && Math.abs(gg - b) < 1e-4, `${level}/${sp}: pétalo con color propio`);
          assert.ok(r > 0.3 && r <= 1.0001, 'blanco con oclusión');
        } else if (gg > r && gg > b) green++;
        else other++;
      }
      assert.ok(petals > p.count * 0.3, `${level}/${sp}: pocos pétalos (${petals}/${p.count})`);
      assert.ok(green > 6, `${level}/${sp}: sin tallo verde`);
      if (sp === 'daisy') assert.ok(other >= 4, 'margarita: botón amarillo');
      // la base de la flor (oclusión) es más oscura que su punta, y nada bajo el suelo
      let ymin = Infinity;
      for (let i = 0; i < p.count; i++) ymin = Math.min(ymin, p.getY(i));
      assert.ok(ymin > -0.02, `${level}/${sp}: bajo el suelo`);
    }
  }
  // el ancho de los pétalos: oclusión, más oscuro en el pie que en la punta
  const g = flowerGeometry('high', 'daisy');
  let lo = 0, nl = 0, hi = 0, nh = 0;
  const { position: p, color: c, fMask: m } = g.attributes;
  for (let i = 0; i < p.count; i++) {
    if (m.getX(i) !== 1) continue;
    if (Math.hypot(p.getX(i) - 0.014, p.getZ(i) - 0.006) < 0.03) (lo += c.getX(i)), nl++;
    else if (Math.hypot(p.getX(i) - 0.014, p.getZ(i) - 0.006) > 0.075) (hi += c.getX(i)), nh++;
  }
  assert.ok(nl && nh && hi / nh > (lo / nl) * 1.15, `punta ${(hi / nh).toFixed(2)} pie ${(lo / nl).toFixed(2)}`);
});

// ---------- material y viento ----------

test('flores: material compartido liso con color de vértice teñido por instancia, luz de borde y viento (capa flower)', () => {
  const m = flowerMaterial();
  assert.equal(flowerMaterial(), m);
  assert.ok(m.isMeshLambertMaterial);
  assert.equal(m.flatShading, false);
  assert.equal(m.vertexColors, true);
  assert.equal(m.side, THREE.DoubleSide);
  assert.ok(isWindMaterial(m));
  const w = m.userData.wind;
  assert.equal(w.layer, 'flower');
  assert.equal(w.source, 'y', 'altura local del vértice (InstancedMesh)');
  assert.equal(w.height, FLOWER_WIND_HEIGHT);
  assert.ok(w.bend > 0 && w.height > 0.3 && w.height < 0.6);
  const lib = THREE.ShaderLib.lambert;
  const sh = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  m.onBeforeCompile(sh);
  assert.match(sh.vertexShader, /attribute vec3 flowerColor;/);
  assert.match(sh.vertexShader, /attribute float fMask;/);
  assert.match(sh.vertexShader, /mix\(vColor\.rgb, vColor\.rgb \* flowerColor, fMask\)/);
  assert.match(sh.vertexShader, /instanceMatrix/);
  assert.match(sh.vertexShader, /uWind/);
  assert.ok(sh.vertexShader.indexOf('flowerColor, fMask') < sh.vertexShader.indexOf('gwO'), 'el color se tiñe antes de mover el vértice (da igual el orden, pero ambos están)');
  assert.doesNotMatch(sh.vertexShader, /attribute vec2 windPhase;/, 'sin atributos de viento: la fase sale del sitio de la flor');
  assert.match(sh.fragmentShader, /gcbRim/);
  assert.match(sh.fragmentShader, /normal \*= faceDirection/);
  for (const s of [sh.vertexShader, sh.fragmentShader]) assert.equal((s.match(/\{/g) ?? []).length, (s.match(/\}/g) ?? []).length);
  assert.ok(sh.uniforms.uWind && sh.uniforms.uGust);
  // las geometrías de las flores no llevan atributos de viento (la hierba tampoco)
  for (const sp of FLOWER_SPECIES) for (const level of LEVELS) for (const a of ['sway', 'windPhase', 'windFlutter']) assert.equal(flowerGeometry(level, sp).attributes[a], undefined);
});

test('flores: el tallo se dobla con el viento — la punta se mueve y la base no; más con ráfaga; la flor entera junta', () => {
  const L = flowerMaterial().userData.wind;
  resetWind();
  setWind({ strength: 1, angle: 0, autoGusts: false });
  updateWind(0.05);
  const calm = windSample();
  const at = (h, s, p0 = 0.3) => windDisplacement({ x: 0, y: h, z: 0, h, p0, p1: 2, w: 1 }, L, s.t, s);
  const base = at(0, calm), mid = at(0.2, calm), tip = at(0.4, calm);
  assert.equal(Math.hypot(base.x, base.z), 0);
  assert.ok(Math.hypot(tip.x, tip.z) > Math.hypot(mid.x, mid.z) * 2, 'se dobla más arriba');
  assert.ok(Math.hypot(tip.x, tip.z) > 0.003, `punta ${Math.hypot(tip.x, tip.z)}`);
  assert.ok(tip.x > 0, 'a favor del viento');
  triggerGust({ amp: 1 });
  let gust = 0;
  for (let k = 0; k < 300; k++) {
    updateWind(0.1);
    const d = at(0.4, windSample());
    gust = Math.max(gust, Math.hypot(d.x, d.z));
  }
  assert.ok(gust > Math.hypot(tip.x, tip.z) * 1.5, `ráfaga ${gust} frente a brisa ${Math.hypot(tip.x, tip.z)}`);
  // sin fase por pieza: pétalo y botón (mismo p0, distinta p1) se mueven igual
  const s = windSample();
  const a = windDisplacement({ x: 0, y: 0.3, z: 0, h: 0.3, p0: 1, p1: 0.1, w: 1 }, L, s.t, s), b = windDisplacement({ x: 0, y: 0.3, z: 0, h: 0.3, p0: 1, p1: 4.4, w: 1 }, L, s.t, s);
  assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9);
  resetWind();
});

// ---------- bakeStatic y liberación ----------

test('flores: bakeStatic no junta las instancias (userData.keep): salen intactas al padre y sin malla nueva', () => {
  const f = field(8, 'medium');
  const root = new THREE.Group();
  root.add(f.group);
  const counts = f.meshes.map((m) => m.count);
  const first = f.meshes.map((m) => m.instanceMatrix.array.slice());
  const parent = new THREE.Group();
  const out = bakeStatic(root, parent);
  assert.equal(out.length, 0, 'no hay nada que juntar');
  assert.deepEqual(f.meshes.map((m) => m.count), counts);
  f.meshes.forEach((m, i) => {
    assert.ok(m.isInstancedMesh && m.userData.keep === true);
    assert.equal(m.parent, parent, 'se conserva tal cual');
    assert.deepEqual(m.instanceMatrix.array, first[i]);
    assert.ok(m.geometry.attributes.flowerColor && m.geometry.attributes.fMask && m.geometry.attributes.color);
  });
  assert.equal(parent.children.length, f.meshes.length, 'nada más: ni mallas fundidas ni copias');
});

test('flores: addFlowers devuelve update() y dispose() que libera las mallas y las geometrías clonadas, no el material', () => {
  const scene = new THREE.Scene();
  const g = addFlowers(scene, { bounds, heightAt, ok, rng: seededRng(3), level: 'medium', theme: day });
  const mat = flowerMaterial();
  assert.equal(scene.children.length, 1);
  // geometrías propias del campo: no las compartidas de la caché
  for (const m of g.meshes) assert.notEqual(m.geometry, flowerGeometry('medium', m.userData.species));
  const other = field(3, 'medium');
  let geoDisposed = 0, matDisposed = 0, instDisposed = 0;
  for (const m of g.meshes) {
    m.geometry.addEventListener('dispose', () => geoDisposed++);
    m.addEventListener('dispose', () => instDisposed++);
  }
  mat.addEventListener('dispose', () => matDisposed++);
  // update: lejos se esconde, cerca se ve
  g.update(new THREE.Vector3(500, 5, 500));
  assert.ok(g.meshes.every((m) => !m.visible));
  g.update(new THREE.Vector3(0, 3, 0));
  assert.ok(g.meshes.every((m) => m.visible));
  g.dispose();
  assert.equal(geoDisposed, g.meshes.length);
  assert.equal(instDisposed, g.meshes.length);
  assert.equal(matDisposed, 0);
  assert.equal(scene.children.length, 0);
  // otro campo no comparte búferes con el que se borró
  for (const m of other.meshes) assert.ok(m.geometry.attributes.flowerColor.array.length > 0);
  assert.ok(flowerGeometry('medium', 'daisy').attributes.position.count > 0);
  assert.equal(flowerGeometry('medium', 'daisy').attributes.flowerColor, undefined, 'la caché no recibe atributos de instancia');
});

test('flores: la calidad se acepta como nombre, preset del laboratorio o lod; la especie desconocida falla', () => {
  for (const [i, level] of LEVELS.entries()) {
    const n = field(9, level).stats.flowers;
    assert.equal(field(9, { level }).stats.flowers, n);
    assert.equal(field(9, { lod: i }).stats.flowers, n);
    assert.equal(field(9, i).stats.flowers, n);
  }
  assert.equal(field(9, 'nope').stats.level, 'medium');
  assert.throws(() => flowerGeometry('low', 'rosa'), /especie/);
});
