import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { collectSceneResources, disposeSceneResources } from '../src/game/render/sceneDisposal.js';

const spy = (obj) => {
  const calls = { n: 0 };
  const orig = obj.dispose?.bind(obj);
  obj.dispose = () => { calls.n++; orig?.(); };
  return calls;
};

function build() {
  const scene = new THREE.Scene();
  const map = new THREE.Texture();
  const normalMap = new THREE.Texture();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ map, normalMap });
  const mesh = new THREE.Mesh(geo, mat);
  const instGeo = new THREE.SphereGeometry(1, 4, 4);
  const instMat = new THREE.MeshBasicMaterial();
  const inst = new THREE.InstancedMesh(instGeo, instMat, 3);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  const shadowMap = { n: 0 };
  sun.shadow.map = { dispose: () => shadowMap.n++ };
  const uniTex = new THREE.Texture();
  const shaderGeo = new THREE.PlaneGeometry(1, 1);
  const shaderMat = new THREE.ShaderMaterial({ uniforms: { tex: { value: uniTex } } });
  const shaderMesh = new THREE.Mesh(shaderGeo, shaderMat);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
  const env = new THREE.Texture();
  scene.environment = env;
  const group = new THREE.Group();
  group.add(shaderMesh);
  scene.add(mesh, inst, sun, group, sprite);
  const s = {
    geo: spy(geo), instGeo: spy(instGeo), shaderGeo: spy(shaderGeo), sprite: spy(sprite.geometry),
    map: spy(map), normalMap: spy(normalMap), uniTex: spy(uniTex), env: spy(env),
    mat: spy(mat), instMat: spy(instMat), shaderMat: spy(shaderMat), inst: spy(inst),
  };
  return { scene, geo, map, normalMap, uniTex, inst, sun, shadowMap, env, s };
}

test('collectSceneResources: geometrías, texturas (mapas y uniforms), luces, InstancedMesh y materiales', () => {
  const { scene, geo, map, normalMap, uniTex, inst, sun, env } = build();
  const r = collectSceneResources(scene);
  assert.ok(r.geometries.has(geo));
  assert.equal(r.geometries.size, 3); // sin la del Sprite (una sola para todos)
  assert.ok(r.textures.has(map) && r.textures.has(normalMap) && r.textures.has(uniTex));
  assert.ok(!r.textures.has(env), 'el entorno no se recoge');
  assert.ok(r.lights.has(sun));
  assert.ok(r.instanced.has(inst));
  assert.equal(r.materials.size, 4);
});

test('disposeSceneResources: libera geometrías, texturas, sombra e InstancedMesh; no los materiales', () => {
  const { scene, shadowMap, sun, s } = build();
  const out = disposeSceneResources(scene);
  assert.equal(s.geo.n, 1);
  assert.equal(s.instGeo.n, 1);
  assert.equal(s.shaderGeo.n, 1);
  assert.equal(s.map.n, 1);
  assert.equal(s.normalMap.n, 1);
  assert.equal(s.uniTex.n, 1);
  assert.equal(s.inst.n, 1);
  assert.equal(shadowMap.n, 1);
  assert.equal(sun.shadow.map, null);
  assert.equal(s.mat.n + s.instMat.n + s.shaderMat.n, 0, 'los materiales no se liberan');
  assert.equal(s.env.n, 0, 'scene.environment se conserva');
  assert.equal(s.sprite.n, 0, 'la geometría compartida del Sprite no se toca');
  assert.deepEqual(out, { geometries: 3, textures: 3, shadowMaps: 1, lights: 1, instanced: 1, kept: 0, materials: 4 });
});

test('disposeSceneResources respeta userData.gcbShared y keep', () => {
  const { scene, geo, map, s } = build();
  map.userData.gcbShared = true;
  const out = disposeSceneResources(scene, { keep: new Set([geo]) });
  assert.equal(s.map.n, 0);
  assert.equal(s.geo.n, 0);
  assert.equal(s.normalMap.n, 1);
  assert.equal(out.kept, 2);
  assert.equal(out.geometries, 2);
  assert.equal(out.textures, 2);
});

test('disposeSceneResources acepta otro criterio de compartido', () => {
  const { scene, normalMap, s } = build();
  disposeSceneResources(scene, { isShared: (r) => r === normalMap });
  assert.equal(s.normalMap.n, 0);
  assert.equal(s.map.n, 1);
});

test('disposeSceneResources es idempotente', () => {
  const { scene, shadowMap, s } = build();
  disposeSceneResources(scene);
  const again = disposeSceneResources(scene);
  assert.equal(s.geo.n, 1);
  assert.equal(s.map.n, 1);
  assert.equal(s.inst.n, 1);
  assert.equal(shadowMap.n, 1);
  assert.deepEqual(again, { geometries: 0, textures: 0, shadowMaps: 0, lights: 0, instanced: 0, kept: 0, materials: 0 });
});

test('disposeSceneResources sin raíz no hace nada', () => {
  assert.equal(disposeSceneResources(null).geometries, 0);
});
