import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_CAP, SKIN_SLOTS, SKIN_REJECTED_FIELDS, budget, emissions, flashRate, validate, validateSkin } from '../src/game/render/vfx/schema.js';

const burst = (over = {}) => ({
  id: 'spark-pop', name: 'Chispazo', family: 'impact', duration: 1, loop: false,
  maxParticles: { low: 12, medium: 30, high: 60 },
  emitters: [{ cell: 'spark', n: 40, speed: 3, spread: 0.6, size: 0.1, life: 0.6, col: 'accent', t0: 0 }],
  ...over,
});
const loop = (over = {}) => ({
  id: 'aura', name: 'Aura', family: 'skin', duration: 2, loop: true,
  maxParticles: { low: 14, medium: 24, high: 40 },
  emitters: [{ cell: 'soft', rate: 20, t0: 0, t1: 2, speed: 0.5, spread: 1, size: 0.2, life: 0.5, col: 'glow' }],
  ...over,
});

test('validate: acepta un efecto de una vez y uno en bucle correctos', () => {
  assert.deepEqual(validate(burst()), { ok: true });
  assert.deepEqual(validate(loop()), { ok: true });
});

test('validate: rechaza campos desconocidos, ids vacíos y valores no válidos con el nombre del campo', () => {
  for (const [bad, field] of [
    [burst({ sorpresa: 1 }), 'sorpresa'],
    [burst({ id: '' }), 'id'],
    [burst({ duration: 0 }), 'duration'],
    [burst({ emitters: [{ ...burst().emitters[0], life: -1 }] }), 'life'],
    [burst({ emitters: [] }), 'emitters'],
  ]) {
    const r = validate(bad);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes(field)), `falta ${field} en ${r.errors}`);
  }
});

test('AC5: el presupuesto nunca pasa del tope por calidad y lo que lo supera es inválido', () => {
  for (const q of ['low', 'medium', 'high']) assert.ok(budget(burst(), q) <= PLAYER_CAP[q]);
  const r = validate(burst({ maxParticles: { low: 12, medium: 30, high: 500 } }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('maxParticles')));
});

test('AC4: mismas entradas dan la misma lista y otra semilla da otra', () => {
  const a = emissions(burst(), 7, 'high', false);
  assert.deepEqual(a, emissions(burst(), 7, 'high', false));
  assert.notDeepEqual(a, emissions(burst(), 8, 'high', false));
});

test('AC5/AC13: nunca más emisiones que el presupuesto y low conserva al menos el 30 % de high', () => {
  const h = emissions(burst(), 1, 'high', false).length;
  for (const q of ['low', 'medium', 'high']) assert.ok(emissions(burst(), 1, q, false).length <= budget(burst(), q));
  assert.ok(emissions(burst(), 1, 'low', false).length >= Math.floor(h * 0.3));
  assert.equal(validate(burst({ maxParticles: { low: 2, medium: 30, high: 60 } })).ok, false);
});

test('AC6: con reducción de movimiento hay menos partículas, más lentas y ningún destello', () => {
  const fx = burst({ flashes: [0, 0.4] });
  const n = emissions(fx, 1, 'high', false), r = emissions(fx, 1, 'high', true);
  assert.ok(r.length < n.length);
  assert.ok(Math.max(...r.map((e) => e.speed)) < Math.max(...n.map((e) => e.speed)));
  assert.equal(flashRate(fx, true), 0);
});

test('AC3: un efecto de una vez no deja nada visible pasada su duración', () => {
  assert.equal(validate(burst({ duration: 0.5 })).ok, false); // t0 + life = 0.6 > 0.5
  assert.equal(validate(burst({ duration: 0.6 })).ok, true);
  const last = Math.max(...emissions(burst(), 1, 'high', false).map((e) => e.t + e.life));
  assert.ok(last <= burst().duration + 1e-9);
});

