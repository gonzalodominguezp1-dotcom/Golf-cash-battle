import * as THREE from 'three';
import { BALL_R, CUP_R, WALL_HALF, moverPos, segmentsOf, tubeTable } from '../physics.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chevronTexture, crateTexture, dirtMaps, grassMaps, rockFloorMaps, roughTone, sandMaps, slopeShadeTexture, softDotTexture, stripeTexture, woodMaps } from './textures.js';
import { buildPortal } from './portal.js';
import { groundHeight, hasRelief, tierHeight } from './terrain.js';
import { lavaMaterial } from './lava.js';
import { attractionStyle, buildLoop, buildTube, buildTunnel, buildWindmill, neonGridTexture } from './attractions.js';

const WALL_H = 0.32;
const PLATFORM_DEPTH = 2.4;
// pistas a ras de suelo (course.grounded): paredes y postes se hunden un poco en la tierra
const GROUND_SINK = 0.05;
// antegreen: [desplazamiento hacia fuera, altura, opacidad] de cada anillo
const COLLAR_RINGS = [[0, -0.012, 1], [0.7, -0.016, 1], [1.0, -0.021, 0.6], [1.25, -0.026, 0.2], [1.45, -0.03, 0]];
const BUMPER_COLORS = [0x4b7bec, 0xff6b6b, 0xffc145, 0x9b59b6];
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide });
const glowMat = (color) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 });

/** Contorno de dibujo animado (casco invertido) alrededor de una malla. */
function outline(mesh, grow = 0.035) {
  const oMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.BackSide, transparent: true });
  const o = new THREE.Mesh(mesh.geometry, oMat);
  const s = mesh.geometry.boundingSphere ?? (mesh.geometry.computeBoundingSphere(), mesh.geometry.boundingSphere);
  o.scale.setScalar(1 + grow / Math.max(0.05, s.radius));
  mesh.add(o);
  return oMat;
}

