import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  windState,
  setWind,
  setWindField,
  triggerGust,
  updateWind,
  resetWind,
  applyWind,
  WIND_ATTRS,
  WIND_LAYERS,
  windDisplacement,
  windAmp,
  gustEnvelope,
  windSample,
  windAmplitude,
  prepareWind,
  isWindMaterial,
} from '../src/game/render/assets/wind.js';
import { addWind, bakeStatic } from '../src/game/render/batch.js';

const calm = (over = {}) => ({ strength: 1, dirX: 1, dirZ: 0, gusts: [], gustWidth: 7, ...over });
const P = (over = {}) => ({ x: 3, y: 1.5, z: -2, h: 1.5, p0: 0.7, p1: 2.1, w: 1, ...over });
const len = (o) => Math.hypot(o.x, o.y, o.z);

beforeEach(() => resetWind());

// ---------- lógica pura ----------

test('viento: fuerza 0 = ningún desplazamiento en ninguna capa, ni con ráfaga', () => {
  const gusts = [{ front: 3, amp: 1 }];
  for (const layer of Object.keys(WIND_LAYERS)) {
    for (const t of [0, 1.3, 47.9]) {
      const o = windDisplacement(P(), layer, t, calm({ strength: 0, gusts }));
      assert.equal(len(o), 0, `${layer} t=${t}`);
    }
  }
});

test('viento: determinista (mismos datos, mismo resultado) y cambia con el tiempo', () => {
  const a = windDisplacement(P(), 'canopy', 12.5, calm());
  const b = windDisplacement(P(), 'canopy', 12.5, calm());
  assert.deepEqual(a, b);
  const c = windDisplacement(P(), 'canopy', 13.1, calm());
  assert.notDeepEqual(a, c);
  assert.ok(len(a) > 0);
});

test('viento: la base (altura 0) no se mueve', () => {
  for (const layer of Object.keys(WIND_LAYERS)) assert.equal(len(windDisplacement(P({ h: 0, y: 0 }), layer, 5, calm())), 0, layer);
});

test('viento: el tronco se dobla con la altura al cuadrado y en la dirección del viento', () => {
  const t = 4.2;
  const lo = windDisplacement(P({ h: 1 }), 'trunk', t, calm());
  const hi = windDisplacement(P({ h: 2 }), 'trunk', t, calm());
  assert.ok(Math.abs(hi.x / lo.x - 4) < 1e-9, `ratio ${hi.x / lo.x}`);
  assert.equal(lo.z, 0);
  const ang = 1.1;
  const d = windDisplacement(P({ h: 2 }), 'trunk', t, calm({ dirX: Math.cos(ang), dirZ: Math.sin(ang) }));
  assert.ok(Math.abs(Math.atan2(d.z, d.x) - ang) < 1e-9);
  // al doblarse, la punta baja un poco (no se estira)
  assert.ok(hi.y < 0);
});

test('viento: más fuerza, más movimiento; la ráfaga encima del punto lo multiplica', () => {
  const t = 2;
  const one = len(windDisplacement(P(), 'canopy', t, calm({ strength: 1 })));
  const two = len(windDisplacement(P(), 'canopy', t, calm({ strength: 2 })));
  assert.ok(two > one * 1.9);
  const gust = len(windDisplacement(P(), 'canopy', t, calm({ gusts: [{ front: 3, amp: 1 }] })));
  assert.ok(gust > one * 1.8, `${gust} vs ${one}`);
  // una ráfaga lejos no se nota
  const far = len(windDisplacement(P(), 'canopy', t, calm({ gusts: [{ front: 80, amp: 1 }] })));
  assert.ok(Math.abs(far - one) < 1e-6);
});

test('ráfaga: envolvente 1 en el frente, cae delante rápido y detrás despacio', () => {
  assert.equal(gustEnvelope(10, 10, 7), 1);
  assert.ok(gustEnvelope(10 + 7, 10, 7) < gustEnvelope(10 - 7, 10, 7));
  assert.ok(gustEnvelope(100, 10, 7) < 1e-6);
  // amplitud de fondo (brisa) siempre entre 0,4 y 1 con fuerza 1
  for (let d = -50; d < 50; d += 3.7) {
    const a = windAmp(d, d * 0.31, 1, [], 7);
    assert.ok(a >= 0.4 - 1e-9 && a <= 1 + 1e-9, `${a}`);
  }
});

