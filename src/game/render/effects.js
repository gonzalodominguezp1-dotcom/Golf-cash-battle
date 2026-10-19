import * as THREE from 'three';
import { softDotTexture } from './textures.js';

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

/** Estela de la bola. */
export class Trail {
  constructor(scene, n = 28, color = '#ffffff') {
    this.n = n;
    this.points = [];
    this.rainbow = color === 'rainbow';
    this.color = new THREE.Color(this.rainbow ? '#ffffff' : color);
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
    if (moving) this.points.unshift(pos.clone());
    else this.points.pop();
    this.points.length = Math.min(this.points.length, this.n);
    const p = this.geo.attributes.position, c = this.geo.attributes.color;
    for (let i = 0; i < this.n; i++) {
      const v = this.points[i];
      if (v) p.setXYZ(i, v.x, v.y, v.z);
      const col = this.rainbow ? new THREE.Color().setHSL(i / this.n, 1, 0.6) : this.color;
      c.setXYZW(i, col.r, col.g, col.b, v ? (1 - i / this.n) * 0.8 : 0);
    }
    p.needsUpdate = c.needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
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
      this.dummy.position.set(points[i].x, 0.06, points[i].z);
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
    this.ring.position.set(pos.x, 0.01, pos.z);
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
}
