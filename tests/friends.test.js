import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addedMessage, cleanFriendName, friendMessage } from '../src/account/friendRules.js';

test('el nombre de amigo se limpia y solo vale 3-16 letras, números o _', () => {
  assert.equal(cleanFriendName('  Gonzalo_7 '), 'Gonzalo_7');
  assert.equal(cleanFriendName('@Ana_99'), 'Ana_99');
  assert.equal(cleanFriendName('ab'), null);
  assert.equal(cleanFriendName('a'.repeat(17)), null);
  assert.equal(cleanFriendName('con espacio'), null);
  assert.equal(cleanFriendName("x'; drop table"), null);
  assert.equal(cleanFriendName(null), null);
});

test('cada error del servidor tiene un texto y lo desconocido no se filtra', () => {
  for (const code of ['invalid_username', 'user_not_found', 'cannot_friend_self', 'already_friends', 'request_pending', 'username_required', 'not_found']) {
    assert.notEqual(friendMessage(code), friendMessage('otra_cosa'), code);
  }
  assert.match(friendMessage('internal_error_xyz'), /Prueba otra vez/);
});

test('el aviso distingue petición enviada de amistad directa', () => {
  assert.equal(addedMessage('pending', 'Ana'), 'Petición enviada a Ana.');
  assert.equal(addedMessage('accepted', 'Ana'), 'Ya eres amigo de Ana.');
});