/** Construye la pista: plataforma de césped, hoyo real, paredes de madera, obstáculos y bandera. */
export function buildCourse(scene, course, theme) {
  const [hx, hz] = course.cup;
  const relief = hasRelief(course);
  // sin cuestas solo suben las zonas elevadas (tiers), que son llanas
  const lift = relief ? (x, z) => groundHeight(course, x, z) : course.tiers ? (x, z) => tierHeight(course, x, z) : () => 0;
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
  // la lava va en canales recortados en la plataforma
  for (const l of course.lava ?? []) shape.holes.push(new THREE.Path(l.poly.map(([x, z]) => new THREE.Vector2(x, -z))));
  // a ras del terreno el green es una lámina (sin losa ni laterales de tierra)
  const grounded = !!course.grounded;
  const sink = grounded ? GROUND_SINK : 0;
  const geo = grounded ? new THREE.ShapeGeometry(shape, 32) : new THREE.ExtrudeGeometry(shape, { depth: PLATFORM_DEPTH, bevelEnabled: false, curveSegments: 32 });
  geo.rotateX(-Math.PI / 2);
  if (!grounded) geo.translate(0, -PLATFORM_DEPTH, 0);
  const grassM = neon ? { map: neonGridTexture(theme.grass, '#' + new THREE.Color(neon[0]).getHexString()) } : theme.rockFloor ? rockFloorMaps(theme.grass) : grassMaps(theme.grass);
  const grass = grassM.map;
  grass.repeat.set(0.5, 0.5);
  const grassMat = neon
    ? new THREE.MeshStandardMaterial({ map: grass, emissiveMap: grass, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.6, metalness: 0.2 })
    : new THREE.MeshStandardMaterial({ map: grass, normalMap: grassM.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.92 });
  let platformMat = grassMat;
  if (!grounded) {
    // lateral de la maqueta: corte de terreno con capas de tierra y roca
    const dirtM = dirtMaps(!!neon, !!theme.rockFloor);
    dirtM.map.repeat.set(0.5, 1 / PLATFORM_DEPTH);
    platformMat = [grassMat, new THREE.MeshStandardMaterial({ ...dirtM, roughness: 1 })];
  }
  const platform = new THREE.Mesh(geo, platformMat);
  platform.receiveShadow = true;
  scene.add(platform);
  // zonas elevadas: su propia plataforma, un bloque de roca que baja hasta el suelo
  for (const t of course.tiers ?? []) {
    const depth = t.h + 9;
    const tg = new THREE.ExtrudeGeometry(new THREE.Shape(t.poly.map(([x, z]) => new THREE.Vector2(x, -z))), { depth, bevelEnabled: false });
    tg.rotateX(-Math.PI / 2);
    tg.translate(0, t.h - depth, 0);
    const sideM = dirtMaps(!!neon, !!theme.rockFloor);
    sideM.map.repeat.set(0.5, 1 / PLATFORM_DEPTH);
    const tier = new THREE.Mesh(tg, [grassMat, new THREE.MeshStandardMaterial({ ...sideM, roughness: 1 })]);
    tier.receiveShadow = tier.castShadow = true;
    scene.add(tier);
  }
  if (grounded && !neon) scene.add(collarMesh(course, theme));
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

  // ríos y charcos de lava que corren por los canales
  const lavaMats = (course.lava ?? []).map((l) => buildLava(scene, l));

  // arena: un montoncito con volumen que se deshace en granos sobre el césped,
  // sin borde dibujado. La zona de juego (física) es el rectángulo; el fundido
  // queda repartido a ambos lados de su borde
  const sandM = course.sand.length ? sandMaps() : null;
  if (sandM) sandM.map.repeat.set(0.5, 0.5);
  course.sand.forEach((s, i) => {
    const m = new THREE.Mesh(bunkerGeometry(s.w, s.d), bunkerMaterial(sandM, s.w, s.d, i, theme));
    m.rotation.x = -Math.PI / 2;
    m.position.set(s.x, lift(s.x, s.z) + 0.002, s.z);
    m.receiveShadow = true;
    m.renderOrder = 1;
    scene.add(m);
  });

  // paredes de madera (en neón: oscuras con una línea de luz arriba)
  const night = !!theme.rim && theme.sunIntensity < 2;
  let segIndex = 0;
  const wood = woodMaps();
  const rockWall = theme.rockFloor ? rockFloorMaps(theme.grass) : null;
  const walls = [];
  const aoStrips = [];
  // a ras de suelo, normal hacia fuera de cada lado del contorno (para la sombra exterior)
  const outward = grounded ? outwardNormals(course.outline) : [];
  segmentsOf(course).forEach(([[ax, az], [bx, bz]], i) => {
    // materiales propios para poder transparentar la pared que tapa la bola
    const wallMat = neon
      ? new THREE.MeshStandardMaterial({ color: 0x0d0c1c, roughness: 0.4, metalness: 0.5, transparent: true })
      : theme.rockFloor
        ? new THREE.MeshStandardMaterial({ ...rockWall, color: 0x8a7470, roughness: 0.95, transparent: true })
        : new THREE.MeshStandardMaterial({ ...wood, roughness: 0.75, transparent: true });
    const capMat = neon
      ? new THREE.MeshStandardMaterial({ color: neonColor(i), emissive: neonColor(i), emissiveIntensity: 0.35, roughness: 0.3, transparent: true })
      : new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.75, envMapIntensity: 0.4, transparent: true });
    // de noche el remate de las paredes es una tira de luz del color del contraluz
    const baseEmissive = capMat.emissiveIntensity || 0;
    walls.push({ a: [ax, az], b: [bx, bz], mats: [wallMat, capMat], opacity: 1, baseEmissive });
    const len = Math.hypot(bx - ax, bz - az) + WALL_HALF * 2;
    const segs = relief ? Math.max(1, Math.ceil(len / 0.2)) : 1;
    // sin relieve las paredes llevan los cantos redondeados (con relieve hace
    // falta una caja troceada a lo largo para seguir el césped)
    // a ras de suelo la base queda enterrada: el bordillo asienta sin dejar rendija
    const bodyGeo = relief ? new THREE.BoxGeometry(len, WALL_H + sink, WALL_HALF * 2, segs) : new RoundedBoxGeometry(len, WALL_H + sink, WALL_HALF * 2, 2, 0.03);
    scaleUV(bodyGeo, len / 1.5, 1);
    bodyGeo.translate(0, (WALL_H - sink) / 2, 0);
    const capGeo = relief ? new THREE.BoxGeometry(len + 0.02, 0.05, WALL_HALF * 2 + 0.04, segs) : new RoundedBoxGeometry(len + 0.02, 0.06, WALL_HALF * 2 + 0.04, 2, 0.025);
    capGeo.translate(0, WALL_H + 0.02, 0);
    // sombra de contacto: una franja oscura y difuminada al pie de la pared
    const out = outward[i];
    const ao = new THREE.PlaneGeometry(len, WALL_HALF * 2 + 0.5, relief ? segs : 1, out ? 2 : 1);
    ao.rotateX(-Math.PI / 2);
    ao.rotateY(-Math.atan2(bz - az, bx - ax));
    // sin relieve la pared va entera a la altura de su zona (las de las zonas elevadas arriba)
    const base = relief ? 0 : lift((ax + bx) / 2, (az + bz) / 2);
    ao.translate((ax + bx) / 2, 0.006 + base, (az + bz) / 2);
    const p = ao.attributes.position;
    for (let k = 0; k < p.count; k++) {
      let y = p.getY(k) + (relief ? lift(p.getX(k), p.getZ(k)) : 0);
      // por fuera la franja baja hasta el antegreen para que la pared asiente también ahí
      if (out && (p.getX(k) - (ax + bx) / 2) * out[0] + (p.getZ(k) - (az + bz) / 2) * out[1] > 0.01) y += COLLAR_RINGS[0][1] - 0.003;
      p.setY(k, y);
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
      if (!relief) {
        if (base) g.translate(0, base, 0);
        continue;
      }
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
  const corners = new Set();
  const posts = [];
  for (const seg of segmentsOf(course)) for (const p of seg) corners.add(p.join(','));
  let corner = 0;
  for (const k of corners) {
    const [x, z] = k.split(',').map(Number);
    const h = lift(x, z);
    const postMat = neon
      ? new THREE.MeshStandardMaterial({ color: 0x1a1830, roughness: 0.3, metalness: 0.6, transparent: true })
      : new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4, transparent: true });
    const ballMat = neon
      ? new THREE.MeshStandardMaterial({ color: neonColor(corner++), emissive: neonColor(corner - 1), emissiveIntensity: 0.35, transparent: true })
      : new THREE.MeshStandardMaterial({ color: 0xff5a4e, emissive: 0xff3a2e, emissiveIntensity: night ? 0.35 : 0.15, transparent: true });
    const baseEmissive = ballMat.emissiveIntensity || 0;

    // con relieve el poste baja hasta el suelo de la maqueta; en una zona elevada empieza en ella
    const from = (relief ? 0 : h) - sink, ph = WALL_H + 0.12 + h - from;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(WALL_HALF * 1.25, WALL_HALF * 1.3, ph, 20), postMat);
    post.position.set(x, from + ph / 2, z);
    post.castShadow = true;
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(WALL_HALF * 1.1, 20, 14),
      ballMat,
    );
    ball.position.set(x, h + WALL_H + 0.17, z);
    scene.add(post, ball);
    posts.push({
      x,
      z,
      baseH: h,
      h: h + WALL_H + 0.17,
      meshes: [post, ball],
      mats: [postMat, ballMat],
      opacity: 1,
      baseEmissive,
    });
  }

  // setas rebotadoras
  const bumpers = course.bumpers.map((b, i) => {
    const g = new THREE.Group();
    const color = theme.lava ? 0x2e2224 : BUMPER_COLORS[i % BUMPER_COLORS.length];
    const stemMat = theme.lava
      ? new THREE.MeshStandardMaterial({ color: 0x1e1618, roughness: 1, flatShading: true, transparent: true })
      : new THREE.MeshStandardMaterial({ color: 0xfff3dc, roughness: 0.7, transparent: true });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r * 1.05, 0.3, theme.lava ? 7 : 32), stemMat);
    stem.position.y = 0.15;
    const topMat = neon
      ? new THREE.MeshStandardMaterial({ color: neonColor(i), emissive: neonColor(i), emissiveIntensity: 0.55, roughness: 0.3, transparent: true })
      : theme.lava
        ? new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: 0xff4a10, emissiveIntensity: 0.35, flatShading: true, transparent: true })
        : new THREE.MeshStandardMaterial({ color, roughness: 0.3, emissive: color, emissiveIntensity: night ? 0.45 : 0.08, transparent: true });
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(b.r * 1.25, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      topMat,
    );
    top.scale.y = 0.6;
    top.position.y = 0.3;
    const oTop = outline(top, 0.03);
    const oStem = outline(stem, 0.03);
    // lunares de la seta en una sola malla
    const dotGeos = [];
    for (let k = 0; k < 5; k++) {
      const d = new THREE.SphereGeometry(b.r * 0.18, 10, 6);
      const a = (k / 5) * Math.PI * 2;
      d.scale(1, 0.5, 1);
      d.translate(Math.cos(a) * b.r * 0.75, 0.3 + b.r * 0.42, Math.sin(a) * b.r * 0.75);
      dotGeos.push(d);
    }
    const dotM = (theme.lava ? emberMat : dotMat(night)).clone();
    dotM.transparent = true;
    const dots = new THREE.Mesh(mergeGeometries(dotGeos), dotM);
    // sombra de contacto suave bajo la seta
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(b.r * 3.6, b.r * 3.6), getContactMat());
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.007;
    contact.userData.noShadow = true;
    g.add(stem, top, dots, contact);
    g.position.set(b.x, lift(b.x, b.z), b.z);
    g.traverse((o) => o.isMesh && !o.userData.noShadow && (o.castShadow = true));
    scene.add(g);
    g.userData.mats = [stemMat, topMat, dotM, oTop, oStem];
    g.userData.opacity = 1;
    g.userData.baseEmissive = topMat.emissiveIntensity || 0;
    g.userData.x = b.x;
    g.userData.z = b.z;
    g.userData.r = b.r;
    g.userData.h = lift(b.x, b.z) + 0.45;
    return g;
  });

  // aspas giratorias rayadas
  const spinners = course.spinners.map((sp) => {
    const g = new THREE.Group();
    const tex = neon ? stripeTexture('#' + new THREE.Color(neon[1]).getHexString(), '#111122') : stripeTexture('#ff4b3e', '#ffffff');
    tex.repeat.set(sp.len * 2, 1);
    const barMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.5,
      transparent: true,
      ...(neon ? { emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.5 } : {}),
    });
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(sp.len, WALL_H, WALL_HALF * 2),
      barMat,
    );
    bar.position.y = WALL_H / 2 + 0.02;
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x3d3d5c, metalness: 0.4, roughness: 0.4, transparent: true });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, WALL_H * 2, 16), hubMat);
    hub.position.y = WALL_H;
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xffc145,
      emissive: 0xffa020,
      emissiveIntensity: night ? 0.35 : 0.2,
      transparent: true,
    });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8), capMat);
    cap.position.y = WALL_H * 2;
    bar.castShadow = hub.castShadow = true;
    const oHub = outline(hub, 0.03);
    g.add(bar, hub, cap);
    g.position.set(sp.x, lift(sp.x, sp.z), sp.z);
    scene.add(g);
    g.userData.mats = [barMat, hubMat, capMat, oHub];
    g.userData.opacity = 1;
    g.userData.baseEmissive = neon ? 0.5 : (night ? 0.35 : 0.2);
    g.userData.x = sp.x;
    g.userData.z = sp.z;
    g.userData.r = sp.len / 2 + 0.1;
    g.userData.h = lift(sp.x, sp.z) + WALL_H * 2 + 0.2;
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

  // pendientes: sombreado de cuesta pegado al relieve (el relieve ya muestra la inclinación, sin flechas)
  (course.slopes ?? []).forEach((sl) => {
    const rot = -Math.atan2(sl.dir[0], -sl.dir[1]);
    const along = sl.dir[0] !== 0 ? sl.w : sl.d, across = sl.dir[0] !== 0 ? sl.d : sl.w;
    const n = relief ? Math.ceil(along / 0.2) : 1;
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(across, along, 1, n), new THREE.MeshBasicMaterial({ map: slopeShadeTexture(), transparent: true, depthWrite: false }));
    shade.rotation.set(-Math.PI / 2, 0, rot);
    shade.position.set(sl.x, 0.0025, sl.z);
    if (relief) drape(shade, lift);
    scene.add(shade);
  });

  // rampas de salto: cuña de hierro con flechas que suben hacia el labio
  const rampTextures = (course.ramps ?? []).map((r) => buildRamp(scene, r, lift(r.x, r.z)));

  // atracciones
  const attractions = [
    ...(course.loops ?? []).map((l, i) => buildLoop(scene, l, style, i)),
    ...(course.windmills ?? []).map((wm) => buildWindmill(scene, wm, style, lift(wm.x, wm.z))),
    ...(course.tunnels ?? []).map((tn, i) => buildTunnel(scene, tn, style, lift(tn.x, tn.z), i)),
  ];
  const tubes = (course.portals ?? []).map((p, i) => (p.drop ? buildChute(scene, p, lift(...p.a)) : p.tube ? buildTube(scene, p, style, i, lift(...p.a)) : null));

  // portales: entrada morada y salida naranja, con espiral de plasma y luz que tiembla
  const portalTime = { value: 0 };
  const portals = (course.portals ?? [])
    .filter((p) => !p.tube)
    .flatMap((p, i) => [
      buildPortal(scene, p.a, p.r, 0xb46cff, lift(...p.a), portalTime, i * 2),
      buildPortal(scene, p.b, p.r * 0.8, 0xffb020, lift(...p.b), portalTime, i * 2 + 1),
    ]);

  // bloques que se mueven
  const crate = crateTexture();
  const movers = (course.movers ?? []).map((m) => {
    const geo = new THREE.BoxGeometry(m.w, 0.42, m.d);
    const moverMat = new THREE.MeshStandardMaterial({ map: crate, roughness: 0.6, transparent: true });
    const mesh = new THREE.Mesh(geo, moverMat);
    mesh.position.y = 0.21 + lift(m.x, m.z);
    mesh.castShadow = mesh.receiveShadow = true;
    const oMover = outline(mesh, 0.03);
    scene.add(mesh);
    mesh.userData.mats = [moverMat, oMover];
    mesh.userData.opacity = 1;
    mesh.userData.w = m.w;
    mesh.userData.d = m.d;
    mesh.userData.h = 0.42 + lift(m.x, m.z) + 0.1;
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
    update(t, cameraPos, ballPos, lookPos, isOverview) {
      const cam = { x: cameraPos.x, y: cameraPos.y, z: cameraPos.z };
      const ball = ballPos ? {
        x: ballPos.x,
        y: (lift ? lift(ballPos.x, ballPos.z) : 0) + BALL_R,
        z: ballPos.z,
      } : null;

      attractions.forEach((a) => a.update(t, ball, cam));
      tubes.forEach((tb) => tb?.update(t));
      lavaCup?.update(t);
      boostTextures.forEach((tex) => (tex.offset.y = -t * 1.5));
      rampTextures.forEach((tex) => (tex.offset.y = -t * 0.9));
      lavaMats.forEach((m) => m.update(t));
      portalTime.value = t;
      portals.forEach((p) => p.update(t));
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
      const nearFlag = Math.hypot(ballPos.x - hx, ballPos.z - hz) < 1.2;
      const targetY = nearFlag ? 1.25 : 0;
      pole.position.y += (hc + 0.85 + targetY - pole.position.y) * 0.1;
      cloth.position.y = pole.position.y + 0.83;

      // un poste se vuelve 90% invisible (10% opacidad) ÚNICA Y EXCLUSIVAMENTE si tapa la pelota
      for (const p of posts) {
        const blocks = ball ? postBlocksBall(cam, ball, p) : false;
        p.opacity += ((blocks ? 0.1 : 1) - p.opacity) * 0.2;
        p.meshes.forEach((m) => (m.visible = true));
        for (const m of p.mats) {
          m.opacity = p.opacity;
          m.depthWrite = p.opacity > 0.95;
          if (m.emissiveIntensity !== undefined && p.baseEmissive != null) {
            m.emissiveIntensity = p.baseEmissive * (0.15 + 0.85 * (p.opacity - 0.1) / 0.9);
          }
        }
      }

      // las paredes se vuelven 90% invisibles (10% opacidad) ÚNICA Y EXCLUSIVAMENTE si tapan la pelota
      for (const w of walls) {
        const blocks = ball ? wallBlocksBall(cam, ball, w.a, w.b, lift) : false;
        w.opacity += ((blocks ? 0.1 : 1) - w.opacity) * 0.2;
        for (const m of w.mats) {
          m.opacity = w.opacity;
          m.depthWrite = w.opacity > 0.95;
          m.visible = true;
          if (m.emissiveIntensity !== undefined && w.baseEmissive != null) {
            m.emissiveIntensity = w.baseEmissive * (0.15 + 0.85 * (w.opacity - 0.1) / 0.9);
          }
        }
      }

      // setas rebotadoras: se transparentan al 90% ÚNICA Y EXCLUSIVAMENTE si tapan la pelota
      bumpers.forEach((b) => {
        b.scale.setScalar(1 + (b.userData.squash ?? 0));
        b.userData.squash = (b.userData.squash ?? 0) * 0.85;
        if (b.userData.mats) {
          const blocks = ball ? bumperBlocksBall(cam, ball, b) : false;
          b.userData.opacity += ((blocks ? 0.1 : 1) - b.userData.opacity) * 0.2;
          for (const m of b.userData.mats) {
            m.opacity = b.userData.opacity;
            m.depthWrite = b.userData.opacity > 0.95;
            m.visible = true;
          }
        }
      });

      // aspas giratorias: se transparentan al 90% ÚNICA Y EXCLUSIVAMENTE si tapan la pelota
      spinners.forEach((sp) => {
        if (sp.userData.mats) {
          const blocks = ball ? spinnerBlocksBall(cam, ball, sp) : false;
          sp.userData.opacity += ((blocks ? 0.1 : 1) - sp.userData.opacity) * 0.2;
          for (const m of sp.userData.mats) {
            m.opacity = sp.userData.opacity;
            m.depthWrite = sp.userData.opacity > 0.95;
            m.visible = true;
          }
        }
      });

      // bloques móviles: se transparentan al 90% ÚNICA Y EXCLUSIVAMENTE si tapan la pelota
      movers.forEach((m) => {
        if (m.userData.mats) {
          const blocks = ball ? moverBlocksBall(cam, ball, m) : false;
          m.userData.opacity += ((blocks ? 0.1 : 1) - m.userData.opacity) * 0.2;
          for (const mat of m.userData.mats) {
            mat.opacity = m.userData.opacity;
            mat.depthWrite = m.userData.opacity > 0.95;
            mat.visible = true;
          }
        }
      });
    },
  };
}

