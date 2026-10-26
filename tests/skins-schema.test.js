import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKINS, TIERS, RARITIES, CHALLENGES, skinById } from '../src/progress/skins.js';

const HEX = /^#[0-9a-f]{6}$/i;
const LEGACY_IDS = ['classic', 'mint', 'veteran', 'sunset', 'birdie', 'zephyr_nacre', 'champ', 'galaxy', 'star', 'streak', 'supernova_solar', 'gold', 'lava', 'ice', 'highroller', 'crimson_dragon', 'kintsugi_neon', 'diamond', 'holo', 'damascus_imperial', 'emerald'];

test('TIERS define los 6 tiers y RARITIES es un alias', () => {
  assert.deepEqual(Object.keys(TIERS), ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']);
  assert.equal(RARITIES, TIERS);
  Object.values(TIERS).forEach((t, i) => {
    assert.equal(t.order, i);
    assert.ok(t.name && t.icon);
    assert.match(t.color, HEX);
  });
});

test('cada skin tiene los campos del esquema y un tier válido', () => {
  const ids = new Set();
  for (const s of SKINS) {
    assert.ok(!ids.has(s.id), `id duplicado ${s.id}`);
    ids.add(s.id);
    assert.ok(TIERS[s.tier], `${s.id}: tier inválido`);
    assert.equal(s.rarity, s.tier);
    assert.ok(typeof s.name === 'string' && s.name);
    assert.ok(typeof s.collection === 'string');
    assert.ok(typeof s.lore === 'string');
    for (const k of ['base', 'accent', 'secondary', 'glow']) assert.match(s.palette[k], HEX, `${s.id}.palette.${k}`);
    for (const k of ['preset', 'roughness', 'metalness', 'clearcoat']) assert.ok(s.finish[k] !== undefined, `${s.id}.finish.${k}`);
    assert.ok(s.shader === null || typeof s.shader === 'string');
    for (const k of ['trail', 'aura', 'hit', 'roll', 'wall', 'lip', 'sink']) assert.ok(k in s.fx, `${s.id}.fx.${k}`);
    for (const k of ['style', 'color', 'width', 'taper']) assert.ok(k in s.fx.trail, `${s.id}.fx.trail.${k}`);
    assert.ok(s.sfx && typeof s.sfx.set === 'string');
    assert.equal(typeof s.counter, 'boolean');
    assert.ok(Array.isArray(s.variants) && s.variants.length >= 1);
    assert.ok(Array.isArray(s.rarePatterns));
    assert.equal('wearRange' in s, false, `${s.id}: sin desgaste`);
  }
});

test('ids existentes intactos y re-tier según el plan', () => {
  for (const id of LEGACY_IDS) assert.equal(skinById(id).id, id);
  const tier = (id) => skinById(id).tier;
  for (const id of ['classic', 'mint']) assert.equal(tier(id), 'common');
  for (const id of ['veteran', 'sunset', 'birdie']) assert.equal(tier(id), 'uncommon');
  for (const id of ['champ', 'zephyr_nacre', 'galaxy']) assert.equal(tier(id), 'rare');
  for (const id of ['star', 'streak', 'gold', 'lava', 'ice', 'highroller', 'holo']) assert.equal(tier(id), 'epic');
  for (const id of ['supernova_solar', 'crimson_dragon', 'damascus_imperial', 'kintsugi_neon', 'diamond', 'emerald']) assert.equal(tier(id), 'legendary');
  for (const id of ['event_horizon', 'midas_touch']) assert.equal(tier(id), 'mythic');
});

test('legendarias y míticas traen contador', () => {
  for (const s of SKINS) {
    if (s.tier === 'legendary' || s.tier === 'mythic') assert.equal(s.counter, true, s.id);
  }
});

test('los desafíos wins50 y aces5 desbloquean las míticas', () => {
  assert.ok(CHALLENGES.some((c) => c.id === 'wins50' && c.goal === 50 && c.stat === 'wins'));
  assert.ok(CHALLENGES.some((c) => c.id === 'aces5' && c.goal === 5 && c.stat === 'aces'));
  assert.deepEqual(skinById('event_horizon').unlock, { challenge: 'wins50' });
  assert.deepEqual(skinById('midas_touch').unlock, { challenge: 'aces5' });
  for (const s of SKINS) if (s.unlock?.challenge) assert.ok(CHALLENGES.some((c) => c.id === s.unlock.challenge), s.id);
});

const NEW_SKINS = [
  { id: 'antimatter_void', tier: 'legendary', pattern: 'void_cracks', unlock: { challenge: 'bigwins5' } },
  { id: 'tormenta_voltaica', tier: 'epic', pattern: 'plasma', unlock: { level: 15 } },
  { id: 'anima_errante', tier: 'mythic', pattern: 'spirit', unlock: { challenge: 'matches150' } },
  { id: 'cronometro_laton', tier: 'epic', pattern: 'clockwork', unlock: { challenge: 'matches50' } },
  { id: 'abyssal_tide', tier: 'mythic', pattern: 'abyss_veins', unlock: { challenge: 'birdies50' } },
];

test('las 5 skins nuevas: tier, desbloqueo, shader propio y tope de partículas', () => {
  for (const n of NEW_SKINS) {
    const s = skinById(n.id);
    assert.equal(s.id, n.id);
    assert.equal(s.tier, n.tier, n.id);
    assert.equal(s.pattern, n.pattern, n.id);
    assert.deepEqual(s.unlock, n.unlock, n.id);
    assert.equal(s.shader, n.id, `${n.id}: shader obligatorio`);
    assert.ok(s.fx.maxParticles > 0 && s.fx.maxParticles <= 20, `${n.id}: ≤ 20 partículas`);
    assert.ok(s.fx.trailRate > 0, `${n.id}: trailRate`);
    assert.ok(s.lore.length > 0, `${n.id}: lore`);
  }
});

test('cada desafío nuevo desbloquea una sola skin', () => {
  const ids = ['bigwins5', 'matches50', 'matches150', 'birdies50'];
  for (const id of ids) {
    assert.ok(CHALLENGES.some((c) => c.id === id), id);
    assert.equal(SKINS.filter((s) => s.unlock?.challenge === id).length, 1, id);
  }
  for (const c of CHALLENGES) assert.ok(SKINS.filter((s) => s.unlock?.challenge === c.id).length <= 1, `${c.id}: una recompensa`);
});
