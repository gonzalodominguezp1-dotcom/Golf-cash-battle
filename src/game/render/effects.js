import * as THREE from 'three';
import { softDotTexture } from './textures.js';
import { BALL_R as BALL_RADIUS } from '../physics.js';

/** Partículas genéricas (confeti, polvo, arena) con un único InstancedMesh. */
export class Particles {
  constructor(scene, max = 400) {
    this.max = max;
    this.items = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.soft = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({ map: softDotTexture(), transparent: true, depthWrite: false, opacity: 0.8 }),
      max,
    );
    this.soft.frustumCulled = false;
    this.soft.count = 0;
    scene.add(this.soft);
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
  }

  emit(p) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ life: 1, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), rot: new THREE.Euler(), ...p });
  }

  confetti(pos, n = 140) {
    const colors = [0xff3b30, 0xffcc00, 0x34c759, 0x007aff, 0xaf52de, 0xff9500, 0xffffff];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3.5;
      this.emit({
        pos: pos.clone().add(new THREE.Vector3(0, 0.2, 0)),
        vel: new THREE.Vector3(Math.cos(a) * s * 0.5, 4 + Math.random() * 4, Math.sin(a) * s * 0.5),
        color: colors[i % colors.length],
        size: 0.08 + Math.random() * 0.06,
        gravity: 5,
        drag: 1.6,
        decay: 0.35,
      });
    }
  }

  puff(pos, color = 0xffffff, n = 10, speed = 1.2, size = 0.25) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit({
        pos: pos.clone(),
        vel: new THREE.Vector3(Math.cos(a) * speed * Math.random(), 0.5 + Math.random() * speed, Math.sin(a) * speed * Math.random()),
        color,
        size,
        gravity: 1.5,
        drag: 3,
        decay: 1.6,
        soft: true,
        grow: 1.5,
      });
    }
  }

  update(dt, camera) {
    this.items = this.items.filter((p) => (p.life -= dt * p.decay) > 0);
    let hard = 0, soft = 0;
    for (const p of this.items) {
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.02 && !p.soft) {
        p.pos.y = 0.02;
        p.vel.set(0, 0, 0);
      }
      const d = this.dummy;
      d.position.copy(p.pos);
      if (p.soft) {
        d.quaternion.copy(camera.quaternion);
        d.scale.setScalar(p.size * (1 + (1 - p.life) * (p.grow ?? 0)));
        d.updateMatrix();
        this.soft.setMatrixAt(soft, d.matrix);
        this.soft.setColorAt(soft, this.color.set(p.color).multiplyScalar(Math.min(1, p.life * 1.5)));
        soft++;
      } else {
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
        d.rotation.copy(p.rot);
        d.scale.set(p.size, p.size * 0.6, 1);
        d.updateMatrix();
        this.mesh.setMatrixAt(hard, d.matrix);
        this.mesh.setColorAt(hard, this.color.set(p.color));
        hard++;
      }
    }
    this.mesh.count = hard;
    this.soft.count = soft;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.soft.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.soft.instanceColor) this.soft.instanceColor.needsUpdate = true;
  }
}

/** Estela de la bola (puntos). Sin asignaciones por frame: todo se reutiliza. */
export class Trail {
  constructor(scene, n = 28, color = '#ffffff') {
    this.n = n;
    this.count = 0;
    this.points = Array.from({ length: n }, () => new THREE.Vector3());
    this.rainbow = color === 'rainbow';
    this.color = new THREE.Color(this.rainbow ? '#ffffff' : color);
    this.tmp = new THREE.Color();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    this.geo = geo;
    this.obj = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.16, map: softDotTexture(), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }),
    );
    this.obj.frustumCulled = false;
    scene.add(this.obj);
  }

  update(pos, moving) {
    const pts = this.points;
    if (moving) {
      // el último punto se recicla como nuevo primero
      const last = pts[this.n - 1];
      for (let i = this.n - 1; i > 0; i--) pts[i] = pts[i - 1];
      pts[0] = last.copy(pos);
      this.count = Math.min(this.count + 1, this.n);
    } else if (this.count > 0) this.count--;
    const p = this.geo.attributes.position, c = this.geo.attributes.color;
    for (let i = 0; i < this.n; i++) {
      const v = pts[i];
      const live = i < this.count;
      if (live) p.setXYZ(i, v.x, v.y, v.z);
      const col = this.rainbow ? this.tmp.setHSL(i / this.n, 1, 0.6) : this.color;
      c.setXYZW(i, col.r, col.g, col.b, live ? (1 - i / this.n) * 0.8 : 0);
    }
    p.needsUpdate = c.needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }

  dispose() {
    this.obj.removeFromParent();
    this.geo.dispose();
    this.obj.material.map?.dispose();
    this.obj.material.dispose();
  }
}

