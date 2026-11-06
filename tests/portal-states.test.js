import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { portalState } from '../src/game/render/vfx/portalState.js';
import { buildPortal } from '../src/game/render/portal.js';

const fake = () => {
  const calls = [];
  return { calls, setOpen: (k) => calls.push(k) };
};
const make = (opts = {}) => {
  const portal = fake(), events = [];
  const st = portalState(portal, { enterTime: 0.6, exitTime: 0.5, onState: (s) => events.push(s), ...opts });
  return { portal, st, events };
};
const run = (st, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds - 1e-9; t += dt) st.update(dt); };

test('T006: un portal nace abierto y estable, como los de hoy', () => {
  const { st, portal } = make();
  assert.equal(st.state, 'stable');
  assert.equal(st.open, 1);
  run(st, 2);
  assert.equal(st.state, 'stable');
  assert.deepEqual(portal.calls, []); // un portal estable no toca nada
});

test('T006: exit cierra el portal de forma monótona en su tiempo y acaba cerrado', () => {
  const { st, portal, events } = make();
  st.exit();
  assert.equal(st.state, 'exit');
  let prev = 1;
  for (let i = 0; i < 30; i++) { st.update(1 / 60); assert.ok(st.open <= prev + 1e-12 && st.open >= 0); prev = st.open; }
  run(st, 0.1);
  assert.equal(st.state, 'closed');
  assert.equal(st.open, 0);
  assert.equal(portal.calls.at(-1), 0);
  assert.deepEqual(events, ['exit', 'closed']);
});

test('T006: enter abre el portal de forma monótona y acaba estable', () => {
  const { st, events } = make();
  st.exit(); run(st, 1);
  events.length = 0;
  st.enter();
  assert.equal(st.state, 'enter');
  let prev = 0;
  for (let i = 0; i < 36; i++) { st.update(1 / 60); assert.ok(st.open >= prev - 1e-12 && st.open <= 1); prev = st.open; }
  run(st, 0.1);
  assert.equal(st.state, 'stable');
  assert.equal(st.open, 1);
  assert.deepEqual(events, ['enter', 'stable']);
});

test('T006: los tiempos son los configurados', () => {
  const { st } = make({ enterTime: 1, exitTime: 2 });
  st.exit(); run(st, 1.9);
  assert.equal(st.state, 'exit');
  run(st, 0.2);
  assert.equal(st.state, 'closed');
  st.enter(); run(st, 0.9);
  assert.equal(st.state, 'enter');
  run(st, 0.2);
  assert.equal(st.state, 'stable');
});

test('T006: interrumpir a medias no da saltos: la apertura es continua', () => {
  const { st } = make();
  st.exit(); run(st, 0.2);
  const mid = st.open;
  assert.ok(mid > 0 && mid < 1);
  st.enter();
  assert.ok(Math.abs(st.open - mid) < 1e-9);
  let prev = st.open;
  for (let i = 0; i < 60; i++) { st.update(1 / 60); assert.ok(Math.abs(st.open - prev) < 0.2); prev = st.open; }
  assert.equal(st.state, 'stable');
});

test('T006: enter y exit repetidos no reinician ni repiten eventos', () => {
  const { st, events } = make();
  st.enter(); st.enter();
  assert.deepEqual(events, []); // ya estaba estable
  st.exit(); run(st, 0.1); const o = st.open; st.exit();
  assert.equal(st.open, o);
  assert.deepEqual(events, ['exit']);
  run(st, 1);
  st.exit();
  assert.deepEqual(events, ['exit', 'closed']);
});

test('T006: stable() fija el portal abierto de golpe', () => {
  const { st } = make();
  st.exit(); run(st, 0.2);
  st.stable();
  assert.equal(st.state, 'stable');
  assert.equal(st.open, 1);
});

