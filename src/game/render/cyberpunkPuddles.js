import * as THREE from 'three';
import { CUP_R, WALL_HALF } from '../physics.js';

// Charcos estáticos del suelo del hoyo 15 (tema cyber2078). Solo visual: este módulo no lo importa
// ni lo lee la simulación, y no añade física. Una sola malla para todo el hoyo: cada charco es un
// contorno irregular, un anillo interior opaco y un centro, con el borde difuminado por el alfa del
// vértice. El material es fijo (sin animación, sin reflejo de espejo ni pasada de render extra).

export const PUDDLE_LIFT = 0.008; // altura sobre el suelo (m); tope 0,01
const MARGIN = 0.3; // hueco libre a paredes, boca del looping, aceleradores, piezas, aro y salida (m)
const SIDES = 12; // vértices del contorno de cada charco
const RIM_SCALE = 0.7; // el anillo interior (casi opaco) es esta fracción del contorno; el resto se difumina
const SEED = 7331; // semilla fija: los charcos son iguales en cada carga y el nivel medio es subconjunto del alto

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function distToSegment(px, pz, a, b) {
  const vx = b[0] - a[0], vz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (pz - a[1]) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(a[0] + vx * t - px, a[1] + vz * t - pz);
}

// Zonas que un charco no puede tocar (con MARGIN). Se deducen de los datos del hoyo: segmentos de
// pared (incluidas las del molino), círculos (setas, portales, salida, aro del hoyo, aspas del molino)
// y rectángulos (aceleradores, arena, lava, recorrido de los pistones, cuerpo del looping).
function blockersOf(course) {
  const B = { circles: [], segs: [], rects: [], box: null };
  const rect = (x, z, hx, hz) => ({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz });
  for (const w of course.walls ?? []) B.segs.push({ a: w[0], b: w[1], r: WALL_HALF });
  for (const b of course.bumpers ?? []) B.circles.push({ x: b.x, z: b.z, r: b.r });
  for (const p of course.portals ?? []) {
    B.circles.push({ x: p.a[0], z: p.a[1], r: p.r * 1.3 }, { x: p.b[0], z: p.b[1], r: p.r * 1.3 });
  }
  for (const s of course.sand ?? []) B.rects.push(rect(s.x, s.z, s.w / 2, s.d / 2));
  for (const l of course.lava ?? []) {
    const xs = l.poly.map((p) => p[0]), zs = l.poly.map((p) => p[1]);
    B.rects.push({ x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) });
  }
  for (const b of course.boosts ?? []) {
    const along = b.dir[0] !== 0; // el lado largo va en la dirección del impulso
    B.rects.push(rect(b.x, b.z, along ? b.d / 2 : b.w / 2, along ? b.w / 2 : b.d / 2));
  }
  for (const m of course.movers ?? []) {
    const ax = m.axis === 'x';
    B.rects.push({
      x0: m.x - (ax ? m.range : 0) - m.w / 2, x1: m.x + (ax ? m.range : 0) + m.w / 2,
      z0: m.z - (ax ? 0 : m.range) - m.d / 2, z1: m.z + (ax ? 0 : m.range) + m.d / 2,
    });
  }
  for (const l of course.loops ?? []) {
    const along = l.dir[0] !== 0;
    B.rects.push(rect(l.x, l.z, along ? l.len / 2 : l.w / 2, along ? l.w / 2 : l.len / 2));
  }
  for (const wm of course.windmills ?? []) {
    B.circles.push({ x: (wm.left + wm.right) / 2, z: wm.z, r: (wm.right - wm.left) / 2 });
  }
  if (course.tee) B.circles.push({ x: course.tee[0], z: course.tee[1], r: 0.4 });
  if (course.cup && !course.noCup) B.circles.push({ x: course.cup[0], z: course.cup[1], r: CUP_R + 0.035 });
  const xs = course.outline.map((p) => p[0]), zs = course.outline.map((p) => p[1]);
  B.box = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  return B;
}

