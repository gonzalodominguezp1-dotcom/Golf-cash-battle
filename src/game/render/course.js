import * as THREE from 'three';
import { BALL_R, CUP_R, WALL_HALF, moverPos, segmentsOf } from '../physics.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chevronTexture, crateTexture, dirtMaps, grassMaps, sandMaps, slopeArrowTexture, slopeShadeTexture, softDotTexture, stripeTexture, swirlTexture, woodMaps } from './textures.js';
import { groundHeight, hasRelief } from './terrain.js';
import { attractionStyle, buildLoop, buildTube, buildTunnel, buildWindmill, neonGridTexture } from './attractions.js';

const WALL_H = 0.32;
const PLATFORM_DEPTH = 2.4;
const BUMPER_COLORS = [0x4b7bec, 0xff6b6b, 0xffc145, 0x9b59b6];
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide });
const glowMat = (color) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 });

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
  const relief = hasRelief(course);
  const lift = relief ? (x, z) => groundHeight(course, x, z) : () => 0;
  const hc = lift(hx, hz);
  const style = attractionStyle(theme);
  const neon = theme.neon;
  const neonColor = (i) => neon[i % neon.length];

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
  const grassM = neon ? { map: neonGridTexture(theme.grass, '#' + new THREE.Color(neon[0]).getHexString()) } : grassMaps(theme.grass);
  const grass = grassM.map;
  grass.repeat.set(0.5, 0.5);
  // lateral de la maqueta: corte de terreno con capas de tierra y roca
  const dirtM = dirtMaps(!!neon);
  dirtM.map.repeat.set(0.5, 1 / PLATFORM_DEPTH);
  const grassMat = neon
    ? new THREE.MeshStandardMaterial({ map: grass, emissiveMap: grass, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.6, metalness: 0.2 })
    : new THREE.MeshStandardMaterial({ map: grass, normalMap: grassM.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.92 });
  const platform = new THREE.Mesh(geo, [grassMat, new THREE.MeshStandardMaterial({ ...dirtM, roughness: 1 })]);
  platform.receiveShadow = true;
  scene.add(platform);
  if (relief) {
    // el césped de verdad es una malla con relieve; la plataforma queda debajo
    geo.translate(0, -0.03, 0);
    scene.add(reliefSurface(course, grassMat));
  }

  // interior del hoyo y aro blanco
  const cupInside = new THREE.Mesh(
    new THREE.CylinderGeometry(CUP_R, CUP_R, 0.4, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe8e8e8, side: THREE.BackSide, roughness: 0.6 }),
  );
  cupInside.position.set(hx, hc - 0.2, hz);
  const cupBottom = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 32), new THREE.MeshBasicMaterial({ color: 0x1b1b1b }));
  cupBottom.rotation.x = -Math.PI / 2;
  cupBottom.position.set(hx, hc - 0.38, hz);
  const rim = new THREE.Mesh(new THREE.RingGeometry(CUP_R, CUP_R + 0.035, 40), new THREE.MeshBasicMaterial({ color: neon ? neonColor(0) : 0xffffff }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(hx, hc + 0.003, hz);
  if (!course.noCup) scene.add(cupInside, cupBottom, rim);
  else scene.add(bullseye(hx, hz));
  // volcán: el hoyo es un cráter con lava brillante dentro y grietas incandescentes alrededor
  const lavaCup = theme.lava && !course.noCup ? lavaCrater(scene, hx, hz, cupInside, cupBottom) : null;
  if (lavaCup) lavaCup.group.position.y = hc;
  else if (relief && !course.noCup) scene.add(cupCollar(hx, hz, hc, grassMat));

  // arena con bordes redondeados
  const sandM = course.sand.length ? sandMaps() : null;
  if (sandM) sandM.map.repeat.set(0.6, 0.6);
  const sandMat = sandM && new THREE.MeshStandardMaterial({ ...sandM, roughness: 1 });
  for (const s of course.sand) {
    const r = Math.min(s.w, s.d) * 0.35;
    const sh = roundedRect(s.w, s.d, r);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh, 12), sandMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(s.x, lift(s.x, s.z) + 0.004, s.z);
    m.receiveShadow = true;
    const edge = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(s.w + 0.14, s.d + 0.14, r + 0.07), 12), sandEdgeMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(s.x, lift(s.x, s.z) + 0.003, s.z);
    scene.add(edge, m);
  }

  // paredes de madera (en neón: oscuras con una línea de luz arriba)
  const night = !!theme.rim && theme.sunIntensity < 2;
  let segIndex = 0;
  const wood = woodMaps();
  const walls = [];
  const aoStrips = [];
  segmentsOf(course).forEach(([[ax, az], [bx, bz]], i) => {
    // materiales propios para poder transparentar la pared que tapa la bola
    const wallMat = neon
      ? new THREE.MeshStandardMaterial({ color: 0x0d0c1c, roughness: 0.4, metalness: 0.5, transparent: true })
      : new THREE.MeshStandardMaterial({ ...wood, roughness: 0.75, transparent: true });
    const capMat = neon
      ? new THREE.MeshStandardMaterial({ color: neonColor(i), emissive: neonColor(i), emissiveIntensity: 1.1, roughness: 0.3, transparent: true })
      : new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.75, envMapIntensity: 0.4, transparent: true });
    // de noche el remate de las paredes es una tira de luz del color del contraluz
    if (night && !neon) capMat.color.setHex(0x2a2a3a), capMat.emissive.setHex(theme.rim[segIndex++ % 2]), (capMat.emissiveIntensity = 0.4);
    walls.push({ a: [ax, az], b: [bx, bz], mats: [wallMat, capMat], opacity: 1 });
    const len = Math.hypot(bx - ax, bz - az) + WALL_HALF * 2;
    const segs = relief ? Math.max(1, Math.ceil(len / 0.2)) : 1;
    // sin relieve las paredes llevan los cantos redondeados (con relieve hace
    // falta una caja troceada a lo largo para seguir el césped)
    const bodyGeo = relief ? new THREE.BoxGeometry(len, WALL_H, WALL_HALF * 2, segs) : new RoundedBoxGeometry(len, WALL_H, WALL_HALF * 2, 2, 0.03);
    scaleUV(bodyGeo, len / 1.5, 1);
    bodyGeo.translate(0, WALL_H / 2, 0);
    const capGeo = relief ? new THREE.BoxGeometry(len + 0.02, 0.05, WALL_HALF * 2 + 0.04, segs) : new RoundedBoxGeometry(len + 0.02, 0.06, WALL_HALF * 2 + 0.04, 2, 0.025);
    capGeo.translate(0, WALL_H + 0.02, 0);
    // sombra de contacto: una franja oscura y difuminada al pie de la pared
    const ao = new THREE.PlaneGeometry(len, WALL_HALF * 2 + 0.5, relief ? segs : 1, 1);
    ao.rotateX(-Math.PI / 2);
    ao.rotateY(-Math.atan2(bz - az, bx - ax));
    ao.translate((ax + bx) / 2, 0.006, (az + bz) / 2);
    if (relief) {
      const p = ao.attributes.position;
      for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) + lift(p.getX(k), p.getZ(k)));
    }
    aoStrips.push(ao);
    // se colocan en el mundo y siguen el relieve a lo largo de la pared: la base
    // se queda abajo (muro de contención) y la parte de arriba sube con el césped
    const rot = -Math.atan2(bz - az, bx - ax);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const ux = Math.cos(-rot), uz = Math.sin(-rot);
    for (const [g, all] of [[bodyGeo, false], [capGeo, true]]) {
      g.rotateY(rot);
      g.translate(cx, 0, cz);
      if (!relief) continue;
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        if (!all && p.getY(k) < 0.01) continue;
        // altura en la línea central de la pared, igual en sus dos caras
        const along = (p.getX(k) - cx) * ux + (p.getZ(k) - cz) * uz;
        p.setY(k, p.getY(k) + lift(cx + ux * along, cz + uz * along));
      }
      g.computeVertexNormals();
    }
    const body = new THREE.Mesh(bodyGeo, wallMat);
    const cap = new THREE.Mesh(capGeo, capMat);
    body.castShadow = body.receiveShadow = cap.castShadow = true;
    scene.add(body, cap);
  });
  if (aoStrips.length && !neon) {
    const aoMesh = new THREE.Mesh(mergeGeometries(aoStrips), new THREE.MeshBasicMaterial({ map: aoStripTexture(), color: 0x000000, transparent: true, opacity: night ? 0.5 : 0.32, depthWrite: false }));
    aoMesh.renderOrder = 1;
    scene.add(aoMesh);
  }

  // postes en las esquinas
  const postMat = neon ? new THREE.MeshStandardMaterial({ color: 0x1a1830, roughness: 0.3, metalness: 0.6 }) : new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4 });
  const corners = new Set();
  const posts = [];
  for (const seg of segmentsOf(course)) for (const p of seg) corners.add(p.join(','));
  let corner = 0;
  for (const k of corners) {
    const [x, z] = k.split(',').map(Number);
    const h = lift(x, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(WALL_HALF * 1.25, WALL_HALF * 1.3, WALL_H + 0.12 + h, 20), postMat);
    post.position.set(x, (WALL_H + 0.12 + h) / 2, z);
    post.castShadow = true;
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(WALL_HALF * 1.1, 20, 14),
      neon ? glowMat(neonColor(corner++)) : new THREE.MeshStandardMaterial({ color: 0xff5a4e, emissive: 0xff3a2e, emissiveIntensity: night ? 1.4 : 0.15 }),
    );
    ball.position.set(x, h + WALL_H + 0.17, z);
    scene.add(post, ball);
    posts.push({ x, z, meshes: [post, ball] });
  }

  // setas rebotadoras
  const bumpers = course.bumpers.map((b, i) => {
    const g = new THREE.Group();
    const color = BUMPER_COLORS[i % BUMPER_COLORS.length];
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r * 1.05, 0.3, 32), new THREE.MeshStandardMaterial({ color: 0xfff3dc, roughness: 0.7 }));
    stem.position.y = 0.15;
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(b.r * 1.25, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      neon ? new THREE.MeshStandardMaterial({ color: neonColor(i), emissive: neonColor(i), emissiveIntensity: 0.55, roughness: 0.3 }) : new THREE.MeshStandardMaterial({ color, roughness: 0.3, emissive: color, emissiveIntensity: night ? 0.45 : 0.08 }),
    );
    top.scale.y = 0.6;
    top.position.y = 0.3;
    outline(top, 0.03);
    outline(stem, 0.03);
    // lunares de la seta en una sola malla
    const dotGeos = [];
    for (let k = 0; k < 5; k++) {
      const d = new THREE.SphereGeometry(b.r * 0.18, 10, 6);
      const a = (k / 5) * Math.PI * 2;
      d.scale(1, 0.5, 1);
      d.translate(Math.cos(a) * b.r * 0.75, 0.3 + b.r * 0.42, Math.sin(a) * b.r * 0.75);
      dotGeos.push(d);
    }
    const dots = new THREE.Mesh(mergeGeometries(dotGeos), dotMat(night));
    // sombra de contacto suave bajo la seta
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(b.r * 3.6, b.r * 3.6), contactMat);
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.007;
    contact.userData.noShadow = true;
    g.add(stem, top, dots, contact);
    g.position.set(b.x, lift(b.x, b.z), b.z);
    g.traverse((o) => o.isMesh && !o.userData.noShadow && (o.castShadow = true));
    scene.add(g);
    return g;
  });

  // aspas giratorias rayadas
  const spinners = course.spinners.map((sp) => {
    const g = new THREE.Group();
    const tex = neon ? stripeTexture('#' + new THREE.Color(neon[1]).getHexString(), '#111122') : stripeTexture('#ff4b3e', '#ffffff');
    tex.repeat.set(sp.len * 2, 1);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(sp.len, WALL_H, WALL_HALF * 2),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, ...(neon ? { emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.5 } : {}) }),
    );
    bar.position.y = WALL_H / 2 + 0.02;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, WALL_H * 2, 16), new THREE.MeshStandardMaterial({ color: 0x3d3d5c, metalness: 0.4, roughness: 0.4 }));
    hub.position.y = WALL_H;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8), new THREE.MeshStandardMaterial({ color: 0xffc145, emissive: 0xffa020, emissiveIntensity: night ? 1.5 : 0.25 }));
    cap.position.y = WALL_H * 2;
    bar.castShadow = hub.castShadow = true;
    outline(hub, 0.03);
    g.add(bar, hub, cap);
    g.position.set(sp.x, lift(sp.x, sp.z), sp.z);
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
    pad.position.set(b.x, lift(b.x, b.z) + 0.005, b.z);
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(b.w + 0.12, b.d + 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    frame.rotation.copy(pad.rotation);
    frame.position.set(b.x, lift(b.x, b.z) + 0.004, b.z);
    scene.add(frame, pad);
    return tex;
  });

  // pendientes: sombreado de cuesta y flechas que bajan, pegados al relieve
  const slopeTextures = (course.slopes ?? []).map((sl) => {
    const rot = -Math.atan2(sl.dir[0], -sl.dir[1]);
    const along = sl.dir[0] !== 0 ? sl.w : sl.d, across = sl.dir[0] !== 0 ? sl.d : sl.w;
    const n = relief ? Math.ceil(along / 0.2) : 1;
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(across, along, 1, n), new THREE.MeshBasicMaterial({ map: slopeShadeTexture(), transparent: true, depthWrite: false }));
    shade.rotation.set(-Math.PI / 2, 0, rot);
    shade.position.set(sl.x, 0.0025, sl.z);
    const tex = slopeArrowTexture();
    tex.repeat.set(Math.max(1, Math.round(across / 1.2)), along / 1.2);
    const arrows = new THREE.Mesh(new THREE.PlaneGeometry(across, along, 1, n), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    arrows.rotation.copy(shade.rotation);
    arrows.position.set(sl.x, 0.0035, sl.z);
    if (relief) [shade, arrows].forEach((m) => drape(m, lift));
    scene.add(shade, arrows);
    return { tex, speed: sl.accel * 0.12 };
  });

  // atracciones
  const attractions = [
    ...(course.loops ?? []).map((l, i) => buildLoop(scene, l, style, i)),
    ...(course.windmills ?? []).map((wm) => buildWindmill(scene, wm, style, lift(wm.x, wm.z))),
    ...(course.tunnels ?? []).map((tn, i) => buildTunnel(scene, tn, style, lift(tn.x, tn.z), i)),
  ];
  const tubes = (course.portals ?? []).map((p, i) => (p.tube ? buildTube(scene, p, style, i, lift(...p.a)) : null));

  // portales: entrada morada y salida naranja, con remolino y columna de luz
  const portals = (course.portals ?? [])
    .filter((p) => !p.tube)
    .flatMap((p) => [portalMesh(scene, p.a, p.r, '#b46cff', 0xb46cff, lift(...p.a)), portalMesh(scene, p.b, p.r * 0.8, '#ffb020', 0xffb020, lift(...p.b))]);

  // bloques que se mueven
  const crate = crateTexture();
  const movers = (course.movers ?? []).map((m) => {
    const geo = new THREE.BoxGeometry(m.w, 0.42, m.d);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: crate, roughness: 0.6 }));
    mesh.position.y = 0.21 + lift(m.x, m.z);
    mesh.castShadow = mesh.receiveShadow = true;
    outline(mesh, 0.03);
    scene.add(mesh);
    return mesh;
  });

  // bandera con tela que ondea
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.7, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.3 }));
  pole.position.set(hx, hc + 0.85, hz);
  pole.castShadow = true;
  const clothGeo = new THREE.PlaneGeometry(0.62, 0.38, 12, 4);
  clothGeo.translate(0.31, -0.19, 0);
  const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ color: 0xff3b30, side: THREE.DoubleSide, roughness: 0.8 }));
  cloth.position.set(hx, hc + 1.68, hz);
  cloth.castShadow = true;
  scene.add(pole, cloth);
  const clothBase = Float32Array.from(clothGeo.attributes.position.array);

  // tee: alfombrilla de salida
  const tee = new THREE.Mesh(
    new THREE.CircleGeometry(0.35, 24),
    neon ? new THREE.MeshStandardMaterial({ color: neonColor(2), emissive: neonColor(2), emissiveIntensity: 0.6 }) : new THREE.MeshStandardMaterial({ color: 0x2f7d32, roughness: 1 }),
  );
  tee.rotation.x = -Math.PI / 2;
  tee.position.set(course.tee[0], lift(...course.tee) + 0.003, course.tee[1]);
  tee.receiveShadow = true;
  scene.add(tee);

  return {
    spinners,
    bumpers,
    flag: { pole, cloth },
    update(t, cameraPos, ballPos) {
      attractions.forEach((a) => a.update(t, ballPos));
      tubes.forEach((tb) => tb?.update(t));
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
      pole.position.y += (hc + 0.85 + targetY - pole.position.y) * 0.1;
      cloth.position.y = pole.position.y + 0.83;
      // un poste pegado a la cámara taparía media pantalla
      for (const p of posts) {
        const near = Math.hypot(cameraPos.x - p.x, cameraPos.z - p.z) < 1.8;
        p.meshes.forEach((m) => (m.visible = !near));
      }
      for (const w of walls) {
        const blocks = crosses(cameraPos.x, cameraPos.z, ballPos.x, ballPos.z, w.a, w.b);
        // la pared que tapa la bola desaparece del todo (medio transparente dejaba
        // una franja blanquecina abajo de la pantalla)
        w.opacity += ((blocks ? 0 : 1) - w.opacity) * 0.2;
        for (const m of w.mats) {
          m.opacity = w.opacity;
          m.depthWrite = w.opacity > 0.95;
          m.visible = w.opacity > 0.03;
        }
      }
      bumpers.forEach((b) => b.scale.setScalar(1 + (b.userData.squash ?? 0)));
      bumpers.forEach((b) => (b.userData.squash = (b.userData.squash ?? 0) * 0.85));
    },
  };
}

