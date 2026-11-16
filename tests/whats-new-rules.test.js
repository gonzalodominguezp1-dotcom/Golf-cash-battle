import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShow, notesFor, readSeen, writeSeen, WHATS_NEW_KEY } from '../src/ui/whatsNewRules.js';
import { RELEASE_NOTES, CURRENT_VERSION } from '../src/ui/releaseNotes.js';
import { t } from '../src/screens/texts/index.js';
import '../src/screens/texts/whatsNew.js';

const notes = [{ version: '2.0.0', items: ['whatsNew.item1'] }, { version: '1.0.0', items: [] }];
const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
};
const brokenStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };

test('se muestra si hay notas para la versión actual y no está marcada como vista', () => {
  assert.equal(shouldShow({ seen: null, current: '2.0.0', notes }), true);
  assert.equal(shouldShow({ seen: '1.0.0', current: '2.0.0', notes }), true);
});

test('no se muestra si la versión ya está marcada como vista', () => {
  assert.equal(shouldShow({ seen: '2.0.0', current: '2.0.0', notes }), false);
});

test('no se muestra sin notas para la versión actual o con lista vacía', () => {
  assert.equal(shouldShow({ seen: null, current: '1.0.0', notes }), false);
  assert.equal(shouldShow({ seen: null, current: '3.0.0', notes }), false);
  assert.equal(notesFor(notes, '1.0.0'), null);
});

test('sin almacenamiento, solo una vez por sesión', () => {
  assert.equal(shouldShow({ seen: null, current: '2.0.0', notes, storageOk: false, shownNow: false }), true);
  assert.equal(shouldShow({ seen: null, current: '2.0.0', notes, storageOk: false, shownNow: true }), false);
});

test('leer y guardar la versión vista usa la clave propia y no lanza si falla', () => {
  const s = memStorage();
  assert.equal(writeSeen(s, '2.0.0'), true);
  assert.equal(s._m.get(WHATS_NEW_KEY), '2.0.0');
  assert.deepEqual(readSeen(s), { seen: '2.0.0', ok: true });
  assert.deepEqual(readSeen(brokenStorage), { seen: null, ok: false });
  assert.equal(writeSeen(brokenStorage, '2.0.0'), false);
});

test('la versión actual tiene entre 3 y 5 puntos y cada punto tiene texto', () => {
  const cur = RELEASE_NOTES.find((n) => n.version === CURRENT_VERSION);
  assert.ok(cur, 'falta la versión actual en releaseNotes');
  assert.ok(cur.items.length >= 3 && cur.items.length <= 5);
  for (const k of cur.items) {
    const txt = t(k);
    assert.ok(txt.length > 10 && txt.length < 160);
    assert.doesNotMatch(txt, /desafío|liga/i);
  }
});
