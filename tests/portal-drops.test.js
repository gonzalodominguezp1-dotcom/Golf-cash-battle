// Skins exclusivas y bola de maestría de la build de portal (VITE_PORTAL).
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.__GB_PORTAL_TEST__ = true;
const { SKINS, DROP_SKINS, COLLECTION_SKINS, CHALLENGES } = await import('../src/progress/skins.js');
const { Progress, DROP_CHANCE, CHEST_XP } = await import('../src/progress/Progress.js');

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const holes = [{ strokes: 3, par: 3 }];

test('las exclusivas no se ganan jugando y la maestría no cuenta en la colección', () => {
  assert.deepEqual(DROP_SKINS.map((s) => s.id).sort(), ['diamond', 'event_horizon', 'galaxy', 'gold', 'holo', 'midas_touch']);
  const mastery = SKINS.find((s) => s.id === 'maestria_oro_diamante');
  assert.ok(mastery);
  assert.ok(!COLLECTION_SKINS.includes(mastery));
  assert.equal(CHALLENGES.find((c) => c.id === 'mastery').goal, COLLECTION_SKINS.length);
  const p = new Progress(mem(), { rng: () => 0.99 });
  p.state.wins = 1000; p.state.xp = 1e7;
  for (const s of DROP_SKINS) assert.equal(p.isUnlocked(s), false);
});

test('al ganar toca una exclusiva solo si el azar baja de la probabilidad', () => {
  const p = new Progress(mem(), { rng: seq(DROP_CHANCE.win + 0.001) });
  assert.equal(p.recordMatch({ position: 1, won: true, entryFee: 0, holes }).drop, null);
  const q = new Progress(mem(), { rng: seq(DROP_CHANCE.win - 0.001, 0) });
  const r = q.recordMatch({ position: 1, won: true, entryFee: 0, holes });
  assert.equal(r.drop.id, DROP_SKINS[0].id);
  assert.ok(q.isUnlocked(r.drop));
  assert.ok(q.claimable.some((s) => s.id === r.drop.id));
  assert.ok(r.newSkins.some((s) => s.id === r.drop.id));
  // perder tiene menos probabilidad
  const l = new Progress(mem(), { rng: seq(DROP_CHANCE.loss + 0.001) });
  assert.equal(l.recordMatch({ position: 5, won: false, entryFee: 0, holes }).drop, null);
});

test('nunca repite exclusiva y se guarda', () => {
  const st = mem();
  const p = new Progress(st, { rng: () => 0 });
  const got = new Set();
  for (let i = 0; i < DROP_SKINS.length + 3; i++) {
    const d = p.recordMatch({ position: 1, won: true, entryFee: 0, holes }).drop;
    if (d) { assert.ok(!got.has(d.id)); got.add(d.id); }
  }
  assert.equal(got.size, DROP_SKINS.length);
  assert.equal(new Progress(st).state.drops.length, DROP_SKINS.length);
});

test('el cofre da exclusiva o XP', () => {
  const p = new Progress(mem(), { rng: seq(DROP_CHANCE.chest + 0.01) });
  const xp = p.state.xp;
  const r = p.openChest();
  assert.equal(r.skin, null);
  assert.equal(p.state.xp, xp + CHEST_XP);
  const q = new Progress(mem(), { rng: seq(DROP_CHANCE.chest - 0.01, 0.5) });
  assert.ok(q.openChest().skin);
});

test('la bola de maestría sale al tener todas las que se ganan jugando', () => {
  const p = new Progress(mem(), { rng: () => 0.99 });
  const mastery = SKINS.find((s) => s.id === 'maestria_oro_diamante');
  assert.equal(p.isUnlocked(mastery), false);
  Object.assign(p.state, { xp: 1e8, matches: 1e4, wins: 1e4, bestStreak: 100, birdies: 1e4, aces: 1e4, tiebreakWins: 1e4 });
  assert.ok(COLLECTION_SKINS.every((s) => p.isUnlocked(s)), COLLECTION_SKINS.filter((s) => !p.isUnlocked(s)).map((s) => s.id).join());
  assert.equal(p.isUnlocked(mastery), true);
  // sin exclusivas, igual
  assert.equal(p.state.drops.length, 0);
});

test('cada desafío del portal da una bola', () => {
  for (const c of CHALLENGES) assert.ok(SKINS.some((s) => s.unlock?.challenge === c.id), c.id);
});
