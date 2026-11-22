import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  makeGrassField, addGrass, grassTuftGeometry, grassMaterial, grassColorAt, grassGroundColor, grassAtlas, grassMixOf,
  GRASS_BUDGET, GRASS_FIELD_TRIS, GRASS_MAX_CALLS, GRASS_RNG_DRAWS, GRASS_CLEAR, GRASS_TALL, GRASS_SPECIES, GRASS_SPECIES_INFO,
  GRASS_ATLAS, GRASS_WIND_HEIGHT, tuftTriangles,
} from '../src/game/render/assets/grass.js';
import { isWindMaterial, windDisplacement, windSample, resetWind, setWind, triggerGust, updateWind } from '../src/game/render/assets/wind.js';
import { seededRng } from '../src/lab/assetRegistry.js';
import { THEMES } from '../src/game/themes.js';

const LEVELS = ['low', 'medium', 'high'];
const SEEDS = [1, 7, 42, 1234, 99991];

// Hoyo de prueba: pista de 6 x 24 m, tee pegado al borde (su círculo libre sale de la
// pista) y una charca fuera de la pista. Misma lógica de exclusión que environment.js
// pasa hoy a addGrassField: fuera del agua y a más de 1,2 m del tee.
const bounds = { minX: -3, maxX: 3, minZ: -12, maxZ: 12 };
const tee = [2.8, -11.8];
const waterY = -0.5;
const pond = { x: 7, z: 2, r: 2.5 };
const heightAt = (x, z) => (Math.hypot(x - pond.x, z - pond.z) < pond.r ? -1 : 0);
const ok = (x, z, y) => y > waterY + 0.18 && Math.hypot(x - tee[0], z - tee[1]) > 1.2;
const tint = [0x4f9a3a, 0x9fd36a];
const field = (seed = 1, level = 'medium', extra = {}) => makeGrassField({ bounds, heightAt, ok, rng: seededRng(seed), tint, level, ...extra });
const distBox = (x, z) => Math.hypot(Math.max(bounds.minX - x, 0, x - bounds.maxX), Math.max(bounds.minZ - z, 0, z - bounds.maxZ));
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const natural = Object.entries(THEMES).filter(([, t]) => !t.neon && !t.cyberCity && !t.lava && !t.caldera);

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
/** Todas las matas de un campo, de todas sus mallas (una por especie). */
function tufts(f) {
  const out = [];
  for (const mesh of f.meshes) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, _m);
      _m.decompose(_p, _q, _s);
      out.push({ mesh, i, species: mesh.userData.species, variant: mesh.userData.variants[i], x: _p.x, y: _p.y, z: _p.z, sy: _s.y, sx: _s.x, m: _m.clone() });
    }
  }
  return out;
}
const trisOf = (geo) => geo.index.count / 3;

/** Medidas de la forma de una mata (geometría sin escalar): alto, radio y altura media. */
function shape(geo) {
  const p = geo.attributes.position;
  let maxY = 0, reach = 0, sumY = 0;
  for (let i = 0; i < p.count; i++) {
    maxY = Math.max(maxY, p.getY(i));
    reach = Math.max(reach, Math.hypot(p.getX(i), p.getZ(i)));
    sumY += p.getY(i);
  }
  return { maxY, reach, meanY: sumY / p.count / maxY };
}

/** Piezas sueltas (tarjetas, hojas, briznas) de una geometría: componentes conexas por índice. */
function pieces(geo) {
  const parent = [...Array(geo.attributes.position.count).keys()];
  const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const idx = geo.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    parent[find(idx[i + 1])] = find(idx[i]);
    parent[find(idx[i + 2])] = find(idx[i]);
  }
  return new Set(parent.map((_, i) => find(i))).size;
}

// ---------- presupuesto ----------

