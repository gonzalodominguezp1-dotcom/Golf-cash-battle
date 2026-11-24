import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  addWater, makeLake, makeRiverWater, makeWater, makeReeds, makeLilyPad, shoreMaterial, waterMaterial, waterShaderSource,
  waterNormalData, waterNormalMipmaps, waterNormalMap, waterSupported, waterPalette, waterFresnel, waterFoam, shoreDistance,
  skyReflection, waterScroll, riverHalfWidth, reedTriangles, padTriangles, waterSwell, waterSwellSlope, swellWaves, swellMaxAmp, swellVertexScale,
  WATER_BUDGET, WATER_MAX_TRIS, WATER_MAX_CALLS, WATER_NORMAL_MAP, WATER_TIME_WRAP, WATER_RENDER_ORDER, WATER_FRESNEL,
  WATER_FOAM, WATER_SAMPLES, WATER_RIPPLES, rippleAge, rippleRadius, rippleCount, rippleRows, waterRipple, waterRippleField, setWaterRipples, WATER_SWELL, WATER_SHORE, RIVER_FLOW, SHORE_BUDGET, SHORE_MAX_CALLS, SHORE_RNG_DRAWS, REED_WIND, PAD_SWAY,
} from '../src/game/render/assets/water.js';
import { isWindMaterial, windDisplacement, windSample, windUniforms, resetWind, setWind, triggerGust, updateWind, prepareWind } from '../src/game/render/assets/wind.js';
import { bakeStatic } from '../src/game/render/batch.js';
import { makeRiver, warpCoord } from '../src/game/render/flora.js';
import { seededRng } from '../src/lab/assetRegistry.js';
import { THEMES } from '../src/game/themes.js';
import { TAU } from '../src/game/render/assets/treeKit.js';

// Agua del estilo liso (paso 8): lago y río con un material compartido, mapa de normales
// pintado en JS, fresnel con el cielo, brillo del sol, espuma por distancia a la orilla
// (sin textura de profundidad) y juncos/nenúfares con el viento compartido. Ver assets/water.js.

const LEVELS = ['low', 'medium', 'high'];
const day = THEMES.meadowDay;
const SIZE = 220;

// ---------- terreno de prueba ----------
// Pista de 6 x 24 m a ras de suelo con un río real (flora.makeRiver) y dos charcas lejos del
// río: una taza (fondo plano, orilla de 8 a 16 m) y un cono de pendiente fija 0,2 (la orilla
// está a 5 m del centro: la distancia de verdad a la orilla se conoce en cada punto).
const bounds = { minX: -3, maxX: 3, minZ: -12, maxZ: 12 };
const river = Object.freeze(makeRiver(bounds, day, seededRng(3), { grounded: true, enabled: true }));
const Y = river.y; // nivel del agua (a ras de suelo, el del río)
const BOWL = { x: 42, z: 25, r0: 8, r1: 16 };
const CONE = { x: 30, z: -30, r: 5, slope: 0.2 };
const base = (x, z) => {
  let h = -0.04;
  const rb = Math.hypot(x - BOWL.x, z - BOWL.z);
  h = Math.min(h, Y - 1.2 + 3 * THREE.MathUtils.smoothstep(rb, BOWL.r0, BOWL.r1));
  const rc = Math.hypot(x - CONE.x, z - CONE.z);
  h = Math.min(h, Y - CONE.r * CONE.slope + CONE.slope * rc);
  return h;
};
const heightAt = (x, z) => river.carve(x, z, base(x, z));
const warp = (u, half) => warpCoord(u, half);
const water = (level = 'medium', extra = {}) => {
  const scene = new THREE.Scene();
  const w = addWater(scene, { size: SIZE, y: Y, heightAt, river, level, theme: day, warp, ...extra });
  return { scene, w };
};

const tris = (mesh) => (mesh ? (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3 : 0);
const attr = (mesh, name) => mesh.geometry.getAttribute(name);
function triangles(mesh) {
  const idx = mesh.geometry.index.array, p = mesh.geometry.attributes.position;
  const out = [];
  for (let i = 0; i < idx.length; i += 3) out.push([idx[i], idx[i + 1], idx[i + 2]]);
  return { out, p };
}
const worldOf = (mesh, i) => new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i).add(mesh.position);

// ---------- presupuesto ----------

test('agua: presupuesto por calidad (constantes) y triángulos medidos dentro', () => {
  assert.deepEqual(Object.keys(WATER_BUDGET), LEVELS);
  assert.equal(WATER_MAX_CALLS, 2);
  // el tope es exacto: rejilla entera del lago + cinta del río a lo largo de los 220 m
  for (const level of LEVELS) {
    const B = WATER_BUDGET[level];
    const bound = B.lakeSeg * B.lakeSeg * 2 + Math.ceil(SIZE / B.riverStep) * B.riverCross * 2;
    assert.equal(WATER_MAX_TRIS[level], bound, level);
    // nunca más que el agua de hoy (plano de 90 x 90: 16 200 triángulos) en ninguna calidad
    assert.ok(WATER_MAX_TRIS[level] <= 16200, `${level}: ${WATER_MAX_TRIS[level]}`);
  }
  assert.deepEqual(LEVELS.map((l) => WATER_BUDGET[l].samples), [0, 1, 3]);
  assert.deepEqual(LEVELS.map((l) => WATER_BUDGET[l].swell), [0, 1, 2]);
  const counts = LEVELS.map((level) => {
    const { w } = water(level);
    assert.ok(w.stats.triangles <= WATER_MAX_TRIS[level], `${level}: ${w.stats.triangles}`);
    assert.equal(w.stats.triangles, tris(w.lake) + tris(w.river));
    assert.ok(w.meshes.length >= 1 && w.meshes.length <= WATER_MAX_CALLS);
    assert.equal(w.stats.calls, w.meshes.length);
    return w.stats.triangles;
  });
  assert.ok(counts[0] < counts[1] && counts[1] < counts[2], counts.join(' < '));
});

test('agua: el lago solo lleva los triángulos con agua (lo seco se quita)', () => {
  const dry = makeLake({ size: SIZE, y: 0, heightAt: () => 1, level: 'medium', theme: day });
  assert.equal(dry, null);
  const wet = makeLake({ size: SIZE, y: 0, heightAt: () => -2, level: 'medium', theme: day });
  assert.equal(tris(wet), WATER_BUDGET.medium.lakeSeg ** 2 * 2);
  const { w } = water('medium');
  assert.ok(tris(w.lake) > 0 && tris(w.lake) < WATER_BUDGET.medium.lakeSeg ** 2 * 2 * 0.2, `lago: ${tris(w.lake)}`);
  // cada triángulo que queda tiene algún vértice con agua (o casi): nada pinta sobre tierra seca
  const { out } = triangles(w.lake);
  const sh = attr(w.lake, 'waterShore');
  for (const t of out) assert.ok(t.some((i) => sh.getX(i) > -0.25 - 1e-6), 'triángulo seco');
});

test('agua: superficie lisa y mirando arriba (sin facetas, sin flatShading)', () => {
  const { w } = water('high');
  for (const m of w.meshes) {
    assert.ok(m.geometry.index, 'malla con índice (vértices compartidos)');
    assert.notEqual(m.material.flatShading, true);
    const { out, p } = triangles(m);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (const [i, j, k] of out) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, j);
      c.fromBufferAttribute(p, k);
      assert.equal(a.y, 0);
      const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
      assert.ok(ny > 0, `${m.name}: triángulo del revés`);
    }
  }
});

// ---------- determinismo ----------

test('agua: sin azar: mismas entradas, misma geometría; no recibe rng', () => {
  const a = water('medium').w, b = water('medium').w;
  for (const k of ['lake', 'river']) {
    for (const name of ['position', 'waterUv', 'waterFlow', 'waterShore']) {
      assert.deepEqual(Array.from(attr(a[k], name).array), Array.from(attr(b[k], name).array), `${k}.${name}`);
    }
    assert.deepEqual(Array.from(a[k].geometry.index.array), Array.from(b[k].geometry.index.array));
  }
  let draws = 0;
  water('medium', { rng: () => (draws++, 0.5) });
  assert.equal(draws, 0);
});

// ---------- mapa de normales ----------

