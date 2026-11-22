// Parches de agua del laboratorio (44 x 44 m): una meseta de tierra con un lago (orilla de
// pendiente distinta a cada lado) o con un río que la cruza serpenteando, y juncos y
// nenúfares en la orilla. «Antes» = el agua de hoy (plano de Phong con facetas y olas de seno,
// copiado de environment.js, que no se toca) con los juncos/nenúfares de flora.js; «Después»
// = assets/water.js (lago/río con material compartido, normal-map, fresnel, espuma) con los
// juncos y nenúfares nuevos. En los dos lados la orilla se junta con bakeStatic, como en el juego.
// Solo desarrollo: no entra en el build.
import * as THREE from 'three';
import { addWater, makeReeds, makeLilyPad, waterSupported } from '../../game/render/assets/water.js';
import { floraOf, makeLilyPad as oldLilyPad, makeReeds as oldReeds, warpCoord } from '../../game/render/flora.js';
import { windUniforms } from '../../game/render/assets/wind.js';
import { bakeStatic } from '../../game/render/batch.js';
import { seededRng } from '../assetRegistry.js';

const HALF = 22; // el parche mide 44 x 44 m
export const LAB_WATER_Y = 0.8; // nivel del agua (encima del suelo del laboratorio, que está a 0)
const GROUND = 1.35; // la meseta (0,55 m sobre el agua, como la orilla del juego: lejos del umbral de seco)
const BED = 0.05; // fondo del lago
const DRY = GROUND + 1; // fuera del parche: seco (el agua nueva no dibuja nada ahí)
const OLD_CELL = 220 / 90; // celda del agua de hoy (plano de 220 m con 90 x 90)

// ---------- terreno ----------

const lakeR = (a) => 8.5 + 1.2 * Math.sin(3 * a + 0.5) + 0.7 * Math.sin(5 * a + 1.3);
/** Lago: taza irregular, con la orilla de levante (x > 0) más tendida (más espuma). */
export function lakeHeight(x, z) {
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return DRY;
  const dx = x - 1, dz = z - 2, a = Math.atan2(dz, dx);
  const s = Math.hypot(dx, dz) / lakeR(a);
  return BED + (GROUND - BED) * THREE.MathUtils.smoothstep(s, 0.55, 1.1 + 0.3 * Math.max(0, Math.cos(a)));
}

/** Río del parche con la misma forma y el mismo contrato que flora.makeRiver (a lo largo de z). */
export function labRiver() {
  const w = 2.1, y = LAB_WATER_Y, bed = y - 0.7;
  const center = (t) => Math.sin(t * 0.11 + 0.4) * 2.2 + Math.sin(t * 0.27 + 1.1) * 0.8;
  const slope = (t) => 0.11 * 2.2 * Math.cos(t * 0.11 + 0.4) + 0.27 * 0.8 * Math.cos(t * 0.27 + 1.1);
  const dist = (x, z) => Math.abs(x - center(z)) / Math.sqrt(1 + slope(z) ** 2);
  const carve = (x, z, h) => {
    const d = dist(x, z);
    if (d > w + 9) return h;
    const bank = THREE.MathUtils.clamp(2.6 + (h - y) * 0.9, 2.6, 6);
    const k = 1 - THREE.MathUtils.smoothstep(d, w, w + bank);
    const floor = bed + (y + 0.25 - bed) * THREE.MathUtils.smoothstep(d, w * 0.35, w * 1.25);
    return h + (Math.min(h, floor) - h) * k;
  };
  const along = (t, lateral = 0) => [center(t) + lateral, t];
  return { dist, carve, y, w, along, grounded: true };
}
const RIVER = labRiver();
export function riverHeight(x, z) {
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) return DRY;
  return RIVER.carve(x, z, GROUND);
}

/** Meseta del parche: el borde baja de golpe al suelo del laboratorio. */
function ground(theme, heightAt) {
  const geo = new THREE.PlaneGeometry(2 * HALF, 2 * HALF, 88, 88);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const low = new THREE.Color(theme.groundLow ?? theme.groundMid), mid = new THREE.Color(theme.groundMid), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), edge = Math.abs(x) >= HALF - 1e-6 || Math.abs(z) >= HALF - 1e-6;
    const y = edge ? 0 : heightAt(x, z);
    p.setY(i, y);
    // la orilla pasa a la tierra baja con un degradado (como environment.js)
    c.copy(mid).lerp(low, 1 - THREE.MathUtils.smoothstep(y, LAB_WATER_Y + 0.2, LAB_WATER_Y + 0.7));
    c.toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.receiveShadow = true;
  return m;
}

// ---------- el agua de hoy (copia de environment.js: Phong con facetas + waterShader) ----------

