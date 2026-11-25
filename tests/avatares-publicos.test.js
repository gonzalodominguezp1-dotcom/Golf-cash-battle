import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPlayer } from '../src/match/playerRules.js';
import { buildRoster } from '../src/match/liveRules.js';
import { FRAMES, frameById } from '../src/progress/prestige.js';

const FRAME = FRAMES[0];
const IMG = 'data:image/png;base64,AAAA';

test('toPlayer conserva avatar y marco públicos del servidor', () => {
  const p = toPlayer({ id: 'e1', seat: 0, name: 'Ana', color: '#f00', avatar: 'icon:crown', frame: FRAME.id, scores: [], total: 0 });
  assert.deepEqual(p.avatar, { icon: 'crown', image: null });
  assert.equal(p.frame, FRAME);
});

test('toPlayer con imagen de avatar la conserva', () => {
  const p = toPlayer({ id: 'e2', seat: 1, name: 'Luis', color: '#0f0', avatar: IMG, frame: null });
  assert.deepEqual(p.avatar, { icon: null, image: IMG });
  assert.equal(p.frame, null);
});

test('un jugador sin avatar ni marco cae a los valores por defecto', () => {
  const p = toPlayer({ id: 'e3', seat: 2, name: 'Marta', color: '#00f' });
  assert.deepEqual(p.avatar, { icon: null, image: null });
  assert.equal(p.frame, null);
});

test('toPlayer marca al jugador propio como me', () => {
  const p = toPlayer({ id: 'e4', is_me: true, seat: 0, name: 'Yo', color: '#fff', avatar: 'icon:star', frame: null });
  assert.equal(p.id, 'me');
  assert.deepEqual(p.avatar, { icon: 'star', image: null });
});

test('buildRoster pasa avatar y marco a los humanos y deja a los bots sin avatar', () => {
  const match = {
    id: 'm1',
    seats: 3,
    players: [
      { id: 'me', seat: 0, name: 'Yo', color: '#fff', avatar: { icon: 'fire', image: null }, frame: FRAME },
      { id: 'x', seat: 1, name: 'Ana', color: '#f00', avatar: null, frame: null },
    ],
  };
  const roster = buildRoster(match);
  assert.equal(roster[0].human, true);
  assert.deepEqual(roster[0].avatar, { icon: 'fire', image: null });
  assert.equal(roster[0].frame, FRAME);
  assert.equal(roster[1].avatar, null);
  assert.equal(roster[1].frame, null);
  assert.equal(roster[2].isBot, true);
  assert.equal(roster[2].avatar, null);
  assert.equal(roster[2].frame, null);
});

test('frameById devuelve el marco del catálogo o null', () => {
  assert.equal(frameById(FRAME.id), FRAME);
  assert.equal(frameById(null), null);
  assert.equal(frameById('no-existe'), null);
});

test('la migración de avatares solo publica avatar y marco, nunca datos privados', async () => {
  const { readFile } = await import('node:fs/promises');
  const sql = await readFile(new URL('../supabase/migrations/20261125120000_avatares_publicos.sql', import.meta.url), 'utf8');
  // las funciones usan security definer con search_path vacío, como el resto
  assert.equal((sql.match(/security definer set search_path = ''/g) ?? []).length, 3);
  // ningún campo sensible se publica en estas funciones
  for (const bad of ['email', 'balance', 'kyc', 'wallet', 'phone']) {
    assert.doesNotMatch(sql, new RegExp(`'${bad}'`, 'i'));
  }
});
