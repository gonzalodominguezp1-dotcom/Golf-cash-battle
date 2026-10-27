import * as THREE from 'three';
import { loopTable, tubeTable } from '../physics.js';
import { loopPoint } from './terrain.js';

// Atracciones de minigolf: loopings, molinos, tubos y pasadizos. Cada una
// tiene tres estilos: de día, de noche (con luces) y neón.

/** Estilo de las atracciones según el tema del hoyo. */
export function attractionStyle(theme) {
  if (theme.neon) return { kind: 'neon', colors: theme.neon };
  if (theme.caldera) return { kind: 'lava', colors: [0xff6a1a, 0xffa040, 0xff3d1a] };
  if (theme.lanterns || theme.stars) return { kind: 'night', colors: [0xffc46b, 0x6bd5ff, 0xff7ad9] };
  return { kind: 'day', colors: [0xff5a4e, 0x3d8bff, 0xffc145], wood: !!theme.woodMill };
}

// GLOW ajustado para que los brillos nunca excedan el 15% de bloom
const GLOW = 0.35;
const glowMat = (color, intensity = 1.0) =>
  new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: Math.min(0.35, intensity * GLOW),
    roughness: 0.35,
  });

/** Textura de cheurones de avance animados en la pista del looping. */
function loopChevronTexture(color, kind) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 256);

  const hex = typeof color === 'string' ? color : `#${(color || 0x00ffff).toString(16).padStart(6, '0')}`;
  ctx.strokeStyle = hex;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (kind !== 'day') {
    ctx.shadowColor = hex;
    ctx.shadowBlur = 12;
  }

  for (let y = 32; y < 256; y += 64) {
    ctx.beginPath();
    ctx.moveTo(14, y + 18);
    ctx.lineTo(32, y - 6);
    ctx.lineTo(50, y + 18);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 4);
  return tex;
}

/** Textura antideslizante para las chapas de transición de entrada y salida. */
function metalPlateTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1c2030';
  ctx.fillRect(0, 0, 128, 128);

  ctx.strokeStyle = '#323a54';
  ctx.lineWidth = 2.5;
  for (let i = -128; i < 256; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i, 128);
    ctx.lineTo(i + 128, 0);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