test('césped: presupuesto de triángulos por calidad medido y como mucho 5 llamadas de dibujo por campo', () => {
  // presupuesto móvil: la textura aporta el detalle, no los triángulos
  assert.ok(GRASS_FIELD_TRIS.low <= 13500 && GRASS_FIELD_TRIS.medium <= 36000 && GRASS_FIELD_TRIS.high <= 70000);
  assert.ok(GRASS_MAX_CALLS <= 5);
  assert.ok(GRASS_BUDGET.low.tris <= GRASS_BUDGET.medium.tris && GRASS_BUDGET.medium.tris <= GRASS_BUDGET.high.tris);
  assert.ok(GRASS_BUDGET.low.maxTufts < GRASS_BUDGET.medium.maxTufts && GRASS_BUDGET.medium.maxTufts < GRASS_BUDGET.high.maxTufts, 'más matas cuanto más calidad');
  assert.equal(GRASS_BUDGET.low.textured, false, 'Bajo: sin textura recortada (sin sobrepintado en el móvil)');
  assert.equal(GRASS_BUDGET.medium.textured && GRASS_BUDGET.high.textured, true);
  for (const level of LEVELS) {
    assert.equal(tuftTriangles(level), GRASS_BUDGET[level].tris);
    assert.ok(GRASS_BUDGET[level].maxTufts * GRASS_BUDGET[level].tris <= GRASS_FIELD_TRIS[level], `${level}: el tope cabe en el presupuesto`);
    for (const sp of GRASS_SPECIES) {
      const geo = grassTuftGeometry(level, sp);
      assert.ok(trisOf(geo) <= GRASS_BUDGET[level].tris, `${level}/${sp}: ${trisOf(geo)} tri por mata`);
      assert.equal(tuftTriangles(level, sp), trisOf(geo));
    }
    for (const seed of SEEDS) {
      const f = field(seed, level);
      const meshes = [];
      f.group.traverse((o) => o.isMesh && meshes.push(o));
      assert.deepEqual(meshes, f.meshes, 'todas las mallas del grupo están en meshes');
      assert.ok(meshes.length >= 2 && meshes.length <= GRASS_MAX_CALLS, `${level} s${seed}: ${meshes.length} llamadas`);
      assert.ok(meshes.every((m) => m.isInstancedMesh), 'instanciado');
      assert.equal(new Set(meshes.map((m) => m.userData.species)).size, meshes.length, 'una malla por especie');
      assert.ok(meshes.every((m) => m.material === grassMaterial(level)), 'un solo material por calidad');
      const tris = meshes.reduce((a, m) => a + m.count * trisOf(m.geometry), 0);
      const verts = meshes.reduce((a, m) => a + m.count * m.geometry.attributes.position.count, 0);
      assert.ok(tris <= GRASS_FIELD_TRIS[level], `${level} s${seed}: ${tris} tri`);
      assert.equal(f.stats.triangles, tris);
      assert.equal(f.stats.vertices, verts);
      assert.equal(f.stats.calls, meshes.length);
      assert.equal(f.mesh, meshes[0]);
      // en un hoyo normal se llega al tope (el presupuesto se aprovecha)
      assert.ok(f.stats.tufts >= GRASS_BUDGET[level].maxTufts * 0.95, `${level} s${seed}: solo ${f.stats.tufts} matas`);
      assert.equal(f.stats.tufts, meshes.reduce((a, m) => a + m.count, 0));
    }
  }
  // la densidad del tema (nieve, arena...) recorta matas, nunca las sube
  const sparse = field(1, 'high', { density: 0.3 });
  assert.ok(sparse.stats.tufts <= Math.round(GRASS_BUDGET.high.maxTufts * 0.3));
  const none = field(1, 'high', { density: 0 });
  assert.equal(none.mesh, null);
  assert.deepEqual(none.meshes, []);
});

// ---------- especies y variantes ----------

test('césped: al menos 5 especies con formas distintas medidas, y piezas cruzadas en cada mata', () => {
  assert.ok(GRASS_SPECIES.length >= 5);
  for (const sp of ['fine', 'broad', 'clover', 'seed', 'dry', 'fern']) assert.ok(GRASS_SPECIES.includes(sp), sp);
  for (const level of LEVELS) {
    const shapes = Object.fromEntries(GRASS_SPECIES.map((sp) => [sp, shape(grassTuftGeometry(level, sp))]));
    for (let a = 0; a < GRASS_SPECIES.length; a++) {
      for (let b = a + 1; b < GRASS_SPECIES.length; b++) {
        const A = shapes[GRASS_SPECIES[a]], B = shapes[GRASS_SPECIES[b]];
        const rel = (k) => Math.abs(A[k] - B[k]) / Math.max(A[k], B[k]);
        const best = Math.max(rel('maxY'), rel('reach'), rel('meanY'));
        assert.ok(best >= 0.15, `${level}: ${GRASS_SPECIES[a]} y ${GRASS_SPECIES[b]} casi iguales (${best.toFixed(2)})`);
      }
    }
    for (const sp of GRASS_SPECIES) {
      const geo = grassTuftGeometry(level, sp);
      // el radio declarado de la especie (lo usan las zonas libres) cubre su geometría
      assert.ok(shapes[sp].reach <= GRASS_SPECIES_INFO[sp].reach + 1e-9, `${level}/${sp}: radio ${shapes[sp].reach.toFixed(3)}`);
      // frondosa: varias tarjetas/briznas por mata
      assert.ok(pieces(geo) >= 3, `${level}/${sp}: ${pieces(geo)} piezas`);
    }
    // de un vistazo: el trébol es bajo, la seca alta y el helecho ancho
    assert.ok(shapes.clover.maxY < shapes.fine.maxY && shapes.dry.maxY > shapes.broad.maxY && shapes.fern.reach > shapes.broad.reach, level);
  }
  // Alto suaviza la curva o añade tarjetas (más triángulos que Medio en cada especie)
  for (const sp of GRASS_SPECIES) assert.ok(tuftTriangles('high', sp) > tuftTriangles('medium', sp), sp);
});

