import * as THREE from 'three';
import { ballPose } from './terrain.js';
import { softDotTexture } from './textures.js';
import { quality } from './quality.js';
import { createRain } from './cyberpunkRain.js';

// Efectos visuales del hoyo 15 (tema cyber2078). Solo leen la bola y los eventos de step();
// no escriben nada que use la simulación, la sincronía de servidor ni los bots.
const TRAIL_N = 26;
const TRAIL_SPEED = 6; // m/s; por debajo no hay estela

/**
 * Crea los efectos del hoyo y los añade a la escena. Devuelve { onPortal, onBumper, update }.
 * onPortal(i) y onBumper(i) se llaman al recibir el evento de step(); update(t, ball) cada frame.
 * `q` es el preset de calidad (por defecto quality()); decide la cantidad de lluvia.
 */
export function createCyberFx(scene, course, q = quality()) {
  const group = new THREE.Group();
  scene.add(group);
  let now = 0;

  // anillo de plasma en la boca de acceso del portal: se enciende al entrar la bola
  const rings = (course.portals ?? []).map((p) => {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(p.r * 1.05, p.r * 1.3, 48),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    const y = ballPose(course, { x: p.a[0], z: p.a[1], vx: 0, vz: 0 }).y;
    mesh.position.set(p.a[0], y + 0.08, p.a[1]);
    group.add(mesh);
    return { mesh, t0: -10 };
  });

  // destello magenta en cada seta al golpearla
  const halos = (course.bumpers ?? []).map((b) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: softDotTexture(), color: 0xff007f, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    sprite.scale.setScalar(b.r * 4);
    const y = ballPose(course, { x: b.x, z: b.z, vx: 0, vz: 0 }).y;
    sprite.position.set(b.x, y + 0.5, b.z);
    group.add(sprite);
    return { sprite, t0: -10 };
  });

  // estela: los últimos puntos de la bola a más de TRAIL_SPEED. Buffer propio de este módulo.
  const pos = new Float32Array(TRAIL_N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setDrawRange(0, 0);
  const trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85 }));
  trail.frustumCulled = false;
  group.add(trail);
  let count = 0;

  // lluvia (una malla; sin gotas en calidad baja)
  const rain = createRain(scene, course, q);

  return {
    onPortal(i) {
      if (rings[i]) rings[i].t0 = now;
    },
    onBumper(i) {
      if (halos[i]) halos[i].t0 = now;
    },
    update(t, ball) {
      now = t;
      rain?.update(t);
      for (const r of rings) {
        const age = t - r.t0;
        const live = age >= 0 && age < 0.7;
        r.mesh.material.opacity = live ? 0.9 * (1 - age / 0.7) : 0.12 + 0.05 * Math.sin(t * 3);
        r.mesh.scale.setScalar(live ? 1 + age * 1.6 : 1);
      }
      for (const h of halos) {
        const age = t - h.t0;
        h.sprite.material.opacity = age >= 0 && age < 0.5 ? 0.8 * (1 - age / 0.5) : 0;
      }
      const speed = Math.hypot(ball.vx, ball.vz);
      if (speed > TRAIL_SPEED) {
        const p = ballPose(course, ball);
        pos.copyWithin(3, 0, (TRAIL_N - 1) * 3);
        pos[0] = p.x;
        pos[1] = p.y + 0.05;
        pos[2] = p.z;
        count = Math.min(count + 1, TRAIL_N);
        geo.attributes.position.needsUpdate = true;
      } else {
        count = 0;
      }
      geo.setDrawRange(0, count);
    },
  };
}