/**
 * Tubo de lava que cae: boca de cueva en la roca de la ladera y, dentro del
 * volcán, un tobogán de basalto abierto por arriba por el que baja la bola
 * (el tramo que cruza la roca queda tapado por la montaña).
 */
function buildChute(scene, portal, y) {
  const [ax, az] = portal.a;
  const pts = tubeTable(portal).pts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const curve = new THREE.CatmullRomCurve3(pts);
  // media caña: semicírculo de radio R por debajo del recorrido de la bola
  const N = 90, M = 10, R = 0.3;
  const pos = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), down = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const c = curve.getPointAt(u), tan = curve.getTangentAt(u);
    side.crossVectors(tan, up).normalize();
    down.crossVectors(side, tan).normalize().negate();
    for (let k = 0; k <= M; k++) {
      const th = (k / M) * Math.PI;
      // el centro de la caña queda un poco por debajo del centro de la bola
      const p = c.clone().addScaledVector(side, Math.cos(th) * R).addScaledVector(down, Math.sin(th) * R + (R - BALL_R) * 0.6);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < M; k++) {
    const a = i * (M + 1) + k, b = a + M + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const chute = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3a2a26, roughness: 0.85, emissive: 0xff4a10, emissiveIntensity: 0.18, side: THREE.DoubleSide, flatShading: true }));
  chute.castShadow = chute.receiveShadow = true;
  // bordes de magma a lo largo del tobogán
  const rimPts = (s) => pts.map((p, i) => {
    const t = curve.getTangentAt(Math.min(1, i / (pts.length - 1)));
    return p.clone().addScaledVector(side.crossVectors(t, up).normalize(), s * R).add(new THREE.Vector3(0, -0.02, 0));
  });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff5a14, emissiveIntensity: 1.4 });
  const rims = [-1, 1].map((s) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts(s)), 90, 0.035, 6), rimMat));
  // boca de la cueva: agujero negro, arco de roca y resplandor que sale de dentro
  const g = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.CircleGeometry(portal.r, 32), new THREE.MeshBasicMaterial({ color: 0x050303 }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.005;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(portal.r, 0.06, 10, 36), rimMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  const archGeo = new THREE.TorusGeometry(1.05, 0.32, 8, 20, Math.PI);
  const arch = new THREE.Mesh(archGeo, new THREE.MeshStandardMaterial({ color: 0x2a2022, roughness: 1, flatShading: true }));
  arch.position.set(0, 0, -0.6);
  arch.castShadow = true;
  const glow = new THREE.PointLight(0xff6a1a, 3, 4, 1.5);
  glow.position.set(0, 0.6, -0.8);
  g.add(hole, ring, arch, glow);
  // la cueva mira hacia donde llega la bola (de la boca hacia fuera del tubo)
  const [dx, dz] = [portal.b[0] - ax, portal.b[1] - az];
  g.rotation.y = Math.atan2(-dx, -dz);
  g.position.set(ax, y, az);
  scene.add(chute, ...rims, g);
  return {
    update(t) {
      const k = 1 + Math.sin(t * 3.3) * 0.15;
      glow.intensity = 3 * k;
      ring.scale.setScalar(1 + Math.sin(t * 4) * 0.04);
    },
  };
}

