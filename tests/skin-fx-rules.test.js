import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SKINS } from '../src/progress/skins.js';
import {
  REDUCED_SPEED, STILL_TIME, burstCount, calmList, continuousOpen, echoRing, hitList, particleLimit, reducedCount, reducedMotion, ribbonNoise, ribbonWave, setReducedMotionForTests, sinkBurstAllowed, sinkDecalAllowed, trailRate, withoutCells,
} from '../src/game/render/skins/fxRules.js';
import { SKIN_SIG } from '../src/game/render/skins/skinFx.js';

test('E1: sin maxParticles el limite es el del nivel (skins actuales intactas)', () => {
  for (const [name, n] of [['low', 40], ['medium', 120], ['high', 300]]) {
    assert.equal(particleLimit(n, name, undefined), n);
    assert.ok(continuousOpen(n, n, undefined));
  }
  assert.equal(trailRate(undefined, 6), 22);
});

test('E1: maxParticles acota y en baja se reduce a la mitad hacia arriba', () => {
  assert.equal(particleLimit(300, 'high', 20), 20);
  assert.equal(particleLimit(120, 'medium', 20), 20);
  assert.equal(particleLimit(40, 'low', 20), 10);
  assert.equal(particleLimit(40, 'low', 15), 8);
  assert.equal(particleLimit(10, 'high', 20), 10); // nunca sube el del nivel
});

test('E1: los continuos solo ocupan la mitad del tope', () => {
  assert.equal(continuousOpen(9, 20, 20), true);
  assert.equal(continuousOpen(10, 20, 20), false);
  assert.equal(continuousOpen(0, 10, 20), true);
});

test('E1: trailRate propio o por defecto 10 + 2*speed', () => {
  assert.equal(trailRate(6, 12), 6);
  assert.equal(trailRate(0, 12), 34);
});

test('E2: bandera, rafagas a la mitad y hora fija', () => {
  setReducedMotionForTests(true);
  assert.equal(reducedMotion(), true);
  setReducedMotionForTests(false);
  assert.equal(reducedMotion(), false);
  setReducedMotionForTests(null);
  assert.equal(typeof reducedMotion(), 'boolean'); // sin matchMedia en node: false
  assert.equal(reducedCount(12), 6);
  assert.equal(reducedCount(1), 1);
  assert.equal(reducedCount(3), 2);
  assert.equal(REDUCED_SPEED, 0.6);
  assert.equal(STILL_TIME, 1.2);
});

