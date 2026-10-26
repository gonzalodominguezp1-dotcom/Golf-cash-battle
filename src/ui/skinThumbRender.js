import * as THREE from 'three';
import { createSkinMaterial } from '../game/render/ballSkins.js';

// Render 3D de UNA miniatura de skin, fuera de pantalla, a imagen (WebP; PNG si el navegador no
// codifica WebP). Solo lo importa skinThumbs.js con import() cuando falta una miniatura en caché,
// así que three.js y los materiales de skin no se cargan en lobby ni en la pantalla de skins si
// ya están todas guardadas. Un renderer que se crea bajo demanda y se libera con releaseThumbRenderer().

const R = 0.38;
const CTX = Object.freeze({ speed: 0, impact: 0, state: 0 });
let gl = null;

function ensureGL() {
  if (gl) return gl;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0.1, 2.9);
  camera.lookAt(0, 0, 0);
  const key = new THREE.DirectionalLight(0xfff1de, 2.6);
  key.position.set(2.2, 3, 3);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 2.2);
  rim.position.set(-2.5, 2, -3);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(-3, -0.5, 2.5);
  scene.add(key, rim, fill, new THREE.HemisphereLight(0xffffff, 0x202530, 0.18));
  const geo = new THREE.SphereGeometry(R, 64, 48);
  const mesh = new THREE.Mesh(geo);
  mesh.quaternion.setFromEuler(new THREE.Euler(0.18, -Math.PI / 2, 0, 'YXZ'));
  scene.add(mesh);
  gl = { renderer, scene, camera, geo, mesh, px: 0 };
  return gl;
}

/** Libera el renderer y su contexto WebGL (se llama al vaciarse la cola). */
export function releaseThumbRenderer() {
  if (!gl) return;
  const g = gl;
  gl = null;
  try {
    g.geo.dispose();
    g.renderer.dispose();
    g.renderer.forceContextLoss();
  } catch { }
}

const toBlob = (canvas, type, q) => new Promise((resolve) => {
  try {
    canvas.toBlob(resolve, type, q);
  } catch {
    resolve(null);
  }
});

/** Renderiza la skin una vez y devuelve un Blob (image/webp, o image/png de reserva). Lanza si no hay WebGL. */
export async function renderThumb(skin, { seed = 0, quality = 'medium', px = 144 } = {}) {
  const g = ensureGL();
  if (g.px !== px) {
    g.renderer.setSize(px, px, false);
    g.px = px;
  }
  const handle = createSkinMaterial(skin, { quality, instance: { seed } });
  const out = document.createElement('canvas');
  out.width = out.height = px;
  try {
    g.mesh.material = handle.material;
    handle.update(1.2, 0.016, CTX);
    // compilación paralela si el driver la admite: no congela la interfaz mientras compila
    try {
      await g.renderer.compileAsync(g.scene, g.camera);
    } catch { }
    if (gl !== g) throw new Error('thumb renderer released');
    g.renderer.render(g.scene, g.camera);
    // copia síncrona: el búfer de WebGL no se conserva tras devolver el control
    out.getContext('2d').drawImage(g.renderer.domElement, 0, 0);
  } finally {
    handle.dispose();
  }
  let blob = await toBlob(out, 'image/webp', 0.9);
  if (!blob || blob.type !== 'image/webp') blob = (await toBlob(out, 'image/png')) ?? blob;
  return blob;
}