test('césped: 2-3 variantes por especie elegidas con una tirada fija (tesela de la textura y proporciones)', () => {
  for (const sp of GRASS_SPECIES) assert.ok(GRASS_SPECIES_INFO[sp].variants.length >= 2 && GRASS_SPECIES_INFO[sp].variants.length <= 3, sp);
  for (const level of LEVELS) {
    const f = field(4, level);
    const rowStep = GRASS_ATLAS.tileH / GRASS_ATLAS.height;
    for (const mesh of f.meshes) {
      const vars = mesh.userData.variants, sp = mesh.userData.species;
      assert.equal(vars.length, mesh.count);
      if (mesh.count > 60) assert.ok(new Set(vars).size >= 2, `${level}/${sp}: una sola variante`);
      // la variante elige la fila del atlas en el sombreador (atributo por instancia)
      const attr = mesh.geometry.attributes.grassVar;
      assert.ok(attr?.isInstancedBufferAttribute, `${level}/${sp}: grassVar por instancia`);
      assert.equal(attr.count, mesh.count);
      for (let i = 0; i < mesh.count; i++) assert.ok(Math.abs(attr.getX(i) - vars[i] * rowStep) < 1e-6);
    }
    // y cambia las proporciones: el cociente alto/ancho medio de cada variante es distinto
    const by = new Map();
    for (const t of tufts(f)) {
      if (t.sy >= GRASS_TALL.minScaleY - 1e-6) continue;
      const k = `${t.species}:${t.variant}`;
      by.set(k, [...(by.get(k) ?? []), t.sy / t.sx]);
    }
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    for (const sp of GRASS_SPECIES) {
      const ms = [0, 1, 2].map((v) => by.get(`${sp}:${v}`)).filter((a) => a?.length > 20).map(mean);
      if (ms.length >= 2) assert.ok(Math.max(...ms) / Math.min(...ms) > 1.12, `${level}/${sp}: variantes con la misma proporción`);
    }
  }
});

test('césped: cada tema elige su reparto de especies (pradera mezcla, playa seca y alta, nieve escasa y apagada)', () => {
  const shareOf = (f) => {
    const n = {};
    for (const m of f.meshes) n[m.userData.species] = m.count / f.stats.tufts;
    return n;
  };
  // temas sin hierba: neón, ciudad, lava
  for (const t of Object.values(THEMES).filter((t) => t.neon || t.cyberCity || t.lava || t.caldera)) assert.equal(grassMixOf(t), null);
  for (const [id, t] of natural) {
    const mix = grassMixOf(t);
    assert.ok(mix, id);
    const species = Object.keys(mix.weights).filter((k) => mix.weights[k] > 0);
    assert.ok(species.every((s) => GRASS_SPECIES.includes(s)), id);
    assert.ok(species.includes(mix.tall), `${id}: las matas altas son de una especie del reparto`);
    assert.ok(species.length >= 3 && species.length <= GRASS_MAX_CALLS, `${id}: ${species.length} especies`);
    const f = field(3, 'high', { theme: t });
    assert.ok(f.meshes.length <= GRASS_MAX_CALLS, id);
    assert.ok(f.meshes.every((m) => species.includes(m.userData.species)), `${id}: solo especies de su reparto`);
  }
  assert.equal(grassMixOf(undefined).name, 'meadow', 'sin tema: la pradera');
  assert.equal(grassMixOf(THEMES.meadow).name, 'meadow');
  assert.equal(grassMixOf(THEMES.meadowDay).name, 'lush');
  assert.equal(grassMixOf(THEMES.jungle).name, 'jungle');
  assert.equal(grassMixOf(THEMES.beach).name, 'beach');
  assert.equal(grassMixOf(THEMES.beachNight).name, 'beach');
  assert.equal(grassMixOf(THEMES.canyon).name, 'desert');
  assert.equal(grassMixOf(THEMES.snow).name, 'snow');
  assert.equal(grassMixOf(THEMES.glacier).name, 'snow');
  assert.equal(grassMixOf(THEMES.autumn).name, 'autumn');
  assert.equal(grassMixOf({ ...THEMES.meadow, grassMix: 'beach' }).name, 'beach', 'el tema puede fijarlo');

  const meadow = shareOf(field(3, 'high', { theme: THEMES.meadow }));
  const beach = shareOf(field(3, 'high', { theme: THEMES.beach }));
  const jungle = shareOf(field(3, 'high', { theme: THEMES.jungle }));
  assert.ok(Object.keys(meadow).length === 5, 'pradera: mezcla de 5 especies');
  assert.ok((beach.dry ?? 0) > 0.4, `playa: seca ${(beach.dry ?? 0).toFixed(2)}`);
  assert.ok((jungle.fern ?? 0) > (meadow.fern ?? 0) * 1.5, 'jungla: más helecho');
  // las matas altas de la playa son de hierba seca; las de la pradera, de hierba ancha
  const tallSp = (t) => new Set(tufts(field(3, 'medium', { theme: t })).filter((m) => m.sy >= GRASS_TALL.minScaleY - 1e-6).map((m) => m.species));
  assert.deepEqual([...tallSp(THEMES.beach)], ['dry']);
  assert.deepEqual([...tallSp(THEMES.meadow)], ['broad']);
  // nieve: apagada (menos saturada que la misma hierba en la pradera)
  const sat = (f) => {
    const c = new THREE.Color(), hsl = {};
    let s = 0, n = 0;
    for (const m of f.meshes) for (let i = 0; i < m.count; i += 7) (m.getColorAt(i, c), (s += c.getHSL(hsl).s), n++);
    return s / n;
  };
  assert.ok(grassMixOf(THEMES.snow).muted > 0);
  assert.ok(sat(field(3, 'medium', { theme: THEMES.snow })) < sat(field(3, 'medium', { theme: THEMES.meadow })) * 0.8, 'nieve apagada');
  // el helecho va a la sombra (manchas oscuras) y la seca a los bordes y zonas secas
  const f = field(8, 'high', { theme: THEMES.jungle });
  const darkness = (t) => 1 - lum(grassColorAt(t.x, t.z, tint)) / lum(new THREE.Color(tint[1]));
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const all = tufts(f).filter((t) => t.sy < GRASS_TALL.minScaleY);
  assert.ok(avg(all.filter((t) => t.species === 'fern').map(darkness)) > avg(all.filter((t) => t.species !== 'fern').map(darkness)) + 0.01, 'helecho en las manchas oscuras');
  // «solo una especie» (laboratorio): misma siembra, una sola malla
  const solo = field(3, 'medium', { only: 'clover' });
  assert.equal(solo.meshes.length, 1);
  assert.equal(solo.mesh.userData.species, 'clover');
  assert.equal(solo.stats.tufts, field(3, 'medium').stats.tufts, 'mismos sitios');
});

