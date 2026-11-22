import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CODES, normalizeCode, skinForCode } from '../src/progress/codes.js';
import { SKINS, skinById } from '../src/progress/skins.js';
import { Progress } from '../src/progress/Progress.js';
import pattern from '../src/game/render/skins/patterns/huevo_mio.js';
import { PATTERN_IDS, getPattern } from '../src/game/render/skins/patterns/index.js';

const mem = (data) => {
  const store = new Map(data ? [['gcb.progress.v1', JSON.stringify(data)]] : []);
  const p = new Progress({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) });
  p.store = store;
  return p;
};

test('RDR da El Huevo Mío, sin distinguir mayúsculas ni espacios', () => {
  assert.equal(CODES.RDR, 'huevo_mio');
  for (const raw of ['RDR', 'rdr', ' Rdr ', 'r d r']) assert.equal(skinForCode(raw), 'huevo_mio', raw);
  assert.equal(skinById('huevo_mio').name, 'El Huevo Mío');
  assert.deepEqual(skinById('huevo_mio').unlock, { code: true });
});

test('códigos inventados o peligrosos no dan nada', () => {
  for (const bad of ['', 'RD', 'RDRR', '__proto__', 'constructor', 'toString', null, undefined, 42, {}]) assert.equal(skinForCode(bad), null, String(bad));
  assert.equal(normalizeCode(undefined), '');
});

test('todo código apunta a una skin que existe y cada skin por código tiene código', () => {
  for (const id of Object.values(CODES)) assert.ok(SKINS.some((s) => s.id === id), id);
  for (const s of SKINS.filter((x) => x.unlock?.code)) assert.ok(Object.values(CODES).includes(s.id), s.id);
});

test('sin canjear, la skin está bloqueada aunque haya mucho nivel y no se puede equipar', () => {
  const p = mem({ xp: 1e6, wins: 999, birdies: 999, aces: 999, equipped: 'huevo_mio' });
  assert.equal(p.isUnlocked(skinById('huevo_mio')), false);
  assert.equal(p.skin.id, 'classic');
  assert.equal(p.equip('huevo_mio'), false);
  assert.equal(p.requirement(skinById('huevo_mio')).text, 'Código secreto'); // no revela el código
});

test('redeemCode: invalid no cambia nada; ok desbloquea, guarda y queda por abrir; already no repite', () => {
  const p = mem();
  const before = JSON.stringify(p.state.inventory);
  assert.deepEqual(p.redeemCode('nope'), { status: 'invalid' });
  assert.equal(JSON.stringify(p.state.inventory), before);

  const saved = [];
  p.remote = (s) => { saved.push(s); return Promise.resolve(); };
  const r = p.redeemCode(' rdr ');
  assert.equal(r.status, 'ok');
  assert.equal(r.skin.id, 'huevo_mio');
  assert.equal(p.isUnlocked(skinById('huevo_mio')), true);
  assert.ok(p.state.inventory.huevo_mio?.seed >= 0);
  assert.ok(p.claimable.some((s) => s.id === 'huevo_mio'));
  assert.equal(saved.length, 1, 'se guarda en la cuenta');
  assert.ok(saved[0].inventory.huevo_mio);
  assert.equal(p.equip('huevo_mio'), true);
  const afterEquip = saved.length;

  const seed = p.state.inventory.huevo_mio.seed;
  assert.equal(p.redeemCode('RDR').status, 'already');
  assert.equal(p.state.inventory.huevo_mio.seed, seed);
  assert.equal(saved.length, afterEquip, 'repetir el código no guarda de nuevo');
});

test('el canje sobrevive a recargar (localStorage)', () => {
  const p = mem();
  p.redeemCode('RDR');
  const again = mem(JSON.parse(p.store.get('gcb.progress.v1')));
  assert.equal(again.isUnlocked(skinById('huevo_mio')), true);
});

test('el shader y la textura 2D de la skin existen', () => {
  const s = skinById('huevo_mio');
  assert.equal(s.shader, 'huevo_mio');
  assert.ok(PATTERN_IDS.includes('huevo_mio'));
  const p = getPattern('huevo_mio');
  assert.ok(p && 'low' in p.quality && 'medium' in p.quality && 'high' in p.quality);
  const paint = readFileSync(new URL('../src/game/render/ballPaint.js', import.meta.url), 'utf8');
  assert.ok(paint.includes(`case '${s.pattern}'`));
  for (const lvl of ['low', 'medium', 'high']) for (const k of ['tone', 'wfreq', 'fine', 'bump']) assert.equal(typeof pattern.quality[lvl][k], 'number', `${lvl}.${k}`);
  // cada constante de calidad que usa el GLSL está definida (SK_<CLAVE> o SK_<CLAVE>_F)
  for (const m of pattern.glsl.matchAll(/SK_([A-Z]+)(_F)?/g)) {
    if (m[1] === 'Q') continue;
    assert.ok(m[1].toLowerCase() in pattern.quality.high, `SK_${m[1]} sin definir`);
  }
  // media también compila el shader: todas las calidades definen las mismas constantes (y numéricas)
  const keys = Object.keys(pattern.quality.high).sort();
  for (const lvl of ['low', 'medium']) assert.deepEqual(Object.keys(pattern.quality[lvl]).sort(), keys, lvl);
  for (const lvl of ['low', 'medium', 'high']) for (const k of keys) assert.ok(Number.isFinite(pattern.quality[lvl][k]), `${lvl}.${k}`);
  // las octavas de fbm y el interruptor `fine` se usan como enteros en el GLSL
  for (const lvl of ['low', 'medium', 'high']) for (const k of ['tone', 'fine']) assert.ok(Number.isInteger(pattern.quality[lvl][k]), `${lvl}.${k}`);
});
