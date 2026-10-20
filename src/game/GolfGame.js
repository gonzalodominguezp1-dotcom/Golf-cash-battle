import * as THREE from 'three';
import { BALL_R, CUP_R, DT, MAX_SHOT_SPEED, inSand, isMoving, onBoost, quantizeShot, segmentsOf, shotVelocity, spinnerSegment, step } from './physics.js';
import { Bot } from './bots.js';
import { THEMES } from './themes.js';
import { buildEnvironment, courseBounds } from './render/environment.js';
import { buildCourse } from './render/course.js';
import { AimDots, Particles, Shockwaves, Trail } from './render/effects.js';
import { ballTexture, labelTexture, softDotTexture } from './render/textures.js';
import { skinMaterial } from './render/ballSkins.js';
import { SKINS } from '../progress/skins.js';
import { setAmbient, setCharge, setRolling, sfx, stopAmbient, stopRolling, unlockAudio } from './audio.js';

const INTRO_SECONDS = 2.2;
const FOLLOW_DIST = 3.2;
const FOLLOW_HEIGHT = 1.45;
const LOOK_AHEAD = 2.2;
const SLOWMO = 0.35; // cámara lenta cuando la bola va a entrar
const CUP_CAPTURE = 3.5; // igual que en physics.js: más rápido, la bola salta el hoyo

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const forwardOf = (yaw) => new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/**
 * Hoyo en 3D con cámara en tercera persona detrás de la bola.
 * Controles: arrastra a los lados para apuntar y hacia abajo para cargar
 * la potencia; suelta para golpear.
 */
export class GolfGame {
  #onContextMenu = null;
  #onPointerDown = null;
  #onPointerMove = null;
  #onPointerUp = null;
  #onPointerCancel = null;
  #onWheel = null;
  #onKeyDown = null;
  #onKeyUp = null;

  constructor(container, { onStroke, onSunk, onAim, onRest, onCup, onRival, onLip } = {}) {
    this.container = container;
    this.onStroke = onStroke;
    this.onSunk = onSunk;
    this.onAim = onAim;
    this.onRest = onRest;
    this.onCup = onCup;
    this.onRival = onRival;
    this.onLip = onLip;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 400);
    this.clock = new THREE.Clock();
    this.acc = 0;
    this.t = 0;
    this.running = false;
    this.overview = false;
    this.zoomLevel = 1.0;
    this.orbitYaw = 0;
    this.orbiting = false;
    this.charging = false;
    this.spaceCharging = false;
    this.chargeAnchor = null;
    this.keyLeft = false;
    this.keyRight = false;
    this.keyShift = false;
    this.mouseTurns = 0;
    this.chargeStartTick = 0;
    this.aimStartTick = 0;
    this.lastMouseX = null;
    this.lastMouseTick = 0;
    this.#bindInput();
    this.resizeObserver = new ResizeObserver(() => this.#resize());
    this.resizeObserver.observe(container);
  }