// ---------- determinismo ----------

test('césped: determinista, tiradas fijas del rng del hoyo y Bajo ⊂ Medio ⊂ Alto por especie', () => {
  for (const level of LEVELS) {
    const a = field(5, level), b = field(5, level);
    assert.deepEqual(a.meshes.map((m) => m.userData.species), b.meshes.map((m) => m.userData.species));
    a.meshes.forEach((m, k) => {
      assert.deepEqual(m.instanceMatrix.array, b.meshes[k].instanceMatrix.array, level);
      assert.deepEqual(m.instanceColor.array, b.meshes[k].instanceColor.array, level);
      assert.deepEqual(m.userData.variants, b.meshes[k].userData.variants, level);
    });
    assert.notDeepEqual(field(6, level).mesh.instanceMatrix.array.slice(0, 64), a.mesh.instanceMatrix.array.slice(0, 64));
  }
  // el rng del hoyo pierde siempre las mismas tiradas: el resto del decorado no cambia con la calidad ni el tema
  const draws = (level, density = 1, okFn = ok, theme) => {
    let n = 0;
    const r = seededRng(11);
    makeGrassField({ bounds, heightAt, ok: okFn, rng: () => (n++, r()), tint, level, density, theme });
    return n;
  };
  for (const level of LEVELS) {
    assert.equal(draws(level), GRASS_RNG_DRAWS, level);
    assert.equal(draws(level, 0.25), GRASS_RNG_DRAWS, `${level} densidad baja`);
    assert.equal(draws(level, 1, () => false), GRASS_RNG_DRAWS, `${level} sin sitio`);
    for (const [id, t] of [...natural, ['neon', THEMES.neon]]) assert.equal(draws(level, 1, ok, t), GRASS_RNG_DRAWS, `${level} ${id}`);
  }
  // misma semilla: las matas de Bajo están en Medio y las de Medio en Alto (mismo sitio, giro, escala, especie y variante)
  const [lo, me, hi] = LEVELS.map((l) => field(9, l));
  const prefix = (small, big) => {
    for (const m of small.meshes) {
      const M = big.meshes.find((x) => x.userData.species === m.userData.species);
      assert.ok(M && M.count >= m.count, m.userData.species);
      assert.deepEqual(m.instanceMatrix.array.slice(0, m.count * 16), M.instanceMatrix.array.slice(0, m.count * 16));
      assert.deepEqual(m.userData.variants, M.userData.variants.slice(0, m.count));
    }
  };
  prefix(lo, me);
  prefix(me, hi);
});

