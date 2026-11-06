import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, SETTINGS_KEY, SettingsStore, inputFactors, sanitizeSettings } from '../src/settings/settings.js';

const mem = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), map: m };
};
const clock = (t = 1000) => () => (t += 10);
const flush = () => new Promise((r) => setImmediate(r));

test('sin nada guardado salen los valores por defecto', () => {
  const s = new SettingsStore(mem(), { now: clock() }).get();
  assert.deepEqual(s.sound, DEFAULT_SETTINGS.sound);
  assert.deepEqual(s.controls, DEFAULT_SETTINGS.controls);
  assert.deepEqual(s.quality, { mobile: null, desktop: null });
  assert.equal(s.updatedAt, 0);
});

test('lo raro se sanea: fuera de rango se recorta y lo desconocido vuelve al defecto', () => {
  const s = sanitizeSettings({
    sound: { muted: 'si', master: 250, ambient: -4 },
    quality: { mobile: 'ultra', desktop: 'high' },
    controls: { invertAim: true, cameraSensitivity: 99, aimSensitivity: 'x', wheel: 'turbo', vibration: 0 },
    updatedAt: -5,
  });
  assert.deepEqual(s.sound, { muted: false, master: 100, ambient: 0 });
  assert.deepEqual(s.quality, { mobile: null, desktop: 'high' });
  assert.equal(s.controls.invertAim, true);
  assert.equal(s.controls.cameraSensitivity, 2.5);
  assert.equal(s.controls.aimSensitivity, 1);
  assert.equal(s.controls.wheel, 'power');
  assert.equal(s.controls.vibration, true);
  assert.equal(s.updatedAt, 0);
  assert.deepEqual(sanitizeSettings('basura'), sanitizeSettings(null));
});

test('cada cambio se guarda en el dispositivo, avisa y se sube a la cuenta', async () => {
  const storage = mem();
  const store = new SettingsStore(storage, { now: clock() });
  const seen = [], sent = [];
  store.subscribe((s) => seen.push(s.sound.master));
  store.onChange = (s) => { sent.push(s.controls.invertCameraX); };
  store.patch({ sound: { master: 40 } });
  store.patch({ controls: { invertCameraX: true } });
  await flush();
  assert.deepEqual(seen, [40, 40]);
  assert.deepEqual(sent, [false, true]);
  // otra instancia (otra pestaña, o al volver a abrir) lee lo mismo
  const again = new SettingsStore(storage).get();
  assert.equal(again.sound.master, 40);
  assert.equal(again.controls.invertCameraX, true);
  assert.ok(again.updatedAt > 0);
});

test('un fallo de red al subir no rompe el guardado local', async () => {
  const storage = mem();
  const store = new SettingsStore(storage, { now: clock() });
  store.onChange = () => Promise.reject(new Error('network'));
  store.patch({ sound: { muted: true } });
  await flush();
  assert.equal(new SettingsStore(storage).get().sound.muted, true);
});

test('migra el silencio y la calidad que se guardaban antes por separado', () => {
  const storage = mem({ 'gcb.muted.v2': '1', 'gcb.quality': 'low' });
  const s = new SettingsStore(storage, { device: 'mobile' }).get();
  assert.equal(s.sound.muted, true);
  assert.deepEqual(s.quality, { mobile: 'low', desktop: null });
});

test('al entrar gana lo más reciente: la cuenta si es más nueva', () => {
  const store = new SettingsStore(mem(), { now: clock(1000) });
  store.patch({ sound: { master: 30 } });
  const seen = [];
  store.subscribe((s) => seen.push(s.sound.master));
  store.hydrate({ sound: { master: 70 }, updatedAt: 999_999 }, 'u1');
  assert.equal(store.get().sound.master, 70);
  assert.deepEqual(seen, [70]);
});

test('al entrar gana lo más reciente: lo local se sube si la cuenta es más vieja o no tiene nada', async () => {
  const store = new SettingsStore(mem(), { now: clock(5000) });
  store.patch({ controls: { invertPower: true } });
  const sent = [];
  store.onChange = (s) => { sent.push(s); };
  store.hydrate({ controls: { invertPower: false }, updatedAt: 10 }, 'u1');
  assert.equal(store.get().controls.invertPower, true);
  store.hydrate(null, 'u1');
  await flush();
  assert.equal(sent.length, 2);
  assert.equal(sent[0].controls.invertPower, true);
});

