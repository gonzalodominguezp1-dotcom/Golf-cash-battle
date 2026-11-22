import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNewBuild, parseVersionInfo, visibilityAction } from '../src/ui/versionRules.js';

test('parseVersionInfo acepta version y build no vacíos', () => {
  assert.deepEqual(parseVersionInfo({ version: '0.1.0', build: 'abc' }), { version: '0.1.0', build: 'abc' });
});

test('parseVersionInfo rechaza datos incompletos o de otro tipo', () => {
  assert.equal(parseVersionInfo(null), null);
  assert.equal(parseVersionInfo('0.1.0'), null);
  assert.equal(parseVersionInfo({ version: '0.1.0' }), null);
  assert.equal(parseVersionInfo({ version: '', build: 'abc' }), null);
  assert.equal(parseVersionInfo({ version: '0.1.0', build: 7 }), null);
});

test('isNewBuild solo avisa si el id servido cambia', () => {
  assert.equal(isNewBuild('abc', { version: '0.1.0', build: 'abc' }), false);
  assert.equal(isNewBuild('abc', { version: '0.1.0', build: 'def' }), true);
});

test('isNewBuild no compara sin id conocido ni sin datos', () => {
  assert.equal(isNewBuild(null, { version: '0.1.0', build: 'def' }), false);
  assert.equal(isNewBuild('abc', null), false);
});

test('con la pestaña oculta el intervalo se para', () => {
  assert.equal(visibilityAction(true, true), 'stop');
  assert.equal(visibilityAction(true, false), 'none');
});

test('al volver a ver la pestaña el intervalo arranca una sola vez', () => {
  assert.equal(visibilityAction(false, false), 'start');
  assert.equal(visibilityAction(false, true), 'none');
});