test('agua: mapa de normales generado en JS, unitario, sin inclinación media, con relieve y repetible', () => {
  const { size, data } = waterNormalData();
  assert.equal(size, WATER_NORMAL_MAP.size);
  assert.equal(size, 128);
  assert.equal(data.length, size * size * 4);
  const dec = (i) => [data[i] / 127.5 - 1, data[i + 1] / 127.5 - 1, data[i + 2] / 127.5 - 1];
  let mx = 0, my = 0, sxy = 0, amin = 255, amax = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [x, y, z] = dec(i);
    const len = Math.hypot(x, y, z);
    assert.ok(Math.abs(len - 1) < 0.02, `texel ${i / 4}: |n| = ${len}`);
    assert.ok(z > 0.4, `texel ${i / 4}: z = ${z}`);
    mx += x;
    my += y;
    sxy += x * x + y * y;
    amin = Math.min(amin, data[i + 3]);
    amax = Math.max(amax, data[i + 3]);
  }
  const n = size * size;
  assert.ok(Math.abs(mx / n) < 0.01 && Math.abs(my / n) < 0.01, `media ${mx / n}, ${my / n}`);
  const rms = Math.sqrt(sxy / n);
  assert.ok(rms > 0.2 && rms < 0.5, `relieve rms ${rms}`);
  // alfa = ruido de la espuma: cubre casi todo el rango
  assert.ok(amin < 40 && amax > 215, `alfa ${amin}..${amax}`);
  // se repite sin costura: el salto entre la última y la primera columna/fila es como el de dentro
  const at = (x, y) => dec(((y % size) * size + (x % size)) * 4);
  const jump = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  let inner = 0, seam = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size - 1; x++) inner = Math.max(inner, jump(at(x, y), at(x + 1, y)));
    seam = Math.max(seam, jump(at(size - 1, y), at(0, y)), jump(at(y, size - 1), at(y, 0)));
  }
  assert.ok(seam <= inner * 1.05, `costura ${seam} frente a ${inner}`);
  // determinista
  assert.deepEqual(Array.from(waterNormalData().data), Array.from(data));
});

