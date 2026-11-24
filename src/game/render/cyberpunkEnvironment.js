import * as THREE from 'three';
import { softDotTexture } from './textures.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addNeonCity, CITY_LEGACY_DRAWS } from './assets/neonCity.js';

// la fachada determinista de N0 vive ahora con la ciudad nueva (assets/neonCity.js)
export { drawSkyscraperFacade } from './assets/neonCity.js';

function haloSprite(color, size) {
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softDotTexture(),
      color,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.scale.setScalar(size);
  return halo;
}

/**
 * Entorno Cyberpunk Futurista estilizado y ligero:
 * - Ciudad lejana (assets/neonCity.js, N2): torres escalonadas con agujas, antenas, helipuertos y franjas de neón
 * - 3 speeders lejanos en corredor aéreo de gran altitud (por encima de la ciudad)
 * - 2 searchlights suaves barriendo lentamente desde lo alto de dos torres
 * - Sol synthwave con franjas retro
 * - Props perimetrales minimalistas a distancia segura
 * - Máximo de intensidad emisiva estrictamente controlado para mantener el bloom <= 15%
 */

const textureCache = new Map();

/**
 * Textura de rejilla digital limpia para el terreno.
 */
export function getCyberGridTexture(lineColorHex, bgHex = 0x070814) {
  const lineCol = '#' + new THREE.Color(lineColorHex).getHexString();
  const bgCol = '#' + new THREE.Color(bgHex).getHexString();
  const cacheKey = `grid_${lineCol}_${bgCol}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bgCol;
  ctx.fillRect(0, 0, 256, 256);

  // Cuadrícula fina, en el neón del tema y tenue (N4: la rejilla es también el mapa de brillo del suelo)
  const lc = new THREE.Color(lineColorHex).getHex();
  ctx.strokeStyle = `rgba(${(lc >> 16) & 255}, ${(lc >> 8) & 255}, ${lc & 255}, 0.16)`;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0); ctx.lineTo(i, 256);
    ctx.moveTo(0, i); ctx.lineTo(256, i);
    ctx.stroke();
  }

  // Línea perimetral de neón nítida
  ctx.strokeStyle = lineCol;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 254, 254);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16);
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Sol synthwave con franjas retro en el horizonte.
 */
function buildSynthwaveSun(scene, theme, animated) {
  const [c1, c2] = theme.neon.map((c) => new THREE.Color(c));
  const sunDir = new THREE.Vector3(...theme.sunDir).normalize();

  const group = new THREE.Group();
  const radius = 22;
  const slices = 10;

  for (let i = 0; i < slices; i++) {
    const v0 = -1 + (i / slices) * 2;
    const v1 = -1 + ((i + 0.7) / slices) * 2;
    const y0 = v0 * radius;
    const y1 = v1 * radius;
    const h = y1 - y0;

    const t = i / (slices - 1);
    const col = new THREE.Color().copy(c1).lerp(new THREE.Color(0xffaa20), 1 - t).lerp(c2, t * 0.7);

    const w = Math.sqrt(Math.max(0, radius * radius - ((y0 + y1) / 2) ** 2)) * 2;
    if (w <= 0.5) continue;

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, depthWrite: false, fog: false })
    );
    plane.position.y = (y0 + y1) / 2;
    group.add(plane);
  }

  // Halo suave con opacidad contenida (sin bloom cegador)
  const halo = haloSprite(theme.neon[0], 44);
  halo.material.opacity = 0.3;
  group.add(halo);

  group.position.copy(sunDir).multiplyScalar(150);
  group.position.y = Math.max(14, group.position.y * 0.5);
  group.lookAt(0, group.position.y, 0);

  scene.add(group);
}

/**
 * Ciudad lejana (N2, assets/neonCity.js): rng propio, 0 tiradas nuevas. La ciudad vieja tiraba CITY_LEGACY_DRAWS
 * veces del rng del hoyo; se siguen tirando (y se descartan) para que el resto del decorado neón no se mueva.
 * ascii = grupo de addAsciiNeon del hoyo (la ciudad deja libres sus pilares). Devuelve el handle de addNeonCity.
 */
export function buildCyberSkyline(scene, decor, bounds, theme, rng, animated, q, ascii) {
  for (let i = 0; i < CITY_LEGACY_DRAWS; i++) rng();
  return addNeonCity(scene, { bounds, theme, level: q.lod, animated, ascii });
}

/**
 * 2 searchlights suaves y elegantes barriendo el cielo nocturno. bases = [{ x, y, z }] (mundo): nacen ahí (la cima
 * de dos torres de la ciudad); sin bases, en los dos sitios fijos de antes.
 */
export function buildLaserSearchlights(scene, bounds, theme, animated, bases = null) {
  const neon = theme.neon;
  const count = 2;
  const beams = [];
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;

  for (let i = 0; i < count; i++) {
    const angle = i === 0 ? 1.4 : 4.5;
    const r = 68;
    const base = bases?.[i];
    const x = base ? base.x : cx + Math.cos(angle) * r;
    const z = base ? base.z : cz + Math.sin(angle) * r;
    const baseY = base ? base.y : 36;

    const beamGeo = new THREE.ConeGeometry(2.8, 65, 10, 1, true);
    beamGeo.translate(0, 32.5, 0);

    const beamMat = new THREE.MeshBasicMaterial({
      color: neon[i % neon.length],
      transparent: true,
      opacity: 0.14, // Muy suave para no molestar ni recargar
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(x, baseY, z);
    beam.userData = { speed: 0.35 + i * 0.15, phase: i * 2.5 };
    scene.add(beam);
    beams.push(beam);
  }

  animated.push((t) => {
    for (const b of beams) {
      b.rotation.x = Math.sin(t * b.userData.speed + b.userData.phase) * 0.25;
      b.rotation.z = Math.cos(t * b.userData.speed * 0.8 + b.userData.phase) * 0.3;
    }
  });
}

/** Altura del corredor aéreo más bajo (m): por encima de la ciudad (CITY_LAYOUT.maxY) y bajo las naves ASCII. */
export const SKYWAY_Y = 33;

/**
 * 3 speeders lejanos en corredor aéreo de gran altitud.
 */
export function buildSkywayTraffic(scene, bounds, theme, animated) {
  const neon = theme.neon;
  const speeders = [];
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;

  const chassisMat = new THREE.MeshStandardMaterial({ color: 0x0e101c, metalness: 0.9, roughness: 0.3 });
  const headLightMat = new THREE.MeshBasicMaterial({ color: 0x88f5ff });
  const tailLightMat = new THREE.MeshBasicMaterial({ color: neon[1] ?? 0xff2bd6 });

  for (let i = 0; i < 3; i++) {
    const group = new THREE.Group();

    // Silueta aerodinámica discreta
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 4), chassisMat);
    body.rotation.x = Math.PI / 2;
    body.scale.set(1, 0.4, 1);
    group.add(body);

    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), headLightMat);
    hl.position.set(0, 0, 0.7);
    group.add(hl);

    const trailGeo = new THREE.CylinderGeometry(0.02, 0.08, 1.8, 4);
    trailGeo.rotateX(Math.PI / 2);
    const trail = new THREE.Mesh(
      trailGeo,
      new THREE.MeshBasicMaterial({ color: tailLightMat.color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending })
    );
    trail.position.set(0, 0, -0.9);
    group.add(trail);

    group.userData = {
      r: 76,
      y: SKYWAY_Y + i * 2.5,
      speed: 0.16 + i * 0.04,
      angle: (i / 3) * Math.PI * 2,
    };

    scene.add(group);
    speeders.push(group);
  }

  animated.push((t, dt) => {
    for (const sp of speeders) {
      sp.userData.angle += dt * sp.userData.speed;
      const a = sp.userData.angle;
      sp.position.set(cx + Math.cos(a) * sp.userData.r, sp.userData.y, cz + Math.sin(a) * sp.userData.r);
      const forwardAngle = a + Math.PI / 2;
      sp.rotation.y = -forwardAngle + Math.PI / 2;
    }
  });
}

// pilones y cristales holográficos (N3): assets/neonProps.js (geometrías y materiales compartidos, sin rng propio)
export { makeCyberPylon, makeHoloCrystal } from './assets/neonProps.js';

/**
 * Monta el entorno Cyberpunk limpio, estilizado y no recargado. opts.ascii = grupo de addAsciiNeon del hoyo.
 * Devuelve { city } (handle de la ciudad: hay que llamar a city.dispose() al cambiar de hoyo).
 */
export function setupCyberpunkEnvironment(scene, decor, bounds, theme, rng, animated, q, { ascii } = {}) {
  buildSynthwaveSun(scene, theme, animated);
  const city = buildCyberSkyline(scene, decor, bounds, theme, rng, animated, q, ascii);
  buildLaserSearchlights(scene, bounds, theme, animated, city.beamBases);
  buildSkywayTraffic(scene, bounds, theme, animated);
  return { city };
}

/**
 * Detalles de ciudad solo para el hoyo 15 (tema cyber2078): cables que bajan del borde de la
 * plataforma hacia los rascacielos y letreros verticales entre las torres. Solo render, sin física.
 */
export function buildCyberCity(scene, decor, bounds, theme, rng, animated, q) {
  const neon = theme.neon;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  buildPlatformEdge(scene, bounds, neon, animated);
  const cableCount = q.decor >= 1 ? 10 : 5;
  const cableMats = [neon[0], neon[1]].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.5 }));

  // cables: del borde de la plataforma (y casi a ras) a un punto bajo la ciudad, con caída
  for (let k = 0; k < cableCount; k++) {
    const side = k % 4;
    const t = 0.15 + 0.7 * rng();
    let sx = 0, sz = 0, px, pz;
    if (side === 0) { px = bounds.minX + (bounds.maxX - bounds.minX) * t; pz = bounds.maxZ; sz = 1; }
    else if (side === 1) { px = bounds.minX + (bounds.maxX - bounds.minX) * t; pz = bounds.minZ; sz = -1; }
    else if (side === 2) { px = bounds.maxX; pz = bounds.minZ + (bounds.maxZ - bounds.minZ) * t; sx = 1; }
    else { px = bounds.minX; pz = bounds.minZ + (bounds.maxZ - bounds.minZ) * t; sx = -1; }
    const reach = 22 + rng() * 10;
    const ex = px + sx * reach + (cx - px) * 0.1, ez = pz + sz * reach + (cz - pz) * 0.1, ey = -5 - rng() * 2;
    const start = new THREE.Vector3(px, 0.25, pz);
    const end = new THREE.Vector3(ex, ey, ez);
    const len = start.distanceTo(end);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 4), cableMats[k % 2]);
    cable.position.copy(start).add(end).multiplyScalar(0.5);
    cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
    decor.add(cable);
  }

  // letreros verticales entre las torres, mirando al centro del hoyo
  const signMat = (txt) => new THREE.MeshBasicMaterial({ map: verticalSignTexture(neon, txt), transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const signCount = q.decor >= 1 ? 4 : 2;
  for (let k = 0; k < signCount; k++) {
    const a = (k / signCount) * Math.PI * 2 + 0.4;
    const dist = 52 + (k % 2) * 10;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 9), signMat(k));
    sign.position.set(cx + Math.cos(a) * dist, 9, cz + Math.sin(a) * dist);
    sign.lookAt(cx, 9, cz);
    sign.userData.keep = true;
    scene.add(sign);
  }
}

/**
 * Borde de neón de la plataforma: cuatro tiras finas en el canto del campo, fusionadas en una
 * sola malla. Los cables de buildCyberCity salen de este mismo borde hacia la ciudad.
 */
function buildPlatformEdge(scene, bounds, neon, animated) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const y = 0.02, w = 0.06;
  const parts = [
    [(minX + maxX) / 2, maxZ, maxX - minX, 0],
    [(minX + maxX) / 2, minZ, maxX - minX, 0],
    [maxX, (minZ + maxZ) / 2, maxZ - minZ, Math.PI / 2],
    [minX, (minZ + maxZ) / 2, maxZ - minZ, Math.PI / 2],
  ].map(([x, z, len, rot]) => {
    const g = new THREE.BoxGeometry(rot ? w : len, 0.05, rot ? len : w);
    g.translate(x, y, z);
    return g;
  });
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(neon[0]) });
  const base = mat.color.clone();
  scene.add(new THREE.Mesh(mergeGeometries(parts), mat));
  // latido lento del neón (solo cambia el color del material, sin mallas nuevas)
  animated.push((t) => mat.color.copy(base).multiplyScalar(0.8 + 0.2 * Math.sin(t * 1.3)));
}

const verticalSignCache = new Map();
function verticalSignTexture(themeColors, variant) {
  const [c1, c2] = themeColors.map((c) => '#' + new THREE.Color(c).getHexString());
  const key = `vsign_${variant % 2}_${c1}_${c2}`;
  if (verticalSignCache.has(key)) return verticalSignCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#05060d';
  ctx.fillRect(0, 0, 128, 512);
  // barras verticales de neón y bloques apilados, como un letrero vertical
  const color = variant % 2 === 0 ? c1 : c2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, 104, 488);
  for (let y = 60; y < 480; y += 70) {
    ctx.fillStyle = y % 140 === 60 ? c1 : c2;
    ctx.fillRect(30, y, 68, 26);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  verticalSignCache.set(key, tex);
  return tex;
}
