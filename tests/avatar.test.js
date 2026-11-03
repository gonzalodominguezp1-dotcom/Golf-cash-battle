import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_ICONS, AvatarStore, MAX_AVATAR_BYTES, checkAvatarFile, fromWire, toWire } from '../src/progress/avatar.js';

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

test('formato de servidor: ida y vuelta, y lo raro se descarta', () => {
  assert.equal(toWire({ icon: 'crown', image: null }), 'icon:crown');
  assert.equal(toWire({ icon: null, image: PNG }), PNG);
  assert.equal(toWire({ icon: null, image: null }), null);
  assert.deepEqual(fromWire('icon:crown'), { icon: 'crown', image: null });
  assert.deepEqual(fromWire(PNG), { icon: null, image: PNG });
  assert.deepEqual(fromWire('icon:inventado'), { icon: null, image: null });
  assert.deepEqual(fromWire('data:text/html;base64,AAAA'), { icon: null, image: null });
  assert.deepEqual(fromWire(null), { icon: null, image: null });
});

test('cada cambio se sube a la cuenta y un fallo de red no rompe el guardado local', async () => {
  const sent = [];
  const a = new AvatarStore('u1', mem());
  a.onChange = (v) => { sent.push(v); return Promise.reject(new Error('network')); };
  a.setIcon('wolf');
  a.setImage(PNG);
  a.clear();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(sent, [{ icon: 'wolf', image: null }, { icon: null, image: PNG }, { icon: null, image: null }]);
  assert.deepEqual(a.get(), { icon: null, image: null });
});

test('al entrar manda el servidor; si no tiene nada, sube el avatar local una sola vez', async () => {
  const storage = mem();
  const old = new AvatarStore('u1', storage);
  old.setImage(PNG); // avatar de antes de guardarse en la cuenta

  const uploads = [];
  const a = new AvatarStore('u1', storage);
  a.onChange = async (v) => { uploads.push(v); };
  a.hydrate(null);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(uploads, [{ icon: null, image: PNG }]);

  // ya sincronizado: si en el servidor se quitó, no se vuelve a subir el local
  const b = new AvatarStore('u1', storage);
  b.onChange = async (v) => { uploads.push(v); };
  b.hydrate(null);
  assert.equal(uploads.length, 1);

  // el servidor manda sobre lo local, sin volver a subirlo
  const c = new AvatarStore('u1', storage);
  c.onChange = async (v) => { uploads.push(v); };
  c.hydrate('icon:dragon');
  assert.deepEqual(c.get(), { icon: 'dragon', image: null });
  assert.equal(uploads.length, 1);
});

test('si la subida inicial falla, se reintenta en la próxima entrada', async () => {
  const storage = mem();
  new AvatarStore('u1', storage).setIcon('gem');
  const a = new AvatarStore('u1', storage);
  a.onChange = () => Promise.reject(new Error('network'));
  a.hydrate(null);
  await new Promise((r) => setImmediate(r));
  const sent = [];
  const b = new AvatarStore('u1', storage);
  b.onChange = async (v) => { sent.push(v); };
  b.hydrate(null);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(sent, [{ icon: 'gem', image: null }]);
});