// ---------- estado global ----------

test('setWind: ángulo en radianes a dirección unitaria; fuerza limitada a 0..2', () => {
  setWind({ strength: 1.5, angle: Math.PI / 2 });
  assert.ok(Math.abs(windState.dirX) < 1e-12 && Math.abs(windState.dirZ - 1) < 1e-12);
  assert.equal(windState.strength, 1.5);
  setWind({ strength: 9 });
  assert.equal(windState.strength, 2);
  setWind({ strength: -1 });
  assert.equal(windState.strength, 0);
  // solo cambia lo que se pasa
  setWind({ angle: 0 });
  assert.equal(windState.strength, 0);
  assert.equal(windState.dirX, 1);
});

test('ráfaga: viaja por el mundo a favor del viento (llega antes al punto de barlovento)', () => {
  setWind({ strength: 1, angle: 0, autoGusts: false });
  setWindField({ x: 0, z: 0, radius: 30 });
  triggerGust();
  assert.ok(windSample().gusts.length === 1);
  const peak = { up: [-1, 0], down: [-1, 0] };
  for (let i = 0; i < 1200; i++) {
    updateWind(1 / 60);
    const up = windAmplitude(-15, 0), down = windAmplitude(15, 0);
    if (up > peak.up[0]) peak.up = [up, i];
    if (down > peak.down[0]) peak.down = [down, i];
  }
  assert.ok(peak.up[0] > 1.5 && peak.down[0] > 1.5, 'la ráfaga se nota en los dos puntos');
  assert.ok(peak.down[1] > peak.up[1] + 60, `llega después a sotavento (${peak.up[1]} -> ${peak.down[1]})`);
  // y al final se va
  assert.equal(windSample().gusts.length, 0);
  assert.equal(windState.gust, 0);
});

test('ráfagas automáticas con semilla: misma semilla, mismos momentos', () => {
  const times = (seed) => {
    resetWind({ seed });
    setWindField({ radius: 10 });
    const out = [];
    let n = 0;
    for (let i = 0; i < 60 * 40; i++) {
      updateWind(1 / 60);
      const k = windSample().gusts.length;
      if (k > n) out.push(i);
      n = k;
    }
    return out;
  };
  const a = times(7), b = times(7);
  assert.ok(a.length >= 2);
  assert.deepEqual(a, b);
});

// mayor salto de la fuerza del viento entre dos fotogramas seguidos, en puntos de todo el campo
// (radio 125: las ráfagas nacen y mueren fuera de él)
function maxJump(frames, onFrame = () => {}) {
  const xs = [];
  for (let x = -125; x <= 125; x += 2) xs.push(x);
  let prev = xs.map((x) => windAmplitude(x, 0)), worst = 0;
  for (let i = 0; i < frames; i++) {
    onFrame(i);
    updateWind(1 / 60);
    const cur = xs.map((x) => windAmplitude(x, 0));
    cur.forEach((v, k) => (worst = Math.max(worst, Math.abs(v - prev[k]))));
    prev = cur;
  }
  return worst;
}

test('ráfaga: en un hoyo grande, una tercera ráfaga manual no hace saltar el viento (la que sale se funde)', () => {
  setWind({ strength: 1, angle: 0, autoGusts: false });
  setWindField({ radius: 125 });
  triggerGust();
  for (let i = 0; i < 60 * 8; i++) updateWind(1 / 60);
  triggerGust();
  for (let i = 0; i < 60 * 8; i++) updateWind(1 / 60);
  // la primera va por mitad del campo: quitarla de golpe sería un salto de ~1,8
  assert.equal(windSample().gusts.length, 2);
  const jump = maxJump(60 * 3, (i) => i === 10 && triggerGust());
  assert.ok(jump < 0.15, `salto de ${jump.toFixed(3)} entre fotogramas`);
  // la nueva entra igualmente (tras el fundido)
  assert.equal(windSample().gusts.length, 2);
  assert.ok(windSample().gusts.some((g) => g.front < -100), 'la tercera ráfaga ha entrado por barlovento');
});

