import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PACKS, byId } from '../src/game/render/vfx/packs/index.js';
import { PLAYER_CAP, QUALITIES, emissions, flashRate, validate } from '../src/game/render/vfx/schema.js';

// Primera tanda de packs (AC10): portal (3 estados), 3 choques de mundo y 1 efecto de skin por tier.
// Los golden fijan las emisiones: si alguien toca un efecto, estas pruebas obligan a decidirlo.

const PACK_DIR = new URL('../src/game/render/vfx/packs/', import.meta.url);
const ofFamily = (f) => PACKS.filter((e) => e.family === f);
const TOKENS = ['accent', 'glow', 'secondary', 'base', 'white'];
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const fingerprint = (list) => createHash('sha1').update(JSON.stringify(list)).digest('hex');

// Huellas sha1 de emissions(efecto, 1, 'high', reduced): generadas una vez con los efectos ya escritos y congeladas.
// Si cambias un efecto a propósito, regenera estas constantes y revisa el cambio visual en el banco.
const GOLDEN = {
  'portal-entrada': 'bd50f758b8c483674cab81e24e7a2d82db73c2c7',
  'portal-estable': 'e083815e20dd9bd6272415fe38469b20f3c9d5e5',
  'portal-salida': '9b9a5273f65f1db39113fd9c3db630742806377a',
  'choque-pared': 'adc405a3ab46a48a19a6583b5615109fdfd6ed50',
  'choque-bumper': 'a9ec693e01cddfd01bc4c0b6663a36d95f6356c4',
  'choque-hoyo': '6c370dd093ed86eec24fc4ecd5b4c87bb28b93ff',
  'skin-epico-brasas': 'eb4bb1ccd68d0d1ede032676335026216341fd26',
  'skin-legendario-corona': '3d3ab6fa919a3c80c46cd10ddc0d98a3e5d78d7b',
  'skin-mitico-singularidad': 'de3c9791fda0210c64359c710ed8cadbc3849676',
};
const GOLDEN_REDUCED = {
  'portal-entrada': 'dd61037727da2c9f0dc61b57c00c156051b0d706',
  'portal-estable': '30612d0016d32fa3447844f79d0c0eede069ca68',
  'portal-salida': '64ba82838e6728414ca50e6ab364f24593b35eb6',
  'choque-pared': 'f586128b345ee576c1b74d2949ff99402ac62643',
  'choque-bumper': '1682052d0d9f0f828a01d8647f27d1fb4569c479',
  'choque-hoyo': '3b8baf36bc929aad765137ddf659c429947812a8',
  'skin-epico-brasas': 'cdf7d48c0f827cb5cf291f226408436434e56b67',
  'skin-legendario-corona': '840b62d63eb995cbdb582ca223e105007a4526e2',
  'skin-mitico-singularidad': '17bf19fb8ff7a601c8bf1229cc6f3db131591fb2',
};

test('primera tanda: ids exactos por familia', () => {
  assert.deepEqual(ofFamily('portal').map((e) => e.id).sort(), ['portal-entrada', 'portal-estable', 'portal-salida']);
  assert.deepEqual(ofFamily('impact').map((e) => e.id).sort(), ['choque-bumper', 'choque-hoyo', 'choque-pared']);
  const skins = ofFamily('skin');
  assert.equal(skins.length, 3);
  for (const p of ['skin-epico-', 'skin-legendario-', 'skin-mitico-']) assert.equal(skins.filter((e) => e.id.startsWith(p)).length, 1, p);
  assert.equal(PACKS.length, 9);
  assert.equal(new Set(PACKS.map((e) => e.id)).size, 9, 'ids únicos');
});

test('portal: entrada y salida son ráfagas, estable es bucle', () => {
  assert.equal(byId('portal-entrada').loop, false);
  assert.equal(byId('portal-estable').loop, true);
  assert.equal(byId('portal-salida').loop, false);
  for (const e of ofFamily('impact')) assert.equal(e.loop, false, e.id);
});

test('skins: bucles de aura/estela, sin campos extra (el prefijo del id lleva el tier)', () => {
  for (const e of ofFamily('skin')) {
    assert.equal(e.loop, true, e.id);
    assert.equal('tier' in e, false, e.id);
  }
});