/** Río o charco de lava en su canal, con una luz que parpadea. */
function buildLava(scene, l) {
  const shape = new THREE.Shape(l.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const mat = lavaMaterial({ flow: l.flow, heat: 0.06 });
  const lava = new THREE.Mesh(geo, mat);
  lava.position.y = -0.09;
  scene.add(lava);
  // la lava ilumina los bordes del canal y lo que tiene cerca
  const xs = l.poly.map((p) => p[0]), zs = l.poly.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const light = new THREE.PointLight(0xff5a14, 1.5 + size * 0.4, 2.5 + size * 0.6, 1.6);
  light.position.set(cx, 0.5, cz);
  scene.add(light);
  const base = light.intensity, phase = cx * 1.7 + cz;
  return {
    update(t) {
      mat.uniforms.uTime.value = t;
      light.intensity = base * (1 + Math.sin(t * 3.1 + phase) * 0.12 + Math.sin(t * 7.3 + phase * 2) * 0.05);
    },
  };
}

/** Rampa: cuña de hierro oscuro, cubierta con flechas y franjas de peligro en el labio. */
function buildRamp(scene, r, y = 0) {
  const along = r.dir[0] !== 0;
  const L = along ? r.w : r.d, W = along ? r.d : r.w, h = r.h;
  // en local la rampa sube hacia -z (el labio queda en z = -L/2)
  const FL = [-W / 2, 0, L / 2], FR = [W / 2, 0, L / 2];
  const LLb = [-W / 2, 0, -L / 2], LRb = [W / 2, 0, -L / 2], LLt = [-W / 2, h, -L / 2], LRt = [W / 2, h, -L / 2];
  const tris = [FL, FR, LRt, FL, LRt, LLt, FL, LLt, LLb, FR, LRb, LRt];
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  body.computeVertexNormals();
  const g = new THREE.Group();
  const bodyMesh = new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: 0x2a2428, roughness: 0.55, metalness: 0.6 }));
  bodyMesh.castShadow = bodyMesh.receiveShadow = true;
  // labio: franjas amarillas y negras de aviso
  const stripes = stripeTexture('#ffb020', '#1a1414');
  stripes.repeat.set(W * 2, 1);
  const lip = new THREE.Mesh(new THREE.PlaneGeometry(W, h), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.5, emissive: 0xff8a20, emissiveIntensity: 0.25, emissiveMap: stripes }));
  lip.rotation.y = Math.PI;
  lip.position.set(0, h / 2, -L / 2 - 0.002);
  // cubierta con flechas que corren hacia el labio
  const tex = chevronTexture('#2a1a14', '#ffb020');
  const slope = Math.hypot(L, h);
  tex.repeat.set(1, slope / (W - 0.3));
  const deckGeo = new THREE.PlaneGeometry(W - 0.3, slope);
  deckGeo.rotateX(-Math.PI / 2);
  deckGeo.rotateX(Math.atan2(h, L));
  deckGeo.translate(0, h / 2 + 0.004, 0);
  const deck = new THREE.Mesh(deckGeo, new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.5 }));
  deck.receiveShadow = true;
  // remaches a lo largo de los bordes
  const rivets = [];
  for (let k = 0; k <= 4; k++) {
    for (const s of [-1, 1]) {
      const z = L / 2 - (k / 4) * L;
      const rv = new THREE.SphereGeometry(0.03, 6, 4);
      rv.translate(s * (W / 2 - 0.08), (h * k) / 4 + 0.012, z);
      rivets.push(rv);
    }
  }
  const rivetMesh = new THREE.Mesh(mergeGeometries(rivets), new THREE.MeshStandardMaterial({ color: 0x9a8a80, metalness: 0.8, roughness: 0.3 }));
  g.add(bodyMesh, lip, deck, rivetMesh);
  g.rotation.y = Math.atan2(-r.dir[0], -r.dir[1]);
  g.position.set(r.x, y, r.z);
  scene.add(g);
  return tex;
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

