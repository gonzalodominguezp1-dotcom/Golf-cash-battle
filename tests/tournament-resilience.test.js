import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { rpcError, errorRef } from '../src/backend/rpcError.js';

// Caso real: join_tournament devolvía 409 (23505) y el jugador solo veía «Ups».
const UNIQUE = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "tournament_entries_tournament_id_seat_key"',
  details: 'Key (tournament_id, seat)=(fac09025, -1) already exists.',
};

test('rpcError: un raise exception propio sigue dando su código', () => {
  const e = rpcError({ message: 'insufficient_funds', code: 'P0001' });
  assert.equal(e.code, 'insufficient_funds');
  assert.equal(errorRef(e), '');
});

test('rpcError: un error de Postgres queda como unknown pero conserva el motivo', () => {
  const e = rpcError(UNIQUE);
  assert.equal(e.code, 'unknown');
  assert.equal(e.sqlState, '23505');
  assert.match(e.detail, /tournament_entries_tournament_id_seat_key/);
  assert.match(e.detail, /already exists/);
});

test('errorRef: referencia corta para la pantalla de error, solo si es inesperado', () => {
  const ref = errorRef(rpcError(UNIQUE));
  assert.match(ref, /^ \(23505 /);
  assert.ok(ref.length <= 150);
  assert.equal(errorRef(null), '');
  assert.equal(errorRef(rpcError({})), '');
});

test('rpcError: sin error o sin mensaje no revienta', () => {
  assert.equal(rpcError(undefined).code, 'unknown');
  assert.equal(rpcError({}).detail, null);
});

// --- migraciones: las dos protecciones que evitan que un torneo roto bloquee las entradas ---
const dir = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const sql = (f) => readFileSync(new URL(f, dir), 'utf8');

function lastDefinition(name) {
  const re = new RegExp(`create or replace function public\\.${name}\\(`, 'i');
  const f = files.filter((x) => re.test(sql(x))).at(-1);
  const text = sql(f);
  const start = text.search(re);
  const end = text.indexOf('end $$;', start);
  return { file: f, body: text.slice(start, end) };
}

test('_settle_due: la última definición aísla cada torneo (un fallo no bloquea las entradas)', () => {
  const { file, body } = lastDefinition('_settle_due');
  assert.match(body, /exception\s+when others/i, `${file} debe capturar el error de cada torneo`);
  assert.match(body, /_settle_tournament\(v\)/);
});

test('asientos: unique (tournament_id, seat) ya no cuenta a quien salió', () => {
  const all = files.map(sql).join('\n');
  assert.match(all, /drop constraint if exists tournament_entries_tournament_id_seat_key/i);
  assert.match(all, /create unique index[^;]*\(tournament_id, seat\)\s*where left_at is null/i);
});
