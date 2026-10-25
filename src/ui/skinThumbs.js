import * as THREE from 'three';
import { createSkinMaterial, ballPreview } from '../game/render/ballSkins.js';
import { getQuality } from '../game/render/quality.js';
import { skinById, TIERS } from '../progress/skins.js';

// Miniaturas 3D de skins (docs/skins-premium-plan.md, (e) «Tarjetas de skin» y P9).
//   thumbUrl(skin, instance)            -> Promise<dataURL|null>   (cola + caché; null si no hay WebGL)
//   thumbFrames(skin, instance)         -> Promise<dataURL[]|null> (12 frames girando, para el hover)
//   upgradeImg(img, skin, instance, o)  -> pone el placeholder `ballPreview` y lo cambia por el render 3D
//   installThumbObserver(root, instOf)  -> mejora solo cualquier <img data-skin-id> que entre en `root`
//   hoverLoop(el, img, skin, instance)  -> bucle de giro al pasar el ratón (Legendaria+)
// Opción `hi: true` (solo el reveal de desbloqueo): render a HI_SIZE px en vez de SIZE. Tiene caché y
// clave propias, así que las tarjetas de la pantalla de skins siguen usando 144 px y no cambian de coste.
// Un único WebGLRenderer compartido, un render por fotograma de animación (no bloquea la primera
// pintura) y se libera si la cola lleva un rato vacía.

const SIZE = 144;
const HI_SIZE = 384; // 220 px CSS máx. del reveal a DPR ~1,75; tope fijo: el DPR del dispositivo no multiplica el coste
const R = 0.38;
const FRAMES = 12;
const IDLE_MS = 4000;
const FRAME_BUDGET_MS = 7;

const cache = new Map(); // key -> dataURL | dataURL[]
const inflight = new Map(); // key -> Promise
const queue = [];
let gl = null;
let failed = false;
let raf = 0;
let idleTimer = 0;

// rAF mantiene el ritmo, pero una pestaña en segundo plano no lo dispara: el temporizador lo releva
function later(fn) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(r);
    clearTimeout(t);
    fn();
  };
  const r = requestAnimationFrame(run);
  const t = setTimeout(run, 120);
  return { r, t, cancel() { done = true; cancelAnimationFrame(r); clearTimeout(t); } };
}

const thumbQuality = () => {
  const q = getQuality();
  return q === 'high' ? 'medium' : q;
};
const instKey = (inst) => `${inst?.seed ?? 0}`;
const keyOf = (skin, inst, { hi = false, frames = false } = {}) =>
  `${skin.id}|${instKey(inst)}|${thumbQuality()}${hi ? `|h${HI_SIZE}` : ''}${frames ? '|f' : ''}`;

function ensureGL() {
  if (gl) return gl;
  if (failed) return null;
  try {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
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
    scene.add(mesh);
    canvas.addEventListener('webglcontextlost', () => dropGL(), { once: true });
    gl = { renderer, scene, camera, geo, mesh, px: SIZE };
  } catch {
    failed = true;
    gl = null;
  }
  return gl;
}

function dropGL() {
  if (!gl) return;
  try {
    gl.geo.dispose();
    gl.renderer.dispose();
    gl.renderer.forceContextLoss();
  } catch { }
  gl = null;
}

const pose = (mesh, yaw) => mesh.quaternion.setFromEuler(new THREE.Euler(0.18, -Math.PI / 2 + yaw, 0, 'YXZ'));

function renderJob(job) {
  const g = ensureGL();
  if (!g) return null;
  const px = job.hi ? HI_SIZE : SIZE;
  if (g.px !== px) {
    g.renderer.setSize(px, px, false);
    g.px = px;
  }
  const handle = createSkinMaterial(job.skin, { quality: thumbQuality(), instance: { seed: job.inst?.seed ?? 0 } });
  try {
    g.mesh.material = handle.material;
    handle.update(1.2, 0.016, { speed: 0, impact: 0, state: 0 });
    const shot = (yaw) => {
      pose(g.mesh, yaw);
      g.renderer.render(g.scene, g.camera);
      return g.renderer.domElement.toDataURL('image/png');
    };
    return job.frames ? Array.from({ length: FRAMES }, (_, i) => shot((i / FRAMES) * Math.PI * 2)) : shot(0);
  } finally {
    handle.dispose();
  }
}

