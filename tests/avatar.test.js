import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_ICONS, AvatarStore, MAX_AVATAR_BYTES, checkAvatarFile } from '../src/progress/avatar.js';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};
const PNG = 'data:image/png;base64,AAAA';

test('el límite del archivo es 2,5 MB y solo png, jpeg o webp', () => {
  assert.equal(MAX_AVATAR_BYTES, 2.5 * 1024 * 1024);
  assert.equal(checkAvatarFile({ type: 'image/png', size: MAX_AVATAR_BYTES }), null);
  assert.equal(checkAvatarFile({ type: 'image/png', size: MAX_AVATAR_BYTES + 1 }), 'size');
  assert.equal(checkAvatarFile({ type: 'image/svg+xml', size: 10 }), 'type');
  assert.equal(checkAvatarFile(null), 'type');
});

test('icono e imagen se excluyen y se guardan por cuenta', () => {
  const storage = mem();
  const a = new AvatarStore('u1', storage);
  assert.deepEqual(a.get(), { icon: null, image: null });
  a.setIcon(AVATAR_ICONS[2].id);
  assert.deepEqual(a.get(), { icon: 'crown', image: null });
  a.setImage(PNG);
  assert.deepEqual(a.get(), { icon: null, image: PNG });
  assert.deepEqual(new AvatarStore('u2', storage).get(), { icon: null, image: null });
  assert.equal(new AvatarStore('u1', storage).get().image, PNG);
  a.clear();
  assert.deepEqual(a.get(), { icon: null, image: null });
});

test('rechaza iconos desconocidos y urls que no son imagen', () => {
  const a = new AvatarStore('u1', mem());
  a.setIcon('nope');
  a.setImage('javascript:alert(1)');
  a.setImage('data:image/svg+xml;base64,AAAA');
  assert.deepEqual(a.get(), { icon: null, image: null });
});
