import * as THREE from 'three';
import { BALL_R, CUP_R, DT, MAX_SHOT_SPEED, inSand, isMoving, onBoost, quantizeShot, segmentsOf, shotVelocity, spinnerSegment, step, tubeTable } from './physics.js';
import { Bot } from './bots.js';
import { RemoteBall } from './remoteBall.js';
import { THEMES } from './themes.js';
import { buildEnvironment, courseBounds } from './render/environment.js';
import { buildCourse } from './render/course.js';
import { createCyberFx } from './render/cyberpunkFx.js';
import { ballPose, groundHeight } from './render/terrain.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { IS_TOUCH, getQuality, quality } from './render/quality.js';
import { inputFactors, settings } from '../settings/settings.js';
import { PerfGovernor } from './render/perfGovernor.js';
import { ResolutionGovernor } from './render/resolutionGovernor.js';
import { AimDots, Particles, Shockwaves } from './render/effects.js';
import { labelTexture, softDotTexture } from './render/textures.js';
import { attachSkinDecor, createSkinMaterial } from './render/ballSkins.js';
import { SkinFX } from './render/skins/skinFx.js';
import { SKINS } from '../progress/skins.js';
import { HOLE_TIME_LIMIT, maxStrokesOf } from '../config.js';
import { PERF, perf } from './perfProbe.js';
import { INTRO_SKIP } from './loadingFlags.js';
import { introSkipAction } from './introSkip.js';
import { chunk, collectTextures, keyOf, runSteps, withCap, yieldToMain } from './warmupRules.js';
import { collectSceneResources, disposeSceneResources } from './render/sceneDisposal.js';
import { setWindField } from './render/assets/wind.js';
import { setAmbient, setCharge, setRolling, sfx, stopAmbient, stopRolling, unlockAudio } from './audio.js';

// Interruptor de rollback: false devuelve la carga anterior (compileAsync sin esperar y bucle directo).
export const WARM_GPU = true;
const WARM_CAP_MS = 6000;
const INTRO_SECONDS = 2.2;
const FOLLOW_DIST = 3.2;
const FOLLOW_HEIGHT = 1.45;
const LOOK_AHEAD = 2.2;
const SLOWMO = 0.35; // cámara lenta cuando la bola va a entrar
const BALL_TOUCH_PX = 56; // radio mínimo en pantalla para coger la bola con el dedo

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const forwardOf = (yaw) => new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
// una skin al azar por rival; no se repite hasta agotar el catálogo
const pickRandomSkins = (n) => {
  const pool = [];
  return Array.from({ length: n }, () => {
    if (!pool.length) pool.push(...SKINS);
    return pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  });
};
// zona de ráfagas del viento compartido para un hoyo (la misma cuenta que buildEnvironment)
const windFieldOf = (b) => ({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, radius: Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 40 });
// lo que el tema cambia en el material de la bola (estudio claro u oscuro y su tinte; ver skinMaterial.js)
const ballLook = (theme) => {
  const dark = !!theme && !!(theme.dark || theme.neon || theme.lava || (theme.sunIntensity !== undefined && theme.sunIntensity < 2));
  return `${dark}|${String(theme?.rim ?? '')}`;
};
// trabajo que no debe sumarse a la tarea del intercambio de escenas
const whenIdle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 0));

/**
 * Hoyo en 3D con cámara en tercera persona detrás de la bola.
 * Controles táctiles: deslizar en cualquier parte mueve la cámara (y con ella
 * hacia dónde apuntas); solo arrastrando desde la bola se carga el tiro: a
 * los lados afina la dirección, hacia abajo la potencia; suelta para golpear.
 *
 * Contador: cuando el primero emboca (tú, un rival o, en torneos, el mejor
 * tiempo del hoyo que manda el servidor) quedan HOLE_TIME_LIMIT segundos.
 */
export class GolfGame {
  #onContextMenu = null;
  #onPointerDown = null;
  #skipClick = false;
  #onPointerMove = null;
  #onPointerUp = null;
  #onPointerCancel = null;
  #onWheel = null;
  #onKeyDown = null;
  #onKeyUp = null;
  #onPointerLockChange = null;
  #onPointerLockError = null;
  #onClickCanvas = null;
  #onBlur = null;
  #loadToken = 0;
  ready = Promise.resolve();
  // vectores reutilizados por los efectos de skin (sin asignar en cada golpe o choque)
  #fxPos = new THREE.Vector3();
  #fxDir = new THREE.Vector3();
  #fxCup = new THREE.Vector3();
  #fxNormal = new THREE.Vector3();
  #axis = new THREE.Vector3();
  #pos = new THREE.Vector3();
  #aimColor = new THREE.Color();
  #cupV = new THREE.Vector3();

  #inputBound = false;
  /** F3: escena del hoyo siguiente preparada con prepareNext() ({ scene, env, courseView, cyberFx, course, theme, bounds, statics, key, ... }). */
  #next = null;
  /** Hijos de la escena activa que son del hoyo (entorno y pista); el resto (bola y efectos) pasa a la escena siguiente. */
  #statics = null;
  /** Ya arrancó un hoyo (load): el siguiente load reutiliza el renderer. */
  #played = false;
  /** Clave del hoyo preparado con prepare() (keyOf): load() con la misma clave toma el camino rápido. */
  preparedKey = null;
  /** Contenedor oculto de la preparación (lo pone el preloader); attach() lo quita. */
  holder = null;

  constructor(container, handlers = {}) {
    this.container = container;
    this.setHandlers(handlers);
    // en Bajo, sin antialias: en un móvil modesto cada píxel cuenta
    // el antialias se elige al crear el contexto: con otro, la pantalla siguiente no reutiliza este juego (F3)
    this.antialias = getQuality() !== 'low';
    this.renderer = new THREE.WebGLRenderer({ antialias: this.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality().pixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = quality().softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    // la sombra solo se vuelve a dibujar cuando algo cambia (ver #updateShadows)
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    if (PERF) {
      perf.setRenderer(this.renderer);
      perf.mark('ctx:create');
      perf.count('contextos_creados');
      this.renderer.domElement.addEventListener('webglcontextlost', () => { perf.mark('ctx:lost'); perf.count('contextos_perdidos'); });
    }
    // contexto perdido (móvil sin memoria): three lo recupera solo, como antes; lo preparado del hoyo siguiente no vale
    // y el reflejo PMREM (una imagen dibujada en la GPU) se vuelve a generar en el hoyo siguiente
    this.renderer.domElement.addEventListener('webglcontextlost', () => { if (!this.disposed) this.cancelNext(); });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      if (this.disposed) return;
      this.envMap = null;
      this.renderer.shadowMap.needsUpdate = true;
    });
    // indicador del hoyo: se ve a través de las paredes y, si queda fuera de pantalla, apunta hacia él
    this.cupMarker = document.createElement('div');
    this.cupMarker.className = 'cup-marker';
    this.cupMarker.hidden = true;
    this.cupMarker.innerHTML = '<i class="cup-arrow"></i><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1v14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4.9 1.6 13 4.6 4.9 7.6z" fill="#ff4d4d"/></svg>';
    container.appendChild(this.cupMarker);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 400);
    // resplandor (bloom): limitado estrictamente a un máximo del 15% (0.15)
    this.#makeComposer(quality().msaa);
    // resolución dinámica: baja los píxeles si el móvil no llega y los sube cuando sobra
    this.resGov = new ResolutionGovernor({ min: 1, max: 1, apply: (pr) => this.#setPixelRatio(pr) });
    this.clock = new THREE.Clock();
    this.acc = 0;
    this.t = 0;
    this.running = false;
    this.paused = false;
    this.overview = false;
    this.overviewYaw = 0;
    this.overviewPitch = 0.85;
    this.zoomLevel = 1.0;
    this.orbitYaw = 0;
    this.orbiting = false;
    this.isPointerLocked = false;
    this.charging = false;
    this.chargeAnchor = null;
    this.mouseTurns = 0;
    this.chargeStartTick = 0;
    this.aimStartTick = 0;
    this.lastMouseX = null;
    this.lastMouseTick = 0;
    // gobernador de los FX de skin: baja el nivel si el frame va lento (no toca física ni calidad global)
    this.perf = new PerfGovernor({
      getSkinFx: () => this.skinFx,
      busy: () => !!this.ball && isMoving(this.ball),
    });
    // la entrada (Esc, Espacio, puntero) se enlaza al arrancar el hoyo (#ensureInput en load):
    // un juego preparado oculto durante la sala no debe robar teclas
    // ?perf=1: expone el juego para medir (pruebas de rendimiento)
    try {
      if (new URLSearchParams(location.search).get('perf') === '1') window.__golf = this;
    } catch {}
    this.resizeObserver = new ResizeObserver(() => this.#resize());
    this.resizeObserver.observe(container);
  }

  /**
   * firstSunkTick: en torneos, el paso en el que embocó el más rápido de los
   * que ya han jugado este hoyo (arranca el contador desde ese momento).
   */
  load(course, { bots = [], skin = SKINS[0], instance = null, firstSunkTick = null, timeLimit = HOLE_TIME_LIMIT, live = false } = {}) {
    if (PERF) { perf.mark('load:start'); this.perfFirst = true; this.perfPlayable = true; }
    // renderer reutilizado (F3): el sonido del hoyo anterior se corta como al liberar el juego
    if (this.#played) {
      setCharge(0);
      stopAmbient();
      stopRolling();
    }
    const fast = this.preparedKey != null && this.preparedKey === keyOf(course, skin, instance, getQuality());
    this.preparedKey = null; // una preparación vale para un solo arranque
    // F3: hoyo siguiente preparado con la misma clave (hoyo, skin, acabado y calidad) → intercambio de escenas
    const next = this.#takeNext(fast ? null : keyOf(course, skin, instance, getQuality()));
    this.botPlayers = bots;
    // en vivo: los rivales siguen jugando cuando terminas, los bots empiezan en un paso fijo
    // (todos los móviles ven lo mismo) y solo los jugadores reales arrancan el contador
    this.live = live;
    this.botStartTick = live ? Math.round(INTRO_SECONDS / DT) : null;
    if (fast) {
      // camino rápido: entorno, pista, bola, réplicas y shaders ya están (prepare); solo falta el estado de juego
      if (PERF) perf.mark('load:fast');
      this.#resetPlayState(course, firstSunkTick, timeLimit);
      this.#buildBots();
      this.#prevPose.ok = false;
      this.#shadowAt.x = NaN;
      this.perf.reset();
      this.#resize();
      this.intro = 0;
      this.#ensureInput();
      this.#placeCamera(1, true);
      if (PERF) perf.mark('load:end');
      ++this.#loadToken; // nada de una carga anterior en vuelo toca este arranque
      this.renderer.domElement.style.visibility = '';
      this.ready = Promise.resolve();
      this.#played = true;
      if (!this.running) this.#startLoop();
      return;
    }
    if (next) {
      // intercambio (F3): la escena preparada pasa a activa con la bola y sus efectos; el bucle no se para
      if (PERF) perf.mark('swap:start', { next: course.name });
      this.#swapStage(next);
      this.#resetPlayState(course, firstSunkTick, timeLimit);
      this.#resetFx();
      this.#buildBots();
      this.#prevPose.ok = false;
      this.#shadowAt.x = NaN;
      this.perf.reset();
      this.#resize();
      this.intro = 0;
      this.#ensureInput();
      this.#placeCamera(1, true);
      this.renderer.shadowMap.needsUpdate = true;
      ++this.#loadToken;
      this.renderer.domElement.style.visibility = '';
      this.ready = Promise.resolve();
      this.#played = true;
      if (PERF) { perf.mark('swap:end'); perf.mark('load:end'); }
      if (!this.running) this.#startLoop();
      return;
    }
    this.#played = true;
    this.#applyCourseVisuals(course, skin, instance);
    this.#resetPlayState(course, firstSunkTick, timeLimit);
    this.#buildScene();
    this.#prevPose.ok = false;
    this.#shadowAt.x = NaN;
    this.perf.reset();
    this.#resize();
    this.intro = 0;
    this.#ensureInput();
    this.#placeCamera(1, true);
    if (PERF) perf.mark('load:end');
    if (!WARM_GPU) {
      if (!this.running) this.#startLoop();
      return;
    }
    // calienta la GPU con la canvas oculta y arranca el bucle (y con él la intro) al tener imagen
    const token = ++this.#loadToken;
    if (this.running) {
      this.running = false;
      this.renderer.setAnimationLoop(null);
    }
    const canvas = this.renderer.domElement;
    canvas.style.visibility = 'hidden';
    const sig = { cancelled: false };
    this.ready = withCap(this.#warmGpu(token, sig), WARM_CAP_MS)
      .then((r) => { if (!r.ok) sig.cancelled = true; })
      .catch(() => { sig.cancelled = true; })
      .finally(() => {
        if (this.disposed || token !== this.#loadToken) return;
        canvas.style.visibility = '';
        if (!this.running) this.#startLoop();
      });
  }

  /** Asigna los avisos a la interfaz (on*). Un juego preparado se crea sin ellos y los recibe al mostrarse. */
  setHandlers({ onStroke, onSunk, onAim, onRest, onCup, onRival, onLip, onLava, onWater, onOut, onFall, onOpenSettings, onOverviewChange, onTimer, onTimeUp } = {}) {
    this.onLava = onLava;
    this.onFall = onFall;
    this.onTimer = onTimer;
    this.onTimeUp = onTimeUp;
    this.onStroke = onStroke;
    this.onSunk = onSunk;
    this.onAim = onAim;
    this.onRest = onRest;
    this.onCup = onCup;
    this.onRival = onRival;
    this.onLip = onLip;
    this.onWater = onWater;
    this.onOut = onOut;
    this.onOpenSettings = onOpenSettings;
    this.onOverviewChange = onOverviewChange;
  }

  /** Pasa la canvas (y la marca del hoyo) a otro contenedor. Mover la canvas en el DOM no pierde el contexto. */
  attach(container) {
    if (!container || container === this.container) return;
    const prev = this.container;
    container.appendChild(this.renderer.domElement);
    container.appendChild(this.cupMarker);
    this.resizeObserver.disconnect();
    this.resizeObserver.observe(container);
    this.container = container;
    if (this.holder && prev === this.holder) {
      this.holder.remove();
      this.holder = null;
    }
    this.#resize();
  }

  /**
   * F3: suelta la canvas (y la marca del hoyo) de su contenedor sin liberar nada, antes de que la pantalla se vacíe
   * entre hoyos. attach() la pone en la pantalla nueva. Mover la canvas en el DOM no pierde el contexto.
   */
  detach() {
    this.resizeObserver.disconnect();
    this.exitPointerLock();
    this.renderer.domElement.remove();
    this.cupMarker?.remove();
  }

  /** Enlaza la entrada una sola vez por instancia, al arrancar el hoyo. */
  #ensureInput() {
    if (this.#inputBound) return;
    this.#inputBound = true;
    this.#bindInput();
  }

  /**
   * Prepara un hoyo sin arrancarlo (F2, durante la sala): curso, tema, calidad, escena, bola, réplicas
   * (skins elegidas aquí) y GPU caliente con un frame dibujado. Sin estado de juego: ni tick, ni bola de
   * física, ni golpes, ni bots, ni bucle, ni audio. load() con la misma clave arranca en el camino rápido.
   * Resuelve true si quedó listo, false si se canceló. Un error se propaga.
   */
  async prepare(course, { skin = SKINS[0], instance = null, ghosts = 0, signal = null, onProgress, onStep } = {}) {
    const token = ++this.#loadToken;
    // cancelado desde fuera, liberado o reemplazado por otra carga
    const stale = () => !!signal?.cancelled || this.disposed || token !== this.#loadToken;
    const live = { get cancelled() { return stale(); } };
    const quality = getQuality();
    this.preparedKey = null;
    this.renderer.domElement.style.visibility = 'hidden';
    // el preloader deja la marca warm:step:<nombre> con onStep
    const named = (name, fn) => async () => { onStep?.(name); await fn(); };
    let probes = [];
    const steps = [
      named('visuals', () => this.#applyCourseVisuals(course, skin, instance)),
      named('static', () => this.#buildStatic()),
      named('ball', () => {
        this.#buildBall();
        if (PERF) perf.mark('ball:end');
      }),
      named('ghosts', () => { probes = this.#prepareGhosts(ghosts); }),
      named('gpu', async () => {
        this.#resize();
        this.#placePreviewCamera();
        if (WARM_GPU) await withCap(this.#warmGpu(token, live, { prepared: true }), WARM_CAP_MS);
      }),
    ];
    let r;
    try {
      r = await runSteps(steps, { signal: live, onProgress });
    } finally {
      // las réplicas de prueba solo servían para compilar sus materiales
      for (const o of probes) o.removeFromParent();
      for (const o of probes) if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); }
    }
    if (r.cancelled || stale()) return false;
    this.preparedKey = keyOf(course, skin, instance, quality);
    onStep?.('ready');
    return true;
  }

  /** Curso, tema, resplandor, calidad y skin propia: lo visual del hoyo, sin estado de juego. */
  #applyCourseVisuals(course, skin, instance) {
    this.skin = skin;
    // instance: { seed, ... } de la skin equipada (progress.instance(id)); sin ella, el acabado base
    this.instance = instance;
    // puff, onda, borde y confeti genéricos: solo para las skins que no tienen sus propios efectos
    const fx = skin.fx ?? {};
    this.genericFx = { hit: fx.hit === 'generic', wall: fx.wall === 'generic', lip: !fx.lip, sink: fx.sink === 'generic' };
    this.course = course;
    this.theme = THEMES[course.theme] ?? THEMES.meadow;
    this.#applyBloom(this.theme);
    this.#applyQuality();
  }

  /** El bloom nunca supera el 15% (0.14 en mapas nocturnos/neón/lava, 0.08 en día). */
  #applyBloom(theme) {
    const glowy = theme.sunIntensity < 2 || theme.lava || theme.neon;
    this.bloom.strength = glowy ? 0.14 : 0.08;
    this.bloom.threshold = glowy ? 0.85 : 0.95;
  }

  /** Cámara de la vista general (el primer frame de la intro): no necesita la bola de física. */
  #placePreviewCamera() {
    const a = this.#overviewTarget();
    this.camPos = a.pos.clone();
    this.camLook = a.look.clone();
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  /**
   * Réplicas de la preparación: skins rivales elegidas ya y sus materiales creados, más mallas y una
   * etiqueta de prueba para compilarlos. Devuelve esas piezas de prueba (se quitan tras compilar).
   */
  #prepareGhosts(n) {
    this.ghostGeo = new THREE.SphereGeometry(BALL_R, 20, 14);
    this.ghostHandles = new Map();
    this.ghostSkins = pickRandomSkins(Math.max(0, n | 0));
    const probes = [];
    for (const skin of this.ghostSkins) {
      if (this.ghostHandles.has(skin.id)) continue;
      const handle = this.#ghostHandle(skin);
      this.ghostHandles.set(skin.id, handle);
      const mesh = new THREE.Mesh(this.ghostGeo, handle.material);
      mesh.position.set(this.course.tee[0], -50, this.course.tee[1]);
      probes.push(mesh);
    }
    if (this.ghostSkins.length) {
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture('', '#ffffff'), transparent: true, depthWrite: false }));
      label.renderOrder = 10;
      label.position.set(this.course.tee[0], -50, this.course.tee[1]);
      probes.push(label);
    }
    for (const o of probes) this.scene.add(o);
    return probes;
  }

  #ghostHandle(skin, theme = this.theme) {
    const handle = createSkinMaterial(skin, { quality: 'low', instance: {}, theme });
    handle.material.transparent = true;
    handle.material.opacity = 0.75;
    return handle;
  }

