import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PLAYER_CAP } from '../src/game/render/vfx/schema.js';
import { MAX_ACTIVE, VfxPlayer } from '../src/game/render/vfx/runtime.js';

const CELLS = { spark: 0, ember: 1, shard: 2, flake: 3, coin: 4, glyph: 5, soft: 6, streak: 7 };
const PALETTE = { accent: '#ff8800', glow: '#ffffff' };
const burst = (over = {}) => ({
  id: 'pop', name: 'Pop', family: 'impact', duration: 1, loop: false,
  maxParticles: { low: 12, medium: 30, high: 60 },
  emitters: [{ cell: 'spark', n: 40, speed: 3, spread: 0.2, size: 0.1, life: 0.5, col: 'accent', t0: 0 }],
  ...over,
});
const loop = () => ({
  id: 'aura', name: 'Aura', family: 'skin', duration: 2, loop: true,
  maxParticles: { low: 14, medium: 24, high: 40 },
  emitters: [{ cell: 'soft', rate: 20, t0: 0, t1: 2, speed: 0.5, spread: 1, size: 0.2, life: 0.5, col: 'glow' }],
});
const make = (quality = 'high') => {
  const scene = new THREE.Scene();
  const player = new VfxPlayer(scene, { quality, atlas: {}, cells: CELLS });
  return { scene, player };
};
const run = (player, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) player.update(dt); };

test('play reproduce el efecto: tras empezar hay partículas y nunca pasan del tope de la calidad', () => {
  for (const q of ['low', 'medium', 'high']) {
    const { player } = make(q);
    const h = player.play(burst(), { pos: { x: 0, y: 0, z: 0 }, seed: 1, palette: PALETTE });
    assert.ok(h);
    player.update(1 / 60);
    assert.ok(player.live > 0 && player.live <= PLAYER_CAP[q], `${q}: ${player.live}`);
  }
});

test('AC3: un efecto de una vez termina y no deja ninguna partícula viva', () => {
  const { player } = make();
  const h = player.play(burst(), { pos: { x: 0, y: 0, z: 0 }, seed: 1, palette: PALETTE });
  run(player, 0.3);
  assert.equal(h.done, false);
  run(player, 1.5);
  assert.equal(h.done, true);
  assert.equal(player.live, 0);
});

test('AC14: con el pool lleno se descartan las emisiones nuevas y las partículas vivas siguen siendo las mismas', () => {
  const { player } = make('low');
  let prev = [];
  for (let i = 0; i < 12; i++) {
    player.play(burst(), { pos: { x: i, y: 0, z: 0 }, seed: i, palette: PALETTE });
    player.update(0); // sin tiempo: no muere ni se mueve nada
    const now = player.velocities();
    assert.ok(now.length >= prev.length && now.length <= PLAYER_CAP.low);
    assert.deepEqual(now.slice(0, prev.length), prev, `una partícula viva cambió en la ronda ${i}`);
    prev = now;
  }
  assert.equal(player.live, PLAYER_CAP.low);
});

test('un bucle sigue activo pasada su duración hasta que se para, y se para del todo', () => {
  const { player } = make();
  const h = player.play(loop(), { pos: { x: 0, y: 0, z: 0 }, seed: 1, palette: PALETTE });
  run(player, 5);
  assert.equal(h.done, false);
  assert.ok(player.live > 0);
  h.stop();
  assert.equal(h.done, true);
  run(player, 1);
  assert.equal(player.live, 0);
});

test('hay un máximo de efectos simultáneos y el siguiente se rechaza sin romper nada', () => {
  const { player } = make();
  const hs = [];
  for (let i = 0; i < MAX_ACTIVE; i++) hs.push(player.play(loop(), { pos: { x: 0, y: 0, z: 0 }, seed: i, palette: PALETTE }));
  assert.ok(hs.every(Boolean));
  assert.equal(player.play(loop(), { pos: { x: 0, y: 0, z: 0 }, seed: 99, palette: PALETTE }), null);
  hs[0].stop();
  assert.ok(player.play(loop(), { pos: { x: 0, y: 0, z: 0 }, seed: 99, palette: PALETTE }));
});

test('setLevel baja el tope en caliente y las partículas sobrantes se recortan', () => {
  const { player } = make('high');
  player.play(burst(), { pos: { x: 0, y: 0, z: 0 }, seed: 1, palette: PALETTE });
  player.play(burst(), { pos: { x: 0, y: 0, z: 0 }, seed: 2, palette: PALETTE });
  player.update(0.001);
  assert.ok(player.live > PLAYER_CAP.low);
  player.setLevel('low');
  assert.ok(player.live <= PLAYER_CAP.low);
});

test('la normal orienta el efecto: contra una pared las partículas salen hacia fuera', () => {
  const { player } = make();
  player.play(burst({ emitters: [{ ...burst().emitters[0], spread: 0 }] }), { pos: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 }, seed: 1, palette: PALETTE });
  player.update(0.05);
  const v = player.velocities();
  assert.ok(v.length > 0 && v.every((p) => p.z > 0.5 && Math.abs(p.y) < 0.2), JSON.stringify(v[0]));
});

test('dir up manda las partículas hacia arriba aunque la normal sea una pared', () => {
  const { player } = make();
  const em = { ...burst().emitters[0], spread: 0, dir: 'up' };
  player.play(burst({ emitters: [em] }), { pos: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 }, seed: 1, palette: PALETTE });
  player.update(0.05);
  assert.ok(player.velocities().every((p) => p.y > 0.5));
});

