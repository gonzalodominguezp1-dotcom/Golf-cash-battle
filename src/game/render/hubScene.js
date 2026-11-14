// Escena 3D de fondo del hub (AC13, AC14, C7, C8): green con copa y bandera, anillo de bosque
// de día y montañas, con la cámara orbitando 360°. Se carga con import() dinámico para que
// three no entre en la carga inicial. Las apariciones al azar viven en hubAmbient.js
// (`ambient: false` las desactiva, p. ej. para capturar capas).
import * as THREE from 'three';
import { THEMES } from '../themes.js';
import { ResolutionGovernor } from './resolutionGovernor.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lushMountains, makeLushBush, makeLushCloud, makeLushRock, makeLushTree, meadowGroundTexture } from './lushEnvironment.js';
import { flagWindSpec, orbitAngle, scenePreset, shouldRender } from './hubSceneRules.js';
import { createFlagRig } from './hubFlag.js';
import { createHubAmbient } from './hubAmbient.js';

const THEME = THEMES.meadowDay;
const GREEN_R = 7;
// Cámara cerca del green: el borde del collar está en GREEN_R + 1.6 y el anillo de arbustos/rocas
// empieza en r ≈ 10, así que 8.5 orbita entre los dos sin atravesar nada y el green llena el encuadre.
const ORBIT_R = 8.5;
const CAM_Y = 3.2;
export const HUB_LAYERS = ['sky', 'forest', 'green'];

/** Generador determinista (mulberry32) para que `?seed=N` repita la misma escena. */
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function skyMesh() {
  const sunDir = new THREE.Vector3(...THEME.sunDir).normalize();
  return new THREE.Mesh(
    new THREE.SphereGeometry(180, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(THEME.skyTop) },
        horizon: { value: new THREE.Color(THEME.skyHorizon) },
        sunColor: { value: new THREE.Color(THEME.sunColor) },
        sunDir: { value: sunDir },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.55));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          col += sunColor * (pow(s, 600.0) * 1.5 + pow(s, 12.0) * 0.25);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
}

function buildSky(rng) {
  const g = new THREE.Group();
  g.add(skyMesh());
  lushMountains(g, THEME.mountains, THEME.skyHorizon, rng);
  const cloudMat = new THREE.MeshLambertMaterial({ color: THEME.clouds, emissive: THEME.clouds, emissiveIntensity: 0.55, vertexColors: true });
  for (let i = 0; i < 8; i++) {
    const c = makeLushCloud(rng, cloudMat, 3);
    const a = rng() * Math.PI * 2, r = 70 + rng() * 40;
    c.position.set(Math.cos(a) * r, 38 + rng() * 22, Math.sin(a) * r);
    g.add(c);
  }
  return g;
}

function buildGreen(flagObject) {
  const g = new THREE.Group();
  const grass = meadowGroundTexture();
  // pradera grande, un poco más oscura, y el green encima con su collar
  const meadow = new THREE.Mesh(new THREE.CircleGeometry(110, 48), new THREE.MeshStandardMaterial({ color: THEME.groundMid, map: grass, roughness: 1 }));
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.y = -0.02;
  meadow.receiveShadow = true;
  const collar = new THREE.Mesh(new THREE.CircleGeometry(GREEN_R + 1.6, 64), new THREE.MeshStandardMaterial({ color: 0x4aa044, roughness: 0.95 }));
  collar.rotation.x = -Math.PI / 2;
  collar.position.y = 0.005;
  const green = new THREE.Mesh(new THREE.CircleGeometry(GREEN_R, 64), new THREE.MeshStandardMaterial({ color: 0x7fd25c, roughness: 0.85 }));
  green.rotation.x = -Math.PI / 2;
  green.position.y = 0.012;
  green.receiveShadow = true;
  const cup = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshBasicMaterial({ color: 0x0b0f0c }));
  cup.rotation.x = -Math.PI / 2;
  cup.position.y = 0.02;
  g.add(meadow, collar, green, cup, flagObject); // mástil, banderín y sus sombras (hubFlag.js)
  return g;
}

/** Junta las mallas de `root` por material (conserva el color por vértice): pocas draws en vez de ~3 por árbol. */
function mergeByMaterial(root, into) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.clone();
    if (geo.index) geo = geo.toNonIndexed();
    geo.deleteAttribute('uv');
    geo.applyMatrix4(o.matrixWorld);
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(geo);
  });
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos);
    geos.forEach((x) => x.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = m.receiveShadow = true;
    into.add(m);
  }
  root.traverse((o) => o.isMesh && o.geometry.dispose());
}