/** Looping: carril realista con sección transversal sólida en U, estructura portante en celosía y arco de entrada. */
export function buildLoop(scene, loop, style, i = 0) {
  const g = new THREE.Group();
  const N = 150;
  const S = loopTable(loop).length;
  const color = style.colors[i % style.colors.length];
  const isNeon = style.kind === 'neon';
  const isNight = style.kind === 'night';

  const halfW = 0.28;  // Semianchura de la pista interior
  const curbW = 0.045; // Anchura del bordillo
  const curbH = 0.075; // Altura del bordillo de seguridad
  const thk = 0.055;   // Grosor del casco inferior

  // 1. Muestreo de la trayectoria con marco ortonormal (tangente, normal y lateral)
  const slices = [];
  const railPtsL = [], railPtsR = [];

  for (let k = 0; k <= N; k++) {
    const p = (k / N) * S;
    const q = loopPoint(loop, p, 0);
    const cx = q.x, cy = q.y, cz = q.z;
    const nx = q.dx * q.nAlong, ny = q.nY, nz = q.dz * q.nAlong;

    // Tangente calculada numéricamente a lo largo de la trayectoria
    const pNext = Math.min(S, p + 0.04), pPrev = Math.max(0, p - 0.04);
    const qN = loopPoint(loop, pNext, 0), qP = loopPoint(loop, pPrev, 0);
    let tx = qN.x - qP.x, ty = qN.y - qP.y, tz = qN.z - qP.z;
    const tLen = Math.hypot(tx, ty, tz) || 1;
    tx /= tLen; ty /= tLen; tz /= tLen;

    // Vector lateral L = T x N
    let lx = ty * nz - tz * ny, ly = tz * nx - tx * nz, lz = tx * ny - ty * nx;
    const lLen = Math.hypot(lx, ly, lz) || 1;
    lx /= lLen; ly /= lLen; lz /= lLen;

    // Asegurar orientación hacia la derecha de la pista
    const sideDirX = -loop.dir[1], sideDirZ = loop.dir[0];
    if (lx * sideDirX + lz * sideDirZ < 0) {
      lx = -lx; ly = -ly; lz = -lz;
    }

    // Puntos de la sección transversal
    const bLx = cx - lx * halfW, bLy = cy - ly * halfW, bLz = cz - lz * halfW;
    const bRx = cx + lx * halfW, bRy = cy + ly * halfW, bRz = cz + lz * halfW;

    const cInLx = bLx + nx * curbH, cInLy = bLy + ny * curbH, cInLz = bLz + nz * curbH;
    const cInRx = bRx + nx * curbH, cInRy = bRy + ny * curbH, cInRz = bRz + nz * curbH;

    const cTopLx = cInLx - lx * curbW, cTopLy = cInLy - ly * curbW, cTopLz = cInLz - lz * curbW;
    const cTopRx = cInRx + lx * curbW, cTopRy = cInRy + ly * curbW, cTopRz = cInRz + lz * curbW;

    const hBotLx = cx - lx * (halfW + curbW) - nx * thk;
    const hBotLy = cy - ly * (halfW + curbW) - ny * thk;
    const hBotLz = cz - lz * (halfW + curbW) - nz * thk;

    const hBotRx = cx + lx * (halfW + curbW) - nx * thk;
    const hBotRy = cy + ly * (halfW + curbW) - ny * thk;
    const hBotRz = cz + lz * (halfW + curbW) - nz * thk;

    const hKeelX = cx - nx * (thk + 0.025);
    const hKeelY = cy - ny * (thk + 0.025);
    const hKeelZ = cz - nz * (thk + 0.025);

    slices.push({
      cx, cy, cz, nx, ny, nz, lx, ly, lz, p,
      bL: [bLx, bLy, bLz], bR: [bRx, bRy, bRz],
      cInL: [cInLx, cInLy, cInLz], cInR: [cInRx, cInRy, cInRz],
      cTopL: [cTopLx, cTopLy, cTopLz], cTopR: [cTopRx, cTopRy, cTopRz],
      hBotL: [hBotLx, hBotLy, hBotLz], hBotR: [hBotRx, hBotRy, hBotRz],
      hKeel: [hKeelX, hKeelY, hKeelZ],
    });

    // Puntos elevados para raíles de protección
    railPtsL.push(new THREE.Vector3(cTopLx + nx * 0.028, cTopLy + ny * 0.028, cTopLz + nz * 0.028));
    railPtsR.push(new THREE.Vector3(cTopRx + nx * 0.028, cTopRy + ny * 0.028, cTopRz + nz * 0.028));
  }

  // Helper para construir mallas conectando quads a lo largo de las rebanadas
  function buildStrip(getPair, nSlices) {
    const pos = [], uvs = [], idx = [];
    for (let k = 0; k < nSlices; k++) {
      const [p1, p2] = getPair(k);
      const v = k / (nSlices - 1);
      pos.push(...p1, ...p2);
      uvs.push(0, v, 1, v);
      if (k < nSlices - 1) {
        const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, b, c, b, d, c);
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(idx);
    geom.computeVertexNormals();
    return geom;
  }

  // 2. Materiales temáticos de alta fidelidad
  const trackBedMat = isNeon
    ? new THREE.MeshStandardMaterial({
        color: 0x090c18,
        roughness: 0.35,
        metalness: 0.65,
        emissive: color,
        emissiveIntensity: 0.08,
      })
    : isNight
    ? new THREE.MeshStandardMaterial({
        color: 0x162438,
        roughness: 0.65,
        metalness: 0.2,
      })
    : new THREE.MeshStandardMaterial({
        color: 0x2262cc,
        roughness: 0.5,
        metalness: 0.25,
      });

  const curbMat = isNeon
    ? new THREE.MeshStandardMaterial({
        color: 0x161a2e,
        roughness: 0.25,
        metalness: 0.75,
        emissive: color,
        emissiveIntensity: 0.15,
      })
    : isNight
    ? new THREE.MeshStandardMaterial({
        color: 0x3d271d,
        roughness: 0.6,
        metalness: 0.25,
      })
    : new THREE.MeshStandardMaterial({
        color: 0x184499,
        roughness: 0.4,
        metalness: 0.3,
      });

  const hullMat = isNeon
    ? new THREE.MeshStandardMaterial({
        color: 0x0f1220,
        roughness: 0.3,
        metalness: 0.8,
      })
    : isNight
    ? new THREE.MeshStandardMaterial({
        color: 0x2b1c14,
        roughness: 0.7,
        metalness: 0.15,
      })
    : new THREE.MeshStandardMaterial({
        color: 0x15357a,
        roughness: 0.35,
        metalness: 0.4,
      });

  const railMat = isNeon
    ? glowMat(color, 1.4)
    : isNight
    ? new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        metalness: 0.85,
        roughness: 0.25,
        emissive: 0x553805,
        emissiveIntensity: 0.3,
      })
    : new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.85,
        roughness: 0.2,
      });

  const frameMat = isNeon
    ? new THREE.MeshStandardMaterial({
        color: 0x121528,
        metalness: 0.85,
        roughness: 0.3,
      })
    : isNight
    ? new THREE.MeshStandardMaterial({
        color: 0x242426,
        metalness: 0.6,
        roughness: 0.45,
      })
    : new THREE.MeshStandardMaterial({
        color: 0xe6e6e8,
        metalness: 0.5,
        roughness: 0.35,
      });

  // A) Suelo de la pista (Track Bed)
  const bedGeo = buildStrip((k) => [slices[k].bL, slices[k].bR], slices.length);
  const bedMesh = new THREE.Mesh(bedGeo, trackBedMat);
  bedMesh.receiveShadow = true;
  g.add(bedMesh);

  // B) Bordillos interiores y superiores
  const inCurbL = buildStrip((k) => [slices[k].bL, slices[k].cInL], slices.length);
  const inCurbR = buildStrip((k) => [slices[k].cInR, slices[k].bR], slices.length);
  const topCurbL = buildStrip((k) => [slices[k].cInL, slices[k].cTopL], slices.length);
  const topCurbR = buildStrip((k) => [slices[k].cTopR, slices[k].cInR], slices.length);
  g.add(
    new THREE.Mesh(inCurbL, curbMat),
    new THREE.Mesh(inCurbR, curbMat),
    new THREE.Mesh(topCurbL, curbMat),
    new THREE.Mesh(topCurbR, curbMat)
  );

  // C) Casco exterior inferior y laterales
  const outHullL = buildStrip((k) => [slices[k].cTopL, slices[k].hBotL], slices.length);
  const outHullR = buildStrip((k) => [slices[k].hBotR, slices[k].cTopR], slices.length);
  const keelL = buildStrip((k) => [slices[k].hBotL, slices[k].hKeel], slices.length);
  const keelR = buildStrip((k) => [slices[k].hKeel, slices[k].hBotR], slices.length);
  const hullMesh = new THREE.Mesh(outHullL, hullMat);
  hullMesh.castShadow = true;
  g.add(
    hullMesh,
    new THREE.Mesh(outHullR, hullMat),
    new THREE.Mesh(keelL, hullMat),
    new THREE.Mesh(keelR, hullMat)
  );

  // D) Cheurones de avance animados en el centro de la pista
  const chevronTex = loopChevronTexture(color, style.kind);
  const chevronMat = new THREE.MeshStandardMaterial({
    map: chevronTex,
    transparent: true,
    opacity: 0.85,
    emissive: color,
    emissiveIntensity: isNeon ? 0.45 : (isNight ? 0.3 : 0.2),
    roughness: 0.3,
    depthWrite: false,
  });
  const chevronW = 0.12;
  const chevronGeo = buildStrip((k) => {
    const s = slices[k];
    const offY = 0.003;
    const p1 = [s.cx - s.lx * chevronW + s.nx * offY, s.cy - s.ly * chevronW + s.ny * offY, s.cz - s.lz * chevronW + s.nz * offY];
    const p2 = [s.cx + s.lx * chevronW + s.nx * offY, s.cy + s.ly * chevronW + s.ny * offY, s.cz + s.lz * chevronW + s.nz * offY];
    return [p1, p2];
  }, slices.length);
  g.add(new THREE.Mesh(chevronGeo, chevronMat));

  // E) Raíles tubulares continuos con pilaretes de sujeción
  const railGeoL = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPtsL), 140, 0.024, 8);
  const railGeoR = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPtsR), 140, 0.024, 8);
  const meshRailL = new THREE.Mesh(railGeoL, railMat);
  const meshRailR = new THREE.Mesh(railGeoR, railMat);
  meshRailL.castShadow = meshRailR.castShadow = true;
  g.add(meshRailL, meshRailR);

  // Pilaretes metálicos que anclan los raíles al bordillo
  const stanchionStep = 10;
  for (let k = 4; k < slices.length - 4; k += stanchionStep) {
    const sl = slices[k];
    const h = 0.038;
    for (const [pt, topPt] of [[sl.cTopL, railPtsL[k]], [sl.cTopR, railPtsR[k]]]) {
      const stanchion = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, h, 8), frameMat);
      stanchion.position.set((pt[0] + topPt.x) / 2, (pt[1] + topPt.y) / 2, (pt[2] + topPt.z) / 2);
      stanchion.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(sl.nx, sl.ny, sl.nz));
      g.add(stanchion);
    }
  }

  // 3. Estructura portante realista en celosía y zapatas de apoyo
  // Puntos clave de apoyo: hombro delantero (~32%) y hombro trasero (~68%)
  const supportIndices = [Math.floor(N * 0.32), Math.floor(N * 0.68)];
  for (const idx of supportIndices) {
    const s = slices[idx];
    const groundY = 0.01;

    // Patas en "A" que bajan desde la quilla y los lados del casco hasta el suelo
    for (const side of [-1, 1]) {
      const anchorX = s.cx + s.lx * (side * (halfW + 0.08)) - s.nx * thk;
      const anchorY = s.cy + s.ly * (side * (halfW + 0.08)) - s.ny * thk;
      const anchorZ = s.cz + s.lz * (side * (halfW + 0.08)) - s.nz * thk;

      const footX = s.cx + s.lx * (side * (halfW + 0.28));
      const footZ = s.cz + s.lz * (side * (halfW + 0.28));

      // Columna diagonal de soporte
      const legVec = new THREE.Vector3(footX - anchorX, groundY - anchorY, footZ - anchorZ);
      const legLen = legVec.length();
      if (legLen > 0.05) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, legLen, 10), frameMat);
        leg.position.set(anchorX + legVec.x * 0.5, anchorY + legVec.y * 0.5, anchorZ + legVec.z * 0.5);
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), legVec.clone().normalize());
        leg.castShadow = true;
        g.add(leg);

        // Zapata / placa base empernada al suelo
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 12), frameMat);
        base.position.set(footX, groundY + 0.02, footZ);
        base.castShadow = true;
        g.add(base);

        // Anillos decorativos luminosos en las uniones de las patas (Neón)
        if (isNeon) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 8, 16), glowMat(color, 1.2));
          ring.position.set(footX, groundY + 0.05, footZ);
          ring.rotation.x = Math.PI / 2;
          g.add(ring);
        }
      }
    }

    // Viga transversal de arriostramiento entre las dos patas
    const crossBar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, halfW * 2 + 0.36, 8), frameMat);
    const midY = (s.cy + groundY) * 0.5;
    crossBar.position.set(s.cx, midY, s.cz);
    crossBar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(s.lx, s.ly, s.lz));
    g.add(crossBar);

    // Costilla de refuerzo que abraza la parte exterior del carril
    const rib = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + curbW * 2 + 0.08, 0.06, 0.1), frameMat);
    rib.position.set(s.cx - s.nx * (thk + 0.02), s.cy - s.ny * (thk + 0.02), s.cz - s.nz * (thk + 0.02));
    rib.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(s.lx, s.ly, s.lz));
    g.add(rib);
  }

  // 4. Pórtico y Corona de la Cima (Apex Crown & Light)
  const topSlice = slices[Math.floor(N / 2)];
  const apexRib = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + curbW * 2 + 0.12, 0.07, 0.12), frameMat);
  apexRib.position.set(topSlice.cx - topSlice.nx * (thk + 0.02), topSlice.cy - topSlice.ny * (thk + 0.02), topSlice.cz - topSlice.nz * (thk + 0.02));
  apexRib.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(topSlice.lx, topSlice.ly, topSlice.lz));
  g.add(apexRib);

  // Iluminación ambiental y baliza superior
  let loopLight = null;
  const baseLightIntensity = isNeon ? 2.2 : (isNight ? 1.8 : 1.0);
  if (style.kind !== 'day') {
    loopLight = new THREE.PointLight(color, baseLightIntensity, 5.5, 1.4);
    loopLight.position.set(topSlice.cx, topSlice.cy * 0.55, topSlice.cz);
    g.add(loopLight);

    // Balizas en la cima
    for (const side of [-1, 1]) {
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), glowMat(color, 1.6));
      beacon.position.set(
        topSlice.cx + topSlice.lx * side * (halfW + 0.08),
        topSlice.cy + 0.06,
        topSlice.cz + topSlice.lz * side * (halfW + 0.08)
      );
      g.add(beacon);
    }
  }

  // Guirnalda de bombillas cálidas estilo feria clásica para mapas nocturnos
  if (isNight) {
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xffe6a3,
      emissive: 0xffa020,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });
    for (let k = 10; k <= N - 10; k += 14) {
      const sl = slices[k];
      for (const side of [-1, 1]) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), bulbMat);
        bulb.position.set(
          sl.cTopL[0] * (side === -1 ? 1 : 0) + sl.cTopR[0] * (side === 1 ? 1 : 0) + sl.nx * 0.07,
          sl.cTopL[1] * (side === -1 ? 1 : 0) + sl.cTopR[1] * (side === 1 ? 1 : 0) + sl.ny * 0.07,
          sl.cTopL[2] * (side === -1 ? 1 : 0) + sl.cTopR[2] * (side === 1 ? 1 : 0) + sl.nz * 0.07
        );
        g.add(bulb);
      }
    }
  }

  // 5. Placas metálicas de transición y embudos en Entrada y Salida
  const plateTex = metalPlateTexture();
  const plateMat = new THREE.MeshStandardMaterial({
    map: plateTex,
    roughness: 0.45,
    metalness: 0.65,
  });

  const entrySlice = slices[0];
  const exitSlice = slices[slices.length - 1];

  for (const sl of [entrySlice, exitSlice]) {
    const plateW = loop.w * 0.95, plateD = 0.55;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(plateW, 0.016, plateD), plateMat);
    plate.position.set(sl.cx, 0.008, sl.cz);
    plate.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(sl.lx, 0, sl.lz).normalize());
    plate.receiveShadow = true;
    g.add(plate);

    // Bordes biselados de entrada
    const lip = new THREE.Mesh(new THREE.BoxGeometry(plateW + 0.06, 0.024, 0.04), frameMat);
    lip.position.set(sl.cx, 0.012, sl.cz);
    lip.quaternion.copy(plate.quaternion);
    g.add(lip);
  }

  // 6. Pórtico de Entrada con Arco Luminoso / Señalización
  const gateH = 1.35;
  const gateSpan = halfW * 2 + 0.28;
  const gateMat = isNeon
    ? new THREE.MeshStandardMaterial({ color: 0x14182e, metalness: 0.8, roughness: 0.3 })
    : frameMat;

  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, gateH, 12), gateMat);
    post.position.set(entrySlice.cx + entrySlice.lx * (s * gateSpan / 2), gateH / 2, entrySlice.cz + entrySlice.lz * (s * gateSpan / 2));
    post.castShadow = true;
    g.add(post);

    if (isNeon) {
      const postGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.08, 12), glowMat(color, 1.8));
      postGlow.position.set(post.position.x, gateH * 0.7, post.position.z);
      g.add(postGlow);
    }
  }

  // Dintel superior del arco de entrada
  const header = new THREE.Mesh(new THREE.BoxGeometry(gateSpan + 0.12, 0.09, 0.09), gateMat);
  header.position.set(entrySlice.cx, gateH, entrySlice.cz);
  header.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(entrySlice.lx, 0, entrySlice.lz).normalize());
  g.add(header);

  // Cartel luminoso / cheurón en el arco de entrada
  const signMat = isNeon
    ? glowMat(style.colors[1] || color, 1.8)
    : isNight
    ? new THREE.MeshStandardMaterial({ color: 0xffd066, emissive: 0xff9900, emissiveIntensity: 0.6 })
    : new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xcccccc, emissiveIntensity: 0.3 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.03), signMat);
  sign.position.set(entrySlice.cx, gateH + 0.1, entrySlice.cz);
  sign.quaternion.copy(header.quaternion);
  g.add(sign);

  scene.add(g);

  // 7. Gestión unificada de transparencia ante obstrucción de cámara
  const fadeMats = [];
  g.traverse((o) => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m && !fadeMats.some((e) => e.mat === m)) {
          m.transparent = true;
          fadeMats.push({
            mat: m,
            baseOpacity: m.opacity != null ? m.opacity : 1.0,
            baseEmissive: m.emissiveIntensity != null ? m.emissiveIntensity : 0,
          });
        }
      }
    }
  });

  let currentOpacity = 1.0;

  return {
    update(t, ball, cameraPos) {
      // Animación continua de los cheurones de avance a lo largo del carril
      chevronTex.offset.y = -t * 1.6;

      // Detección de obstrucción entre la cámara y la bola
      let blocksBall = false;
      const midPoint = topSlice;
      const reachR = loop.radius + 0.45;

      if (ball && cameraPos) {
        // Verificar si la bola está en el interior del volumen del looping
        const dCenter = Math.hypot(ball.x - midPoint.cx, ball.z - midPoint.cz);
        const inside = dCenter < reachR && ball.y < topSlice.cy + 0.2;

        if (inside) {
          blocksBall = true;
        } else {
          // Raycast analítico cámara -> bola respecto al cilindro aproximado del looping
          const dx = ball.x - cameraPos.x, dz = ball.z - cameraPos.z;
          const lenSq = dx * dx + dz * dz;
          if (lenSq > 1e-4) {
            const tRay = ((midPoint.cx - cameraPos.x) * dx + (midPoint.cz - cameraPos.z) * dz) / lenSq;
            if (tRay > 0.03 && tRay < 0.97) {
              const rx = cameraPos.x + tRay * dx, rz = cameraPos.z + tRay * dz;
              if (Math.hypot(midPoint.cx - rx, midPoint.cz - rz) < reachR) {
                const ballY = ball.y != null ? ball.y : 0.05;
                const rayY = cameraPos.y + tRay * (ballY - cameraPos.y);
                if (rayY >= -0.1 && rayY <= topSlice.cy + 0.3) {
                  blocksBall = true;
                }
              }
            }
          }
        }
      }

      // Suavizado elegante de opacidad (90% invisible = 0.1 de opacidad)
      const targetOpacity = blocksBall ? 0.1 : 1.0;
      currentOpacity += (targetOpacity - currentOpacity) * 0.2;

      for (const entry of fadeMats) {
        entry.mat.opacity = currentOpacity * entry.baseOpacity;
        entry.mat.depthWrite = currentOpacity > 0.95;
        if (entry.baseEmissive > 0) {
          entry.mat.emissiveIntensity = entry.baseEmissive * (0.15 + 0.85 * (currentOpacity - 0.1) / 0.9);
        }
      }

      if (loopLight) {
        loopLight.intensity = baseLightIntensity * (0.15 + 0.85 * (currentOpacity - 0.1) / 0.9);
      }
    },
  };
}

