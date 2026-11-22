import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(here, '..', 'vercel.json'), 'utf8'));
const rules = config.headers ?? [];

const CSP_KEY = 'Content-Security-Policy';
const IMMUTABLE_VALUE = 'public, max-age=31536000, immutable';

// Convierte un "source" de Vercel (solo se usa (.*) como comodín) en regex anclada.
const sourceToRegex = (source) => {
  const escaped = source
    .split('(.*)')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('(.*)');
  return new RegExp(`^${escaped}$`);
};

const headersOf = (rule) => rule.headers ?? [];

test('existe una regla /assets/(.*) con Cache-Control immutable', () => {
  const rule = rules.find((r) => r.source === '/assets/(.*)');
  assert.ok(rule, 'falta la regla /assets/(.*)');
  const cache = headersOf(rule).find((h) => h.key === 'Cache-Control');
  assert.ok(cache, 'la regla /assets/(.*) no define Cache-Control');
  assert.equal(cache.value, IMMUTABLE_VALUE);
});

test('la regla CSP global sigue intacta', () => {
  const rule = rules.find((r) => r.source === '/(.*)');
  assert.ok(rule, 'falta la regla global /(.*)');
  const csp = headersOf(rule).find((h) => h.key === CSP_KEY);
  assert.ok(csp, 'falta Content-Security-Policy en la regla global');
  assert.ok(csp.value.startsWith("default-src 'self'; script-src 'self';"));
  assert.ok(csp.value.includes("frame-ancestors 'none'"));
  assert.ok(csp.value.includes('https://oyawgvqbmvtmlnyqwgdf.supabase.co'));
});

test('ninguna regla immutable cubre /, index.html, admin.html, version.json ni rutas no hasheadas', () => {
  const immutableSources = rules
    .filter((r) => headersOf(r).some((h) => h.key === 'Cache-Control' && h.value.includes('immutable')))
    .map((r) => r.source);

  assert.deepEqual(immutableSources, ['/assets/(.*)']);

  const protectedPaths = ['/', '/index.html', '/admin.html', '/version.json', '/splash/logo.png', '/hub/index.html', '/skins/skin.json'];
  for (const path of protectedPaths) {
    for (const source of immutableSources) {
      assert.equal(sourceToRegex(source).test(path), false, `${source} no debe cubrir ${path}`);
    }
  }
});

test('la regla /assets/(.*) cubre rutas de chunks con hash', () => {
  const regex = sourceToRegex('/assets/(.*)');
  assert.equal(regex.test('/assets/index-AbC123.js'), true);
  assert.equal(regex.test('/assets/index-AbC123.css'), true);
});