test('con reducción de movimiento sale menos y más lento que sin ella', () => {
  const a = make(), b = make();
  a.player.play(burst(), { pos: { x: 0, y: 0, z: 0 }, seed: 1, palette: PALETTE, reduced: false });
  b.player.play(burst(), { pos: { x: 0, y: 0, z: 0 }, seed: 1, palette: PALETTE, reduced: true });
  a.player.update(0); b.player.update(0);
  const top = (pl) => Math.max(...pl.velocities().map((v) => Math.hypot(v.x, v.y, v.z)));
  assert.ok(b.player.live < a.player.live);
  assert.ok(top(b.player) < top(a.player) * 0.6, `${top(b.player)} frente a ${top(a.player)}`);
});

test('la misma semilla da las mismas posiciones y otra semilla da otras', () => {
  const snap = (seed) => {
    const { player } = make();
    player.play(burst(), { pos: { x: 0, y: 0, z: 0 }, seed, palette: PALETTE });
    player.update(0.1);
    return JSON.stringify(player.velocities());
  };
  assert.equal(snap(5), snap(5));
  assert.notEqual(snap(5), snap(6));
});

test('un efecto inválido no se reproduce, devuelve null y no lanza', () => {
  const { player } = make();
  assert.equal(player.play({ id: 'roto' }, { pos: { x: 0, y: 0, z: 0 }, seed: 1, palette: PALETTE }), null);
  assert.deepEqual(player.lastErrors.length > 0, true);
});

test('dispose quita la malla de la escena', () => {
  const { scene, player } = make();
  assert.equal(scene.children.length, 1);
  player.dispose();
  assert.equal(scene.children.length, 0);
});

test('AC2: un bucle sigue emitiendo tras cada vuelta y el número de vivas se repite cada ciclo', () => {
  const { player } = make();
  player.play(loop(), { pos: { x: 0, y: 0, z: 0 }, seed: 1, palette: PALETTE });
  const at = {};
  for (let f = 1; f <= 400; f++) { player.update(1 / 60); at[f] = player.live; } // 2 s = 120 fotogramas por ciclo
  assert.ok(at[130] > 0 && at[250] > 0 && at[370] > 0);
  assert.equal(at[130], at[250]);
  assert.equal(at[250], at[370]);
});

test('un dt enorme no atasca el bucle y un dt roto se ignora sin envenenar nada', () => {
  const { player } = make();
  const h = player.play(loop(), { pos: { x: 0, y: 0, z: 0 }, seed: 1, palette: PALETTE });
  player.update(1000);
  player.update(NaN); player.update(-1); player.update(Infinity);
  run(player, 1);
  assert.equal(h.done, false);
  assert.ok(player.live > 0);
  assert.ok(player.velocities().every((v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)));
  const one = player.play(burst(), { pos: { x: 0, y: 0, z: 0 }, seed: 2, palette: PALETTE });
  player.update(NaN);
  run(player, 2);
  assert.equal(one.done, true); // el dt roto no dejó la casilla colgada
});

test('un color sin paleta cae a blanco sin avisos de three; los hex se respetan', () => {
  const warn = console.warn, seen = [];
  console.warn = (...a) => seen.push(a.join(' '));
  try {
    const { player } = make();
    player.play(burst(), { pos: { x: 0, y: 0, z: 0 }, seed: 1 }); // col: 'accent' y sin paleta
    player.update(0);
    assert.deepEqual(seen, []);
    const rgb = Array.from(player.pool.rgb.slice(0, 3));
    assert.deepEqual(rgb, [1, 1, 1]);
    const { player: q } = make();
    q.play(burst({ emitters: [{ ...burst().emitters[0], col: '#ff0000' }] }), { pos: { x: 0, y: 0, z: 0 }, seed: 1 });
    q.update(0);
    assert.ok(q.pool.rgb[0] > 0.9 && q.pool.rgb[1] < 0.1);
  } finally { console.warn = warn; }
});

test('pos inválida o ausente se rechaza y una normal degenerada cae a +y', () => {
  const { player } = make();
  for (const bad of [undefined, { x: NaN, y: 0, z: 0 }, { x: 0, y: Infinity, z: 0 }]) {
    assert.equal(player.play(burst(), { pos: bad, seed: 1, palette: PALETTE }), null);
    assert.ok(player.lastErrors.some((e) => e.includes('pos')));
  }
  const em = { ...burst().emitters[0], spread: 0 };
  player.play(burst({ emitters: [em] }), { pos: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, seed: 1, palette: PALETTE });
  player.update(0.05);
  assert.ok(player.velocities().length > 0 && player.velocities().every((v) => v.y > 0.5));
});

test('dir in va hacia dentro (−normal) y fwd a lo largo de la superficie', () => {
  const run1 = (dir) => {
    const { player } = make();
    player.play(burst({ emitters: [{ ...burst().emitters[0], spread: 0, dir }] }), { pos: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 }, seed: 1, palette: PALETTE });
    player.update(0.02);
    return player.velocities();
  };
  assert.ok(run1('in').every((v) => v.z < -0.5));
  assert.ok(run1('fwd').every((v) => Math.abs(v.z) < 0.2 && Math.hypot(v.x, v.y) > 0.5));
});
