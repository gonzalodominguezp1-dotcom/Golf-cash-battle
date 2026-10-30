import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Decorado "suave" para los temas con lushEnv: copas redondas y abultadas con
// sombreado liso, rocas pulidas con musgo, matas de hierba de hojas curvas y
// montañas lejanas con relieve y bruma. Sustituye al low-poly facetado de
// environment.js solo en los temas que lo piden.
//
// Las piezas llevan color por vértice (más oscuro abajo, más claro arriba):
// así se ven con volumen sin texturas y siguen juntándose en pocas mallas
// (bakeStatic conserva el color cuando el material usa vertexColors).

/**
 * Abolladura suave y continua (suma de ondas): nada de picos sueltos por vértice.
 * Las esferas de three no comparten vértices entre caras: se unen antes de
 * recalcular las normales, o cada cara sale plana (facetas).
 */
function smoothBlob(geo, rng, amount, freq = 2.2) {
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const waves = Array.from({ length: 5 }, () => {
    const d = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    return { d, f: freq * (0.7 + rng() * 0.8), ph: rng() * 6.28 };
  });
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let k = 0;
    for (const w of waves) k += Math.sin(v.dot(w.d) * w.f + w.ph);
    v.multiplyScalar(1 + (k / waves.length) * amount);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Color por vértice según la altura: de `bottom` a `top` entre y0 e y1. */
function shadeByHeight(geo, bottom, top, y0, y1) {
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  const a = new THREE.Color(bottom), b = new THREE.Color(top), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(a).lerp(b, THREE.MathUtils.smoothstep(p.getY(i), y0, y1));
    c.toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

const shaded = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 0.85, ...extra });
const barkMat = shaded(0x8a5a33, { roughness: 0.95 });
const rockMat = shaded(0xffffff, { roughness: 0.9 });

/** Copa: varias esferas lisas fundidas, con sombra por debajo y luz por arriba. */
function canopy(rng, r, y) {
  const parts = [];
  const n = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.6;
    const rr = r * (0.55 + rng() * 0.25);
    const g = smoothBlob(new THREE.IcosahedronGeometry(rr, 3), rng, 0.08, 3);
    g.translate(Math.cos(a) * r * 0.55, y + (rng() - 0.3) * r * 0.45, Math.sin(a) * r * 0.55);
    parts.push(g);
  }
  const top = smoothBlob(new THREE.IcosahedronGeometry(r * 0.8, 3), rng, 0.08, 3);
  top.translate(0, y + r * 0.5, 0);
  parts.push(top);
  return shadeByHeight(mergeGeometries(parts), 0x6b6b6b, 0xffffff, y - r * 0.6, y + r * 1.1);
}

/** Tronco cónico con raíces que se abren al suelo. */
function trunk(h, r) {
  const g = new THREE.CylinderGeometry(r * 0.6, r, h, 14, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    // la base se ensancha (raíces)
    const flare = 1 + Math.max(0, -y / h - 0.3) * 1.4;
    p.setX(i, p.getX(i) * flare);
    p.setZ(i, p.getZ(i) * flare);
  }
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  return shadeByHeight(g, 0x5a5a5a, 0xffffff, 0, h);
}

/** Árbol de copa redonda o abeto liso, según kind. */
export function makeLushTree(kind, rng, x, y, z, leaves) {
  const g = new THREE.Group();
  const s = 0.8 + rng() * 0.8;
  const leaf = leaves[Math.floor(rng() * leaves.length)];
  if (kind === 'pine') {
    g.add(new THREE.Mesh(trunk(0.9, 0.16), barkMat));
    // pisos de ramas lisos, que caen un poco en el borde
    const tiers = [];
    for (let i = 0; i < 4; i++) {
      const r = 1.05 - i * 0.22, h = 1 - i * 0.05;
      const c = new THREE.CylinderGeometry(r * 0.03, r, h, 28, 3);
      const p = c.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const yy = p.getY(k);
        if (yy < -h / 2 + 0.01) p.setY(k, yy - 0.09);
      }
      c.computeVertexNormals();
      c.translate(0, 1 + i * 0.47, 0);
      tiers.push(c);
    }
    g.add(new THREE.Mesh(shadeByHeight(mergeGeometries(tiers), 0x707070, 0xffffff, 0.5, 2.8), leaf));
  } else {
    g.add(new THREE.Mesh(trunk(1.15, 0.17), barkMat));
    g.add(new THREE.Mesh(canopy(rng, 0.85 + rng() * 0.25, 1.75), leaf));
  }
  g.position.set(x, y - 0.05, z);
  g.scale.setScalar(s);
  g.rotation.y = rng() * Math.PI * 2;
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

/** Arbusto redondo bajo, de las mismas hojas que los árboles. */
export function makeLushBush(rng, x, y, z, leaves) {
  const leaf = leaves[Math.floor(rng() * leaves.length)];
  const parts = [];
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const r = 0.28 + rng() * 0.22;
    const b = smoothBlob(new THREE.IcosahedronGeometry(r, 3), rng, 0.08, 4);
    b.scale(1, 0.8, 1);
    b.translate((rng() - 0.5) * 0.7, r * 0.6, (rng() - 0.5) * 0.7);
    parts.push(b);
  }
  const m = new THREE.Mesh(shadeByHeight(mergeGeometries(parts), 0x6a6a6a, 0xffffff, 0, 0.7), leaf);
  m.position.set(x, y - 0.03, z);
  m.rotation.y = rng() * 6;
  m.castShadow = true;
  return m;
}