test('un guardado que falló por red se reintenta en la siguiente entrada', async () => {
  const storage = mem();
  const store = new SettingsStore(storage, { now: clock(5000) });
  store.onChange = () => Promise.reject(new Error('offline'));
  store.patch({ sound: { ambient: 10 } });
  await flush();
  // la cuenta sigue con lo viejo; al volver a entrar se sube lo local, no se pisa
  const next = new SettingsStore(storage, { now: clock(9000) });
  const sent = [];
  next.onChange = (s) => { sent.push(s.sound.ambient); };
  next.hydrate({ sound: { ambient: 60 }, updatedAt: 100 }, 'u1');
  await flush();
  assert.equal(next.get().sound.ambient, 10);
  assert.deepEqual(sent, [10]);
});

test('si lo guardado en el dispositivo es de otra cuenta, manda la cuenta aunque sea más vieja', () => {
  const storage = mem();
  const a = new SettingsStore(storage, { now: clock(9000) });
  a.hydrate(null, 'u1');
  a.patch({ controls: { invertAim: true } });
  const b = new SettingsStore(storage, { now: clock(9500) });
  b.hydrate({ controls: { invertAim: false }, updatedAt: 5 }, 'u2');
  assert.equal(b.get().controls.invertAim, false);
  assert.equal(JSON.parse(storage.map.get(SETTINGS_KEY)).owner, 'u2');
});

test('reset deja una sección como venía', () => {
  const store = new SettingsStore(mem(), { now: clock() });
  store.patch({ controls: { invertAim: true, aimSensitivity: 2 }, sound: { master: 5 } });
  store.reset('controls');
  assert.deepEqual(store.get().controls, DEFAULT_SETTINGS.controls);
  assert.equal(store.get().sound.master, 5);
});

test('inputFactors: invertir cambia el signo y la sensibilidad multiplica', () => {
  assert.deepEqual(inputFactors(DEFAULT_SETTINGS.controls), { camX: 1, camY: 1, aim: 1, power: 1, wheelPower: true, vibration: true });
  const f = inputFactors({ invertCameraX: true, invertCameraY: true, invertAim: true, invertPower: true, cameraSensitivity: 1.5, aimSensitivity: 0.5, wheel: 'zoom', vibration: false });
  assert.deepEqual(f, { camX: -1.5, camY: -1, aim: -0.5, power: -1, wheelPower: false, vibration: false });
});

test('la calidad se guarda aparte por tipo de dispositivo y null vuelve a la automática', async () => {
  const { getQuality, setQuality, isAutoQuality, defaultQuality } = await import('../src/game/render/quality.js');
  const { deviceKind } = await import('../src/settings/settings.js');
  const here = deviceKind();
  const other = here === 'mobile' ? 'desktop' : 'mobile';
  const store = new SettingsStore(mem(), { now: clock() });
  assert.equal(isAutoQuality(store), true);
  assert.equal(getQuality(store), defaultQuality());
  setQuality('low', store);
  assert.equal(getQuality(store), 'low');
  assert.equal(store.get().quality[here], 'low');
  assert.equal(store.get().quality[other], null);
  setQuality('ultra', store); // no vale: no cambia nada
  assert.equal(getQuality(store), 'low');
  setQuality(null, store);
  assert.equal(isAutoQuality(store), true);
  assert.equal(getQuality(store), defaultQuality());
});

test('al entrar en un dispositivo nuevo queda guardado de quién son los ajustes', () => {
  const storage = mem();
  const a = new SettingsStore(storage, { now: clock() });
  a.hydrate(null, 'u1');
  assert.equal(JSON.parse(storage.map.get(SETTINGS_KEY)).owner, 'u1');
  // otra cuenta entra después: mandan sus ajustes aunque sean viejos
  const b = new SettingsStore(storage, { now: clock(9e12) });
  b.hydrate({ sound: { master: 20 }, updatedAt: 5 }, 'u2');
  assert.equal(b.get().sound.master, 20);
});

test('los ajustes de otra cuenta no se suben a una cuenta que aún no tiene ninguno', async () => {
  const storage = mem();
  const a = new SettingsStore(storage, { now: clock() });
  a.hydrate(null, 'u1');
  a.patch({ controls: { invertAim: true } });
  const b = new SettingsStore(storage, { now: clock() });
  const sent = [];
  b.onChange = (s) => { sent.push(s); };
  b.hydrate(null, 'u2');
  await flush();
  assert.deepEqual(sent, []);
  assert.equal(b.get().controls.invertAim, true); // en el dispositivo se siguen usando
});