test('byId devuelve el efecto o undefined', () => {
  for (const e of PACKS) assert.equal(byId(e.id), e);
  assert.equal(byId('no-existe'), undefined);
});

test('todos los efectos son válidos y sin campos desconocidos', () => {
  assert.ok(PACKS.length > 0);
  for (const e of PACKS) {
    const r = validate(e);
    assert.ok(r.ok, `${e.id}: ${r.errors?.join('; ')}`);
  }
});

test('serializables: sobreviven a JSON sin cambios', () => {
  for (const e of PACKS) assert.deepEqual(JSON.parse(JSON.stringify(e)), e, e.id);
});

test('presupuestos: tope por calidad, destellos y mínimo de low', () => {
  for (const e of PACKS) {
    for (const q of QUALITIES) assert.ok(emissions(e, 1, q).length <= PLAYER_CAP[q], `${e.id} ${q}`);
    assert.ok(flashRate(e) <= 3, `${e.id} flashRate`);
    const hi = emissions(e, 1, 'high').length, lo = emissions(e, 1, 'low').length;
    assert.ok(lo >= Math.floor(hi * 0.3), `${e.id}: low ${lo} < 30 % de ${hi}`);
    assert.ok(hi > 0, e.id);
  }
});

test('los efectos aprovechan su presupuesto sin pedir de más', () => {
  for (const e of PACKS) {
    const hi = emissions(e, 1, 'high').length;
    assert.equal(hi, e.maxParticles.high, `${e.id}: lo pedido en high debe igualar maxParticles.high`);
  }
});

test('solo fichas de paleta o #hex en col (para poder recolorear)', () => {
  const cols = (e) => [...e.emitters, ...(e.rings ?? []), ...(e.lights ?? [])].map((x) => x.col);
  for (const e of PACKS) for (const c of cols(e)) assert.ok(TOKENS.includes(c) || HEX.test(c), `${e.id}: col «${c}»`);
});

test('distintivos: skins entre sí y choques entre sí difieren en al menos 2 propiedades', () => {
  const props = (e) => ({
    cells: [...new Set(e.emitters.map((x) => x.cell))].sort().join(','),
    cols: [...new Set(e.emitters.map((x) => x.col))].sort().join(','),
    dirs: [...new Set(e.emitters.map((x) => x.dir ?? 'back'))].sort().join(','),
    emitters: e.emitters.length,
    duration: e.duration,
    rings: (e.rings ?? []).length,
    lights: (e.lights ?? []).length,
    total: e.maxParticles.high,
  });
  for (const fam of ['skin', 'impact']) {
    const list = ofFamily(fam);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = props(list[i]), b = props(list[j]);
      const diff = Object.keys(a).filter((k) => a[k] !== b[k]);
      assert.ok(diff.length >= 2, `${list[i].id} vs ${list[j].id}: solo difieren en ${diff.join(',')}`);
    }
  }
});

test('determinismo: misma semilla, mismas emisiones; el código no usa azar ni reloj', () => {
  for (const e of PACKS) {
    assert.deepEqual(emissions(e, 7, 'high'), emissions(e, 7, 'high'), e.id);
    assert.notDeepEqual(emissions(e, 7, 'high'), emissions(e, 8, 'high'), `${e.id}: la semilla debe influir`);
  }
  const files = readdirSync(PACK_DIR).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 4);
  for (const f of files) {
    const src = readFileSync(new URL(f, PACK_DIR), 'utf8');
    assert.ok(!/Math\.random|Date\b/.test(src), `${f} usa azar o reloj`);
    assert.ok(!/from ['"]three['"]/.test(src), `${f} importa three`);
  }
});

test('golden: la huella de las emisiones de cada efecto no cambia', () => {
  for (const e of PACKS) {
    assert.ok(GOLDEN[e.id], `${e.id}: falta golden`);
    assert.equal(fingerprint(emissions(e, 1, 'high', false)), GOLDEN[e.id], `${e.id} cambió`);
    assert.equal(fingerprint(emissions(e, 1, 'high', true)), GOLDEN_REDUCED[e.id], `${e.id} (reducido) cambió`);
  }
  assert.equal(Object.keys(GOLDEN).length, PACKS.length);
  assert.equal(Object.keys(GOLDEN_REDUCED).length, PACKS.length);
});