function buildForest(rng, preset) {
  const g = new THREE.Group();
  const raw = new THREE.Group();
  const leaves = THEME.leaves.map((color) => new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 0.8 }));
  const detail = preset.trees >= 40 ? 2 : preset.trees >= 26 ? 1 : 0;
  // anillo de árboles entre el green y las montañas, con arbustos y rocas intercalados
  for (let i = 0; i < preset.trees; i++) {
    const a = ((i + rng() * 0.8) / preset.trees) * Math.PI * 2;
    const r = 15 + rng() * 14;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    raw.add(makeLushTree(THEME.trees[Math.floor(rng() * THEME.trees.length)], rng, x, 0, z, leaves, detail));
    if (i % 2 === 0) {
      const b = a + 0.1 + rng() * 0.1, rb = r - 2 - rng() * 3;
      raw.add(makeLushBush(rng, Math.cos(b) * rb, 0, Math.sin(b) * rb, leaves, detail));
    }
    if (i % 3 === 0) {
      const b = a - 0.12, rb = r - 3 - rng() * 2;
      raw.add(makeLushRock(rng, Math.cos(b) * rb, 0, Math.sin(b) * rb, THEME.groundLow, detail));
    }
  }
  mergeByMaterial(raw, g);
  return g;
}

/**
 * Crea la escena y la monta en `container`. Rechaza si no hay WebGL.
 * @returns {Promise<object>} HubScene (ver plan §3.9)
 */