function clear(B, x, z) {
  return x >= B.box.x0 + MARGIN && x <= B.box.x1 - MARGIN && z >= B.box.z0 + MARGIN && z <= B.box.z1 - MARGIN
    && B.circles.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + MARGIN)
    && B.segs.every((s) => distToSegment(x, z, s.a, s.b) >= s.r + MARGIN)
    && B.rects.every((r) => x < r.x0 - MARGIN || x > r.x1 + MARGIN || z < r.z0 - MARGIN || z > r.z1 + MARGIN);
}

/**
 * Contornos de los charcos del hoyo, sin three.js (para pruebas). Devuelve hasta `count` charcos
 * { cx, cz, R, ring }: ring es el contorno exterior (borde difuminado) en [x, z].
 * Ningún punto del contorno ni del interior queda a menos de MARGIN de una pieza o de la línea del campo.
 */
export function puddlePolygons(course, count) {
  const B = blockersOf(course);
  const rng = seeded(SEED);
  const out = [];
  const x0 = B.box.x0, z0 = B.box.z0, dx = B.box.x1 - x0, dz = B.box.z1 - z0;
  for (let tries = 0; out.length < count && tries < 5000; tries++) {
    const cx = x0 + rng() * dx, cz = z0 + rng() * dz;
    const R = 0.35 + rng() * 0.2;
    const ring = [];
    for (let k = 0; k < SIDES; k++) {
      const ang = (k / SIDES) * Math.PI * 2;
      const rad = R * (0.78 + 0.22 * rng());
      ring.push([cx + Math.cos(ang) * rad, cz + Math.sin(ang) * rad]);
    }
    const inner = ring.map(([x, z]) => [cx + (x - cx) * RIM_SCALE, cz + (z - cz) * RIM_SCALE]);
    if (![...ring, ...inner, [cx, cz]].every(([x, z]) => clear(B, x, z))) continue;
    if (out.some((p) => Math.hypot(p.cx - cx, p.cz - cz) < p.R + R + 0.15)) continue;
    out.push({ cx, cz, R, ring });
  }
  return out;
}

/**
 * Añade a la escena una sola malla con los charcos del hoyo. `lift(x, z)` da la altura del suelo
 * (igual que buildCourse). `count` sale de quality().puddles; 0 = no añade nada. Devuelve la malla o null.
 */
export function createPuddles(scene, course, lift, count) {
  const n = Math.max(0, Math.floor(count ?? 0));
  if (!n) return null;
  const polys = puddlePolygons(course, n);
  if (!polys.length) return null;
  const per = 2 * SIDES + 1; // contorno exterior, anillo interior y centro
  const pos = new Float32Array(polys.length * per * 3);
  const nor = new Float32Array(polys.length * per * 3);
  const col = new Float32Array(polys.length * per * 4); // color blanco; el alfa del vértice da el borde suave
  const idx = [];
  polys.forEach((p, pi) => {
    const base = pi * per;
    const put = (k, x, z, a) => {
      pos.set([x, (lift ? lift(x, z) : 0) + PUDDLE_LIFT, z], k * 3);
      nor.set([0, 1, 0], k * 3);
      col.set([1, 1, 1, a], k * 4);
    };
    p.ring.forEach(([x, z], k) => put(base + k, x, z, 0));
    p.ring.forEach(([x, z], k) => put(base + SIDES + k, p.cx + (x - p.cx) * RIM_SCALE, p.cz + (z - p.cz) * RIM_SCALE, 0.85));
    put(base + 2 * SIDES, p.cx, p.cz, 0.85);
    for (let k = 0; k < SIDES; k++) {
      const k2 = (k + 1) % SIDES;
      const o = base + k, o2 = base + k2, i = base + SIDES + k, i2 = base + SIDES + k2;
      idx.push(o, o2, i2, o, i2, i);
      idx.push(i, i2, base + 2 * SIDES);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0b1626, // agua oscura: más oscura que el césped
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    roughness: 0.1, // reflejo especular leve y fijo
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  scene.add(mesh);
  return mesh;
}