test('AC2: un bucle sin ráfagas sueltas y con ritmo entero cierra sin salto', () => {
  assert.equal(validate(loop({ emitters: [{ ...loop().emitters[0], n: 10, rate: undefined }] })).ok, false);
  assert.equal(validate(loop({ emitters: [{ ...loop().emitters[0], rate: 20.3 }] })).ok, false);
  const e = emissions(loop(), 3, 'high', false);
  assert.equal(e[0].t, 0);
  const gap = e[1].t - e[0].t;
  assert.ok(Math.abs(loop().duration - e[e.length - 1].t - gap) < 1e-9);
});

test('AC7: la tasa de destellos mide la ventana de 1 s y más de 3 es inválido', () => {
  assert.equal(flashRate(burst({ flashes: [0, 0.2, 0.4] }), false), 3);
  assert.equal(flashRate(burst({ flashes: [0, 0.2, 0.4, 0.6] }), false), 4);
  assert.equal(validate(burst({ flashes: [0, 0.2, 0.4, 0.6] })).ok, false);
  assert.equal(validate(burst({ flashes: [0, 0.4, 0.8] })).ok, true);
  assert.equal(flashRate(burst({ flashes: [0, 1.5] }), false), 1);
});

test('strength escala la cantidad sin pasar del presupuesto', () => {
  const full = emissions(burst(), 1, 'high', false, 1).length;
  const half = emissions(burst(), 1, 'high', false, 0.5).length;
  assert.ok(half < full && half > 0);
  assert.ok(emissions(burst(), 1, 'high', false, 5).length <= budget(burst(), 'high'));
});

test('validate nunca lanza: rings, lights o flashes mal formados devuelven errores', () => {
  for (const bad of [{ rings: {} }, { rings: 5 }, { lights: 'x' }, { flashes: 'x' }, { rings: [null] }, { rings: [{ t: 0, life: 0.1, orient: 'techo' }] }]) {
    const r = validate(burst(bad));
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(Array.isArray(r.errors) && r.errors.length);
  }
});

test('AC7: los destellos de un bucle corto cuentan sus repeticiones y deben caer dentro de la duración', () => {
  const lp = loop({ duration: 0.8, emitters: [{ ...loop().emitters[0], t1: 0.8, rate: 20 }], flashes: [0, 0.2, 0.4] });
  assert.equal(flashRate(lp), 4); // 0, .2, .4, .8 dentro de la misma ventana de 1 s
  assert.equal(validate(lp).ok, false);
  assert.equal(validate(burst({ flashes: [5] })).ok, false);
  assert.equal(flashRate(burst({ flashes: [0, 1] }), false), 1); // justo a 1,0 s: ventanas distintas
});

test('AC13: un emisor pequeño no desaparece en low ni con reducción de movimiento', () => {
  const two = burst({ emitters: [burst().emitters[0], { ...burst().emitters[0], n: 2, cell: 'ember' }] });
  const by = (list) => list.reduce((m, e) => ((m[e.cell] = (m[e.cell] ?? 0) + 1), m), {});
  const low = by(emissions(two, 1, 'low', false));
  assert.ok(low.spark >= 1 && low.ember >= 1);
  assert.equal(emissions(two, 1, 'low', false).length, budget(two, 'low'));
  assert.equal(emissions(burst({ emitters: [{ ...burst().emitters[0], n: 1 }] }), 1, 'high', true).length, 1);
});

test('dir se valida y se emite, y el drag por defecto es el de skinFx', () => {
  assert.equal(validate(burst({ emitters: [{ ...burst().emitters[0], dir: 'arriba' }] })).ok, false);
  const e = emissions(burst({ emitters: [{ ...burst().emitters[0], dir: 'in' }] }), 1, 'high', false);
  assert.ok(e.every((x) => x.dir === 'in'));
  assert.equal(emissions(burst(), 1, 'high', false)[0].dir, 'back');
  assert.equal(emissions(burst(), 1, 'high', false)[0].drag, 1.5);
});

test('strength se acota a 0..1 y las entradas inválidas fallan en voz alta', () => {
  assert.deepEqual(emissions(burst(), 1, 'high', false, 5), emissions(burst(), 1, 'high', false, 1));
  assert.equal(emissions(burst(), 1, 'high', false, -1).length, 0);
  assert.throws(() => emissions(burst(), 1, 'high', false, NaN), RangeError);
  assert.throws(() => emissions(burst(), NaN, 'high', false), RangeError);
  assert.throws(() => emissions(burst(), 1, 'ultra', false), RangeError);
  assert.equal(budget(burst(), 'ultra'), 0);
});