// ---------- viento y material ----------

test('césped: viento compartido (capa grass, ráfagas viajeras), raíces quietas, uv y textura en Medio/Alto', () => {
  for (const level of LEVELS) {
    const m = grassMaterial(level);
    assert.equal(m, grassMaterial(level), 'un material por calidad, compartido');
    assert.ok(isWindMaterial(m), level);
    assert.equal(m.userData.wind.layer, 'grass');
    assert.equal(m.userData.wind.source, 'y', 'instanciado: altura local de la brizna');
    assert.equal(m.userData.wind.height, GRASS_WIND_HEIGHT);
    assert.ok(m.vertexColors);
    assert.equal(m.side, THREE.DoubleSide);
    const textured = GRASS_BUDGET[level].textured;
    assert.equal(!!m.map, textured, `${level}: textura de hoja`);
    if (textured) {
      assert.equal(m.map, grassAtlas(), 'un atlas para todas las especies');
      assert.ok(m.alphaTest > 0.3 && m.alphaTest < 0.7, 'silueta recortada');
      assert.equal(m.userData.keepUv, true, 'bakeStatic no le quita las uv');
    }
    const lib = THREE.ShaderLib.lambert;
    const sh = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
    m.onBeforeCompile(sh);
    assert.ok(sh.uniforms.uWind && sh.uniforms.uGust, 'uniformes del viento compartido');
    assert.match(sh.vertexShader, /gcbGust\(gwd, uGust\.x, uGust\.y\)/, 'ráfagas viajeras del paso 0');
    assert.match(sh.vertexShader, /transformed \+=/);
    assert.match(sh.vertexShader, /gcbGrassFade/, 'se apaga con la distancia');
    assert.match(sh.vertexShader, /attribute float grassVar;/);
    assert.match(sh.vertexShader, /vMapUv\.y \+= grassVar;/, 'la variante elige la fila del atlas');
    assert.match(sh.vertexShader, /#include <uv_vertex>/);
    assert.match(sh.vertexShader, /#include <project_vertex>/);
    assert.match(sh.fragmentShader, /gl_FrontFacing/, 'las dos caras con la normal hacia arriba');
    assert.doesNotMatch(sh.vertexShader + sh.fragmentShader, /NaN|undefined/);
    assert.equal((sh.vertexShader.match(/\{/g) ?? []).length, (sh.vertexShader.match(/\}/g) ?? []).length);
    for (const sp of GRASS_SPECIES) {
      // raíz en y = 0 (el viento la deja quieta), nada bajo el suelo ni por encima de la altura del viento
      const geo = grassTuftGeometry(level, sp);
      const p = geo.attributes.position, uv = geo.attributes.uv;
      let minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < p.count; i++) {
        minY = Math.min(minY, p.getY(i));
        maxY = Math.max(maxY, p.getY(i));
      }
      assert.equal(minY, 0, `${level}/${sp}`);
      assert.ok(maxY > 0.06 && maxY <= GRASS_WIND_HEIGHT * 1.05, `${level}/${sp}: alto ${maxY}`);
      // uv dentro de la columna de la especie en la primera fila del atlas (la fila la pone grassVar)
      assert.ok(uv && uv.count === p.count, `${level}/${sp}: uv`);
      const col = GRASS_SPECIES.indexOf(sp);
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i) * GRASS_ATLAS.width, v = uv.getY(i) * GRASS_ATLAS.height;
        assert.ok(u >= col * GRASS_ATLAS.tileW && u <= (col + 1) * GRASS_ATLAS.tileW && v >= 0 && v <= GRASS_ATLAS.tileH, `${level}/${sp}: uv fuera de su tesela`);
      }
    }
  }
  assert.notEqual(grassMaterial('low').customProgramCacheKey(), grassMaterial('high').customProgramCacheKey());
  // la ráfaga que viaja llega a la punta de la brizna y no a la raíz
  resetWind();
  setWind({ strength: 1, angle: 0, autoGusts: false });
  const s0 = windSample();
  const tip = (x) => windDisplacement({ x, y: 0.3, z: 0, h: 0.3, p0: 1, p1: 1, w: 1 }, 'grass', s0.t, s0);
  assert.equal(windDisplacement({ x: 0, y: 0, z: 0, h: 0, p0: 1, p1: 1, w: 1 }, 'grass', 0, s0).x, 0);
  triggerGust({ amp: 1 });
  for (let k = 0; k < 40; k++) updateWind(0.05);
  const s1 = windSample();
  const front = s1.gusts[0].front;
  const at = (x) => Math.abs(windDisplacement({ x, y: 0.3, z: 0, h: 0.3, p0: 1, p1: 1, w: 1 }, 'grass', s1.t, s1).x);
  assert.ok(at(front) > at(front + 40) * 1.5, 'el frente de la ráfaga mueve más');
  assert.ok(Number.isFinite(tip(0).x));
  resetWind();
});

