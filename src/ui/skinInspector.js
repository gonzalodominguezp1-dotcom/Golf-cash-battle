import * as THREE from 'three';
import './skinInspector.css';
import { createSkinMaterial } from '../game/render/ballSkins.js';
import { SkinFX } from '../game/render/skins/skinFx.js';
import { BALL_R } from '../game/physics.js';
import { QUALITY_LEVELS, QUALITY_NAMES, getQuality } from '../game/render/quality.js';
import { SKINS, TIERS } from '../progress/skins.js';

// Inspector 360° de skins v2 (P8).
//   createSkinInspector(container, { skin, instance, mode: 'panel'|'fullscreen', quality? })
//     -> { setSkin(skin, instance?, { quality }?), playFx(on?), destroy(), ... }
// Un único WebGLRenderer por inspector. Render bajo demanda: solo hay bucle mientras hay interacción o
// una animación en curso (entrada, giro con inercia, zoom, efectos); en reposo no se dibuja nada.
// «Probar efectos» divide el visor en 4 paneles (2×2), cada uno con un bucle de un efecto de la bola.
// Pixel ratio ≤ 1,5 (1 en Baja), reflejo de suelo solo en Alta, pausa si no es visible y en destroy()
// se libera todo (dispose + forceContextLoss). Este módulo se carga con import() al abrir el visor.