// Comprueba si un muro corta la línea de visión 3D entre la cámara y la pelota
function wallBlocksBall(cam, ball, [ax, az], [bx, bz], lift) {
  const cross = (ux, uz, vx, vz) => ux * vz - uz * vx;
  const rx = ball.x - cam.x, rz = ball.z - cam.z;
  const sx = bx - ax, sz = bz - az;
  const den = cross(rx, rz, sx, sz);
  if (Math.abs(den) < 1e-9) return false;
  const t = cross(ax - cam.x, az - cam.z, sx, sz) / den;
  const u = cross(ax - cam.x, az - cam.z, rx, rz) / den;
  const pad = 0.15 / Math.hypot(sx, sz);

  // t debe estar estrictamente entre la cámara (0) y la pelota (1).
  // Si t >= 0.98 el muro está DETRÁS de la pelota (como el muro de fondo), por lo que NO obstruye la visión de la pelota.
  // Si t <= 0.02 el muro está detrás de la cámara.
  if (t <= 0.02 || t >= 0.98 || u < -pad || u > 1 + pad) return false;

  // Altura del rayo en el punto de corte entre cámara y pelota
  const rayY = cam.y + t * (ball.y - cam.y);
  const clampedU = Math.max(0, Math.min(1, u));
  const wx = ax + clampedU * (bx - ax), wz = az + clampedU * (bz - az);
  const groundH = lift ? lift(wx, wz) : 0;
  const wallTop = groundH + WALL_H + 0.04;

  // Solo obstruye si el rayo cámara->pelota pasa por debajo de la coronación del muro
  return rayY < wallTop;
}