test('ráfagas automáticas en un hoyo grande: el viento nunca salta entre fotogramas', () => {
  resetWind({ seed: 3 });
  setWindField({ radius: 125 });
  const jump = maxJump(60 * 120);
  assert.ok(jump < 0.15, `salto de ${jump.toFixed(3)} entre fotogramas`);
});

test('updateWind: avanza el tiempo y lo pasa a los uniformes', async () => {
  const { windUniforms } = await import('../src/game/render/assets/wind.js');
  updateWind(0.05);
  updateWind(0.025);
  assert.ok(Math.abs(windUniforms.uWind.value.w - 0.075) < 1e-9);
  // un salto enorme (pestaña dormida) no dispara el viento
  updateWind(30);
  assert.ok(windUniforms.uWind.value.w < 1);
  setWind({ strength: 0.5, angle: Math.PI });
  assert.equal(windUniforms.uWind.value.z, 0.5);
  assert.ok(Math.abs(windUniforms.uWind.value.x + 1) < 1e-12);
});

// ---------- material ----------

const fakeShader = () => ({
  uniforms: {},
  vertexShader: '#include <common>\nvoid main(){\n#include <begin_vertex>\n#include <project_vertex>\n}',
  fragmentShader: '#include <common>\nvoid main(){}',
});

test('applyWind: engancha el viento al material, comparte uniformes y no rompe el onBeforeCompile anterior', async () => {
  const { windUniforms } = await import('../src/game/render/assets/wind.js');
  const m = new THREE.MeshLambertMaterial();
  let prev = 0;
  m.onBeforeCompile = () => prev++;
  m.customProgramCacheKey = () => 'mine';
  assert.equal(applyWind(m, { layer: 'canopy' }), m);
  assert.ok(isWindMaterial(m));
  const sh = fakeShader();
  m.onBeforeCompile(sh);
  assert.equal(prev, 1);
  assert.equal(sh.uniforms.uWind, windUniforms.uWind);
  assert.equal(sh.uniforms.uGust, windUniforms.uGust);
  assert.match(sh.vertexShader, /attribute float sway;/);
  assert.match(sh.vertexShader, /attribute vec2 windPhase;/);
  assert.match(sh.vertexShader, /transformed \+=/);
  assert.doesNotMatch(sh.vertexShader, /NaN|undefined/);
  // llaves abiertas = cerradas
  assert.equal((sh.vertexShader.match(/\{/g) ?? []).length, (sh.vertexShader.match(/\}/g) ?? []).length);
  // cada capa compila su programa
  const g = applyWind(new THREE.MeshLambertMaterial(), { layer: 'grass', source: 'y' });
  assert.notEqual(g.customProgramCacheKey(), m.customProgramCacheKey());
  assert.match(m.customProgramCacheKey(), /mine/);
  const shg = fakeShader();
  g.onBeforeCompile(shg);
  assert.doesNotMatch(shg.vertexShader, /attribute float sway;/, 'la hierba instanciada usa la altura local');
  assert.throws(() => applyWind(new THREE.MeshLambertMaterial(), { layer: 'nope' }));
});

// ---------- bakeStatic ----------

const windMat = applyWind(new THREE.MeshLambertMaterial(), { layer: 'canopy' });
const rockMat = new THREE.MeshLambertMaterial();

function tree(x, z) {
  const g = new THREE.Group();
  g.userData.swayRoot = true;
  g.position.set(x, 0, z);
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), windMat);
  a.position.set(0.5, 1.5, 0);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), windMat);
  b.position.set(-0.5, 1.6, 0);
  // pieza encima de otra (misma columna): mismo balanceo, no se separan
  const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), windMat);
  c.position.set(0.5, 2.0, 0);
  g.add(a, b, c);
  return g;
}

