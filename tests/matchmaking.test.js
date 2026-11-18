import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URGENT_SECS, bannerState, countdownState, hypeLines, nextTickDelay, ringTiming, seatBlip, tierFoilClass } from '../src/ui/matchmakingRules.js';

test('la cuenta atrás deduce la duración real: no asume 15 s', () => {
  let s = countdownState(10000, 0);
  assert.equal(s.secs, 10);
  assert.equal(s.total, 10000);
  assert.equal(s.frac, 1);
  s = countdownState(5000, s.total);
  assert.equal(s.total, 10000);
  assert.equal(s.frac, 0.5);
});

test('si el servidor retrasa el arranque, el total crece y el anillo no se sale', () => {
  const s = countdownState(12000, 10000);
  assert.equal(s.total, 12000);
  assert.ok(s.frac <= 1);
});

test('redondea hacia arriba, nunca negativo, y marca los últimos segundos', () => {
  assert.equal(countdownState(2100, 10000).secs, 3);
  assert.equal(countdownState(2100, 10000).urgent, true);
  assert.equal(countdownState(URGENT_SECS * 1000 + 1, 10000).urgent, false);
  const end = countdownState(-500, 10000);
  assert.equal(end.secs, 0);
  assert.equal(end.frac, 0);
  assert.equal(end.urgent, false);
  assert.ok(countdownState(1000, 10000).beat < countdownState(9000, 10000).beat);
});

test('los puntos del radar caen dentro del círculo y no se pisan', () => {
  const pts = Array.from({ length: 8 }, (_, i) => seatBlip(i, 8));
  for (const { x, y } of pts) assert.ok(Math.hypot(x - 50, y - 50) <= 50);
  assert.equal(new Set(pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)).size, 8);
});

test('hay frases para cada sala y sin emojis', () => {
  for (const mode of ['live', 'local', 'practice', 'otra']) {
    const lines = hypeLines(mode);
    assert.ok(lines.length >= 3);
    for (const l of lines) assert.doesNotMatch(l, /\p{Extended_Pictographic}/u);
  }
});

test('el número cambia una vez por segundo: el próximo tic cae justo tras el cambio de segundo', () => {
  assert.equal(nextTickDelay(5000), 1004);
  assert.equal(nextTickDelay(4300), 304);
  assert.equal(nextTickDelay(0), 0);
  assert.equal(nextTickDelay(-20), 0);
  assert.equal(Math.ceil((4300 - nextTickDelay(4300)) / 1000), 4);
});

test('el anillo es una animación con la duración total y retraso negativo (lo ya transcurrido)', () => {
  assert.deepEqual(ringTiming(10000, 10000), { duration: 10000, delay: -0 });
  assert.deepEqual(ringTiming(4000, 10000), { duration: 10000, delay: -6000 });
  // si aún no se conoce el total, no se sale del anillo
  assert.deepEqual(ringTiming(8000, 0), { duration: 8000, delay: -0 });
  assert.deepEqual(ringTiming(-5, 9000), { duration: 9000, delay: -9000 });
});

test('Práctica toma la lámina de la rareza verde de las skins; las mesas de pago usan la suya', () => {
  assert.equal(tierFoilClass('practice'), 'rarity-uncommon');
  for (const id of ['bronze', 'silver', 'gold', 'diamond', 'emerald']) assert.equal(tierFoilClass(id), '');
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.rarity-uncommon \{\s*--foil:/);
  for (const id of ['bronze', 'silver', 'gold', 'diamond', 'emerald']) assert.match(css, new RegExp(`\\.tier--${id} \\{\\s*--foil:`));
});

test('el aviso flotante: solo mientras se busca y la sala no está a la vista', () => {
  const base = { ended: false, visible: false, seen: true, phase: 'search', seats: 8, filled: () => 3, countdown: () => ({ secs: 7, urgent: false }) };
  assert.equal(bannerState(null).visible, false);
  assert.deepEqual(bannerState(base), { visible: true, launching: false, secs: 7, urgent: false, filled: 3, seats: 8, canCancel: true });
  assert.equal(bannerState({ ...base, visible: true }).visible, false);
  assert.equal(bannerState({ ...base, seen: false }).visible, false, 'no parpadea al abrir la sala la primera vez');
  assert.equal(bannerState({ ...base, ended: true }).visible, false);
  assert.equal(bannerState({ ...base, phase: 'go' }).visible, false);
  const l = bannerState({ ...base, phase: 'launching' });
  assert.equal(l.launching, true);
  assert.equal(l.canCancel, false);
  assert.equal(bannerState({ ...base, countdown: () => null }).secs, null);
});

test('la sala solo anima transform y opacidad (sin backdrop-filter, filter, anchos ni background-position animados)', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('/* ---------- matchmaking (src/ui/matchmakingView.js)'), css.indexOf('/* ---------- juego ---------- */')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(block, /backdrop-filter/);
  for (const kf of block.matchAll(/@keyframes [\w-]+ \{([\s\S]*?\})\s*\}/g)) {
    const props = [...kf[1].matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]);
    for (const p of props) assert.ok(['transform', 'opacity'].includes(p), `keyframe anima ${p}: ${kf[0].slice(0, 60)}`);
  }
  assert.doesNotMatch(block, /transition:[^;]*\b(width|filter|box-shadow|stroke-dashoffset)\b/);
  const view = readFileSync(new URL('../src/ui/matchmakingView.js', import.meta.url), 'utf8');
  assert.doesNotMatch(view, /offsetWidth|setInterval/, 'sin reflow forzado ni intervalos por frame');
});

test('la sala escapa los nombres y el cliente no fija la espera en 15 s', () => {
  const view = readFileSync(new URL('../src/ui/matchmakingView.js', import.meta.url), 'utf8');
  assert.match(view, /mm-seat-name">\$\{esc\(p\.name\)\}/);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const room = main.slice(main.indexOf('function showLiveRoom'), main.indexOf('async function beginLive'));
  assert.doesNotMatch(room, /\b15\b/);
});
