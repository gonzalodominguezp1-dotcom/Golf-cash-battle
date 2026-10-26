import * as THREE from 'three';
import './skinInspector.css';
import { createSkinMaterial } from '../game/render/ballSkins.js';
import { SkinFX } from '../game/render/skins/skinFx.js';
import { BALL_R } from '../game/physics.js';
import { QUALITY_LEVELS, QUALITY_NAMES, getQuality } from '../game/render/quality.js';
import { SKINS, TIERS } from '../progress/skins.js';
import { rarePatternOf } from '../progress/inventory.js';

// Inspector 360° de skins v2 (docs/skins-premium-plan.md, (c), (e) y P8).
//   createSkinInspector(container, { skin, instance, mode: 'panel'|'fullscreen', quality? })
//     -> { setSkin(skin, instance?, { quality }?), playFx(on?), destroy(), ... }
// Un único WebGLRenderer por inspector. Render bajo demanda: solo hay bucle mientras hay interacción o
// una animación en curso (entrada, giro con inercia, zoom, barrido, efectos); en reposo no se dibuja nada.
// Pixel ratio ≤ 1,5 (1 en Baja), reflejo de suelo solo en Alta, pausa si no es visible y en destroy()
// se libera todo (dispose + forceContextLoss). Este módulo se carga con import() al abrir el visor.

const TAU = Math.PI * 2;
const R = 0.38; // radio de la bola en la escena del inspector
const FLOOR_Y = -R - 0.02;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2;
const FX_K = R / BALL_R; // unidades de juego -> unidades del inspector
const SPHERE = { low: [32, 20], medium: [48, 32], high: [64, 48] };
const MAX_DPR = { low: 1, medium: 1.5, high: 1.5 };
const EPS = 0.02; // rad/s de inercia por debajo de los cuales la bola se considera parada
const FX_LOOP = 6;

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
const SAFE_INSTANCE = { seed: 0, counter: { enabled: false, aces: 0, sinks: 0, birdies: 0 } };

