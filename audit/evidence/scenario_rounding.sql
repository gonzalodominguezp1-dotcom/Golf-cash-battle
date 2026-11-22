-- 7 jugadores en Bronce (entrada 1), 4 empatan en cabeza con el mismo desempate.
do $$
declare i int; u uuid; t uuid; r jsonb;
begin
  for i in 1..7 loop
    insert into auth.users (id, email, email_confirmed_at) values (gen_random_uuid(), 'p'||i||'@x.test', now()) returning id into u;
    insert into public.profiles (id, username, kyc_status, birthdate) values (u, 'p'||i, 'verified', '1990-01-01');
    insert into public.wallets (user_id, balance) values (u, 100);
    perform set_config('request.jwt.claim.sub', u::text, true);
    r := public.join_tournament('bronze', null);
    t := (r->>'id')::uuid;
    perform public.start_round(t);
    if i <= 4 then
      perform public._record_timed_hole(u, t, 0, '[]', 2, 0, 100, false);
      perform public._record_timed_hole(u, t, 1, '[]', 2, 0, 100, false);
      perform public._record_timed_hole(u, t, 2, '[]', 2, 0, 100, false);
      perform public._record_timed_hole(u, t, 3, '[]', 1, 0.5, null, false);
    end if;
  end loop;
  update public.tournaments set closes_at = now() - interval '1 second';
  update public.tournament_entries set deadline = now() - interval '1 second';
  perform public._settle_tournament(t);
end $$;
select status, pot, commission, prize, (select sum(payout) from public.tournament_entries) as sum_payouts,
       (select string_agg(payout::text, ',' order by seat) from public.tournament_entries) as payouts
from public.tournaments;
select sum(amount) filter (where type='prize') as prizes_credited, sum(amount) filter (where type='entry') as entries_charged from public.transactions;