test('el tiempo fijo coincide con el de las miniaturas', () => {
  assert.match(readFileSync(new URL('../src/ui/skinThumbRender.js', import.meta.url), 'utf8'), /handle\.update\(1\.2,/);
});

test('E3: event_horizon usa attractSink y SkinFX ya no lo compara por id', () => {
  const src = readFileSync(new URL('../src/game/render/skins/skinFx.js', import.meta.url), 'utf8');
  assert.match(src, /attractSink: true/);
  assert.doesNotMatch(src, /skin\.id === 'event_horizon'\s*\?|skin\.id === 'event_horizon'\) \{\s*this\.particles/);
  for (const k of ['wallRing', 'rollRing', 'sinkBurst']) assert.ok(src.includes(`sig.${k}`) || src.includes(`this.sig.${k}`), k);
});

test('las skins anteriores a la colección nueva no definen los campos nuevos', () => {
  const NUEVAS = ['antimatter_void', 'tormenta_voltaica', 'anima_errante', 'cronometro_laton', 'abyssal_tide'];
  for (const s of SKINS.filter((x) => !NUEVAS.includes(x.id))) {
    assert.equal(s.fx.maxParticles, undefined, s.id);
    assert.equal(s.fx.trailRate, undefined, s.id);
  }
});

test('E2: golpe sin soft (tormenta) ni glyph (cronometro) solo con la bandera', () => {
  const src = readFileSync(new URL('../src/game/render/skins/skinFx.js', import.meta.url), 'utf8');
  const spec = (c) => ({ cell: c });
  const full = [spec('spark'), spec('soft'), spec('glyph'), spec('coin')];
  assert.deepEqual(withoutCells(full, ['soft']).map((s) => s.cell), ['spark', 'glyph', 'coin']);
  assert.deepEqual(withoutCells(full, ['glyph']).map((s) => s.cell), ['spark', 'soft', 'coin']);
  assert.equal(withoutCells(full, undefined), full); // skins sin la marca: misma lista
  const calm = withoutCells(full, ['soft']);
  assert.equal(hitList(full, calm, false), full);
  assert.equal(hitList(full, calm, true), calm);
  assert.match(src, /rmDropHit: \['soft'\]/);
  assert.match(src, /rmDropHit: \['glyph'\]/);
  assert.equal((src.match(/rmDropHit/g) ?? []).length, 3); // 2 skins + la lectura
});

test('E2: sinkBurst2 de anima_errante y sinkDecal de abyssal_tide solo se omiten con la bandera', () => {
  const src = readFileSync(new URL('../src/game/render/skins/skinFx.js', import.meta.url), 'utf8');
  assert.equal(sinkBurstAllowed({ rmNoSinkBurst: true }, false), true);
  assert.equal(sinkBurstAllowed({ rmNoSinkBurst: true }, true), false);
  assert.equal(sinkBurstAllowed({}, true), true); // otras skins intactas
  assert.equal(sinkDecalAllowed({ rmNoSinkDecal: true }, false), true);
  assert.equal(sinkDecalAllowed({ rmNoSinkDecal: true }, true), false);
  assert.equal(sinkDecalAllowed({ sinkDecal: {} }, true), true);
  assert.match(src, /anima_errante: \{[\s\S]*?rmNoSinkBurst: true[\s\S]*?cronometro_laton/);
  assert.match(src, /abyssal_tide: \{[\s\S]*?rmNoSinkDecal: true/);
});

test('E2: ruido de la cinta 0 solo con la bandera', () => {
  assert.equal(ribbonNoise('shaped', false), 0.6);
  assert.equal(ribbonNoise('ribbon_particles', false), 0.25);
  assert.equal(ribbonNoise('default', false), 0);
  for (const st of ['shaped', 'ribbon_particles', 'default']) assert.equal(ribbonNoise(st, true), 0);
});

// ---------------------------------------------------------------- ajustes a las referencias
const NUEVAS = ['antimatter_void', 'tormenta_voltaica', 'anima_errante', 'cronometro_laton', 'abyssal_tide'];
const asList = (x) => (x ? (Array.isArray(x) ? x : [x]) : []);

test('calmList: quita celdas y destellos solo si los hay', () => {
  const a = { cell: 'spark', n: 4 }, b = { cell: 'streak', n: 4, flash: true }, c = { cell: 'glyph', n: 1 };
  const plain = [a, c];
  assert.equal(calmList(plain, undefined), plain); // nada que quitar: misma lista
  assert.deepEqual(calmList([a, b, c], undefined), [a, c]);
  assert.deepEqual(calmList([a, b, c], ['glyph']), [a]);
  assert.deepEqual(calmList(plain, ['glyph']), [a]);
});

test('ribbonWave y echoRing: apagados con la bandera', () => {
  const w = { amp: 0.1, freq: 4, speed: 2 };
  assert.equal(ribbonWave(w, false), 0.1);
  assert.equal(ribbonWave(w, true), 0);
  assert.equal(ribbonWave(undefined, false), 0);
  const e = { at: 0.2, size: 1.5, speed: 2 };
  assert.equal(echoRing(e, false), e);
  assert.equal(echoRing(e, true), null);
  assert.equal(echoRing(undefined, false), null);
});

test('burstCount: suma a potencia 1 y a la mitad con la bandera', () => {
  const l = [{ n: 5 }, { n: 1 }, { n: 4 }];
  assert.equal(burstCount(l), 10);
  assert.equal(burstCount(l, true), 3 + 1 + 2);
});

test('skins nuevas: cada evento cabe en su tope de partículas', () => {
  for (const id of NUEVAS) {
    const skin = SKINS.find((s) => s.id === id);
    const sig = SKIN_SIG[id], max = skin.fx.maxParticles;
    assert.ok(burstCount(sig.hit) <= max, `${id}: golpe ${burstCount(sig.hit)} > ${max}`);
    assert.ok(burstCount(sig.wall) <= max, `${id}: pared ${burstCount(sig.wall)} > ${max}`);
    const k = skin.fx.sink;
    const extra = k === 'cinematic' || k === 'transform' ? burstCount(asList(sig.sinkBurst)) + 1 + (k === 'transform' ? 1 : 0) : 0;
    const sink = burstCount(asList(sig.sinkFountain)) + extra;
    assert.ok(sink <= max, `${id}: embocada ${sink} > ${max}`);
    assert.equal(sig.trail.n, 1, `${id}: estela de 1 en 1`);
    assert.ok(skin.fx.maxParticles <= 20);
  }
});

test('skins nuevas con la bandera: sin destellos ni celdas marcadas, sin onda ni ecos', () => {
  for (const id of NUEVAS) {
    const sig = SKIN_SIG[id];
    for (const [list, drop] of [[sig.hit, sig.rmDropHit], [sig.wall, null], [asList(sig.sinkFountain), sig.rmDropSink]]) {
      const calm = calmList(list, drop);
      assert.ok(calm.every((s) => !s.flash && !(drop ?? []).includes(s.cell)), id);
    }
    assert.equal(ribbonWave(sig.wave, true), 0, id);
    assert.equal(echoRing(sig.hitEcho, true), null, id);
    assert.equal(echoRing(sig.sinkEcho, true), null, id);
  }
  // cronómetro: en la embocada con la bandera, sin el reloj (glyph) y 6 partículas
  const cr = SKIN_SIG.cronometro_laton;
  assert.equal(burstCount(calmList(cr.sinkFountain, cr.rmDropSink), true), 6);
  // tormenta y marea: géiser/columna de 6 con la bandera
  assert.equal(burstCount(calmList(SKIN_SIG.tormenta_voltaica.sinkFountain, undefined), true), 6);
  assert.equal(burstCount(calmList(SKIN_SIG.abyssal_tide.sinkFountain, undefined), true), 6);
});
