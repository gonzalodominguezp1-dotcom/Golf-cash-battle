import * as THREE from 'three';

// Pelos de verdad para las skins con `decor.hair`: tubos finos, afilados y ligeramente rizados que salen de la
// superficie y SOBRESALEN de la silueta. Todo en una sola malla (un draw call) sobre la esfera unitaria; el grupo se
// escala al radio de la bola y se cuelga de su malla, así que ruedan y se aplastan con ella.
// Determinista por `seed` (la semilla de la instancia): el mismo dueño ve siempre los mismos pelos.

const SIDES = 4; // caras de cada tubo
const SEGS = 6; // tramos por pelo

function rng(seed) {
  let a = (Math.imul((seed | 0) + 1, 2654435761) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rellena `geometry` con `count` pelos. Devuelve la geometría (misma instancia). */
export function fillHairGeometry(geometry, { count, seed = 0, length = [0.14, 0.3], thickness = 0.015, lean = [0.3, 1.1], turns = [1.3, 2.3], curl = [0.1, 0.18] } = {}) {
  const n = Math.max(0, Math.floor(count));
  const rnd = rng(seed);
  const ringVerts = (SEGS + 1) * SIDES;
  const pos = new Float32Array(n * ringVerts * 3);
  const nor = new Float32Array(n * ringVerts * 3);
  const idx = new Uint16Array(n * SEGS * SIDES * 6);
  const nrm = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), dir0 = new THREE.Vector3();
  const u = new THREE.Vector3(), v = new THREE.Vector3(), bend = new THREE.Vector3(), tmp = new THREE.Vector3();
  const T = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3(), ref = new THREE.Vector3();
  const pts = Array.from({ length: SEGS + 1 }, () => new THREE.Vector3());

  for (let i = 0; i < n; i++) {
    // raíz: punto uniforme en la esfera (al azar, no en rejilla: salen grupos y huecos como en pelo de verdad)
    const y = 1 - 2 * rnd(), th = rnd() * Math.PI * 2, r = Math.sqrt(Math.max(0, 1 - y * y));
    nrm.set(r * Math.cos(th), y, r * Math.sin(th));
    ref.set(Math.abs(nrm.y) > 0.9 ? 1 : 0, Math.abs(nrm.y) > 0.9 ? 0 : 1, 0);
    t1.crossVectors(nrm, ref).normalize();
    t2.crossVectors(nrm, t1);
    // dirección: inclinada respecto a la normal (sale hacia fuera, algo tumbada)
    const ang = lean[0] + rnd() * (lean[1] - lean[0]), phi = rnd() * Math.PI * 2;
    dir0.copy(nrm).multiplyScalar(Math.cos(ang)).addScaledVector(t1, Math.sin(ang) * Math.cos(phi)).addScaledVector(t2, Math.sin(ang) * Math.sin(phi)).normalize();
    const len = length[0] + rnd() * (length[1] - length[0]);
    // base del rizo y curvatura leve
    u.crossVectors(dir0, nrm);
    if (u.lengthSq() < 1e-4) u.copy(t1);
    u.normalize();
    v.crossVectors(dir0, u);
    const ph = rnd() * Math.PI * 2, tn = turns[0] + rnd() * (turns[1] - turns[0]), amp = (curl[0] + rnd() * (curl[1] - curl[0])) * len;
    bend.copy(u).multiplyScalar((rnd() - 0.5) * 0.5 * len);
    for (let k = 0; k <= SEGS; k++) {
      const s = k / SEGS, ramp = Math.min(1, s / 0.25), a = ph + s * tn * Math.PI * 2;
      pts[k].copy(nrm).multiplyScalar(0.985) // algo enterrada para que no se vea el corte
        .addScaledVector(dir0, s * len)
        .addScaledVector(bend, s * s)
        .addScaledVector(u, Math.cos(a) * amp * ramp)
        .addScaledVector(v, Math.sin(a) * amp * ramp);
    }
    const base = i * ringVerts;
    for (let k = 0; k <= SEGS; k++) {
      const p = pts[k], q = pts[Math.min(k + 1, SEGS)], o = pts[Math.max(k - 1, 0)];
      T.copy(k === SEGS ? p : q).sub(k === SEGS ? o : p);
      if (T.lengthSq() < 1e-12) T.copy(dir0);
      T.normalize();
      U.crossVectors(T, nrm);
      if (U.lengthSq() < 1e-4) U.crossVectors(T, t1);
      U.normalize();
      V.crossVectors(T, U);
      const s = k / SEGS, rad = k === SEGS ? thickness * 0.05 : thickness * (1 - 0.75 * s);
      for (let j = 0; j < SIDES; j++) {
        const aa = (j / SIDES) * Math.PI * 2;
        tmp.copy(U).multiplyScalar(Math.cos(aa)).addScaledVector(V, Math.sin(aa));
        const o3 = (base + k * SIDES + j) * 3;
        pos[o3] = p.x + tmp.x * rad;
        pos[o3 + 1] = p.y + tmp.y * rad;
        pos[o3 + 2] = p.z + tmp.z * rad;
        nor[o3] = tmp.x;
        nor[o3 + 1] = tmp.y;
        nor[o3 + 2] = tmp.z;
      }
    }
    let w = i * SEGS * SIDES * 6;
    for (let k = 0; k < SEGS; k++)
      for (let j = 0; j < SIDES; j++) {
        const a = base + k * SIDES + j, b = base + k * SIDES + ((j + 1) % SIDES), c = a + SIDES, d = b + SIDES;
        idx[w++] = a; idx[w++] = c; idx[w++] = b;
        idx[w++] = b; idx[w++] = c; idx[w++] = d;
      }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Crea los pelos de una skin: `{ group, geometry, material, setSeed(seed), setOpacity(v), dispose() }`.
 * Para colgarlos de una bola usa `attachSkinDecor` (ballSkins.js), que clona el grupo compartiendo geometría y material.
 */
export function createHairDecor({ count, seed = 0, color = '#0c0807', ...shape } = {}) {
  const geometry = new THREE.BufferGeometry();
  const opts = { count, ...shape };
  fillHairGeometry(geometry, { ...opts, seed });
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'skin-hair';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const group = new THREE.Group();
  group.name = 'skin-decor';
  group.add(mesh);
  let disposed = false;
  return {
    group,
    geometry,
    material,
    setSeed(s) {
      if (!disposed) fillHairGeometry(geometry, { ...opts, seed: s });
    },
    /** 0 (invisible) .. 1: lo usa la disolución de «reveal» para que los pelos no queden flotando. */
    setOpacity(v) {
      material.transparent = v < 0.999;
      material.opacity = Math.max(0, Math.min(1, v));
      mesh.visible = v > 0.01;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geometry.dispose();
      material.dispose();
    },
  };
}
