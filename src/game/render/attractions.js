import * as THREE from 'three';
import { tubeTable } from '../physics.js';

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

// Banda del anillo del looping: media anchura (a lo ancho de la pista), grosor
// del hielo y cuánto se estrechan los cantos por fuera (bisel)
const RING_HALF_W = 0.36;
const RING_THICK = 0.2;
const RING_BEVEL = 0.07;
// caras alrededor del anillo: pocas, para que se vean las facetas del hielo
const RING_FACETS = 26;

/**
 * Looping: un anillo vertical de hielo translúcido plantado en el césped. La
 * bola entra por abajo, sube por dentro de la banda, da la vuelta y sale por
 * el otro lado (en espiral, ver loopLateral en terrain.js).
 */
export function buildLoop(scene, loop, style, i = 0) {
  const g = new THREE.Group();
  const isNeon = style.kind === 'neon';
  const isNight = style.kind === 'night';
  const R = loop.radius;
  const [dx, dz] = loop.dir, sx = -dz, sz = dx;
  // el anillo apoya en el centro del looping; se sube un pelo para no pelearse con el césped
  const cy = R + 0.004;

  // sección: cara interior plana (por donde rueda la bola), cantos biselados y
  // cara exterior más estrecha; por fuera cada faceta sobresale un poco distinto,
  // como hielo tallado
  const pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const bump = (k) => 0.035 * (((k * 7 + i * 3) % 5) / 4 - 0.5);
  const at = (k, r, side) => {
    const th = (k / RING_FACETS) * TAU;
    const along = -Math.sin(th) * r, y = cy - Math.cos(th) * r;
    return [loop.x + dx * along + sx * side, y, loop.z + dz * along + sz * side];
  };
  const w = RING_HALF_W, wo = RING_HALF_W - RING_BEVEL;
  for (let k = 0; k < RING_FACETS; k++) {
    const n = k + 1;
    const ri = R, rm = R + RING_THICK * 0.55;
    const ro = R + RING_THICK + bump(k), ron = R + RING_THICK + bump(n % RING_FACETS);
    const rmk = rm + bump(k) * 0.5, rmn = rm + bump(n % RING_FACETS) * 0.5;
    quad(at(k, ri, -w), at(n, ri, -w), at(n, ri, w), at(k, ri, w));
    quad(at(k, ri, w), at(n, ri, w), at(n, rmn, w), at(k, rmk, w));
    quad(at(k, rmk, -w), at(n, rmn, -w), at(n, ri, -w), at(k, ri, -w));
    quad(at(k, rmk, w), at(n, rmn, w), at(n, ron, wo), at(k, ro, wo));
    quad(at(k, ro, -wo), at(n, ron, -wo), at(n, rmn, -w), at(k, rmk, -w));
    quad(at(k, ro, wo), at(n, ron, wo), at(n, ron, -wo), at(k, ro, -wo));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();

  const iceMat = new THREE.MeshStandardMaterial({
    color: 0x4fc3f0,
    emissive: 0x1f9be0,
    emissiveIntensity: isNeon ? 0.5 : isNight ? 0.4 : 0.28,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
    flatShading: true,
  });
  const ring = new THREE.Mesh(geo, iceMat);
  ring.renderOrder = 2;
  g.add(ring);

  // aristas claras de las facetas, como hielo tallado
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xeefbff, transparent: true, opacity: isNeon || isNight ? 0.8 : 0.7, depthWrite: false });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), edgeMat);
  edges.renderOrder = 3;
  g.add(edges);

  // brillo frío dentro del anillo de noche y en neón
  let loopLight = null;
  const baseLightIntensity = isNeon ? 1.6 : 1.2;
  if (style.kind !== 'day') {
    loopLight = new THREE.PointLight(0x7fd8ff, baseLightIntensity, 4.5, 1.6);
    loopLight.position.set(loop.x, R, loop.z);
    g.add(loopLight);
  }

  scene.add(g);

  const fadeMats = [
    { mat: iceMat, baseOpacity: iceMat.opacity },
    { mat: edgeMat, baseOpacity: edgeMat.opacity },
  ];
  let currentOpacity = 1.0;
  const reachR = R + RING_THICK + 0.3;

  return {
    update(t, ball, cameraPos) {
      // si el anillo tapa la bola desde la cámara, se aclara aún más
      let blocksBall = false;
      if (ball && cameraPos) {
        const dx = ball.x - cameraPos.x, dz = ball.z - cameraPos.z;
        const lenSq = dx * dx + dz * dz;
        if (lenSq > 1e-4) {
          const tRay = ((loop.x - cameraPos.x) * dx + (loop.z - cameraPos.z) * dz) / lenSq;
          if (tRay > 0.03 && tRay < 0.97) {
            const rx = cameraPos.x + tRay * dx, rz = cameraPos.z + tRay * dz;
            const ballY = ball.y != null ? ball.y : 0.05;
            const rayY = cameraPos.y + tRay * (ballY - cameraPos.y);
            blocksBall = Math.hypot(loop.x - rx, loop.z - rz) < reachR && rayY >= -0.1 && rayY <= 2 * R + 0.3;
          }
        }
      }
      const targetOpacity = blocksBall ? 0.55 : 1.0;
      currentOpacity += (targetOpacity - currentOpacity) * 0.2;
      for (const entry of fadeMats) entry.mat.opacity = currentOpacity * entry.baseOpacity;
      if (loopLight) loopLight.intensity = baseLightIntensity * currentOpacity;
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
