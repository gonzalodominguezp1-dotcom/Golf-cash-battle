import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../public/site.webmanifest', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('el manifest tiene las claves de instalación', () => {
  for (const k of ['id', 'scope', 'start_url', 'name', 'short_name', 'display', 'orientation', 'theme_color', 'categories']) {
    assert.ok(manifest[k] && manifest[k].length !== 0, k);
  }
  assert.ok(Array.isArray(manifest.categories));
});

test('theme_color coincide con la meta theme-color de index.html', () => {
  const m = html.match(/<meta\s+name="theme-color"\s+content="([^"]+)"/i);
  assert.ok(m);
  assert.equal(manifest.theme_color.toLowerCase(), m[1].toLowerCase());
});

test('hay un icono maskable SVG que existe y los PNG normales siguen', () => {
  const mk = manifest.icons.find((i) => String(i.purpose).includes('maskable'));
  assert.ok(mk);
  assert.equal(mk.type, 'image/svg+xml');
  assert.equal(mk.sizes, 'any');
  assert.ok(existsSync(new URL('../public' + mk.src, import.meta.url)));
  assert.ok(manifest.icons.some((i) => i.sizes === '192x192'));
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512'));
});
