import * as THREE from 'three';
import { BALL_R, CUP_R, WALL_HALF, moverPos, segmentsOf } from '../physics.js';
import { chevronTexture, crateTexture, dirtTexture, grassTexture, sandTexture, slopeArrowTexture, slopeShadeTexture, stripeTexture, swirlTexture, woodTexture } from './textures.js';

const WALL_H = 0.32;
const PLATFORM_DEPTH = 2.4;
const BUMPER_COLORS = [0x4b7bec, 0xff6b6b, 0xffc145, 0x9b59b6];
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide });

/** Contorno de dibujo animado (casco invertido) alrededor de una malla. */
function outline(mesh, grow = 0.035) {
  const o = new THREE.Mesh(mesh.geometry, outlineMat);
  const s = mesh.geometry.boundingSphere ?? (mesh.geometry.computeBoundingSphere(), mesh.geometry.boundingSphere);
  o.scale.setScalar(1 + grow / Math.max(0.05, s.radius));
  mesh.add(o);
  return mesh;
}

/** Construye la pista: plataforma de césped, hoyo real, paredes de madera, obstáculos y bandera. */
export function buildCourse(scene, course, theme) {
  const [hx, hz] = course.cup;

  // plataforma con el agujero del hoyo recortado
  const shape = new THREE.Shape(course.outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  if (!course.noCup) {
    const hole = new THREE.Path();
    hole.absarc(hx, -hz, CUP_R, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: PLATFORM_DEPTH, bevelEnabled: false, curveSegments: 32 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -PLATFORM_DEPTH, 0);
  const grass = grassTexture(theme.grass);
  grass.repeat.set(0.5, 0.5);
  const dirt = dirtTexture();
  dirt.repeat.set(0.5, 1 / PLATFORM_DEPTH);
  dirt.offset.y = 0;
  const platform = new THREE.Mesh(geo, [
    new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 }),
  ]);
  platform.receiveShadow = true;
  scene.add(platform);

  // interior del hoyo y aro blanco
  const cupInside = new THREE.Mesh(
    new THREE.CylinderGeometry(CUP_R, CUP_R, 0.4, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe8e8e8, side: THREE.BackSide, roughness: 0.6 }),
  );
  cupInside.position.set(hx, -0.2, hz);
  const cupBottom = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 32), new THREE.MeshBasicMaterial({ color: 0x1b1b1b }));
  cupBottom.rotation.x = -Math.PI / 2;
  cupBottom.position.set(hx, -0.38, hz);
  const rim = new THREE.Mesh(new THREE.RingGeometry(CUP_R, CUP_R + 0.035, 40), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(hx, 0.003, hz);
  if (!course.noCup) scene.add(cupInside, cupBottom, rim);
  else scene.add(bullseye(hx, hz));
  // volcán: el hoyo es un cráter con lava brillante dentro y grietas incandescentes alrededor
  const lavaCup = theme.lava && !course.noCup ? lavaCrater(scene, hx, hz, cupInside, cupBottom) : null;

  // arena con bordes redondeados
  const sandTex = sandTexture();
  for (const s of course.sand) {
    const r = Math.min(s.w, s.d) * 0.35;
    const sh = roundedRect(s.w, s.d, r);
    const tex = sandTex.clone();
    tex.repeat.set(0.6, 0.6);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 8), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(s.x, 0.004, s.z);
    m.receiveShadow = true;
    const edge = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(s.w + 0.14, s.d + 0.14, r + 0.07), 8), new THREE.MeshStandardMaterial({ color: 0xc9a861 }));
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(s.x, 0.003, s.z);
    scene.add(edge, m);
  }

  // paredes de madera
  const night = !!theme.rim && theme.sunIntensity < 2;
  let segIndex = 0;
  const wood = woodTexture();
  const walls = [];
  for (const [[ax, az], [bx, bz]] of segmentsOf(course)) {
    // materiales propios para poder transparentar la pared que tapa la bola
    const wallMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8, transparent: true });
    const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, transparent: true });
    // de noche el remate de las paredes es una tira de luz del color del contraluz
    if (night) capMat.color.setHex(0x2a2a3a), capMat.emissive.setHex(theme.rim[segIndex++ % 2]), (capMat.emissiveIntensity = 0.4);
    walls.push({ a: [ax, az], b: [bx, bz], mats: [wallMat, capMat], opacity: 1 });
    const len = Math.hypot(bx - ax, bz - az) + WALL_HALF * 2;
    const g = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(len, WALL_H, WALL_HALF * 2);
    scaleUV(bodyGeo, len / 1.5, 1);
    const body = new THREE.Mesh(bodyGeo, wallMat);
    body.position.y = WALL_H / 2;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(len + 0.02, 0.05, WALL_HALF * 2 + 0.04), capMat);
    cap.position.y = WALL_H + 0.02;
    body.castShadow = body.receiveShadow = cap.castShadow = true;
    g.add(body, cap);
    g.position.set((ax + bx) / 2, 0, (az + bz) / 2);
    g.rotation.y = -Math.atan2(bz - az, bx - ax);
    scene.add(g);
  }
  // postes en las esquinas
  const postMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4 });
  const corners = new Set();
  const posts = [];
  for (const seg of segmentsOf(course)) for (const p of seg) corners.add(p.join(','));
  for (const k of corners) {
    const [x, z] = k.split(',').map(Number);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(WALL_HALF * 1.25, WALL_HALF * 1.25, WALL_H + 0.12, 12), postMat);
    post.position.set(x, (WALL_H + 0.12) / 2, z);
    post.castShadow = true;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(WALL_HALF * 1.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff5a4e, emissive: 0xff3a2e, emissiveIntensity: night ? 1.4 : 0.15 }));
    ball.position.set(x, WALL_H + 0.17, z);
    scene.add(post, ball);
    posts.push({ x, z, meshes: [post, ball] });
  }

  // setas rebotadoras
  const bumpers = course.bumpers.map((b, i) => {
    const g = new THREE.Group();
    const color = BUMPER_COLORS[i % BUMPER_COLORS.length];
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r * 1.05, 0.3, 24), new THREE.MeshStandardMaterial({ color: 0xfff3dc, roughness: 0.7 }));
    stem.position.y = 0.15;
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(b.r * 1.25, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color, roughness: 0.3, emissive: color, emissiveIntensity: night ? 0.45 : 0.08 }),
    );
    top.scale.y = 0.6;
    top.position.y = 0.3;
    outline(top, 0.03);
    outline(stem, 0.03);
    const dots = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(b.r * 0.18, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: night ? 1.2 : 0.2 }));
      const a = (k / 5) * Math.PI * 2;
      d.position.set(Math.cos(a) * b.r * 0.75, 0.3 + b.r * 0.42, Math.sin(a) * b.r * 0.75);
      d.scale.y = 0.5;
      dots.add(d);
    }
    g.add(stem, top, dots);
    g.position.set(b.x, 0, b.z);
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    scene.add(g);
    return g;
  });

  // aspas giratorias rayadas
  const spinners = course.spinners.map((sp) => {
    const g = new THREE.Group();
    const tex = stripeTexture('#ff4b3e', '#ffffff');
    tex.repeat.set(sp.len * 2, 1);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(sp.len, WALL_H, WALL_HALF * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    bar.position.y = WALL_H / 2 + 0.02;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, WALL_H * 2, 16), new THREE.MeshStandardMaterial({ color: 0x3d3d5c, metalness: 0.4, roughness: 0.4 }));
    hub.position.y = WALL_H;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8), new THREE.MeshStandardMaterial({ color: 0xffc145, emissive: 0xffa020, emissiveIntensity: night ? 1.5 : 0.25 }));
    cap.position.y = WALL_H * 2;
    bar.castShadow = hub.castShadow = true;
    outline(hub, 0.03);
    g.add(bar, hub, cap);
    g.position.set(sp.x, 0, sp.z);
    scene.add(g);
    return g;
  });

  // aceleradores con flechas animadas
  const boostTextures = (course.boosts ?? []).map((b) => {
    const tex = chevronTexture();
    tex.repeat.set(1, b.d / b.w);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.d), new THREE.MeshBasicMaterial({ map: tex }));
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = Math.atan2(b.dir[0], -b.dir[1]) * -1;
    pad.position.set(b.x, 0.005, b.z);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(b.w + 0.12, b.d + 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    frame.rotation.copy(pad.rotation);
    frame.position.set(b.x, 0.004, b.z);
    scene.add(frame, pad);
    return tex;
  });

  // pendientes: sombreado de cuesta y flechas que bajan
  const slopeTextures = (course.slopes ?? []).map((sl) => {
    const rot = -Math.atan2(sl.dir[0], -sl.dir[1]);
    const along = sl.dir[0] !== 0 ? sl.w : sl.d, across = sl.dir[0] !== 0 ? sl.d : sl.w;
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(across, along), new THREE.MeshBasicMaterial({ map: slopeShadeTexture(), transparent: true, depthWrite: false }));
    shade.rotation.set(-Math.PI / 2, 0, rot);
    shade.position.set(sl.x, 0.0025, sl.z);
    const tex = slopeArrowTexture();
    tex.repeat.set(Math.max(1, Math.round(across / 1.2)), along / 1.2);
    const arrows = new THREE.Mesh(new THREE.PlaneGeometry(across, along), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    arrows.rotation.copy(shade.rotation);
    arrows.position.set(sl.x, 0.0035, sl.z);
    scene.add(shade, arrows);
    return { tex, speed: sl.accel * 0.12 };
  });

  // portales: entrada morada y salida naranja, con remolino y columna de luz
  const portals = (course.portals ?? []).flatMap((p) => [portalMesh(scene, p.a, p.r, '#b46cff', 0xb46cff), portalMesh(scene, p.b, p.r * 0.8, '#ffb020', 0xffb020)]);

  // bloques que se mueven
  const crate = crateTexture();
  const movers = (course.movers ?? []).map((m) => {
    const geo = new THREE.BoxGeometry(m.w, 0.42, m.d);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: crate, roughness: 0.6 }));
    mesh.position.y = 0.21;
    mesh.castShadow = mesh.receiveShadow = true;
    outline(mesh, 0.03);
    scene.add(mesh);
    return mesh;
  });

  // bandera con tela que ondea
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.7, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.3 }));
  pole.position.set(hx, 0.85, hz);
  pole.castShadow = true;
  const clothGeo = new THREE.PlaneGeometry(0.62, 0.38, 12, 4);
  clothGeo.translate(0.31, -0.19, 0);
  const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ color: 0xff3b30, side: THREE.DoubleSide, roughness: 0.8 }));
  cloth.position.set(hx, 1.68, hz);
  cloth.castShadow = true;
  scene.add(pole, cloth);
  const clothBase = Float32Array.from(clothGeo.attributes.position.array);

  // tee: alfombrilla de salida
  const tee = new THREE.Mesh(new THREE.CircleGeometry(0.35, 24), new THREE.MeshStandardMaterial({ color: 0x2f7d32, roughness: 1 }));
  tee.rotation.x = -Math.PI / 2;
  tee.position.set(course.tee[0], 0.003, course.tee[1]);
  tee.receiveShadow = true;
  scene.add(tee);

  return {
    spinners,
    bumpers,
    flag: { pole, cloth },
    update(t, cameraPos, ballPos) {
      lavaCup?.update(t);
      boostTextures.forEach((tex) => (tex.offset.y = -t * 1.5));
      slopeTextures.forEach((s) => (s.tex.offset.y = -t * s.speed));
      portals.forEach((p, i) => {
        p.disc.rotation.z = t * (i % 2 ? -2 : 3);
        p.beam.material.opacity = 0.25 + Math.sin(t * 4 + i) * 0.1;
        p.ring.scale.setScalar(1 + Math.sin(t * 5 + i) * 0.05);
      });
      (course.movers ?? []).forEach((m, i) => {
        const p = moverPos(m, t);
        movers[i].position.x = p.x;
        movers[i].position.z = p.z;
      });
      const p = clothGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = clothBase[i * 3];
        p.setZ(i, Math.sin(x * 9 - t * 6) * 0.06 * x * 2);
      }
      p.needsUpdate = true;
      clothGeo.computeVertexNormals();
      cloth.rotation.y = Math.sin(t * 0.7) * 0.3;
      // la bandera se levanta cuando la bola se acerca, como en el golf real
      const near = Math.hypot(ballPos.x - hx, ballPos.z - hz) < 1.2;
      const targetY = near ? 1.25 : 0;
      pole.position.y += (0.85 + targetY - pole.position.y) * 0.1;
      cloth.position.y = pole.position.y + 0.83;
      // un poste pegado a la cámara taparía media pantalla
      for (const p of posts) {
        const near = Math.hypot(cameraPos.x - p.x, cameraPos.z - p.z) < 1.3;
        p.meshes.forEach((m) => (m.visible = !near));
      }
      for (const w of walls) {
        const blocks = crosses(cameraPos.x, cameraPos.z, ballPos.x, ballPos.z, w.a, w.b);
        w.opacity += ((blocks ? 0.18 : 1) - w.opacity) * 0.2;
        for (const m of w.mats) {
          m.opacity = w.opacity;
          m.depthWrite = w.opacity > 0.95;
        }
      }
      bumpers.forEach((b) => b.scale.setScalar(1 + (b.userData.squash ?? 0)));
      bumpers.forEach((b) => (b.userData.squash = (b.userData.squash ?? 0) * 0.85));
    },
  };
}

