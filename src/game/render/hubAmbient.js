// Apariciones al azar del hub (C7, AC14): chispas de luz, una mariposa y una bola que rueda y entra en la copa.
// Sin temporizadores: el reloj avanza con `update(dt)` desde el bucle de render de la escena, así que con la
// escena pausada, tapada u oculta no hay nada vivo. Con movimiento reducido no se crea ninguna aparición.
import * as THREE from 'three';
import { AdditiveParticles } from './effects.js';
import { ambientPlan, ambientSpec, ballRollState, clampDt, nextAmbientKind } from './hubSceneRules.js';

const MAX_SPARKS = 40;

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/**
 * @param {THREE.Scene} scene
 * @param {{quality?: string, reducedMotion?: boolean, rng?: () => number}} opts
 * @returns {{update(dt:number):void, setQuality(q:string):void, setEnabled(on:boolean):void, active():string|null, dispose():void}}
 */
export function createHubAmbient(scene, { quality = 'medium', reducedMotion = false, rng = Math.random } = {}) {
  let q = quality;
  let enabled = !reducedMotion;
  let disposed = false;
  let wait = 0; // segundos hasta la siguiente aparición
  let plan = null;
  let cur = null; // { kind, t, dur, ... }

  const tex = dotTexture();
  const sparks = new AdditiveParticles(scene, tex, MAX_SPARKS, 1, 1);

  // mariposa: dos alas que se abren y cierran sobre un cuerpo invisible
  const wingGeoL = new THREE.PlaneGeometry(0.28, 0.2).rotateX(-Math.PI / 2).translate(-0.14, 0, 0);
  const wingGeoR = new THREE.PlaneGeometry(0.28, 0.2).rotateX(-Math.PI / 2).translate(0.14, 0, 0);
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xffa23a, side: THREE.DoubleSide });
  const wingL = new THREE.Mesh(wingGeoL, wingMat);
  const wingR = new THREE.Mesh(wingGeoR, wingMat);
  const butterfly = new THREE.Group();
  butterfly.add(wingL, wingR);
  butterfly.visible = false;
  scene.add(butterfly);

  // bola
  const ballGeo = new THREE.SphereGeometry(0.12, 16, 12);
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.castShadow = true;
  ball.visible = false;
  scene.add(ball);

  const schedule = () => {
    plan = ambientPlan(rng, q, !enabled);
    wait = plan ? plan.nextInMs / 1000 : Infinity;
  };

  function start(kind) {
    const spec = ambientSpec(q);
    if (kind === 'particles') {
      const n = spec.sparks;
      const a0 = rng() * Math.PI * 2, r0 = 2 + rng() * 5;
      const cx = Math.cos(a0) * r0, cz = Math.sin(a0) * r0;
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2, r = rng() * 1.6;
        const warm = rng() < 0.6;
        sparks.emit(0, cx + Math.cos(a) * r, 0.2 + rng() * 0.6, cz + Math.sin(a) * r,
          (rng() - 0.5) * 0.3, 0.35 + rng() * 0.5, (rng() - 0.5) * 0.3,
          0.16 + rng() * 0.16, 2.5 + rng() * 2, warm ? 1 : 0.7, warm ? 0.85 : 1, warm ? 0.4 : 0.75, 0, 0.5);
      }
      cur = { kind, t: 0, dur: 0 }; // las chispas se apagan solas; solo hay que actualizarlas
    } else if (kind === 'butterfly') {
      cur = { kind, t: 0, dur: spec.butterflyS, phi: rng() * Math.PI * 2, rad: 4 + rng() * 4, dir: rng() < 0.5 ? -1 : 1, h: 1.2 + rng() * 0.6 };
      butterfly.visible = true;
    } else {
      const a = rng() * Math.PI * 2, r = 5 + rng() * 1.2;
      cur = { kind, t: 0, dur: spec.ballS, sx: Math.cos(a) * r, sz: Math.sin(a) * r };
      ball.scale.setScalar(1);
      ball.visible = true;
    }
  }

  function end() {
    butterfly.visible = false;
    ball.visible = false;
    cur = null;
  }

  function step(dt) {
    cur.t += dt;
    const u = cur.dur > 0 ? cur.t / cur.dur : 1;
    if (cur.kind === 'butterfly') {
      if (u >= 1) return end();
      const ph = cur.phi + cur.dir * cur.t * 0.5;
      const s = Math.min(1, cur.t / 0.6, (cur.dur - cur.t) / 0.6);
      butterfly.position.set(Math.cos(ph) * cur.rad, cur.h + 0.35 * Math.sin(cur.t * 1.7), Math.sin(ph) * cur.rad);
      butterfly.rotation.y = -ph + (cur.dir > 0 ? Math.PI : 0);
      butterfly.scale.setScalar(Math.max(0.01, s));
      const flap = Math.sin(cur.t * 18) * 0.9;
      wingR.rotation.z = flap;
      wingL.rotation.z = -flap;
    } else if (cur.kind === 'ballIn') {
      if (u >= 1) return end();
      const { remaining, sink } = ballRollState(u);
      ball.position.set(cur.sx * remaining, 0.13 - sink * 0.22, cur.sz * remaining);
      ball.scale.setScalar(1 - sink * 0.6);
      ball.rotation.x += dt * 8;
    }
  }

  // Ronda: antes de repetir un tipo salen los tres (así en ~3 apariciones se ve de todo).
  let seen = new Set();
  function nextKind(kind) {
    const r = nextAmbientKind(seen, kind);
    seen = r.seen;
    return r.kind;
  }

  schedule();

  return {
    update(dt) {
      const d = clampDt(dt);
      if (disposed || !enabled || d === 0) return;
      if (!cur) {
        wait -= d;
        if (wait <= 0 && plan) { start(nextKind(plan.kind)); schedule(); }
      }
      if (cur && cur.kind !== 'particles') step(d);
      if (cur?.kind === 'particles' && sparks.n === 0 && cur.t > 0.2) cur = null;
      if (cur?.kind === 'particles') cur.t += d;
      sparks.update(d);
    },
    setQuality(next) {
      q = next;
      sparks.setLimit(ambientSpec(q).sparks); // recorta también las chispas vivas
    },
    /** Apaga o enciende las apariciones (la captura de capas las apaga). Al apagar se borra lo que haya. */
    setEnabled(on) {
      if (disposed) return;
      const next = !!on && !reducedMotion;
      if (next === enabled) return;
      enabled = next;
      if (!enabled) { end(); sparks.clear(); wait = Infinity; plan = null; } else schedule();
    },
    active: () => (cur ? cur.kind : null),
    dispose() {
      if (disposed) return;
      disposed = true;
      cur = null;
      sparks.dispose();
      tex.dispose();
      butterfly.removeFromParent();
      wingGeoL.dispose(); wingGeoR.dispose(); wingMat.dispose();
      ball.removeFromParent();
      ballGeo.dispose(); ballMat.dispose();
    },
  };
}