// ---------- textura ----------

test('césped: atlas de hojas pintado en código (6 especies x 3 variantes), con detalle, silueta y mipmaps que no adelgazan', () => {
  const tex = grassAtlas();
  assert.equal(tex, grassAtlas(), 'se pinta una vez');
  assert.ok(tex.isDataTexture);
  const { width: W, height: H, tileW: TW, tileH: TH, margin } = GRASS_ATLAS;
  assert.equal(tex.image.width, W);
  assert.equal(tex.image.height, H);
  assert.ok(GRASS_SPECIES.length * TW <= W && 3 * TH <= H);
  assert.equal(tex.colorSpace, THREE.SRGBColorSpace);
  assert.equal(tex.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(tex.generateMipmaps, false, 'mipmaps propios');
  assert.equal(tex.mipmaps.at(-1).width, 1);
  assert.equal(tex.mipmaps.at(-1).height, 1);
  assert.equal(tex.mipmaps[0].data, tex.image.data);
  const bytes = tex.mipmaps.reduce((a, m) => a + m.data.length, 0);
  assert.ok(bytes < 1.2 * 1024 * 1024, `memoria del atlas: ${bytes} bytes`);
  const d = tex.image.data;
  const tiles = [];
  const tileStats = (mip, col, row) => {
    const k = W / mip.width, tw = TW / k, th = TH / k;
    let n = 0, op = 0;
    const mask = [];
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const i = ((row * th + y) * mip.width + col * tw + x) * 4;
        n++;
        const on = mip.data[i + 3] >= 128;
        if (on) op++;
        mask.push(on);
      }
    }
    return { coverage: op / n, mask };
  };
  for (let col = 0; col < GRASS_SPECIES.length; col++) {
    for (let row = 0; row < 3; row++) {
      const sp = GRASS_SPECIES[col];
      const lums = [], bottom = [], top = [];
      let edge = 0;
      for (let y = 0; y < TH; y++) {
        for (let x = 0; x < TW; x++) {
          const i = ((row * TH + y) * W + col * TW + x) * 4;
          if (d[i + 3] < 128) continue;
          if (x < margin || x >= TW - margin || y < margin || y >= TH - margin) edge++;
          const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
          lums.push(l);
          if (y < TH / 3) bottom.push(l);
          else if (y >= (2 * TH) / 3) top.push(l);
        }
      }
      const { coverage, mask } = tileStats(tex.mipmaps[0], col, row);
      assert.equal(edge, 0, `${sp} v${row}: borde transparente (sin sangrado entre teselas)`);
      assert.ok(coverage > 0.06 && coverage < 0.75, `${sp} v${row}: cobertura ${coverage.toFixed(2)}`);
      const mean = lums.reduce((a, b) => a + b, 0) / lums.length;
      const sd = Math.sqrt(lums.reduce((a, b) => a + (b - mean) ** 2, 0) / lums.length);
      assert.ok(sd > 0.04, `${sp} v${row}: detalle (nervio, degradado, tonos): sd ${sd.toFixed(3)}`);
      const avg = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
      if (bottom.length > 20 && top.length > 20) assert.ok(avg(top) > avg(bottom), `${sp} v${row}: base más oscura que la punta`);
      // con mipmaps, la silueta no adelgaza hasta desaparecer (cobertura conservada)
      const c2 = tileStats(tex.mipmaps[2], col, row).coverage;
      assert.ok(c2 > coverage * 0.7 && c2 < coverage * 1.5, `${sp} v${row}: mip 2 cubre ${c2.toFixed(2)} (base ${coverage.toFixed(2)})`);
      // más lejos (mip 4, tesela de 4 x 8 px) la media simple la borra del todo; la propia no
      const c4 = tileStats(tex.mipmaps[4], col, row).coverage;
      assert.ok(c4 > coverage * 0.7 && c4 < coverage * 1.5, `${sp} v${row}: mip 4 cubre ${c4.toFixed(2)} (base ${coverage.toFixed(2)})`);
      tiles.push({ id: `${sp} v${row}`, mask });
    }
  }
  // todas las teselas distintas entre sí (cada especie y variante, su dibujo)
  for (let a = 0; a < tiles.length; a++) {
    for (let b = a + 1; b < tiles.length; b++) {
      let diff = 0;
      for (let i = 0; i < tiles[a].mask.length; i++) if (tiles[a].mask[i] !== tiles[b].mask[i]) diff++;
      assert.ok(diff / tiles[a].mask.length > 0.04, `${tiles[a].id} y ${tiles[b].id} casi iguales`);
    }
  }
});

// ---------- zonas libres ----------