const TAU = Math.PI * 2;
const R = 0.38; // radio de la bola en la escena del inspector
const FLOOR_Y = -R - 0.02;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;
const FX_K = R / BALL_R; // unidades de juego -> unidades del inspector
const SPHERE = { low: [32, 20], medium: [48, 32], high: [64, 48] };
const MAX_DPR = { low: 1, medium: 1.5, high: 2 };
const SPIN = Math.PI / 4; // rad/s del giro continuo (vuelta completa en 8 s)
// Las vistas previas de skins siempre se dibujan en calidad máxima, sea cual sea la calidad del juego.
const PREVIEW_QUALITY = 'high';
const EPS = 0.02; // rad/s de inercia por debajo de los cuales la bola se considera parada
const FX_CUP_X = -0.1;
const FX_WALL_X = 1.0;
// Paneles de «Probar efectos»: cada uno repite un efecto de la bola (x en unidades del inspector).
const FX_SCENES = [
  {
    id: 'golpe', name: 'Golpe', loop: 2.6,
    pose: (t) => ({ x: t < 0.3 ? -0.8 : -0.8 + 1.25 * easeOut(Math.min(1, (t - 0.3) / 1.3)), y: 0, s: 1 }),
    events: [{ t: 0.3, kind: 'hit', power: 0.9, dx: 1 }],
  },
  {
    id: 'pared', name: 'Pared', loop: 2.6,
    pose: (t) => {
      if (t < 0.2) return { x: -0.5, y: 0, s: 1 };
      if (t < 1.0) return { x: -0.5 + (0.57 + 0.5) * easeOut((t - 0.2) / 0.8), y: 0, s: 1 };
      return { x: 0.57 + (0.2 - 0.57) * easeOut(Math.min(1, (t - 1.0) / 0.8)), y: 0, s: 1 };
    },
    events: [{ t: 1.0, kind: 'wall', power: 0.8 }],
  },
  {
    id: 'embocada', name: 'Embocada', loop: 2.8,
    pose: (t) => {
      if (t < 0.2) return { x: 0.2, y: 0, s: 1 };
      if (t < 1.4) return { x: 0.2 + (FX_CUP_X - 0.2) * easeOut((t - 0.2) / 1.2), y: 0, s: 1 };
      const u = Math.min(1, (t - 1.4) / 0.4);
      return { x: FX_CUP_X, y: -0.45 * u, s: 1 - u };
    },
    events: [{ t: 1.4, kind: 'sink' }],
  },
  {
    id: 'rodada', name: 'Rodada', loop: 3,
    pose: (t) => ({ x: -0.8 + 1.37 * easeOut(Math.min(1, t / 2.8)), y: 0, s: 1 }),
    events: [],
  },
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = (u) => 1 - (1 - u) * (1 - u) * (1 - u);
const reducedMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function radialTexture(stops, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#2f8f4a' : '#35a055';
    g.fillRect(i * 32, 0, 32, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Luces de estudio: key cálida, rim fría (teñida por el tier), fill suave. Sin ambiente alto. */
function addStudioLights(scene, tierColor) {
  const key = new THREE.DirectionalLight(0xfff1de, 2.6);
  key.position.set(2.2, 3, 3);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 2.2);
  rim.position.set(-2.5, 2, -3);
  rim.color.lerp(tierColor, 0.35);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(-3, -0.5, 2.5);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x202530, 0.18);
  scene.add(key, rim, fill, hemi);
  return { key, rim, fill, hemi };
}

function makeRenderer(canvas, antialias = true) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias, alpha: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

const tierOf = (skin) => TIERS[skin.tier ?? skin.rarity] ?? TIERS.common;
const SAFE_INSTANCE = { seed: 0 };

export function createSkinInspector(container, opts = {}) {
  const mode = opts.mode === 'fullscreen' ? 'fullscreen' : 'panel';
  let skin = opts.skin ?? SKINS[0];
  let instance = opts.instance ?? SAFE_INSTANCE;
  let level = QUALITY_LEVELS.includes(opts.quality) ? opts.quality : PREVIEW_QUALITY;
  const autoSpin = !!opts.autoSpin;
  const bare = !!opts.bare;
  const noFloor = !!opts.noFloor; // sin suelo, brillo ni reflejo (la bola flota sola)
  const noEnv = !!opts.noEnv; // sin reflejos del entorno en la bola

  // ---------------------------------------------------------------- DOM
  const root = el('div', `sk-insp sk-${mode}${bare ? ' sk-bare' : ''}`);
  const stage = el('div', 'sk-stage');
  const canvas = el('canvas', 'sk-canvas');
  const hint = el('p', 'sk-hint', 'Arrastra para girar · pellizca o usa la rueda para acercar · doble toque para voltear');
  const tools = el('div', 'sk-tools');
  const btnFx = el('button', 'sk-btn sk-btn-fx', 'Probar efectos');
  btnFx.type = 'button';
  tools.append(btnFx);
  // rejilla 2×2 de «Probar efectos»: solo visible en ese modo; cada celda lleva el nombre de su efecto
  const fxGrid = el('div', 'sk-fx-grid');
  for (const sc of FX_SCENES) fxGrid.append(el('span', 'sk-fx-cap', sc.name));
  stage.append(canvas, fxGrid, hint, tools);
  root.append(stage);
  container.replaceChildren(root);

  // ---------------------------------------------------------------- WebGL
  let renderer;
  try {
    renderer = makeRenderer(canvas, true);
  } catch (err) {
    stage.replaceChildren(el('p', 'sk-hint', 'No se pudo iniciar WebGL en este dispositivo.'));
    return { setSkin(s, i) { skin = s; instance = i ?? SAFE_INSTANCE; }, playFx() { return false; }, destroy() { root.remove(); }, stats: () => ({ webgl: false }) };
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
  const tierColor = new THREE.Color(tierOf(skin).color);
  const lights = addStudioLights(scene, tierColor);

  // bola + reflejo falso (copia espejada bajo el suelo, con un disco degradado encima; solo en Alta)
  let geo = null;
  let handle = null;
  const ball = new THREE.Mesh(undefined, undefined);
  const mirror = new THREE.Group();
  mirror.scale.y = -1;
  mirror.position.y = 2 * FLOOR_Y;
  const mirrorBall = new THREE.Mesh();
  mirror.add(mirrorBall);
  scene.add(ball, mirror);

  const floorTex = radialTexture([[0, 'rgba(11,15,21,0.7)'], [0.4, 'rgba(11,15,21,0.93)'], [0.75, 'rgba(11,15,21,0.5)'], [1, 'rgba(11,15,21,0)']]);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.renderOrder = 1;
  const glowTex = radialTexture([[0, 'rgba(255,255,255,0.9)'], [0.4, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: glowTex, color: tierColor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = FLOOR_Y + 0.002;
  glow.renderOrder = 2;
  scene.add(floor, glow);

  // recursos compartidos de «Probar efectos»: tramo de césped, hoyo y valla (un juego por panel, mismos recursos)
  const fxAssets = {
    stripGeo: new THREE.BoxGeometry(2.3, 0.04, 1.1),
    cupGeo: new THREE.CircleGeometry(0.3, 32),
    wallGeo: new THREE.BoxGeometry(0.1, 0.34, 1.1),
    grassMat: new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 0.95 }),
    cupMat: new THREE.MeshBasicMaterial({ color: 0x05070a }),
    wallMat: new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.7 }),
  };
  let fxPanels = [];

  function buildBall() {
    handle?.dispose();
    geo?.dispose();
    const [w, h] = SPHERE[level] ?? SPHERE.medium;
    geo = new THREE.SphereGeometry(R, w, h);
    handle = createSkinMaterial(skin, { quality: level, instance: { seed: instance.seed }, noEnv });
    ball.geometry = mirrorBall.geometry = geo;
    ball.material = mirrorBall.material = handle.material;
    tierColor.set(tierOf(skin).color);
    root.style.setProperty('--sk-tier', tierOf(skin).color);
    glow.material.color.copy(tierColor);
    lights.rim.color.set(0xbfd8ff).lerp(tierColor, 0.35);
    if (fxMode) buildFxPanels();
  }

  /** Un panel de «Probar efectos»: escena propia (luces, césped, hoyo, valla, bola y partículas). */
  function makeFxPanel(i) {
    const sc = FX_SCENES[i];
    const pScene = new THREE.Scene();
    const pCamera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
    addStudioLights(pScene, tierColor);
    const stage3 = new THREE.Group();
    const strip = new THREE.Mesh(fxAssets.stripGeo, fxAssets.grassMat);
    strip.position.y = FLOOR_Y - 0.02;
    const cup = new THREE.Mesh(fxAssets.cupGeo, fxAssets.cupMat);
    cup.rotation.x = -Math.PI / 2;
    cup.position.set(FX_CUP_X, FLOOR_Y + 0.003, 0);
    const wall = new THREE.Mesh(fxAssets.wallGeo, fxAssets.wallMat);
    wall.position.set(FX_WALL_X, FLOOR_Y + 0.17, 0);
    stage3.add(strip, cup, wall);
    pScene.add(stage3);
    const pBall = new THREE.Mesh(geo, handle.material);
    pScene.add(pBall);
    const pFxGroup = new THREE.Group(); // las partículas viven en unidades de juego
    pFxGroup.scale.setScalar(FX_K);
    pScene.add(pFxGroup);
    return {
      index: i,
      scene: pScene,
      camera: pCamera,
      ball: pBall,
      skinFx: new SkinFX(pFxGroup, skin, { quality: level }),
      matCtx: { speed: 0, impact: 0, state: 0 },
      camLocal: { position: new THREE.Vector3() },
      t: 0,
      prev: 0,
      x: sc.pose(0).x,
      q: new THREE.Quaternion(),
      disposeLocal() {
        this.skinFx.dispose();
      },
    };
  }

  function disposeFxPanels() {
    for (const p of fxPanels) p.disposeLocal();
    fxPanels = [];
  }

  function buildFxPanels() {
    disposeFxPanels();
    fxPanels = FX_SCENES.map((_, i) => makeFxPanel(i));
  }

  // ---------------------------------------------------------------- estado de vista
  const q = new THREE.Quaternion();
  const qTmp = new THREE.Quaternion();
  const qAxis = new THREE.Quaternion();
  const AX = new THREE.Vector3(1, 0, 0);
  const AY = new THREE.Vector3(0, 1, 0);
  const AZ = new THREE.Vector3(0, 0, 1);
  const goodQ = new THREE.Quaternion();
  let vx = 0, vy = 0; // velocidad angular (rad/s)
  let spinMul = 1, spinTarget = 1; // multiplicador del giro automático (setSpin), suavizado; la dirección no cambia
  let zoom = 1;
  let zoomT = 1;
  let baseDist = 3;
  let camY = 0.2, lookY = -0.04;
  let tween = null;
  let time = 0;
  let fxMode = false;
  const matCtx = { speed: 0, impact: 0, state: 0 };

  function computeGoodQ() {
    const gs = skin.goodSide ?? {};
    // el centro del mapa (u = 0.5) queda mirando a cámara
    goodQ.setFromEuler(new THREE.Euler(gs.pitch ?? 0.18, gs.yaw ?? -Math.PI / 2, 0, 'YXZ'));
  }

  function startEntrance() {
    computeGoodQ();
    if (reducedMotion()) {
      q.copy(goodQ);
      tween = null;
      invalidate();
      return;
    }
    tween = { kind: 'enter', t0: time, dur: 1.9 };
    vx = vy = 0;
    invalidate();
  }

  function gotoQ(to, dur = 0.7) {
    tween = { kind: 'goto', t0: time, dur, from: q.clone(), to: to.clone() };
    vx = vy = 0;
    invalidate();
  }

  function stepRotation(dt) {
    if (tween) {
      const u = clamp((time - tween.t0) / tween.dur, 0, 1);
      const e = easeOut(u);
      if (tween.kind === 'enter') {
        qAxis.setFromAxisAngle(AY, (1 - e) * TAU * 2.2);
        q.copy(qAxis).multiply(goodQ);
      } else q.slerpQuaternions(tween.from, tween.to, e);
      if (u >= 1) tween = null;
    } else {
      spinMul += (spinTarget - spinMul) * (1 - Math.exp(-4 * dt)); // cambio de velocidad suave
      const decay = Math.exp(-3.4 * dt);
      vx *= decay;
      vy *= decay;
      if (!dragging && Math.abs(vx) < EPS && Math.abs(vy) < EPS) vx = vy = 0;
      if (!dragging) {
        qTmp.setFromAxisAngle(AY, vy * dt + (autoSpin && !reducedMotion() ? SPIN * spinMul * dt : 0));
        q.premultiply(qTmp);
        qTmp.setFromAxisAngle(AX, vx * dt);
        q.premultiply(qTmp);
      }
    }
    q.normalize();
    ball.quaternion.copy(q);
    mirrorBall.quaternion.copy(q);
  }

  // ---------------------------------------------------------------- entrada táctil/ratón
  const pointers = new Map();
  let dragging = false;
  let pinchDist = 0;
  let lastMoveT = 0;
  let lastTap = 0;
  let tapMoved = false;

  const onDown = (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tween = null;
    if (pointers.size === 1) {
      dragging = true;
      tapMoved = false;
      vx = vy = 0;
      canvas.classList.add('sk-grabbing');
      invalidate();
    } else if (pointers.size === 2) {
      dragging = false;
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onMove = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    invalidate();
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) zoomT = clamp(zoomT * (d / pinchDist), ZOOM_MIN, ZOOM_MAX);
      pinchDist = d;
      tapMoved = true;
      return;
    }
    if (!dragging) return;
    if (Math.abs(dx) + Math.abs(dy) > 2) tapMoved = true;
    const now = performance.now();
    const dtm = Math.max(0.008, (now - lastMoveT) / 1000);
    lastMoveT = now;
    const k = 0.0105;
    qTmp.setFromAxisAngle(AY, dx * k);
    q.premultiply(qTmp);
    qTmp.setFromAxisAngle(AX, dy * k);
    q.premultiply(qTmp);
    vy += (dx * k / dtm - vy) * 0.5;
    vx += (dy * k / dtm - vx) * 0.5;
  };
  const onUp = (e) => {
    const had = pointers.delete(e.pointerId);
    if (!had) return;
    invalidate();
    canvas.releasePointerCapture?.(e.pointerId);
    if (pointers.size === 0) {
      dragging = false;
      canvas.classList.remove('sk-grabbing');
      if (performance.now() - lastMoveT > 90) vx = vy = 0; // soltó parado: sin inercia
      const maxV = 14;
      vx = clamp(vx, -maxV, maxV);
      vy = clamp(vy, -maxV, maxV);
      if (!tapMoved && e.type === 'pointerup') {
        const n = performance.now();
        if (n - lastTap < 320) flip();
        lastTap = n;
      }
    } else if (pointers.size === 1) {
      dragging = true;
      pinchDist = 0;
    }
  };
  const onWheel = (e) => {
    e.preventDefault();
    zoomT = clamp(zoomT * Math.exp(-e.deltaY * 0.0014), ZOOM_MIN, ZOOM_MAX);
    invalidate();
  };
  const onDbl = () => {}; // el doble toque se resuelve en onUp (también en ratón)

  function flip() {
    qAxis.setFromAxisAngle(AY, Math.PI);
    gotoQ(qAxis.clone().multiply(q), 0.6);
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDbl);

  btnFx.addEventListener('click', () => api.playFx(!fxMode));

  // ---------------------------------------------------------------- probar efectos (4 paneles)
  const pPos = new THREE.Vector3();
  const pDir = new THREE.Vector3();
  const pNormal = new THREE.Vector3();
  const pCup = new THREE.Vector3();
  const fxCtx = { pos: pPos, speed: 0, moving: false, camera: null };

  /** Avanza un panel: pose de su efecto, eventos al cruzar su tiempo y bucle. */
  function stepPanel(p, dt) {
    const sc = FX_SCENES[p.index];
    p.prev = p.t;
    p.t += dt;
    if (p.t >= sc.loop) {
      p.t -= sc.loop;
      p.prev = -1;
      p.skinFx.reset();
    }
    const { x, y, s } = sc.pose(p.t);
    const dx = x - p.x;
    p.x = x;
    const k = 1 / FX_K;
    for (const ev of sc.events) {
      if (!(p.prev < ev.t && p.t >= ev.t)) continue;
      if (ev.kind === 'hit') p.skinFx.onHit(ev.power, pPos.set(x * k, 0, 0), pDir.set(ev.dx, 0, 0));
      else if (ev.kind === 'wall') p.skinFx.onWall(ev.power, pPos.set((x + R) * k, 0, 0), pNormal.set(-1, 0, 0));
      else if (ev.kind === 'sink') p.skinFx.onSink(pCup.set(FX_CUP_X * k, FLOOR_Y * k, 0));
    }
    const speedW = dt > 0 ? Math.abs(dx) / dt : 0;
    p.ball.position.set(x, y, 0);
    p.ball.scale.setScalar(Math.max(0.001, s));
    p.ball.visible = s > 0.01;
    if (dx !== 0) {
      qTmp.setFromAxisAngle(AZ, -dx / R);
      p.q.premultiply(qTmp);
    }
    p.q.normalize();
    p.ball.quaternion.copy(p.q);
    const speed = speedW * k;
    pPos.set(x * k, y * k, 0);
    fxCtx.speed = speed;
    fxCtx.moving = speed > 0.3 && s > 0.5;
    fxCtx.camera = p.camLocal;
    p.camLocal.position.copy(p.camera.position).multiplyScalar(k);
    p.skinFx.update(time, dt, fxCtx);
    p.matCtx.speed = Math.min(1, speed / 12);
    p.matCtx.impact = p.skinFx.impact;
  }

  /** Dibuja los 4 paneles en una rejilla 2×2 con viewport y scissor (un solo renderer). */
  function renderFxGrid(dt) {
    const W = renderer.domElement.width, H = renderer.domElement.height;
    const cw = Math.max(1, Math.floor(W / 2)), ch = Math.max(1, Math.floor(H / 2));
    const t = Math.tan((36 * Math.PI) / 360);
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, W, H);
    renderer.setViewport(0, 0, W, H);
    renderer.clear();
    for (const p of fxPanels) {
      stepPanel(p, dt);
      const col = p.index % 2, row = Math.floor(p.index / 2);
      const x = col * cw, y = H - (row + 1) * ch; // origen de GL abajo
      renderer.setViewport(x, y, cw, ch);
      renderer.setScissor(x, y, cw, ch);
      // distancia que encaja la bola y el tramo en la celda (el mismo encuadre para los 4)
      const aspect = cw / ch;
      const d = clamp(1.5 / (t * aspect), 1.6, 9);
      p.camera.aspect = aspect;
      p.camera.position.set(0, d * 0.3, d);
      p.camera.lookAt(0, -0.18, 0);
      p.camera.updateProjectionMatrix();
      handle.update(time, dt, p.matCtx);
      renderer.render(p.scene, p.camera);
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
  }

  // ---------------------------------------------------------------- bucle (bajo demanda)
  let raf = 0;
  let last = 0;
  let intersecting = true;
  let destroyed = false;
  let dirty = true; // hace falta al menos un fotograma más
  let camGoalY = camY, lookGoalY = lookY;
  const visibleNow = () => intersecting && !document.hidden && root.isConnected && !destroyed;
  /** ¿Sigue moviéndose algo? Si no, el bucle se detiene hasta la próxima interacción. */
  const animating = () =>
    (autoSpin && !reducedMotion()) || !!tween || dragging || pointers.size > 0 || fxMode || Math.abs(vx) >= EPS || Math.abs(vy) >= EPS ||
    Math.abs(zoomT - zoom) > 0.001 || Math.abs(camGoalY - camY) > 0.001 || Math.abs(lookGoalY - lookY) > 0.001;
  function invalidate() {
    dirty = true;
    sync();
  }

  function frame(now) {
    raf = 0;
    if (!visibleNow()) return;
    dirty = false;
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    time += dt;
    if (fxMode) {
      renderFxGrid(dt);
    } else {
      matCtx.impact = matCtx.speed = 0;
      stepRotation(dt);
      stepCamera(dt);
      handle.update(time, dt, matCtx);
      renderer.render(scene, camera);
    }
    if (animating() || dirty) raf = requestAnimationFrame(frame);
  }
  function sync() {
    if (visibleNow() && (dirty || animating())) {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function stepCamera(dt) {
    const f = 1 - Math.exp(-8 * dt);
    zoom += (zoomT - zoom) * f;
    const d = baseDist / zoom;
    const targetCamY = d * 0.07;
    const targetLook = -0.04;
    camGoalY = targetCamY;
    lookGoalY = targetLook;
    camY += (targetCamY - camY) * f;
    lookY += (targetLook - lookY) * f;
    camera.position.set(0, camY, d);
    camera.lookAt(0, lookY, 0);
    const show = !noFloor;
    floor.visible = show;
    mirror.visible = show && level === 'high';
    glow.visible = show;
    ball.position.set(0, 0, 0);
    ball.scale.setScalar(1);
    ball.visible = true;
  }

  const resize = () => {
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR[level] ?? 1.5));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const fitBall = (R * 2.2) / (t * Math.min(1, camera.aspect));
    baseDist = clamp(fitBall, 1.6, 9);
    camera.updateProjectionMatrix();
    if (visibleNow() && !raf) renderer.render(scene, camera);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  const io = new IntersectionObserver((entries) => {
    intersecting = entries[entries.length - 1].isIntersecting;
    invalidate();
  });
  io.observe(root);
  const onVis = () => invalidate();
  document.addEventListener('visibilitychange', onVis);

  // ---------------------------------------------------------------- API
  const api = {
    /** Cambia de skin (y opcionalmente de instancia/calidad). Mismo skin+calidad: solo actualiza la semilla. */
    setSkin(next, nextInstance, o = {}) {
      if (destroyed) return;
      const nextLevel = QUALITY_LEVELS.includes(o.quality) ? o.quality : level;
      const same = next.id === skin.id && nextLevel === level;
      skin = next;
      instance = nextInstance ?? SAFE_INSTANCE; // sin instancia explícita, no se arrastra la de la skin anterior
      level = nextLevel;
      if (same) {
        handle.setInstance({ seed: instance.seed });
        invalidate();
        return;
      }
      buildBall();
      startEntrance();
    },
    /** Arranca (o detiene con false) la mini-escena de efectos. Devuelve si queda activa. */
    playFx(on = true) {
      if (destroyed) return false;
      on = !!on;
      if (on === fxMode) return fxMode;
      fxMode = on;
      btnFx.classList.toggle('sk-on', on);
      btnFx.textContent = on ? 'Detener efectos' : 'Probar efectos';
      root.classList.toggle('sk-fxon', on);
      if (on) {
        zoomT = 1;
        buildFxPanels();
      } else {
        disposeFxPanels();
        matCtx.impact = matCtx.speed = 0;
        startEntrance();
      }
      resize();
      sync();
      return fxMode;
    },
    setSpin(m) {
      spinTarget = Math.max(0, m);
    },
    stats() {
      return { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length ?? 0, running: !!raf, fx: fxMode, quality: level };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDbl);
      disposeFxPanels();
      handle.dispose();
      geo.dispose();
      for (const m of [floor, glow]) {
        m.geometry.dispose();
        m.material.map?.dispose();
        m.material.dispose();
      }
      for (const g of Object.values(fxAssets)) {
        if (g.isBufferGeometry) g.dispose();
        else { g.map?.dispose(); g.dispose(); }
      }
      renderer.dispose();
      renderer.forceContextLoss();
      root.remove();
    },
  };

  buildBall();
  startEntrance();
  resize();
  sync();
  return api;
}