const TAU = Math.PI * 2;

/** Molino: torre con puerta, tejado y aspas que giran delante de la puerta. */
export function buildWindmill(scene, wm, style, lift = 0) {
  const g = new THREE.Group();
  const neon = style.kind === 'neon';
  const color = style.colors[0];
  const bodyMat = neon
    ? new THREE.MeshStandardMaterial({ color: 0x14122a, roughness: 0.5, metalness: 0.3, transparent: true })
    : new THREE.MeshStandardMaterial({ color: style.wood ? 0xa8713f : style.kind === 'night' ? 0xd9d2c5 : 0xf4efe6, roughness: 0.8, transparent: true });
  const roofMat = neon
    ? new THREE.MeshStandardMaterial({ color: 0x1d0f33, emissive: style.colors[1], emissiveIntensity: 0.35, roughness: 0.4, transparent: true })
    : new THREE.MeshStandardMaterial({ color: style.wood ? 0x8a5a30 : 0xd8433a, roughness: 0.7, transparent: true });
  const W = 1.9, H = 1.6, door = wm.w / 2 - 0.15;
  const depth = wm.depth + 0.1, cz = -wm.face * (wm.depth / 2);
  const box = (w, h, d, x, y, z, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  const side = (W / 2 - door) / 2 + door;
  box(W / 2 - door, H, depth, -side, H / 2, cz, bodyMat);
  box(W / 2 - door, H, depth, side, H / 2, cz, bodyMat);
  box(door * 2, H - 0.55, depth, 0, 0.55 + (H - 0.55) / 2, cz, bodyMat);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.78, 1.1, 4), roofMat);
  roof.position.set(0, H + 0.55, cz);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);
  // ventanas que brillan de noche
  const winMat = style.kind === 'day'
    ? new THREE.MeshStandardMaterial({ color: 0x4a6fa5, roughness: 0.2, transparent: true })
    : glowMat(neon ? style.colors[2] : 0xffc46b, 1.4);
  winMat.transparent = true;
  for (const wx of [-0.55, 0.55]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.32), winMat);
    win.position.set(wx, 1.15, cz + wm.face * (depth / 2 + 0.005));
    if (wm.face < 0) win.rotation.y = Math.PI;
    g.add(win);
  }
  // marco de la puerta
  const frameMat = neon
    ? glowMat(color, 2.2)
    : new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8, transparent: true });
  frameMat.transparent = true;
  const fz = wm.face * 0.06;
  box(0.08, 0.6, 0.08, -door - 0.04, 0.3, fz, frameMat);
  box(0.08, 0.6, 0.08, door + 0.04, 0.3, fz, frameMat);
  box(door * 2 + 0.16, 0.08, 0.08, 0, 0.6, fz, frameMat);
  if (neon) {
    // bordes de luz en la torre
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, depth)),
      new THREE.LineBasicMaterial({ color, transparent: true })
    );
    edges.position.set(0, H / 2, cz);
    g.add(edges);
  }

  // aspas: en rotación 0 una apunta hacia abajo, igual que en la física
  const bladeLen = 1.3, hubY = bladeLen + 0.12;
  const hub = new THREE.Group();
  hub.position.set(0, hubY, wm.gateZ - wm.z);
  const bladeMat = neon
    ? glowMat(style.colors[1], 1.4)
    : new THREE.MeshStandardMaterial({ color: style.kind === 'night' ? 0xc9b48a : 0xfff6e0, roughness: 0.7, transparent: true });
  bladeMat.transparent = true;
  const armMat = neon
    ? new THREE.MeshStandardMaterial({ color: 0x222244, transparent: true })
    : new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.8, transparent: true });
  armMat.transparent = true;
  for (let k = 0; k < wm.blades; k++) {
    const arm = new THREE.Group();
    arm.rotation.z = (k * TAU) / wm.blades;
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.06, bladeLen, 0.05), armMat);
    stick.position.y = -bladeLen / 2;
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.34, bladeLen * 0.78, 0.03), bladeMat);
    sail.position.set(0.12, -bladeLen * 0.55, 0);
    stick.castShadow = sail.castShadow = true;
    arm.add(stick, sail);
    hub.add(arm);
  }
  const capMat = neon
    ? glowMat(color, 2)
    : new THREE.MeshStandardMaterial({ color: 0x3d3d5c, transparent: true });
  capMat.transparent = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 16), capMat);
  cap.rotation.x = Math.PI / 2;
  hub.add(cap);
  g.add(hub);

  let light = null;
  const baseLightIntensity = 2.5;
  if (style.kind !== 'day') {
    light = new THREE.PointLight(neon ? color : 0xffb060, baseLightIntensity, 5, 1.5);
    light.position.set(0, 1.2, wm.face * 0.8);
    g.add(light);
  }
  g.position.set(wm.x, lift, wm.z);
  scene.add(g);

  // Recopilar todos los materiales del molino para que todas sus capas se desvanezcan al unísono
  const fadeEntries = [];
  g.traverse((o) => {
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m && !fadeEntries.some((e) => e.mat === m)) {
          m.transparent = true;
          fadeEntries.push({
            mat: m,
            baseEmissive: m.emissiveIntensity != null ? m.emissiveIntensity : (m.isLineBasicMaterial ? 1 : 0),
          });
        }
      }
    }
  });

  let opacity = 1;
  return {
    update(t, ball, cameraPos) {
      hub.rotation.z = wm.speed * t + wm.phase;
      // la torre y todas sus capas se transparentan al 90% SOLO si la bola está dentro o si el molino tapa la visión de la pelota
      const inside = Math.abs(ball.x - wm.x) < W / 2 + 0.3 && (ball.z - wm.z) * -wm.face > -0.4 && (ball.z - wm.z) * -wm.face < wm.depth + 0.4;
      let blocksBall = false;
      if (cameraPos && !inside) {
        const dx = ball.x - cameraPos.x, dz = ball.z - cameraPos.z;
        const lenSq = dx * dx + dz * dz;
        if (lenSq > 1e-4) {
          // Centro del molino considerando torre y aspas
          const midZ = (wm.z + cz + wm.gateZ) / 2;
          const tRay = ((wm.x - cameraPos.x) * dx + (midZ - cameraPos.z) * dz) / lenSq;
          if (tRay > 0.02 && tRay < 0.98) {
            const rx = cameraPos.x + tRay * dx, rz = cameraPos.z + tRay * dz;
            const reach = Math.max(W * 0.75, bladeLen + 0.25);
            if (Math.hypot(wm.x - rx, midZ - rz) < reach) {
              const ballY = ball.y != null ? ball.y : (lift + 0.05);
              const rayY = cameraPos.y + tRay * (ballY - cameraPos.y);
              if (rayY >= lift - 0.1 && rayY < lift + H + 1.7) {
                blocksBall = true;
              }
            }
          }
        }
      }
      const shouldFade = inside || blocksBall;
      opacity += ((shouldFade ? 0.1 : 1) - opacity) * 0.2;
      for (const entry of fadeEntries) {
        const m = entry.mat;
        m.opacity = opacity;
        m.depthWrite = opacity > 0.95;
        if (m.emissiveIntensity !== undefined && entry.baseEmissive > 0) {
          m.emissiveIntensity = entry.baseEmissive * (0.15 + 0.85 * (opacity - 0.1) / 0.9);
        }
      }
      if (light) {
        light.intensity = baseLightIntensity * (0.1 + 0.9 * (opacity - 0.1) / 0.9);
      }
    },
  };
}

