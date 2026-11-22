-- Escenarios sobre las migraciones de partidas en vivo (5a05874). Requiere stub_baseline.sql + las 23 migraciones.
-- A) Redondeo: 7 jugadores en Bronce, 4 empatan en cabeza con el mismo desempate.
-- B) Descalificación por tick declarado: 'cheat' (3+3+3) frente a 'honest' (2+3+3) en Oro.
-- C) Latido: 'quick' termina; 'slow' juega 1 hoyo y su último latido fue hace 50 s -> el estado de 'quick' liquida.
create or replace function pg_temp.mkuser(nm text) returns uuid language plpgsql as $$
declare u uuid; begin
  insert into auth.users (email, email_confirmed_at) values (nm||'@x.test', now()) returning id into u;
  insert into public.profiles (id, username, kyc_status, birthdate) values (u, nm, 'verified', '1990-01-01');
  insert into public.wallets values (u, 100); return u; end $$;
create or replace function pg_temp.play(u uuid, t uuid, s int[], tb numeric, ticks int[]) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform public.start_round(t);
  for i in 1..array_length(s,1) loop
    perform public._record_timed_hole(u, t, i-1, '[]', s[i], 0, ticks[i], false);
  end loop;
  if tb is not null then perform public._record_timed_hole(u, t, array_length(s,1), '[]', 1, tb, null, false); end if;
end $$;
-- A
do $$ declare u uuid; t uuid; i int; begin
  for i in 1..7 loop
    u := pg_temp.mkuser('a'||i);
    perform set_config('request.jwt.claim.sub', u::text, true);
    t := (public.join_tournament('bronze', null)->>'id')::uuid;
  end loop;
  update public.tournaments set starts_at = now() - interval '1 second' where id = t;
  for u in select user_id from public.tournament_entries where tournament_id = t order by seat loop
    if (select username from public.profiles where id = u) in ('a1','a2','a3','a4')
      then perform pg_temp.play(u, t, array[2,2,2], 0.5, array[500,500,500]);
      else perform pg_temp.play(u, t, array[3,3,3], 0.9, array[500,500,500]); end if;
  end loop;
  perform public._settle_tournament(t);
end $$;
select 'A' esc, status, pot, commission, prize, (select sum(payout) from public.tournament_entries e where e.tournament_id = t.id) sum_payouts
  from public.tournaments t where tier_id = 'bronze';
-- B
do $$ declare a uuid; b uuid; t uuid; begin
  a := pg_temp.mkuser('cheat'); b := pg_temp.mkuser('honest');
  perform set_config('request.jwt.claim.sub', a::text, true); t := (public.join_tournament('gold', null)->>'id')::uuid;
  perform set_config('request.jwt.claim.sub', b::text, true); perform public.join_tournament('gold', null);
  update public.tournaments set starts_at = now() - interval '1 second' where id = t;
  perform pg_temp.play(a, t, array[3,3,3], 1.0, array[120,500,500]);
  perform pg_temp.play(b, t, array[2,3,3], 1.0, array[2700,500,500]);
  perform public._settle_tournament(t);
end $$;
select 'B' esc, e.name, e.scores, e.total, e.position, e.payout from public.tournament_entries e join public.tournaments t on t.id = e.tournament_id where t.tier_id = 'gold' order by position;
-- C
do $$ declare q uuid; s uuid; t uuid; begin
  q := pg_temp.mkuser('quick'); s := pg_temp.mkuser('slow');
  perform set_config('request.jwt.claim.sub', q::text, true); t := (public.join_tournament('silver', null)->>'id')::uuid;
  perform set_config('request.jwt.claim.sub', s::text, true); perform public.join_tournament('silver', null);
  update public.tournaments set starts_at = now() - interval '1 second' where id = t;
  perform pg_temp.play(q, t, array[4,4,4], 1.0, array[500,500,500]);
  perform pg_temp.play(s, t, array[2], null, array[500]);
  update public.tournament_entries set last_seen = now() - interval '50 seconds' where user_id = s;
  perform set_config('request.jwt.claim.sub', q::text, true);
  perform public.tournament_status(t);
end $$;
select 'C' esc, t.status, e.name, e.scores, e.total, e.position, e.payout from public.tournament_entries e join public.tournaments t on t.id = e.tournament_id where t.tier_id = 'silver' order by position;