  // ---------- hoyo siguiente (F3) ----------

  /**
   * Construye la escena del hoyo siguiente sobre el mismo renderer mientras se ve el resultado del actual:
   * entorno, pista, efectos del hoyo, réplicas de los rivales (skins elegidas aquí) y GPU caliente
   * (compileAsync con su destino de dibujo e initTexture por trozos). No dibuja en pantalla. Sin estado de juego:
   * ni tick, ni bola de física, ni golpes, ni bots, ni bucle, ni audio. Solo un hoyo por delante: otra llamada
   * cancela la anterior. load() con la misma clave hace el intercambio. Resuelve true si quedó lista.
   */
  async prepareNext(course, { ghosts = 0, signal = null } = {}) {
    if (this.disposed || !course || !this.skin) return false;
    this.cancelNext();
    const n = {
      course,
      theme: THEMES[course.theme] ?? THEMES.meadow,
      key: keyOf(course, this.skin, this.instance, getQuality()),
      sig: { cancelled: false },
      running: true,
      ok: false,
      released: false,
    };
    let settle;
    n.ready = new Promise((r) => (settle = r));
    this.#next = n;
    const stale = () => n.sig.cancelled || !!signal?.cancelled || this.disposed || this.#next !== n;
    const live = { get cancelled() { return stale(); } };
    if (PERF) perf.mark('next:prepare:start', { next: course.name });
    let probes = [];
    const steps = [
      () => yieldToMain(), // nada en la tarea del final del hoyo
      () => {
        this.#stageEnv(n);
        // buildEnvironment mueve el viento compartido al hoyo nuevo: vuelve al actual hasta el intercambio
        if (this.bounds) setWindField(windFieldOf(this.bounds));
      },
      () => this.#stageCourse(n),
      () => this.#stageFinish(n),
      () => { probes = this.#nextProbes(n, ghosts); },
      () => this.#warmNext(n, probes, live),
    ];
    let r = { cancelled: true };
    try {
      r = await runSteps(steps, { signal: live });
    } catch (e) {
      if (PERF) perf.mark('next:prepare:error', { message: String(e?.message ?? e) });
    } finally {
      for (const o of probes) o.removeFromParent();
      for (const o of probes) if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); }
      n.running = false;
    }
    const ok = !r.cancelled && !stale();
    if (ok) n.ok = true;
    else {
      if (this.#next === n) this.#next = null;
      this.#releaseStage(n);
    }
    if (PERF) perf.mark('next:prepare:end', { ok, next: course.name });
    settle(ok);
    return ok;
  }

  /** Promesa del hoyo siguiente en preparación (true si quedó listo) o null si no hay ninguno. */
  whenNextReady() {
    return this.#next?.ready ?? null;
  }

  /** Cancela y libera el hoyo siguiente preparado (o en preparación). */
  cancelNext() {
    const n = this.#next;
    if (!n) return;
    this.#next = null;
    n.sig.cancelled = true;
    if (PERF) perf.mark('next:cancel', { next: n.course?.name });
    if (!n.running) this.#releaseStage(n);
  }

