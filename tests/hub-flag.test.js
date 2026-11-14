import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFlagRig, FLAG_W } from '../src/game/render/hubFlag.js';
import { flagWindSpec } from '../src/game/render/hubSceneRules.js';

const SUN = [-0.55, 0.8, -0.35];
const fakeTextures = () => {
  const front = new THREE.Texture(), back = new THREE.Texture();
  const disposed = [];
  front.addEventListener('dispose', () => disposed.push('front'));
  back.addEventListener('dispose', () => disposed.push('back'));
  return { front, back, disposed };
};

test('con texturas: tela con map, trasera visible con su propia textura y colorSpace sRGB', async () => {
  const tex = fakeTextures();
  let loaded = 0;
  const rig = createFlagRig({ spec: flagWindSpec('high', false), sunDir: SUN, loadTextures: async () => tex, onTextures: () => loaded++ });
  assert.equal(await rig.ready, true);
  assert.equal(loaded, 1);
  const { frontMat, backMat, back, shadowMat } = rig.parts;
  assert.equal(frontMat.map, tex.front);
  assert.equal(backMat.map, tex.back);
  assert.notEqual(frontMat.map, backMat.map, 'cada cara su textura: el logo no se ve espejado por detrás');
  assert.equal(frontMat.side, THREE.FrontSide);
  assert.equal(backMat.side, THREE.BackSide);
  assert.equal(tex.front.colorSpace, THREE.SRGBColorSpace);
  assert.ok(frontMat.alphaTest > 0 && shadowMat.map === tex.front, 'silueta recortada también en la sombra');
  assert.equal(back.visible, true);
  rig.dispose();
});

test('dispose() libera ambas texturas, geometrías y materiales', async () => {
  const tex = fakeTextures();
  const rig = createFlagRig({ spec: flagWindSpec('medium', false), sunDir: SUN, loadTextures: async () => tex });
  await rig.ready;
  rig.dispose();
  assert.deepEqual(tex.disposed.sort(), ['back', 'front']);
  rig.dispose(); // idempotente
  assert.equal(tex.disposed.length, 2);
});

test('dispose() antes de que lleguen las texturas: se liberan al llegar', async () => {
  const tex = fakeTextures();
  const rig = createFlagRig({ spec: null, sunDir: SUN, loadTextures: async () => tex });
  rig.dispose();
  assert.equal(await rig.ready, false);
  assert.deepEqual(tex.disposed.sort(), ['back', 'front']);
});

test('si la textura no carga sigue la tela roja lisa y no hay error', async () => {
  const rig = createFlagRig({ spec: flagWindSpec('medium', false), sunDir: SUN, loadTextures: async () => { throw new Error('404'); } });
  assert.equal(await rig.ready, false);
  assert.equal(rig.parts.frontMat.map, null);
  assert.equal(rig.parts.frontMat.color.getHex(), 0xe01212);
  assert.equal(rig.parts.back.visible, false);
  rig.dispose();
});

test('con viento la tela se mueve, el borde del mástil no, y el palo se balancea', () => {
  const rig = createFlagRig({ spec: flagWindSpec('high', false), sunDir: SUN, loadTextures: async () => fakeTextures() });
  const pos = rig.parts.front.geometry.attributes.position;
  const snap = () => Array.from(pos.array);
  rig.update(1.1);
  const a = snap();
  rig.update(1.6);
  const b = snap();
  assert.notDeepEqual(a, b);
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getX(i) + FLAG_W / 2) < 1e-9) {
      assert.ok(Math.abs(b[i * 3 + 2]) < 1e-9, 'el borde del mástil se queda en su sitio');
    }
  }
  assert.notEqual(rig.parts.mast.rotation.z, 0);
  assert.ok(Math.abs(rig.parts.mast.rotation.z) < 0.05);
  rig.dispose();
});

test('sin viento (low o reduced-motion) nada se mueve', () => {
  const rig = createFlagRig({ spec: null, sunDir: SUN, loadTextures: async () => fakeTextures() });
  const before = Array.from(rig.parts.front.geometry.attributes.position.array);
  rig.update(3.3);
  rig.update(7.1);
  assert.deepEqual(Array.from(rig.parts.front.geometry.attributes.position.array), before);
  assert.equal(rig.parts.mast.rotation.z, 0);
  rig.dispose();
});

test('la sombra se recalcula cada frame y sigue a la tela y al palo', () => {
  const rig = createFlagRig({ spec: flagWindSpec('high', false), sunDir: SUN, loadTextures: async () => fakeTextures() });
  rig.update(0.5);
  const m1 = rig.parts.flagShadow.matrix.clone();
  const p1 = rig.parts.poleShadow.matrix.clone();
  rig.update(1.3);
  assert.ok(!m1.equals(rig.parts.flagShadow.matrix) || !p1.equals(rig.parts.poleShadow.matrix), 'el palo en movimiento cambia la sombra');
  // La punta del palo cae al suelo desplazada hacia el lado contrario del sol.
  const tip = new THREE.Vector3(0, 1.2, 0).applyMatrix4(rig.parts.poleShadow.matrix);
  assert.ok(Math.abs(tip.y - 0.03) < 1e-6);
  assert.ok(tip.x > 0.5 && tip.z > 0.2, `punta en (${tip.x.toFixed(2)}, ${tip.z.toFixed(2)})`);
  rig.dispose();
});

test('setSpec cambia la malla al cambiar de calidad y low la deja plana y quieta', () => {
  const rig = createFlagRig({ spec: flagWindSpec('high', false), sunDir: SUN, loadTextures: async () => fakeTextures() });
  const hi = rig.parts.front.geometry.attributes.position.count;
  rig.setSpec(flagWindSpec('medium', false));
  const mid = rig.parts.front.geometry.attributes.position.count;
  assert.ok(mid < hi);
  rig.setSpec(null);
  assert.equal(rig.parts.front.geometry.attributes.position.count, 4);
  assert.equal(rig.parts.mast.rotation.z, 0);
  assert.equal(rig.parts.back.geometry, rig.parts.front.geometry);
  assert.equal(rig.parts.flagShadow.geometry, rig.parts.front.geometry);
  rig.dispose();
});
