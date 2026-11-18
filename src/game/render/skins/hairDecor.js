import * as THREE from 'three';

// Pelos de verdad para las skins con `decor.hair`: tubos gruesos, oscuros, afilados y rizados de forma irregular que salen
// de un bultito de folículo y SOBRESALEN de la silueta. Todo en una sola malla (un draw call) sobre la esfera unitaria;
// el grupo se escala al radio de la bola y se cuelga de su malla, así que ruedan y se aplastan con ella.
// Reparto: una parte junto al rafe (la misma curva que he_rapheX en patterns/huevo_mio.js), otra en grupitos de 2-3 y el
// resto sueltos por toda la bola. Color por vértice: raíz color carne (el bultito), pelo casi negro y punta algo parda.
// Determinista por `seed` (la semilla de la instancia): el mismo dueño ve siempre los mismos pelos.

const SIDES = 4; // caras de cada tubo
const SEGS = 10; // tramos por pelo: el 0 es el bultito del folículo, del 1 al 10 el pelo

/** Rafe de El Huevo Mío: x = seamX(y) por delante (z > 0). Igual que he_rapheX en el shader. */
const seamX = (y) => 0.045 * Math.sin(2.7 * y + 0.6) + 0.02 * Math.sin(6.1 * y + 1.9);

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

const lerp = ([a, b], t) => a + (b - a) * t;

/**
 * Rellena `geometry` con `count` pelos (position, normal, color e índices). Devuelve la geometría (misma instancia).
 * Forma: `length` (normal) y `longLength` para la fracción `longShare` de pelos largos, `thickness` en la raíz,
 * `lean` (radianes respecto a la normal), `turns` y `curl` (vueltas y radio del rizo, relativo al largo),
 * `seam` / `seamWidth` (fracción y dispersión de pelos junto al rafe), `clump` (fracción que sale en grupito con el anterior).
 */