function portalMesh(scene, [x, z], r, css, color, y = 0) {
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
  g.position.set(x, y, z);
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

const insidePoly = (x, z, poly) => {
  let ok = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ok = !ok;
  }
  return ok;
};

/**
 * Césped con relieve: rejilla fina recortada por el contorno (las paredes
 * tapan el borde dentado) y con un agujero en el hoyo que tapa cupCollar.
 */
function reliefSurface(course, material) {
  const step = 0.12;
  const xs = course.outline.map((p) => p[0]), zs = course.outline.map((p) => p[1]);
  const x0 = Math.min(...xs), z0 = Math.min(...zs);
  const nx = Math.ceil((Math.max(...xs) - x0) / step) + 1, nz = Math.ceil((Math.max(...zs) - z0) / step) + 1;
  const [hx, hz] = course.cup;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      pos.push(x, groundHeight(course, x, z), z);
      uv.push(x, -z);
    }
  }
  const near = (k) => Math.hypot(pos[k * 3] - hx, pos[k * 3 + 2] - hz) < CUP_R + 0.01;
  const tri = (a, b, c) => {
    const cx = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
    if (!insidePoly(cx, cz, course.outline)) return;
    if (!course.noCup && (near(a) || near(b) || near(c))) return;
    idx.push(a, b, c);
  };
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      tri(a, c, b);
      tri(b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // las laderas de los montículos llevan su color (roca en el volcán)
  const tinted = (course.mounds ?? []).some((m) => m.tint !== undefined);
  let mat = material;
  if (tinted) {
    const col = new Float32Array(pos.length);
    const c = new THREE.Color();
    for (let k = 0; k < pos.length / 3; k++) {
      c.setRGB(1, 1, 1);
      for (const m of course.mounds) {
        const d = Math.hypot(pos[k * 3] - m.x, pos[k * 3 + 2] - m.z);
        if (m.tint === undefined || d >= m.base) continue;
        const k2 = d <= m.top ? 0.85 : 0.85 * Math.min(1, (m.base - d) / 0.5);
        c.lerp(new THREE.Color(m.tint), k2);
      }
      c.toArray(col, k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    mat = material.clone();
    mat.vertexColors = true;
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** Corona de césped alrededor del hoyo que tapa el borde dentado de la rejilla. */
function cupCollar(hx, hz, y, material) {
  const geo = new THREE.RingGeometry(CUP_R, CUP_R + 0.26, 48, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(hx, y + 0.002, hz);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count * 3).fill(1), 3));
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  return m;
}

/** Pasa la malla a coordenadas del mundo y la pega al relieve. */
function drape(mesh, lift) {
  mesh.updateMatrix();
  mesh.geometry.applyMatrix4(mesh.matrix);
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  const p = mesh.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + lift(p.getX(i), p.getZ(i)));
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

const sandEdgeMat = new THREE.MeshStandardMaterial({ color: 0xc9a861, roughness: 1 });
const contactMat = new THREE.MeshBasicMaterial({ map: softDotTexture(), color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
const dotMats = {};
const dotMat = (night) => (dotMats[night] ??= new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: night ? 1.2 : 0.2 }));

/** Degradado transversal: oscuro en el centro (bajo la pared) y transparente a los lados. */
function aoStripTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.5, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

export { BALL_R };