test('bakeStatic: los atributos de viento sobreviven al juntar las mallas', () => {
  const root = new THREE.Group();
  root.add(tree(0, 0), tree(5, 3));
  const rock = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), rockMat);
  root.add(rock);
  // una pieza con atributos de viento propios (como los assets nuevos): se respetan tal cual
  const authored = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3).toNonIndexed(), windMat);
  const n = authored.geometry.attributes.position.count;
  authored.geometry.setAttribute('windFlutter', new THREE.BufferAttribute(new Float32Array(n).fill(0.25), 1));
  authored.geometry.setAttribute('sway', new THREE.BufferAttribute(new Float32Array(n).fill(9), 1));
  authored.position.set(-4, 0, 0);
  root.add(authored);

  const parent = new THREE.Group();
  const out = bakeStatic(root, parent);
  const leaves = out.find((m) => m.material === windMat);
  const stone = out.find((m) => m.material === rockMat);
  assert.ok(leaves && stone);
  for (const name of WIND_ATTRS) assert.ok(leaves.geometry.attributes[name], `falta ${name}`);
  assert.equal(leaves.geometry.attributes.windPhase.itemSize, 2);
  // la roca no lleva viento: no paga atributos
  for (const name of WIND_ATTRS) assert.equal(stone.geometry.attributes[name], undefined, `roca con ${name}`);

  const sway = leaves.geometry.attributes.sway.array, fl = leaves.geometry.attributes.windFlutter.array;
  // altura sobre la base del árbol: las cajas van de 1,3 a 2,1 m
  const treeSway = [...sway].filter((v) => v !== 9);
  assert.ok(Math.min(...treeSway) > 1.29 && Math.max(...treeSway) < 2.11);
  // lo propio se conserva
  assert.equal([...sway].filter((v) => v === 9).length, n);
  assert.equal([...fl].filter((v) => v === 0.25).length, n);
  assert.equal([...fl].filter((v) => v === 1).length, fl.length - n);
});

test('bakeStatic: fase por pieza (determinista); piezas apiladas comparten fase, árboles distintos no', () => {
  const phasesOf = () => {
    const root = new THREE.Group();
    root.add(tree(0, 0), tree(5, 3));
    const out = bakeStatic(root, new THREE.Group());
    const ph = out[0].geometry.attributes.windPhase;
    // 36 vértices por caja (BoxGeometry sin índice): una fase por pieza
    const per = [];
    for (let i = 0; i < ph.count; i += 36) per.push([ph.getX(i), ph.getY(i)]);
    return per;
  };
  const a = phasesOf(), b = phasesOf();
  assert.deepEqual(a, b);
  assert.equal(a.length, 6);
  const [t1a, t1b, t1c, t2a] = a;
  assert.equal(t1a[0], t1b[0], 'mismo árbol, misma fase de tronco');
  assert.notEqual(t1a[1], t1b[1], 'ramas distintas, fase distinta');
  assert.equal(t1a[1], t1c[1], 'pieza encima de otra, misma fase');
  assert.notEqual(t1a[0], t2a[0], 'árboles distintos, fase distinta');
});

test('bakeStatic: el viento antiguo (addWind) sigue recibiendo su sway', () => {
  const legacy = addWind(new THREE.MeshLambertMaterial(), { uTime: { value: 0 } }, 0.05);
  const root = new THREE.Group();
  const t = new THREE.Group();
  t.userData.swayRoot = true;
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), legacy);
  m.position.y = 2;
  t.add(m);
  root.add(t);
  const [out] = bakeStatic(root, new THREE.Group());
  assert.ok(out.geometry.attributes.sway);
  assert.ok(Math.min(...out.geometry.attributes.sway.array) > 1.49);
});

test('prepareWind: da los atributos de viento a un objeto sin juntar (laboratorio) sin tocar la geometría compartida', () => {
  const shared = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const t = new THREE.Group();
  t.userData.swayRoot = true;
  const a = new THREE.Mesh(shared, windMat);
  a.position.y = 1.5;
  const r = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), rockMat);
  t.add(a, r);
  assert.equal(prepareWind(t), t);
  assert.equal(shared.attributes.sway, undefined, 'la geometría original no se toca');
  for (const name of WIND_ATTRS) assert.ok(a.geometry.attributes[name], name);
  assert.equal(r.geometry.attributes.sway, undefined);
  assert.ok(Math.min(...a.geometry.attributes.sway.array) > 1.29);
});
