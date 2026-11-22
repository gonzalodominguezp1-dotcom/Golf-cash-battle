// Mástil y banderín del hub: tela con el logo bordado (cara y trasera, ambas legibles), ondeo con el viento,
// balanceo del mástil y sombra proyectada en el suelo que se recalcula cada frame (sigue al palo y a la tela).
// Se separa de hubScene.js para poder probarlo en node con una carga de texturas inyectada.
import * as THREE from 'three';
import { flagWaveOffset, planarShadowMatrix, poleLean } from './hubSceneRules.js';

export const FLAG_W = 0.9;
export const FLAG_H = 0.55;
export const POLE_H = 2.4;
const FLAG_POS = new THREE.Vector3(0.45, 2.1, 0);
const SHADOW_Y = 0.03; // por encima del green (0.012) y de la copa (0.02)

/**
 * @param {object} o
 * @param {object|null} o.spec  flagWindSpec(): null = banderín quieto (low o reduced-motion)
 * @param {number[]} o.sunDir   hacia el sol (no hace falta normalizar)
 * @param {() => Promise<{front: THREE.Texture, back: THREE.Texture}>} o.loadTextures
 * @param {() => void} [o.onTextures] se llama al cambiar la tela a texturizada (para redibujar si no hay bucle)
 */
export function createFlagRig({ spec, sunDir, loadTextures, onTextures = () => {} }) {
  let windSpec = spec ?? null;
  let geo = makeGeometry(windSpec);
  let base = geo.attributes.position.array.slice();
  let disposed = false;
  let textures = null;

  // Tela roja lisa de siempre: se queda si las texturas no cargan.
  const frontMat = new THREE.MeshStandardMaterial({ color: 0xe01212, emissive: 0x3a0000, side: THREE.DoubleSide });
  const backMat = new THREE.MeshStandardMaterial({ side: THREE.BackSide });
  const front = new THREE.Mesh(geo, frontMat);
  const back = new THREE.Mesh(geo, backMat);
  back.visible = false;
  front.frustumCulled = back.frustumCulled = false;

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, POLE_H, 8), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
  pole.position.y = POLE_H / 2;

  const flagNode = new THREE.Group();
  flagNode.position.copy(FLAG_POS);
  flagNode.add(front, back);
  const mast = new THREE.Group(); // gira alrededor de la base: lleva palo y tela
  mast.add(pole, flagNode);

  // Sombras planas proyectadas sobre el suelo según el sol (también con calidad baja, sin shadow map).
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const poleShadowMat = shadowMat.clone();
  const flagShadow = new THREE.Mesh(geo, shadowMat);
  const poleShadow = new THREE.Mesh(pole.geometry, poleShadowMat);
  for (const s of [flagShadow, poleShadow]) {
    s.matrixAutoUpdate = false;
    s.frustumCulled = false;
    s.renderOrder = 2;
  }
  const dir = new THREE.Vector3(...sunDir).normalize().toArray();
  const projection = new THREE.Matrix4();
  const projArr = planarShadowMatrix(dir, SHADOW_Y);
  const hasShadow = !!projArr;
  if (hasShadow) projection.fromArray(projArr);
  flagShadow.visible = poleShadow.visible = hasShadow;

  const root = new THREE.Group();
  root.add(mast, flagShadow, poleShadow);

  function makeGeometry(s) {
    return new THREE.PlaneGeometry(FLAG_W, FLAG_H, s?.segW ?? 1, s?.segH ?? 1);
  }

  function syncShadows() {
    if (!hasShadow) return;
    mast.updateMatrixWorld(true);
    flagShadow.matrix.multiplyMatrices(projection, front.matrixWorld);
    poleShadow.matrix.multiplyMatrices(projection, pole.matrixWorld);
    flagShadow.matrixWorldNeedsUpdate = poleShadow.matrixWorldNeedsUpdate = true;
  }

  /** Coloca la tela y el mástil para el tiempo t (s) y recalcula las sombras. Sin viento solo sincroniza. */
  function update(t) {
    if (disposed) return;
    if (windSpec) {
      mast.rotation.z = poleLean(t, windSpec);
      const pos = geo.attributes.position;
      const arr = pos.array;
      for (let i = 0; i < arr.length; i += 3) {
        const o = flagWaveOffset((base[i] + FLAG_W / 2) / FLAG_W, (base[i + 1] + FLAG_H / 2) / FLAG_H, t, windSpec);
        arr[i] = base[i] + o.x;
        arr[i + 1] = base[i + 1] + o.y;
        arr[i + 2] = base[i + 2] + o.z;
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    }
    syncShadows();
  }

  /** Cambia el viento (p. ej. al cambiar la calidad): rehace la malla de la tela. */
  function setSpec(next) {
    if (disposed) return;
    windSpec = next ?? null;
    const old = geo;
    geo = makeGeometry(windSpec);
    base = geo.attributes.position.array.slice();
    front.geometry = back.geometry = flagShadow.geometry = geo;
    old.dispose();
    mast.rotation.z = 0;
    update(0);
  }

  function applyTextures(tex) {
    textures = tex;
    for (const t of [tex.front, tex.back]) t.colorSpace = THREE.SRGBColorSpace;
    Object.assign(frontMat, { map: tex.front, emissiveMap: tex.front, emissive: new THREE.Color(0x555555), color: new THREE.Color(0xffffff), side: THREE.FrontSide, transparent: true, alphaTest: 0.3 });
    Object.assign(backMat, { map: tex.back, emissiveMap: tex.back, emissive: new THREE.Color(0x555555), side: THREE.BackSide, transparent: true, alphaTest: 0.3 });
    // la sombra recorta la silueta de la tela (cola de golondrina)
    Object.assign(shadowMat, { map: tex.front, alphaTest: 0.3 });
    for (const m of [frontMat, backMat, shadowMat]) m.needsUpdate = true;
    back.visible = true;
    onTextures();
  }

  const ready = Promise.resolve()
    .then(loadTextures)
    .then((tex) => {
      if (disposed) { tex.front?.dispose(); tex.back?.dispose(); return false; }
      applyTextures(tex);
      return true;
    })
    .catch(() => false); // sin textura sigue la tela roja lisa, sin error visible

  update(0);

  function dispose() {
    if (disposed) return;
    disposed = true;
    textures?.front.dispose();
    textures?.back.dispose();
    geo.dispose();
    pole.geometry.dispose();
    for (const m of [frontMat, backMat, shadowMat, poleShadowMat, pole.material]) m.dispose();
  }

  return { object: root, update, setSpec, ready, dispose, parts: { front, back, flagShadow, poleShadow, mast, frontMat, backMat, shadowMat } };
}