/** Tubo: boca en el suelo y tubería por el aire por la que viaja la bola hasta b. */
export function buildTube(scene, portal, style, i = 0, liftA = 0) {
  const [ax, az] = portal.a;
  const [ox, oz] = portal.out;
  // el mismo recorrido que hace la bola en la física
  const pts = tubeTable(portal).pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const curve = new THREE.CatmullRomCurve3(pts);
  const color = style.colors[i % style.colors.length];
  const R = 0.2;
  const pipeMat =
    style.kind === 'neon'
      ? new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.38, roughness: 0.1, metalness: 0, side: THREE.DoubleSide, depthWrite: false })
      : new THREE.MeshStandardMaterial({ color: style.kind === 'night' ? 0x2a9d4f : 0x34c759, roughness: 0.35, metalness: 0.2, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, R, 16), pipeMat);
  scene.add(pipe);
  // aros en la boca y en la salida
  const ringMat = style.kind === 'day' ? new THREE.MeshStandardMaterial({ color: 0x228b3c, roughness: 0.4 }) : glowMat(color, 2.2);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(portal.r, 0.06, 10, 36), ringMat);
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.set(ax, liftA + 0.03, az);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(portal.r, 32), new THREE.MeshBasicMaterial({ color: 0x050508 }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(ax, liftA + 0.005, az);
  const spout = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.05, 10, 30), ringMat);
  const end = pts[pts.length - 1];
  spout.position.copy(end);
  spout.lookAt(end.x + ox, end.y, end.z + oz);
  scene.add(mouth, hole, spout);
  if (style.kind !== 'day') {
    const light = new THREE.PointLight(color, 2, 4, 1.5);
    light.position.set(ax, liftA + 0.5, az);
    scene.add(light);
  }
  return {
    update(t) {
      mouth.scale.setScalar(1 + Math.sin(t * 4 + i) * 0.05);
    },
  };
}

