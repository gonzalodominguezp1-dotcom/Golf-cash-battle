import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerAsset, getAssets, getAsset, resetAssets, seededRng, formatCount, diffStats, formatStats,
} from '../src/lab/assetRegistry.js';

beforeEach(() => resetAssets());

const ok = { id: 'a', label: 'A', makeOld: () => null, makeNew: () => null };

test('registerAsset registra y recupera por id', () => {
  registerAsset(ok);
  assert.equal(getAsset('a').label, 'A');
  assert.deepEqual(getAssets().map((a) => a.id), ['a']);
  assert.equal(getAsset('nope'), null);
});

test('registerAsset rechaza datos incompletos y ids repetidos', () => {
  assert.throws(() => registerAsset({ ...ok, id: '' }));
  assert.throws(() => registerAsset({ ...ok, label: undefined }));
  assert.throws(() => registerAsset({ ...ok, makeOld: null }));
  assert.throws(() => registerAsset({ ...ok, makeNew: 5 }));
  registerAsset(ok);
  assert.throws(() => registerAsset(ok), /repetido/);
});

test('seededRng: misma semilla, misma secuencia; rango [0,1)', () => {
  const a = seededRng(7), b = seededRng(7), c = seededRng(8);
  const sa = Array.from({ length: 20 }, a), sb = Array.from({ length: 20 }, b), sc = Array.from({ length: 20 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((v) => v >= 0 && v < 1));
});

test('formatCount', () => {
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount(742), '742');
  assert.equal(formatCount(1234), '1,2k');
  assert.equal(formatCount(12500), '12,5k');
  assert.equal(formatCount(undefined), '0');
});

test('diffStats resta y nunca baja de cero; formatStats', () => {
  assert.deepEqual(diffStats({ triangles: 100, calls: 3 }, { triangles: 842, calls: 8 }), { triangles: 742, calls: 5 });
  assert.deepEqual(diffStats({ triangles: 10, calls: 3 }, { triangles: 5, calls: 1 }), { triangles: 0, calls: 0 });
  assert.equal(formatStats({ triangles: 742, calls: 5 }), '742 tri · 5 llamadas');
  assert.equal(formatStats(null), '');
});
