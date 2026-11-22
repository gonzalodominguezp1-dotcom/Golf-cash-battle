#!/usr/bin/env bash
# Reproduce GCB-009 (doble inscripción concurrente). Requiere una BD con stub_baseline.sql + migraciones aplicadas.
# Uso: PSQL="psql -h <socket> -p <port> -U postgres -d <db>" bash race_join.sh
# NOTA: pg_sleep(2) ensancha artificialmente la ventana para hacerla determinista.
U=$($PSQL -Atq -c "with u as (insert into auth.users (email, email_confirmed_at) values ('race@x.test', now()) returning id), p as (insert into public.profiles (id, username, kyc_status, birthdate) select id, 'race', 'verified', '1990-01-01' from u), w as (insert into public.wallets select id, 100 from u) select id from u;")
for n in 1 2; do ( $PSQL -Atq -c "begin; select set_config('request.jwt.claim.sub', '$U', true); select (public.join_tournament('silver', null))->>'id'; select pg_sleep(2); commit;" ) & done; wait
$PSQL -c "select count(*) entries, count(distinct tournament_id) tournaments from public.tournament_entries;" -c "select balance from public.wallets;"