export function createSkinInspector(container, opts = {}) {
  const mode = opts.mode === 'fullscreen' ? 'fullscreen' : 'panel';
  let skin = opts.skin ?? SKINS[0];
  let instance = opts.instance ?? SAFE_INSTANCE;
  let level = QUALITY_LEVELS.includes(opts.quality) ? opts.quality : getQuality();

  // ---------------------------------------------------------------- DOM
  const root = el('div', `sk-insp sk-${mode}`);
  const stage = el('div', 'sk-stage');
  const canvas = el('canvas', 'sk-canvas');
  const hint = el('p', 'sk-hint', 'Arrastra para girar · pellizca o usa la rueda para acercar · doble toque para voltear');
  const tools = el('div', 'sk-tools');
  const btnGood = el('button', 'sk-btn', 'Lado bueno');
  const btnSweep = el('button', 'sk-btn', 'Barrido de luz');
  const btnFx = el('button', 'sk-btn sk-btn-fx', 'Probar efectos');
  for (const b of [btnGood, btnSweep, btnFx]) b.type = 'button';
  tools.append(btnGood, btnSweep, btnFx);
  stage.append(canvas, hint, tools);
  const sheet = el('aside', 'sk-sheet');
  const grab = el('button', 'sk-grab');
  grab.type = 'button';
  grab.setAttribute('aria-label', 'Mostrar u ocultar datos');
  sheet.append(grab);
  const body = el('div', 'sk-sheet-body');
  sheet.append(body);
  root.append(stage, sheet);
  container.replaceChildren(root);

  // ---------------------------------------------------------------- WebGL
  let renderer;
  try {
    renderer = makeRenderer(canvas, level !== 'low');
  } catch (err) {
    stage.replaceChildren(el('p', 'sk-hint', 'No se pudo iniciar WebGL en este dispositivo.'));
    renderPanel();
    return { setSkin(s, i) { skin = s; instance = i ?? instance; renderPanel(); }, playFx() { return false; }, destroy() { root.remove(); }, stats: () => ({ webgl: false }) };
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

  // escena de «Probar efectos»: tramo de césped, hoyo y valla
  const fxStage = new THREE.Group();
  fxStage.visible = false;
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 0.95 });
  const strip = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.04, 1.1), grassMat);
  strip.position.y = FLOOR_Y - 0.02;
  const cupMat = new THREE.MeshBasicMaterial({ color: 0x05070a });
  const cup = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), cupMat);
  cup.rotation.x = -Math.PI / 2;
  const FX_CUP_X = -0.1;
  cup.position.set(FX_CUP_X, FLOOR_Y + 0.003, 0);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.7 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 1.1), wallMat);
  wall.position.set(1.0, FLOOR_Y + 0.17, 0);
  fxStage.add(strip, cup, wall);
  scene.add(fxStage);
  const fxGroup = new THREE.Group(); // las partículas viven en unidades de juego
  fxGroup.scale.setScalar(FX_K);
  scene.add(fxGroup);

  function buildBall() {
    handle?.dispose();
    geo?.dispose();
    const [w, h] = SPHERE[level] ?? SPHERE.medium;
    geo = new THREE.SphereGeometry(R, w, h);
    handle = createSkinMaterial(skin, { quality: level, instance: { seed: instance.seed } });
    ball.geometry = mirrorBall.geometry = geo;
    ball.material = mirrorBall.material = handle.material;
    tierColor.set(tierOf(skin).color);
    glow.material.color.copy(tierColor);
    lights.rim.color.set(0xbfd8ff).lerp(tierColor, 0.35);
    skinFx?.dispose();
    skinFx = null;
    if (fxMode) startFx();
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
  let zoom = 1;
  let zoomT = 1;
  let baseDist = 3;
  let camY = 0.2, lookY = -0.04;
  let tween = null;
  let time = 0;
  let sweep = -1;
  let fxMode = false;
  let skinFx = null;
  let fxT = 0;
  let fxPrev = 0;
  let fxX = -0.8;

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
      const decay = Math.exp(-3.4 * dt);
      vx *= decay;
      vy *= decay;
      if (!dragging && Math.abs(vx) < EPS && Math.abs(vy) < EPS) vx = vy = 0;
      if (!dragging) {
        qTmp.setFromAxisAngle(AY, vy * dt);
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

  // ---------------------------------------------------------------- barrido de luz
  btnGood.addEventListener('click', () => {
    computeGoodQ();
    zoomT = 1;
    gotoQ(goodQ, 0.8);
  });
  btnSweep.addEventListener('click', () => {
    sweep = 0;
    btnSweep.classList.add('sk-on');
    invalidate();
  });
  btnFx.addEventListener('click', () => api.playFx(!fxMode));

  const KEY_BASE = new THREE.Vector3(2.2, 3, 3);
  function stepSweep(dt) {
    if (sweep < 0) return;
    sweep += dt / 3;
    const a = easeOut(Math.min(1, sweep)) * TAU;
    const m = handle.material;
    if (m.envMapRotation) m.envMapRotation.y = a;
    lights.key.position.set(KEY_BASE.x * Math.cos(a) + KEY_BASE.z * Math.sin(a), KEY_BASE.y, -KEY_BASE.x * Math.sin(a) + KEY_BASE.z * Math.cos(a));
    if (sweep >= 1) {
      sweep = -1;
      if (m.envMapRotation) m.envMapRotation.y = 0;
      lights.key.position.copy(KEY_BASE);
      btnSweep.classList.remove('sk-on');
    }
  }

  // ---------------------------------------------------------------- probar efectos
  const pPos = new THREE.Vector3();
  const pDir = new THREE.Vector3();
  const pNormal = new THREE.Vector3();
  const pCup = new THREE.Vector3();
  const camLocal = { position: new THREE.Vector3() };
  const fxCtx = { pos: pPos, speed: 0, moving: false, camera: camLocal };
  const matCtx = { speed: 0, impact: 0, state: 0 };

  function startFx() {
    if (skinFx) return;
    skinFx = new SkinFX(fxGroup, skin, { quality: level });
    fxT = 0;
    fxPrev = 0;
  }

  /** Posición de la bola en la secuencia: golpe -> rodada -> choque -> rebote -> golpe -> embocada. */
  function stepFx(dt) {
    fxPrev = fxT;
    fxT += dt;
    if (fxT >= FX_LOOP) {
      fxT -= FX_LOOP;
      fxPrev = -1;
      skinFx.reset();
    }
    const t = fxT;
    const crossed = (tt) => fxPrev < tt && t >= tt;
    const X0 = -0.8, XW = 0.57;
    let x, y = 0, s = 1;
    if (t < 0.3) x = X0;
    else if (t < 1.35) x = X0 + (XW - X0) * easeOut((t - 0.3) / 1.05);
    else if (t < 1.9) x = XW + (0.4 - XW) * easeOut((t - 1.35) / 0.55);
    else if (t < 2.4) x = 0.4;
    else if (t < 3.3) x = 0.4 + (FX_CUP_X - 0.4) * easeOut((t - 2.4) / 0.9);
    else {
      x = FX_CUP_X;
      const u = clamp((t - 3.3) / 0.3, 0, 1);
      y = -0.45 * u;
      s = 1 - u;
    }
    const dx = x - fxX;
    fxX = x;
    const speedW = dt > 0 ? Math.abs(dx) / dt : 0;
    ball.position.set(x, y, 0);
    ball.scale.setScalar(Math.max(0.001, s));
    if (dx !== 0) {
      qTmp.setFromAxisAngle(AZ, -dx / R);
      q.premultiply(qTmp);
    }
    const k = 1 / FX_K;
    pPos.set(x * k, y * k, 0);
    if (crossed(0.3)) skinFx.onHit(0.9, pPos, pDir.set(1, 0, 0));
    if (crossed(1.35)) skinFx.onWall(0.8, pPos.set((x + R) * k, 0, 0), pNormal.set(-1, 0, 0));
    if (crossed(2.4)) skinFx.onHit(0.35, pPos.set(x * k, 0, 0), pDir.set(-1, 0, 0));
    if (crossed(3.3)) skinFx.onSink(pCup.set(FX_CUP_X * k, FLOOR_Y * k, 0));
    pPos.set(x * k, y * k, 0);
    const speed = speedW * k;
    fxCtx.speed = speed;
    fxCtx.moving = speed > 0.3 && s > 0.5;
    camLocal.position.copy(camera.position).multiplyScalar(k);
    skinFx.update(time, dt, fxCtx);
    matCtx.speed = Math.min(1, speed / 12);
    matCtx.impact = skinFx.impact;
    ball.visible = s > 0.01;
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
    !!tween || dragging || pointers.size > 0 || fxMode || sweep >= 0 || Math.abs(vx) >= EPS || Math.abs(vy) >= EPS ||
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
    if (fxMode && skinFx) stepFx(dt);
    else matCtx.impact = matCtx.speed = 0;
    stepRotation(dt);
    stepSweep(dt);
    stepCamera(dt);
    handle.update(time, dt, matCtx);
    renderer.render(scene, camera);
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
    const targetCamY = fxMode ? d * 0.3 : d * 0.07;
    const targetLook = fxMode ? -0.18 : -0.04;
    camGoalY = targetCamY;
    lookGoalY = targetLook;
    camY += (targetCamY - camY) * f;
    lookY += (targetLook - lookY) * f;
    camera.position.set(0, camY, d);
    camera.lookAt(0, lookY, 0);
    const show = !fxMode;
    floor.visible = show;
    mirror.visible = show && level === 'high';
    glow.visible = show;
    fxStage.visible = fxMode;
    if (!fxMode) {
      ball.position.set(0, 0, 0);
      ball.scale.setScalar(1);
      ball.visible = true;
    }
  }

  const resize = () => {
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR[level] ?? 1.5));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const fitBall = (R * 2.2) / (t * Math.min(1, camera.aspect));
    const fitFx = 1.5 / (t * camera.aspect);
    baseDist = clamp(fxMode ? Math.max(fitBall, fitFx) : fitBall, 1.6, 9);
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

  grab.addEventListener('click', () => root.classList.toggle('sk-open'));

  // ---------------------------------------------------------------- panel de datos
  function renderPanel() {
    const tier = tierOf(skin);
    const inst = instance ?? SAFE_INSTANCE;
    const rare = rarePatternOf(skin, inst.seed);
    root.style.setProperty('--sk-tier', tier.color);
    body.replaceChildren();

    const head = el('div', 'sk-head');
    const chip = el('span', 'sk-tier', `${tier.icon} ${tier.name}`);
    head.append(chip);
    if (skin.collection && skin.collection !== 'clasica') head.append(el('span', 'sk-coll', skin.collection));
    body.append(head, el('h3', 'sk-name', skin.name));

    const pat = el('div', 'sk-row sk-block');
    pat.append(el('span', 'sk-label', 'Patrón'), el('strong', 'sk-mono', `#${inst.seed ?? 0}`));
    if (rare) pat.append(el('span', 'sk-rare', rare.name));
    body.append(pat);

    if (inst.counter?.enabled) {
      const lcd = el('div', 'sk-lcd');
      for (const [label, v] of [['Hoyos en uno', inst.counter.aces], ['Embocadas', inst.counter.sinks], ['Birdies', inst.counter.birdies]]) {
        const cell = el('div', 'sk-lcd-cell');
        cell.append(el('b', '', String(v ?? 0).padStart(4, '0')), el('small', '', label));
        lcd.append(cell);
      }
      body.append(el('span', 'sk-label', 'Marcador'), lcd);
    }
    if (inst.unlockedAt) {
      const d = new Date(inst.unlockedAt);
      if (!Number.isNaN(d.getTime()) && d.getTime() > 1e10) {
        const r = el('div', 'sk-row sk-block');
        r.append(el('span', 'sk-label', 'Desbloqueada'), el('span', '', d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })));
        body.append(r);
      }
    }
    if (skin.lore) body.append(el('p', 'sk-lore', `“${skin.lore}”`));
  }

  // ---------------------------------------------------------------- API
  const api = {
    /** Cambia de skin (y opcionalmente de instancia/calidad). Mismo skin+calidad: solo actualiza la semilla. */
    setSkin(next, nextInstance, o = {}) {
      if (destroyed) return;
      const nextLevel = QUALITY_LEVELS.includes(o.quality) ? o.quality : level;
      const same = next.id === skin.id && nextLevel === level;
      skin = next;
      if (nextInstance) instance = nextInstance;
      level = nextLevel;
      renderPanel();
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
      if (on) {
        startFx();
        fxX = -0.8;
        zoomT = 1;
      } else {
        skinFx?.dispose();
        skinFx = null;
        matCtx.impact = matCtx.speed = 0;
        startEntrance();
      }
      resize();
      sync();
      return fxMode;
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
      skinFx?.dispose();
      skinFx = null;
      handle.dispose();
      geo.dispose();
      for (const m of [floor, glow, strip, cup, wall]) {
        m.geometry.dispose();
        m.material.map?.dispose();
        m.material.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
      root.remove();
    },
  };

  renderPanel();
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
  const instFor = () => ({ seed: state.seed, counter: { enabled: true, aces: 2, sinks: 47, birdies: 12 }, unlockedAt: '2026-01-15T10:00:00Z' });
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

  const inspector = createSkinInspector(main, { skin: skinNow(), instance: instFor(), mode: 'panel', quality: state.quality });
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