test('césped: nada en la pista (bola), ni junto al tee, ni en el agua; las matas altas, más lejos', () => {
  const tipLean = (() => {
    // viento nominal con una ráfaga encima: lo que se tumba la punta más alta (m)
    const st = { strength: 1, dirX: 1, dirZ: 0, gusts: [{ front: 0, amp: 1 }] };
    let max = 0;
    for (let t = 0; t < 6; t += 0.1) {
      const d = windDisplacement({ x: 0, y: GRASS_WIND_HEIGHT, z: 0, h: GRASS_WIND_HEIGHT, p0: 0.5, p1: 2, w: 1 }, 'grass', t, st);
      max = Math.max(max, Math.hypot(d.x, d.z));
    }
    return max;
  })();
  assert.ok(GRASS_CLEAR.leaf > tipLean + 0.02, 'el margen de las hojas cubre lo que tumba el viento');
  const themes = [undefined, THEMES.jungle, THEMES.beach];
  for (const level of LEVELS) {
    for (const seed of SEEDS) {
      const theme = themes[seed % themes.length];
      const f = field(seed, level, { theme });
      const v = new THREE.Vector3();
      let tall = 0;
      const tallSpecies = grassMixOf(theme).tall;
      for (const t of tufts(f)) {
        const d = distBox(t.x, t.z);
        assert.ok(d >= GRASS_CLEAR.course, `${level} s${seed}: mata a ${d.toFixed(2)} m de la pista`);
        assert.ok(d <= 15 + 1e-6, 'dentro del alcance');
        assert.ok(ok(t.x, t.z, heightAt(t.x, t.z)), `${level} s${seed}: mata en zona prohibida (${t.x.toFixed(2)}, ${t.z.toFixed(2)})`);
        assert.ok(Math.abs(t.y - (heightAt(t.x, t.z) - 0.01)) < 1e-5, 'apoyada en el suelo');
        if (t.sy > GRASS_TALL.minScaleY - 1e-6) {
          tall++;
          assert.ok(d >= GRASS_TALL.band[0] && d <= GRASS_TALL.band[1], `${level} s${seed}: mata alta a ${d.toFixed(2)} m`);
          assert.equal(t.species, tallSpecies, 'matas altas: la especie de borde del tema');
        }
        // ningún vértice (con el viento nominal encima) pisa la pista
        const p = t.mesh.geometry.attributes.position;
        for (let k = 0; k < p.count; k++) {
          v.fromBufferAttribute(p, k).applyMatrix4(t.m);
          const dv = distBox(v.x, v.z);
          assert.ok(dv >= GRASS_CLEAR.leaf - 1e-6 && dv > tipLean + 0.02, `${level} s${seed}: ${t.species} a ${dv.toFixed(2)} m de la pista`);
        }
      }
      assert.ok(tall > 0, `${level} s${seed}: hay matas altas junto a la pista`);
      assert.equal(f.stats.tall, tall);
    }
  }
});

// ---------- color ----------

test('césped: manchas de color según la posición en el mundo, suaves y compartidas con el suelo', () => {
  const samples = [];
  const hsl = { h: 0, s: 0, l: 0 };
  for (let x = -40; x <= 40; x += 4) for (let z = -40; z <= 40; z += 4) samples.push(grassColorAt(x, z, tint));
  const ls = samples.map(lum), hs = samples.map((c) => c.getHSL(hsl).h);
  const mean = ls.reduce((a, b) => a + b, 0) / ls.length;
  const sd = Math.sqrt(ls.reduce((a, b) => a + (b - mean) ** 2, 0) / ls.length);
  assert.ok(sd / mean > 0.06, `no uniforme: desviación ${(sd / mean).toFixed(3)}`);
  assert.ok(Math.max(...hs) - Math.min(...hs) > 0.02, 'zonas más amarillas y más verdes (cambia el tono)');
  // suave: a 20 cm el color casi no cambia (manchas, no ruido)
  for (let i = 0; i < 50; i++) {
    const x = i * 1.37 - 30, z = i * 0.71 - 15;
    const a = grassColorAt(x, z, tint), b = grassColorAt(x + 0.2, z, tint);
    assert.ok(Math.abs(lum(a) - lum(b)) < 0.02, 'sin saltos bruscos');
  }
  // determinista y sin rng: el suelo puede pedir el mismo color
  assert.deepEqual(grassColorAt(3.3, -7.1, tint).toArray(), grassColorAt(3.3, -7.1, tint).toArray());
  const g = grassGroundColor(3.3, -7.1, tint), c = grassColorAt(3.3, -7.1, tint);
  assert.ok(lum(g) < lum(c), 'el suelo, algo más oscuro que la brizna');
  assert.ok(Math.abs(g.getHSL({}).h - c.getHSL({}).h) < 1e-6, 'mismo tono: combinan');
  // cada mata toma el color de su sitio (con un pequeño toque propio y el de su especie)
  const f = field(3, 'medium');
  const col = new THREE.Color();
  const ratios = [];
  for (const t of tufts(f)) {
    t.mesh.getColorAt(t.i, col);
    const ref = grassColorAt(t.x, t.z, tint);
    ratios.push(lum(col) / lum(ref));
    if (GRASS_SPECIES_INFO[t.species].dry === 0) assert.ok(Math.abs(col.getHSL({}).h - ref.getHSL({}).h) < 0.04, `${t.species}: mismo tono que su sitio`);
  }
  assert.ok(Math.min(...ratios) > 0.7 && Math.max(...ratios) < 1.25, `toque propio pequeño: ${Math.min(...ratios).toFixed(2)}..${Math.max(...ratios).toFixed(2)}`);
});

