// Laboratorio de assets de entorno (solo desarrollo: assets-lab.html no está en el build).
// Muestra cada asset «antes» y «después» con el cielo, la luz y el suelo de un tema,
// con viento, calidad Bajo/Medio/Alto y contadores de triángulos y llamadas de dibujo.
import * as THREE from 'three';
import { THEMES } from '../game/themes.js';
import { QUALITY_LEVELS, QUALITY_NAMES, qualityPreset } from '../game/render/quality.js';
import { getAssets, getAsset, seededRng, diffStats, formatStats } from './assetRegistry.js';
import { roundTreePalette } from '../game/render/environment.js';
import * as wind from '../game/render/assets/wind.js';
import './assets/examples.js';

// Viento compartido (paso 0). Si el contrato no está completo, el laboratorio sigue sin viento.
const windOk = !!(wind.setWind && wind.triggerGust && wind.updateWind && wind.prepareWind && wind.setWindField);
if (windOk) wind.setWindField({ radius: 15 }); // que la ráfaga llegue pronto
else console.warn('[assets-lab] wind.js incompleto; sin viento');

const $ = (id) => document.getElementById(id);
const stage = $('stage');

// temas naturales (neón y cyberpunk no se tocan)
const themeIds = Object.keys(THEMES).filter((k) => !THEMES[k].neon && !THEMES[k].cyberCity);
const state = {
  assetId: getAssets()[0]?.id,
  themeId: themeIds.includes('meadowDay') ? 'meadowDay' : themeIds[0],
  level: 'medium',
  seed: 1,
  strength: 1,
  angle: 0,
};

// --- interfaz ---
const fill = (sel, items) => {
  sel.innerHTML = '';
  for (const [value, label] of items) sel.add(new Option(label, value));
};
fill($('asset'), getAssets().map((a) => [a.id, a.label]));
fill($('theme'), themeIds.map((k) => [k, k]));
fill($('quality'), QUALITY_LEVELS.map((l) => [l, QUALITY_NAMES[l]]));
$('theme').value = state.themeId;
$('quality').value = state.level;
$('windState').textContent = windOk ? '' : 'Sin viento (falta wind.js)';

// --- renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.info.autoReset = false;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setScissorTest(true);
stage.appendChild(renderer.domElement);

// Escena de un lado: cielo, luces y suelo del tema (misma receta que environment.js).
function buildScene(theme, preset) {
  const scene = new THREE.Scene();
  const sunDir = new THREE.Vector3(...theme.sunDir).normalize();
  scene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(180, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(theme.skyTop) },
          horizon: { value: new THREE.Color(theme.skyHorizon) },
          sunColor: { value: new THREE.Color(theme.sunColor) },
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
    ),
  );
  scene.fog = new THREE.Fog(theme.skyHorizon, 40, 120);
  scene.add(new THREE.HemisphereLight(theme.skyHorizon, theme.groundMid, theme.ambient));
  const sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
  sun.position.copy(sunDir).multiplyScalar(20);
  sun.castShadow = preset.shadows;
  const res = Math.min(preset.shadowRes, 2048);
  sun.shadow.mapSize.set(res, res);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 60 });
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshLambertMaterial({ color: theme.groundMid }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  const padColor = theme.grass ? new THREE.Color(theme.grass[0]) : new THREE.Color(theme.groundHigh);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshLambertMaterial({ color: padColor }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.005;
  pad.receiveShadow = true;
  scene.add(ground, pad);
  return scene;
}

// --- lados antes/después ---
const sides = [
  { key: 'old', title: 'Antes', scene: null, camera: new THREE.PerspectiveCamera(45, 1, 0.05, 400), asset: null, stats: null },
  { key: 'new', title: 'Después', scene: null, camera: new THREE.PerspectiveCamera(45, 1, 0.05, 400), asset: null, stats: null },
];
for (const s of sides) {
  s.tag = document.createElement('div');
  s.tag.className = 'tag';
  s.msg = document.createElement('div');
  s.msg.className = 'msg';
  stage.append(s.tag, s.msg);
}

const orbit = { yaw: 0.6, pitch: 0.35, zoom: 1, target: new THREE.Vector3(0, 1, 0), dist: 6 };
let frame = 0;
let measureNow = true;
let layout = [];

function disposeScene(scene) {
  scene?.traverse((n) => {
    n.geometry?.dispose?.();
    if (n.isLight) n.shadow?.map?.dispose();
  });
}

function rebuild() {
  const theme = THEMES[state.themeId];
  // la paleta del tema llega a los assets por el preset (preset.theme; la lee roundTree.js)
  const preset = { level: state.level, ...qualityPreset(state.level), theme: roundTreePalette(theme) };
  const asset = getAsset(state.assetId);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
  renderer.shadowMap.enabled = preset.shadows;
  renderer.shadowMap.needsUpdate = true;
  const box = new THREE.Box3();
  for (const s of sides) {
    disposeScene(s.scene);
    s.scene = buildScene(theme, preset);
    s.msg.textContent = '';
    let obj = null;
    if (asset) {
      const make = s.key === 'old' ? asset.makeOld : asset.makeNew;
      try {
        obj = make(seededRng(state.seed), preset) ?? null;
      } catch (err) {
        console.error(`[assets-lab] ${asset.id}/${s.key}`, err);
        s.msg.textContent = 'Error al crear el asset (ver consola)';
      }
    }
    s.asset = obj;
    if (obj) {
      obj.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = true;
          n.receiveShadow = true;
        }
      });
      if (windOk) wind.prepareWind(obj); // sin esto el asset se queda quieto
      s.scene.add(obj);
      box.expandByObject(obj);
    } else if (!s.msg.textContent) {
      s.msg.textContent = s.key === 'new' ? 'Sin diseño nuevo todavía' : 'Sin asset';
    }
    s.stats = null;
  }
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    box.getCenter(orbit.target);
    orbit.dist = Math.max(size.x, size.y, size.z, 0.3) * 2.3;
  }
  measureNow = true;
}

