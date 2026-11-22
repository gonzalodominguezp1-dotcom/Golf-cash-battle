import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICON_NAMES, icon, iconUrl, tierIcon, avatarIcon } from '../src/ui/icons.js';
import { TIERS } from '../src/progress/skins.js';
import { AVATAR_ICONS } from '../src/progress/avatar.js';

test('todos los iconos devuelven un <svg>', () => {
  assert.ok(ICON_NAMES.length >= 40);
  for (const n of ICON_NAMES) assert.ok(icon(n).startsWith('<svg'), n);
  assert.equal(icon('no-existe'), '');
});

test('cada llamada usa ids de clipPath distintos', () => {
  const ids = (s) => [...s.matchAll(/clipPath id="([^"]+)"/g)].map((m) => m[1]);
  for (const n of ICON_NAMES) {
    const a = ids(icon(n)), b = ids(icon(n));
    if (a.length) assert.notDeepEqual(a, b, n);
  }
  assert.notEqual(ids(icon('coin'))[0], ids(icon('coin'))[0]);
});

test('tierIcon y avatarIcon cubren todas las rarezas y avatares', () => {
  for (const t of Object.keys(TIERS)) assert.ok(tierIcon(t).startsWith('<svg'), t);
  for (const a of AVATAR_ICONS) assert.ok(avatarIcon(a.id).startsWith('<svg'), a.id);
});

test('iconUrl es un data URL de svg', () => {
  assert.ok(iconUrl('check').startsWith('data:image/svg+xml'));
  assert.ok(iconUrl('dot', { tone: 'gray' }).startsWith('data:image/svg+xml'));
});
