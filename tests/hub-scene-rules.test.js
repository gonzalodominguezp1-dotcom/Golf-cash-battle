import test from 'node:test';
import assert from 'node:assert/strict';
import { orbitAngle, ambientPlan, scenePreset, shouldRender } from '../src/game/render/hubSceneRules.js';

const TAU = Math.PI * 2;

test('orbitAngle: da una vuelta (2π) por periodo y es continuo', () => {
  assert.equal(orbitAngle(0), 0);
  assert.ok(Math.abs(orbitAngle(90) - TAU) < 1e-9);
  assert.ok(Math.abs(orbitAngle(45, 90) - Math.PI) < 1e-9);
  assert.ok(Math.abs(orbitAngle(10, 20) - Math.PI) < 1e-9);
  let prev = orbitAngle(0);
  for (let t = 0.1; t < 200; t += 0.1) {
    const a = orbitAngle(t);
    assert.ok(a > prev && a - prev < 0.1, `salto en t=${t}`);
    prev = a;
  }
});

test('orbitAngle: periodo inválido o tiempo negativo no producen NaN', () => {
  assert.equal(orbitAngle(5, 0), 0);
  assert.equal(orbitAngle(-3), 0);
  assert.equal(orbitAngle(NaN), 0);
});

const counting = (seq) => {
  const f = () => seq[Math.min(f.calls++, seq.length - 1)];
  f.calls = 0;
  return f;
};

test('ambientPlan: con reduced devuelve null y no consume el rng', () => {
  const rng = counting([0.5]);
  assert.equal(ambientPlan(rng, 'high', true), null);
  assert.equal(rng.calls, 0);
});

test('ambientPlan: reduced false o undefined sí planifica', () => {
  assert.notEqual(ambientPlan(() => 0.5, 'high', false), null);
  assert.notEqual(ambientPlan(() => 0.5, 'high', undefined), null);
});

test('ambientPlan: cotas exactas de la espera (minGapMs .. 2*minGapMs)', () => {
  for (const q of ['low', 'medium', 'high']) {
    const gap = scenePreset(q).minGapMs;
    assert.equal(ambientPlan(() => 0, q, false).nextInMs, gap);
    const hi = ambientPlan(() => 0.999999, q, false).nextInMs;
    assert.ok(hi <= 2 * gap && hi >= 2 * gap - 1, `${q}: ${hi}`);
    for (const r of [0.1, 0.5, 0.9]) {
      const n = ambientPlan(() => r, q, false).nextInMs;
      assert.ok(n >= gap && n <= 2 * gap);
    }
  }
});

test('ambientPlan: orden de consumo del rng, primero tipo y luego espera', () => {
  const rng = counting([0.9, 0.0]);
  const p = ambientPlan(rng, 'medium', false);
  assert.equal(p.kind, 'ballIn');
  assert.equal(p.nextInMs, scenePreset('medium').minGapMs);
  assert.equal(rng.calls, 2);
  const rng2 = counting([0.0, 0.999999]);
  const p2 = ambientPlan(rng2, 'medium', false);
  assert.equal(p2.kind, 'particles');
  assert.ok(p2.nextInMs > scenePreset('medium').minGapMs);
  assert.equal(rng2.calls, 2);
});

test('ambientPlan: la misma secuencia da el mismo resultado', () => {
  assert.deepEqual(ambientPlan(counting([0.37, 0.61]), 'low', false), ambientPlan(counting([0.37, 0.61]), 'low', false));
  assert.notDeepEqual(ambientPlan(counting([0.1, 0.1]), 'low', false), ambientPlan(counting([0.9, 0.9]), 'low', false));
});

test('scenePreset: low < medium < high (estricto) en resolución, partículas y árboles', () => {
  const l = scenePreset('low'), m = scenePreset('medium'), h = scenePreset('high');
  assert.ok(l.pixelRatio < h.pixelRatio);
  assert.ok(l.pixelRatio <= m.pixelRatio && m.pixelRatio <= h.pixelRatio);
  assert.ok(l.particles < m.particles && m.particles < h.particles);
  assert.ok(l.trees < m.trees && m.trees < h.trees);
  assert.ok(l.minGapMs > h.minGapMs);
  assert.ok(l.minGapMs >= m.minGapMs && m.minGapMs >= h.minGapMs);
});

test('scenePreset: nivel desconocido cae a medium', () => {
  assert.deepEqual(scenePreset('x'), scenePreset('medium'));
});

