import * as THREE from 'three';
import { BALL_R, CUP_R, MAX_SHOT_SPEED, WALL_HALF, isMoving, segmentsOf, spinnerSegment, step } from './physics.js';

const DT = 1 / 120;
const WALL_H = 0.35;
const MAX_DRAG = 3.2; // metros de arrastre para potencia máxima

const COLORS = {
  sky: 0x8fd3ff,
  grass: 0x5cbf4a,
  grassDark: 0x3f9a35,
  wall: 0xf4f1e8,
  wallTop: 0xe0573e,
  sand: 0xf0d58a,
  bumper: 0x4b7bec,
  spinner: 0xe0573e,
  ground: 0x2f7d32,
};

/**
 * Renderiza un hoyo con Three.js y gestiona el tiro "tirachinas": arrastra
 * desde cualquier punto y suelta; la bola sale en sentido contrario.
 */
export class GolfGame {
  constructor(container, { onStroke, onSunk, onAim, onRest } = {}) {
    this.container = container;
    this.onStroke = onStroke;
    this.onSunk = onSunk;
    this.onAim = onAim;
    this.onRest = onRest;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.clock = new THREE.Clock();
    this.acc = 0;
    this.t = 0;
    this.running = false;
    this.#bindInput();
    this.resizeObserver = new ResizeObserver(() => this.#resize());
    this.resizeObserver.observe(container);
  }

  load(course) {
    this.course = course;
    this.segs = segmentsOf(course);
    this.ball = { x: course.tee[0], z: course.tee[1], vx: 0, vz: 0 };
    this.lastRest = { x: this.ball.x, z: this.ball.z };
    this.strokes = 0;
    this.sunk = false;
    this.sinkAnim = 0;
    this.t = 0;
    this.#buildScene();
    this.#resize();
    if (!this.running) {
      this.running = true;
      this.clock.start();
      this.renderer.setAnimationLoop(() => this.#frame());
    }
  }

  dispose() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------- escena ----------

  #buildScene() {
    const c = this.course;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.sky);
    scene.fog = new THREE.Fog(COLORS.sky, 30, 70);
    this.scene = scene;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a6b35, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
    scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ color: COLORS.ground }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    // césped con forma del contorno
    const shape = new THREE.Shape(c.outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    const green = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: COLORS.grass }));
    green.rotation.x = -Math.PI / 2;
    green.receiveShadow = true;
    scene.add(green);
    this.#addStripes(shape);

    for (const s of c.sand) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.d), new THREE.MeshLambertMaterial({ color: COLORS.sand }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(s.x, 0.004, s.z);
      m.receiveShadow = true;
      scene.add(m);
    }

    const wallMat = new THREE.MeshLambertMaterial({ color: COLORS.wall });
    const capMat = new THREE.MeshLambertMaterial({ color: COLORS.wallTop });
    for (const seg of this.segs) this.#addWall(seg, wallMat, capMat);

    for (const b of c.bumpers) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r, WALL_H * 1.2, 20), new THREE.MeshLambertMaterial({ color: COLORS.bumper }));
      m.position.set(b.x, (WALL_H * 1.2) / 2, b.z);
      m.castShadow = true;
      scene.add(m);
    }

    this.spinnerMeshes = c.spinners.map((sp) => {
      const g = new THREE.Group();
      const bar = new THREE.Mesh(new THREE.BoxGeometry(sp.len, WALL_H, WALL_HALF * 2), new THREE.MeshLambertMaterial({ color: COLORS.spinner }));
      bar.position.y = WALL_H / 2;
      bar.castShadow = true;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, WALL_H * 1.6, 12), wallMat);
      hub.position.y = WALL_H * 0.8;
      g.add(bar, hub);
      g.position.set(sp.x, 0, sp.z);
      scene.add(g);
      return g;
    });

    // hoyo + bandera
    const [hx, hz] = c.cup;
    const cup = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 28), new THREE.MeshBasicMaterial({ color: 0x14210f }));
    cup.rotation.x = -Math.PI / 2;
    cup.position.set(hx, 0.006, hz);
    scene.add(cup);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    pole.position.set(hx, 0.8, hz);
    pole.castShadow = true;
    const flagGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.6, -0.18, 0), new THREE.Vector3(0, -0.36, 0)]);
    flagGeo.computeVertexNormals();
    this.flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ color: 0xff3b30, side: THREE.DoubleSide }));
    this.flag.position.set(hx, 1.58, hz);
    scene.add(pole, this.flag);

    // bola
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    this.ballMesh.castShadow = true;
    scene.add(this.ballMesh);

    // flecha de apuntado
    this.aim = new THREE.Group();
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    this.aimShaft = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1), arrowMat);
    this.aimShaft.rotation.x = -Math.PI / 2;
    this.aimHead = new THREE.Mesh(new THREE.CircleGeometry(0.22, 3), arrowMat);
    this.aimHead.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); // punta hacia +z local
    this.aim.add(this.aimShaft, this.aimHead);
    this.aim.position.y = 0.02;
    this.aim.visible = false;
    this.aimMat = arrowMat;
    scene.add(this.aim);

    this.#addTrees();
  }

  #addStripes(shape) {
    // franjas de corte del césped, solo en hoyos rectangulares
    if (this.course.outline.length !== 4) return;
    const box = new THREE.Box2().setFromPoints(shape.getPoints());
    const mat = new THREE.MeshLambertMaterial({ color: COLORS.grassDark, transparent: true, opacity: 0.25 });
    for (let y = box.min.y; y + 1 <= box.max.y; y += 2) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(box.max.x - box.min.x, 1), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((box.max.x + box.min.x) / 2, 0.002, -(y + 0.5));
      m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  #addWall([[ax, az], [bx, bz]], wallMat, capMat) {
    const len = Math.hypot(bx - ax, bz - az) + WALL_HALF * 2;
    const angle = Math.atan2(bz - az, bx - ax);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, WALL_H, WALL_HALF * 2), wallMat);
    body.position.y = WALL_H / 2;
    body.castShadow = body.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(len, 0.06, WALL_HALF * 2 + 0.02), capMat);
    cap.position.y = WALL_H;
    g.add(body, cap);
    g.position.set((ax + bx) / 2, 0, (az + bz) / 2);
    g.rotation.y = -angle;
    this.scene.add(g);
  }

  #addTrees() {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
    const leafMats = [0x2e8b3d, 0x3aa34a, 0x247a33].map((color) => new THREE.MeshLambertMaterial({ color, flatShading: true }));
    let seed = this.course.name.length * 97;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (6 + rnd() * 9);
      const z = -14 + rnd() * 28;
      const s = 0.7 + rnd() * 0.8;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 0.8 * s, 6), trunkMat);
      trunk.position.set(x, 0.4 * s, z);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.8 * s, 1.8 * s, 7), leafMats[i % 3]);
      leaves.position.set(x, 1.6 * s, z);
      trunk.castShadow = leaves.castShadow = true;
      this.scene.add(trunk, leaves);
    }
  }

  #resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    if (this.course) this.#frameCamera();
    this.camera.updateProjectionMatrix();
  }

  #frameCamera() {
    // encuadra el hoyo completo, con vista inclinada desde el tee
    const xs = this.course.outline.map((p) => p[0]), zs = this.course.outline.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const width = Math.max(...xs) - Math.min(...xs) + 1.5, depth = Math.max(...zs) - Math.min(...zs) + 1.5;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const tilt = THREE.MathUtils.degToRad(62);
    const distForDepth = (depth * Math.sin(tilt) * 0.62) / Math.tan(vfov / 2);
    const distForWidth = width / 2 / Math.tan(hfov / 2);
    const dist = Math.max(distForDepth, distForWidth) * 1.02;
    this.camera.position.set(cx, Math.sin(tilt) * dist, cz + Math.cos(tilt) * dist);
    this.camera.lookAt(cx, 0, cz + 0.6);
  }

  // ---------- input ----------

  #pointerToWorld(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, p) ? p : null;
  }

  #bindInput() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      if (!this.course || this.sunk || isMoving(this.ball) || this.locked) return;
      const p = this.#pointerToWorld(e);
      if (!p) return;
      el.setPointerCapture(e.pointerId);
      this.drag = { start: p, current: p };
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const p = this.#pointerToWorld(e);
      if (p) this.drag.current = p;
    });
    const release = () => {
      if (!this.drag) return;
      const { power, dx, dz } = this.#aimVector();
      this.drag = null;
      this.aim.visible = false;
      this.onAim?.(0);
      if (power < 0.04) return;
      this.ball.vx = dx * power * MAX_SHOT_SPEED;
      this.ball.vz = dz * power * MAX_SHOT_SPEED;
      this.lastRest = { x: this.ball.x, z: this.ball.z };
      this.strokes++;
      this.onStroke?.(this.strokes);
      navigator.vibrate?.(15);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', () => {
      this.drag = null;
      this.aim.visible = false;
      this.onAim?.(0);
    });
  }

  #aimVector() {
    const vx = this.drag.start.x - this.drag.current.x, vz = this.drag.start.z - this.drag.current.z;
    const len = Math.hypot(vx, vz);
    if (len < 1e-4) return { power: 0, dx: 0, dz: 0 };
    return { power: Math.min(1, len / MAX_DRAG), dx: vx / len, dz: vz / len };
  }

  // ---------- bucle ----------

  #frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.acc += dt;
    while (this.acc >= DT) {
      this.acc -= DT;
      this.t += DT;
      if (this.sunk) continue;
      // se simula también con la bola parada: un aspa puede empujarla
      const wasMoving = isMoving(this.ball);
      const r = step(this.course, this.segs, this.ball, this.t, DT);
      if (wasMoving && !r.sunk && !isMoving(this.ball)) this.onRest?.(this.strokes);
      if (r.hit > 3) navigator.vibrate?.(8);
      if (r.sunk) {
        this.sunk = true;
        navigator.vibrate?.([30, 40, 60]);
        setTimeout(() => this.onSunk?.(this.strokes), 900);
      }
    }

    this.course.spinners.forEach((sp, i) => {
      const [[ax, az], [bx, bz]] = spinnerSegment(sp, this.t);
      this.spinnerMeshes[i].rotation.y = -Math.atan2(bz - az, bx - ax);
    });

    if (this.sunk) this.sinkAnim = Math.min(1, this.sinkAnim + dt * 3);
    this.ballMesh.position.set(this.ball.x, BALL_R - this.sinkAnim * BALL_R * 2.2, this.ball.z);
    this.ballMesh.rotation.x -= this.ball.vz * dt * 4;
    this.ballMesh.rotation.z += this.ball.vx * dt * 4;
    this.flag.rotation.y = Math.sin(this.t * 2.5) * 0.25;

    if (this.drag) {
      const { power, dx, dz } = this.#aimVector();
      this.aim.visible = power > 0.02;
      const len = 0.4 + power * 2.6;
      const angle = Math.atan2(dx, dz);
      this.aim.position.set(this.ball.x, 0.02, this.ball.z);
      this.aim.rotation.y = angle;
      this.aimShaft.scale.y = len;
      this.aimShaft.position.set(0, 0, len / 2 + BALL_R);
      this.aimHead.position.set(0, 0, len + BALL_R + 0.1);
      this.aimMat.color.setHSL(0.33 - power * 0.33, 0.9, 0.55);
      this.onAim?.(power);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
