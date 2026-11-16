import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, register } from '../src/screens/texts/index.js';
import '../src/screens/texts/common.js';

test('t resuelve una clave registrada', () => {
  register('tt', { hola: 'Hola' });
  assert.equal(t('tt.hola'), 'Hola');
});

test('t interpola variables', () => {
  register('tt2', { badge: '{n} novedades', dos: '{a} y {a} con {b}' });
  assert.equal(t('tt2.badge', { n: 2 }), '2 novedades');
  assert.equal(t('tt2.dos', { a: 'x', b: 0 }), 'x y x con 0');
});

test('variable ausente se deja visible', () => {
  register('tt3', { k: 'Hola {nombre}' });
  assert.equal(t('tt3.k'), 'Hola {nombre}');
});

test('clave inexistente lanza en test', () => {
  assert.throws(() => t('nada.nada'), /nada\.nada/);
  assert.throws(() => t('tt.noexiste'), /tt\.noexiste/);
});

test('el namespace common existe', () => {
  assert.equal(typeof t('common.back'), 'string');
  assert.equal(typeof t('common.retry'), 'string');
});
