-- A declara ticks mínimos (emboca en el tick 120 = 1 s). B, honesto, emboca en 2 golpes en el tick 2700 (22,5 s).
do $$
declare a uuid; b uuid; t uuid; u uuid; nm text;
begin
  foreach nm in array array['cheat','honest'] loop
    insert into auth.users (email, email_confirmed_at) values (nm||'@x.test', now()) returning id into u;
    insert into public.profiles (id, username, kyc_status, birthdate) values (u, nm, 'verified', '1990-01-01');
    insert into public.wallets values (u, 100);
    perform set_config('request.jwt.claim.sub', u::text, true);
    t := (public.join_tournament('gold', null)->>'id')::uuid;
    perform public.start_round(t);
    if nm = 'cheat' then a := u; else b := u; end if;
  end loop;
  -- hoyo 0: A 3 golpes rápido, B 2 golpes lento; resto igual
  perform public._record_timed_hole(a, t, 0, '[]', 3, 0, 120, false);
  perform public._record_timed_hole(b, t, 0, '[]', 2, 0, 2700, false);
  perform public._record_timed_hole(a, t, 1, '[]', 3, 0, 500, false);
  perform public._record_timed_hole(b, t, 1, '[]', 3, 0, 500, false);
  perform public._record_timed_hole(a, t, 2, '[]', 3, 0, 500, false);
  perform public._record_timed_hole(b, t, 2, '[]', 3, 0, 500, false);
  perform public._record_timed_hole(a, t, 3, '[]', 1, 1.0, null, false);
  perform public._record_timed_hole(b, t, 3, '[]', 1, 1.0, null, false);
  update public.tournaments set closes_at = now() - interval '1 second';
  perform public._settle_tournament(t);
end $$;
select e.name, e.scores, e.total, e.position, e.payout from public.tournament_entries e order by position;