function pump() {
  raf = 0;
  clearTimeout(idleTimer);
  const t0 = performance.now();
  while (queue.length) {
    const job = queue.shift();
    let out = null;
    try {
      out = renderJob(job);
    } catch {
      out = null;
    }
    if (out) cache.set(job.key, out);
    inflight.delete(job.key);
    job.resolve(out);
    if (performance.now() - t0 > FRAME_BUDGET_MS) break;
  }
  if (queue.length) raf = later(pump);
  else idleTimer = setTimeout(dropGL, IDLE_MS);
}

function enqueue(skin, inst, { frames = false, priority = false, hi = false } = {}) {
  const key = keyOf(skin, inst, { hi, frames });
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (inflight.has(key)) {
    if (priority) {
      const i = queue.findIndex((j) => j.key === key);
      if (i > 0) queue.unshift(...queue.splice(i, 1));
    }
    return inflight.get(key);
  }
  if (!ensureGL()) return Promise.resolve(null);
  const p = new Promise((resolve) => {
    const job = { key, skin, inst, frames, hi, resolve };
    if (priority) queue.unshift(job);
    else queue.push(job);
  });
  inflight.set(key, p);
  if (!raf) raf = later(pump);
  return p;
}

export const thumbUrl = (skin, instance, o) => enqueue(skin, instance, o);
export const thumbFrames = (skin, instance, o) => enqueue(skin, instance, { ...o, frames: true, priority: true });
/** Miniatura ya renderizada (sin esperar) o null. */
export const thumbCached = (skin, instance, { hi = false } = {}) => cache.get(keyOf(skin, instance, { hi })) ?? null;

/** Muestra `ballPreview` al instante y cambia a la miniatura 3D cuando está lista. `hi` pide HI_SIZE px. */
export function upgradeImg(img, skin, instance, { size = 76, priority = false, hi = false } = {}) {
  const hit = thumbCached(skin, instance, { hi });
  if (hit) {
    img.src = hit;
    img.dataset.hd = '1';
    return Promise.resolve(true);
  }
  if (!img.getAttribute('src')) img.src = ballPreview(skin, size * 2);
  return enqueue(skin, instance, { priority, hi }).then((url) => {
    if (url && img.isConnected !== false) {
      img.src = url;
      img.dataset.hd = '1';
    }
    return !!url;
  });
}

/** Mejora a 3D cualquier `<img data-skin-id>` que se añada bajo `root` (lobby, desafíos, resultados...). */
export function installThumbObserver(root, instOf = () => null) {
  const up = (img) => {
    if (img.dataset.hd || img.dataset.thumb) return;
    img.dataset.thumb = '1';
    upgradeImg(img, skinById(img.dataset.skinId), instOf(img.dataset.skinId), { size: Number(img.width) || 76 });
  };
  const scan = (node) => {
    if (node.nodeType !== 1) return;
    if (node.matches?.('img[data-skin-id]')) up(node);
    node.querySelectorAll?.('img[data-skin-id]').forEach(up);
  };
  const mo = new MutationObserver((list) => {
    for (const m of list) m.addedNodes.forEach(scan);
  });
  mo.observe(root, { childList: true, subtree: true });
  scan(root);
  return () => mo.disconnect();
}

/** Giro corto al pasar el ratón por la tarjeta (solo Legendaria+; en táctil, tocar abre la inspección). */
export function hoverLoop(el, img, skin, instance) {
  if (TIERS[skin.tier ?? skin.rarity]?.order < 4) return;
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  let timer = 0;
  let frames = null;
  let idle = null;
  const stop = () => {
    clearInterval(timer);
    timer = 0;
    if (idle) img.src = idle;
  };
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    idle = img.src;
    thumbFrames(skin, instance).then((f) => {
      frames = f;
      if (!frames || !el.matches(':hover') || timer) return;
      let i = 0;
      timer = setInterval(() => { img.src = frames[(i = (i + 1) % FRAMES)]; }, 1000 / 12);
    });
    if (frames && !timer) {
      let i = 0;
      timer = setInterval(() => { img.src = frames[(i = (i + 1) % FRAMES)]; }, 1000 / 12);
    }
  });
  el.addEventListener('pointerleave', stop);
  el.addEventListener('pointercancel', stop);
}