test('con la misma hora en la cuenta y aquí no se cambia ni se sube nada', async () => {
  const store = new SettingsStore(mem(), { now: () => 1000 });
  store.patch({ sound: { master: 40 } });
  const sent = [], seen = [];
  store.onChange = (s) => { sent.push(s); };
  store.subscribe((s) => seen.push(s));
  store.hydrate({ sound: { master: 90 }, updatedAt: store.get().updatedAt }, 'u1');
  await flush();
  assert.equal(store.get().sound.master, 40);
  assert.deepEqual(sent, []);
  assert.deepEqual(seen, []);
});

test('lo migrado de la versión anterior se sube a una cuenta vacía y no pisa una que ya tiene ajustes', async () => {
  const legacy = () => mem({ 'gcb.muted.v2': '1' });
  const a = new SettingsStore(legacy(), { device: 'mobile' });
  const sent = [];
  a.onChange = (s) => { sent.push(s.sound.muted); };
  a.hydrate(null, 'u1');
  await flush();
  assert.deepEqual(sent, [true]);
  const b = new SettingsStore(legacy(), { device: 'mobile' });
  b.hydrate({ sound: { muted: false }, updatedAt: 2 }, 'u1');
  assert.equal(b.get().sound.muted, false);
  // ni una cuenta vacía ni nada guardado: no hay nada que subir
  const c = new SettingsStore(mem());
  const none = [];
  c.onChange = (s) => { none.push(s); };
  c.hydrate({}, 'u1');
  await flush();
  assert.deepEqual(none, []);
});

test('límites y redondeo de los valores', () => {
  const s = sanitizeSettings({
    sound: { master: -5, ambient: 250 },
    controls: { cameraSensitivity: 0.01, aimSensitivity: 1.234 },
  });
  assert.equal(s.sound.master, 0);
  assert.equal(s.sound.ambient, 100);
  assert.equal(s.controls.cameraSensitivity, 0.4);
  assert.equal(s.controls.aimSensitivity, 1.23);
  assert.equal(sanitizeSettings({ sound: { master: 49.6 } }).sound.master, 50);
});

test('cada cambio lleva una hora más nueva que el anterior aunque el reloj no avance o vaya atrás', () => {
  const store = new SettingsStore(mem(), { now: () => 1000 });
  store.patch({ sound: { master: 1 } });
  assert.equal(store.get().updatedAt, 1000);
  store.patch({ sound: { master: 2 } });
  assert.equal(store.get().updatedAt, 1001);
  store.hydrate({ sound: { master: 3 }, updatedAt: 5e12 }, 'u1');
  store.patch({ sound: { master: 4 } });
  assert.ok(store.get().updatedAt > 5e12);
});

test('restablecer: la calidad solo de este dispositivo, sonido completo y lo desconocido no hace nada', async () => {
  const store = new SettingsStore(mem(), { now: clock(), device: 'mobile' });
  store.patch({ quality: { mobile: 'low', desktop: 'high' }, sound: { master: 10, muted: true } });
  store.reset('quality');
  assert.deepEqual(store.get().quality, { mobile: null, desktop: 'high' });
  store.reset('sound');
  assert.deepEqual(store.get().sound, DEFAULT_SETTINGS.sound);
  const before = store.get().updatedAt;
  const sent = [];
  store.onChange = (s) => { sent.push(s); };
  store.reset('bogus');
  store.reset('updatedAt');
  store.reset('toString');
  await flush();
  assert.equal(store.get().updatedAt, before);
  assert.deepEqual(sent, []);
});

test('get() devuelve una copia; peek() lo vivo', () => {
  const store = new SettingsStore(mem(), { now: clock() });
  const copy = store.get();
  copy.sound.master = 1;
  assert.equal(store.get().sound.master, DEFAULT_SETTINGS.sound.master);
  assert.equal(store.peek(), store.peek());
  store.patch({ sound: { master: 7 } });
  assert.equal(store.peek().sound.master, 7);
});

test('deviceKind dice móvil en pantallas táctiles', async () => {
  const prev = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: q === '(pointer: coarse)' });
  try {
    const mod = await import(`../src/settings/settings.js?touch=${Date.now()}`);
    assert.equal(mod.deviceKind(), 'mobile');
  } finally {
    if (prev) globalThis.matchMedia = prev;
    else delete globalThis.matchMedia;
  }
});