/** Pasadizo: arco que cubre un pasillo (w a lo largo de x, d a lo largo de z). */
export function buildTunnel(scene, tn, style, lift = 0, i = 0) {
  const ri = tn.w / 2 + 0.1, ro = ri + 0.16;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, ro, 0, Math.PI, false);
  shape.lineTo(-ri, 0);
  shape.absarc(0, 0, ri, Math.PI, 0, true);
  shape.lineTo(ro, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: tn.d, bevelEnabled: false, curveSegments: 24 });
  geo.translate(0, 0.12, -tn.d / 2);
  const color = style.colors[i % style.colors.length];
  const mat =
    style.kind === 'neon'
      ? new THREE.MeshStandardMaterial({ color: 0x12102a, emissive: color, emissiveIntensity: 0.25, roughness: 0.4, transparent: true })
      : new THREE.MeshStandardMaterial({ color: { night: 0x7a6a5a, lava: 0x2e2426 }[style.kind] ?? 0xb5763f, roughness: 0.9, flatShading: style.kind === 'lava', transparent: true });
  const arch = new THREE.Mesh(geo, mat);
  arch.castShadow = true;
  arch.position.set(tn.x, lift, tn.z);
  scene.add(arch);
  // aros de luz en las dos bocas
  const ringMat = style.kind === 'day'
    ? new THREE.MeshStandardMaterial({ color: 0xffc145, roughness: 0.5, transparent: true })
    : glowMat(color, 2.2);
  ringMat.transparent = true;
  const lights = [];
  for (const s of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ro, 0.04, 8, 32, Math.PI), ringMat);
    ring.position.set(tn.x, lift + 0.12, tn.z + (s * tn.d) / 2);
    scene.add(ring);
    if (style.kind !== 'day') {
      const light = new THREE.PointLight(color, 1.5, 3, 1.5);
      light.position.set(tn.x, lift + 0.6, tn.z + s * (tn.d / 2 + 0.2));
      scene.add(light);
      lights.push(light);
    }
  }
  const fadeMats = [
    { mat, baseEmissive: mat.emissiveIntensity || 0 },
    { mat: ringMat, baseEmissive: ringMat.emissiveIntensity || 0 },
  ];
  let opacity = 1;
  return {
    update(t, ball, cameraPos) {
      // se transparenta con la bola dentro, o con la cámara dentro (taparía todo)
      const near = (p, m) => p && Math.abs(p.x - tn.x) < tn.w / 2 + m && Math.abs(p.z - tn.z) < tn.d / 2 + m + 0.2;
      const inside = near(ball, 0.4) || near(cameraPos, 0.6);
      let blocksBall = false;
      if (cameraPos && !inside) {
        const dx = ball.x - cameraPos.x, dz = ball.z - cameraPos.z;
        const lenSq = dx * dx + dz * dz;
        if (lenSq > 1e-4) {
          const tRay = ((tn.x - cameraPos.x) * dx + (tn.z - cameraPos.z) * dz) / lenSq;
          if (tRay > 0.02 && tRay < 0.98) {
            const rx = cameraPos.x + tRay * dx, rz = cameraPos.z + tRay * dz;
            if (Math.hypot(tn.x - rx, tn.z - rz) < Math.max(tn.w, tn.d) / 2) {
              const ballY = ball.y != null ? ball.y : (lift + 0.05);
              const rayY = cameraPos.y + tRay * (ballY - cameraPos.y);
              if (rayY >= lift - 0.1 && rayY < lift + ro) blocksBall = true;
            }
          }
        }
      }
      const shouldFade = inside || blocksBall;
      opacity += ((shouldFade ? 0.1 : 1) - opacity) * 0.2;
      for (const entry of fadeMats) {
        entry.mat.opacity = opacity;
        entry.mat.depthWrite = opacity > 0.95;
        if (entry.mat.emissiveIntensity !== undefined && entry.baseEmissive > 0) {
          entry.mat.emissiveIntensity = entry.baseEmissive * (0.15 + 0.85 * (opacity - 0.1) / 0.9);
        }
      }
      for (const l of lights) {
        l.intensity = 1.5 * (0.1 + 0.9 * (opacity - 0.1) / 0.9);
      }
    },
  };
}

/** Rejilla de neón para el césped oscuro. */
export function neonGridTexture([a, b], line) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = a;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = b;
  g.fillRect(0, 128, 256, 128);
  g.strokeStyle = line;
  g.globalAlpha = 0.55;
  g.lineWidth = 3;
  for (let k = 0; k <= 256; k += 64) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k, 256);
    g.moveTo(0, k);
    g.lineTo(256, k);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
