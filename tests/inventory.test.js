import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Progress } from '../src/progress/Progress.js';
import { SKINS, skinById } from '../src/progress/skins.js';
import { floatFor, seedFor, wearName } from '../src/progress/inventory.js';

const mem = (init = {}) => {
  const d = { ...init };
  return { getItem: (k) => d[k] ?? null, setItem: (k, v) => (d[k] = v), d };
};
const KEY = 'gcb.progress.v1';

test('seed y float son deterministas por dueño y skin', () => {
  assert.equal(seedFor('u1', 'gold'), seedFor('u1', 'gold'));
  assert.equal(floatFor('u1', 'gold'), floatFor('u1', 'gold'));
  assert.notEqual(floatFor('u1', 'gold'), floatFor('u2', 'gold'));
  for (let i = 0; i < 200; i++) {
    const f = floatFor('o' + i, 'x');
    assert.ok(f >= 0 && f <= 1);
    const s = seedFor('o' + i, 'x');
    assert.ok(Number.isInteger(s) && s >= 0 && s <= 999);
  }
  for (let i = 0; i < 200; i++) assert.ok(floatFor('o' + i, 'm', skinById('midas_touch').wearRange) <= 0.15);
});

test('wearName cubre los rangos', () => {
  assert.equal(wearName(0), 'Recién forjada');
  assert.equal(wearName(0.1), 'Casi nueva');
  assert.equal(wearName(0.2), 'Probada en campo');
  assert.equal(wearName(0.4), 'Desgastada');
  assert.equal(wearName(0.9), 'Curtida en batalla');
  assert.equal(wearName(1), 'Curtida en batalla');
});

test('recargar no re-tira: misma instancia; mismo dueño, mismos valores', () => {
  const st = mem();
  const a = new Progress(st);
  const inst = structuredClone(a.instance('classic'));
  assert.ok(inst && inst.float >= 0 && inst.float <= 1);
  const b = new Progress(st);
  assert.deepEqual(b.instance('classic'), inst);
  // al vincular cuenta, lo ya tirado no cambia
  const before = structuredClone(b.instance('classic'));
  b.attach('user-1', {}, null);
  assert.deepEqual(b.instance('classic'), before);
  // y las skins nuevas salen del dueño: misma cuenta, mismo valor
  const [c, d] = [new Progress(mem()), new Progress(mem())];
  for (const x of [c, d]) {
    x.state.owner = 'user-1';
    x.state.inventory = {};
    x.state.wins = 1;
    x.recordMatch({ position: 1, won: true, entryFee: 0, holes: [] });
  }
  assert.equal(c.instance('champ').seed, d.instance('champ').seed);
  assert.equal(c.instance('champ').float, d.instance('champ').float);
});

test('un estado antiguo sin inventory se migra sin perder nada', () => {
  const old = { xp: 5000, matches: 40, wins: 20, streak: 1, bestStreak: 6, birdies: 20, aces: 5, tiebreakWins: 1, bigWins: 4, equipped: 'gold' };
  const p = new Progress(mem({ [KEY]: JSON.stringify(old) }));
  for (const [k, v] of Object.entries(old)) assert.equal(p.state[k], v, k);
  for (const s of SKINS) assert.equal(!!p.instance(s.id), p.isUnlocked(s), s.id);
  assert.ok(p.instance('gold'));
});

test('contadores suben solo en la skin equipada y con marcador', () => {
  const p = new Progress(mem());
  p.state.wins = 15;
  p.state.xp = 1e6;
  p.recordMatch({ position: 1, won: false, entryFee: 0, holes: [] });
  assert.equal(p.equip('diamond'), true);
  assert.equal(p.instance('diamond').counter.enabled, true);
  p.recordMatch({ position: 1, won: false, entryFee: 0, holes: [{ strokes: 1, par: 3 }, { strokes: 2, par: 3 }, { strokes: 4, par: 3 }] });
  const c = p.instance('diamond').counter;
  assert.deepEqual([c.aces, c.sinks, c.birdies], [1, 3, 2]);
  assert.equal(p.instance('classic').counter.enabled, false);
  p.equip('classic');
  p.recordMatch({ position: 1, won: false, entryFee: 0, holes: [{ strokes: 1, par: 3 }] });
  assert.equal(p.instance('diamond').counter.aces, 1);
  assert.equal(p.instance('classic').counter.aces, 0, 'sin marcador no cuenta');
});

test('attach: seed y float del servidor mandan sobre los locales', () => {
  const p = new Progress(mem());
  const remote = { xp: 0, inventory: { classic: { seed: 7, float: 0.5, variant: 'base', counter: { enabled: false, aces: 0, sinks: 0, birdies: 0 }, unlockedAt: '2026-01-01T00:00:00.000Z' } } };
  p.attach('u9', remote, null);
  assert.equal(p.instance('classic').seed, 7);
  assert.equal(p.instance('classic').float, 0.5);
});

test('sinks cuenta solo embocadas reales, no hoyos con el máximo de golpes', () => {
  const p = new Progress(mem());
  p.state.wins = 15;
  p.state.xp = 1e6;
  p.recordMatch({ position: 1, won: false, entryFee: 0, holes: [] });
  p.equip('diamond');
  p.recordMatch({
    position: 1, won: false, entryFee: 0,
    holes: [{ strokes: 2, par: 3 }, { strokes: 8, par: 3 }, { strokes: 7, par: 3 }, { strokes: 0, par: 3 }],
  });
  assert.equal(p.instance('diamond').counter.sinks, 2);
});
