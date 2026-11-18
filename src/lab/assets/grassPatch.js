// Parche de césped del laboratorio (~19 x 22 m): un trozo de pista con tee y bola,
// el suelo y la hierba alrededor. «Antes» = addGrassField (flora.js) + las matas
// sueltas de hoy (makeTuft o makeGrassClump en la pradera); «Después» = el césped
// nuevo (assets/grass.js) sobre un suelo que usa su mismo color (grassGroundColor).
// Solo desarrollo: no entra en el build.
import * as THREE from 'three';
import { addGrassField, floraOf, groundDetailTexture } from '../../game/render/flora.js';
import { makeGrassClump } from '../../game/render/lushEnvironment.js';
import { applyWind } from '../../game/render/assets/wind.js';
import { makeGrassField, grassGroundColor } from '../../game/render/assets/grass.js';
import { BALL_R } from '../../game/physics.js';

// pista de 2,5 x 6 m y 8 m de hierba alrededor
const BOUNDS = { minX: -1.25, maxX: 1.25, minZ: -3, maxZ: 3 };
const REACH = 8;
const TEE = [0, -2.6];
const BALL = [0.4, 1.8];
const W = BOUNDS.maxX - BOUNDS.minX + 2 * REACH, D = BOUNDS.maxZ - BOUNDS.minZ + 2 * REACH;
// Un campo de verdad reparte sus matas por un hoyo mucho más grande (6 x 24 m con 15 m
// de alcance). Para ver en el parche la misma densidad por metro cuadrado que en el
// juego, las matas se recortan en la misma proporción en «antes» y «después».
const AREA = (W * D) / ((6 + 30) * (24 + 30));

const heightAt = () => 0;
// la misma exclusión que environment.js pasa hoy a addGrassField (aquí no hay agua ni río)
const ok = (x, z) => Math.hypot(x - TEE[0], z - TEE[1]) > 1.2;
const distBox = (x, z) => Math.hypot(Math.max(BOUNDS.minX - x, 0, x - BOUNDS.maxX), Math.max(BOUNDS.minZ - z, 0, z - BOUNDS.maxZ));

const themeTint = (theme, flora) => flora.tint ?? [new THREE.Color(theme.groundMid).getHex(), new THREE.Color(theme.groundHigh).offsetHSL(0, 0.06, 0.1).getHex()];

/** Pista, tee, hoyo y bola: lo que la hierba no debe tapar. */
function markers(theme) {
  const g = new THREE.Group();
  const flat = (w, d, color, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = true;
    return m;
  };
  const fairway = flat(BOUNDS.maxX - BOUNDS.minX, BOUNDS.maxZ - BOUNDS.minZ, theme.grass?.[0] ?? theme.groundHigh, 0.02);
  const teeMat = flat(0.8, 0.8, 0x6b4a2b, 0.03);
  teeMat.position.set(TEE[0], 0.03, TEE[1]);
  const cup = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  cup.rotation.x = -Math.PI / 2;
  cup.position.set(0, 0.025, 2.4);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 12), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  ball.position.set(BALL[0], 0.02 + BALL_R, BALL[1]);
  g.add(fairway, teeMat, cup, ball);
  return g;
}

/** Suelo del parche; colorAt(x, z, out) da el color de cada vértice (null = color liso). */
function ground(theme, colorAt) {
  const kind = floraOf(theme).ground;
  const geo = new THREE.PlaneGeometry(W, D, 48, 56);
  geo.rotateX(-Math.PI / 2);
  // UV en metros / 3, como el terreno del juego (la textura de detalle se repite cada ~3 m)
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * W) / 3, (uv.getY(i) * D) / 3);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) (colorAt ? colorAt(p.getX(i), p.getZ(i), c) : c.set(theme.groundMid)).toArray(col, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: kind ? groundDetailTexture(kind) : null }));
  m.position.y = 0.012;
  m.receiveShadow = true;
  return m;
}

// copia de makeTuft (environment.js no la exporta): las matas altas de hoy en la rama normal
const tuftMats = new Map();
function oldTuft(rng, x, y, z, theme) {
  if (!tuftMats.has(theme.groundHigh)) tuftMats.set(theme.groundHigh, applyWind(new THREE.MeshLambertMaterial({ color: new THREE.Color(theme.groundHigh).multiplyScalar(0.85), flatShading: true }), { layer: 'grass' }));
  const mat = tuftMats.get(theme.groundHigh);
  const g = new THREE.Group();
  const n = 4 + Math.floor(rng() * 4);
  for (let k = 0; k < n; k++) {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.3 + rng() * 0.25, 3), mat);
    const a = rng() * Math.PI * 2;
    blade.position.set(Math.cos(a) * 0.06, 0.15, Math.sin(a) * 0.06);
    blade.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    g.add(blade);
  }
  g.userData.swayRoot = true;
  g.position.set(x, y - 0.02, z);
  return g;
}
const lushClumpMats = new Map();
function oldClump(rng, x, y, z, theme) {
  if (!lushClumpMats.has(theme.groundHigh)) lushClumpMats.set(theme.groundHigh, applyWind(new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.groundHigh).multiplyScalar(0.9), vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), { layer: 'grass' }));
  return makeGrassClump(rng, x, y, z, lushClumpMats.get(theme.groundHigh));
}

function patch(theme, content, groundMesh) {
  const g = new THREE.Group();
  g.add(groundMesh, markers(theme), content);
  // el laboratorio mide solo la hierba, no toca sus sombras y mira desde más cerca
  g.userData.lab = { measure: content, keepShadows: true, dist: 12, target: [0, 0.3, 0] };
  return g;
}

/** «Antes»: hierba instanciada de hoy + matas sueltas de hoy. */
export function oldGrassPatch(rng, preset) {
  const theme = preset.sceneTheme;
  const flora = floraOf(theme);
  const content = new THREE.Group();
  if (flora.grass > 0 && preset.grass > 0) {
    addGrassField(content, { bounds: BOUNDS, heightAt, ok, rng, density: flora.grass * preset.grass * AREA, tint: themeTint(theme, flora), reach: REACH });
  }
  // matas altas: environment.js prueba 90 x decor sitios (220 en la pradera) a 1-14 m de la pista
  const tries = Math.round((theme.lushEnv ? 220 : 90) * preset.decor * AREA);
  for (let i = 0; i < tries; i++) {
    const x = (rng() - 0.5) * W, z = (rng() - 0.5) * D, d = distBox(x, z);
    if (d < 1 || d > REACH) continue;
    content.add(theme.lushEnv ? oldClump(rng, x, 0, z, theme) : oldTuft(rng, x, 0, z, theme));
  }
  return patch(theme, content, ground(theme, null));
}

/** «Después»: césped nuevo (una llamada de dibujo) sobre un suelo de su mismo color. */
export function newGrassPatch(rng, preset) {
  const theme = preset.sceneTheme;
  const flora = floraOf(theme);
  const tint = themeTint(theme, flora);
  const { group } = makeGrassField({ bounds: BOUNDS, heightAt, ok, rng, density: flora.grass * AREA, tint, reach: REACH, level: preset.level });
  return patch(theme, group, ground(theme, (x, z, out) => grassGroundColor(x, z, tint, out)));
}