const RIBBON_VERT = `
attribute vec4 color;
varying vec4 vColor;
varying vec2 vUv;
void main() {
  vColor = color;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RIBBON_FRAG = `
uniform float uTime;
uniform float uNoise;
varying vec4 vColor;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  float edge = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float n = vn(vec2(vUv.x * 14.0 - uTime * 3.0, vUv.y * 3.0));
  float a = smoothstep(0.0, 0.55, edge - uNoise * n * (1.0 - edge));
  float core = smoothstep(0.55, 1.0, edge);
  gl_FragColor = vec4(mix(vColor.rgb, vec3(1.0), core * 0.55), vColor.a * a);
}`;

/**
 * Cinta de 32–48 segmentos orientada a la cámara. Ancho y opacidad salen del
 * perfil (`fx.trail.width`, `taper`); los puntos caducan por tiempo además de
 * por longitud. Todos los buffers se reservan una sola vez.
 */
export class RibbonTrail {
  constructor(scene, { segments = 32, color = '#ffffff', color2 = null, width = 0.7, taper = 0.5, noise = 0, lifetime = 0.8, step = 0.12 } = {}) {
    const n = (this.n = segments);
    this.rainbow = color === 'rainbow';
    this.c1 = new THREE.Color(this.rainbow ? '#ffffff' : color);
    this.c2 = new THREE.Color(color2 ?? (this.rainbow ? '#ffffff' : color));
    this.tmp = new THREE.Color();
    this.width = width * 0.12;
    this.taper = taper;
    this.lifetime = lifetime;
    this.step2 = step * step;
    this.count = 0;
    this.pos = new Float32Array(n * 3);
    this.ages = new Float32Array(n);
    this.tan = new THREE.Vector3();
    this.cam = new THREE.Vector3();
    this.side = new THREE.Vector3();
    const geo = (this.geo = new THREE.BufferGeometry());
    this.vp = new THREE.BufferAttribute(new Float32Array(n * 6), 3).setUsage(THREE.DynamicDrawUsage);
    this.vc = new THREE.BufferAttribute(new Float32Array(n * 8), 4).setUsage(THREE.DynamicDrawUsage);
    const uv = new Float32Array(n * 4);
    const idx = new Uint16Array((n - 1) * 6);
    for (let i = 0; i < n; i++) {
      uv.set([i / (n - 1), 0, i / (n - 1), 1], i * 4);
      if (i < n - 1) idx.set([i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2], i * 6);
    }
    geo.setAttribute('position', this.vp);
    geo.setAttribute('color', this.vc);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      uniforms: { uTime: { value: 0 }, uNoise: { value: noise } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.obj = new THREE.Mesh(geo, this.mat);
    this.obj.frustumCulled = false;
    this.obj.visible = false;
    scene.add(this.obj);
  }

  /** `pos` y `camPos` son Vector3 que reutiliza quien llama. */
  update(t, dt, pos, moving, camPos) {
    const n = this.n, P = this.pos, A = this.ages;
    for (let i = 0; i < this.count; i++) A[i] += dt;
    while (this.count > 0 && A[this.count - 1] > this.lifetime) this.count--;
    if (moving) {
      const dx = pos.x - P[0], dy = pos.y - P[1], dz = pos.z - P[2];
      if (this.count === 0 || dx * dx + dy * dy + dz * dz > this.step2) {
        P.copyWithin(3, 0, (n - 1) * 3);
        A.copyWithin(1, 0, n - 1);
        this.count = Math.min(this.count + 1, n);
      }
      P[0] = pos.x; P[1] = pos.y; P[2] = pos.z;
      A[0] = 0;
    }
    const cnt = this.count;
    this.obj.visible = cnt >= 2;
    if (cnt < 2) return;
    this.mat.uniforms.uTime.value = t;
    const vp = this.vp.array, vc = this.vc.array;
    for (let i = 0; i < cnt; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(cnt - 1, i + 1) * 3, o = i * 3;
      this.tan.set(P[a] - P[b], P[a + 1] - P[b + 1], P[a + 2] - P[b + 2]);
      this.cam.set(camPos.x - P[o], camPos.y - P[o + 1], camPos.z - P[o + 2]);
      this.side.crossVectors(this.tan, this.cam);
      const l = this.side.length();
      if (l > 1e-6) this.side.multiplyScalar(1 / l);
      const k = i / (n - 1);
      const w = this.width * (1 - this.taper * k);
      const col = this.rainbow ? this.tmp.setHSL((k * 0.8 + t * 0.15) % 1, 1, 0.6) : this.tmp.copy(this.c1).lerp(this.c2, k);
      const alpha = (1 - A[i] / this.lifetime) * (1 - k * 0.35) * 0.9;
      const v = i * 6, c = i * 8;
      vp[v] = P[o] + this.side.x * w; vp[v + 1] = P[o + 1] + this.side.y * w; vp[v + 2] = P[o + 2] + this.side.z * w;
      vp[v + 3] = P[o] - this.side.x * w; vp[v + 4] = P[o + 1] - this.side.y * w; vp[v + 5] = P[o + 2] - this.side.z * w;
      vc[c] = vc[c + 4] = col.r; vc[c + 1] = vc[c + 5] = col.g; vc[c + 2] = vc[c + 6] = col.b;
      vc[c + 3] = vc[c + 7] = alpha;
    }
    this.vp.needsUpdate = this.vc.needsUpdate = true;
    this.geo.setDrawRange(0, (cnt - 1) * 6);
  }

  clear() {
    this.count = 0;
    this.obj.visible = false;
  }

  dispose() {
    this.obj.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}

const SPARK_VERT = `
attribute vec3 iPos;
attribute vec4 iCol;
attribute vec4 iData;
uniform vec2 uGrid;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  float c = cos(iData.y), s = sin(iData.y);
  mv.xy += vec2(c * position.x - s * position.y, s * position.x + c * position.y) * iData.x;
  gl_Position = projectionMatrix * mv;
  vec2 cell = vec2(mod(iData.z, uGrid.x), floor(iData.z / uGrid.x));
  vUv = vec2((cell.x + uv.x) / uGrid.x, 1.0 - (cell.y + 1.0 - uv.y) / uGrid.y);
  vCol = iCol;
}`;
const SPARK_FRAG = `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 t = texture2D(uMap, vUv);
  gl_FragColor = vec4(t.rgb * vCol.rgb, t.a * vCol.a);
}`;

/**
 * Partículas aditivas con atlas de sprites: un único draw call instanciado.
 * El estado vive en typed arrays con compactación por intercambio, así que ni
 * `emit` ni `update` crean objetos.
 */
export class AdditiveParticles {
  constructor(scene, atlas, max = 300, cols = 4, rows = 2) {
    this.max = max;
    this.limit = max;
    this.n = 0;
    this.attract = new THREE.Vector3();
    this.attractOn = false;
    const f = (k) => new Float32Array(max * k);
    this.px = f(3); this.vel = f(3);
    this.life = f(1); this.decay = f(1); this.grav = f(1); this.drag = f(1);
    this.size = f(1); this.grow = f(1); this.rot = f(1); this.spin = f(1); this.cell = f(1); this.att = f(1);
    this.rgb = f(3);
    this.perParticle = [this.life, this.decay, this.grav, this.drag, this.size, this.grow, this.rot, this.spin, this.cell, this.att];
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = (this.geo = new THREE.InstancedBufferGeometry());
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aData = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iCol', this.aCol);
    geo.setAttribute('iData', this.aData);
    geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      uniforms: { uMap: { value: atlas }, uGrid: { value: new THREE.Vector2(cols, rows) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setLimit(l) {
    this.limit = Math.min(this.max, l);
    if (this.n > this.limit) this.n = this.limit;
  }

  /** Devuelve false si se alcanzó el límite de la calidad (la partícula se descarta). */
  emit(cell, x, y, z, vx, vy, vz, size, lifeSec, r, g, b, grav = 0, drag = 1, grow = 0, spin = 0, attract = 0) {
    if (this.n >= this.limit) return false;
    const i = this.n++, i3 = i * 3;
    this.px[i3] = x; this.px[i3 + 1] = y; this.px[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = 1; this.decay[i] = 1 / Math.max(0.05, lifeSec);
    this.grav[i] = grav; this.drag[i] = drag; this.size[i] = size; this.grow[i] = grow;
    this.rot[i] = 0; this.spin[i] = spin; this.cell[i] = cell; this.att[i] = attract;
    this.rgb[i3] = r; this.rgb[i3 + 1] = g; this.rgb[i3 + 2] = b;
    return true;
  }

  copy(from, to) {
    for (let k = 0; k < 3; k++) {
      this.px[to * 3 + k] = this.px[from * 3 + k];
      this.vel[to * 3 + k] = this.vel[from * 3 + k];
      this.rgb[to * 3 + k] = this.rgb[from * 3 + k];
    }
    const a = this.perParticle;
    for (let k = 0; k < a.length; k++) a[k][to] = a[k][from];
  }

  clear() {
    this.n = 0;
    this.mesh.visible = false;
    this.geo.instanceCount = 0;
  }

  update(dt) {
    const px = this.px, v = this.vel;
    for (let i = 0; i < this.n; ) {
      this.life[i] -= dt * this.decay[i];
      if (this.life[i] <= 0) {
        this.copy(--this.n, i);
        continue;
      }
      const i3 = i * 3;
      v[i3 + 1] -= this.grav[i] * dt;
      if (this.attractOn && this.att[i] > 0) {
        const dx = this.attract.x - px[i3], dy = this.attract.y - px[i3 + 1], dz = this.attract.z - px[i3 + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.25;
        const k = (this.att[i] * dt) / d;
        v[i3] += dx * k; v[i3 + 1] += dy * k; v[i3 + 2] += dz * k;
      }
      const dr = Math.exp(-this.drag[i] * dt);
      v[i3] *= dr; v[i3 + 1] *= dr; v[i3 + 2] *= dr;
      px[i3] += v[i3] * dt; px[i3 + 1] += v[i3 + 1] * dt; px[i3 + 2] += v[i3 + 2] * dt;
      if (px[i3 + 1] < 0.03 && this.grav[i] > 0) {
        px[i3 + 1] = 0.03;
        v[i3 + 1] = Math.abs(v[i3 + 1]) * 0.35;
        v[i3] *= 0.7; v[i3 + 2] *= 0.7;
      }
      this.rot[i] += this.spin[i] * dt;
      i++;
    }
    const n = this.n;
    const ap = this.aPos.array, ac = this.aCol.array, ad = this.aData.array;
    for (let i = 0; i < n; i++) {
      const l = this.life[i], i3 = i * 3, i4 = i * 4;
      ap[i3] = px[i3]; ap[i3 + 1] = px[i3 + 1]; ap[i3 + 2] = px[i3 + 2];
      ac[i4] = this.rgb[i3]; ac[i4 + 1] = this.rgb[i3 + 1]; ac[i4 + 2] = this.rgb[i3 + 2];
      ac[i4 + 3] = Math.min(1, l * 2.5);
      ad[i4] = Math.max(0.01, this.size[i] * (1 + (1 - l) * this.grow[i]));
      ad[i4 + 1] = this.rot[i];
      ad[i4 + 2] = this.cell[i];
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aData.needsUpdate = true;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}

/**
 * Pool fijo de planos sobre el suelo (chamuscado, escarcha, oro). Se reutilizan
 * en anillo; los que no caben en la calidad actual quedan ocultos.
 */
export class GroundDecals {
  constructor(scene, max = 12) {
    this.max = max;
    this.limit = max;
    this.next = 0;
    this.tex = softDotTexture();
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.items = Array.from({ length: max }, () => {
      const m = new THREE.Mesh(
        this.geo,
        new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      return { m, life: 0, decay: 1, op: 1 };
    });
  }

  setLimit(l) {
    this.limit = Math.min(this.max, l);
    for (let i = this.limit; i < this.max; i++) {
      this.items[i].life = 0;
      this.items[i].m.visible = false;
    }
    this.next %= Math.max(1, this.limit);
  }

  emit(x, y, z, radius, r, g, b, lifeSec = 2, additive = false, opacity = 0.7) {
    if (this.limit <= 0) return;
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.limit;
    it.life = 1; it.decay = 1 / lifeSec; it.op = opacity;
    it.m.material.color.setRGB(r, g, b);
    it.m.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    it.m.material.opacity = opacity;
    it.m.position.set(x, y + 0.014, z);
    it.m.scale.set(radius * 2, radius * 2, 1);
    it.m.visible = true;
  }

  update(dt) {
    for (let i = 0; i < this.limit; i++) {
      const it = this.items[i];
      if (it.life <= 0) continue;
      it.life -= dt * it.decay;
      if (it.life <= 0) it.m.visible = false;
      else it.m.material.opacity = it.op * Math.min(1, it.life * 2);
    }
  }

  clear() {
    for (const it of this.items) {
      it.life = 0;
      it.m.visible = false;
    }
  }

  dispose() {
    for (const it of this.items) {
      it.m.removeFromParent();
      it.m.material.dispose();
    }
    this.geo.dispose();
    this.tex.dispose();
  }
}

/** Línea de puntos con la trayectoria prevista hasta el primer rebote. */
export class AimDots {
  constructor(scene, n = 26) {
    this.n = n;
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }), n);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.dummy = new THREE.Object3D();
    scene.add(this.mesh);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.17, 0.22, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
  }

  show(points, color, t) {
    const n = Math.min(points.length, this.n);
    for (let i = 0; i < n; i++) {
      this.dummy.position.set(points[i].x, (points[i].y ?? 0) + 0.06, points[i].z);
      const pulse = 1 + 0.25 * Math.sin(t * 8 - i * 0.6);
      this.dummy.scale.setScalar(pulse * (1 - (i / this.n) * 0.5));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.material.color.copy(color);
    this.ring.material.color.copy(color);
  }

  showRing(pos, t) {
    this.ring.visible = true;
    this.ring.position.set(pos.x, pos.y - BALL_RADIUS + 0.01, pos.z);
    this.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
  }

  hide() {
    this.mesh.count = 0;
    this.ring.visible = false;
  }
}

/** Ondas que se expanden por el suelo: golpe, setas, hoyo y portales. */
export class Shockwaves {
  constructor(scene, n = 6) {
    this.items = Array.from({ length: n }, () => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      return { m, life: 0 };
    });
    this.next = 0;
  }

  emit(x, z, color = 0xffffff, size = 0.8, speed = 2.5) {
    const it = this.items[this.next++ % this.items.length];
    Object.assign(it, { life: 1, size, speed });
    it.m.material.color.set(color);
    it.m.position.set(x, 0.012, z);
    it.m.visible = true;
  }

  /** Anillos vivos ahora (sin asignar). */
  activeCount() {
    let c = 0;
    for (const it of this.items) if (it.life > 0) c++;
    return c;
  }

  update(dt) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt * it.speed;
      const k = 1 - Math.max(0, it.life);
      it.m.scale.setScalar(0.15 + k * it.size);
      it.m.material.opacity = Math.max(0, it.life) * 0.7;
      if (it.life <= 0) it.m.visible = false;
    }
  }

  dispose() {
    for (const it of this.items) {
      it.m.removeFromParent();
      it.m.geometry.dispose();
      it.m.material.dispose();
    }
  }
}
