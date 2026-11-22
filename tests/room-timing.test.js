import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GO_MS, LAUNCH_WAIT_MS, LEAVE_MS, roomDelays } from '../src/game/roomTiming.js';
import { ROOM_MIN_MS } from '../src/game/loadingFlags.js';

const total = (d, elapsed) => elapsed + d.seatWaits.reduce((a, b) => a + b, 0) + d.launchWaitMs + GO_MS + LEAVE_MS;
const seeded = (v) => () => v;

test('interruptor de la sala: 2500 ms', () => assert.equal(ROOM_MIN_MS, 2500));

test('la suma desde el clic nunca baja de 2500 ms', () => {
  for (const players of [1, 2, 4, 8, 12]) {
    for (const elapsed of [0, 100, 600, 1500, 2400, 5000]) {
      for (const v of [0, 0.5, 0.999]) {
        const d = roomDelays({ players, rnd: seeded(v), elapsedMs: elapsed, minMs: 2500 });
        assert.ok(total(d, elapsed) >= 2500 - 1e-6, `${players} ${elapsed} ${v}`);
      }
    }
  }
});

test('más jugadores o más tiempo gastado no alarga de más', () => {
  const t = (players, elapsed) => total(roomDelays({ players, rnd: seeded(0.5), elapsedMs: elapsed, minMs: 2500 }), elapsed);
  assert.ok(t(8, 0) <= 2500 + 8 * 60); // solo por el suelo por asiento
  assert.ok(t(8, 800) <= t(8, 0) + 1e-6 || t(8, 800) <= 2500 + 8 * 60);
  const orig = roomDelays({ players: 8, rnd: seeded(0.5), minMs: 0 });
  const mine = roomDelays({ players: 8, rnd: seeded(0.5), elapsedMs: 0, minMs: 2500 });
  assert.ok(mine.seatWaits.reduce((a, b) => a + b) < orig.seatWaits.reduce((a, b) => a + b));
});

test('determinista con rnd fijo', () => {
  const a = roomDelays({ players: 8, rnd: seeded(0.3), elapsedMs: 120 });
  const b = roomDelays({ players: 8, rnd: seeded(0.3), elapsedMs: 120 });
  assert.deepEqual(a, b);
});

test('minMs = 0: tiempos originales y mismo uso de rnd', () => {
  let calls = 0;
  const d = roomDelays({ players: 8, rnd: () => (calls++, 0.5), minMs: 0 });
  assert.equal(calls, 7);
  assert.equal(d.seatWaits[0], 200);
  assert.equal(d.seatWaits[1], 250 + 0.5 * 350);
  assert.equal(d.launchWaitMs, LAUNCH_WAIT_MS);
});

test('main.js usa roomDelays y el helper ?room=old', () => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(src, /roomDelays\(/);
  assert.match(src, /'room'\) === 'old'/);
});
