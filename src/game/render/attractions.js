import * as THREE from 'three';
import { loopTable, tubeTable } from '../physics.js';
import { loopPoint } from './terrain.js';

// Atracciones de minigolf: loopings, molinos, tubos y pasadizos. Cada una
// tiene tres estilos: de día, de noche (con luces) y neón.

/** Estilo de las atracciones según el tema del hoyo. */
export function attractionStyle(theme) {
  if (theme.neon) return { kind: 'neon', colors: theme.neon };
  if (theme.lanterns || theme.stars) return { kind: 'night', colors: [0xffc46b, 0x6bd5ff, 0xff7ad9] };
  return { kind: 'day', colors: [0xff5a4e, 0x3d8bff, 0xffc145] };
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

/** Looping: carril que da una vuelta completa, con raíles y columnas perfectamente alineadas. */
export function buildLoop(scene, loop, style, i = 0) {
  const g = new THREE.Group();
  const N = 180;
  // Anchura completa del carril ajustada a la física menos un margen mínimo para los raíles
  const half = loop.w / 2 - 0.03;
  const S = loopTable(loop).length;
  const pos = [], idx = [];

  for (let k = 0; k <= N; k++) {
    const p = (k / N) * S;
    for (const side of [-half, half]) {
      const q = loopPoint(loop, p, side);
      // Offset perpendicular a la superficie del carril hacia afuera de la vuelta (inward normal es dx*nAlong, nY, dz*nAlong)
      const nx = q.dx * q.nAlong, ny = q.nY, nz = q.dz * q.nAlong;
      const off = 0.003;
      pos.push(q.x - nx * off, q.y - ny * off, q.z - nz * off);
    }
    if (k < N) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const color = style.colors[i % style.colors.length];
  // El carril debe ser OPACO para evitar fallos de ordenación z-buffer en giros 3D
  const trackMat =
    style.kind === 'neon'
      ? new THREE.MeshStandardMaterial({
          color: 0x0e1124,
          roughness: 0.35,
          metalness: 0.65,
          emissive: color,
          emissiveIntensity: 0.12,
          side: THREE.DoubleSide,
        })
      : new THREE.MeshStandardMaterial({
          color: style.kind === 'night' ? 0x2b5fd9 : 0x3d8bff,
          roughness: 0.45,
          side: THREE.DoubleSide,
        });
  const track = new THREE.Mesh(geo, trackMat);
  track.receiveShadow = true;
  g.add(track);

  // Línea guía central de neón que marca la trayectoria limpia del looping
  const cPos = [], cIdx = [];
  const cW = 0.035;
  for (let k = 0; k <= N; k++) {
    const p = (k / N) * S;
    for (const side of [-cW, cW]) {
      const q = loopPoint(loop, p, side);
      const nx = q.dx * q.nAlong, ny = q.nY, nz = q.dz * q.nAlong;
      cPos.push(q.x + nx * 0.001, q.y + ny * 0.001, q.z + nz * 0.001);
    }
    if (k < N) cIdx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
  }
  const cGeo = new THREE.BufferGeometry();
  cGeo.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
  cGeo.setIndex(cIdx);
  cGeo.computeVertexNormals();
  const centerStripe = new THREE.Mesh(
    cGeo,
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: style.kind === 'neon' ? 0.35 : 0.2,
      roughness: 0.2,
      side: THREE.DoubleSide,
    })
  );
  g.add(centerStripe);

  // Raíles laterales elevados uniformemente sobre el carril a lo largo de la normal interior
  const railMat =
    style.kind === 'day'
      ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.5 })
      : glowMat(color, 1.0);

  for (const side of [-half, half]) {
    const pts = [];
    const railSteps = 120;
    for (let k = 0; k <= railSteps; k++) {
      const q = loopPoint(loop, (k / railSteps) * S, side);
      const nx = q.dx * q.nAlong, ny = q.nY, nz = q.dz * q.nAlong;
      // Elevado exactamente hacia el interior del carril para hacer de barandilla continua
      pts.push(new THREE.Vector3(q.x + nx * 0.038, q.y + ny * 0.038, q.z + nz * 0.038));
    }
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.035, 8), railMat);
    rail.castShadow = true;
    g.add(rail);
  }

  // Estructura de soporte que sujeta la vuelta en la cima
  const top = loopPoint(loop, S / 2, 0);
  const postMat =
    style.kind === 'neon'
      ? new THREE.MeshStandardMaterial({ color: 0x15152a, metalness: 0.7, roughness: 0.35 })
      : new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.4, roughness: 0.4 });
  const sx = -loop.dir[1], sz = loop.dir[0];
  const h = top.y + 0.15;

  for (const s of [-1, 1]) {
    const off = s * (loop.w / 2 + 0.15);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 10), postMat);
    post.position.set(top.x + sx * off, h / 2, top.z + sz * off);
    post.castShadow = true;
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 8),
      style.kind === 'day' ? new THREE.MeshStandardMaterial({ color: 0xffc145 }) : glowMat(color, 1.0)
    );
    lamp.position.set(top.x + sx * off, h + 0.06, top.z + sz * off);
    g.add(post, lamp);
  }

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, loop.w + 0.3, 8), postMat);
  bar.position.set(top.x, h, top.z);
  bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(sx, 0, sz));
  g.add(bar);

  if (style.kind !== 'day') {
    const light = new THREE.PointLight(color, 1.2, 5, 1.5);
    light.position.set(top.x, top.y * 0.5, top.z);
    g.add(light);
  }

  scene.add(g);
  return { update() {} };
}

const TAU = Math.PI * 2;

/** Molino: torre con puerta, tejado y aspas que giran delante de la puerta. */
export function buildWindmill(scene, wm, style, lift = 0) {
  const g = new THREE.Group();
  const neon = style.kind === 'neon';
  const color = style.colors[0];
  const bodyMat = neon
    ? new THREE.MeshStandardMaterial({ color: 0x14122a, roughness: 0.5, metalness: 0.3, transparent: true })
    : new THREE.MeshStandardMaterial({ color: style.kind === 'night' ? 0xd9d2c5 : 0xf4efe6, roughness: 0.8, transparent: true });
  const roofMat = neon
    ? new THREE.MeshStandardMaterial({ color: 0x1d0f33, emissive: style.colors[1], emissiveIntensity: 0.35, roughness: 0.4, transparent: true })
    : new THREE.MeshStandardMaterial({ color: 0xd8433a, roughness: 0.7, transparent: true });
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
      : new THREE.MeshStandardMaterial({ color: style.kind === 'night' ? 0x7a6a5a : 0xb5763f, roughness: 0.9, transparent: true });
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
      const inside = Math.abs(ball.x - tn.x) < tn.w / 2 + 0.4 && Math.abs(ball.z - tn.z) < tn.d / 2 + 0.6;
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
