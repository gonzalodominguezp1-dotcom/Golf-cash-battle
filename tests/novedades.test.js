import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versionsHtml } from '../src/screens/novedades.js';

test('versionsHtml pinta una sección por versión, con sus puntos', () => {
  const html = versionsHtml([
    { version: '0.2.0', items: ['whatsNew.item1'] },
    { version: '0.1.0', items: ['whatsNew.item2', 'whatsNew.item3'] },
  ]);
  assert.match(html, /data-novedades-ver="0\.2\.0"/);
  assert.match(html, /data-novedades-ver="0\.1\.0"/);
  assert.equal((html.match(/<li>/g) ?? []).length, 3);
  assert.ok(html.indexOf('0.2.0') < html.indexOf('0.1.0'), 'la más reciente va primero');
});

test('versionsHtml omite versiones sin puntos y avisa si no queda ninguna', () => {
  assert.match(versionsHtml([{ version: '0.1.0', items: [] }]), /novedades-empty/);
  assert.match(versionsHtml([]), /novedades-empty/);
  assert.doesNotMatch(versionsHtml([{ version: '9.9.9', items: [] }, { version: '0.1.0', items: ['whatsNew.item1'] }]), /9\.9\.9/);
});