const oldTime = { get value() { return windUniforms.uWind.value.w; } };
function oldWaterMaterial(theme) {
  const m = new THREE.MeshPhongMaterial({ color: theme.water ?? (theme.sunIntensity < 2 ? 0x1b5f86 : 0x2bb3e6), shininess: 110, specular: 0xffffff, transparent: true, opacity: 0.86, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = oldTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vWave;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float w1 = sin(position.x * 0.35 + uTime * 1.3) * 0.08;
        float w2 = cos(position.z * 0.4 + uTime * 1.1) * 0.08;
        float w3 = sin((position.x + position.z) * 0.9 + uTime * 2.1) * 0.025;
        transformed.y += w1 + w2 + w3;
        vWave = (w1 + w2 + w3) * 5.0;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWave;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb += vec3(0.12, 0.16, 0.18) * smoothstep(0.35, 0.8, vWave);');
  };
  m.customProgramCacheKey = () => 'lab-old-water';
  return m;
}
/** El plano de hoy recortado al parche, con su tamaño de celda del juego (2,44 m). */
function oldWater(theme) {
  const seg = Math.round((2 * HALF) / OLD_CELL);
  const geo = new THREE.PlaneGeometry(2 * HALF, 2 * HALF, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, oldWaterMaterial(theme));
  m.position.y = LAB_WATER_Y;
  return m;
}

// ---------- orilla ----------

const greenBank = (theme) => floraOf(theme).ground === 'grass';

/** Sitios de juncos y nenúfares (los mismos antes y después: salen del rng del parche). */
function lakeSpots(rng) {
  const reeds = [], pads = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + (rng() - 0.5) * 0.2;
    // de la orilla hacia fuera hasta que el suelo asoma 3-15 cm sobre el agua
    const lift = 0.03 + rng() * 0.12;
    let r = 4;
    while (r < 16 && lakeHeight(1 + Math.cos(a) * r, 2 + Math.sin(a) * r) < LAB_WATER_Y + lift) r += 0.1;
    if (rng() < 0.75) reeds.push([1 + Math.cos(a) * r, 2 + Math.sin(a) * r]);
  }
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2, r = 2 + rng() * 4.5;
    pads.push([1 + Math.cos(a) * r, 2 + Math.sin(a) * r]);
  }
  return { reeds, pads };
}
function riverSpots(rng) {
  const reeds = [], pads = [];
  // como environment.js: a ambos lados del cauce cada 1,6 m, y nenúfares en los remansos
  for (let t = -HALF + 1; t < HALF - 1; t += 1.6) {
    for (const side of [-1, 1]) {
      const r = rng(), lat = side * (RIVER.w + 0.15 + rng() * 1.1);
      const [x, z] = RIVER.along(t + (rng() - 0.5), lat);
      if (r < 0.55 && riverHeight(x, z) > RIVER.y - 0.05) reeds.push([x, z]);
    }
    if (rng() < 0.2) pads.push(RIVER.along(t, (rng() - 0.5) * RIVER.w * 1.2));
  }
  return { reeds, pads };
}

/** Juncos y nenúfares juntados con bakeStatic (como el decorado del juego). */
function shore(spots, heightAt, theme, makeR, makeP) {
  const out = new THREE.Group();
  if (!greenBank(theme)) return out;
  const root = new THREE.Group();
  spots.reeds.forEach(([x, z], i) => root.add(makeR(seededRng(1000 + i), x, heightAt(x, z), z)));
  spots.pads.forEach(([x, z], i) => root.add(makeP(seededRng(2000 + i), x, LAB_WATER_Y, z)));
  bakeStatic(root, out);
  return out;
}

function patch(theme, heightAt, content) {
  const g = new THREE.Group();
  g.add(ground(theme, heightAt), content);
  // el laboratorio mide solo el agua y la orilla (no la meseta) y mira desde más lejos
  g.userData.lab = { measure: content, keepShadows: true, dist: 26, target: [0, LAB_WATER_Y, 0] };
  return g;
}

function oldPatch(kind, rng, preset) {
  const theme = preset.sceneTheme;
  const heightAt = kind === 'lake' ? lakeHeight : riverHeight;
  const spots = kind === 'lake' ? lakeSpots(rng) : riverSpots(rng);
  const content = new THREE.Group();
  content.add(oldWater(theme), shore(spots, heightAt, theme, oldReeds, oldLilyPad));
  return patch(theme, heightAt, content);
}

function newPatch(kind, rng, preset) {
  const theme = preset.sceneTheme;
  if (!waterSupported(theme)) return null; // lava y caldera no cambian
  const heightAt = kind === 'lake' ? lakeHeight : riverHeight;
  const spots = kind === 'lake' ? lakeSpots(rng) : riverSpots(rng);
  const level = preset.level;
  const content = new THREE.Group();
  // la rejilla del lago es la del juego (220 m con el mismo enfoque que el terreno): aquí solo quedan sus celdas con agua
  addWater(content, { size: 220, center: [0, 0], y: LAB_WATER_Y, heightAt, river: kind === 'river' ? RIVER : null, level, theme, warp: warpCoord });
  content.add(
    shore(
      spots,
      heightAt,
      theme,
      (r, x, y, z) => makeReeds(r, x, y, z, { level }),
      (r, x, y, z) => makeLilyPad(r, x, y, z, { level }),
    ),
  );
  return patch(theme, heightAt, content);
}

export const oldLakePatch = (rng, preset) => oldPatch('lake', rng, preset);
export const newLakePatch = (rng, preset) => newPatch('lake', rng, preset);
export const oldRiverPatch = (rng, preset) => oldPatch('river', rng, preset);
export const newRiverPatch = (rng, preset) => newPatch('river', rng, preset);
