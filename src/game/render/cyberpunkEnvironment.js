import * as THREE from 'three';
import { softDotTexture } from './textures.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
 * - Silueta de megaciudad lejana (12 monolitos elegantes a distancia segura, sin sobrecargar la escena)
 * - 2 carteles holográficos flotantes en el horizonte
 * - 3 speeders lejanos en corredor aéreo de gran altitud
 * - 2 searchlights suaves barriendo lentamente
 * - Sol synthwave con franjas retro
 * - Props perimetrales minimalistas a distancia segura
 * - Máximo de intensidad emisiva estrictamente controlado para mantener el bloom <= 15%
 */

const textureCache = new Map();

/**
 * Textura procedural de fachada con ventanas discretas y sutiles.
 */
export function getSkyscraperTexture(themeColors) {
  const [c1, c2] = themeColors.map((c) => '#' + new THREE.Color(c).getHexString());
  const cacheKey = `sky_${c1}_${c2}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Fondo obsidiana arquitectónico
  ctx.fillStyle = '#090b16';
  ctx.fillRect(0, 0, 256, 256);

  // Columnas estructurales
  ctx.strokeStyle = '#141728';
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
  }

  // Ventanas de datos tenues (sin sobreiluminar para no disparar el bloom)
  const cols = 8;
  const rows = 16;
  const w = 256 / cols;
  const h = 256 / rows;

  for (let r = 0; r < rows; r++) {
    const floorLit = (r % 3 === 0);
    for (let c = 0; c < cols; c++) {
      const isLit = floorLit ? Math.random() < 0.6 : Math.random() < 0.2;
      if (isLit) {
        ctx.fillStyle = Math.random() < 0.6 ? c1 : c2;
        ctx.fillRect(c * w + 6, r * h + 4, w - 12, h - 8);
      } else {
        ctx.fillStyle = '#101322';
        ctx.fillRect(c * w + 6, r * h + 4, w - 12, h - 8);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

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

  // Cuadrícula fina
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
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
 * Textura para cartel holográfico flotante.
 */
function getHoloBannerTexture(themeColors, isAlt = false) {
  const [c1, c2] = themeColors.map((c) => '#' + new THREE.Color(c).getHexString());
  const cacheKey = `banner_${isAlt}_${c1}_${c2}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#060714';
  ctx.fillRect(0, 0, 512, 256);

  // Marco cyber
  ctx.strokeStyle = c1;
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 500, 244);

  // Scanlines
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  for (let y = 0; y < 256; y += 4) ctx.fillRect(0, y, 512, 2);

  if (!isAlt) {
    ctx.font = 'bold 42px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('NEON CITY', 256, 100);

    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = c2;
    ctx.fillText('ネオン · 2088', 256, 155);

    ctx.font = '16px monospace';
    ctx.fillStyle = c1;
    ctx.fillText('[ SECTOR 09 // ONLINE ]', 256, 205);
  } else {
    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = c2;
    ctx.textAlign = 'center';
    ctx.fillText('CYBER GOLF', 256, 85);

    // Barras de ecualizador limpias
    for (let i = 0; i < 16; i++) {
      const bh = 25 + Math.abs(Math.sin(i * 0.5) * 65);
      ctx.fillStyle = i % 2 === 0 ? c1 : c2;
      ctx.fillRect(80 + i * 22, 200 - bh, 14, bh);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
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
 * Megaciudad lejana y estilizada: 12 monolitos elegantes a distancia segura (> 55 unidades).
 */
export function buildCyberSkyline(scene, decor, bounds, theme, rng, animated, q) {
  const neon = theme.neon;
  const winTex = getSkyscraperTexture(neon);

  const buildingMat = new THREE.MeshLambertMaterial({
    map: winTex,
    color: 0x181a2e,
    emissiveMap: winTex,
    emissive: 0xffffff,
    emissiveIntensity: 0.25, // Controlado para bloom <= 15%
  });

  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x0a0c16,
    metalness: 0.85,
    roughness: 0.3,
  });

  const neonMat = new THREE.MeshStandardMaterial({
    color: neon[0],
    emissive: neon[0],
    emissiveIntensity: 0.35, // Controlado para bloom <= 15%
    roughness: 0.3,
  });

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;

  // Solo 12 torres majestuosas y bien espaciadas en el horizonte (liviano y elegante)
  const towerCount = 12;
  const beacons = [];

  for (let i = 0; i < towerCount; i++) {
    const angle = (i / towerCount) * Math.PI * 2 + (rng() - 0.5) * 0.15;
    // Distancia generosa para despejar totalmente la vista del campo
    const dist = 60 + (i % 3) * 14;

    const x = cx + Math.cos(angle) * dist;
    const z = cz + Math.sin(angle) * dist;

    const h = 32 + (i % 4) * 8 + rng() * 10;
    const w = 6 + (i % 2) * 2;
    const d = 6 + ((i + 1) % 2) * 2;

    const tower = new THREE.Group();
    tower.position.set(x, h / 2 - 2, z);

    // 1. Monolito geométrico
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
    tower.add(body);

    // 2. Línea de neón vertical única y refinada en la arista frontal
    const edgeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.18, h + 0.1, 0.18), neonMat);
    edgeStrip.position.set(w / 2, 0, d / 2);
    tower.add(edgeStrip);

    // 3. Remate de aguja con baliza sutil
    const antH = 6 + rng() * 4;
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.14, antH, 6), darkMetalMat);
    antenna.position.set(0, h / 2 + antH / 2, 0);
    tower.add(antenna);

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 6),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? neon[0] : neon[1] })
    );
    beacon.position.set(0, h / 2 + antH, 0);
    beacon.userData.keep = true;
    beacon.userData.phase = i * 1.2;
    tower.add(beacon);
    beacons.push(beacon);

    tower.lookAt(cx, tower.position.y, cz);
    decor.add(tower);
  }

  // Parpadeo suave de balizas
  animated.push((t) => {
    for (const b of beacons) {
      b.visible = Math.sin(t * 3.5 + b.userData.phase) > 0.1;
    }
  });

  // Solo 2 carteles holográficos flotantes elegantes en el horizonte
  for (let k = 0; k < 2; k++) {
    const angle = k === 0 ? 0.8 : 3.4;
    const dist = 74;
    const hx = cx + Math.cos(angle) * dist;
    const hz = cz + Math.sin(angle) * dist;
    const hy = 26 + k * 4;

    const bannerTex = getHoloBannerTexture(neon, k === 1);
    const bannerMat = new THREE.MeshBasicMaterial({
      map: bannerTex,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
    });

    const bannerMesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), bannerMat);
    bannerMesh.position.set(hx, hy, hz);
    bannerMesh.lookAt(cx, hy, cz);
    bannerMesh.userData.keep = true;
    scene.add(bannerMesh);
  }
}

