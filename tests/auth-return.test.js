import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReturnUrl, cleanReturnUrl, mapLinkError, parseReturnUrl, authMessage } from '../src/account/authRules.js';

test('vuelta del correo: se construye siempre en la raíz con el flujo', () => {
  assert.equal(buildReturnUrl('https://golf.example', 'confirm'), 'https://golf.example/?auth=confirm');
  assert.equal(buildReturnUrl('https://golf.example/', 'recovery'), 'https://golf.example/?auth=recovery');
  assert.throws(() => buildReturnUrl('https://golf.example', 'otra'));
});

test('vuelta del correo: lee el código y el flujo', () => {
  assert.deepEqual(parseReturnUrl('https://g.example/?auth=confirm&code=abc'), { flow: 'confirm', code: 'abc', error: null });
  assert.deepEqual(parseReturnUrl('https://g.example/?auth=recovery&code=xyz'), { flow: 'recovery', code: 'xyz', error: null });
});

test('vuelta del correo: error en el hash (enlace caducado o ya usado)', () => {
  const r = parseReturnUrl('https://g.example/?auth=confirm#error=access_denied&error_code=otp_expired');
  assert.equal(r.error, 'link_used');
  assert.equal(r.code, null);
});

test('vuelta del correo: una URL normal no es vuelta', () => {
  assert.equal(parseReturnUrl('https://g.example/'), null);
  assert.equal(parseReturnUrl('https://g.example/#/hub'), null);
  assert.equal(parseReturnUrl('no es una url'), null);
});

test('vuelta del correo: flujo desconocido se ignora sin romper', () => {
  assert.deepEqual(parseReturnUrl('https://g.example/?auth=raro&code=c1'), { flow: null, code: 'c1', error: null });
});

test('limpiar la URL deja solo origen y ruta', () => {
  assert.equal(cleanReturnUrl('https://g.example/?auth=confirm&code=abc#x'), 'https://g.example/');
  assert.equal(cleanReturnUrl('https://g.example/admin.html?code=1'), 'https://g.example/admin.html');
});

test('errores del enlace se mapean a textos en español', () => {
  assert.equal(mapLinkError('otp_expired'), 'link_used');
  assert.equal(mapLinkError('flow_state_not_found'), 'confirm_elsewhere');
  assert.equal(mapLinkError('algo_nuevo'), 'unknown');
  assert.match(authMessage('confirm_elsewhere'), /Entra con tu email/);
  assert.match(authMessage('link_used'), /ya se usó/);
});

test('vuelta de Google: el flujo oauth se lee y se construye en la raíz', () => {
  assert.equal(buildReturnUrl('https://golf.example', 'oauth'), 'https://golf.example/?auth=oauth');
  assert.deepEqual(parseReturnUrl('https://g.example/?auth=oauth&code=g1'), { flow: 'oauth', code: 'g1', error: null });
});
