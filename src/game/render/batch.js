import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isWindMaterial, WIND_ATTRS, WIND_ATTR_SIZES, windRootOf, writeWindAttributes } from './assets/wind.js';

/**
 * Junta en una sola malla por material todo lo que cuelga de `root` y no se
 * mueve (árboles, rocas, flores, postes...). Cada malla suelta es una llamada
 * de dibujo más; juntas, el móvil dibuja el decorado de una vez.
 * Con `center`, los grupos grandes (más de `split` triángulos) se parten en
 * cuatro cuadrantes alrededor del hoyo: la cámara solo dibuja los que ve y la
 * sombra solo los que caen en su caja.
 * Devuelve las mallas nuevas (ya añadidas a `parent`).
 */
export function bakeStatic(root, parent, { center = null, split = 20000 } = {}) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.keep) return;
    const mat = o.material;
    if (Array.isArray(mat)) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    // todas las piezas deben tener los mismos atributos para poder juntarlas
    // (el color por vértice se queda si el material lo usa: todas las piezas del mismo material lo llevan;
    // los de viento, si el material lleva viento: los que traiga la pieza se respetan y los que falten se calculan)
    const wind = isWindMaterial(mat);
    for (const name of Object.keys(g.attributes)) {
      if (name === 'position' || name === 'normal' || (name === 'color' && mat.vertexColors)) continue;
      if (wind && WIND_ATTRS.includes(name) && g.attributes[name].itemSize === WIND_ATTR_SIZES[name]) continue;
      g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    // cuánto se mece cada vértice (altura sobre la base del árbol) y con qué fase: ver wind.js
    const tree = windRootOf(o);
    if (wind) writeWindAttributes(g, o, tree);
    g.applyMatrix4(o.matrixWorld);
    const key = mat.uuid + (o.castShadow ? 's' : '') + (o.receiveShadow ? 'r' : '');
    if (!buckets.has(key)) buckets.set(key, { mat, cast: o.castShadow, receive: o.receiveShadow, geos: [], at: [], tris: 0 });
    const b = buckets.get(key);
    b.geos.push(g);
    // sitio de la pieza (de su árbol entero si es parte de uno), para partir por cuadrantes
    const e = tree.matrixWorld.elements;
    b.at.push([e[12], e[14]]);
    b.tris += g.attributes.position.count / 3;
  });
  const out = [];
  for (const b of buckets.values()) {
    const groups = [b.geos];
    if (center && b.tris > split) {
      const quad = [[], [], [], []];
      b.geos.forEach((g, i) => quad[(b.at[i][0] > center.x ? 1 : 0) + (b.at[i][1] > center.z ? 2 : 0)].push(g));
      groups.splice(0, 1, ...quad.filter((q) => q.length));
    }
    for (const geos of groups) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, b.mat);
      m.castShadow = b.cast;
      m.receiveShadow = b.receive;
      parent.add(m);
      out.push(m);
    }
    b.geos.forEach((g) => g.dispose());
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
 * Viento antiguo (un solo seno según la altura). Se mantiene por compatibilidad;
 * lo nuevo usa applyWind de assets/wind.js (tres capas y ráfagas que viajan).
 */
export function addWind(material, uniforms, amount = 0.05) {
  material.userData.wind = { legacy: true, amount };
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