export function fillHairGeometry(geometry, {
  count,
  seed = 0,
  length = [0.13, 0.3],
  longLength = [0.3, 0.42],
  longShare = 0.14,
  thickness = 0.013,
  lean = [0.45, 1.2],
  turns = [0.7, 1.5],
  curl = [0.1, 0.17],
  seam = 0.26,
  seamWidth = 0.1,
  clump = 0.28,
  color = '#0c0807',
  rootColor = '#a8695c',
  tipColor = '#3a2418',
} = {}) {
  const n = Math.max(0, Math.floor(count) || 0);
  const rnd = rng(seed);
  const ringVerts = (SEGS + 1) * SIDES;
  const pos = new Float32Array(n * ringVerts * 3);
  const nor = new Float32Array(n * ringVerts * 3);
  const col = new Float32Array(n * ringVerts * 3);
  const idx = n * ringVerts > 65535 ? new Uint32Array(n * SEGS * SIDES * 6) : new Uint16Array(n * SEGS * SIDES * 6);
  const cHair = new THREE.Color(color), cRoot = new THREE.Color(rootColor), cTip = new THREE.Color(tipColor), cK = new THREE.Color();
  const nrm = new THREE.Vector3(), prev = new THREE.Vector3(0, 0, 1), t1 = new THREE.Vector3(), dir0 = new THREE.Vector3();
  const u = new THREE.Vector3(), v = new THREE.Vector3(), bend = new THREE.Vector3(), tmp = new THREE.Vector3(), nn = new THREE.Vector3();
  const T = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3(), ref = new THREE.Vector3();
  const pts = Array.from({ length: SEGS + 1 }, () => new THREE.Vector3());
  const maxRoot = 0.04; // radio máximo del bultito: su anillo queda pegado a la piel (|p| ≈ 0,998)

  for (let i = 0; i < n; i++) {
    // raíz: junto al rafe, en grupito con la anterior o suelta (uniforme en la esfera)
    const kind = rnd();
    if (kind < seam) {
      const th = (rnd() * 2 - 1) * (Math.PI / 2 + 0.25); // arco delantero de polo a polo (y algo más allá)
      const y = Math.sin(th), g = (rnd() + rnd() + rnd() - 1.5) * 2 * seamWidth; // ~gaussiana de desviación seamWidth
      nrm.set(seamX(y) + g, y, Math.cos(th));
    } else if (kind < seam + clump && i > 0) {
      const d = 0.02 + rnd() * 0.035;
      nrm.set(prev.x + (rnd() - 0.5) * 2 * d, prev.y + (rnd() - 0.5) * 2 * d, prev.z + (rnd() - 0.5) * 2 * d);
    } else {
      const y = 1 - 2 * rnd(), th = rnd() * Math.PI * 2, r = Math.sqrt(Math.max(0, 1 - y * y));
      nrm.set(r * Math.cos(th), y, r * Math.sin(th));
    }
    if (nrm.lengthSq() < 1e-8) nrm.set(0, 0, 1);
    nrm.normalize();
    prev.copy(nrm);
    ref.set(Math.abs(nrm.y) > 0.9 ? 1 : 0, Math.abs(nrm.y) > 0.9 ? 0 : 1, 0);
    t1.crossVectors(nrm, ref).normalize();
    const t2 = tmp.crossVectors(nrm, t1); // provisional: solo para orientar dir0
    // dirección: inclinada respecto a la normal (sale hacia fuera, bastante tumbada)
    const ang = lerp(lean, rnd()), phi = rnd() * Math.PI * 2;
    dir0.copy(nrm).multiplyScalar(Math.cos(ang)).addScaledVector(t1, Math.sin(ang) * Math.cos(phi)).addScaledVector(t2, Math.sin(ang) * Math.sin(phi)).normalize();
    const len = rnd() < longShare ? lerp(longLength, rnd()) : lerp(length, rnd());
    const thick = thickness * (0.8 + 0.4 * rnd());
    // base del rizo (perpendicular al pelo), curvatura y caída hacia la piel
    u.crossVectors(dir0, nrm);
    if (u.lengthSq() < 1e-4) u.copy(t1);
    u.normalize();
    v.crossVectors(dir0, u);
    const tn = lerp(turns, rnd()), amp = lerp(curl, rnd()) * len;
    let a = rnd() * Math.PI * 2;
    bend.copy(u).multiplyScalar((rnd() - 0.5) * 0.6 * len);
    const droop = 0.15 * len;
    // bultito: anillo 0 bajo la piel, anillo 1 justo por encima; el pelo arranca en el 1
    pts[0].copy(nrm).multiplyScalar(0.997);
    pts[1].copy(nrm).multiplyScalar(1 + 0.8 * thick).addScaledVector(dir0, 0.6 * thick);
    const step = (tn * Math.PI * 2) / (SEGS - 1);
    for (let k = 2; k <= SEGS; k++) {
      const s = (k - 1) / (SEGS - 1), ramp = Math.min(1, s / 0.2);
      a += step * (0.6 + 0.8 * rnd()); // rizo irregular (vueltas desiguales)
      const r = amp * ramp * (0.8 + 0.4 * rnd());
      pts[k].copy(pts[1])
        .addScaledVector(dir0, s * len)
        .addScaledVector(bend, s * s)
        .addScaledVector(nrm, -droop * s * s)
        .addScaledVector(u, Math.cos(a) * r)
        .addScaledVector(v, Math.sin(a) * r);
    }
    const base = i * ringVerts;
    for (let k = 0; k <= SEGS; k++) {
      const p = pts[k];
      // tangente del pelo (el anillo 0 usa la del 1)
      const kk = Math.max(k, 1), q = pts[Math.min(kk + 1, SEGS)], o = pts[Math.max(kk - 1, 1)];
      T.copy(kk === SEGS ? pts[kk] : q).sub(kk === SEGS ? o : pts[kk]);
      if (T.lengthSq() < 1e-12) T.copy(dir0);
      T.normalize();
      U.crossVectors(T, nrm);
      if (U.lengthSq() < 1e-4) U.crossVectors(T, t1);
      U.normalize();
      if (k === 0) V.crossVectors(nrm, U); // anillo 0 en el plano tangente: queda pegado a la piel
      else V.crossVectors(T, U);
      const s = Math.max(0, (k - 1) / (SEGS - 1));
      const rad = k === 0 ? Math.min(maxRoot, 2.0 * thick) : k === 1 ? 1.15 * thick : k === SEGS ? thick * 0.08 : thick * (1 - 0.7 * s);
      // color: raíz carne, transición, pelo y punta algo parda
      if (k === 0) cK.copy(cRoot);
      else if (k === 1) cK.copy(cRoot).lerp(cHair, 0.6);
      else cK.copy(cHair).lerp(cTip, Math.max(0, (s - 0.6) / 0.4) * 0.6);
      for (let j = 0; j < SIDES; j++) {
        const aa = (j / SIDES) * Math.PI * 2;
        tmp.copy(U).multiplyScalar(Math.cos(aa)).addScaledVector(V, Math.sin(aa));
        nn.copy(tmp);
        if (k === 0) nn.multiplyScalar(0.6).addScaledVector(nrm, 0.8).normalize();
        else if (k === 1) nn.addScaledVector(nrm, 0.35).normalize();
        const o3 = (base + k * SIDES + j) * 3;
        pos[o3] = p.x + tmp.x * rad;
        pos[o3 + 1] = p.y + tmp.y * rad;
        pos[o3 + 2] = p.z + tmp.z * rad;
        nor[o3] = nn.x;
        nor[o3 + 1] = nn.y;
        nor[o3 + 2] = nn.z;
        col[o3] = cK.r;
        col[o3 + 1] = cK.g;
        col[o3 + 2] = cK.b;
      }
    }
    let w = i * SEGS * SIDES * 6;
    for (let k = 0; k < SEGS; k++)
      for (let j = 0; j < SIDES; j++) {
        const a0 = base + k * SIDES + j, b = base + k * SIDES + ((j + 1) % SIDES), c = a0 + SIDES, d = b + SIDES;
        idx[w++] = a0; idx[w++] = c; idx[w++] = b;
        idx[w++] = b; idx[w++] = c; idx[w++] = d;
      }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Crea los pelos de una skin: `{ group, geometry, material, setSeed(seed), setOpacity(v), dispose() }`.
 * `color` es el del pelo (va por vértice, junto con la raíz y la punta); el resto de opciones son las de fillHairGeometry.
 * Para colgarlos de una bola usa `attachSkinDecor` (ballSkins.js), que clona el grupo compartiendo geometría y material.
 */
export function createHairDecor({ count, seed = 0, color = '#0c0807', ...shape } = {}) {
  const geometry = new THREE.BufferGeometry();
  const opts = { count, color, ...shape };
  fillHairGeometry(geometry, { ...opts, seed });
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.38, metalness: 0, side: THREE.DoubleSide });
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
