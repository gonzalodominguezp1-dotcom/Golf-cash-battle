import * as THREE from 'three';
import { BALL_R, DT, MAX_SHOT_SPEED, inSand, isMoving, onBoost, quantizeShot, segmentsOf, shotVelocity, spinnerSegment, step } from './physics.js';
import { Bot } from './bots.js';
import { THEMES } from './themes.js';
import { buildEnvironment, courseBounds } from './render/environment.js';
import { buildCourse } from './render/course.js';
import { AimDots, Particles, Trail } from './render/effects.js';
import { ballTexture, labelTexture } from './render/textures.js';
import { skinMaterial } from './render/ballSkins.js';
import { SKINS } from '../progress/skins.js';
import { setAmbient, setRolling, sfx, stopAmbient, stopRolling, unlockAudio } from './audio.js';

const INTRO_SECONDS = 2.2;
const FOLLOW_DIST = 3.2;
const FOLLOW_HEIGHT = 1.45;
const LOOK_AHEAD = 2.2;

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
  constructor(container, { onStroke, onSunk, onAim, onRest, onCup, onRival } = {}) {
    this.container = container;
    this.onStroke = onStroke;
    this.onSunk = onSunk;
    this.onAim = onAim;
    this.onRest = onRest;
    this.onCup = onCup;
    this.onRival = onRival;
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
    this.power = 0;
    this.drag = null;
    this.wasInSand = false;
    this.wasOnBoost = false;
    this.ambientOn = false;
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
    stopAmbient();
    stopRolling();
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
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
    scene.add(this.ballMesh);
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

    const b = courseBounds(this.course);
    this.bounds = b;
  }

  #resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  // ---------- cámara ----------

  #followTarget() {
    const fwd = forwardOf(this.camYaw);
    const dist = FOLLOW_DIST + this.power * 0.7;
    const pos = new THREE.Vector3(this.ball.x, 0, this.ball.z).addScaledVector(fwd, -dist);
    pos.y = FOLLOW_HEIGHT + this.power * 0.35;
    const look = new THREE.Vector3(this.ball.x, 0.15, this.ball.z).addScaledVector(fwd, LOOK_AHEAD);
    return { pos, look };
  }

  #overviewTarget() {
    const b = this.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const depth = b.maxZ - b.minZ, width = b.maxX - b.minX;
    const span = Math.max(depth, width * 1.6);
    return { pos: new THREE.Vector3(cx, span * 0.95, cz + span * 0.55), look: new THREE.Vector3(cx, 0, cz - 0.5) };
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
  }

  // ---------- input ----------

  #bindInput() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      unlockAudio();
      if (!this.ambientOn) {
        this.ambientOn = true;
        setAmbient(this.theme.sound);
      }
      if (!this.course || this.sunk || this.locked || this.intro < 1 || this.drag) return;
      if (this.course.noCup && this.strokes >= 1) return;
      el.setPointerCapture(e.pointerId);
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: this.yaw, lastTick: this.yaw };
    });
    el.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      const h = el.clientHeight || 1, w = el.clientWidth || 1;
      const canShoot = !isMoving(this.ball);
      this.power = canShoot ? THREE.MathUtils.clamp((e.clientY - d.y) / (h * 0.32), 0, 1) : 0;
      // más precisión al apuntar cuanto más cargado está el golpe
      d.yaw += ((e.clientX - (d.px ?? d.x)) * 2.4 * (1 - 0.65 * this.power)) / w;
      d.px = e.clientX;
      this.yaw = d.yaw;
      if (Math.abs(this.yaw - d.lastTick) > 0.08) {
        d.lastTick = this.yaw;
        sfx.tick();
      }
      this.onAim?.(this.power);
    });
    const release = (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      const power = this.power;
      this.power = 0;
      this.onAim?.(0);
      this.aimDots.hide();
      if (power < 0.05 || isMoving(this.ball) || this.sunk) return;
      // desempate: un solo tiro
      if (this.course.noCup && this.strokes >= 1) return;
      const shot = quantizeShot(this.yaw, power);
      const v = shotVelocity(shot.yaw, shot.power);
      this.ball.vx = v.vx;
      this.ball.vz = v.vz;
      this.shots.push({ tick: this.tick, ...shot });
      this.strokes++;
      sfx.hit(power);
      this.particles.puff(new THREE.Vector3(this.ball.x, 0.05, this.ball.z), 0x9be37f, 8, 1, 0.18);
      navigator.vibrate?.(15);
      this.onStroke?.(this.strokes);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', (e) => {
      if (this.drag?.id !== e.pointerId) return;
      this.drag = null;
      this.power = 0;
      this.onAim?.(0);
    });
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
      const d = Math.hypot(sim.x - lastX, sim.z - lastZ);
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
      if (r.sunk) {
        b.sunk = true;
        sfx.rivalCup(pan);
        this.particles.puff(new THREE.Vector3(b.ball.x, 0.1, b.ball.z), new THREE.Color(b.player.color).getHex(), 12, 1.2, 0.18);
      }
      if (r.shot || r.finished) this.onRival?.(b.player, { strokes: b.strokes, sunk: !!r.sunk, done: b.done });
    }
  }

  // ---------- bucle ----------

  #frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.intro < 1) this.intro = Math.min(1, this.intro + dt / INTRO_SECONDS);
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
      if (r.bumper >= 0) {
        this.courseView.bumpers[r.bumper].userData.squash = 0.18;
        sfx.bumper();
        this.particles.puff(pos, 0xffffff, 6, 1.2, 0.15);
      } else if (r.hit > 2) {
        sfx.wall(r.hit);
        this.particles.puff(pos, 0xf3e3c3, 5, 0.8, 0.14);
        if (r.hit > 4) navigator.vibrate?.(8);
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
        sfx.cup();
        this.onCup?.(this.strokes);
        this.particles.confetti(new THREE.Vector3(this.course.cup[0], 0, this.course.cup[1]));
        navigator.vibrate?.([30, 40, 60]);
        setTimeout(() => this.onSunk?.(this.strokes), 2200);
      } else if (wasMoving && !isMoving(this.ball)) this.onRest?.(this.strokes);
    }

    // la cámara gira suavemente hacia donde rueda la bola
    const speed = Math.hypot(this.ball.vx, this.ball.vz);
    if (speed > 1.2 && !this.drag) {
      const velYaw = Math.atan2(this.ball.vx, -this.ball.vz);
      this.yaw = lerpAngle(this.yaw, velYaw, damp(1.2, dt));
    }
    this.camYaw = this.drag ? this.yaw : lerpAngle(this.camYaw, this.yaw, damp(10, dt));
    if (this.drag) this.camYaw = this.yaw;

    // bola: rodar y caer en el hoyo
    const sinkT = this.sunk ? Math.min(1, (this.t - this.sunkAt) * 4) : 0;
    this.ballMesh.position.set(this.ball.x, BALL_R - sinkT * 0.3, this.ball.z);
    if (speed > 0) {
      const axis = new THREE.Vector3(-this.ball.vz, 0, this.ball.vx).normalize();
      this.ballMesh.rotateOnWorldAxis(axis, (speed * dt) / BALL_R);
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

    if (this.drag && this.power > 0.02) {
      const color = new THREE.Color().setHSL(0.33 - this.power * 0.33, 0.95, 0.55);
      this.aimDots.show(this.#predictPath(), color, this.t);
      this.aimDots.showRing(this.ballMesh.position, this.t);
    } else this.aimDots.hide();

    const sun = this.env.sun;
    sun.position.set(this.ball.x, 0, this.ball.z).addScaledVector(this.env.sunDir, 30);
    sun.target.position.set(this.ball.x, 0, this.ball.z);

    this.env.update(this.t, dt);
    this.courseView.update(this.t, this.camera.position, this.ball);
    this.trail.update(this.ballMesh.position, speed > 0.5);
    this.#placeCamera(dt);
    this.particles.update(dt, this.camera);
    this.renderer.render(this.scene, this.camera);
  }
}