export async function createHubScene(container, { quality = 'medium', reducedMotion = false, rng = Math.random, transparent = false, ambient: ambientOn = true } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', alpha: transparent, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('contexto nulo');
  } catch (err) {
    try { renderer?.forceContextLoss(); renderer?.dispose(); } catch { /* ya liberado */ }
    throw new Error('Sin WebGL: ' + (err?.message ?? err));
  }

  let sun, scene, vis, onVis, ambient, flagRig, disposed = false;
  const release = () => {
    disposed = true;
    renderer.setAnimationLoop(null);
    if (onVis) document.removeEventListener('visibilitychange', onVis);
    scene?.traverse((o) => {
      o.geometry?.dispose?.();
      for (const m of [].concat(o.material ?? [])) { m.map?.dispose?.(); m.dispose?.(); }
    });
    ambient?.dispose();
    flagRig?.dispose();
    sun?.dispose?.();
    sun?.shadow?.map?.dispose?.();
    renderer.forceContextLoss();
    renderer.dispose();
    renderer.domElement.remove();
  };

  try {
    let preset = scenePreset(quality);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = preset.shadows;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(THEME.skyHorizon, 45, 130);
    scene.add(new THREE.HemisphereLight(THEME.skyHorizon, THEME.groundMid, THEME.ambient));
    sun = new THREE.DirectionalLight(THEME.sunColor, THEME.sunIntensity);
    sun.position.set(...THEME.sunDir).multiplyScalar(40);
    sun.castShadow = renderer.shadowMap.enabled;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 100 });
    scene.add(sun);

    const sky = buildSky(rng);
    // OJO: este rng() extra cambia la disposición del bosque respecto a T014a para un mismo ?seed=N
    // (T016 debe capturar con este código).
    const forestSeed = (rng() * 4294967296) >>> 0; // el bosque se reconstruye igual al cambiar de calidad
    // Banderín con el logo: la textura se carga dentro de la escena (three ya está cargado); si falla, queda la tela roja.
    const textureBase = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
    const loadFlagTexture = (file) => new Promise((ok, fail) => {
      const t = new THREE.TextureLoader().load(`${textureBase}hub/${file}`, ok, undefined, fail);
      t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    });
    flagRig = createFlagRig({
      spec: flagWindSpec(quality, reducedMotion),
      sunDir: THEME.sunDir,
      loadTextures: async () => {
        const [front, back] = await Promise.allSettled([loadFlagTexture('banderin.webp'), loadFlagTexture('banderin-back.webp')]);
        if (front.status !== 'fulfilled' || back.status !== 'fulfilled') {
          front.value?.dispose(); back.value?.dispose(); // una sola cara cargada no sirve: se queda la tela roja
          throw new Error('banderín sin textura');
        }
        return { front: front.value, back: back.value };
      },
      // sin bucle de animación (reduced-motion o capa de captura) hay que redibujar cuando llega la tela
      onTextures: () => { if (!disposed && started && !paused && (reducedMotion || layerMode)) drawOnce(); },
    });
    const layers = { sky, forest: buildForest(seededRng(forestSeed), preset), green: buildGreen(flagRig.object) };
    for (const name of HUB_LAYERS) scene.add(layers[name]);
    const disposeTree = (root) => root.traverse((o) => {
      o.geometry?.dispose?.();
      for (const m of [].concat(o.material ?? [])) m.dispose?.(); // materiales propios del bosque
    });
    const rebuildForest = () => {
      const old = layers.forest;
      const visible = old.visible;
      scene.remove(old);
      disposeTree(old);
      layers.forest = buildForest(seededRng(forestSeed), preset);
      layers.forest.visible = visible;
      scene.add(layers.forest);
    };
    const applyShadows = (on) => {
      if (renderer.shadowMap.enabled === on) return;
      renderer.shadowMap.enabled = on;
      sun.castShadow = on;
      if (!on) { sun.shadow.map?.dispose?.(); sun.shadow.map = null; }
      scene.traverse((o) => { for (const m of [].concat(o.material ?? [])) m.needsUpdate = true; });
    };

    ambient = null;
    if (ambientOn && !reducedMotion) {
      const ambientRng = seededRng((rng() * 4294967296) >>> 0);
      try { ambient = createHubAmbient(scene, { quality, reducedMotion, rng: ambientRng }); } catch (e) {
        // un fallo de las apariciones no tumba la escena: sigue sin ellas
        console.warn('hubAmbient no disponible:', e?.message ?? e);
        ambient = null;
      }
    }

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
    const placeCamera = (t) => {
      const a = orbitAngle(t);
      camera.position.set(Math.cos(a) * ORBIT_R, CAM_Y, Math.sin(a) * ORBIT_R);
      camera.lookAt(0, 1.1, 0);
    };

    const dpr = () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
    const gov = new ResolutionGovernor({ min: preset.minPixelRatio, max: preset.pixelRatio, apply: (v) => setPR(v) });
    function setPR(v) {
      renderer.setPixelRatio(Math.min(dpr(), v));
      resize();
    }
    function resize() {
      const el = renderer.domElement.parentElement ?? container;
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (reducedMotion && started && !paused && !layerMode) drawOnce();
    }

    const stats = {
      renderCalls: 0,
      _times: [],
      /** FPS medios de los últimos ≤60 frames dibujados; 0 si está en pausa o sin muestras. */
      fps() {
        const t = this._times;
        return paused || t.length < 2 ? 0 : ((t.length - 1) * 1000) / (t[t.length - 1] - t[0] || 1);
      },
    };

    vis = { covered: false, hidden: false };
    let paused = false, started = false, layerMode = false, t0 = null, lastT = 0, prevNow = null;
    let resolveFirst;
    const firstFrame = new Promise((r) => (resolveFirst = r));

    function drawOnce() {
      placeCamera(0);
      renderer.render(scene, camera);
      stats.renderCalls++;
      resolveFirst();
    }

    function frame(now) {
      if (disposed) return;
      if (t0 === null) t0 = now;
      if (!shouldRender(vis)) { stats._times.length = 0; prevNow = null; return; }
      lastT = (now - t0) / 1000;
      placeCamera(lastT);
      flagRig.update(lastT);
      if (ambient) { ambient.update(prevNow === null ? 0 : (now - prevNow) / 1000); prevNow = now; }
      gov.tick(now);
      renderer.render(scene, camera);
      stats.renderCalls++;
      stats._times.push(now);
      if (stats._times.length > 60) stats._times.shift();
      resolveFirst();
    }

    onVis = () => { vis.hidden = document.hidden; };
    document.addEventListener('visibilitychange', onVis);
    onVis();
    setPR(preset.pixelRatio);
    started = true;
    // con movimiento reducido: un solo frame (y otro al cambiar tamaño, calidad o reanudar)
    if (reducedMotion) drawOnce();
    else renderer.setAnimationLoop(frame);

    return {
      firstFrame,
      stats,
      pause() { paused = true; renderer.setAnimationLoop(null); stats._times.length = 0; prevNow = null; },
      get paused() { return paused; },
      resume() {
        if (!paused || disposed || layerMode) return;
        paused = false;
        stats._times.length = 0;
        prevNow = null;
        if (reducedMotion) { drawOnce(); return; }
        t0 = null; // la cámara sigue desde el ángulo en que se paró
        const resumeAt = lastT;
        renderer.setAnimationLoop((now) => {
          if (t0 === null) t0 = now - resumeAt * 1000;
          frame(now);
        });
      },
      setQuality(q) {
        if (disposed) return;
        const next = scenePreset(q);
        const treesChanged = next.trees !== preset.trees;
        preset = next;
        ambient?.setQuality(q);
        flagRig.setSpec(flagWindSpec(q, reducedMotion));
        applyShadows(preset.shadows);
        if (treesChanged) rebuildForest();
        gov.configure(preset.minPixelRatio, preset.pixelRatio);
        setPR(preset.pixelRatio);
        stats._times.length = 0;
        if (reducedMotion && !paused) drawOnce();
      },
      resize,
      attach(el) { el.appendChild(renderer.domElement); resize(); },
      dispose: release,
      /** Solo para la captura (T016): deja visible una capa y fondo transparente. */
      renderLayer(name) {
        if (!HUB_LAYERS.includes(name)) throw new Error('capa desconocida: ' + name);
        layerMode = true;
        ambient?.setEnabled(false);
        renderer.setAnimationLoop(null);
        for (const n of HUB_LAYERS) layers[n].visible = n === name;
        scene.fog = null;
        if (name !== 'sky') renderer.setClearColor(0x000000, 0);
        drawOnce();
      },
    };
  } catch (err) {
    release();
    throw err;
  }
}