test('césped: punta más clara y base en sombra en cada especie, normales hacia arriba', () => {
  for (const level of LEVELS) {
    for (const sp of GRASS_SPECIES) {
      const geo = grassTuftGeometry(level, sp);
      const p = geo.attributes.position, c = geo.attributes.color, n = geo.attributes.normal;
      const sumC = (i) => c.getX(i) + c.getY(i) + c.getZ(i);
      let lowC = 0, lowN = 0, highC = 0, highN = 0, maxY = 0;
      for (let i = 0; i < p.count; i++) maxY = Math.max(maxY, p.getY(i));
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) < 1e-6) (lowC += sumC(i)), lowN++;
        if (p.getY(i) > maxY * 0.7) (highC += sumC(i)), highN++;
        assert.ok(n.getY(i) > 0.8, `${level}/${sp}: normales casi hacia arriba (se ilumina como el suelo)`);
      }
      assert.ok(lowN > 0 && highN > 0);
      assert.ok(highC / highN > (lowC / lowN) * 1.3, `${level}/${sp}: punta más clara que la base`);
    }
  }
});

// ---------- en la escena ----------

test('césped: addGrass añade un solo grupo a la escena y esconde de lejos cada malla', () => {
  const scene = new THREE.Scene();
  const g = addGrass(scene, { bounds, heightAt, ok, rng: seededRng(2), tint, level: 'low' });
  assert.equal(scene.children.length, 1);
  assert.ok(g.meshes.length >= 2 && g.meshes.length <= GRASS_MAX_CALLS);
  assert.equal(g.mesh, g.meshes[0]);
  for (const m of g.meshes) {
    assert.equal(m.frustumCulled, true);
    assert.ok(m.boundingSphere, 'esfera de las matas para descartar el campo fuera de cámara');
  }
  g.update(new THREE.Vector3(0, 2, 0));
  assert.ok(g.meshes.every((m) => m.visible));
  g.update(new THREE.Vector3(500, 2, 0));
  assert.ok(g.meshes.every((m) => !m.visible));
  assert.equal(addGrass(new THREE.Scene(), { bounds, heightAt, ok, rng: seededRng(2), tint, level: 'low', density: 0 }), null);
  assert.equal(addGrass(new THREE.Scene(), { bounds, heightAt, ok, rng: seededRng(2), tint, level: 'low', theme: THEMES.neon }), null, 'neón: sin hierba');
});

test('cada campo tiene su propia geometría: grassVar de un campo no pisa al de otro', () => {
  for (const level of LEVELS) {
    for (const sp of GRASS_SPECIES) {
      const a = field(1, level, { only: sp }), b = field(7, level, { only: sp, density: 0.5 });
      const ma = a.meshes.find((m) => m.userData.species === sp), mb = b.meshes.find((m) => m.userData.species === sp);
      assert.ok(ma && mb, `${level}/${sp}: ambos campos tienen malla`);
      assert.notEqual(ma.geometry, mb.geometry, `${level}/${sp}: geometría compartida entre campos`);
      assert.notEqual(ma.count, mb.count, `${level}/${sp}: se necesitan campos con distinto nº de matas`);
      for (const m of [ma, mb]) {
        assert.equal(m.geometry.getAttribute('grassVar').count, m.count, `${level}/${sp}: grassVar no coincide con las instancias`);
      }
    }
  }
});

test('addGrass devuelve dispose() que libera las mallas del campo y no toca material ni atlas compartidos', () => {
  const scene = new THREE.Scene();
  const g = addGrass(scene, { bounds, heightAt, ok, rng: seededRng(3), tint, level: 'medium' });
  const mat = grassMaterial('medium');
  let geoDisposed = 0, matDisposed = 0;
  for (const m of g.meshes) m.geometry.addEventListener('dispose', () => geoDisposed++);
  mat.addEventListener('dispose', () => matDisposed++);
  assert.equal(typeof g.dispose, 'function');
  g.dispose();
  assert.equal(geoDisposed, g.meshes.length);
  assert.equal(matDisposed, 0);
  assert.equal(scene.children.length, 0);
});
