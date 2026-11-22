import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTextureCache, cacheKey } from '../src/game/render/textureCache.js';

const tex = (n = 256) => new THREE.Texture({ width: n, height: n });
const MB = 1024 * 1024;

test('segunda llamada con la misma clave: acierto sin make() y el clon comparte source', () => {
  const c = createTextureCache({ maxBytes: 10 * MB });
  let calls = 0;
  const make = () => { calls++; return tex(); };
  const a = c.get('k', make);
  const b = c.get('k', make);
  assert.equal(calls, 1);
  assert.equal(a.source, b.source);
  assert.notEqual(a, b);
  assert.equal(c.stats().hits, 1);
});

test('repeat independiente entre clones', () => {
  const c = createTextureCache({ maxBytes: 10 * MB });
  const a = c.get('k', tex);
  const b = c.get('k', tex);
  a.repeat.set(5, 5);
  assert.equal(b.repeat.x, 1);
});

test('reenlaza normalMap/roughnessMap.repeat al map del paquete clonado', () => {
  const c = createTextureCache({ maxBytes: 10 * MB });
  const make = () => {
    const map = tex(), normalMap = tex(), roughnessMap = tex();
    normalMap.repeat = roughnessMap.repeat = map.repeat;
    normalMap.offset = roughnessMap.offset = map.offset;
    return { map, normalMap, roughnessMap };
  };
  c.get('p', make);
  const p = c.get('p', make);
  assert.equal(p.normalMap.repeat, p.map.repeat);
  assert.equal(p.roughnessMap.repeat, p.map.repeat);
  assert.equal(p.normalMap.offset, p.map.offset);
  p.map.repeat.set(3, 4);
  assert.equal(p.normalMap.repeat.x, 3);
  const q = c.get('p', make);
  assert.equal(q.map.repeat.x, 1);
});

test('la clave cambia con texScale y anisotropía', () => {
  assert.notEqual(cacheKey('x', [1], 4, 0.5), cacheKey('x', [1], 4, 2));
  assert.notEqual(cacheKey('x', [1], 4, 1), cacheKey('x', [1], 8, 1));
  assert.notEqual(cacheKey('x', [1], 4, 1), cacheKey('x', [2], 4, 1));
  assert.equal(cacheKey('x', [1], 4, 1), 'x|[1]|1|a4');
});

test('la LRU expulsa por bytes y hace dispose del maestro', () => {
  const one = Math.round(256 * 256 * 4 * 1.33);
  const c = createTextureCache({ maxBytes: one * 2 });
  const masters = [];
  const make = () => { const t = tex(); let d = 0; t.addEventListener('dispose', () => d++); t.__d = () => d; masters.push(t); return t; };
  c.get('a', make); c.get('b', make);
  c.get('a', make); // a más reciente
  c.get('c', make); // expulsa b
  assert.equal(c.stats().entries, 2);
  assert.equal(masters[1].__d(), 1);
  assert.equal(masters[0].__d(), 0);
  const calls = masters.length;
  c.get('b', make);
  assert.equal(masters.length, calls + 1);
});

test('dispose de un clon no afecta al maestro ni a otros clones', () => {
  const c = createTextureCache({ maxBytes: 10 * MB });
  const a = c.get('k', tex), b = c.get('k', tex);
  let d = 0;
  b.addEventListener('dispose', () => d++);
  a.dispose();
  assert.equal(d, 0);
  assert.equal(c.get('k', tex).source, b.source);
});

test('maxBytes 0: sin caché, make() cada vez', () => {
  const c = createTextureCache({ maxBytes: 0 });
  let n = 0;
  c.get('k', () => { n++; return tex(); });
  c.get('k', () => { n++; return tex(); });
  assert.equal(n, 2);
  assert.equal(c.stats().entries, 0);
});

test('stats() correcto', () => {
  let t = 0;
  const c = createTextureCache({ maxBytes: 10 * MB, now: () => (t += 5) });
  c.get('a', tex); c.get('a', tex); c.get('b', tex);
  const s = c.stats();
  assert.equal(s.hits, 1);
  assert.equal(s.misses, 2);
  assert.equal(s.entries, 2);
  assert.equal(s.bytes, 2 * Math.round(256 * 256 * 4 * 1.33));
  assert.equal(s.msGenerated, 10);
  c.clear();
  assert.equal(c.stats().entries, 0);
  assert.equal(c.stats().bytes, 0);
});

test('fuente: labelTexture no pasa por el caché y el interruptor existe', () => {
  const src = readFileSync(new URL('../src/game/render/textures.js', import.meta.url), 'utf8');
  const label = src.slice(src.indexOf('export function labelTexture'), src.indexOf('export const SKIN_SPRITES'));
  assert.ok(label.length > 50);
  assert.ok(!/cached\(/.test(label));
  assert.match(readFileSync(new URL('../src/game/render/textureCache.js', import.meta.url), 'utf8'), /export const TEXTURE_CACHE = true;/);
});
