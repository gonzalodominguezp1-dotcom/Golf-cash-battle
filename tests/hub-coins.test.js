// Cápsula de saldo del hub (monedas · importe): reglas de CSS que dan el padding equilibrado y la ausencia de :hover.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HUB_CSS = readFileSync(new URL('../src/screens/hub.css', import.meta.url), 'utf8');
const JS = readFileSync(new URL('../src/screens/hub.js', import.meta.url), 'utf8');

// Cuerpo de la primera regla cuyo selector empieza por `sel {` (la base, antes de las media queries).
const rule = (sel) => {
  const i = HUB_CSS.indexOf(`${sel} {`);
  return i < 0 ? '' : HUB_CSS.slice(i, HUB_CSS.indexOf('}', i));
};
// Todas las reglas que tocan la cápsula, incluidas las de media query y de :active.
const walletRules = () => [...HUB_CSS.matchAll(/([^{}]*\.hub-wallet[^{}]*)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));

const sides = (body) => {
  const m = body.match(/padding:\s*([^;]+);/);
  if (!m) return null;
  const v = m[1].trim().split(/\s+/);
  // 1 valor: todo igual; 2 valores: vertical horizontal; 3-4 valores: se leen los laterales (2.º y 4.º, o 2.º si son 3)
  if (v.length === 1) return [v[0], v[0]];
  if (v.length === 2) return [v[1], v[1]];
  if (v.length === 3) return [v[1], v[1]];
  return [v[1], v[3]];
};

test('la cápsula de saldo tiene padding horizontal simétrico en la regla base', () => {
  const r = rule('.hub-wallet');
  assert.ok(r, 'existe la regla .hub-wallet');
  const [l, rr] = sides(r);
  assert.equal(l, rr, `padding izquierdo (${l}) y derecho (${rr}) deben ser iguales`);
});

test('ninguna variante de la cápsula de saldo deja el padding asimétrico', () => {
  for (const { sel, body } of walletRules()) {
    if (!/padding:/.test(body) || /^\.hub-wallet-/.test(sel)) continue;
    const s = sides(body);
    assert.equal(s[0], s[1], `${sel}: padding asimétrico`);
  }
});

test('la cápsula de saldo no usa :hover (solo :active y :focus-visible)', () => {
  for (const { sel } of walletRules()) assert.doesNotMatch(sel, /:hover/, `${sel} no debe usar :hover`);
  assert.match(HUB_CSS, /\.hub-wallet:active\s*\{/);
  assert.match(HUB_CSS, /\.hub-wallet:focus-visible\s*\{/);
});

test('la cápsula mide al menos 44 px de alto táctil y centra su contenido en vertical', () => {
  const r = rule('.hub-wallet');
  assert.match(r, /min-height:\s*44px/);
  assert.match(r, /align-items:\s*center/);
});

test('el número va alineado a la derecha con cifras tabulares', () => {
  const n = rule('.hub-wallet-n');
  assert.match(n, /text-align:\s*right/);
  assert.match(n, /font-variant-numeric:\s*tabular-nums/);
});

test('el icono de la cápsula tiene separación con el número', () => {
  assert.match(rule('.hub-wallet'), /gap:\s*\d+px/);
});

test('reduced-motion anula la pulsación de la cápsula', () => {
  const block = HUB_CSS.slice(HUB_CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(block, /\.hub-wallet:active\s*\{\s*transform:\s*none/);
});

test('hub.js sigue pintando el saldo en refs.balance con fmtCoins', () => {
  assert.match(JS, /refs\.balance\.textContent = fmtCoins\(n\)/);
  assert.match(JS, /balance: root\.querySelector\('\[data-hub-balance="1"\]'\)/);
});
