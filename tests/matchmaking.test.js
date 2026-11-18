import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URGENT_SECS, countdownState, hypeLines, seatBlip } from '../src/ui/matchmakingRules.js';

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

test('la sala escapa los nombres y el cliente no fija la espera en 15 s', () => {
  const view = readFileSync(new URL('../src/ui/matchmakingView.js', import.meta.url), 'utf8');
  assert.match(view, /mm-seat-name">\$\{esc\(p\.name\)\}/);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const room = main.slice(main.indexOf('function showLiveRoom'), main.indexOf('async function beginLive'));
  assert.doesNotMatch(room, /\b15\b/);
});