test('shouldRender: false si tapada u oculta', () => {
  assert.equal(shouldRender({ covered: false, hidden: false }), true);
  assert.equal(shouldRender({ covered: true, hidden: false }), false);
  assert.equal(shouldRender({ covered: false, hidden: true }), false);
  assert.equal(shouldRender({ covered: true, hidden: true }), false);
  assert.equal(shouldRender({}), true);
  assert.equal(shouldRender(), true);
  assert.equal(shouldRender(null), true);
});

test('scenePreset: sombras y resolución mínima exactas por calidad', () => {
  const l = scenePreset('low'), m = scenePreset('medium'), h = scenePreset('high');
  assert.equal(l.shadows, false);
  assert.equal(m.shadows, true);
  assert.equal(h.shadows, true);
  assert.equal(l.minPixelRatio, 0.65);
  assert.equal(m.minPixelRatio, 0.8);
  assert.equal(h.minPixelRatio, 1);
  assert.ok(l.minPixelRatio < m.minPixelRatio && m.minPixelRatio < h.minPixelRatio);
  for (const p of [l, m, h]) assert.ok(p.minPixelRatio <= p.pixelRatio);
});

import { ambientSpec, ballRollState } from '../src/game/render/hubSceneRules.js';

test('ambientSpec: en calidad baja se reduce cada aparición respecto a high', () => {
  const l = ambientSpec('low'), m = ambientSpec('medium'), h = ambientSpec('high');
  assert.ok(l.sparks < m.sparks && m.sparks < h.sparks);
  assert.ok(l.sparks > 0);
  assert.ok(l.butterflyS <= h.butterflyS && l.ballS <= h.ballS);
  assert.deepEqual(ambientSpec('x'), ambientSpec('medium'));
});

test('ballRollState: rueda hacia la copa, frena y se hunde al final', () => {
  const a = ballRollState(0), b = ballRollState(0.5), c = ballRollState(1);
  assert.equal(a.remaining, 1);
  assert.equal(c.remaining, 0);
  assert.ok(b.remaining > 0 && b.remaining < 1);
  assert.equal(a.sink, 0);
  assert.equal(c.sink, 1);
  assert.equal(ballRollState(0.5).sink, 0);
  // monótona y acotada
  let prev = 1;
  for (let u = 0; u <= 1.0001; u += 0.05) {
    const s = ballRollState(u);
    assert.ok(s.remaining <= prev + 1e-9 && s.remaining >= 0 && s.sink >= 0 && s.sink <= 1);
    prev = s.remaining;
  }
  assert.deepEqual(ballRollState(-3), a);
  assert.deepEqual(ballRollState(9), c);
  assert.deepEqual(ballRollState(NaN), a);
});

import { nextAmbientKind, clampDt, AMBIENT_MAX_DT, AMBIENT_KINDS } from '../src/game/render/hubSceneRules.js';

test('nextAmbientKind: los tres tipos salen antes de repetir y la ronda se reinicia', () => {
  let seen = new Set();
  const out = [];
  for (const asked of ['ballIn', 'ballIn', 'ballIn', 'particles', 'particles', 'particles']) {
    const r = nextAmbientKind(seen, asked);
    out.push(r.kind);
    seen = r.seen;
  }
  assert.equal(new Set(out.slice(0, 3)).size, 3);
  assert.equal(new Set(out.slice(3)).size, 3);
  assert.equal(out[0], 'ballIn'); // si el pedido no se ha visto, se respeta
  assert.deepEqual([...seen], []);
});

test('nextAmbientKind: no muta el conjunto de entrada y marca el tipo como visto', () => {
  const seen = new Set(['particles']);
  const r = nextAmbientKind(seen, 'butterfly');
  assert.deepEqual([...seen], ['particles']);
  assert.equal(r.kind, 'butterfly');
  assert.deepEqual([...r.seen].sort(), ['butterfly', 'particles']);
  const r2 = nextAmbientKind(seen, 'particles'); // repetido: cambia a uno no visto
  assert.notEqual(r2.kind, 'particles');
  assert.ok(AMBIENT_KINDS.includes(r2.kind));
});

test('clampDt: descarta <=0, NaN e infinito; acota a AMBIENT_MAX_DT', () => {
  assert.equal(clampDt(0.016), 0.016);
  assert.equal(clampDt(5), AMBIENT_MAX_DT);
  assert.equal(clampDt(AMBIENT_MAX_DT), AMBIENT_MAX_DT);
  for (const bad of [0, -1, NaN, undefined, null, Infinity, '0.5']) assert.equal(clampDt(bad), 0, String(bad));
});