function portalMesh(scene, [x, z], r, css, color) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ map: swirlTexture(css), transparent: true, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.006;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 10, 40), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: 0.3 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.9, r, 1.6, 24, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  beam.position.y = 0.8;
  const light = new THREE.PointLight(color, 2, 3, 1.5);
  light.position.y = 0.5;
  g.add(disc, ring, beam, light);
  g.position.set(x, 0, z);
  scene.add(g);
  return { disc, ring, beam };
}

function lavaCrater(scene, hx, hz, cupInside, cupBottom) {
  cupInside.material = new THREE.MeshStandardMaterial({ color: 0x2a1410, emissive: 0xff4a10, emissiveIntensity: 0.7, side: THREE.BackSide, roughness: 0.8 });
  cupBottom.material = new THREE.MeshBasicMaterial({ color: 0xffa030 });
  const g = new THREE.Group();
  // borde de roca volcánica y anillo de magma que respira
  const basalt = new THREE.Mesh(new THREE.RingGeometry(CUP_R + 0.03, CUP_R + 0.42, 40), new THREE.MeshStandardMaterial({ color: 0x1c1416, roughness: 1 }));
  basalt.rotation.x = -Math.PI / 2;
  basalt.position.y = 0.0015;
  const magma = new THREE.Mesh(new THREE.RingGeometry(CUP_R + 0.2, CUP_R + 0.3, 48), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true }));
  magma.rotation.x = -Math.PI / 2;
  magma.position.y = 0.002;
  // grietas que salen del cráter
  const crackMat = new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 3) * 0.2, len = 0.35 + (i % 4) * 0.18;
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.04, len), crackMat);
    crack.rotation.set(-Math.PI / 2, 0, -a);
    const r = CUP_R + 0.4 + len / 2;
    crack.position.set(Math.cos(a) * r, 0.0025, Math.sin(a) * r);
    g.add(crack);
  }
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(CUP_R * 0.9, CUP_R, 0.9, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glow.position.y = 0.45;
  const light = new THREE.PointLight(0xff5a14, 4, 4, 1.5);
  light.position.y = 0.25;
  g.add(basalt, magma, glow, light);
  g.position.set(hx, 0, hz);
  scene.add(g);
  return {
    group: g,
    update(t) {
      const k = 0.5 + Math.sin(t * 2.4) * 0.5;
      magma.material.color.setHSL(0.04 + k * 0.03, 1, 0.5 + k * 0.1);
      crackMat.opacity = 0.6 + k * 0.4;
      glow.material.opacity = 0.14 + k * 0.14;
      light.intensity = 3 + k * 2.5;
    },
  };
}