test('T006: un dt roto se ignora y la apertura siempre queda entre 0 y 1', () => {
  const { st } = make();
  st.exit();
  st.update(NaN); st.update(-1); st.update(Infinity);
  assert.equal(st.state, 'exit');
  assert.ok(st.open >= 0 && st.open <= 1);
  st.update(100);
  assert.equal(st.state, 'closed');
  assert.equal(st.open, 0);
});

test('T006: buildPortal mantiene su firma y expone setOpen sin cambiar el portal por defecto', () => {
  const scene = new THREE.Scene();
  const portal = buildPortal(scene, [3, 4], 1, 0xb46cff, 0, { value: 0 }, 1);
  assert.equal(typeof portal.update, 'function');
  assert.equal(typeof portal.setOpen, 'function');
  assert.equal(portal.group.visible, true);
  assert.equal(portal.group.scale.x, 1);
  portal.update(1);
  portal.setOpen(0.5);
  assert.equal(portal.group.scale.x, 0.5);
  assert.equal(portal.group.scale.y, 1);
  portal.setOpen(0);
  assert.equal(portal.group.visible, false);
  portal.setOpen(1);
  assert.equal(portal.group.visible, true);
  assert.equal(portal.group.scale.x, 1);
});

test('T006: desde la mitad solo se tarda lo que falta, no el tiempo entero', () => {
  const { st } = make(); // exitTime 0,5; enterTime 0,6
  st.exit(); run(st, 0.2);
  assert.ok(Math.abs(st.open - 0.84) < 1e-6); // 1 - 0,4²
  st.enter();
  run(st, 0.08);
  assert.equal(st.state, 'enter');
  run(st, 0.04); // 0,6 × (1 − 0,84) = 0,096 s en total
  assert.equal(st.state, 'stable');
});

test('T006: tiempos de 0 completan en el primer update y un tiempo roto cae al valor por defecto', () => {
  const z = make({ enterTime: 0, exitTime: 0 });
  z.st.exit(); z.st.update(1 / 60);
  assert.equal(z.st.state, 'closed');
  z.st.enter(); z.st.update(1 / 60);
  assert.equal(z.st.state, 'stable');
  for (const bad of [NaN, -1, Infinity, 'x', null]) {
    const { st, portal } = make({ exitTime: bad });
    st.exit(); run(st, 1);
    assert.equal(st.state, 'closed', String(bad));
    assert.ok(portal.calls.every(Number.isFinite), String(bad));
  }
});

test('T006: interrumpir justo al empezar vuelve a estable sin saltos, y un onState que lanza deja el estado coherente', () => {
  const { st } = make();
  st.exit(); st.enter();
  st.update(1 / 60);
  assert.equal(st.state, 'stable');
  assert.equal(st.open, 1);
  const boom = make({ onState: () => { throw new Error('fallo del oyente'); } });
  assert.throws(() => boom.st.exit(), /oyente/);
  assert.equal(boom.st.state, 'exit');
  assert.equal(boom.st.open, 1);
});

test('T006: buildPortal deja la luz como siempre sin setOpen, la atenúa con setOpen e ignora valores rotos', () => {
  const scene = new THREE.Scene();
  const portal = buildPortal(scene, [0, 0], 1, 0xb46cff, 0, { value: 0 }, 1);
  const light = portal.group.children.find((c) => c.isPointLight);
  const base = 1.4 + Math.sin(1 * 3.1 + 1 * 5) * 0.18 + Math.sin(1 * 7.3 + 1) * 0.08; // t = 1, seed = 1
  portal.update(1);
  assert.ok(Math.abs(light.intensity - base) < 1e-9, `${light.intensity} frente a ${base}`);
  portal.setOpen(0.5);
  portal.update(1);
  assert.ok(Math.abs(light.intensity - base * 0.5) < 1e-9);
  portal.setOpen(NaN); portal.setOpen(undefined);
  assert.equal(portal.group.scale.x, 0.5);
  assert.equal(portal.group.visible, true);
});