  load(course, { bots = [], skin = SKINS[0] } = {}) {
    this.botPlayers = bots;
    this.skin = skin;
    this.course = course;
    this.theme = THEMES[course.theme] ?? THEMES.meadow;
    this.segs = segmentsOf(course);
    this.ball = { x: course.tee[0], z: course.tee[1], vx: 0, vz: 0 };
    this.strokes = 0;
    this.sunk = false;
    this.sunkAt = 0;
    this.t = 0;
    this.tick = 0;
    this.shots = []; // { tick, yaw, power }: lo que se manda al servidor
    this.aim = []; // gesto de cada tiro { d: pasos con el dedo puesto, t: giros al apuntar } para el antibots
    this.power = 0;
    this.drag = null;
    this.charging = false;
    this.spaceCharging = false;
    this.chargeAnchor = null;
    this.orbiting = false;
    this.orbitYaw = 0;
    this.keyLeft = false;
    this.keyRight = false;
    this.keyShift = false;
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
    this.overCup = false;
    this.fullPower = false;
    this.yaw = Math.atan2(course.cup[0] - course.tee[0], -(course.cup[1] - course.tee[1]));
    if (course.aimYaw !== undefined) this.yaw = course.aimYaw;
    this.camYaw = this.yaw;
    this.#buildScene();
    this.#resize();
    this.intro = 0;
    this.#placeCamera(1, true);
    if (!this.running) {
      this.running = true;
      this.clock.start();
      this.renderer.setAnimationLoop(() => this.#frame());
    }
  }

  setOverview(on) {
    this.overview = on;
  }

  distanceToCup() {
    return Math.hypot(this.ball.x - this.course.cup[0], this.ball.z - this.course.cup[1]);
  }

  /** Golpes de cada rival; los que no han terminado juegan lo que les queda al instante. */
  finishBots() {
    const out = {};
    for (const b of this.bots ?? []) out[b.player.id] = b.done ? b.strokes : b.finishInstantly(this.t);
    return out;
  }

  /** Desempate: distancia final de cada rival al objetivo. */
  botDistances() {
    const out = {};
    for (const b of this.bots ?? []) {
      if (!b.done) b.finishInstantly(this.t);
      out[b.player.id] = Math.hypot(b.ball.x - this.course.cup[0], b.ball.z - this.course.cup[1]);
    }
    return out;
  }

  rivals() {
    return (this.bots ?? []).map((b) => ({ id: b.player.id, strokes: b.strokes, done: b.done, sunk: b.sunk }));
  }

  dispose() {
    setCharge(0);
    stopAmbient();
    stopRolling();
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.#unbindInput?.();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------- escena ----------

  #buildScene() {
    const scene = new THREE.Scene();
    this.scene = scene;
    let seed = [...this.course.name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483647;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.env = buildEnvironment(scene, this.course, this.theme, rng);
    this.courseView = buildCourse(scene, this.course, this.theme);

    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 32, 24),
      skinMaterial(this.skin),
    );
    this.ballMesh.castShadow = true;
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

    // rivales: bolas fantasma con su nombre encima
    const ghostGeo = new THREE.SphereGeometry(BALL_R, 20, 14);
    this.bots = this.botPlayers.map((p) => {
      const bot = new Bot(p, this.course, this.segs, Math.random);
      const mesh = new THREE.Mesh(
        ghostGeo,
        new THREE.MeshStandardMaterial({ map: ballTexture(p.color), emissive: p.color, emissiveIntensity: 0.25, transparent: true, opacity: 0.75, roughness: 0.4 }),
      );
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(p.name, p.color), transparent: true, depthWrite: false }));
      label.scale.set(0.9, 0.225, 1);
      label.renderOrder = 10;
      scene.add(mesh, label);
      Object.assign(bot, { mesh, label, sinkT: 0 });
      return bot;
    });

    this.particles = new Particles(scene);
    this.trail = new Trail(scene, 28, this.skin.trail);
    this.aimDots = new AimDots(scene);
    this.waves = new Shockwaves(scene);

    const b = courseBounds(this.course);
    this.bounds = b;
  }

  #resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
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

  #followTarget() {
    const fwd = forwardOf(this.camYaw);
    const isWidescreen = (this.container.clientWidth || 1) >= (this.container.clientHeight || 1);
    const zoom = this.zoomLevel ?? 1;
    const baseDist = (isWidescreen ? 3.5 : FOLLOW_DIST) * zoom;
    const baseHeight = (isWidescreen ? 1.6 : FOLLOW_HEIGHT) * (0.85 + 0.15 * zoom);
    const dist = baseDist + this.power * 0.7;
    const pos = new THREE.Vector3(this.ball.x, 0, this.ball.z).addScaledVector(fwd, -dist);
    pos.y = baseHeight + this.power * 0.35;
    const look = new THREE.Vector3(this.ball.x, 0.15, this.ball.z).addScaledVector(fwd, LOOK_AHEAD);
    return { pos, look };
  }

  #overviewTarget() {
    const b = this.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const depth = b.maxZ - b.minZ, width = b.maxX - b.minX;
    const aspect = (this.container.clientWidth || 1) / (this.container.clientHeight || 1);
    const span = aspect > 1 ? Math.max(depth * 0.85, (width * 1.5) / aspect) : Math.max(depth, width * 1.6);
    return {
      pos: new THREE.Vector3(cx, span * (aspect > 1 ? 0.82 : 0.95), cz + span * 0.5),
      look: new THREE.Vector3(cx, 0, cz - 0.5),
    };
  }

  #celebrateTarget() {
    const [hx, hz] = this.course.cup;
    const a = this.camYaw + Math.PI + (this.t - this.sunkAt) * 0.6;
    return { pos: new THREE.Vector3(hx + Math.sin(a) * 2.4, 1.3, hz - Math.cos(a) * 2.4), look: new THREE.Vector3(hx, 0.3, hz) };
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
    else target = this.#followTarget();

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

  #addShake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  // ---------- input ----------

  #executeShot(power, dragTicks = 16, turns = 1) {
    if (power < 0.05 || isMoving(this.ball) || this.sunk) return;
    if (this.course.noCup && this.strokes >= 1) return;
    const shot = quantizeShot(this.yaw, power);
    const v = shotVelocity(shot.yaw, shot.power);
    this.ball.vx = v.vx;
    this.ball.vz = v.vz;
    this.shots.push({ tick: this.tick, ...shot });
    this.aim.push({ d: Math.max(8, dragTicks), t: Math.max(1, turns) });
    this.strokes++;
    sfx.hit(power);
    this.particles.puff(new THREE.Vector3(this.ball.x, 0.05, this.ball.z), 0x9be37f, 8 + Math.round(power * 10), 1 + power, 0.18);
    this.waves.emit(this.ball.x, this.ball.z, 0xffffff, 0.5 + power * 0.9, 3);
    this.squash = 0.2 + power * 0.25;
    this.fovKick = power * 7;
    this.#addShake(power * power * 0.45);
    navigator.vibrate?.(15);
    this.onStroke?.(this.strokes);
  }

  #bindInput() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';

    this.#onContextMenu = (e) => e.preventDefault();
    el.addEventListener('contextmenu', this.#onContextMenu);

    this.#onPointerDown = (e) => {
      unlockAudio();
      if (!this.ambientOn) {
        this.ambientOn = true;
        setAmbient(this.theme.sound);
      }
      if (!this.course || this.sunk || this.locked || this.intro < 1) return;
      if (this.course.noCup && this.strokes >= 1) return;

      const isMouse = e.pointerType === 'mouse';
      if (isMouse) {
        if (e.button === 0) {
          if (isMoving(this.ball)) return;
          el.setPointerCapture(e.pointerId);
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
          };
          if (!this.aimStartTick) this.aimStartTick = this.tick;
        } else if (e.button === 2) {
          if (this.charging || this.spaceCharging || this.power > 0) {
            this.charging = false;
            this.spaceCharging = false;
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
        el.setPointerCapture(e.pointerId);
        this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: this.yaw, lastTick: this.yaw, start: this.tick, turns: 0, dir: 0 };
      }
    };

    this.#onPointerMove = (e) => {
      const isMouse = e.pointerType === 'mouse';
      if (isMouse) {
        if (this.orbiting) {
          const dx = e.clientX - this.orbitAnchorX;
          this.orbitYaw = (dx * 2.8) / (el.clientWidth || 1);
          return;
        }
        if (this.charging && this.chargeAnchor) {
          const ca = this.chargeAnchor;
          const h = el.clientHeight || 1, w = el.clientWidth || 1;
          const dy = e.clientY - ca.y;
          this.lastMouseY = e.clientY;
          this.lastMouseX = e.clientX;
          // Arrastrar hacia abajo/atrás incrementa la fuerza con el ratón; empujar hacia adelante la reduce
          const baseP = ca.startPower || 0;
          this.power = THREE.MathUtils.clamp(baseP + (dy / (h * 0.32)), 0, 1);

          // Ajuste simultáneo de dirección horizontal con el ratón
          const dx = e.clientX - (ca.px ?? ca.x);
          if (dx !== 0) {
            if (Math.sign(dx) !== ca.dir) {
              if (ca.dir) this.mouseTurns = (this.mouseTurns || 0) + 1;
              ca.dir = Math.sign(dx);
            }
            ca.baseYaw += (dx * 2.2 * (1 - 0.65 * this.power)) / w;
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
            const sens = 0.0032;
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
        const canShoot = !isMoving(this.ball);
        this.power = canShoot ? THREE.MathUtils.clamp((e.clientY - d.y) / (h * 0.32), 0, 1) : 0;
        const dx = e.clientX - (d.px ?? d.x);
        if (dx && Math.sign(dx) !== d.dir) {
          if (d.dir) d.turns++;
          d.dir = Math.sign(dx);
        }
        d.yaw += (dx * 2.4 * (1 - 0.65 * this.power)) / w;
        d.px = e.clientX;
        this.yaw = d.yaw;
        if (Math.abs(this.yaw - d.lastTick) > 0.08) {
          d.lastTick = this.yaw;
          sfx.tick();
        }
        setCharge(this.power);
        if (this.power >= 1 && !this.fullPower) {
          sfx.full();
          navigator.vibrate?.(12);
        }
        this.fullPower = this.power >= 1;
        this.onAim?.(this.power);
      }
    };

    this.#onPointerUp = (e) => {
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
          this.#executeShot(power, dragTicks, turns);
          this.mouseTurns = 0;
        } else if (e.button === 2) {
          this.orbiting = false;
          this.orbitYaw = 0;
        }
      } else {
        const d = this.drag;
        if (!d || e.pointerId !== d.id) return;
        this.drag = null;
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
        this.charging = false;
        this.chargeAnchor = null;
        this.orbiting = false;
        this.orbitYaw = 0;
        this.power = 0;
        this.fullPower = false;
        setCharge(0);
        this.onAim?.(0);
        this.aimDots.hide();
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
      // Si el usuario mantiene pulsado Ctrl o Alt, o la bola está en movimiento, la rueda hace zoom de cámara:
      if (e.ctrlKey || e.altKey || isMoving(this.ball) || this.sunk || this.intro < 1) {
        const delta = Math.sign(e.deltaY) * 0.08;
        this.zoomLevel = THREE.MathUtils.clamp((this.zoomLevel ?? 1) + delta, 0.65, 1.55);
        return;
      }
      // Con la bola parada, la rueda del ratón ajusta directamente la fuerza de tiro:
      // Hacia arriba: más fuerte (+5%). Hacia abajo: más flojo (-5%).
      const delta = -Math.sign(e.deltaY) * 0.05;
      this.power = THREE.MathUtils.clamp(Math.round((this.power + delta) * 100) / 100, 0, 1);
      if (this.charging && this.chargeAnchor) {
        const h = el.clientHeight || 1;
        const dy = (this.lastMouseY ?? this.chargeAnchor.y) - this.chargeAnchor.y;
        this.chargeAnchor.startPower = THREE.MathUtils.clamp(this.power - (dy / (h * 0.32)), 0, 1);
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
      if (e.repeat && e.code !== 'ArrowLeft' && e.code !== 'ArrowRight' && e.code !== 'KeyA' && e.code !== 'KeyD' && e.code !== 'KeyW' && e.code !== 'KeyS' && e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keyLeft = true;
      else if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keyRight = true;
      else if (e.shiftKey) this.keyShift = true;
      else if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        // Incrementar fuerza de tiro con teclado (más fuerte)
        if (!isMoving(this.ball) && !this.sunk && this.intro >= 1) {
          e.preventDefault();
          this.power = THREE.MathUtils.clamp(Math.round((this.power + 0.05) * 100) / 100, 0, 1);
          if (this.charging && this.chargeAnchor) {
            const h = el.clientHeight || 1;
            const dy = (this.lastMouseY ?? this.chargeAnchor.y) - this.chargeAnchor.y;
            this.chargeAnchor.startPower = THREE.MathUtils.clamp(this.power - (dy / (h * 0.32)), 0, 1);
          }
          setCharge(this.power);
          this.onAim?.(this.power);
          if (this.power >= 1 && !this.fullPower) {
            sfx.full();
            this.fullPower = true;
          }
        }
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        // Reducir fuerza de tiro con teclado (más flojo)
        if (!isMoving(this.ball) && !this.sunk && this.intro >= 1) {
          e.preventDefault();
          this.power = THREE.MathUtils.clamp(Math.round((this.power - 0.05) * 100) / 100, 0, 1);
          if (this.charging && this.chargeAnchor) {
            const h = el.clientHeight || 1;
            const dy = (this.lastMouseY ?? this.chargeAnchor.y) - this.chargeAnchor.y;
            this.chargeAnchor.startPower = THREE.MathUtils.clamp(this.power - (dy / (h * 0.32)), 0, 1);
          }
          setCharge(this.power);
          this.onAim?.(this.power);
          if (this.power < 1) this.fullPower = false;
          if (this.power <= 0.02) this.aimDots.hide();
        }
      } else if (e.code === 'Space') {
        if (!isMoving(this.ball) && !this.sunk && this.intro >= 1) {
          e.preventDefault();
          if (this.power >= 0.05) {
            // Disparar con la fuerza ajustada previamente
            const p = this.power;
            const dragTicks = Math.max(12, this.tick - (this.chargeStartTick || this.tick));
            const turns = Math.max(1, this.mouseTurns || 1);
            this.charging = false;
            this.spaceCharging = false;
            this.chargeAnchor = null;
            this.power = 0;
            this.fullPower = false;
            setCharge(0);
            this.onAim?.(0);
            this.aimDots.hide();
            this.#executeShot(p, dragTicks, turns);
            this.mouseTurns = 0;
          } else if (!this.spaceCharging) {
            // Cargar fuerza progresivamente manteniendo espacio
            this.spaceCharging = true;
            this.chargeStartTick = this.tick;
            if (!this.aimStartTick) this.aimStartTick = this.tick;
          }
        }
      } else if (e.code === 'Tab' || e.code === 'KeyM') {
        e.preventDefault();
        this.setOverview(true);
      } else if (e.code === 'KeyR') {
        if (this.course && !isMoving(this.ball)) {
          this.yaw = Math.atan2(this.course.cup[0] - this.ball.x, -(this.course.cup[1] - this.ball.z));
          this.camYaw = this.yaw;
          sfx.tap();
        }
      } else if (e.code === 'Escape') {
        if (this.charging || this.spaceCharging || this.power > 0) {
          this.charging = false;
          this.spaceCharging = false;
          this.chargeAnchor = null;
          this.power = 0;
          this.fullPower = false;
          setCharge(0);
          this.onAim?.(0);
          this.aimDots.hide();
        }
        if (this.overview) this.setOverview(false);
      }
    };

    this.#onKeyUp = (e) => {
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keyLeft = false;
      else if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keyRight = false;
      if (!e.shiftKey) this.keyShift = false;
      if (e.code === 'Space' && this.spaceCharging) {
        e.preventDefault();
        const power = this.power;
        const dragTicks = Math.max(12, this.tick - this.chargeStartTick);
        const turns = Math.max(1, this.mouseTurns || 1);
        this.spaceCharging = false;
        this.charging = false;
        this.chargeAnchor = null;
        this.power = 0;
        this.fullPower = false;
        setCharge(0);
        this.onAim?.(0);
        this.aimDots.hide();
        this.#executeShot(power, dragTicks, turns);
        this.mouseTurns = 0;
      } else if (e.code === 'Tab' || e.code === 'KeyM') {
        this.setOverview(false);
      }
    };

    el.addEventListener('pointerdown', this.#onPointerDown);
    el.addEventListener('pointermove', this.#onPointerMove);
    el.addEventListener('pointerup', this.#onPointerUp);
    el.addEventListener('pointercancel', this.#onPointerCancel);
    el.addEventListener('wheel', this.#onWheel, { passive: false });
    window.addEventListener('keydown', this.#onKeyDown);
    window.addEventListener('keyup', this.#onKeyUp);
  }

  #unbindInput() {
    const el = this.renderer?.domElement;
    if (el) {
      if (this.#onContextMenu) el.removeEventListener('contextmenu', this.#onContextMenu);
      if (this.#onPointerDown) el.removeEventListener('pointerdown', this.#onPointerDown);
      if (this.#onPointerMove) el.removeEventListener('pointermove', this.#onPointerMove);
      if (this.#onPointerUp) el.removeEventListener('pointerup', this.#onPointerUp);
      if (this.#onPointerCancel) el.removeEventListener('pointercancel', this.#onPointerCancel);
      if (this.#onWheel) el.removeEventListener('wheel', this.#onWheel);
    }
    if (this.#onKeyDown) window.removeEventListener('keydown', this.#onKeyDown);
    if (this.#onKeyUp) window.removeEventListener('keyup', this.#onKeyUp);
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
        pts.push({ x: sim.x, z: sim.z });
      }
      if (r.hit > 0 && sinceBounce < 0) sinceBounce = 0;
      if (sinceBounce >= 0 && (sinceBounce += d) > 1) break;
      if (r.sunk || !isMoving(sim)) break;
    }
    return pts;
  }

  #tickBots() {
    for (const b of this.bots) {
      const r = b.tick(this.t, DT);
      if (!r) continue;
      const dx = b.ball.x - this.ball.x, dz = b.ball.z - this.ball.z;
      const dist = Math.hypot(dx, dz);
      const right = forwardOf(this.camYaw + Math.PI / 2);
      const pan = THREE.MathUtils.clamp((dx * right.x + dz * right.z) / 4, -1, 1);
      if (r.shot) sfx.rivalHit(dist, pan);
      if (r.portal >= 0) this.particles.puff(new THREE.Vector3(b.ball.x, 0.1, b.ball.z), 0xffb020, 8, 1.2, 0.16);
      if (r.sunk) {
        b.sunk = true;
        sfx.rivalCup(pan);
        this.particles.puff(new THREE.Vector3(b.ball.x, 0.1, b.ball.z), new THREE.Color(b.player.color).getHex(), 12, 1.2, 0.18);
      }
      if (r.shot || r.finished) this.onRival?.(b.player, { strokes: b.strokes, sunk: !!r.sunk, done: b.done });
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
      if (this.intro >= 1 && !this.locked) this.#tickBots();
      if (this.sunk) continue;
      const wasMoving = isMoving(this.ball);
      // se simula también con la bola parada: un aspa puede empujarla
      const r = step(this.course, this.segs, this.ball, this.t, DT);
      const pos = new THREE.Vector3(this.ball.x, BALL_R, this.ball.z);
      if (r.portal >= 0) {
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
        navigator.vibrate?.(20);
      }
      if (r.bumper >= 0) {
        this.courseView.bumpers[r.bumper].userData.squash = 0.18;
        sfx.bumper();
        this.particles.puff(pos, 0xffffff, 6, 1.2, 0.15);
        const b = this.course.bumpers[r.bumper];
        this.waves.emit(b.x, b.z, 0xffffff, b.r * 3, 3.5);
        this.squash = Math.max(this.squash, 0.15);
        this.#addShake(Math.min(0.3, r.hit * 0.04));
      } else if (r.hit > 2) {
        sfx.wall(r.hit);
        this.particles.puff(pos, 0xf3e3c3, 5, 0.8, 0.14);
        this.squash = Math.max(this.squash, Math.min(0.25, r.hit * 0.03));
        if (r.hit > 4) {
          navigator.vibrate?.(8);
          this.#addShake(Math.min(0.35, (r.hit - 4) * 0.06));
        }
      }
      // pasa por encima del hoyo demasiado rápido: "¡uy!"
      const toCup = Math.hypot(this.ball.x - this.course.cup[0], this.ball.z - this.course.cup[1]);
      if (!this.course.noCup && !r.sunk && toCup < CUP_R && Math.hypot(this.ball.vx, this.ball.vz) >= CUP_CAPTURE) {
        if (!this.overCup) {
          this.overCup = true;
          sfx.lip();
          this.particles.puff(pos, 0xffffff, 6, 1, 0.12);
          this.#addShake(0.15);
          this.onLip?.();
        }
      } else if (toCup > CUP_R + 0.1) this.overCup = false;
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
        sfx.cup();
        this.onCup?.(this.strokes);
        this.particles.confetti(new THREE.Vector3(this.course.cup[0], 0, this.course.cup[1]));
        this.waves.emit(this.course.cup[0], this.course.cup[1], 0xffe066, 2.4, 1.4);
        this.waves.emit(this.course.cup[0], this.course.cup[1], 0xffffff, 1.4, 2);
        this.#addShake(0.3);
        navigator.vibrate?.([30, 40, 60]);
        setTimeout(() => this.onSunk?.(this.strokes), 2200);
      } else if (wasMoving && !isMoving(this.ball)) this.onRest?.(this.strokes);
    }

    // control por teclado y carga de tiro continuo
    if (!isMoving(this.ball) && !this.sunk && this.intro >= 1 && !this.locked) {
      const keySpeed = (this.keyShift ? 0.75 : 1.8) * dt;
      if (this.keyLeft) {
        this.yaw -= keySpeed;
        this.mouseTurns = (this.mouseTurns || 0) + 1;
      }
      if (this.keyRight) {
        this.yaw += keySpeed;
        this.mouseTurns = (this.mouseTurns || 0) + 1;
      }
      if (this.spaceCharging) {
        const elapsedSec = (this.tick - this.chargeStartTick) * DT;
        this.power = THREE.MathUtils.clamp(elapsedSec / 1.5, 0, 1);
        setCharge(this.power);
        if (this.power >= 1 && !this.fullPower) {
          sfx.full();
          this.fullPower = true;
        }
        this.onAim?.(this.power);
      }
    }

    // la cámara gira suavemente hacia donde rueda la bola
    const speed = Math.hypot(this.ball.vx, this.ball.vz);
    if (speed > 1.2 && !this.drag && !this.charging) {
      const velYaw = Math.atan2(this.ball.vx, -this.ball.vz);
      this.yaw = lerpAngle(this.yaw, velYaw, damp(1.2, dt));
    }
    const targetCamYaw = this.orbiting ? this.yaw + (this.orbitYaw || 0) : this.yaw;
    this.camYaw = (this.drag || this.charging || this.orbiting)
      ? targetCamYaw
      : lerpAngle(this.camYaw, targetCamYaw, damp(10, dt));

    if (this.renderer?.domElement) {
      if (this.orbiting) this.renderer.domElement.style.cursor = 'grabbing';
      else if (this.charging) this.renderer.domElement.style.cursor = 'crosshair';
      else if (!isMoving(this.ball) && !this.sunk && this.intro >= 1) this.renderer.domElement.style.cursor = 'crosshair';
      else this.renderer.domElement.style.cursor = 'default';
    }

    // bola: rodar y caer en el hoyo
    const sinkT = this.sunk ? Math.min(1, (this.t - this.sunkAt) * 4) : 0;
    this.ballRoot.position.set(this.ball.x, BALL_R - sinkT * 0.3, this.ball.z);
    if (speed > 0) {
      const axis = new THREE.Vector3(-this.ball.vz, 0, this.ball.vx).normalize();
      this.ballMesh.rotateOnWorldAxis(axis, (speed * dt) / BALL_R);
    }
    // aplastamiento elástico al golpear o chocar
    this.squash *= Math.exp(-realDt * 9);
    const wob = this.squash * Math.cos(this.t * 40);
    this.ballRoot.scale.set(1 + wob * 0.5, 1 - wob, 1 + wob * 0.5);
    this.ballShadow.position.set(this.ball.x, 0.004, this.ball.z);
    this.ballShadow.visible = !this.sunk;
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
      b.mesh.position.set(b.ball.x, BALL_R - b.sinkT * 0.3, b.ball.z);
      const v = Math.hypot(b.ball.vx, b.ball.vz);
      if (v > 0) b.mesh.rotateOnWorldAxis(new THREE.Vector3(-b.ball.vz, 0, b.ball.vx).normalize(), (v * dt) / BALL_R);
      b.label.position.set(b.ball.x, 0.5, b.ball.z);
      b.label.visible = !b.done;
      b.mesh.visible = b.sinkT < 1;
      // las etiquetas pegadas a la cámara estorban: se desvanecen de cerca
      const camD = this.camera.position.distanceTo(b.mesh.position);
      b.label.material.opacity = THREE.MathUtils.clamp((camD - 3.7) / 2, 0, 1);
    }
    this.ballGlow.position.set(this.ball.x, 0.006, this.ball.z);
    this.ballGlow.visible = !this.sunk;
    this.ballGlow.material.opacity = isMoving(this.ball) ? 0.15 : 0.35 + Math.sin(this.t * 4) * 0.15;

    this.course.spinners.forEach((sp, i) => {
      const [[ax, az], [bx, bz]] = spinnerSegment(sp, this.t);
      this.courseView.spinners[i].rotation.y = -Math.atan2(bz - az, bx - ax);
    });

    if ((this.drag || this.charging || this.spaceCharging || this.power > 0.02) && this.power > 0.02) {
      const color = new THREE.Color().setHSL(0.33 - this.power * 0.33, 0.95, 0.55);
      this.aimDots.show(this.#predictPath(), color, this.t);
      this.aimDots.showRing(this.ballRoot.position, this.t);
    } else this.aimDots.hide();

    const sun = this.env.sun;
    sun.position.set(this.ball.x, 0, this.ball.z).addScaledVector(this.env.sunDir, 30);
    sun.target.position.set(this.ball.x, 0, this.ball.z);

    this.env.update(this.t, dt);
    this.courseView.update(this.t, this.camera.position, this.ball);
    this.trail.update(this.ballRoot.position, speed > 0.5);
    this.#placeCamera(realDt);
    this.particles.update(dt, this.camera);
    this.waves.update(realDt);
    this.renderer.render(this.scene, this.camera);
  }
}