// Comprueba si un poste de esquina bloquea la visión de la pelota
function postBlocksBall(cam, ball, p) {
  const dx = ball.x - cam.x, dz = ball.z - cam.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) return false;
  const t = ((p.x - cam.x) * dx + (p.z - cam.z) * dz) / lenSq;

  // El poste debe estar estrictamente entre la cámara y la pelota
  if (t <= 0.02 || t >= 0.98) return false;

  const rx = cam.x + t * dx, rz = cam.z + t * dz;
  const dXZ = Math.hypot(p.x - rx, p.z - rz);
  if (dXZ > WALL_HALF * 2.0) return false;

  const rayY = cam.y + t * (ball.y - cam.y);
  return rayY <= p.h;
}

// Comprueba si una seta rebotadora bloquea la visión de la pelota
function bumperBlocksBall(cam, ball, b) {
  const dx = ball.x - cam.x, dz = ball.z - cam.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) return false;
  const t = ((b.userData.x - cam.x) * dx + (b.userData.z - cam.z) * dz) / lenSq;

  // La seta debe estar estrictamente entre la cámara y la pelota
  if (t <= 0.02 || t >= 0.98) return false;

  const rx = cam.x + t * dx, rz = cam.z + t * dz;
  if (Math.hypot(b.userData.x - rx, b.userData.z - rz) < b.userData.r * 1.05) {
    const rayY = cam.y + t * (ball.y - cam.y);
    return rayY < b.userData.h;
  }
  return false;
}

