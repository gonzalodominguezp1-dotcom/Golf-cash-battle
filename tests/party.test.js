import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newPartyMatch, partyErrorText, partyMessage, readyLabel } from '../src/match/partyRules.js';

test('cada error de grupo del servidor tiene texto y lo desconocido no se filtra', () => {
  for (const code of ['not_friends', 'party_full', 'invite_not_found', 'not_leader', 'party_paid_only', 'no_tier', 'already_in_party']) {
    assert.notEqual(partyMessage(code), partyMessage('otra_cosa'), code);
  }
  assert.match(partyMessage('xyz'), /Prueba otra vez/);
});

test('el motivo de no poder buscar partida nombra a quien falla', () => {
  assert.match(partyErrorText('busy:Ana'), /^Ana tiene un torneo a medias/);
  assert.match(partyErrorText('funds:Bea'), /^Bea no tiene saldo/);
  assert.match(partyErrorText('blocked:Car'), /^Car aún no puede/);
  assert.equal(partyErrorText(null), '');
});

test('solo se abre el torneo del grupo si este dispositivo no lo ha abierto ya', () => {
  assert.equal(newPartyMatch({ tournament_id: 't1' }, null), 't1');
  assert.equal(newPartyMatch({ tournament_id: 't1' }, 't1'), null);
  assert.equal(newPartyMatch({ tournament_id: null }, 't1'), null);
  assert.equal(newPartyMatch(null, null), null);
});

test('el botón del grupo dice lo que va a pasar', () => {
  const members = (ready) => [{ me: true, ready }, { me: false, ready: true }];
  assert.equal(readyLabel({ leader: true, tier_id: null, members: members(false) }), 'Elige una mesa abajo');
  assert.equal(readyLabel({ leader: false, tier_id: null, members: members(false) }), 'El líder elige la mesa');
  assert.equal(readyLabel({ leader: true, tier_id: 'bronze', members: members(false) }), 'Buscar partida');
  assert.equal(readyLabel({ leader: false, tier_id: 'bronze', members: members(false) }), 'Estoy listo');
  assert.equal(readyLabel({ leader: false, tier_id: 'bronze', members: members(true) }), 'Cancelar «Listo»');
});

// en CI no hay Postgres: comprobamos en el texto del SQL las reglas clave
const sql = readFileSync(new URL('../supabase/migrations/20261103150000_matchmaking_parties.sql', import.meta.url), 'utf8');

test('un torneo ya no espera a llenar la mesa para cerrarse', () => {
  const settle = sql.slice(sql.indexOf('function public._settle_tournament'), sql.indexOf('function public._tournament_live'));
  assert.doesNotMatch(settle, /v_n < v_t\.seats and now\(\) < v_t\.closes_at/);
});

test('el matchmaking se serializa por mesa y solo usa torneos vivos', () => {
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('matchmaking:' \|\| p_tier/);
  assert.match(sql, /and public\._tournament_live\(t\.id\)/);
});

test('las funciones de grupo son solo para usuarios con sesión', () => {
  for (const fn of ['my_party()', 'party_invite(text)', 'party_respond(uuid, boolean)', 'party_leave()', 'party_set_tier(text)', 'party_ready(boolean)']) {
    assert.ok(sql.includes(`public.${fn}`), fn);
  }
  assert.match(sql, /revoke all on function public\._are_friends\(uuid, uuid\), public\._party_leave\(uuid\), public\._party_queue\(uuid\)\s+from public, anon, authenticated/);
});