test('AC3: los emisores continuos de una vez terminan exactamente en t1 + life', () => {
  const fx = burst({ duration: 1, emitters: [{ cell: 'soft', rate: 10, t0: 0.2, t1: 0.6, speed: 1, spread: 1, size: 0.1, life: 0.4, col: 'glow' }] });
  assert.equal(validate(fx).ok, true);
  const e = emissions(fx, 1, 'high', false);
  assert.equal(e.length, 4);
  assert.ok(Math.abs(Math.max(...e.map((x) => x.t + x.life)) - 0.9) < 1e-9); // 0,2 + 3 pasos de 0,1 + 0,4
  assert.equal(validate({ ...fx, duration: 0.8 }).ok, false);
});

test('validate responde rápido y sin colgarse con un bucle de duración minúscula', () => {
  const t0 = Date.now();
  for (const d of [1e-4, 1e-6, 1e-9]) {
    const r = validate(loop({ duration: d, emitters: [{ ...loop().emitters[0], t1: d, rate: 1 / d }], flashes: [0] }));
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('flashes')));
  }
  assert.ok(Date.now() - t0 < 500, `tardó ${Date.now() - t0} ms`);
  assert.ok(flashRate(loop({ duration: 1e-9, flashes: [0] })) > 1e8); // enorme y finito, calculado sin recorrerlo
});

test('maxParticles debe ser entero y el presupuesto nunca es fraccionario', () => {
  const frac = burst({ maxParticles: { low: 10.5, medium: 30, high: 60 }, emitters: [burst().emitters[0], { ...burst().emitters[0], n: 30, cell: 'ember' }] });
  const r = validate(frac);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('maxParticles.low') && e.includes('entero')));
  assert.equal(budget(frac, 'low'), 10);
  assert.ok(emissions(frac, 1, 'low').length <= budget(frac, 'low'));
});

test('validate acota su trabajo con cualquier entrada: sin destellos, muchísimos destellos y duraciones extremas', () => {
  const t0 = Date.now();
  for (const d of [1e-9, 1e-12, 1e-300]) {
    const sin = loop({ duration: d, emitters: [{ ...loop().emitters[0], t1: d, rate: 1 / d }], flashes: [] });
    assert.equal(flashRate(sin), 0);
    assert.ok(validate(sin).errors?.every((e) => !e.includes('flashes')) ?? true);
  }
  const muchos = burst({ duration: 1000, emitters: [{ ...burst().emitters[0], t0: 0 }], flashes: new Array(100000).fill(0) });
  assert.equal(validate(muchos).ok, false);
  assert.ok(validate(muchos).errors.some((e) => e.includes('flashes')));
  assert.equal(flashRate(muchos), 100000);
  assert.ok(Date.now() - t0 < 1000, `tardó ${Date.now() - t0} ms`);
});

test('flashRate en bucle: periodos enteros más resto, también en los límites exactos', () => {
  const lp = (duration, flashes) => loop({ duration, emitters: [{ ...loop().emitters[0], t1: duration, rate: 10 / duration }], flashes });
  assert.equal(flashRate(lp(1, [0, 0.4, 0.8])), 3);
  assert.equal(flashRate(lp(0.5, [0])), 2); // 0 y 0,5 caben en una ventana de 1 s; el 1,0 no
  assert.equal(flashRate(lp(0.8, [0, 0.2, 0.4])), 4);
  assert.equal(flashRate(lp(2, [0, 0.9])), 2);
});