/** Roca pulida: gris con musgo verde por arriba. */
export function makeLushRock(rng, x, y, z, moss) {
  const g = smoothBlob(new THREE.IcosahedronGeometry(1, 4), rng, 0.16, 1.6);
  const sx = 0.3 + rng() * 0.6;
  g.scale(sx * (1 + rng() * 0.4), sx * (0.55 + rng() * 0.3), sx);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const stone = new THREE.Color(0x9a9c96), dark = new THREE.Color(0x6e706c), mossC = new THREE.Color(moss), c = new THREE.Color();
  const g2 = g.clone();
  g2.computeBoundingBox();
  const { min, max } = g2.boundingBox;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - min.y) / (max.y - min.y || 1);
    c.copy(dark).lerp(stone, THREE.MathUtils.smoothstep(t, 0, 0.6));
    c.lerp(mossC, THREE.MathUtils.smoothstep(t, 0.7, 1) * 0.7);
    c.toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, rockMat);
  m.position.set(x, y + sx * 0.15, z);
  m.rotation.y = rng() * 6;
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Mata de hierba: hojas finas y curvas que se abren hacia fuera. */
export function makeGrassClump(rng, x, y, z, mat) {
  const blades = [];
  const n = 7 + Math.floor(rng() * 6);
  for (let k = 0; k < n; k++) {
    const h = 0.28 + rng() * 0.3, w = 0.045;
    const b = new THREE.PlaneGeometry(w, h, 1, 4);
    const p = b.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + h / 2) / h; // 0 abajo, 1 arriba
      p.setX(i, p.getX(i) * (1 - t * 0.9)); // punta afilada
      p.setZ(i, t * t * h * 0.45); // se curva hacia fuera
      p.setY(i, t * h);
    }
    b.rotateY(rng() * Math.PI * 2);
    b.translate((rng() - 0.5) * 0.12, 0, (rng() - 0.5) * 0.12);
    blades.push(b);
  }
  const geo = shadeByHeight(mergeGeometries(blades), 0x5c5c5c, 0xffffff, 0, 0.45);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.userData.swayRoot = true;
  m.position.set(x, y - 0.02, z);
  return m;
}

/** Nubes de algodón lisas: varias bolas fundidas, más gordas en el centro. */
export function makeLushCloud(rng, mat) {
  const n = 4 + Math.floor(rng() * 4), parts = [];
  for (let k = 0; k < n; k++) {
    const mid = 1 - Math.abs(k - (n - 1) / 2) / n;
    const r = (2.2 + rng() * 1.6) * (0.7 + mid * 0.6);
    const g = smoothBlob(new THREE.IcosahedronGeometry(r, 4), rng, 0.05, 1.2);
    g.scale(1, 0.7, 0.85);
    g.translate(k * 2.6 - n * 1.3, mid * 1.4, (rng() - 0.5) * 2);
    parts.push(g);
  }
  // la base, más plana y algo más gris, como las nubes de verdad
  return new THREE.Mesh(shadeByHeight(mergeGeometries(parts), 0xc9d3dc, 0xffffff, -1.5, 2.5), mat);
}

/** Montañas lejanas con laderas y valles, que se funden con el cielo hacia arriba. */
export function lushMountains(scene, color, haze, rng) {
  const parts = [];
  const n = 14;
  const base = new THREE.Color(color), sky = new THREE.Color(haze), snow = new THREE.Color(0xf4f7f6), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    // más allá del borde del terreno (110 m): si no, las colinas atraviesan la ladera
    const a = ((i + rng() * 0.6) / n) * Math.PI * 2, r = 132 + rng() * 14;
    const h = 17 + rng() * 14, w = 24 + rng() * 16;
    // cilindro con la punta casi cerrada: el cono de three con varios pisos pierde caras
    const cone = new THREE.CylinderGeometry(w * 0.04, w, h, 72, 14);
    const p = cone.attributes.position, v = new THREE.Vector3();
    const ph = rng() * 10;
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k);
      const t = (v.y + h / 2) / h; // 0 al pie, 1 en la cima
      const ang = Math.atan2(v.z, v.x);
      // crestas y valles por la ladera, y la cima redondeada
      const ridge = 1 + Math.sin(ang * 4 + ph) * 0.12 * (1 - t) + Math.sin(ang * 7 + ph * 2) * 0.04 * (1 - t);
      v.x *= ridge;
      v.z *= ridge;
      v.y = (t - 0.5) * h - (t > 0.85 ? (t - 0.85) * h * 0.4 : 0);
      p.setXYZ(k, v.x, v.y, v.z);
    }
    cone.rotateY(rng() * 3);
    cone.scale(1 + rng() * 0.5, 1, 1);
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    cone.translate(cx, h / 2 - 3, cz);
    const col = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const t = (p.getY(k) + 3) / h;
      // abajo el color de la montaña, arriba se pierde en la bruma; cimas nevadas
      c.copy(base).lerp(sky, THREE.MathUtils.smoothstep(t, 0.15, 0.95) * 0.6);
      if (t > 0.8) c.lerp(snow, THREE.MathUtils.smoothstep(t, 0.8, 0.92) * 0.6);
      // un lado algo más oscuro que el otro: volumen sin facetas
      c.multiplyScalar(0.86 + 0.14 * Math.sin(Math.atan2(p.getZ(k) - cz, p.getX(k) - cx) - 0.6));
      c.toArray(col, k * 3);
    }
    cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(cone);
  }
  scene.add(new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
}

/** Textura de césped para el terreno: manchas suaves que rompen el color liso. */
export function meadowGroundTexture() {
  const n = 256, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, n, n);
  // briznas finas en tonos un poco más claros y más oscuros
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * n, y = Math.random() * n, l = 2 + Math.random() * 5;
    const v = 200 + Math.floor(Math.random() * 55);
    g.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 2, y - l);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(70, 70);
  t.anisotropy = 4;
  return t;
}