// --- tamaño y disposición: lado a lado en pantalla ancha; en vertical, uno encima del otro ---
function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h, false);
  const half = Math.floor(w / 2);
  const halfH = Math.floor(h / 2);
  layout = w >= h
    ? [{ x: 0, y: 0, w: half, h }, { x: half, y: 0, w: w - half, h }]
    : [{ x: 0, y: 0, w, h: halfH }, { x: 0, y: halfH, w, h: h - halfH }];
  sides.forEach((s, i) => {
    const r = layout[i];
    s.camera.aspect = r.w / Math.max(1, r.h);
    s.camera.updateProjectionMatrix();
    s.tag.style.left = `${r.x + 8}px`;
    s.tag.style.top = `${r.y + 8}px`;
    s.msg.style.left = `${r.x}px`;
    s.msg.style.width = `${r.w}px`;
    s.msg.style.top = `${r.y + r.h / 2 - 10}px`;
  });
}
window.addEventListener('resize', resize);

// --- cámara orbital: arrastrar gira; rueda o pellizco acercan ---
const pointers = new Map();
let pinch = 0;
function pointerGap() {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}
stage.addEventListener('pointerdown', (e) => {
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) pinch = pointerGap();
});
stage.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pointers.size === 1) {
    orbit.yaw -= dx * 0.008;
    orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + dy * 0.006, 0.02, 1.45);
  } else if (pointers.size === 2) {
    const g = pointerGap();
    if (pinch > 0 && g > 0) orbit.zoom = THREE.MathUtils.clamp(orbit.zoom * (pinch / g), 0.25, 4);
    pinch = g;
  }
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  pinch = 0;
};
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    orbit.zoom = THREE.MathUtils.clamp(orbit.zoom * Math.exp(e.deltaY * 0.001), 0.25, 4);
  },
  { passive: false },
);

function placeCamera(cam) {
  const d = orbit.dist * orbit.zoom;
  cam.position.set(
    orbit.target.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * d,
    orbit.target.y + Math.sin(orbit.pitch) * d,
    orbit.target.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * d,
  );
  cam.lookAt(orbit.target);
}

// setViewport y setScissor tienen el origen abajo a la izquierda: se invierte y
function drawSide(s, r, canvasH) {
  const y = canvasH - r.y - r.h;
  renderer.setViewport(r.x, y, r.w, r.h);
  renderer.setScissor(r.x, y, r.w, r.h);
  renderer.render(s.scene, s.camera);
}

const snap = () => ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls });

// coste del asset = lo dibujado con él menos lo dibujado sin él (suelo y cielo no cuentan)
function measure(s, r, canvasH) {
  if (!s.asset) {
    // sin asset (p. ej. «Después» vacío) también hay que dibujar el panel: si no, ese
    // fotograma sale sin pintar (el buffer se descarta tras presentarse) y parpadea
    renderer.info.reset();
    drawSide(s, r, canvasH);
    return null;
  }
  s.asset.visible = false;
  renderer.info.reset();
  drawSide(s, r, canvasH);
  const base = snap();
  s.asset.visible = true;
  renderer.info.reset();
  drawSide(s, r, canvasH);
  return diffStats(base, snap());
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (windOk) wind.updateWind(dt);
  const canvasH = stage.clientHeight;
  const doMeasure = measureNow || frame % 30 === 0;
  measureNow = false;
  sides.forEach((s, i) => {
    placeCamera(s.camera);
    if (doMeasure) {
      s.stats = measure(s, layout[i], canvasH);
    } else {
      renderer.info.reset();
      drawSide(s, layout[i], canvasH);
    }
    s.tag.textContent = `${s.title}${s.stats ? ` · ${formatStats(s.stats)}` : ''}`;
  });
  frame++;
}

// --- controles ---
const onChange = (id, fn) =>
  $(id).addEventListener('change', () => {
    fn($(id).value);
    rebuild();
  });
onChange('asset', (v) => (state.assetId = v));
onChange('theme', (v) => (state.themeId = v));
onChange('quality', (v) => (state.level = v));
$('seed').addEventListener('change', () => {
  state.seed = Math.max(0, Math.floor(Number($('seed').value) || 0));
  rebuild();
});
$('reseed').addEventListener('click', () => {
  state.seed = Math.floor(Math.random() * 100000);
  $('seed').value = state.seed;
  rebuild();
});

function applyWindUi() {
  $('strengthV').textContent = state.strength.toFixed(2);
  $('angleV').textContent = `${state.angle}°`;
  if (windOk) wind.setWind({ strength: state.strength, angle: (state.angle * Math.PI) / 180 });
}
$('strength').addEventListener('input', () => {
  state.strength = Number($('strength').value);
  applyWindUi();
});
$('angle').addEventListener('input', () => {
  state.angle = Number($('angle').value);
  applyWindUi();
});
$('gust').addEventListener('click', () => {
  if (windOk) wind.triggerGust();
});

applyWindUi();
resize();
rebuild();
requestAnimationFrame(loop);
