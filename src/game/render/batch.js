import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Junta en una sola malla por material todo lo que cuelga de `root` y no se
 * mueve (árboles, rocas, flores, postes...). Cada malla suelta es una llamada
 * de dibujo más; juntas, el móvil dibuja el decorado de una vez.
 * Devuelve las mallas nuevas (ya añadidas a `parent`).
 */
export function bakeStatic(root, parent) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.keep) return;
    const mat = o.material;
    if (Array.isArray(mat)) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    // todas las piezas deben tener los mismos atributos para poder juntarlas
    // (el color por vértice se queda si el material lo usa: todas las piezas del mismo material lo llevan)
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && !(name === 'color' && mat.vertexColors)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    // cuánto se mece cada vértice con el viento: su altura sobre la base del árbol
    const sway = new Float32Array(g.attributes.position.count);
    let tree = o;
    while (tree && !tree.userData.swayRoot) tree = tree.parent;
    if (tree) {
      const rel = new THREE.Matrix4().copy(tree.matrixWorld).invert().multiply(o.matrixWorld);
      const v = new THREE.Vector3();
      for (let i = 0; i < sway.length; i++) sway[i] = Math.max(0, v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(rel).y);
    }
    g.setAttribute('sway', new THREE.BufferAttribute(sway, 1));
    g.applyMatrix4(o.matrixWorld);
    const key = mat.uuid + (o.castShadow ? 's' : '') + (o.receiveShadow ? 'r' : '');
    if (!buckets.has(key)) buckets.set(key, { mat, cast: o.castShadow, receive: o.receiveShadow, geos: [] });
    buckets.get(key).geos.push(g);
  });
  const out = [];
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    parent.add(m);
    out.push(m);
  }
  // lo que no se ha juntado (marcado keep: luces, halos, piezas animadas) se queda
  const kept = [];
  root.traverse((o) => {
    if (o !== root && (o.userData.keep || o.isLight || o.isSprite || o.isPoints || o.isLine)) kept.push(o);
  });
  for (const o of kept) {
    if (kept.includes(o.parent)) continue;
    o.updateMatrixWorld(true);
    o.matrixWorld.decompose(o.position, o.quaternion, o.scale);
    parent.add(o);
  }
  return out;
}

/**
 * Viento en el sombreador: las copas se mecen según la altura sobre el suelo,
 * sin mover mallas desde el procesador.
 */
export function addWind(material, uniforms, amount = 0.05) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float sway;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed.x += sin(uTime * 1.1 + position.x * 0.35 + position.z * 0.2) * ${amount.toFixed(3)} * sway;
        transformed.z += cos(uTime * 0.9 + position.z * 0.3) * ${(amount * 0.6).toFixed(3)} * sway;`,
      );
  };
  material.customProgramCacheKey = () => 'wind' + amount;
  return material;
}
