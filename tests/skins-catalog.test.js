import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { CHALLENGES, RARITIES, SKINS, TIERS, skinById } from '../src/progress/skins.js';
import { PATTERN_IDS, getPattern } from '../src/game/render/skins/patterns/index.js';
import { Progress } from '../src/progress/Progress.js';

// Tope de partículas vivas por tier según ideas_skins/_plan/spec-skins.md §0.3 (siempre ≤ 20)
const TIER_CAP = { epic: 16, legendary: 18, mythic: 20 };
const SPEC_IDS = ['antimatter_void', 'tormenta_voltaica', 'anima_errante', 'cronometro_laton', 'abyssal_tide'];
const SPEC_NAMES = {
  antimatter_void: 'Antimateria del Vacío',
  tormenta_voltaica: 'Tormenta Voltaica',
  anima_errante: 'Ánima Errante',
  cronometro_laton: 'Cronómetro de Latón',
  abyssal_tide: 'Marea Abisal',
};
const HEX = /^#[0-9a-f]{6}$/i;
const mem = (data) => {
  const store = new Map(data ? [['gcb.progress.v1', JSON.stringify(data)]] : []);
  return new Progress({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
};

test('SPEC: las 5 skins están registradas, con id único', () => {
  for (const id of SPEC_IDS) assert.equal(SKINS.filter((s) => s.id === id).length, 1, id);
  assert.equal(new Set(SKINS.map((s) => s.id)).size, SKINS.length);
});

test('SPEC: campos obligatorios completos (incluido shader) y nombre exacto', () => {
  for (const id of SPEC_IDS) {
    const s = skinById(id);
    assert.equal(typeof s.name, 'string');
    assert.equal(s.name.trim(), SPEC_NAMES[id], id);
    assert.ok(TIERS[s.tier], `${id}: tier`);
    assert.ok(s.lore.trim().length > 0, `${id}: lore`);
    assert.ok(s.pattern, `${id}: pattern`);
    assert.equal(s.shader, id, `${id}: shader`);
    assert.ok(PATTERN_IDS.includes(s.shader), `${id}: shader en PATTERN_IDS`);
    for (const k of ['base', 'accent', 'secondary', 'glow']) assert.match(s.palette[k], HEX, `${id}.palette.${k}`);
    assert.match(s.trail, HEX, `${id}.trail`);
    assert.ok(s.finish && Number.isFinite(s.finish.roughness) && Number.isFinite(s.finish.metalness), `${id}: finish`);
    assert.ok(s.sfx.set, `${id}: sfx`);
    assert.ok(s.unlock && (s.unlock.challenge || s.unlock.level), `${id}: unlock`);
    assert.equal(s.counter, s.tier === 'legendary' || s.tier === 'mythic', `${id}: counter`);
  }
});

test('SPEC: todas las skins del juego tienen nombre no vacío y único', () => {
  const names = new Set();
  for (const s of SKINS) {
    assert.ok(typeof s.name === 'string' && s.name.trim().length > 0, `${s.id}: nombre`);
    assert.ok(!names.has(s.name), `nombre repetido ${s.name}`);
    names.add(s.name);
  }
  for (const c of CHALLENGES) assert.ok(c.name.trim().length > 0, `desafío ${c.id}`);
});

test('SPEC: tope de partículas ≤ 20 y ≤ tope del tier', () => {
  for (const id of SPEC_IDS) {
    const s = skinById(id);
    const cap = TIER_CAP[s.tier];
    assert.ok(cap, `${id}: tier sin tope`);
    assert.ok(Number.isInteger(s.fx.maxParticles), `${id}: maxParticles`);
    assert.ok(s.fx.maxParticles > 0 && s.fx.maxParticles <= 20, `${id}: ≤ 20`);
    assert.ok(s.fx.maxParticles <= cap, `${id}: ${s.fx.maxParticles} > ${cap} del tier ${s.tier}`);
    // estela continua: ritmo fijo y no más que el tope
    assert.ok(s.fx.trailRate > 0 && s.fx.trailRate <= s.fx.maxParticles, `${id}: trailRate`);
  }
});

test('cada skin nueva tiene shader en patterns/ con GLSL y calidades', () => {
  const files = readdirSync(new URL('../src/game/render/skins/patterns/', import.meta.url));
  for (const id of SPEC_IDS) assert.ok(files.includes(`${id}.js`), `${id}.js`);
  // fuera de Vite solo hay stubs, pero el registro debe conocerlos
  for (const id of SPEC_IDS) {
    const p = getPattern(id);
    assert.ok(p, id);
    assert.ok(p.quality && 'low' in p.quality && 'medium' in p.quality && 'high' in p.quality, `${id}: quality`);
  }
});

test('cada skin nueva tiene textura 2D en ballPaint (calidad baja / bloqueada)', () => {
  const src = readFileSync(new URL('../src/game/render/ballPaint.js', import.meta.url), 'utf8');
  for (const id of SPEC_IDS) assert.ok(src.includes(`case '${skinById(id).pattern}'`), `${id}: pattern ${skinById(id).pattern}`);
});

test('una skin guardada inexistente vuelve a la skin por defecto', () => {
  for (const bad of ['skin_que_no_existe', '', null, 42, '__proto__']) {
    const p = mem({ xp: 0, equipped: bad });
    assert.equal(p.skin.id, 'classic', String(bad));
  }
  // una guardada y bloqueada también cae a la de serie
  assert.equal(mem({ xp: 0, equipped: 'abyssal_tide' }).skin.id, 'classic');
  // una guardada y desbloqueada se respeta
  assert.equal(mem({ xp: 0, equipped: 'abyssal_tide', birdies: 50 }).skin.id, 'abyssal_tide');
});

test('equip() no guarda ids desconocidos ni cambia el estado', () => {
  const p = mem({ xp: 100000, equipped: 'classic' });
  for (const bad of ['nope', '', undefined, null, 7, '__proto__', 'constructor']) {
    assert.equal(p.equip(bad), false, String(bad));
    assert.equal(p.state.equipped, 'classic', String(bad));
  }
  assert.equal(p.equip('tormenta_voltaica'), true);
  assert.equal(p.state.equipped, 'tormenta_voltaica');
});

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