// ======================================================================= Skin Lab (?skinlab=1)

export const isSkinLabRequested = () => {
  try {
    return new URLSearchParams(location.search).get('skinlab') === '1';
  } catch {
    return false;
  }
};

/** Miniaturas 3D con un único renderer compartido (rejilla del laboratorio). */
function createThumbRenderer(size = 144) {
  const canvas = document.createElement('canvas');
  const renderer = makeRenderer(canvas);
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 0.1, 2.9);
  camera.lookAt(0, 0, 0);
  addStudioLights(scene, new THREE.Color('#ffffff'));
  const geo = new THREE.SphereGeometry(R, 64, 48);
  const mesh = new THREE.Mesh(geo);
  mesh.quaternion.setFromEuler(new THREE.Euler(0.18, -Math.PI / 2, 0, 'YXZ'));
  scene.add(mesh);
  return {
    render(skin, inst, quality) {
      const h = createSkinMaterial(skin, { quality, instance: { seed: inst.seed } });
      mesh.material = h.material;
      h.update(1.2, 0.016, { speed: 0, impact: 0, state: 0 });
      renderer.render(scene, camera);
      const url = canvas.toDataURL('image/png');
      h.dispose();
      return url;
    },
    dispose() {
      geo.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/**
 * Laboratorio de skins para el revisor: rejilla de todas las skins (miniaturas 3D reales) con
 * sliders de semilla y calidad, y un inspector grande. Devuelve `{ destroy }`.
 */
export function mountSkinLab(container) {
  const state = { id: SKINS[0].id, seed: 123, quality: getQuality() };
  const instFor = () => ({ seed: state.seed });
  const skinNow = () => SKINS.find((s) => s.id === state.id) ?? SKINS[0];

  const root = el('div', 'sk-lab');
  const bar = el('div', 'sk-lab-bar');
  const mk = (label, input) => {
    const l = el('label', 'sk-lab-ctl');
    const v = el('output');
    l.append(el('span', '', label), input, v);
    return { l, v };
  };
  const sIn = el('input');
  Object.assign(sIn, { type: 'range', min: 0, max: 999, step: 1, value: state.seed });
  const qIn = el('select');
  for (const id of QUALITY_LEVELS) {
    const o = el('option', '', QUALITY_NAMES[id]);
    o.value = id;
    qIn.append(o);
  }
  qIn.value = state.quality;
  const S = mk('Patrón', sIn), Q = mk('Calidad', qIn);
  const showVals = () => {
    S.v.textContent = `#${state.seed}`;
    Q.v.textContent = '';
  };
  bar.append(S.l, Q.l);
  const grid = el('div', 'sk-lab-grid');
  const main = el('div', 'sk-lab-main');
  root.append(bar, el('div', 'sk-lab-split'));
  root.lastChild.append(grid, main);
  container.replaceChildren(root);

  let thumbs = null;
  try {
    thumbs = createThumbRenderer();
  } catch {
    thumbs = null;
  }
  const cells = new Map();
  for (const s of SKINS) {
    const b = el('button', 'sk-lab-cell');
    b.type = 'button';
    b.style.setProperty('--sk-tier', tierOf(s).color);
    const img = el('img');
    img.alt = s.name;
    img.width = img.height = 72;
    b.append(img, el('small', '', s.name));
    b.addEventListener('click', () => select(s.id));
    grid.append(b);
    cells.set(s.id, { b, img });
  }

  const inspector = createSkinInspector(main, { skin: skinNow(), instance: instFor(), mode: 'panel', quality: state.quality, noEnv: true });
  function select(id) {
    state.id = id;
    for (const [k, c] of cells) c.b.classList.toggle('sk-sel', k === id);
    inspector.setSkin(skinNow(), instFor(), { quality: state.quality });
  }

  let queue = [];
  let timer = 0;
  let idle = 0;
  const pump = () => {
    idle = 0;
    const s = queue.shift();
    if (!s) return;
    const c = cells.get(s.id);
    try {
      c.img.src = thumbs.render(s, instFor(), state.quality);
    } catch {}
    if (queue.length) idle = requestAnimationFrame(pump);
  };
  const refreshThumbs = () => {
    if (!thumbs) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      cancelAnimationFrame(idle);
      queue = [...SKINS];
      idle = requestAnimationFrame(pump);
    }, 220);
  };
  const onChange = () => {
    state.seed = Number(sIn.value);
    state.quality = qIn.value;
    showVals();
    inspector.setSkin(skinNow(), instFor(), { quality: state.quality });
    refreshThumbs();
  };
  sIn.addEventListener('input', onChange);
  qIn.addEventListener('change', onChange);
  showVals();
  select(state.id);
  refreshThumbs();

  return {
    inspector,
    destroy() {
      clearTimeout(timer);
      cancelAnimationFrame(idle);
      inspector.destroy();
      thumbs?.dispose();
      root.remove();
    },
  };
}