// ---- T015 / AC16: skins creadas en el banco (apariencia + efectos asignados, nada de catálogo) ----
const fxLib = () => new Map([
  ['aura', loop()], ['trail', loop({ id: 'trail' })], ['roll', loop({ id: 'roll' })],
  ['hit', burst({ id: 'hit' })], ['wall', burst({ id: 'wall' })], ['sink', burst({ id: 'sink' })],
]);
const skin = (over = {}) => ({
  id: 'neon', name: 'Neón',
  palette: { base: '#112233', accent: '#fa0', secondary: '#334455', glow: '#FFEE00' },
  finish: 'matte', pattern: 'stripes',
  effects: { trail: 'trail', aura: 'aura', hit: 'hit', roll: 'roll', wall: 'wall', sink: 'sink' },
  ...over,
});
const mustFail = (s, field, lib = fxLib()) => {
  const r = validateSkin(s, lib);
  assert.equal(r.ok, false, `debía fallar por ${field}`);
  assert.ok(r.errors.every((e) => typeof e === 'string'));
  assert.ok(r.errors.some((e) => e.includes(field)), `falta ${field} en ${r.errors}`);
  return r;
};

test('validateSkin: una skin completa y una mínima válidas pasan', () => {
  assert.deepEqual(validateSkin(skin(), fxLib()), { ok: true });
  assert.deepEqual(validateSkin({ id: 'a', name: 'A', palette: skin().palette, effects: {} }, fxLib()), { ok: true });
  assert.deepEqual([...SKIN_SLOTS].sort(), ['aura', 'hit', 'roll', 'sink', 'trail', 'wall']);
});

test('validateSkin: campos desconocidos y de catálogo (tier, unlock, price…) se rechazan con su motivo', () => {
  mustFail(skin({ sorpresa: 1 }), 'sorpresa');
  assert.deepEqual([...SKIN_REJECTED_FIELDS].sort(), ['cost', 'price', 'rarity', 'shop', 'tier', 'unlock']);
  for (const f of SKIN_REJECTED_FIELDS) {
    const r = mustFail(skin({ [f]: 1 }), f);
    assert.ok(r.errors.some((e) => e.includes(f) && e.includes('no forma parte de una skin creada en el banco')), r.errors.join('|'));
  }
});

test('validateSkin: id y name no vacíos; paleta completa con colores #hex', () => {
  mustFail(skin({ id: '' }), 'id');
  mustFail(skin({ id: 5 }), 'id');
  mustFail(skin({ name: '  ' }), 'name');
  mustFail(skin({ palette: undefined }), 'palette');
  mustFail(skin({ palette: { ...skin().palette, glow: undefined } }), 'palette.glow');
  mustFail(skin({ palette: { ...skin().palette, base: 'rojo' } }), 'palette.base');
  mustFail(skin({ palette: { ...skin().palette, accent: '#12' } }), 'palette.accent');
  mustFail(skin({ palette: { ...skin().palette, secondary: '#12345g' } }), 'palette.secondary');
  mustFail(skin({ palette: { ...skin().palette, extra: '#fff' } }), 'palette.extra');
  mustFail(skin({ finish: 3 }), 'finish');
  mustFail(skin({ pattern: {} }), 'pattern');
});

test('validateSkin: effects solo admite los seis slots y ids que existan en la biblioteca', () => {
  mustFail(skin({ effects: 'x' }), 'effects');
  mustFail(skin({ effects: { magia: 'aura' } }), 'effects.magia');
  mustFail(skin({ effects: { aura: 7 } }), 'effects.aura');
  const r = mustFail(skin({ effects: { aura: 'no-existe' } }), 'effects.aura');
  assert.ok(r.errors.some((e) => e.includes('no-existe')));
});

test('validateSkin: aura, trail y roll piden un bucle; hit, wall y sink piden una vez, en ambos sentidos', () => {
  const lib = new Map([['l', loop({ id: 'l' })], ['o', burst({ id: 'o' })]]);
  for (const s of ['aura', 'trail', 'roll']) {
    assert.equal(validateSkin(skin({ effects: { [s]: 'l' } }), lib).ok, true, s);
    mustFail(skin({ effects: { [s]: 'o' } }), `effects.${s}`, lib);
  }
  for (const s of ['hit', 'wall', 'sink']) {
    assert.equal(validateSkin(skin({ effects: { [s]: 'o' } }), lib).ok, true, s);
    mustFail(skin({ effects: { [s]: 'l' } }), `effects.${s}`, lib);
  }
});