// Diana del desempate: anillos de colores, gana la bola que pare más cerca del centro
function bullseye(x, z) {
  const g = new THREE.Group();
  const colors = [0xff3d7f, 0xffffff, 0xffc93d, 0xffffff, 0x3dd6ff, 0xffffff, 0xff3d7f];
  const step = 0.32;
  colors.forEach((c, i) => {
    const r0 = (colors.length - 1 - i) * step, r1 = r0 + step;
    const m = new THREE.Mesh(
      i === colors.length - 1 ? new THREE.CircleGeometry(r1, 40) : new THREE.RingGeometry(r0, r1, 48),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: c, emissiveIntensity: 0.15 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.002 + i * 0.0004;
    m.receiveShadow = true;
    g.add(m);
  });
  g.position.set(x, 0, z);
  return g;
}

// ¿El segmento cámara→bola cruza la pared? (con margen por el grosor)
function crosses(px, pz, qx, qz, [ax, az], [bx, bz]) {
  const cross = (ux, uz, vx, vz) => ux * vz - uz * vx;
  const rx = qx - px, rz = qz - pz, sx = bx - ax, sz = bz - az;
  const den = cross(rx, rz, sx, sz);
  if (Math.abs(den) < 1e-9) return false;
  const t = cross(ax - px, az - pz, sx, sz) / den;
  const u = cross(ax - px, az - pz, rx, rz) / den;
  const pad = 0.15 / Math.hypot(sx, sz);
  return t > 0 && t < 1 && u > -pad && u < 1 + pad;
}

function roundedRect(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
}

export { BALL_R };