// Comprueba si un aspa giratoria bloquea la visión de la pelota
function spinnerBlocksBall(cam, ball, sp) {
  const dx = ball.x - cam.x, dz = ball.z - cam.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) return false;
  const t = ((sp.userData.x - cam.x) * dx + (sp.userData.z - cam.z) * dz) / lenSq;

  // El obstáculo debe estar estrictamente entre la cámara y la pelota
  if (t <= 0.02 || t >= 0.98) return false;

  const rx = cam.x + t * dx, rz = cam.z + t * dz;
  if (Math.hypot(sp.userData.x - rx, sp.userData.z - rz) < sp.userData.r) {
    const rayY = cam.y + t * (ball.y - cam.y);
    return rayY < sp.userData.h;
  }
  return false;
}

// Comprueba si un bloque móvil bloquea la visión de la pelota
function moverBlocksBall(cam, ball, m) {
  const dx = ball.x - cam.x, dz = ball.z - cam.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) return false;
  const t = ((m.position.x - cam.x) * dx + (m.position.z - cam.z) * dz) / lenSq;

  // El bloque debe estar estrictamente entre la cámara y la pelota
  if (t <= 0.02 || t >= 0.98) return false;

  const rx = cam.x + t * dx, rz = cam.z + t * dz;
  const rad = Math.hypot(m.userData.w, m.userData.d) / 2 + 0.1;
  if (Math.hypot(m.position.x - rx, m.position.z - rz) < rad) {
    const rayY = cam.y + t * (ball.y - cam.y);
    return rayY < m.userData.h;
  }
  return false;
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

function signedArea(outline) {
  let a = 0;
  outline.forEach(([ax, az], i) => {
    const [bx, bz] = outline[(i + 1) % outline.length];
    a += ax * bz - bx * az;
  });
  return a / 2;
}

/** Normal hacia fuera de cada lado del contorno (lado i: del punto i al i+1), gire como gire. */
function outwardNormals(outline) {
  const s = signedArea(outline) > 0 ? 1 : -1;
  return outline.map(([ax, az], i) => {
    const [bx, bz] = outline[(i + 1) % outline.length];
    const l = Math.hypot(bx - ax, bz - az) || 1;
    return [(s * (bz - az)) / l, (-s * (bx - ax)) / l];
  });
}

/**
 * Contorno desplazado `off` hacia fuera: las esquinas exteriores son arcos (no
 * picos) y las interiores, ingletes. Da el mismo número de puntos para
 * cualquier `off`, así los anillos se cosen punto a punto.
 */
function offsetOutline(outline, normals, off) {
  const n = outline.length, pts = [];
  for (let i = 0; i < n; i++) {
    const [px, pz] = outline[i], [qx, qz] = outline[(i + 1) % n];
    const [ax, az] = normals[(i + n - 1) % n], [bx, bz] = normals[i];
    if (ax * (qx - px) + az * (qz - pz) < -1e-9) {
      // esquina exterior: el lado siguiente se mete hacia dentro
      const a0 = Math.atan2(az, ax), da = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
      const k = Math.max(1, Math.ceil(Math.abs(da) / (Math.PI / 12)));
      for (let j = 0; j <= k; j++) {
        const a = a0 + (da * j) / k;
        pts.push([px + Math.cos(a) * off, pz + Math.sin(a) * off]);
      }
    } else {
      const mx = ax + bx, mz = az + bz, ml = Math.hypot(mx, mz) || 1;
      const m = off / Math.max(0.5, ml / 2);
      pts.push([px + (mx / ml) * m, pz + (mz / ml) * m]);
    }
  }
  return pts;
}

/**
 * Franja alrededor del contorno hecha de anillos [desplazamiento, altura,
 * opacidad]; la opacidad va en el color por vértice para fundirla con el suelo.
 */
