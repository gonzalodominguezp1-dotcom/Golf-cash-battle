import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { CHALLENGES, SKINS, TIERS, skinById } from '../src/progress/skins.js';
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