test('validateSkin: un efecto referenciado que no pasa validate() se reporta', () => {
  const lib = new Map([['aura', loop({ duration: 0 })]]);
  const r = mustFail(skin({ effects: { aura: 'aura' } }), 'aura', lib);
  assert.ok(r.errors.some((e) => e.includes('el efecto «aura» del slot «aura» no es válido')), r.errors.join('|'));
});

test('validateSkin: la biblioteca puede ser Map, lista, objeto u objeto con get()', () => {
  const a = loop({ id: 'a' }), s = skin({ effects: { aura: 'a' } });
  for (const lib of [new Map([['a', a]]), [a], { a }, { get: (id) => (id === 'a' ? a : undefined) }]) {
    assert.equal(validateSkin(s, lib).ok, true);
    mustFail(skin({ effects: { aura: 'b' } }), 'effects.aura', lib);
  }
  const proto = mustFail(skin({ effects: { aura: '__proto__' } }), 'effects.aura', {}); // no se lee la cadena de prototipos
  assert.ok(proto.errors.some((e) => e.includes('no existe')), proto.errors.join('|'));
  mustFail(s, 'effects.aura', { get() { throw new Error('boom'); } });
});

test('validateSkin: una biblioteca basura cuenta como vacía y nunca lanza', () => {
  for (const lib of [null, 5, 'x', true, () => {}]) {
    mustFail(skin({ effects: { aura: 'aura' } }), 'effects.aura', lib);
    assert.equal(validateSkin(skin({ effects: {} }), lib).ok, true);
  }
});

test('validateSkin: entradas basura (null, 5, [], texto, circulares, getters que lanzan) no lanzan', () => {
  const circ = skin(); circ.self = circ; circ.effects.loop = circ;
  const boom = skin(); Object.defineProperty(boom, 'name', { get() { throw new Error('boom'); }, enumerable: true });
  for (const bad of [null, undefined, 5, [], 'x', true, circ, boom, Object.create(null)]) {
    const r = validateSkin(bad, fxLib());
    assert.equal(r.ok, false);
    assert.ok(Array.isArray(r.errors) && r.errors.length);
  }
});

test('validateSkin acota su trabajo con un effects enorme y los errores llevan el campo', () => {
  const effects = {};
  for (let i = 0; i < 1e5; i++) effects[`k${i}`] = 'aura';
  const t0 = Date.now();
  const r = mustFail(skin({ effects }), 'effects');
  assert.ok(Date.now() - t0 < 500, `tardó ${Date.now() - t0} ms`);
  assert.ok(r.errors.length < 100);
  for (const e of validateSkin({ tier: 1, id: '', palette: 3, effects: { aura: 'zz' } }, fxLib()).errors) {
    assert.ok(/^(id|name|palette|tier|effects(\.\w+)?|skin)\b/.test(e), `sin campo: ${e}`);
  }
});

test('validateSkin: sin biblioteca (undefined) también cuenta como vacía', () => {
  const r = validateSkin(skin({ effects: { aura: 'aura' } }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('effects.aura')));
});

test('T015: validateSkin acota su trabajo con una biblioteca en forma de lista enorme', () => {
  const skin = { id: 's', name: 'S', palette: { base: '#111', accent: '#ff0', secondary: '#0ff', glow: '#fff' }, effects: { aura: 'zz', trail: 'yy', hit: 'xx' } };
  const t0 = Date.now();
  for (const lib of [new Array(2e8), new Array(4e9)]) {
    const r = validateSkin(skin, lib);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.includes('effects.aura') && e.includes('no existe')));
  }
  assert.ok(Date.now() - t0 < 500, `tardó ${Date.now() - t0} ms`);
});

test('T015: un campo de catálogo heredado por el prototipo también se rechaza', () => {
  const skin = Object.assign(Object.create({ tier: 'epic', price: 9 }), { id: 's', name: 'S', palette: { base: '#111', accent: '#ff0', secondary: '#0ff', glow: '#fff' }, effects: {} });
  const r = validateSkin(skin, {});
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.startsWith('tier:')) && r.errors.some((e) => e.startsWith('price:')));
});