export function collarGeometry(outline, rings) {
  const normals = outwardNormals(outline);
  const loops = rings.map(([off]) => offsetOutline(outline, normals, off));
  const m = loops[0].length;
  const pos = [], uv = [], col = [], idx = [];
  loops.forEach((loop, r) => {
    for (const [x, z] of loop) {
      pos.push(x, rings[r][1], z);
      uv.push(x, -z);
      col.push(1, 1, 1, rings[r][2]);
    }
  });
  // el orden de los vértices depende del sentido del contorno: la cara mira arriba
  const ccw = signedArea(outline) > 0;
  for (let r = 0; r + 1 < loops.length; r++) {
    for (let i = 0; i < m; i++) {
      const a = r * m + i, b = r * m + ((i + 1) % m), c = a + m, d = b + m;
      if (ccw) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Antegreen: césped segado más alto, más oscuro y apagado que el green, un pelo
 * por debajo de él, que se deshace en el terreno sin borde duro.
 */
function collarMesh(course, theme) {
  const tone = roughTone(theme);
  const hex = (c) => '#' + c.getHexString();
  // sin franjas de corte: los dos tonos casi iguales
  const maps = grassMaps([hex(tone.clone().offsetHSL(0, 0, 0.02)), hex(tone.clone().offsetHSL(0, 0, -0.01))]);
  // briznas más gruesas que en el green
  maps.map.repeat.set(0.35, 0.35);
  const mat = new THREE.MeshStandardMaterial({
    ...maps,
    normalScale: new THREE.Vector2(1, 1),
    roughness: 1,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    // el terreno queda solo un centímetro por debajo
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(collarGeometry(course.outline, COLLAR_RINGS), mat);
  mesh.receiveShadow = true;
  return mesh;
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

function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
}

const BUNKER_FADE = 0.35; // metros de fundido fuera del rectángulo de la arena

/** Malla subdividida del búnker, con las UV en metros para que la textura no se estire. */
function bunkerGeometry(w, d) {
  const W = w + BUNKER_FADE * 2, D = d + BUNKER_FADE * 2;
  const geo = new THREE.PlaneGeometry(W, D, Math.ceil(W / 0.06), Math.ceil(D / 0.06));
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), pos.getY(i));
  return geo;
}

/**
 * Material del búnker. Con la distancia al borde (rectángulo redondeado,
 * deformado con ruido para que no sea un contorno perfecto):
 * - el vértice sube formando un lomo suave, y la normal sigue esa forma;
 * - la arena se vuelve transparente hacia fuera y se rompe en granos sueltos
 *   que se quedan entre el césped, sin ninguna línea de borde.
 */
function bunkerMaterial(maps, w, d, seed, theme) {
  // con las luces de color de los temas oscuros la arena perdería su tono:
  // un poco de luz propia la mantiene dorada sin que llegue a brillar
  const glow = theme.sunIntensity < 2 || theme.neon ? 0.32 : 0.12;
  const mat = new THREE.MeshStandardMaterial({
    ...maps,
    emissiveMap: maps.map,
    emissive: 0xffffff,
    emissiveIntensity: glow,
    roughness: 1,
    normalScale: new THREE.Vector2(0.9, 0.9),
    transparent: true,
    depthWrite: false,
  });
  const common = /* glsl */ `
    uniform vec4 uBunker; // semiancho, semifondo, radio de esquina, semilla
    float bHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float bNoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(bHash(i), bHash(i + vec2(1, 0)), f.x), mix(bHash(i + vec2(0, 1)), bHash(i + vec2(1, 1)), f.x), f.y);
    }
    // distancia hacia dentro del borde (positiva dentro), con el contorno ondulado
    float bInside(vec2 p) {
      vec2 q = abs(p) - uBunker.xy + uBunker.z;
      float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uBunker.z;
      vec2 o = p + uBunker.w * 17.0;
      return -sd + (bNoise(o * 2.2) - 0.5) * 0.22 + (bNoise(o * 6.0) - 0.5) * 0.06;
    }
    // altura del lomo: sube rápido desde el borde y se queda casi llano dentro
    float bHeight(vec2 p) {
      float e = bInside(p);
      return 0.035 * smoothstep(-0.12, 0.45, e) + 0.008 * (bNoise(p * 3.0 + uBunker.w) - 0.5) * smoothstep(0.0, 0.4, e);
    }
  `;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBunker = { value: new THREE.Vector4(w / 2, d / 2, Math.min(w, d) * 0.3, seed + 1) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vBunker;\n${common}`)
      .replace(
        '#include <beginnormal_vertex>',
        `vec2 bp = position.xy;
        float bh = bHeight(bp);
        float bx = bHeight(bp + vec2(0.03, 0.0)) - bh, by = bHeight(bp + vec2(0.0, 0.03)) - bh;
        vec3 objectNormal = normalize(vec3(-bx / 0.03, -by / 0.03, 1.0));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(tangent.xyz);
        #endif`,
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += bh;\nvBunker = position.xy;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vBunker;\n${common}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float e = bInside(vBunker);
        // núcleo opaco, fundido suave y granos sueltos que se esparcen por el césped
        float body = smoothstep(-0.1, 0.16, e);
        float grains = step(0.82 - 0.5 * smoothstep(-0.35, 0.05, e), bHash(floor(vBunker * 140.0)));
        float scatter = grains * smoothstep(-0.34, -0.05, e) * 0.85;
        diffuseColor.a *= max(body, scatter);
        // donde la capa es fina se ve más oscura (sombra entre la hierba)
        diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(-0.05, 0.3, e));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance *= mix(0.5, 1.0, smoothstep(-0.05, 0.3, e));`,
      );
  };
  mat.customProgramCacheKey = () => 'bunker2';
  return mat;
}

const emberMat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff5a14, emissiveIntensity: 1.6 });
let contactMat = null;
const getContactMat = () => (contactMat ??= new THREE.MeshBasicMaterial({ map: softDotTexture(), color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
const dotMats = {};
const dotMat = (night) => (dotMats[night] ??= new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: night ? 0.35 : 0.15 }));

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