test('agua: mipmaps propios hasta 1 x 1 que aplanan las olas de lejos', () => {
  const { size, data } = waterNormalData();
  const mips = waterNormalMipmaps(data, size);
  assert.equal(mips.length, Math.log2(size) + 1);
  let prev = Infinity;
  mips.forEach((m, L) => {
    assert.equal(m.width, size >> L);
    assert.equal(m.height, size >> L);
    assert.equal(m.data.length, m.width * m.height * 4);
    let s = 0;
    for (let i = 0; i < m.data.length; i += 4) s += Math.hypot(m.data[i] / 127.5 - 1, m.data[i + 1] / 127.5 - 1);
    const meanXY = s / (m.width * m.height);
    assert.ok(meanXY <= prev + 0.01, `mip ${L}: ${meanXY} > ${prev}`);
    prev = meanXY;
  });
  assert.ok(prev < 0.05, `mip 1 x 1 casi plano: ${prev}`);
  const tex = waterNormalMap();
  assert.ok(tex.isDataTexture);
  assert.equal(tex, waterNormalMap(), 'una sola textura compartida');
  assert.equal(tex.generateMipmaps, false);
  assert.equal(tex.mipmaps.length, mips.length);
  assert.equal(tex.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(tex.wrapS, THREE.RepeatWrapping);
  assert.equal(tex.wrapT, THREE.RepeatWrapping);
  assert.equal(tex.colorSpace, THREE.NoColorSpace, 'datos lineales, no color');
  const bytes = tex.mipmaps.reduce((s, m) => s + m.data.length, 0);
  assert.ok(bytes < 90000, `${bytes} B`);
});

// ---------- fresnel, cielo, espuma ----------

test('agua: fresnel (Schlick) y reflejo del cielo como funciones puras', () => {
  assert.ok(Math.abs(waterFresnel(1) - WATER_FRESNEL.f0) < 1e-9);
  assert.ok(Math.abs(waterFresnel(0) - 1) < 1e-9);
  let prev = 2;
  for (let c = 0; c <= 1.0001; c += 0.05) {
    const f = waterFresnel(c);
    assert.ok(f <= prev + 1e-12);
    prev = f;
  }
  // mirando de lado se refleja mucho más que mirando desde arriba
  assert.ok(waterFresnel(Math.cos(1.4)) > 10 * waterFresnel(1));
  const top = new THREE.Color(0x2f8fe3), hor = new THREE.Color(0xcdeedd);
  const near = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 1e-9;
  assert.ok(near(skyReflection(0, top, hor), hor));
  assert.ok(near(skyReflection(1, top, hor), top));
  assert.ok(near(skyReflection(-0.5, top, hor), hor));
  assert.ok(skyReflection(0.3, top, hor).b > hor.b, 'hacia arriba, más azul');
});

test('agua: espuma en la orilla según la distancia a la costa (función pura)', () => {
  for (const noise of [0, 0.3, 0.5, 0.8, 1]) {
    let prev = 2;
    for (let d = 0; d <= WATER_FOAM.width + 0.5; d += 0.05) {
      const f = waterFoam(d, noise);
      assert.ok(f >= 0 && f <= 1);
      assert.ok(f <= prev + 1e-12, `sube con la distancia (n ${noise}, d ${d})`);
      prev = f;
    }
    assert.equal(waterFoam(WATER_FOAM.width, noise), 0);
    assert.equal(waterFoam(WATER_FOAM.width * 3, noise), 0);
  }
  assert.ok(waterFoam(0, 0.5) > 0.9, 'en la misma orilla, espuma');
  // el ruido la rompe a media distancia
  assert.ok(waterFoam(WATER_FOAM.width * 0.5, 0.9) > waterFoam(WATER_FOAM.width * 0.5, 0.1) + 0.2);
  // distancia = profundidad / pendiente, con tope
  assert.ok(Math.abs(shoreDistance(0.5, 0.25) - 2) < 1e-9);
  assert.ok(shoreDistance(-0.2, 0.5) < 0, 'en seco, negativa');
  assert.ok(shoreDistance(0.5, 0) < Infinity);
});

test('agua: la distancia a la orilla del vértice es la de verdad (cono de pendiente conocida)', () => {
  const lake = makeLake({ size: SIZE, y: Y, heightAt, level: 'high', theme: day, warp });
  const sh = attr(lake, 'waterShore');
  let n = 0;
  for (let i = 0; i < sh.count; i++) {
    const p = worldOf(lake, i);
    const r = Math.hypot(p.x - CONE.x, p.z - CONE.z);
    if (r > CONE.r - 0.3 || r < 0.6) continue;
    const truth = CONE.r - r; // m hasta la orilla
    assert.ok(Math.abs(sh.getY(i) - truth) < 0.1 * truth + 0.05, `r ${r.toFixed(2)}: ${sh.getY(i)} vs ${truth}`);
    assert.ok(Math.abs(sh.getX(i) - truth * CONE.slope) < 1e-4, 'profundidad');
    n++;
  }
  assert.ok(n >= 4, `vértices medidos: ${n}`);
});

// ---------- sombreador ----------

test('agua: el sombreador (texto) usa normal-map según calidad, fresnel, sol, espuma sin textura de profundidad', () => {
  const count = (s, re) => (s.match(re) ?? []).length;
  LEVELS.forEach((level, i) => {
    const { vertexShader: vs, fragmentShader: fs } = waterShaderSource(level);
    assert.equal(count(fs, /texture2D\(/g), WATER_BUDGET[level].samples, `${level}: muestras`);
    assert.equal(WATER_BUDGET[level].samples, [0, 1, 3][i]);
    assert.equal(count(vs, /sin\(p\)/g), [0, 1, 2][i], `${level}: ondas del oleaje`);
    assert.equal(count(vs, /attribute float waterSwell/g), i ? 1 : 0);
    // el oleaje desplaza el vértice y la normal lleva su derivada analítica (vSwell.xy)
    if (i) {
      assert.match(vs, /wp\.y \+= swH \* waterSwell/);
      assert.match(vs, /swG \+= .*cos\(p\)/);
      assert.match(fs, /N = normalize\(vec3\(g\.x - vSwell\.x, 1\.0, g\.y - vSwell\.y\)\)/);
      assert.match(fs, /\(1\.0 \+ [\d.]+ \* vSwell\.z\)/, 'brillo modulado por la cresta');
    } else assert.doesNotMatch(vs + fs, /swell|swH/i, 'Bajo: sin oleaje');
    assert.match(fs, /directionalLights\[0\]/);
    assert.match(fs, new RegExp(`${WATER_FRESNEL.f0}`));
    assert.match(fs, /pow\(1\.0 - /);
    assert.match(fs, /reflect\(/);
    assert.match(fs, /waterShore|vShore/);
    assert.match(vs, /attribute vec2 waterShore/);
    assert.match(vs, /attribute vec3 waterFlow/);
    assert.match(vs, /uWind/);
    assert.doesNotMatch(fs + vs, /depthTexture|tDepth|sampler2D\s+\w*[Dd]epth|readDepth/);
    assert.match(fs, /#include <fog_fragment>/);
    assert.match(fs, /#include <tonemapping_fragment>/);
    assert.match(fs, /#include <colorspace_fragment>/);
  });
  assert.doesNotMatch(waterShaderSource('low').fragmentShader, /uNormalMap/);
  // Alto: tres lecturas cruzadas, con tamaños y sentidos distintos
  assert.equal(WATER_SAMPLES.length, 3);
  const dir = (s) => Math.atan2(s.cycles[1], s.cycles[0]);
  for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
    const A = WATER_SAMPLES[a], B = WATER_SAMPLES[b];
    assert.notEqual(A.tile, B.tile);
    const d = Math.abs(dir(A) - dir(B));
    assert.ok(Math.min(d, 2 * Math.PI - d) > 0.5, `sentidos distintos ${a}-${b}`);
  }
  // el normal-map va ~1,5 x más vivo que antes (22,9 y -31,40 vueltas por hora)
  assert.ok(Math.hypot(...WATER_SAMPLES[0].cycles) >= 1.4 * Math.hypot(22, 9) && Math.hypot(...WATER_SAMPLES[1].cycles) >= 1.4 * Math.hypot(-31, 40));
  // la media de las lecturas (suma xy - n/2)
  assert.match(waterShaderSource('high').fragmentShader, /vec2 d = \(sa\.xy \+ sb\.xy \+ sc\.xy\) - 1\.5;/);
  assert.match(waterShaderSource('medium').fragmentShader, /vec2 d = sa\.xy \* 2\.0 - 1\.0;/);
});

test('agua: material compartido (lago y río), transparente con escritura de profundidad y tiempo del viento', () => {
  const { w } = water('medium');
  assert.ok(w.lake && w.river);
  assert.equal(w.lake.material, w.river.material, 'lago y río, mismo material');
  assert.equal(w.material, w.lake.material);
  assert.equal(waterMaterial('medium', day), w.material, 'mismo material por calidad y tema');
  assert.notEqual(waterMaterial('high', day), w.material);
  const m = w.material;
  assert.ok(m.isShaderMaterial);
  assert.equal(m.transparent, true);
  assert.equal(m.depthWrite, true);
  assert.equal(m.lights, true);
  assert.equal(m.fog, true);
  assert.equal(m.uniforms.uWind, windUniforms.uWind, 'el tiempo es el del viento compartido');
  assert.equal(m.uniforms.uNormalMap.value, waterNormalMap());
  assert.equal(waterMaterial('low', day).uniforms.uNormalMap, undefined);
  // paleta del tema: el agua del tema, el cielo del tema
  const pal = waterPalette(THEMES.jungle);
  const lum = (c) => c.getHSL({}).l;
  assert.ok(lum(pal.deep) < lum(pal.shallow));
  assert.ok(waterMaterial('medium', THEMES.jungle).uniforms.uDeep.value.equals(pal.deep));
  assert.ok(!waterMaterial('medium', THEMES.jungle).uniforms.uSkyTop.value.equals(waterMaterial('medium', day).uniforms.uSkyTop.value));
});

// ---------- río ----------

test('agua: el río fluye en su dirección (river.along) a velocidad constante (sin cizalla)', () => {
  const { w } = water('high');
  const R = w.river;
  const flow = attr(R, 'waterFlow'), uv = attr(R, 'waterUv');
  const speeds = new Set();
  for (let i = 0; i < flow.count; i++) {
    speeds.add(flow.getZ(i));
    const p = worldOf(R, i);
    assert.ok(Math.abs(Math.hypot(flow.getX(i), flow.getY(i)) - 1) < 1e-4);
    // la dirección es la tangente del cauce en ese punto
    const t = p.z - (bounds.minZ + bounds.maxZ) / 2;
    const a = river.along(t - 0.5), b = river.along(t + 0.5);
    const tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz);
    assert.ok((flow.getX(i) * tx + flow.getY(i) * tz) / tl > 0.97, `vértice ${i}`);
  }
  assert.deepEqual([...speeds], [Math.fround(RIVER_FLOW.speed)], 'una sola velocidad en toda la cinta');
  // la u crece aguas abajo
  const lat = (WATER_BUDGET.high.riverCross / 2) | 0;
  const C = WATER_BUDGET.high.riverCross + 1;
  for (let i = C; i < uv.count; i += C) assert.ok(uv.getX(i + lat) > uv.getX(i + lat - C));
  // el lago está quieto
  const lf = attr(w.lake, 'waterFlow');
  for (let i = 0; i < lf.count; i++) assert.equal(lf.getZ(i), 0);
  // cinta: medio ancho = agua + orilla, y un pelo por encima del lago
  assert.equal(riverHalfWidth(river), river.w + RIVER_FLOW.bank);
  assert.ok(Math.abs(R.position.y - (river.y + RIVER_FLOW.lift)) < 1e-9);
});

test('agua: el desplazamiento del normal-map no salta cuando el tiempo del viento vuelve a 0', () => {
  for (const s of WATER_SAMPLES) {
    for (const flow of [0, RIVER_FLOW.speed]) {
      const a = waterScroll(0, s, flow), b = waterScroll(WATER_TIME_WRAP, s, flow);
      for (let k = 0; k < 2; k++) {
        const d = Math.abs(a[k] - b[k]);
        assert.ok(Math.min(d, 1 - d) < 1e-6, `tile ${s.tile}, flujo ${flow}: ${a[k]} vs ${b[k]}`);
      }
      const c = waterScroll(1, s, flow);
      assert.ok(c[0] !== a[0] || c[1] !== a[1], 'se mueve');
    }
  }
  // y el tiempo del viento vuelve a 0 justo ahí
  resetWind();
  for (let i = 0; i < (WATER_TIME_WRAP + 1) * 10; i++) updateWind(0.1);
  assert.ok(windUniforms.uWind.value.w < 2, `t = ${windUniforms.uWind.value.w}`);
  resetWind();
});

test('agua: con lago y río al mismo nivel, el lago se corta bajo la cinta y la cinta se dibuja antes', () => {
  const r2 = Object.freeze(makeRiver(bounds, THEMES.meadow, seededRng(3), { grounded: false, enabled: true }));
  const y2 = r2.y;
  // valle bajo junto al río: el agua del lago llega al cauce
  const h2 = (x, z) => r2.carve(x, z, Math.abs(x) > 18 ? y2 - 1 : y2 + 0.6);
  const scene = new THREE.Scene();
  const w = addWater(scene, { size: SIZE, y: y2, heightAt: h2, river: r2, level: 'medium', theme: THEMES.meadow, warp });
  assert.ok(w.lake && w.river);
  const W = riverHalfWidth(r2);
  const { out } = triangles(w.lake);
  for (const t of out) assert.ok(!t.every((i) => { const p = worldOf(w.lake, i); return r2.dist(p.x, p.z) < W - 0.05; }), 'triángulo de lago bajo la cinta');
  assert.ok(WATER_RENDER_ORDER.river < WATER_RENDER_ORDER.lake && WATER_RENDER_ORDER.lake < 0);
  assert.equal(w.river.renderOrder, WATER_RENDER_ORDER.river);
  assert.equal(w.lake.renderOrder, WATER_RENDER_ORDER.lake);
  assert.ok(RIVER_FLOW.lift > 0);
});

// ---------- bakeStatic, temas, física, dispose ----------

test('agua: bakeStatic no la funde con el decorado (userData.keep) y sale intacta', () => {
  const { w } = water('medium');
  const root = new THREE.Group(), parent = new THREE.Group();
  root.add(w.group);
  const before = w.meshes.map((m) => m.geometry);
  const out = bakeStatic(root, parent);
  assert.ok(out.every((m) => !m.material.isShaderMaterial), 'ninguna malla juntada con el agua');
  for (const [i, m] of w.meshes.entries()) {
    assert.equal(m.userData.keep, true);
    assert.equal(m.geometry, before[i]);
    let inParent = false;
    parent.traverse((o) => (inParent ||= o === m));
    assert.ok(inParent, `${m.name} en el padre`);
    assert.equal(m.castShadow, false);
  }
});

test('agua: temas sin agua de verdad (ciudad sin neón, lava, caldera) no cambian: sin agua nueva; el neón sí la lleva (2026-11-23)', () => {
  const off = [...Object.entries(THEMES).filter(([, t]) => t.lava || t.caldera), ['city', { ...THEMES.meadow, cyberCity: true }]];
  assert.ok(off.length >= 3);
  for (const k of ['neon', 'neonPink', 'cyber2078']) assert.equal(waterSupported(THEMES[k]), true, k);
  for (const [k, t] of off) {
    assert.equal(waterSupported(t), false, k);
    assert.equal(waterMaterial('medium', t), null, k);
    const scene = new THREE.Scene();
    assert.equal(addWater(scene, { size: SIZE, y: -1, heightAt: () => -3, level: 'medium', theme: t }), null, k);
    assert.equal(scene.children.length, 0);
  }
  for (const k of ['meadow', 'meadowDay', 'jungle', 'snow', 'glacier', 'beach', 'autumn', 'night']) assert.equal(waterSupported(THEMES[k]), true, k);
});

test('agua: solo dibujo: no toca la física ni el río/terreno que recibe', () => {
  const src = readFileSync(new URL('../src/game/render/assets/water.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /from '(\.\.\/)+(physics|courses)\.js'/);
  assert.doesNotMatch(src, /from '\.\.\/(environment|flora)\.js'/);
  // el río llega congelado: si el agua lo tocara, fallaría
  assert.doesNotThrow(() => water('high'));
  const { scene, w } = water('low');
  assert.deepEqual(scene.children, [w.group]);
});

test('agua: dispose quita el agua de la escena y libera sus geometrías (material y textura compartidos)', () => {
  const { scene, w } = water('high');
  const freed = [];
  for (const m of w.meshes) m.geometry.addEventListener('dispose', () => freed.push(m.name));
  let matFreed = false, texFreed = false;
  w.material.addEventListener('dispose', () => (matFreed = true));
  waterNormalMap().addEventListener('dispose', () => (texFreed = true));
  assert.doesNotThrow(() => w.update(new THREE.Vector3(0, 5, 0)));
  w.dispose();
  assert.equal(scene.children.length, 0);
  assert.deepEqual(freed.sort(), w.meshes.map((m) => m.name).sort());
  assert.equal(matFreed, false);
  assert.equal(texFreed, false);
});

test('agua: makeWater elige lago o río', () => {
  const l = makeWater({ kind: 'lake', size: SIZE, y: Y, heightAt, level: 'low', theme: day });
  const r = makeWater({ kind: 'river', river, heightAt, level: 'low', theme: day, size: SIZE });
  assert.equal(l.name, 'water-lake');
  assert.equal(r.name, 'water-river');
  assert.equal(l.material, r.material);
  assert.throws(() => makeWater({ kind: 'sea' }));
  assert.ok(makeRiverWater({ river, heightAt, level: 'low', theme: day, size: SIZE }));
});

// ---------- juncos y nenúfares ----------

const reedsAt = (seed, level, x = 3, z = 4) => makeReeds(seededRng(seed), x, 0, z, { level });
const padAt = (seed, level, x = 3, z = 4) => makeLilyPad(seededRng(seed), x, 0, z, { level });
function countDraws(make) {
  let n = 0;
  const base = seededRng(11);
  make(() => (n++, base()));
  return n;
}

test('orilla: juncos y nenúfares con presupuesto, una sola tirada del rng y misma forma en las tres calidades', () => {
  for (const level of LEVELS) {
    assert.equal(countDraws((r) => makeReeds(r, 0, 0, 0, { level })), SHORE_RNG_DRAWS);
    assert.equal(countDraws((r) => makeLilyPad(r, 0, 0, 0, { level })), SHORE_RNG_DRAWS);
    let maxR = 0, maxP = 0;
    for (let s = 1; s <= 30; s++) {
      maxR = Math.max(maxR, reedTriangles(reedsAt(s, level)));
      maxP = Math.max(maxP, padTriangles(padAt(s, level)));
    }
    assert.ok(maxR <= SHORE_BUDGET.reeds[level] && maxR >= SHORE_BUDGET.reeds[level] * 0.5, `${level} juncos ${maxR}`);
    assert.ok(maxP <= SHORE_BUDGET.pad[level] && maxP >= SHORE_BUDGET.pad[level] * 0.5, `${level} nenúfar ${maxP}`);
  }
  // misma semilla: mismas briznas (número, altura y sitio) en Bajo y Alto
  for (let s = 1; s <= 10; s++) {
    const a = reedsAt(s, 'low'), b = reedsAt(s, 'high');
    assert.deepEqual(a.userData.blades, b.userData.blades);
    assert.deepEqual(padAt(s, 'low').userData.shape, padAt(s, 'high').userData.shape);
  }
  // determinista
  const g1 = reedsAt(5, 'medium').children[0].geometry, g2 = reedsAt(5, 'medium').children[0].geometry;
  assert.deepEqual(Array.from(g1.attributes.position.array), Array.from(g2.attributes.position.array));
});

test('orilla: juncos y nenúfares comparten un material con el viento compartido (capa de la hierba)', () => {
  const m = shoreMaterial();
  assert.equal(m, shoreMaterial());
  assert.ok(isWindMaterial(m));
  assert.equal(m.userData.wind.layer, REED_WIND.layer);
  assert.equal(m.userData.wind.height, REED_WIND.height);
  const reeds = reedsAt(2, 'medium'), pad = padAt(2, 'medium');
  assert.equal(reeds.children[0].material, m);
  assert.equal(pad.children[0].material, m);
  assert.equal(reeds.userData.swayRoot, true);
  // el nenúfar flota: todos sus vértices con la misma altura de viento (se mece entero, sin doblarse)
  const sw = pad.children[0].geometry.getAttribute('sway');
  for (let i = 0; i < sw.count; i++) assert.equal(sw.getX(i), Math.fround(PAD_SWAY));
});

test('orilla: el viento y la ráfaga mueven la punta del junco y el nenúfar (no la raíz)', () => {
  resetWind();
  setWind({ strength: 1, angle: 0, autoGusts: false });
  const reeds = prepareWind(reedsAt(4, 'high', 0, 0));
  const g = reeds.children[0].geometry, p = g.attributes.position, sway = g.getAttribute('sway'), ph = g.getAttribute('windPhase');
  const L = shoreMaterial().userData.wind;
  let top = 0, root = 0;
  for (let i = 0; i < p.count; i++) if (sway.getX(i) > sway.getX(top)) top = i;
  for (let i = 0; i < p.count; i++) if (sway.getX(i) < sway.getX(root)) root = i;
  const at = (i, s) => {
    const d = windDisplacement({ x: p.getX(i), y: p.getY(i), z: p.getZ(i), h: sway.getX(i), p0: ph.getX(i), p1: ph.getY(i), w: 1 }, L, s.t, s);
    return Math.hypot(d.x, d.z);
  };
  const calm = at(top, windSample());
  assert.ok(sway.getX(top) > 0.5, 'junco de más de medio metro');
  assert.ok(calm > 0.01, `la punta se mueve ${calm} m`);
  assert.ok(at(root, windSample()) < 0.002, 'la raíz no se mueve');
  triggerGust({ amp: 1 });
  let peak = 0;
  for (let k = 0; k < 80; k++) {
    updateWind(0.1);
    peak = Math.max(peak, at(top, windSample()));
  }
  assert.ok(peak > calm * 1.5, `ráfaga ${peak} frente a ${calm}`);
  // nenúfar: se desplaza entero unos centímetros con la ráfaga
  const pad = prepareWind(padAt(4, 'high', 0, 0));
  const pg = pad.children[0].geometry;
  const pd = windDisplacement({ x: 0, y: 0, z: 0, h: PAD_SWAY, p0: pg.getAttribute('windPhase').getX(0), p1: pg.getAttribute('windPhase').getY(0), w: 1 }, L, windSample().t, { ...windSample(), gusts: [{ front: 0, amp: 1 }] });
  assert.ok(Math.hypot(pd.x, pd.z) > 0.01 && Math.hypot(pd.x, pd.z) < 0.15, `nenúfar ${Math.hypot(pd.x, pd.z)} m`);
  resetWind();
});

test('orilla: bakeStatic junta juncos y nenúfares en pocas llamadas y conserva el viento', () => {
  const root = new THREE.Group(), parent = new THREE.Group();
  for (let i = 0; i < 12; i++) root.add(reedsAt(i + 1, 'medium', i * 2, 0), padAt(i + 1, 'medium', i * 2, 3));
  const out = bakeStatic(root, parent);
  assert.ok(out.length >= 1 && out.length <= SHORE_MAX_CALLS, `${out.length} llamadas`);
  for (const m of out) {
    assert.equal(m.material, shoreMaterial());
    for (const a of ['sway', 'windPhase', 'windFlutter']) assert.ok(m.geometry.getAttribute(a), a);
  }
  // los nenúfares conservan su altura de viento fija (no la recalcula bakeStatic)
  const pads = out.find((m) => !m.castShadow);
  assert.ok(pads, 'los nenúfares no proyectan sombra');
  const sw = pads.geometry.getAttribute('sway');
  for (let i = 0; i < sw.count; i++) assert.equal(sw.getX(i), Math.fround(PAD_SWAY));
});

// ---------- laboratorio ----------

test('laboratorio: parches de lago y río (antes y después) se construyen con la orilla juntada', async () => {
  const { oldLakePatch, newLakePatch, oldRiverPatch, newRiverPatch, LAB_WATER_Y } = await import('../src/lab/assets/waterPatch.js');
  const { qualityPreset } = await import('../src/game/render/quality.js');
  for (const level of LEVELS) {
    const preset = { level, ...qualityPreset(level), sceneTheme: day };
    for (const [make, isNew] of [[oldLakePatch, false], [newLakePatch, true], [oldRiverPatch, false], [newRiverPatch, true]]) {
      const g = make(seededRng(1), preset);
      const lab = g.userData.lab;
      assert.ok(lab?.measure && lab.keepShadows, 'userData.lab');
      const meshes = [];
      lab.measure.traverse((o) => o.isMesh && meshes.push(o));
      const waterMeshes = meshes.filter((m) => m.material.isShaderMaterial);
      if (isNew) {
        assert.ok(waterMeshes.length >= 1 && waterMeshes.length <= WATER_MAX_CALLS, `${level}: ${waterMeshes.length}`);
        assert.ok(waterMeshes.every((m) => m.material === waterMeshes[0].material));
        // orilla juntada: como mucho 2 mallas de juncos/nenúfares, con viento
        const shoreMeshes = meshes.filter((m) => m.material === shoreMaterial());
        assert.ok(shoreMeshes.length >= 1 && shoreMeshes.length <= SHORE_MAX_CALLS, `${level}: orilla ${shoreMeshes.length}`);
        // el agua queda a su nivel
        for (const m of waterMeshes) assert.ok(Math.abs(m.position.y - LAB_WATER_Y) <= RIVER_FLOW.lift + 1e-9);
      } else assert.equal(waterMeshes.length, 0);
    }
  }
  // el río del parche: solo la cinta (el cauce queda bajo ella: el lago no repite nada)
  const r = newRiverPatch(seededRng(1), { level: 'medium', ...qualityPreset('medium'), sceneTheme: day });
  const names = [];
  r.userData.lab.measure.traverse((o) => o.isMesh && o.material.isShaderMaterial && names.push(o.name));
  assert.deepEqual(names, ['water-river']);
  // temas sin agua nueva: el «después» queda vacío (el laboratorio lo dice)
  assert.equal(newLakePatch(seededRng(1), { level: 'medium', ...qualityPreset('medium'), sceneTheme: THEMES.volcano }), null);
});

// ---------- oleaje ----------

const GRID = []; // puntos de prueba del mundo
for (let x = -90; x <= 90; x += 13.7) for (let z = -90; z <= 90; z += 11.3) GRID.push([x, z]);

test('oleaje: Bajo sin oleaje, Medio 1 onda, Alto 2; ondas con vueltas enteras y dentro de límites suaves', () => {
  assert.equal(swellWaves('low').length, 0);
  assert.equal(swellWaves('medium').length, 1);
  assert.equal(swellWaves('high').length, 2);
  for (const [x, z] of GRID) for (const t of [0, 1.3, 77]) assert.equal(waterSwell(x, z, t, 'low'), 0);
  for (const w of WATER_SWELL.waves) {
    assert.ok(Number.isInteger(w.cycles) && w.cycles > 0, `vueltas enteras: ${w.cycles}`);
    assert.ok(w.len >= 8 && w.len <= 40, `onda larga: ${w.len} m`);
    assert.ok(w.amp > 0 && w.amp <= 0.03, `amplitud ${w.amp}`);
    // período de 4 a 20 s y velocidad de fase suave (<= 2,5 m/s)
    const T = WATER_TIME_WRAP / w.cycles, c = (w.len * w.cycles) / WATER_TIME_WRAP;
    assert.ok(T >= 4 && T <= 20, `período ${T} s`);
    assert.ok(c <= 2.5, `velocidad ${c} m/s`);
  }
  // el tope de amplitud por calidad, medido: 0, 2 cm, 3 cm
  const peak = (level) => {
    let m = 0;
    for (const [x, z] of GRID) for (let t = 0; t < 40; t += 0.37) m = Math.max(m, Math.abs(waterSwell(x, z, t, level)));
    return m;
  };
  assert.equal(peak('low'), 0);
  assert.ok(peak('medium') > 0.018 && peak('medium') <= 0.02 + 1e-9, `medio ${peak('medium')}`);
  assert.ok(peak('high') > 0.022 && peak('high') <= 0.03 + 1e-9, `alto ${peak('high')}`);
  assert.deepEqual(LEVELS.map(swellMaxAmp).map((v) => +v.toFixed(6)), [0, 0.02, 0.03]);
});

test('oleaje: periódico en el tiempo del viento (no salta al reiniciar uWind.w) y se mueve', () => {
  for (const level of ['medium', 'high']) {
    for (const [x, z] of GRID.slice(0, 40)) {
      for (const t of [0, 0.5, 13.37]) {
        assert.ok(Math.abs(waterSwell(x, z, t, level) - waterSwell(x, z, t + WATER_TIME_WRAP, level)) < 1e-7, `${level} ${x},${z},${t}`);
        const [a, b] = [waterSwellSlope(x, z, t, level), waterSwellSlope(x, z, t + WATER_TIME_WRAP, level)];
        assert.ok(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 1e-7);
      }
    }
    assert.ok(Math.abs(waterSwell(5, 7, 0, level) - waterSwell(5, 7, 1.7, level)) > 1e-4, 'se mueve');
  }
});

test('oleaje: la derivada analítica coincide con la numérica', () => {
  const e = 1e-4;
  for (const level of ['medium', 'high']) {
    for (const [x, z] of GRID.slice(0, 60)) {
      const t = 3.9, [dx, dz] = waterSwellSlope(x, z, t, level);
      const nx = (waterSwell(x + e, z, t, level) - waterSwell(x - e, z, t, level)) / (2 * e);
      const nz = (waterSwell(x, z + e, t, level) - waterSwell(x, z - e, t, level)) / (2 * e);
      assert.ok(Math.abs(dx - nx) < 1e-6 && Math.abs(dz - nz) < 1e-6, `${level} ${x},${z}: ${dx} ${nx} / ${dz} ${nz}`);
    }
  }
  // inclinación real pequeña (suave); `shade` la exagera solo en las normales
  let m = 0;
  for (const [x, z] of GRID) { const [a, b] = waterSwellSlope(x, z, 2, 'high'); m = Math.max(m, Math.hypot(a, b)); }
  assert.ok(m < 0.05, `pendiente máx. ${m}`);
  assert.ok(m * WATER_SWELL.shade < 0.5, 'exagerada sigue siendo moderada');
});

// Espejo del GLSL: se extraen del texto del sombreador las constantes reales de cada onda y se evalúan en JS
// (así waterSwell / waterSwellSlope se prueban contra lo que de verdad se compila, no contra sí mismas).
const NUM = String.raw`([+-]?[\d.]+(?:e[+-]?\d+)?)`;
function glslSwell(level) {
  const vs = waterShaderSource(level).vertexShader;
  const re = new RegExp(
    String.raw`float p = ${NUM} \* dot\(wp\.xz, vec2\(${NUM}, ${NUM}\)\) ([-+]) PI2 \* fract\(t \* ${NUM}\) \+ ${NUM}; ` +
    String.raw`float s = sin\(p\); swH \+= ${NUM} \* s; swC \+= ${NUM} \* s; swG \+= ${NUM} \* cos\(p\) \* vec2\(${NUM}, ${NUM}\);`,
    'g',
  );
  const waves = [...vs.matchAll(re)].map((m) => {
    const v = (i) => Number(m[i]);
    return { k: v(1), dx: v(2), dz: v(3), tsign: m[4] === '-' ? -1 : 1, rate: v(5), ph: v(6), amp: v(7), swC: v(8), ampK: v(9), gx: v(10), gz: v(11) };
  });
  const shade = vs.match(new RegExp(String.raw`vSwell = vec3\(swG \* ${NUM} \* waterSwell, swC \* waterSwell\);`));
  return { vs, waves, shade: shade && Number(shade[1]), scaledY: /wp\.y \+= swH \* waterSwell;/.test(vs) };
}
const fr = (q) => q - Math.floor(q);
// evalúa el vértice del GLSL en (x, z, t): altura sin escalar (swH), cresta (swC) y pendiente (swG)
function evalGlsl(waves, x, z, t) {
  let h = 0, c = 0, gx = 0, gz = 0;
  for (const w of waves) {
    const p = w.k * (x * w.dx + z * w.dz) + w.tsign * 2 * Math.PI * fr(t * w.rate) + w.ph;
    const s = Math.sin(p);
    h += w.amp * s; c += w.swC * s;
    gx += w.ampK * Math.cos(p) * w.gx; gz += w.ampK * Math.cos(p) * w.gz;
  }
  return { h, c, gx, gz };
}
const TIMES = [0, 1.3, 123.4, 1800.25, 3599.9];

test('oleaje: el GLSL generado (constantes extraídas) coincide con waterSwell / waterSwellSlope a < 1e-6', () => {
  for (const level of ['medium', 'high']) {
    const g = glslSwell(level);
    assert.equal(g.waves.length, swellWaves(level).length, `${level}: ondas extraídas`);
    assert.ok(g.scaledY, `${level}: wp.y += swH * waterSwell`);
    assert.equal(g.shade, WATER_SWELL.shade, `${level}: exageración de la normal`);
    const sumA = g.waves.reduce((a, w) => a + w.amp, 0);
    for (const w of g.waves) {
      assert.ok(Math.abs(w.swC - w.amp / sumA) < 1e-6, 'cresta normalizada');
      assert.ok(Math.abs(w.ampK - w.amp * w.k) < 1e-5, 'pendiente = amp·k');
      assert.ok(Math.abs(Math.hypot(w.dx, w.dz) - 1) < 1e-5, 'dirección unitaria');
      assert.ok(w.gx === w.dx && w.gz === w.dz, 'pendiente con la misma dirección');
      assert.equal(w.tsign, -1, 'la onda avanza (signo del tiempo)');
    }
    for (const [x, z] of GRID.filter((_, i) => i % 7 === 0)) {
      for (const t of TIMES) {
        const e = evalGlsl(g.waves, x, z, t);
        const [sx, sz] = waterSwellSlope(x, z, t, level);
        assert.ok(Math.abs(e.h - waterSwell(x, z, t, level)) < 1e-6, `${level} h ${x},${z},${t}`);
        assert.ok(Math.abs(e.gx - sx) < 1e-6 && Math.abs(e.gz - sz) < 1e-6, `${level} pendiente ${x},${z},${t}`);
      }
    }
  }
});

test('oleaje: el desplazamiento vertical del GLSL (amplitud extraída) nunca supera la mitad de la profundidad', () => {
  for (const level of ['medium', 'high']) {
    const { waves } = glslSwell(level);
    const amp = waves.reduce((a, w) => a + w.amp, 0);
    assert.ok(Math.abs(amp - swellMaxAmp(level)) < 1e-9, `${level}: amplitud del GLSL ${amp}`);
    assert.ok(WATER_SWELL.margin >= 2 * amp - 1e-12, `${level}: margen ${WATER_SWELL.margin} >= 2 x ${amp}`);
    for (let d = 0; d <= 3; d += 0.01) assert.ok(amp * swellVertexScale(d) <= d / 2 + 1e-9, `${level} d ${d}`);
    for (const [x, z] of GRID) for (const t of TIMES) assert.ok(Math.abs(evalGlsl(waves, x, z, t).h) <= amp + 1e-9);
  }
});

test('oleaje: la amplitud es menor que el margen de orilla (el agua nunca baja del terreno ni cruza la orilla)', () => {
  assert.ok(WATER_SWELL.margin >= 2 * swellMaxAmp('high') - 1e-12, 'margen = 2 x amplitud máxima');
  // a profundidad d el vértice baja como mucho d/2: nunca bajo el terreno; en la orilla (d <= 0), nada
  for (let d = -2; d <= 3; d += 0.01) {
    const k = swellVertexScale(d);
    assert.ok(k >= 0 && k <= 1);
    if (d <= 0) assert.equal(k, 0, `en la orilla sin oleaje (d ${d})`);
    else assert.ok(swellMaxAmp('high') * k <= d / 2 + 1e-9, `d ${d}: baja ${swellMaxAmp('high') * k}`);
    assert.ok(swellMaxAmp('high') * k < WATER_SHORE.dry, 'menos que el margen de «seco»');
  }
  assert.equal(swellVertexScale(WATER_SWELL.margin), 1);
  // medido en las mallas
  for (const level of ['medium', 'high']) {
    const { w } = water(level);
    for (const m of w.meshes) {
      const sw = attr(m, 'waterSwell'), sh = attr(m, 'waterShore');
      let mx = 0;
      for (let i = 0; i < sw.count; i++) {
        assert.ok(sw.getX(i) >= 0 && sw.getX(i) <= 1 + 1e-6);
        if (sh.getX(i) <= 0) assert.equal(sw.getX(i), 0, `${m.name} vértice ${i} en la orilla`);
        const p = worldOf(m, i);
        const lowest = m.position.y - swellMaxAmp(level) * sw.getX(i);
        if (sh.getX(i) > 0 && sh.getX(i) < 1.2) assert.ok(lowest >= heightAt(p.x, p.z) - 1e-6, `${m.name}: bajo el terreno`);
        mx = Math.max(mx, sw.getX(i));
      }
      assert.ok(mx > 0.5, `${m.name}: sin oleaje en ningún vértice`);
    }
  }
});

test('oleaje: costura lago/río consistente (misma onda en el mundo, escala 1 en el borde, menor en el centro)', () => {
  const [a, b] = WATER_SWELL.riverEdge;
  assert.equal(swellVertexScale(1, 1), 1, 'borde del río = lago a profundidad entera');
  assert.equal(swellVertexScale(1, b), swellVertexScale(1));
  assert.ok(Math.abs(swellVertexScale(1, 0) - WATER_SWELL.riverK) < 1e-12, 'centro: riverK');
  assert.ok(WATER_SWELL.riverK < 1 && WATER_SWELL.riverK > 0.3);
  let prev = 0;
  for (let u = 0; u <= 1.0001; u += 0.02) {
    const k = swellVertexScale(1, u);
    assert.ok(k >= prev - 1e-12, 'sube hacia el borde');
    prev = k;
    if (u < a) assert.ok(Math.abs(k - WATER_SWELL.riverK) < 1e-12);
  }
  // medido en la malla: los vértices del borde de la cinta valen como el lago a su misma profundidad
  const { w } = water('high');
  const sw = attr(w.river, 'waterSwell'), sh = attr(w.river, 'waterShore');
  const C = WATER_BUDGET.high.riverCross + 1;
  let n = 0, centre = 0;
  for (let i = 0; i < sw.count; i++) {
    const j = i % C;
    if (j === 0 || j === C - 1) { assert.ok(Math.abs(sw.getX(i) - swellVertexScale(sh.getX(i))) < 1e-6, `borde ${i}`); n++; }
    if (j === C >> 1 && sh.getX(i) > WATER_SWELL.margin) { assert.ok(Math.abs(sw.getX(i) - WATER_SWELL.riverK) < 1e-6, 'centro'); centre++; }
  }
  assert.ok(n > 100 && centre > 50, `${n} / ${centre}`);
  // la franja de 1 cm entre lago y cinta no se cierra: la onda es la misma a los dos lados
  // (función solo del mundo), la diferencia de altura sigue siendo el lift
  assert.ok(RIVER_FLOW.lift >= 0.01 - 1e-12);
  // Lago (+0) y cinta (+lift) comparten la misma onda y la misma escala en el borde (comprobado arriba), así que
  // su diferencia de altura es exactamente lift (1 cm) en cada punto: no hace falta lift >= 0,4 x amp máx. de
  // Alto (0,4 x 3 cm = 1,2 cm). Además ningún hoyo tiene lago y río a la vez. Si algún día los hubiera, subir lift.
  assert.ok(Math.abs(0.4 * swellMaxAmp('high') - 0.012) < 1e-9, 'cifra de la nota: 1,2 cm');
  const vs = waterShaderSource('high').vertexShader;
  assert.doesNotMatch(vs, /waterFlow\.z[^;]*swH|swH[^;]*waterFlow/, 'el oleaje no depende de si es río o lago');
});

test('oleaje: no cambia el presupuesto (triángulos y llamadas iguales por calidad)', () => {
  assert.deepEqual({ ...WATER_MAX_TRIS }, { low: 40 * 40 * 2 + 110 * 2 * 2, medium: 64 * 64 * 2 + 176 * 4 * 2, high: 80 * 80 * 2 + 275 * 6 * 2 });
  for (const level of LEVELS) {
    const { w } = water(level);
    assert.ok(w.stats.triangles <= WATER_MAX_TRIS[level] && w.stats.calls <= WATER_MAX_CALLS);
    assert.equal(w.lake.geometry.getAttribute('waterSwell').itemSize, 1);
  }
});

// ---------- ondas de salpicadura (peces) ----------

const RIP = WATER_RIPPLES;
const ripGlsl = (level) => {
  const fs = waterShaderSource(level).fragmentShader;
  const n = (re) => Number(fs.match(re)?.[1]);
  return {
    count: n(/uniform vec4 uRipples\[(\d+)\]/),
    loop: n(/for \(int i = 0; i < (\d+); i\+\+\)/),
    speedTau: n(new RegExp(String.raw`float r = ${NUM} \* \(1\.0 - exp\(`)),
    invTau: n(new RegExp(String.raw`exp\(-e\.z \* ${NUM}\)`)),
    invLife: n(new RegExp(String.raw`float k = saturate\(1\.0 - e\.z \* ${NUM}\)`)),
    invW2: n(new RegExp(String.raw`float gs = exp\(-x \* x \* ${NUM}\)`)),
    kPh: n(new RegExp(String.raw`float ph = x \* ${NUM}`)),
    ampShade: n(new RegExp(String.raw`float dh = ${NUM} \* env`)),
    glint: n(new RegExp(String.raw`saturate\(rGlint \* ${NUM}\)`)),
    twoInvW2: n(new RegExp(String.raw`- ${NUM} \* x \* cos\(ph\)`)),
  };
};
const ROWS = [[0, 0, 0.3, 1], [2, -1, 1.1, 0.6], [-3, 4, 2.2, 0.8], [1, 1, 0, 0]];

test('ondas: edad (con vuelta de hora), radio, amplitud y envolvente de la función pura', () => {
  assert.equal(rippleAge(10, 7.5), 2.5);
  assert.ok(Math.abs(rippleAge(0.5, 3599.8) - 0.7) < 1e-9, 'cruza la vuelta de la hora');
  assert.ok(Math.abs(rippleAge(3599.9, 3599.8) - 0.1) < 1e-9);
  // nace a 3,5 m/s y frena; al final de la vida (2,5 s) ~3,7 m
  assert.equal(rippleRadius(0), 0);
  assert.ok(Math.abs((rippleRadius(1e-6) - rippleRadius(0)) / 1e-6 - RIP.speed) < 1e-3);
  let prev = 0;
  for (let a = 0.1; a < RIP.life; a += 0.1) { const r = rippleRadius(a); assert.ok(r > prev); prev = r; }
  assert.ok(rippleRadius(RIP.life) > 3 && rippleRadius(RIP.life) < 4.5);
  // en el frente: amplitud = amp·I·(1-a/life)²/(1+r); decrece con la edad y con el radio
  const age = 0.8, r = rippleRadius(age);
  const o = waterRipple(r, age, 1);
  const env = (1 - age / RIP.life) ** 2 / (1 + r);
  assert.ok(Math.abs(o.h - RIP.amp * env) < 1e-12, 'cresta en el frente');
  assert.ok(Math.abs(o.env - env) < 1e-12);
  assert.ok(waterRipple(rippleRadius(1.6), 1.6, 1).h < o.h, 'menos con la edad');
  assert.ok(Math.abs(waterRipple(r, age, 0.5).h - o.h / 2) < 1e-12, 'lineal con la intensidad');
  // el frente mide ~0,25 m: a 1 ancho queda e^-1; a 3 anchos, casi nada
  assert.ok(Math.abs(waterRipple(r + RIP.width, age, 1).glint / o.glint - Math.exp(-1)) < 1e-12);
  assert.ok(waterRipple(r + 3 * RIP.width, age, 1).glint / o.glint < 2e-4);
  // 0 fuera de la vida, sin intensidad o con edad negativa
  for (const [d, a, i] of [[1, RIP.life, 1], [1, RIP.life + 1, 1], [1, -0.1, 1], [1, 1, 0], [1, 1, -1]]) {
    assert.deepEqual(waterRipple(d, a, i), { h: 0, dh: 0, glint: 0, r: 0, env: 0 }, `${d},${a},${i}`);
  }
  assert.ok(waterRipple(1, RIP.life - 1e-6, 1).env < 1e-6, 'se apaga sin salto');
  for (let a = 0; a < RIP.life; a += 0.05) for (let d = 0; d < 6; d += 0.1) {
    assert.ok(Object.values(waterRipple(d, a, 1)).every(Number.isFinite), `finito ${d},${a}`);
  }
});

test('ondas: la derivada analítica coincide con la diferencia finita de la altura y apunta en radial', () => {
  const e = 1e-5;
  for (const age of [0.2, 0.9, 1.7]) for (let d = 0.05; d < 5; d += 0.23) {
    const num = (waterRipple(d + e, age, 0.9).h - waterRipple(d - e, age, 0.9).h) / (2 * e);
    assert.ok(Math.abs(num - waterRipple(d, age, 0.9).dh) < 1e-7, `dh ${d},${age}`);
  }
  const f1 = waterRippleField(1, 0, [[0, 0, 0.4, 1]]);
  assert.ok(Math.abs(f1.gz) < 1e-12, 'radial: sin componente en z sobre el eje x');
  assert.ok(Math.abs(f1.gx - waterRipple(1, 0.4, 1).dh * RIP.shade) < 1e-12, 'gx = dh · shade en +x');
  const f2 = waterRippleField(-1, 0, [[0, 0, 0.4, 1]]);
  assert.ok(Math.abs(f2.gx + f1.gx) < 1e-12, 'simétrico: en -x el signo se invierte');
});

test('ondas: el GLSL generado (constantes extraídas) coincide con la función pura a < 1e-6', () => {
  for (const level of ['medium', 'high']) {
    const g = ripGlsl(level);
    assert.equal(g.count, rippleCount(level));
    assert.equal(g.loop, g.count, 'bucle de número fijo = tamaño del uniforme');
    assert.equal(g.speedTau, RIP.speed * RIP.tau);
    assert.ok(Math.abs(g.invTau - 1 / RIP.tau) < 1e-9 && Math.abs(g.invLife - 1 / RIP.life) < 1e-9);
    assert.ok(Math.abs(g.invW2 - 1 / RIP.width ** 2) < 1e-6 && Math.abs(g.twoInvW2 - 2 / RIP.width ** 2) < 1e-6);
    assert.ok(Math.abs(g.kPh - TAU / RIP.wavelength) < 1e-6);
    assert.ok(Math.abs(g.ampShade - RIP.amp * RIP.shade) < 1e-9);
    assert.equal(g.glint, RIP.glint);
    const glsl = (x, z) => {
      let gx = 0, gz = 0, gl = 0;
      for (const [ex, ez, age, w] of ROWS) {
        if (!(w > 0)) continue;
        const dx = x - ex, dz = z - ez, d = Math.hypot(dx, dz);
        const r = g.speedTau * (1 - Math.exp(-age * g.invTau)), xx = d - r;
        const k = Math.min(1, Math.max(0, 1 - age * g.invLife)), env = (w * k * k) / (1 + r);
        const gs = Math.exp(-xx * xx * g.invW2), ph = xx * g.kPh;
        const dh = g.ampShade * env * gs * (-g.kPh * Math.sin(ph) - g.twoInvW2 * xx * Math.cos(ph));
        gx += (dh * dx) / Math.max(d, 1e-3);
        gz += (dh * dz) / Math.max(d, 1e-3);
        gl += env * gs;
      }
      return { gx, gz, gl };
    };
    for (let x = -5; x <= 5; x += 0.7) for (let z = -5; z <= 5; z += 0.9) {
      const a = glsl(x, z), b = waterRippleField(x, z, ROWS);
      assert.ok(Math.abs(a.gx - b.gx) < 1e-6 && Math.abs(a.gz - b.gz) < 1e-6 && Math.abs(a.gl - b.glint) < 1e-6, `${level} ${x},${z}`);
    }
    // estructura del bucle (la evaluación de arriba la espeja): envolvente, radio, salto de anillos vacíos, acumulación
    const fs2 = waterShaderSource(level).fragmentShader;
    assert.ok(fs2.includes('float env = e.w * k * k / (1.0 + r);'), 'envolvente: intensidad · (1-edad/vida)² / (1+r)');
    assert.ok(fs2.includes('if (e.w > 0.0) {'), 'anillos vacíos se saltan');
    assert.ok(fs2.includes('float x = d - r;'), 'distancia al frente');
    assert.ok(fs2.includes('rg += dh * dv / max(d, 0.001);'), 'pendiente radial');
    assert.ok(fs2.includes('rGlint += env * gs;'), 'brillo del frente');
    // la normal se inclina con el signo del campo: N.x - rg.x
    assert.match(waterShaderSource(level).fragmentShader, /N = normalize\(vec3\(N\.x - rg\.x \* N\.y, N\.y, N\.z - rg\.y \* N\.y\)\)/);
  }
});

test('ondas: Bajo sin anillos (ni uniforme ni código); Medio 4 y Alto 6; sin varyings ni lecturas nuevas', () => {
  assert.deepEqual(LEVELS.map(rippleCount), [0, 4, 6]);
  const low = waterShaderSource('low');
  assert.doesNotMatch(low.vertexShader + low.fragmentShader, /ripple|uRipples|rGlint/i);
  const names = (s) => [...s.matchAll(/^varying \w+ (\w+);/gm)].map((m) => m[1]).sort();
  for (const level of LEVELS) {
    const m = waterMaterial(level, day), { vertexShader: vs, fragmentShader: fs } = waterShaderSource(level);
    assert.equal(m.uniforms.uRipples?.value.length ?? 0, rippleCount(level), level);
    assert.doesNotMatch(vs, /uRipples/, 'solo en el fragmento');
    assert.equal((fs.match(/texture2D\(/g) ?? []).length, WATER_BUDGET[level].samples, 'sin lecturas nuevas');
    assert.deepEqual(names(vs), names(fs), `${level}: mismos varyings en vértice y fragmento`);
    assert.ok(!names(vs).some((v) => /rip/i.test(v)), 'ningún varying nuevo');
  }
  assert.equal(names(waterShaderSource('high').vertexShader).length, 7, 'Alto: 7 varyings propios (+ niebla = 8), como antes');
});

test('ondas: setRipples llena el uniforme (edad con vuelta de hora, los más jóvenes, sin NaN); API vieja intacta', () => {
  const ev = (t, x, intensity = 1) => ({ k: 0, kind: 'entry', t, x, y: Y, z: 2, intensity });
  for (const level of ['medium', 'high']) {
    const { w } = water(level);
    const u = w.material.uniforms.uRipples.value;
    assert.equal(u.length, rippleCount(level));
    assert.equal(w.setRipples([], 5), 0);
    assert.ok(u.every((v) => v.w === 0));
    // un evento cruzando la vuelta de la hora
    assert.equal(w.setRipples([ev(3599.5, 4)], 0.5), 1);
    assert.ok(Math.abs(u[0].x - 4) < 1e-6 && Math.abs(u[0].y - 2) < 1e-6 && Math.abs(u[0].z - 1) < 1e-4 && u[0].w === 1);
    assert.equal(w.setRipples([ev(0, 1)], 2.6), 0, 'muerto');
    assert.equal(w.setRipples([ev(0, 1), ev(0, 1, 0)], 2.4), 1, 'intensidad 0 no cuenta');
    const many = Array.from({ length: 10 }, (_, i) => ev(10 + i * 0.2, i));
    assert.equal(w.setRipples(many, 12), u.length);
    const ages = u.map((v) => v.z);
    assert.deepEqual(ages, [...ages].sort((a, b) => a - b), 'más jóvenes primero');
    assert.ok(Math.abs(ages[0] - 0.2) < 1e-4);
    w.setRipples([ev(10, 3)], 10.5);
    const z0 = u[0].z;
    w.setRipples([ev(10, 3)], 11);
    assert.ok(Math.abs(u[0].z - z0 - 0.5) < 1e-4, 'envejece');
    for (const v of u) assert.ok([v.x, v.y, v.z, v.w].every(Number.isFinite));
    w.setRipples([ev(10, 3, 5)], 10.5);
    assert.equal(u[0].w, 1, 'intensidad recortada a 1');
    assert.equal(w.update(), undefined);
  }
  const { w: lo } = water('low');
  assert.equal(lo.setRipples([ev(1, 1)], 1.2), 0);
  assert.equal(lo.material.uniforms.uRipples, undefined);
  assert.equal(setWaterRipples(null, [ev(1, 1)], 1), 0);
  for (const k of ['group', 'lake', 'river', 'meshes', 'material', 'stats', 'update', 'dispose']) assert.ok(k in lo, k);
  assert.equal(lo.stats.calls, lo.meshes.length);
});

test('ondas: rippleRows de relleno fijo y material compartido por lago y río', () => {
  const rows = rippleRows([{ t: 1, x: 1, z: 2, intensity: 0.5 }], 2, 4);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], [1, 2, 1, 0.5]);
  assert.deepEqual(rows[3], [0, 0, 0, 0]);
  assert.deepEqual(rippleRows(null, 0, 2), [[0, 0, 0, 0], [0, 0, 0, 0]]);
  const { w } = water('high');
  assert.equal(w.lake.material, w.river.material, 'lago y río comparten el uniforme de anillos');
});

test('ondas: laboratorio: el pez conectado con el agua pone anillos en cada render (Bajo ninguno) y envejecen', async () => {
  const { fishLakePatch, fishRiverPatch } = await import('../src/lab/assets/fishPatch.js');
  const w0 = windUniforms.uWind.value.w;
  try {
    for (const make of [fishLakePatch, fishRiverPatch]) {
      for (const level of LEVELS) {
        const g = make(seededRng(3), { level, sceneTheme: THEMES.meadowDay });
        const mats = new Set();
        g.traverse((o) => o.isMesh && o.material?.uniforms?.uRipples && mats.add(o.material));
        assert.equal(mats.size, rippleCount(level) ? 1 : 0, `${level}: material con anillos`);
        if (!rippleCount(level)) continue;
        const u = [...mats][0].uniforms.uRipples.value;
        let maxLive = 0, aged = false, last = null;
        // 0..70 s y la vuelta de la hora: en algún momento hay saltos
        for (const base of [0, 3560]) for (let t = base; t < base + 70; t += 0.1) {
          windUniforms.uWind.value.w = t % WATER_TIME_WRAP;
          g.updateMatrixWorld(true);
          const live = u.filter((v) => v.w > 0);
          maxLive = Math.max(maxLive, live.length);
          assert.ok(u.every((v) => [v.x, v.y, v.z, v.w].every(Number.isFinite)));
          assert.ok(live.every((v) => v.z >= 0 && v.z < RIP.life), 'edad dentro de la vida');
          if (live.length && last && Math.abs(live[0].x - last.x) < 1e-6 && live[0].z > last.z && live[0].z - last.z < 0.2) aged = true;
          last = live[0] ? { x: live[0].x, z: live[0].z } : null;
        }
        assert.ok(maxLive >= 1, `${level}: hay anillos al caer el pez`);
        assert.ok(aged, `${level}: el anillo envejece entre fotogramas`);
      }
    }
  } finally {
    windUniforms.uWind.value.w = w0;
  }
});

test('ondas: x, z o t no finitos se descartan (sin filas NaN) y el retorno cuenta solo los válidos', () => {
  const good = { t: 10, x: 1, z: 2, intensity: 1 };
  for (const bad of [NaN, Infinity, -Infinity]) {
    for (const k of ['x', 'z', 't']) {
      const rows = rippleRows([{ ...good, [k]: bad }, good], 10.5, 4);
      assert.ok(rows.every((r) => r.every(Number.isFinite)), `${k}=${bad}: filas finitas`);
      assert.equal(rows.filter((r) => r[3] > 0).length, 1, `${k}=${bad}: solo el válido`);
      const { w } = water('medium');
      assert.equal(w.setRipples([{ ...good, [k]: bad }, good, { ...good, [k]: bad }], 10.5), 1, `${k}=${bad}: retorno`);
      assert.ok(w.material.uniforms.uRipples.value.every((v) => [v.x, v.y, v.z, v.w].every(Number.isFinite)));
    }
  }
});

test('ondas: laboratorio: el «Antes» (fish:false) nunca tiene anillos aunque el «Después» sí (mismo nivel y tema)', async () => {
  const { fishLakePatch, fishRiverPatch } = await import('../src/lab/assets/fishPatch.js');
  const w0 = windUniforms.uWind.value.w;
  const ripMats = (g) => { const s = new Set(); g.traverse((o) => o.isMesh && o.material?.uniforms?.uRipples && s.add(o.material)); return [...s]; };
  try {
    for (const make of [fishLakePatch, fishRiverPatch]) {
      for (const level of ['medium', 'high']) {
        const p = { level, sceneTheme: THEMES.meadowDay };
        const before = make(seededRng(3), p, { fish: false });
        const after = make(seededRng(3), p);
        const [mb] = ripMats(before), [ma] = ripMats(after);
        assert.ok(mb && ma && mb !== ma, `${level}: materiales distintos`);
        setWaterRipples(mb, [], 0); // otros tests dejan filas en el material compartido
        let live = 0;
        for (let t = 0; t < 70; t += 0.1) {
          windUniforms.uWind.value.w = t;
          before.updateMatrixWorld(true);
          after.updateMatrixWorld(true);
          live = Math.max(live, ma.uniforms.uRipples.value.filter((v) => v.w > 0).length);
          assert.ok(mb.uniforms.uRipples.value.every((v) => v.w === 0), `${level}: «Antes» sin anillos`);
        }
        assert.ok(live >= 1, `${level}: el «Después» sí tiene`);
        assert.equal(mb.uniforms.uWind, ma.uniforms.uWind, 'viento compartido');
      }
    }
  } finally {
    windUniforms.uWind.value.w = w0;
  }
});

test('nenúfar: flota sobre la cresta máxima del oleaje de su calidad + 1 cm (padLift), mínimo 1,5 cm', async () => {
  const { padLift } = await import('../src/game/render/assets/water.js');
  for (const level of ['low', 'medium', 'high']) {
    const g = makeLilyPad(() => 0.5, 1, 2, 3, { level });
    assert.ok(Math.abs(g.position.y - (2 + padLift(level))) < 1e-9, `${level}: y ${g.position.y}`);
    assert.ok(g.position.y - 2 >= swellMaxAmp(level) + 0.01 - 1e-12, `${level}: bajo la cresta`);
    assert.ok(padLift(level) >= 0.015);
  }
  assert.ok(padLift('high') > padLift('medium') && padLift('medium') > padLift('low'));
});