/**
 * 2 searchlights suaves y elegantes barriendo el cielo nocturno.
 */
export function buildLaserSearchlights(scene, bounds, theme, animated) {
  const neon = theme.neon;
  const count = 2;
  const beams = [];
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;

  for (let i = 0; i < count; i++) {
    const angle = i === 0 ? 1.4 : 4.5;
    const r = 68;
    const x = cx + Math.cos(angle) * r;
    const z = cz + Math.sin(angle) * r;
    const baseY = 36;

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
      y: 28 + i * 3,
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

/**
 * Baliza de neón perimetral minimalista a distancia segura.
 */
export function makeCyberPylon(x, y, z, themeColors, lit = false) {
  const g = new THREE.Group();
  const color = themeColors[0];

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x121422, metalness: 0.8, roughness: 0.35 });
  const glowMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 });

  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.8, 0.07), poleMat);
  pole.position.y = 0.9;
  g.add(pole);

  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.3), glowMat);
  lightBar.position.set(0, 1.75, 0.12);
  g.add(lightBar);

  const halo = haloSprite(color, 1.4);
  halo.position.set(0, 1.75, 0.12);
  halo.material.opacity = 0.35;
  g.add(halo);

  g.position.set(x, y, z);
  return g;
}

/**
 * Cristal holográfico de datos flotante y estilizado.
 */
export function makeHoloCrystal(x, y, z, themeColors, rng, animated) {
  const g = new THREE.Group();
  const c = themeColors[Math.floor(rng() * themeColors.length)];

  const baseMat = new THREE.MeshStandardMaterial({ color: 0x141624, roughness: 0.45 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.25, 6), baseMat);
  base.position.y = 0.12;
  g.add(base);

  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.25, 0),
    new THREE.MeshStandardMaterial({
      color: c,
      emissive: c,
      emissiveIntensity: 0.35, // Controlado para bloom <= 15%
      roughness: 0.2,
      metalness: 0.5,
    })
  );
  crystal.position.y = 0.9;
  crystal.userData.keep = true;
  g.add(crystal);

  const halo = haloSprite(c, 1.2);
  halo.position.y = 0.9;
  halo.material.opacity = 0.3;
  g.add(halo);

  g.position.set(x, y, z);

  if (animated) {
    animated.push((t) => {
      crystal.rotation.y += 0.02;
      crystal.position.y = 0.9 + Math.sin(t * 2 + z) * 0.08;
      halo.position.y = crystal.position.y;
    });
  }

  return g;
}

/**
 * Monta el entorno Cyberpunk limpio, estilizado y no recargado.
 */
export function setupCyberpunkEnvironment(scene, decor, bounds, theme, rng, animated, q) {
  buildSynthwaveSun(scene, theme, animated);
  buildCyberSkyline(scene, decor, bounds, theme, rng, animated, q);
  buildLaserSearchlights(scene, bounds, theme, animated);
  buildSkywayTraffic(scene, bounds, theme, animated);
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
