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
    for (const k of ['preset', 'roughness', 'metalness', 'clearcoat', 'underlayer']) assert.ok(s.finish[k] !== undefined, `${s.id}.finish.${k}`);
    assert.ok(s.shader === null || typeof s.shader === 'string');
    for (const k of ['trail', 'aura', 'hit', 'roll', 'wall', 'lip', 'sink']) assert.ok(k in s.fx, `${s.id}.fx.${k}`);
    for (const k of ['style', 'color', 'width', 'taper']) assert.ok(k in s.fx.trail, `${s.id}.fx.trail.${k}`);
    assert.ok(s.sfx && typeof s.sfx.set === 'string');
    assert.equal(typeof s.counter, 'boolean');
    assert.ok(Array.isArray(s.variants) && s.variants.length >= 1);
    assert.ok(Array.isArray(s.rarePatterns));
    assert.ok(Array.isArray(s.wearRange) && s.wearRange[0] >= 0 && s.wearRange[1] <= 1 && s.wearRange[0] <= s.wearRange[1]);
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

test('legendarias y míticas traen contador; las míticas acotan el desgaste', () => {
  for (const s of SKINS) {
    if (s.tier === 'legendary' || s.tier === 'mythic') assert.equal(s.counter, true, s.id);
    if (s.tier === 'mythic') assert.ok(s.wearRange[1] <= 0.15, s.id);
  }
});

test('los desafíos wins50 y aces5 desbloquean las míticas', () => {
  assert.ok(CHALLENGES.some((c) => c.id === 'wins50' && c.goal === 50 && c.stat === 'wins'));
  assert.ok(CHALLENGES.some((c) => c.id === 'aces5' && c.goal === 5 && c.stat === 'aces'));
  assert.deepEqual(skinById('event_horizon').unlock, { challenge: 'wins50' });
  assert.deepEqual(skinById('midas_touch').unlock, { challenge: 'aces5' });
  for (const s of SKINS) if (s.unlock?.challenge) assert.ok(CHALLENGES.some((c) => c.id === s.unlock.challenge), s.id);
});
