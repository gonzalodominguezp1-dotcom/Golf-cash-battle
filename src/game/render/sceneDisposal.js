// Liberación de una escena de hoyo que ya no se dibuja (F3: un renderer por partida).
// Puro sobre objetos three (no importa three): recorre el árbol y llama a dispose().
//
// Contrato mínimo (sin caché de texturas):
// - se liberan geometrías, texturas, mapas de sombra de las luces e InstancedMesh;
// - los materiales NO se liberan (pueden ser compartidos entre hoyos; sus programas se reutilizan);
// - lo marcado con userData.gcbShared = true, lo que esté en `keep` y scene.environment (PMREM) se conservan;
// - la geometría de los Sprite es una sola para todos (la crea three): nunca se toca.
// Una textura o geometría liberada que vuelva a usarse se sube otra vez sola (three conserva sus datos).

import { collectTextures } from '../warmupRules.js';

const sharedByFlag = (r) => r?.userData?.gcbShared === true;

/** Recursos bajo `root`: { geometries, textures, lights, instanced, materials } (Sets). */
export function collectSceneResources(root) {
  const geometries = new Set();
  const lights = new Set();
  const instanced = new Set();
  const materials = new Set();
  const textures = root ? collectTextures(root) : new Set();
  const visit = (o) => {
    if (o.geometry && !o.isSprite) geometries.add(o.geometry);
    if (o.isLight) lights.add(o);
    if (o.isInstancedMesh) instanced.add(o);
    const m = o.material;
    if (Array.isArray(m)) for (const x of m) { if (x) materials.add(x); }
    else if (m) materials.add(m);
  };
  if (typeof root?.traverse === 'function') root.traverse(visit);
  else if (root) visit(root);
  // fondo con textura (no el entorno: ese se conserva toda la partida)
  if (root?.background?.isTexture) textures.add(root.background);
  if (root?.environment) textures.delete(root.environment);
  return { geometries, textures, lights, instanced, materials };
}

const zero = () => ({ geometries: 0, textures: 0, shadowMaps: 0, lights: 0, instanced: 0, kept: 0, materials: 0 });

/**
 * Libera lo que cuelga de `root` salvo lo compartido (isShared) y lo de `keep`. Los materiales no se liberan
 * (`materials` cuenta los que se dejan). Devuelve los recuentos. Idempotente: una segunda llamada sobre el
 * mismo `root` no hace nada y devuelve ceros.
 */
export function disposeSceneResources(root, { isShared = sharedByFlag, keep = new Set() } = {}) {
  const out = zero();
  if (!root) return out;
  if (root.userData?.gcbDisposed) return out;
  const res = collectSceneResources(root);
  const skip = (r) => keep.has(r) || isShared(r) || (root.environment != null && r === root.environment);
  for (const g of res.geometries) {
    if (skip(g)) { out.kept++; continue; }
    g.dispose?.();
    out.geometries++;
  }
  for (const t of res.textures) {
    if (skip(t)) { out.kept++; continue; }
    t.dispose?.();
    out.textures++;
  }
  for (const l of res.lights) {
    if (skip(l)) { out.kept++; continue; }
    const map = l.shadow?.map;
    if (map) {
      map.dispose?.();
      l.shadow.map = null; // three la vuelve a crear si la luz se dibujara otra vez
      out.shadowMaps++;
    }
    l.dispose?.();
    out.lights++;
  }
  for (const m of res.instanced) {
    if (skip(m)) { out.kept++; continue; }
    m.dispose?.();
    out.instanced++;
  }
  out.materials = res.materials.size;
  if (root.userData) root.userData.gcbDisposed = true;
  return out;
}