  /** El hoyo siguiente si está listo y su clave coincide; si no, se libera y se sigue por el camino normal. */
  #takeNext(key) {
    const n = this.#next;
    if (!n) return null;
    this.#next = null;
    if (key != null && n.ok && n.key === key && !this.disposed) {
      if (PERF) perf.mark('next:hit', { next: n.course.name });
      return n;
    }
    if (PERF) perf.mark('next:miss', { next: n.course?.name, reason: !n.ok ? 'pending' : 'key' });
    n.sig.cancelled = true;
    if (!n.running) this.#releaseStage(n);
    return null;
  }

  /** Bola, halo, sombra, partículas, SkinFX, puntos de apuntado y ondas: lo de la escena activa que no es del hoyo ni de los rivales. */
  #dynamicObjects() {
    const scene = this.scene;
    if (!scene) return [];
    const st = this.#statics;
    const rivals = new Set();
    for (const b of this.bots ?? []) {
      if (b.mesh) rivals.add(b.mesh);
      if (b.label) rivals.add(b.label);
    }
    return scene.children.filter((o) => !st?.has(o) && !rivals.has(o));
  }

  /**
   * La escena preparada pasa a activa: se le mueven la bola y sus efectos (scene.add los quita de la anterior),
   * se quitan los rivales del hoyo anterior y la escena vieja se libera en un rato libre (sin sumar a esta tarea).
   */
  #swapStage(n) {
    const old = { scene: this.scene, env: this.env };
    this.#disposeBots();
    for (const o of this.#dynamicObjects()) n.scene.add(o);
    if (this.skinFx) this.skinFx.scene = n.scene; // lo que SkinFX cree más tarde (estela, aura…) va a la escena nueva
    if (n.skinHandle && this.ballMesh) {
      // el tema cambia los reflejos de la bola: material nuevo (ya compilado en prepareNext), misma malla y efectos
      const prev = this.skinHandle;
      this.skinHandle = n.skinHandle;
      n.skinHandle = null;
      this.ballMesh.material = this.skinHandle.material;
      attachSkinDecor(this.ballMesh, this.skinHandle, BALL_R);
      prev?.dispose();
    }
    this.course = n.course;
    this.theme = n.theme;
    this.scene = n.scene;
    this.env = n.env;
    this.courseView = n.courseView;
    this.cyberFx = n.cyberFx;
    this.bounds = n.bounds;
    this.#statics = n.statics;
    this.ghostHandles = n.ghostHandles;
    this.ghostSkins = n.ghostSkins;
    n.ghostHandles = null;
    n.ghostSkins = null;
    n.released = true; // ya es la escena activa: la libera el siguiente intercambio o dispose()
    setWindField(windFieldOf(this.bounds));
    this.#applyBloom(this.theme);
    this.#applyQuality();
    this.renderer.shadowMap.needsUpdate = true;
    this.#retireScene(old.scene, old.env);
  }

  /** Libera una escena preparada que no se va a usar (cancelada, otra clave o sin terminar a tiempo). */
  #releaseStage(n) {
    if (!n || n.released) return;
    n.released = true;
    n.sig.cancelled = true;
    for (const h of n.ghostHandles?.values() ?? []) h.dispose();
    n.ghostHandles = null;
    n.ghostSkins = null;
    n.skinHandle?.dispose();
    n.skinHandle = null;
    if (n.scene) this.#retireScene(n.scene, n.env);
  }

  /**
   * Libera una escena que ya no se dibuja, en un rato libre: su entorno (césped, flores, peces, agua) y sus
   * geometrías, texturas, mapas de sombra e InstancedMesh. Se conservan los materiales, el reflejo PMREM y todo
   * lo que usen la escena activa y la preparada (texturas y geometrías compartidas entre hoyos).
   */
  #retireScene(scene, env) {
    if (!scene) return;
    whenIdle(() => {
      if (this.disposed) return; // el contexto ya se soltó entero
      if (PERF) perf.mark('dispose:old:start');
      env?.dispose?.();
      const keep = new Set();
      if (this.envMap) keep.add(this.envMap);
      for (const s of [this.scene, this.#next?.scene]) {
        if (!s || s === scene) continue;
        const res = collectSceneResources(s);
        for (const g of res.geometries) keep.add(g);
        for (const t of res.textures) keep.add(t);
      }
      const counts = disposeSceneResources(scene, { keep });
      if (PERF) perf.mark('dispose:old:end', { ...counts, gl: perf.gl(this.renderer, 'dispose:old') });
    });
  }

  /** Réplicas de prueba del hoyo siguiente (sus skins y materiales) y, si el tema cambia los reflejos, el material nuevo de la bola. */
  #nextProbes(n, ghosts) {
    const probes = [];
    const [tx, tz] = n.course.tee;
    n.ghostHandles = new Map();
    n.ghostSkins = pickRandomSkins(Math.max(0, ghosts | 0));
    this.ghostGeo ??= new THREE.SphereGeometry(BALL_R, 20, 14);
    for (const skin of n.ghostSkins) {
      if (n.ghostHandles.has(skin.id)) continue;
      const handle = this.#ghostHandle(skin, n.theme);
      n.ghostHandles.set(skin.id, handle);
      const mesh = new THREE.Mesh(this.ghostGeo, handle.material);
      mesh.position.set(tx, -50, tz);
      probes.push(mesh);
    }
    if (n.ghostSkins.length) {
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture('', '#ffffff'), transparent: true, depthWrite: false }));
      label.renderOrder = 10;
      label.position.set(tx, -50, tz);
      probes.push(label);
    }
    if (this.ballMesh && ballLook(n.theme) !== ballLook(this.theme)) {
      n.skinHandle = createSkinMaterial(this.skin, { quality: getQuality(), instance: this.instance ?? {}, theme: n.theme });
      const mesh = new THREE.Mesh(this.ballMesh.geometry, n.skinHandle.material);
      mesh.position.set(tx, -50, tz);
      probes.push(mesh);
    }
    return probes;
  }

  /**
   * GPU caliente para la escena siguiente sin dibujar: la bola y sus efectos se pasan un instante a esa escena
   * (en la misma tarea, sin ningún frame en medio) para que los programas salgan con sus luces y su entorno,
   * se lanza compileAsync con el destino de dibujo que tendrá, y vuelven. Después, texturas por trozos.
   */
  async #warmNext(n, probes, live) {
    const r = this.renderer;
    const back = this.scene;
    const moved = this.#dynamicObjects();
    const prev = r.getRenderTarget();
    let p, textures;
    try {
      for (const o of moved) n.scene.add(o);
      for (const o of probes) n.scene.add(o);
      r.setRenderTarget(this.#wantsPost(n.theme) ? this.composer.renderTarget1 : null);
      p = r.compileAsync(n.scene, this.camera);
      textures = [...collectTextures(n.scene)];
    } finally {
      r.setRenderTarget(prev);
      for (const o of moved) back.add(o);
      for (const o of probes) o.removeFromParent();
    }
    await withCap(p, 4000);
    if (live.cancelled) return;
    for (const part of chunk(textures, 4)) {
      part.forEach((t) => r.initTexture(t));
      await yieldToMain();
      if (live.cancelled) return;
    }
  }

  /** Estado de juego del hoyo: bola de física, golpes, contador, cámara. Solo en load(). */
  #resetPlayState(course, firstSunkTick, timeLimit) {
    this.segs = segmentsOf(course);
    this.ball = { x: course.tee[0], z: course.tee[1], vx: 0, vz: 0 };
    this.strokes = 0;
    this.sunk = false;
    this.timedOut = false;
    // con el renderer reutilizado (F3) viene del hoyo anterior: la pantalla lo bloquea al acabar
    this.locked = false;
    this.lipped = false;
    this.inDrop = false;
    this.endTick = null; // paso en el que se acabó el tiempo (se manda al servidor)
    this.sunkTick = null; // paso en el que embocaste
    this.firstSunkTick = course.noCup ? null : firstSunkTick;
    this.limitTicks = timeLimit != null && Number.isFinite(timeLimit) && timeLimit > 0 ? Math.round(timeLimit / DT) : null;
    this.timerShown = undefined;
    this.camTurns = 0; // giros de cámara desde el último tiro, para el antibots
    this.sunkAt = 0;
    this.t = 0;
    this.tick = 0;
    this.shots = []; // { tick, yaw, power }: lo que se manda al servidor
    this.aim = []; // gesto de cada tiro { d: pasos con el dedo puesto, t: giros al apuntar } para el antibots
    this.power = 0;
    this.drag = null;
    this.charging = false;
    this.chargeAnchor = null;
    this.orbiting = false;
    this.orbitYaw = 0;
    this.overview = false;
    this.paused = false;
    this.overviewYaw = 0;
    this.overviewPitch = 0.85;
    this.mouseTurns = 0;
    this.chargeStartTick = 0;
    this.aimStartTick = 0;
    this.lastMouseX = null;
    this.wasInSand = false;
    this.wasOnBoost = false;
    this.ambientOn = false;
    this.trauma = 0; // temblor de cámara
    this.fovKick = 0;
    this.squash = 0;
    this.timeScale = 1;
    this.fullPower = false;
    this.yaw = Math.atan2(course.cup[0] - course.tee[0], -(course.cup[1] - course.tee[1]));
    if (course.aimYaw !== undefined) this.yaw = course.aimYaw;
    this.camYaw = this.yaw;
  }

  #startLoop() {
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.#frame());
  }

  #compileTarget() {
    return this.usePost ? this.composer.renderTarget1 : null;
  }

  /** Compila con el mismo render target que usará el juego, sube texturas por trozos y hace el primer render oculto. */
  async #warmGpu(token, sig, { prepared = false } = {}) {
    const stale = () => sig.cancelled || this.disposed || token !== this.#loadToken;
    // preparando en la sala: el frame oculto no es el primero del hoyo (ese lo marca #frame al mostrarse)
    const marks = PERF && !prepared;
    const renderer = this.renderer;
    if (PERF) perf.mark('compile:start');
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.#compileTarget());
    let p;
    try {
      p = renderer.compileAsync(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(prev);
    }
    await withCap(p, 4000);
    if (PERF) perf.mark('compile:end');
    if (stale()) return;
    for (const part of chunk([...collectTextures(this.scene)], 4)) {
      part.forEach((t) => renderer.initTexture(t));
      await yieldToMain();
      if (stale()) return;
    }
    if (marks) {
      this.perfFirst = false;
      perf.mark('frame1:start', { gl: perf.gl(renderer, 'frame1:start') });
    } else if (PERF) perf.mark('warm:frame:start');
    if (this.usePost) {
      this.renderPass.scene = this.scene;
      this.composer.render(0);
    } else renderer.render(this.scene, this.camera);
    if (marks) {
      perf.mark('frame1:end', { gl: perf.gl(renderer, 'frame1:end') });
      this.perfHole = perf.hole();
      perf.startFrames(`hole${this.perfHole}`);
    } else if (PERF) perf.mark('warm:frame:end', { gl: perf.gl(renderer, 'warm:frame:end') });
  }

  /**
   * Resplandor: imagen intermedia (con o sin antialias) + bloom + salida. Solo
   * se usa cuando el resplandor se ve; si no, se dibuja directo a la pantalla.
   */
  #makeComposer(samples) {
    const old = this.composer;
    if (old) {
      old.renderTarget1.dispose();
      old.renderTarget2.dispose();
      this.bloom?.dispose();
    }
    this.composerSamples = samples;
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples }));
    this.renderPass = new RenderPass(null, this.camera);
    const strength = this.bloom?.strength ?? 0.14, threshold = this.bloom?.threshold ?? 0.88;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), strength, 0.4, threshold);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  #setPixelRatio(pr) {
    if (this.renderer.getPixelRatio() === pr) return;
    this.renderer.setPixelRatio(pr);
    this.#resize();
  }

  /** Aplica la calidad elegida en Ajustes (también a mitad de partida). */
  #applyQuality() {
    const q = quality();
    this.quality = q;
    if (q.msaa !== this.composerSamples) {
      this.#makeComposer(q.msaa);
      this.#resize();
    }
    this.bloom.enabled = q.bloom;
    this.usePost = this.#wantsPost(this.theme);
    this.renderer.shadowMap.enabled = q.shadows;
    const type = q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (this.renderer.shadowMap.type !== type) this.renderer.shadowMap.type = type;
    this.renderer.shadowMap.needsUpdate = true;
    const max = Math.min(window.devicePixelRatio, q.pixelRatio);
    this.resGov.configure(Math.min(max, q.minPixelRatio), max);
    this.#setPixelRatio(max);
  }

  /** ¿Se dibuja con resplandor (composer)? De día apenas se nota: en Medio no se paga (solo en Alto). */
  #wantsPost(theme) {
    const glowy = !theme || theme.sunIntensity < 2 || theme.lava || theme.neon;
    return !!quality().bloom && (!!glowy || getQuality() === 'high');
  }

  /** Cambia la calidad en caliente: resolución y resplandor al momento, el resto al volver a cargar el hoyo. */
  refreshQuality() {
    this.#applyQuality();
  }

  setOverview(on) {
    this.overview = !!on;
    if (this.overview) {
      this.charging = false;
      this.chargeAnchor = null;
      this.power = 0;
      this.fullPower = false;
      setCharge(0);
      this.onAim?.(0);
      this.aimDots.hide();
      this.overviewYaw = 0;
      this.overviewPitch = 0.85;
    }
    this.onOverviewChange?.(this.overview);
  }

  setPaused(on) {
    this.paused = !!on;
    if (this.paused) {
      if (this.charging || this.power > 0) {
        this.charging = false;
        this.chargeAnchor = null;
        this.power = 0;
        this.fullPower = false;
        setCharge(0);
        this.onAim?.(0);
        this.aimDots?.hide();
      }
    }
  }

  requestPointerLock() {
    const el = this.renderer?.domElement;
    if (!el || typeof document === 'undefined') return;
    if (document.pointerLockElement === el || this.isPointerLocked) return;
    if (!el.isConnected) return;
    const retry = () => {
      try { el.requestPointerLock?.()?.catch?.(() => {}); } catch {}
    };
    try {
      const p = el.requestPointerLock?.({ unadjustedMovement: true });
      if (p && typeof p.catch === 'function') p.catch(retry);
    } catch {
      retry();
    }
  }

  exitPointerLock() {
    if (typeof document !== 'undefined' && document.pointerLockElement) {
      try {
        document.exitPointerLock?.();
      } catch {}
    }
  }

  /** Paso en el que se acaba el tiempo del hoyo (null si nadie ha embocado aún o no hay límite). */
  get deadlineTick() {
    return this.firstSunkTick == null || this.limitTicks == null ? null : this.firstSunkTick + this.limitTicks;
  }

  /** Reinicia el hoyo actual devolviendo la bola al tee con marcador a cero. */
  restart() {
    if (!this.course) return;
    this.ball = { x: this.course.tee[0], z: this.course.tee[1], vx: 0, vz: 0 };
    this.strokes = 0;
    this.sunk = false;
    this.lipped = false;
    this.timedOut = false;
    this.locked = false;
    this.endTick = null;
    this.firstSunkTick = null;
    this.timerShown = undefined;
    this.shots = [];
    this.aim = [];
    this.power = 0;
    this.fullPower = false;
    this.#cancelAim();
    this.#resetFx();
    this.yaw = Math.atan2(this.course.cup[0] - this.course.tee[0], -(this.course.cup[1] - this.course.tee[1]));
    if (this.course.aimYaw !== undefined) this.yaw = this.course.aimYaw;
    this.camYaw = this.yaw;
    this.intro = 0;
    this.#placeCamera(1, true);
    this.onStroke?.(0);
    this.onAim?.(0);
  }

  #noteSunk(tick) {
    if (this.course.noCup) return;
    if (this.firstSunkTick == null || tick < this.firstSunkTick) this.firstSunkTick = tick;
  }

  /** En vivo: otro jugador ha embocado en ese paso de su hoyo (arranca o adelanta el contador). */
  noteRemoteSunk(tick) {
    if (this.course && Number.isInteger(tick) && tick > 0) this.#noteSunk(tick);
  }

  #cancelAim() {
    this.drag = null;
    this.charging = false;
    this.chargeAnchor = null;
    this.power = 0;
    this.fullPower = false;
    setCharge(0);
    this.onAim?.(0);
    this.aimDots?.hide();
  }

  #timeUp() {
    this.timedOut = true;
    this.endTick = this.deadlineTick;
    this.ball.vx = 0;
    this.ball.vz = 0;
    this.#cancelAim();
    this.exitPointerLock();
    sfx.lip();
    this.#vibrate([60, 40, 60]);
    this.onTimeUp?.(this.strokes);
  }

  /** ¿Toca la pantalla en (x, y) sobre la bola? Con margen: la bola es pequeña. */
  #touchesBall(clientX, clientY) {
    const el = this.renderer.domElement;
    const rect = el.getBoundingClientRect();
    const p = this.ballRoot.position.clone().project(this.camera);
    if (p.z > 1) return false;
    const sx = rect.left + ((p.x + 1) / 2) * rect.width;
    const sy = rect.top + ((1 - p.y) / 2) * rect.height;
    const d = this.camera.position.distanceTo(this.ballRoot.position);
    const ballPx = (BALL_R / (d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))) * (rect.height / 2);
    return Math.hypot(clientX - sx, clientY - sy) <= Math.max(BALL_TOUCH_PX, ballPx * 3);
  }

  distanceToCup() {
    return Math.hypot(this.ball.x - this.course.cup[0], this.ball.z - this.course.cup[1]);
  }

  /**
   * Golpes de cada rival; los que no han terminado juegan lo que les queda al
   * instante, a su ritmo, hasta que se acabe el tiempo (los que no emboquen
   * quedan descalificados con el máximo).
   */
  finishBots() {
    const left = (this.bots ?? []).filter((b) => !b.done && !b.remote);
    for (let tick = this.tick; left.some((b) => !b.done) && tick < this.tick + 120 * 300; ) {
      tick++;
      if (this.#disqualifyLateBots(tick)) break;
      for (const b of left) if (b.tick(tick * DT, DT)?.sunk && !this.live) this.#noteSunk(tick);
    }
    const out = {};
    for (const b of this.bots ?? []) {
      if (b.remote) continue;
      if (!b.done) Object.assign(b, { done: true, strokes: maxStrokesOf(this.course) });
      out[b.player.id] = b.strokes;
    }
    return out;
  }

  /** Los rivales que no han embocado cuando se acaba el tiempo. Devuelve si se ha acabado. */
  #disqualifyLateBots(tick) {
    const dl = this.deadlineTick;
    if (dl == null || this.course.noCup || tick <= dl) return false;
    for (const b of this.bots ?? []) {
      // los jugadores reales dicen ellos mismos si se quedaron sin tiempo
      if (b.done || b.remote) continue;
      Object.assign(b, { done: true, dq: true, strokes: maxStrokesOf(this.course) });
      this.onRival?.(b.player, { strokes: b.strokes, sunk: false, done: true, dq: true });
    }
    return true;
  }

  /** Desempate: distancia final de cada rival al objetivo. */
  botDistances() {
    const out = {};
    for (const b of this.bots ?? []) {
      if (b.remote) continue;
      if (!b.done) b.finishInstantly(this.t);
      out[b.player.id] = Math.hypot(b.ball.x - this.course.cup[0], b.ball.z - this.course.cup[1]);
    }
    return out;
  }

  rivals() {
    return (this.bots ?? []).map((b) => ({ id: b.player.id, strokes: b.strokes, done: b.done, sunk: b.sunk, dq: !!b.dq }));
  }

  dispose() {
    if (this.disposed) return; // idempotente: pausa→salir llama dos veces (game.dispose y goHome→releasePlay)
    this.disposed = true;
    // hoyo siguiente en preparación: se corta (su GPU se va con el contexto, abajo)
    if (this.#next) this.#next.sig.cancelled = true;
    this.#next = null;
    if (PERF) { perf.stopFrames(`hole${this.perfHole ?? 0}`); perf.mark('dispose:start'); }
    setCharge(0);
    stopAmbient();
    stopRolling();
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.#unbindInput?.();
    this.#disposeFx();
    this.env?.dispose?.(); // anillos del material de agua (compartido) y mallas del hoyo
    this.perf = null;
    this.composer.dispose();
    this.renderer.dispose();
    // suelta ya el contexto WebGL (si no, vive hasta el GC y se acumula uno por partida; el hub crea el suyo justo después)
    try { this.renderer.forceContextLoss?.(); } catch { /* ya perdido */ }
    this.renderer.domElement.remove();
    this.cupMarker?.remove();
    this.holder?.remove(); // juego preparado que no llegó a mostrarse
    this.holder = null;
    if (PERF) perf.mark('dispose:end');
  }

  // ---------- escena ----------

  /** El camino de siempre: escena entera (entorno y pista, bola y efectos, réplicas de los rivales). */
  #buildScene() {
    this.#buildStatic();
    this.#buildBall();
    this.#buildBots();
    if (PERF) perf.mark('ball:end'); // «ball» envuelve a «bots», como espera derive() en perfProbe
    // compila los shaders de bola, réplicas y efectos durante la intro, para no tirar el primer golpe
    if (!WARM_GPU) {
      if (PERF) perf.mark('compile:start');
      const compiling = this.renderer.compileAsync(this.scene, this.camera).catch(() => {});
      if (PERF) compiling.then(() => perf.mark('compile:end'));
    }
  }

  /** Entorno, pista, efectos del hoyo 15, reflejos (PMREM) y recorte de luces. Libera la escena anterior. */
  #buildStatic() {
    this.#disposeFx();
    this.env?.dispose?.(); // césped del hoyo anterior (malla propia; material y atlas son compartidos)
    // la escena del hoyo anterior (renderer reutilizado o preparación descartada): geometrías, texturas y sombras
    // en un rato libre, sin los materiales (three vuelve a subir lo que algo reutilice)
    this.#retireScene(this.scene, null);
    const st = { course: this.course, theme: this.theme };
    this.#stageEnv(st, PERF);
    this.#stageCourse(st, PERF);
    this.#stageFinish(st, PERF);
    this.scene = st.scene;
    this.env = st.env;
    this.courseView = st.courseView;
    this.cyberFx = st.cyberFx;
    this.bounds = st.bounds;
    this.#statics = st.statics;
  }

  /** Escena nueva y entorno del hoyo de `st` (st.course, st.theme). No toca la escena activa. */
  #stageEnv(st, marks = false) {
    const scene = new THREE.Scene();
    st.scene = scene;
    let seed = [...st.course.name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483647;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (marks) perf.mark('env:start');
    st.env = buildEnvironment(scene, st.course, st.theme, rng);
    if (marks) perf.mark('env:end');
  }

  /** Pista y efectos del hoyo 15 (solo visuales: leen la bola y los eventos, no escriben la simulación). */
  #stageCourse(st, marks = false) {
    if (marks) perf.mark('course:start');
    st.courseView = buildCourse(st.scene, st.course, st.theme);
    st.cyberFx = st.theme.cyberCity ? createCyberFx(st.scene, st.course) : null;
    if (marks) perf.mark('course:end');
  }

  /** Reflejos (PMREM, uno por partida), recorte de luces, límites y lo que es del hoyo (statics). */
  #stageFinish(st, marks = false) {
    const scene = st.scene;
    const q = quality();
    // reflejos suaves de un estudio: los plásticos y metales dejan de verse apagados
    // (de noche y en neón no: los metales oscuros reflejarían un estudio blanco y brillarían de más)
    const glowy = st.theme.sunIntensity < 2 || st.theme.lava || st.theme.neon;
    if (q.env && !glowy) {
      if (marks) perf.mark('pmrem:start', { cached: !!this.envMap });
      this.envMap ??= new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
      if (marks) perf.mark('pmrem:end');
      scene.environment = this.envMap;
      scene.environmentIntensity = 0.12;
    }
    // cada luz puntual encarece todos los materiales: solo las más fuertes
    const points = [];
    scene.traverse((o) => o.isPointLight && points.push(o));
    points.sort((a, b) => b.intensity * b.distance - a.intensity * a.distance);
    points.forEach((l, i) => (l.visible = i < q.maxLights));
    st.bounds = courseBounds(st.course);
    st.statics = new Set(scene.children);
  }

  /** Bola propia: skin, malla, sombra de contacto, halo, partículas, efectos de skin, puntos de apuntado y ondas. */
  #buildBall() {
    const scene = this.scene;
    const q = quality();
    const fxLevel = getQuality();
    if (PERF) perf.mark('ball:start');
    const skinOpts = { quality: fxLevel, instance: this.instance ?? {}, theme: this.theme };
    this.skinHandle = createSkinMaterial(this.skin, skinOpts);
    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, q.ballSegments.w, q.ballSegments.h),
      this.skinHandle.material,
    );
    this.ballMesh.castShadow = true;
    attachSkinDecor(this.ballMesh, this.skinHandle, BALL_R); // pelos y otros extras de la skin
    // la bola va dentro de un grupo para poder aplastarla sin que gire el aplastamiento
    this.ballRoot = new THREE.Group();
    this.ballRoot.add(this.ballMesh);
    scene.add(this.ballRoot);
    // sombra de contacto suave: asienta la bola en el césped
    this.ballShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(BALL_R * 3.2, BALL_R * 3.2),
      new THREE.MeshBasicMaterial({ map: softDotTexture(), color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    scene.add(this.ballShadow);
    // halo bajo la bola para verla siempre, también en sombra
    this.ballGlow = new THREE.Mesh(
      new THREE.RingGeometry(BALL_R * 1.4, BALL_R * 1.9, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    this.ballGlow.rotation.x = -Math.PI / 2;
    scene.add(this.ballGlow);

    this.particles = new Particles(scene);
    // efectos de la skin: estela, impactos, aura y embocada (sustituyen al Trail genérico)
    this.skinFx = new SkinFX(scene, this.skin, { quality: fxLevel });
    this.fxCtx = { pos: this.ballRoot.position, speed: 0, moving: false, camera: this.camera };
    this.matCtx = { speed: 0, impact: 0, state: 0 };
    this.aimDots = new AimDots(scene);
    this.waves = new Shockwaves(scene);
  }

  /**
   * Rivales: réplicas fantasma con una skin al azar cada uno (sin repetir mientras haya skins) y su nombre encima.
   * Solo el acabado: material 'low' por skin (mapa horneado, sin shader ni update) y sin SkinFX.
   * Si prepare() ya eligió skins y creó sus materiales, se reutilizan en orden (sus shaders ya están compilados).
   */
  #buildBots() {
    const scene = this.scene;
    this.ghostGeo ??= new THREE.SphereGeometry(BALL_R, 20, 14);
    this.ghostHandles ??= new Map();
    if (PERF) perf.mark('bots:start');
    const n = this.botPlayers.length;
    const pre = this.ghostSkins ?? [];
    this.ghostSkins = null;
    const botSkins = pre.length >= n ? pre.slice(0, n) : [...pre, ...pickRandomSkins(n - pre.length)];
    this.bots = this.botPlayers.map((p, i) => {
      const bot = p.remote ? new RemoteBall(p, this.course, this.segs, p.remote) : new Bot(p, this.course, this.segs, p.rng ?? Math.random);
      const skin = botSkins[i];
      if (!this.ghostHandles.has(skin.id)) this.ghostHandles.set(skin.id, this.#ghostHandle(skin));
      const mesh = new THREE.Mesh(this.ghostGeo, this.ghostHandles.get(skin.id).material);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(p.name, p.color), transparent: true, depthWrite: false }));
      label.scale.set(0.9, 0.225, 1);
      label.renderOrder = 10;
      scene.add(mesh, label);
      Object.assign(bot, { mesh, label, sinkT: 0 });
      return bot;
    });
    if (PERF) perf.mark('bots:end');
  }

  /** Efectos de la skin al volver al tee: se vacían; la estela se recoge sola. */
  #resetFx() {
    if (!this.skinFx) return;
    this.skinFx.reset();
    if (this.skinFx.pointTrail) this.skinFx.pointTrail.count = 0;
  }

  /** Rivales del hoyo: réplicas y nombres fuera de la escena, sus etiquetas y materiales liberados (la geometría común se queda). */
  #disposeBots() {
    for (const b of this.bots ?? []) {
      b.mesh?.removeFromParent();
      b.label?.removeFromParent();
      b.label?.material.map?.dispose();
      b.label?.material.dispose();
    }
    // this.bots se queda: finishBots() puede leer los golpes tras liberar el juego (vivo); #buildBots lo reemplaza
    for (const h of this.ghostHandles?.values() ?? []) h.dispose();
    this.ghostHandles = null;
    this.ghostSkins = null;
  }

  /** Libera material, efectos y réplicas de la partida anterior (o de esta, al cerrar). */
  #disposeFx() {
    this.#disposeBots();
    this.ghostGeo?.dispose();
    this.ghostGeo = null;
    this.skinFx?.dispose();
    this.skinFx = null;
    this.skinHandle?.dispose();
    this.skinHandle = null;
    this.ballMesh?.geometry.dispose();
    for (const m of [this.ballShadow, this.ballGlow]) {
      if (!m) continue;
      m.removeFromParent();
      m.geometry.dispose();
      m.material.map?.dispose();
      m.material.dispose();
    }
    this.ballShadow = this.ballGlow = null;
    if (this.particles) {
      const { mesh, soft } = this.particles;
      for (const m of [mesh, soft]) {
        m.removeFromParent();
        m.material.map?.dispose();
        m.material.dispose();
        m.dispose();
      }
      mesh.geometry.dispose();
      this.particles = null;
    }
    this.waves?.dispose();
    this.waves = null;
    if (this.aimDots) {
      for (const o of [this.aimDots.mesh, this.aimDots.ring]) {
        o.removeFromParent();
        o.geometry.dispose();
        o.material.dispose();
      }
      this.aimDots.mesh.dispose?.();
      this.aimDots = null;
    }
  }

  /** Normal de una pared: el choque solo cambia la componente normal de la velocidad, así que el cambio apunta hacia la bola. */
  #bounceNormal(vx0, vz0, ball) {
    const dx = ball.vx - vx0, dz = ball.vz - vz0;
    const len = Math.hypot(dx, dz);
    return len < 1e-6 ? null : this.#fxNormal.set(dx / len, 0, dz / len);
  }

  #resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    if (aspect < 1) {
      this.baseFov = 62;
    } else if (aspect <= 1.85) {
      this.baseFov = 48;
    } else {
      this.baseFov = 42;
    }
    this.camera.fov = this.baseFov + (this.fovKick ?? 0);
    this.camera.updateProjectionMatrix();
  }

  // ---------- cámara ----------

  /**
   * Tubo de caída (la cueva del volcán): pasada la boca, la cámara espera
   * dentro, frente al tobogán, y mira cómo baja la bola (detrás de la bola
   * quedaría metida en la roca).
   */
  #dropTarget() {
    const tr = this.ball.track;
    const p = tr?.kind === 'tube' ? this.course.portals[tr.i] : null;
    if (!p?.drop || tr.s < tubeTable(p).length * 0.3) return null;
    const pose = ballPose(this.course, this.ball);
    const [bx, bz] = p.b, [ox, oz] = p.out;
    return {
      pos: new THREE.Vector3(bx + ox * 5.5 + oz * 2, 3.2, bz + oz * 5.5 - ox * 2),
      look: new THREE.Vector3(pose.x, pose.y - 0.3, pose.z),
    };
  }

  #followTarget() {
    const fwd = forwardOf(this.camYaw);
    const isWidescreen = (this.container.clientWidth || 1) >= (this.container.clientHeight || 1);
    const zoom = this.zoomLevel ?? 1;
    const baseDist = (isWidescreen ? 3.5 : FOLLOW_DIST) * zoom;
    const baseHeight = (isWidescreen ? 1.6 : FOLLOW_HEIGHT) * (0.85 + 0.15 * zoom);
    const dist = baseDist + this.power * 0.7;
    // con relieve la cámara sube con el césped; en un looping o un tubo, casi tanto como la bola
    const pose = this.#renderPose();
    const rise = pose.onTrack ? pose.ground + (pose.y - BALL_R - pose.ground) * 0.75 : pose.ground;
    // fuera de un looping o un tubo la bola está en (ball.x, ball.z): se sigue su posición dibujada
    const bx = pose.onTrack ? this.ball.x : pose.x, bz = pose.onTrack ? this.ball.z : pose.z;
    const pos = new THREE.Vector3(bx, 0, bz).addScaledVector(fwd, -dist);
    pos.y = rise + baseHeight + this.power * 0.35;
    const look = new THREE.Vector3(bx, rise + 0.15, bz).addScaledVector(fwd, LOOK_AHEAD);
    return { pos, look };
  }

  #overviewTarget() {
    const b = this.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const aspect = (this.container.clientWidth || 1) / (this.container.clientHeight || 1);
    const yaw = this.overviewYaw || 0;
    const pitch = THREE.MathUtils.clamp(this.overviewPitch ?? 0.85, 0.25, 1.35);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const look = new THREE.Vector3(cx, 0, cz);
    const dist = this.#fitDistance(look, dir, aspect) * (this.zoomLevel ?? 1);
    return { pos: look.clone().addScaledVector(dir, dist), look };
  }

  /**
   * Distancia mínima para que el hoyo entero (sus 8 esquinas, con las paredes
   * y la bandera) quepa en pantalla desde esa dirección, con un margen. Así los
   * hoyos en L y los largos se ven completos en vertical y en horizontal.
   */
  #fitDistance(look, dir, aspect) {
    const key = `${look.x},${look.z},${dir.x.toFixed(3)},${dir.y.toFixed(3)},${dir.z.toFixed(3)},${aspect.toFixed(3)},${this.baseFov}`;
    if (this.fitCache?.key === key) return this.fitCache.dist;
    const b = this.bounds;
    const cam = new THREE.PerspectiveCamera(this.baseFov ?? 55, aspect, 0.1, 500);
    const corners = [];
    for (const x of [b.minX - 0.4, b.maxX + 0.4]) for (const z of [b.minZ - 0.4, b.maxZ + 0.4]) for (const y of [0, 1.8 + (b.maxY ?? 0)]) corners.push(new THREE.Vector3(x, y, z));
    const fits = (d) => {
      cam.position.copy(look).addScaledVector(dir, d);
      cam.lookAt(look);
      cam.updateMatrixWorld();
      const v = new THREE.Vector3();
      // arriba queda sitio para el marcador y abajo para los botones
      return corners.every((c) => (v.copy(c).project(cam), v.z < 1 && Math.abs(v.x) < 0.9 && v.y < 0.72 && v.y > -0.8));
    };
    let lo = 2, hi = 200;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    this.fitCache = { key, dist: hi };
    return hi;
  }

  #celebrateTarget() {
    const [hx, hz] = this.course.cup;
    const hc = groundHeight(this.course, hx, hz);
    const a = this.camYaw + Math.PI + (this.t - this.sunkAt) * 0.6;
    return { pos: new THREE.Vector3(hx + Math.sin(a) * 2.4, hc + 1.3, hz - Math.cos(a) * 2.4), look: new THREE.Vector3(hx, hc + 0.3, hz) };
  }

  #placeCamera(dt, snap = false) {
    let target;
    if (this.intro < 1) {
      const a = this.#overviewTarget(), f = this.#followTarget();
      const k = ease(Math.max(0, (this.intro - 0.35) / 0.65));
      target = { pos: a.pos.clone().lerp(f.pos, k), look: a.look.clone().lerp(f.look, k) };
      snap = true;
    } else if (this.sunk) target = this.#celebrateTarget();
    else if (this.overview) target = this.#overviewTarget();
    else {
      const drop = this.#dropTarget();
      // al entrar en la cueva la cámara salta dentro del volcán de golpe (sin cruzar la roca)
      if (drop && !this.inDrop) snap = true;
      this.inDrop = !!drop;
      target = drop ?? this.#followTarget();
    }

    this.camPos ??= target.pos.clone();
    this.camLook ??= target.look.clone();
    if (snap) {
      this.camPos.copy(target.pos);
      this.camLook.copy(target.look);
    } else {
      const k = damp(this.overview ? 4 : 7, dt);
      this.camPos.lerp(target.pos, k);
      this.camLook.lerp(target.look, k);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    if (this.trauma > 0.01) {
      const s = this.trauma * this.trauma * 0.09;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.rotation.z += (Math.random() - 0.5) * s * 0.6;
    }
  }

  /** Avisa a la interfaz de los segundos que quedan (null: sin contador). */
  #updateTimer() {
    const dl = this.deadlineTick;
    const left = dl == null || this.sunk || this.timedOut || this.locked ? null : Math.max(0, Math.ceil((dl - this.tick) * DT));
    if (left === this.timerShown) return;
    this.timerShown = left;
    if (left != null && left <= 5 && left > 0) sfx.tick();
    this.onTimer?.(left);
  }

  #addShake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /**
   * Nombres de los rivales: si se pisan en pantalla, se ve el del más cercano
   * y los de detrás se desvanecen (al salir todos del tee se amontonaban).
   */
  #declutterLabels() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    const placed = [];
    const v = new THREE.Vector3();
    const list = (this.bots ?? []).filter((b) => b.label.visible).map((b) => ({ b, d: this.camera.position.distanceTo(b.label.position) }));
    list.sort((a, b) => a.d - b.d);
    for (const { b, d } of list) {
      v.copy(b.label.position).project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      // tamaño aproximado de la etiqueta en pantalla
      const lw = (0.9 / d) * (h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))) * 0.75, lh = lw * 0.28;
      const hidden = v.z > 1 || placed.some((p) => Math.abs(p.x - x) < (p.w + lw) / 2 && Math.abs(p.y - y) < (p.h + lh) / 2);
      if (!hidden) placed.push({ x, y, w: lw, h: lh });
      b.labelFade = THREE.MathUtils.lerp(b.labelFade ?? 1, hidden ? 0 : 1, 0.2);
      b.label.material.opacity *= b.labelFade;
    }
  }

  /** Marca del hoyo sobre la bandera; fuera de pantalla se pega al borde con una flecha hacia él. */
  #updateCupMarker() {
    const el = this.cupMarker;
    if (!el) return;
    const c = this.course;
    const show = !c.noCup && !this.sunk && !this.timedOut && !this.paused && this.intro >= 1 && !this.overview
      && !isMoving(this.ball) && this.distanceToCup() > 2.5;
    if (!show) {
      if (!el.hidden) el.hidden = true;
      return;
    }
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.camera.updateMatrixWorld();
    const v = this.#cupV.set(c.cup[0], this.courseView.flag.pole.position.y + 1.1, c.cup[1]).project(this.camera);
    // detrás de la cámara la proyección sale invertida
    let x = v.z > 1 ? -v.x : v.x, y = v.z > 1 ? -v.y : v.y;
    const M = 0.9;
    const off = v.z > 1 || Math.abs(x) > M || Math.abs(y) > M;
    if (off) {
      const k = M / Math.max(Math.abs(x), Math.abs(y), 1e-6);
      x *= k;
      y *= k;
    }
    // sin pisar el HUD de arriba ni los botones de abajo
    const px = THREE.MathUtils.clamp((x * 0.5 + 0.5) * w, 26, w - 26);
    const py = THREE.MathUtils.clamp((-y * 0.5 + 0.5) * h, 120, h - 130);
    el.hidden = false;
    el.classList.toggle('off', off);
    el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    el.style.setProperty('--a', `${off ? Math.atan2(-y, x) : Math.PI / 2}rad`);
  }

  // ---------- input ----------

  #executeShot(power, dragTicks = 16, turns = 1) {
    if (power < 0.05 || isMoving(this.ball) || this.sunk || this.timedOut) return;
    if (this.course.noCup && this.strokes >= 1) return;
    const shot = quantizeShot(this.yaw, power);
    const v = shotVelocity(shot.yaw, shot.power);
    this.ball.vx = v.vx;
    this.ball.vz = v.vz;
    this.shots.push({ tick: this.tick, ...shot });
    this.aim.push({ d: Math.max(8, dragTicks), t: Math.max(1, turns + this.camTurns) });
    this.camTurns = 0;
    this.strokes++;
    sfx.hit(power);
    sfx.skin(this.skin.sfx.set, 'hit', { power });
    if (this.genericFx.hit) {
      this.particles.puff(new THREE.Vector3(this.ball.x, 0.05, this.ball.z), 0x9be37f, 8 + Math.round(power * 10), 1 + power, 0.18);
      this.waves.emit(this.ball.x, this.ball.z, 0xffffff, 0.5 + power * 0.9, 3);
    }
    this.skinFx.onHit(power, this.#fxPos.copy(this.ballRoot.position), this.#fxDir.set(v.vx, 0, v.vz).normalize());
    this.squash = 0.2 + power * 0.25;
    this.fovKick = power * 7;
    this.#addShake(power * power * 0.45);
    this.#vibrate(15);
    this.onStroke?.(this.strokes);
  }

  /** Controles elegidos en Ajustes (invertir, sensibilidad, rueda, vibración). Se leen en cada gesto. */
  #controls() {
    // se llama en cada movimiento del ratón: solo se recalcula cuando cambian los ajustes
    const c = settings.peek().controls;
    if (c !== this.#ctlSrc) {
      this.#ctlSrc = c;
      this.#ctl = inputFactors(c);
    }
    return this.#ctl;
  }
  #ctlSrc = null;
  #ctl = null;

  /** Vibra solo si el jugador no la ha quitado en Ajustes. */
  #vibrate(pattern) {
    if (settings.peek().controls.vibration) navigator.vibrate?.(pattern);
  }

  #bindInput() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';

    this.#onContextMenu = (e) => e.preventDefault();
    el.addEventListener('contextmenu', this.#onContextMenu);

    this.#onPointerLockChange = () => {
      const isLocked = typeof document !== 'undefined' && document.pointerLockElement === el;
      this.isPointerLocked = isLocked;
      if (this.container) {
        this.container.classList.toggle('pointer-locked', isLocked);
      }
    };
    this.#onPointerLockError = () => {
      this.isPointerLocked = false;
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerlockchange', this.#onPointerLockChange);
      document.addEventListener('pointerlockerror', this.#onPointerLockError);
    }

    this.#onClickCanvas = () => {
      if (this.#skipClick) { this.#skipClick = false; return; } // el toque que saltó la intro no hace nada más
      if (!this.sunk && !this.locked && this.intro >= 1) {
        this.requestPointerLock();
      }
    };
    el.addEventListener('click', this.#onClickCanvas);

    this.#onPointerDown = (e) => {
      unlockAudio();
      if (!this.ambientOn) {
        this.ambientOn = true;
        setAmbient(this.theme.sound);
      }
      // fuera del vivo, un toque durante la intro la termina; se evalúa antes del golpe y lo consume
      if (!this.paused && this.course && introSkipAction({ live: this.live, intro: this.intro, skipEnabled: INTRO_SKIP }) === 'skip') {
        this.intro = 1;
        this.#placeCamera(1, true);
        this.#skipClick = e.pointerType === 'mouse';
        return;
      }
      if (this.paused || !this.course || this.sunk || this.timedOut || this.locked || this.intro < 1) return;
      if (this.course.noCup && this.strokes >= 1) return;
      if (this.overview) {
        // En la vista completa del mapa no se tira: con el dedo se gira la maqueta
        if (e.pointerType !== 'mouse' && !this.drag) {
          try { el.setPointerCapture?.(e.pointerId); } catch {}
          this.drag = { id: e.pointerId, shoot: false, x: e.clientX, y: e.clientY, yaw: this.yaw, zoom: this.zoomLevel ?? 1, lastTick: this.yaw, start: this.tick, turns: 0, dir: 0 };
        }
        return;
      }

      const isMouse = e.pointerType === 'mouse';
      if (isMouse) {
        // Bloquear puntero en pantalla para no salir de ventana ni pasar a otros monitores
        this.requestPointerLock();
        if (e.button === 0) {
          if (isMoving(this.ball)) return;
          // NOTA: NO llamamos a setPointerCapture en ratón porque en Pointer Lock lanza InvalidStateError
          this.charging = true;
          this.chargeStartTick = this.tick;
          this.mouseTurns = 0;
          this.chargeAnchor = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            baseYaw: this.yaw,
            lastTick: this.yaw,
            dir: 0,
            startPower: this.power,
            dragY: 0,
            userAdjusted: false,
          };
          if (!this.aimStartTick) this.aimStartTick = this.tick;
        } else if (e.button === 2) {
          if (this.charging || this.power > 0) {
            this.charging = false;
            this.chargeAnchor = null;
            this.power = 0;
            this.fullPower = false;
            setCharge(0);
            this.onAim?.(0);
            this.aimDots.hide();
          } else {
            this.orbiting = true;
            this.orbitAnchorX = e.clientX;
          }
        }
      } else {
        if (this.drag) return;
        try { el.setPointerCapture?.(e.pointerId); } catch {}
        // solo se carga el tiro si el dedo empieza en la bola; si no, es la cámara
        const shoot = !isMoving(this.ball) && this.#touchesBall(e.clientX, e.clientY);
        this.drag = { id: e.pointerId, shoot, x: e.clientX, y: e.clientY, yaw: this.yaw, zoom: this.zoomLevel ?? 1, lastTick: this.yaw, start: this.tick, turns: 0, dir: 0 };
        if (shoot) this.#vibrate(6);
      }
    };

    this.#onPointerMove = (e) => {
      if (this.paused) return;
      const f = this.#controls();
      const isMouse = e.pointerType === 'mouse';
      if (isMouse) {
        const isLocked = typeof document !== 'undefined' && document.pointerLockElement === el;
        if (this.overview) {
          const dx = e.movementX ?? (this.lastMouseX != null ? e.clientX - this.lastMouseX : 0);
          const dy = e.movementY ?? (this.lastMouseY != null ? e.clientY - this.lastMouseY : 0);
          this.lastMouseX = e.clientX;
          this.lastMouseY = e.clientY;
          this.overviewYaw = (this.overviewYaw || 0) + dx * 0.004 * f.camX;
          this.overviewPitch = THREE.MathUtils.clamp((this.overviewPitch ?? 0.85) - dy * 0.003 * f.camY, 0.25, 1.35);
          return;
        }
        if (this.orbiting) {
          const mx = e.movementX ?? 0;
          if (isLocked) {
            this.orbitYaw = (this.orbitYaw || 0) + (mx * 2.8 * f.camX) / (el.clientWidth || 1);
          } else {
            const dx = e.clientX - this.orbitAnchorX;
            this.orbitYaw = (dx * 2.8 * f.camX) / (el.clientWidth || 1);
          }
          return;
        }
        if (this.charging && this.chargeAnchor) {
          const ca = this.chargeAnchor;
          const h = el.clientHeight || 1, w = el.clientWidth || 1;
          const my = e.movementY ?? 0;
          ca.dragY = (ca.dragY || 0) + my;
          const dy = isLocked ? ca.dragY : (e.clientY - ca.y);
          this.lastMouseY = e.clientY;
          this.lastMouseX = e.clientX;

          // Si el jugador desplaza el ratón verticalmente (> 3px), pasamos a calibración manual de fuerza
          if (Math.abs(isLocked ? ca.dragY : dy) > 3) {
            ca.userAdjusted = true;
            const baseP = ca.startPower || 0;
            this.power = THREE.MathUtils.clamp(baseP + (dy * f.power) / (h * 0.32), 0, 1);
          }

          // Ajuste simultáneo de dirección horizontal con el ratón
          const mx = isLocked ? (e.movementX ?? 0) : (e.clientX - (ca.px ?? ca.x));
          if (mx !== 0) {
            if (Math.sign(mx) !== ca.dir) {
              if (ca.dir) this.mouseTurns = (this.mouseTurns || 0) + 1;
              ca.dir = Math.sign(mx);
            }
            ca.baseYaw += (mx * 2.2 * (1 - 0.65 * this.power) * f.aim) / w;
            ca.px = e.clientX;
            this.yaw = ca.baseYaw;
          }
          if (Math.abs(this.yaw - ca.lastTick) > 0.08) {
            ca.lastTick = this.yaw;
            sfx.tick();
          }
          setCharge(this.power);
          if (this.power >= 1 && !this.fullPower) {
            sfx.full();
          }
          this.fullPower = this.power >= 1;
          this.onAim?.(this.power);
          return;
        }
        // Apuntado libre al mover el cursor sin pulsar botones
        if (!isMoving(this.ball) && !this.sunk && this.intro >= 1) {
          const dx = e.movementX ?? (this.lastMouseX != null ? e.clientX - this.lastMouseX : 0);
          this.lastMouseX = e.clientX;
          if (dx !== 0) {
            if (Math.sign(dx) !== this.mouseDir) {
              if (this.mouseDir) this.mouseTurns = (this.mouseTurns || 0) + 1;
              this.mouseDir = Math.sign(dx);
            }
            const sens = 0.0032 * f.aim;
            this.yaw += dx * sens;
            if (Math.abs(this.yaw - this.lastMouseTick) > 0.08) {
              this.lastMouseTick = this.yaw;
              sfx.tick();
            }
          }
        }
      } else {
        const d = this.drag;
        if (!d || e.pointerId !== d.id) return;
        const h = el.clientHeight || 1, w = el.clientWidth || 1;
        if (this.overview) {
          // en la vista de mapa el dedo gira la maqueta (no toca el apuntado)
          this.overviewYaw = (this.overviewYaw || 0) - (e.clientX - (d.px ?? d.x)) * (5 / w) * f.camX;
          this.overviewPitch = THREE.MathUtils.clamp((this.overviewPitch ?? 0.85) + (e.clientY - (d.py ?? d.y)) * (2.5 / h) * f.camY, 0.25, 1.35);
          d.px = e.clientX;
          d.py = e.clientY;
          return;
        }
        if (!d.shoot) {
          // cámara: a los lados gira alrededor de la bola, arriba y abajo acerca o aleja
          const dx = e.clientX - (d.px ?? d.x);
          if (dx && Math.sign(dx) !== d.dir) {
            if (d.dir) this.camTurns++;
            d.dir = Math.sign(dx);
          }
          d.yaw -= (dx * 3.2 * f.camX) / w;
          d.px = e.clientX;
          this.yaw = d.yaw;
          this.zoomLevel = THREE.MathUtils.clamp(d.zoom - ((e.clientY - d.y) * f.camY) / (h * 0.8), 0.65, 1.55);
          if (Math.abs(this.yaw - d.lastTick) > 0.12) {
            d.lastTick = this.yaw;
            sfx.tick();
          }
          return;
        }
        const canShoot = !isMoving(this.ball);
        this.power = canShoot ? THREE.MathUtils.clamp(((e.clientY - d.y) * f.power) / (h * 0.32), 0, 1) : 0;
        const dx = e.clientX - (d.px ?? d.x);
        if (dx && Math.sign(dx) !== d.dir) {
          if (d.dir) d.turns++;
          d.dir = Math.sign(dx);
        }
        d.yaw += (dx * 2.4 * (1 - 0.65 * this.power) * f.aim) / w;
        d.px = e.clientX;
        this.yaw = d.yaw;
        if (Math.abs(this.yaw - d.lastTick) > 0.08) {
          d.lastTick = this.yaw;
          sfx.tick();
        }
        setCharge(this.power);
        if (this.power >= 1 && !this.fullPower) {
          sfx.full();
          this.#vibrate(12);
        }
        this.fullPower = this.power >= 1;
        this.onAim?.(this.power);
      }
    };

    this.#onPointerUp = (e) => {
      if (this.paused || this.overview) return;
      const isMouse = e.pointerType === 'mouse';
      if (isMouse) {
        if (e.button === 0 && this.charging) {
          if (el.hasPointerCapture?.(e.pointerId)) {
            try { el.releasePointerCapture(e.pointerId); } catch {}
          }
          const power = this.power;
          const dragTicks = Math.max(12, this.tick - this.chargeStartTick);
          const turns = Math.max(1, this.mouseTurns || 1);
          this.charging = false;
          this.chargeAnchor = null;
          this.power = 0;
          this.fullPower = false;
          setCharge(0);
          this.onAim?.(0);
          this.aimDots.hide();
          if (power >= 0.04) {
            this.#executeShot(power, dragTicks, turns);
          }
          this.mouseTurns = 0;
        } else if (e.button === 2) {
          this.orbiting = false;
          this.orbitYaw = 0;
        }
      } else {
        const d = this.drag;
        if (!d || e.pointerId !== d.id) return;
        this.drag = null;
        if (!d.shoot) return;
        const power = this.power;
        this.power = 0;
        this.fullPower = false;
        setCharge(0);
        this.onAim?.(0);
        this.aimDots.hide();
        this.#executeShot(power, this.tick - d.start, d.turns);
      }
    };

    this.#onPointerCancel = (e) => {
      if (e.pointerType === 'mouse') {
        // Al entrar en pointer lock o cambiar captura, el navegador emite pointercancel en mouse.
        // No cancelamos el tiro en ratón por este evento de transición.
        return;
      } else if (this.drag?.id === e.pointerId) {
        this.drag = null;
        this.power = 0;
        this.fullPower = false;
        setCharge(0);
        this.onAim?.(0);
      }
    };

    this.#onWheel = (e) => {
      e.preventDefault();
      if (this.paused) return;
      if (this.overview) {
        const delta = Math.sign(e.deltaY) * 0.08;
        this.zoomLevel = THREE.MathUtils.clamp((this.zoomLevel ?? 1) + delta, 0.55, 1.9);
        return;
      }
      const f = this.#controls();
      // Ctrl o Alt pulsado, la bola en movimiento o la rueda puesta en «solo zoom» (Ajustes): zoom de cámara
      if (!f.wheelPower || e.ctrlKey || e.altKey || isMoving(this.ball) || this.sunk || this.intro < 1) {
        const delta = Math.sign(e.deltaY) * 0.08;
        this.zoomLevel = THREE.MathUtils.clamp((this.zoomLevel ?? 1) + delta, 0.65, 1.55);
        return;
      }
      // Con la bola parada, la rueda del ratón ajusta directamente la fuerza de tiro:
      // Hacia arriba: más fuerte (+5%). Hacia abajo: más flojo (-5%).
      const delta = -Math.sign(e.deltaY) * 0.05;
      this.power = THREE.MathUtils.clamp(Math.round((this.power + delta) * 100) / 100, 0, 1);
      if (this.charging && this.chargeAnchor) {
        this.chargeAnchor.userAdjusted = true;
        const h = el.clientHeight || 1;
        const isLocked = typeof document !== 'undefined' && document.pointerLockElement === el;
        const dy = isLocked ? (this.chargeAnchor.dragY || 0) : ((this.lastMouseY ?? this.chargeAnchor.y) - this.chargeAnchor.y);
        this.chargeAnchor.startPower = THREE.MathUtils.clamp(this.power - (dy * f.power) / (h * 0.32), 0, 1);
      }
      setCharge(this.power);
      this.onAim?.(this.power);
      if (this.power >= 1 && !this.fullPower) {
        sfx.full();
        this.fullPower = true;
      } else if (this.power < 1) {
        this.fullPower = false;
      }
      if (this.power <= 0.02) {
        this.aimDots.hide();
      }
    };

    this.#onKeyDown = (e) => {
      if (e.code === 'Space') {
        if (!this.sunk && this.intro >= 1) {
          e.preventDefault();
          this.setOverview(!this.overview);
        }
      } else if (e.code === 'Escape') {
        e.preventDefault();
        if (this.overview) {
          this.setOverview(false);
          return;
        }
        if (this.charging || this.power > 0) {
          this.charging = false;
          this.chargeAnchor = null;
          this.power = 0;
          this.fullPower = false;
          setCharge(0);
          this.onAim?.(0);
          this.aimDots.hide();
        }
        this.exitPointerLock();
        this.onOpenSettings?.();
      }
    };

    this.#onKeyUp = () => {};

    this.#onBlur = () => {
      if (this.charging || this.power > 0) {
        this.charging = false;
        this.chargeAnchor = null;
        this.power = 0;
        this.fullPower = false;
        setCharge(0);
        this.onAim?.(0);
        this.aimDots.hide();
      }
    };

    el.addEventListener('pointerdown', this.#onPointerDown);
    window.addEventListener('pointermove', this.#onPointerMove);
    window.addEventListener('pointerup', this.#onPointerUp);
    window.addEventListener('pointercancel', this.#onPointerCancel);
    el.addEventListener('wheel', this.#onWheel, { passive: false });
    window.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('keyup', this.#onKeyUp);
    window.addEventListener('blur', this.#onBlur);
  }

  #unbindInput() {
    this.exitPointerLock();
    if (typeof document !== 'undefined') {
      if (this.#onPointerLockChange) document.removeEventListener('pointerlockchange', this.#onPointerLockChange);
      if (this.#onPointerLockError) document.removeEventListener('pointerlockerror', this.#onPointerLockError);
    }
    const el = this.renderer?.domElement;
    if (el) {
      if (this.#onClickCanvas) el.removeEventListener('click', this.#onClickCanvas);
      if (this.#onContextMenu) el.removeEventListener('contextmenu', this.#onContextMenu);
      if (this.#onPointerDown) el.removeEventListener('pointerdown', this.#onPointerDown);
      if (this.#onWheel) el.removeEventListener('wheel', this.#onWheel);
    }
    if (this.#onPointerMove) window.removeEventListener('pointermove', this.#onPointerMove);
    if (this.#onPointerUp) window.removeEventListener('pointerup', this.#onPointerUp);
    if (this.#onPointerCancel) window.removeEventListener('pointercancel', this.#onPointerCancel);
    if (this.#onKeyDown) window.removeEventListener('keydown', this.#onKeyDown);
    if (this.#onKeyUp) window.removeEventListener('keyup', this.#onKeyUp);
    if (this.#onBlur) window.removeEventListener('blur', this.#onBlur);
  }

  #predictPath() {
    const fwd = forwardOf(this.yaw);
    const sim = { x: this.ball.x, z: this.ball.z, vx: fwd.x * this.power * MAX_SHOT_SPEED, vz: fwd.z * this.power * MAX_SHOT_SPEED };
    const pts = [];
    const maxLen = 1.2 + this.power * 4.5;
    let travelled = 0, sinceBounce = -1, lastX = sim.x, lastZ = sim.z, acc = 0;
    const course = { ...this.course, spinners: [] }; // la previsión ignora las aspas
    for (let i = 0; i < 1200 && travelled < maxLen; i++) {
      const r = step(course, this.segs, sim, this.t, DT);
      const d = r.portal >= 0 ? 0 : Math.hypot(sim.x - lastX, sim.z - lastZ);
      travelled += d;
      acc += d;
      lastX = sim.x;
      lastZ = sim.z;
      if (acc >= 0.22) {
        acc = 0;
        const p = ballPose(this.course, sim);
        pts.push({ x: p.x, y: p.y - BALL_R, z: p.z });
      }
      if (r.hit > 0 && sinceBounce < 0) sinceBounce = 0;
      if (sinceBounce >= 0 && (sinceBounce += d) > 1) break;
      if (r.sunk || !isMoving(sim)) break;
    }
    return pts;
  }

  #tickBots() {
    this.#disqualifyLateBots(this.tick);
    for (const b of this.bots) {
      // dónde estaba antes del paso, para dibujarla entre pasos (ver #renderPose)
      const p = ballPose(this.course, b.ball);
      b.prevPose ??= { x: 0, y: 0, z: 0 };
      b.prevPose.x = p.x;
      b.prevPose.y = p.y;
      b.prevPose.z = p.z;
      const r = b.tick(this.t, DT);
      if (!r) continue;
      const dx = b.ball.x - this.ball.x, dz = b.ball.z - this.ball.z;
      const dist = Math.hypot(dx, dz);
      const right = forwardOf(this.camYaw + Math.PI / 2);
      const pan = THREE.MathUtils.clamp((dx * right.x + dz * right.z) / 4, -1, 1);
      if (r.shot) {
        sfx.rivalHit(dist, pan);
        if (this.genericFx.hit) this.particles.puff(new THREE.Vector3(b.ball.x, 0.05, b.ball.z), 0x9be37f, 8 + Math.round(r.shot * 10), 1 + r.shot, 0.18);
      }
      if (r.portal >= 0) this.particles.puff(new THREE.Vector3(b.ball.x, 0.1, b.ball.z), 0xffb020, 8, 1.2, 0.16);
      if (r.lava) this.particles.puff(new THREE.Vector3(r.lava[0], 0, r.lava[1]), r.pit ? 0x2a2420 : r.water ? 0x9fe8ff : 0xffa030, 10, 1.6, 0.12);
      if (r.bumper < 0 && r.hit > 2 && !r.shot) {
        if (this.genericFx.wall) this.particles.puff(new THREE.Vector3(b.ball.x, b.mesh.position.y, b.ball.z), 0xf3e3c3, 5, 0.8, 0.14);
      }
      if (r.sunk) {
        b.sunk = true;
        if (!this.live) this.#noteSunk(this.tick);
        else if (b.remote) this.#noteSunk(r.sunkTick ?? this.tick);
        sfx.rivalCup(pan);
        this.particles.puff(new THREE.Vector3(b.ball.x, 0.1, b.ball.z), new THREE.Color(b.player.color).getHex(), 12, 1.2, 0.18);
      }
      if (r.shot || r.finished) this.onRival?.(b.player, { strokes: b.strokes, sunk: !!r.sunk, done: b.done, dq: !!b.dq });
    }
  }

  /** ¿Va a entrar en el próximo medio segundo un golpe largo? Para la cámara lenta. */
  #willSinkSoon() {
    if (!this.course || this.sunk || this.course.noCup || !isMoving(this.ball)) return false;
    const speed = Math.hypot(this.ball.vx, this.ball.vz);
    if (speed < 1.2 || this.distanceToCup() > 1.8) return false;
    const sim = { ...this.ball };
    for (let i = 1; i <= 60; i++) if (step(this.course, this.segs, sim, this.t + i * DT, DT).sunk) return true;
    return false;
  }

  // ---------- bucle ----------

  #frame() {
    const perfFirst = PERF && this.perfFirst;
    if (perfFirst) {
      this.perfFirst = false;
      perf.mark('frame1:start', { gl: perf.gl(this.renderer, 'frame1:start') });
    }
    const now = performance.now();
    this.perf?.tick(now);
    this.resGov.tick(now);
    const realDt = Math.min(this.clock.getDelta(), 0.1);
    if (this.intro < 1) this.intro = Math.min(1, this.intro + realDt / INTRO_SECONDS);
    this.timeScale += ((this.#willSinkSoon() ? SLOWMO : 1) - this.timeScale) * damp(this.timeScale > 0.6 ? 14 : 5, realDt);
    // la cámara lenta solo estira el tiempo: la física sigue a paso fijo y el servidor ve los mismos pasos
    const dt = realDt * this.timeScale;
    this.acc += dt;
    while (this.acc >= DT) {
      this.acc -= DT;
      this.tick++;
      this.t = this.tick * DT;
      if (this.live ? this.tick >= this.botStartTick : this.intro >= 1 && !this.locked) this.#tickBots();
      // se acabó el tiempo: lo que entre en el paso del límite aún vale
      if (!this.sunk && !this.timedOut && this.deadlineTick != null && this.tick > this.deadlineTick) this.#timeUp();
      this.#keepPrevPose();
      if (this.sunk || this.paused || this.timedOut) continue;
      const wasMoving = isMoving(this.ball);
      const vx0 = this.ball.vx, vz0 = this.ball.vz;
      // se simula también con la bola parada: un aspa puede empujarla
      const r = step(this.course, this.segs, this.ball, this.t, DT);
      const pose = ballPose(this.course, this.ball);
      const pos = this.#pos.set(pose.x, pose.y, pose.z);
      if (r.portal >= 0) this.cyberFx?.onPortal(r.portal);
      if (r.portal >= 0 && this.course.portals[r.portal].tube) {
        // entra en un tubo: la bola viaja por dentro y la cámara la sigue
        sfx.portal();
        this.particles.puff(pos, 0x9be37f, 10, 1.2, 0.16);
      } else if (r.portal >= 0) {
        const p = this.course.portals[r.portal];
        sfx.portal();
        this.particles.puff(new THREE.Vector3(p.a[0], 0.1, p.a[1]), 0xb46cff, 14, 1.6, 0.2);
        this.particles.puff(pos, 0xffb020, 14, 1.6, 0.2);
        this.waves.emit(p.b[0], p.b[1], 0xffb020, 1.4, 2);
        // la cámara salta con la bola en vez de cruzar el campo
        const jump = new THREE.Vector3(p.b[0] - p.a[0], 0, p.b[1] - p.a[1]);
        this.camPos?.add(jump);
        this.camLook?.add(jump);
        this.#addShake(0.25);
        this.#vibrate(20);
      }
      if (r.launch) {
        // sale volando por el labio de la rampa
        sfx.boost();
        this.particles.puff(pos, 0xffb020, 10, 1.4, 0.16);
        this.squash = Math.max(this.squash, 0.2);
        this.#addShake(0.15);
        this.#vibrate(12);
      }
      if (r.landed && !r.lava) {
        sfx.wall(Math.min(9, r.impact * 1.6));
        this.particles.puff(new THREE.Vector3(pose.x, pose.ground + 0.03, pose.z), 0x8a7470, 8, 1, 0.16);
        this.squash = Math.max(this.squash, Math.min(0.3, r.impact * 0.08));
        this.#addShake(Math.min(0.3, r.impact * 0.06));
      }
      if (r.pit) {
        // cae a un agujero: polvo en el borde y vuelve a su sitio
        const [lx, lz] = r.lava;
        sfx.fall();
        this.particles.puff(new THREE.Vector3(lx, 0, lz), 0x6b5a4a, 14, 1.6, 0.2);
        this.waves.emit(this.ball.x, this.ball.z, 0xffffff, 1.2, 2);
        this.#addShake(0.25);
        this.#vibrate([20, 30, 20]);
        this.onFall?.();
      } else if (r.outside) {
        // saltó por encima del muro de fuera: vuelve a su sitio
        const [lx, lz] = r.lava;
        sfx.fall();
        this.particles.puff(new THREE.Vector3(lx, 0, lz), 0x8fbf5a, 12, 1.6, 0.18);
        this.#addShake(0.2);
        this.#vibrate([20, 30, 20]);
        this.onOut?.();
      } else if (r.water) {
        // cae al río: salpica y vuelve a su sitio
        const [lx, lz] = r.lava;
        sfx.fall();
        this.particles.puff(new THREE.Vector3(lx, 0, lz), 0x9fe8ff, 18, 2, 0.16);
        this.waves.emit(lx, lz, 0x7fdcff, 1.2, 2.2);
        this.#addShake(0.25);
        this.#vibrate([20, 30, 20]);
        this.onWater?.();
      } else if (r.lava) {
        // se quema en la lava: chispas y humo donde ha caído y vuelve a su sitio
        const [lx, lz] = r.lava;
        const at = new THREE.Vector3(lx, 0, lz);
        sfx.lava();
        this.particles.puff(at, 0xffa030, 18, 2.2, 0.14);
        this.particles.puff(at.clone().setY(0.2), 0x3a3036, 10, 1.2, 0.35);
        this.waves.emit(lx, lz, 0xff6a1a, 1.2, 2.2);
        this.#addShake(0.35);
        this.#vibrate([40, 30, 40]);
        this.onLava?.();
      }
      if (r.bumper >= 0) {
        this.courseView.bumpers[r.bumper].userData.squash = 0.18;
        this.cyberFx?.onBumper(r.bumper);
        sfx.bumper();
        this.skinFx.onBumper(pos);
        if (this.genericFx.wall) {
          this.particles.puff(pos, 0xffffff, 6, 1.2, 0.15);
          const b = this.course.bumpers[r.bumper];
          this.waves.emit(b.x, b.z, 0xffffff, b.r * 3, 3.5);
        }
        this.squash = Math.max(this.squash, 0.15);
        this.#addShake(Math.min(0.3, r.hit * 0.04));
      } else if (r.hit > 2) {
        sfx.wall(r.hit);
        const wallPower = Math.min(1, r.hit / 8);
        sfx.skin(this.skin.sfx.set, 'wall', { power: wallPower });
        this.skinFx.onWall(wallPower, pos, this.#bounceNormal(vx0, vz0, this.ball) ?? this.#fxNormal.set(0, 1, 0));
        if (this.genericFx.wall) this.particles.puff(pos, 0xf3e3c3, 5, 0.8, 0.14);
        this.squash = Math.max(this.squash, Math.min(0.25, r.hit * 0.03));
        if (r.hit > 4) {
          this.#vibrate(8);
          this.#addShake(Math.min(0.35, (r.hit - 4) * 0.06));
        }
      }
      // el hoyo tiene borde: suena el golpe contra el canto y, si al final se sale, "¡uy!"
      const toCup = Math.hypot(this.ball.x - this.course.cup[0], this.ball.z - this.course.cup[1]);
      if (!this.course.noCup) {
        if (r.lip) {
          sfx.lip();
          this.particles.puff(pos, 0xffffff, 4, 0.8, 0.1);
          this.#addShake(0.1);
          this.lipped = true;
        }
        if (this.lipped && !r.sunk && !this.ball.cup && toCup > CUP_R + 0.1) {
          this.lipped = false;
          this.skinFx.onLip(pos);
          if (this.genericFx.lip) this.particles.puff(pos, 0xffffff, 6, 1, 0.12);
          this.onLip?.();
        }
      }
      const sand = inSand(this.course, this.ball.x, this.ball.z);
      if (sand && !this.wasInSand && wasMoving) {
        sfx.sand();
        this.particles.puff(pos, 0xf0d58a, 14, 1.6, 0.2);
      }
      this.wasInSand = sand;
      const boost = !!onBoost(this.course, this.ball.x, this.ball.z);
      if (boost && !this.wasOnBoost) {
        sfx.boost();
        this.particles.puff(pos, 0x5fd0ff, 10, 1.4, 0.2);
      }
      this.wasOnBoost = boost;
      if (r.sunk) {
        this.sunk = true;
        this.sunkAt = this.t;
        this.sunkTick = this.tick;
        this.#noteSunk(this.tick);
        this.exitPointerLock();
        sfx.cup();
        sfx.skin(this.skin.sfx.set, 'sink', { power: 1 });
        const cupPos = this.#fxCup.set(this.course.cup[0], groundHeight(this.course, ...this.course.cup), this.course.cup[1]);
        this.skinFx.onSink(cupPos);
        this.onCup?.(this.strokes);
        if (this.genericFx.sink) this.particles.confetti(new THREE.Vector3().copy(cupPos));
        this.waves.emit(this.course.cup[0], this.course.cup[1], 0xffe066, 2.4, 1.4);
        this.waves.emit(this.course.cup[0], this.course.cup[1], 0xffffff, 1.4, 2);
        this.#addShake(0.3);
        this.#vibrate([30, 40, 60]);
        setTimeout(() => this.onSunk?.(this.strokes), 2200);
      } else if (wasMoving && !isMoving(this.ball)) this.onRest?.(this.strokes);
    }

    this.#updateTimer();

    // control de carga de tiro con ratón
    if (!isMoving(this.ball) && !this.sunk && !this.timedOut && this.intro >= 1 && !this.locked && !this.overview) {
      if (this.charging) {
        if (!this.chargeAnchor?.userAdjusted) {
          const elapsedSec = (this.tick - this.chargeStartTick) * DT;
          const base = this.chargeAnchor?.startPower || 0;
          this.power = THREE.MathUtils.clamp(base + elapsedSec / 1.4, 0, 1);
          setCharge(this.power);
          if (this.power >= 1 && !this.fullPower) {
            sfx.full();
            this.fullPower = true;
          }
          this.onAim?.(this.power);
        }
      }
    }

    // la cámara gira suavemente hacia donde rueda la bola
    const speed = Math.hypot(this.ball.vx, this.ball.vz);
    // en un looping o un tubo la dirección da vueltas: la cámara espera a la salida
    if (speed > 1.2 && !this.drag && !this.charging && !this.timedOut && !this.ball.track) {
      const velYaw = Math.atan2(this.ball.vx, -this.ball.vz);
      this.yaw = lerpAngle(this.yaw, velYaw, damp(1.2, dt));
    }
    const targetCamYaw = this.orbiting ? this.yaw + (this.orbitYaw || 0) : this.yaw;
    this.camYaw = (this.drag || this.charging || this.orbiting)
      ? targetCamYaw
      : lerpAngle(this.camYaw, targetCamYaw, damp(10, dt));

    if (this.renderer?.domElement) {
      // solo se toca el estilo cuando cambia (cada escritura obliga al navegador a recalcular estilos)
      const cursor = this.orbiting ? 'grabbing' : this.charging || (!isMoving(this.ball) && !this.sunk && this.intro >= 1) ? 'crosshair' : 'default';
      if (cursor !== this.cursorShown) this.renderer.domElement.style.cursor = this.cursorShown = cursor;
    }

    // bola: rodar y caer en el hoyo
    const sinkT = this.sunk ? Math.min(1, (this.t - this.sunkAt) * 4) : 0;
    const pose = this.#renderPose();
    this.ballRoot.position.set(pose.x, pose.y - sinkT * 0.3, pose.z);
    if (speed > 0) {
      this.ballMesh.rotateOnWorldAxis(this.#axis.set(-this.ball.vz, 0, this.ball.vx).normalize(), (speed * dt) / BALL_R);
    }
    // aplastamiento elástico al golpear o chocar
    this.squash *= Math.exp(-realDt * 9);
    const wob = this.squash * Math.cos(this.t * 40);
    this.ballRoot.scale.set(1 + wob * 0.5, 1 - wob, 1 + wob * 0.5);
    this.ballShadow.position.set(pose.x, pose.ground + 0.004, pose.z);
    this.ballShadow.visible = !this.sunk && !pose.onTrack;
    this.trauma = Math.max(0, this.trauma - realDt * 2.2);
    this.fovKick *= Math.exp(-realDt * 5);
    const fov = this.baseFov + this.fovKick - (1 - this.timeScale) * 8;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    setRolling(this.sunk ? 0 : speed, this.wasInSand);
    for (const b of this.bots) {
      if (b.sunk) b.sinkT = Math.min(1, b.sinkT + dt * 4);
      const bp = ballPose(this.course, b.ball), pp = b.prevPose;
      if (pp && Math.abs(bp.x - pp.x) + Math.abs(bp.z - pp.z) < 0.6) {
        const a = THREE.MathUtils.clamp(this.acc / DT, 0, 1);
        bp.x = pp.x + (bp.x - pp.x) * a;
        bp.y = pp.y + (bp.y - pp.y) * a;
        bp.z = pp.z + (bp.z - pp.z) * a;
      }
      b.mesh.position.set(bp.x, bp.y - b.sinkT * 0.3, bp.z);
      const v = Math.hypot(b.ball.vx, b.ball.vz);
      if (v > 0) b.mesh.rotateOnWorldAxis(this.#axis.set(-b.ball.vz, 0, b.ball.vx).normalize(), (v * dt) / BALL_R);
      b.label.position.set(bp.x, bp.y + 0.37, bp.z);
      b.label.visible = !b.done;
      b.mesh.visible = b.sinkT < 1;
      // las etiquetas pegadas a la cámara estorban: se desvanecen de cerca
      const camD = this.camera.position.distanceTo(b.mesh.position);
      b.label.material.opacity = THREE.MathUtils.clamp((camD - 3.7) / 2, 0, 1);
    }
    this.#declutterLabels();
    this.ballGlow.position.set(pose.x, pose.ground + 0.006, pose.z);
    this.ballGlow.visible = !this.sunk && !pose.onTrack;
    this.ballGlow.material.opacity = isMoving(this.ball) ? 0.15 : 0.35 + Math.sin(this.t * 4) * 0.15;

    this.course.spinners.forEach((sp, i) => {
      const [[ax, az], [bx, bz]] = spinnerSegment(sp, this.t);
      this.courseView.spinners[i].rotation.y = -Math.atan2(bz - az, bx - ax);
    });

    if ((this.drag || this.charging || this.spaceCharging || this.power > 0.02) && this.power > 0.02) {
      const color = this.#aimColor.setHSL(0.33 - this.power * 0.33, 0.95, 0.55);
      this.aimDots.show(this.#predictPath(), color, this.t);
      this.aimDots.showRing(this.ballRoot.position, this.t);
    } else this.aimDots.hide();

    // la sombra sigue a la bola, salvo si el entorno la deja fija sobre la pista
    const sun = this.env.sun, at = this.env.shadowAnchor ?? this.ball;
    sun.position.set(at.x, 0, at.z).addScaledVector(this.env.sunDir, 30);
    sun.target.position.set(at.x, 0, at.z);

    this.env.update(this.t, dt);
    this.#placeCamera(realDt);
    this.env.lod?.(this.camera.position);
    this.courseView.update(this.t, this.camera.position, this.ball, this.camLook, this.overview);
    this.cyberFx?.update(this.t, this.ball);
    this.fxCtx.speed = speed;
    this.fxCtx.moving = speed > 0.5;
    this.skinFx.update(this.t, dt, this.fxCtx);
    this.matCtx.speed = this.skinFx.speedN;
    this.matCtx.impact = this.skinFx.impact;
    this.matCtx.state = this.skinFx.state;
    this.skinHandle.update(this.t, dt, this.matCtx);
    this.particles.update(dt, this.camera);
    this.waves.update(realDt);
    this.#updateCupMarker();
    this.#updateShadows(pose);
    if (this.usePost) {
      this.renderPass.scene = this.scene;
      this.composer.render(realDt);
    } else this.renderer.render(this.scene, this.camera);
    if (perfFirst) {
      perf.mark('frame1:end', { gl: perf.gl(this.renderer, 'frame1:end') });
      this.perfHole = perf.hole();
      perf.startFrames(`hole${this.perfHole}`);
    }
    if (PERF && this.perfPlayable && this.intro >= 1) {
      this.perfPlayable = false;
      perf.mark('playable');
    }
  }

  // ---------- suavidad ----------

  #prevPose = { x: 0, y: 0, z: 0, ground: 0, onTrack: false, ok: false };
  #lerpPose = { x: 0, y: 0, z: 0, ground: 0, onTrack: false };
  #shadowAt = { x: NaN, y: NaN, z: NaN, frame: 0 };

  /** Antes de cada paso de física: guarda dónde estaba la bola para dibujar entre dos pasos. */
  #keepPrevPose() {
    const p = ballPose(this.course, this.ball), o = this.#prevPose;
    o.x = p.x;
    o.y = p.y;
    o.z = p.z;
    o.ground = p.ground;
    o.ok = true;
  }

  /**
   * Posición dibujada de la bola: entre el paso anterior y el actual según el
   * tiempo que sobra (acc / DT). La física va a 120 pasos/s y la pantalla a 60,
   * 90 o 120 Hz: sin esto la bola avanza a saltos desiguales (tirones). Solo es
   * dibujo: la simulación y lo que se manda al servidor no cambian.
   */
  #renderPose() {
    const cur = ballPose(this.course, this.ball), prev = this.#prevPose, o = this.#lerpPose;
    const a = THREE.MathUtils.clamp(this.acc / DT, 0, 1);
    // tras un salto (portal, vuelta al tee) no se interpola
    const jump = !prev.ok || Math.abs(cur.x - prev.x) + Math.abs(cur.z - prev.z) + Math.abs(cur.y - prev.y) > 0.6;
    const k = jump || this.sunk ? 1 : a;
    o.x = prev.x + (cur.x - prev.x) * k;
    o.y = prev.y + (cur.y - prev.y) * k;
    o.z = prev.z + (cur.z - prev.z) * k;
    o.ground = prev.ground + (cur.ground - prev.ground) * k;
    if (jump) o.ground = cur.ground;
    o.onTrack = cur.onTrack;
    return o;
  }

  /**
   * El mapa de sombras es una pasada entera de la escena: solo se repite si la
   * bola se ha movido o hay piezas que se mueven (aspas, molinos, bloques).
   * En Alto, cada frame; en Medio, las piezas móviles cada dos frames (tres en el móvil).
   */
  #updateShadows(pose) {
    const sm = this.renderer.shadowMap;
    if (!sm.enabled) return;
    const s = this.#shadowAt;
    s.frame++;
    const c = this.course;
    const movers = (c.spinners?.length || 0) + (c.movers?.length || 0) + (c.windmills?.length || 0) > 0;
    const moved = Math.abs(pose.x - s.x) + Math.abs(pose.y - s.y) + Math.abs(pose.z - s.z) > 0.002 || !(s.x === s.x);
    if (moved || (movers && (getQuality() === 'high' || s.frame % (IS_TOUCH ? 3 : 2) === 0))) {
      sm.needsUpdate = true;
      s.x = pose.x;
      s.y = pose.y;
      s.z = pose.z;
    }
  }
}
