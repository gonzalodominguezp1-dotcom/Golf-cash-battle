-- Revancha agrupada.
--
-- Quienes pulsan «Revancha» tras el torneo T entran juntos en el MISMO torneo
-- siguiente (rematch_of = T), con hoyos nuevos, y el matchmaking normal ya no
-- mete a desconocidos en él.

alter table public.tournaments
  add column if not exists rematch_of uuid references public.tournaments(id);
create index if not exists tournaments_rematch_open_idx
  on public.tournaments (rematch_of, created_at)
  where status = 'open' and rematch_of is not null;

-- Igual que la de 20261020170000_hole_timer.sql, con rematch_of.
create or replace function public._tournament_json(p_t uuid, p_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', t.id, 'tier_id', t.tier_id, 'status', t.status, 'courses', to_jsonb(t.courses),
    'entry_fee', t.entry_fee, 'seats', t.seats, 'closes_at', t.closes_at,
    'pot', t.pot, 'commission', t.commission, 'prize', t.prize,
    'rematch_of', t.rematch_of,
    'time_limit', coalesce((public._cfg('hole_time_limit'))::int, 20),
    -- paso en el que embocó el más rápido de cada hoyo: arranca el contador
    'first_ticks', (
      select coalesce(jsonb_agg((
        select min(th.sunk_tick) from public.tournament_holes th
        join public.tournament_entries x on x.id = th.entry_id
        where x.tournament_id = t.id and x.left_at is null and th.hole = h
      ) order by h), '[]'::jsonb)
      from generate_series(0, array_length(t.courses, 1) - 1) h
    ),
    'players', (
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'seat', e.seat, 'name', e.name, 'color', e.color,
        'is_me', e.user_id = p_uid,
        'holes_played', coalesce(array_length(e.scores, 1), 0),
        'finished', e.finished_at is not null,
        'scores', case when v.reveal or e.user_id = p_uid then to_jsonb(e.scores) end,
        'total', case when v.reveal or e.user_id = p_uid then e.total end,
        'tiebreak', case when v.reveal or e.user_id = p_uid then e.tiebreak end,
        'position', e.position, 'payout', e.payout
      ) order by e.seat)
      from public.tournament_entries e where e.tournament_id = t.id and e.left_at is null
    )
  )
  from public.tournaments t
  cross join lateral (
    select t.status <> 'open' or exists (
      select 1 from public.tournament_entries m
      where m.tournament_id = t.id and m.user_id = p_uid and m.finished_at is not null
    ) as reveal
  ) v
  where t.id = p_t
$$;

-- Parte de la versión de 20261019100000_async_tournaments.sql (la única
-- definición hasta ahora; los bloqueos de pago/KYC/edad viven en el trigger
-- _check_paid_entry sobre tournament_entries, así que siguen aplicándose).
drop function if exists public.join_tournament(text);

create or replace function public.join_tournament(p_tier text, p_rematch uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_tier public.tiers;
  v_seats int := (public._cfg('players_per_match'))::int;
  v_t uuid;
  v_seat int;
  v_courses int[];
  v_name text;
  v_colors text[] := array['#ff4d4d','#4d8dff','#ffb020','#3ecf6e','#b46cff','#ff7ac6','#2ed3d3','#f2f2f2'];
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_tier from public.tiers where id = p_tier;
  if not found then raise exception 'unknown_tier'; end if;
  perform public._settle_due();
  if exists (select 1 from public.tournament_entries e join public.tournaments t on t.id = e.tournament_id
             where e.user_id = v_uid and t.status = 'open' and e.left_at is null
               and e.finished_at is null and now() < e.deadline) then
    raise exception 'active_match';
  end if;

  if p_rematch is not null then
    -- solo quien jugó ese torneo, y en la misma mesa
    if not exists (select 1 from public.tournament_entries e join public.tournaments t on t.id = e.tournament_id
                   where e.tournament_id = p_rematch and e.user_id = v_uid and t.tier_id = p_tier) then
      raise exception 'rematch_invalid';
    end if;
    -- los revanchistas del mismo torneo se serializan para no crear dos grupos
    perform pg_advisory_xact_lock(hashtextextended('rematch:' || p_rematch::text, 0));

    select t.id into v_t from public.tournaments t
      where t.rematch_of = p_rematch and t.tier_id = p_tier and t.status = 'open'
        and t.closes_at > now() + interval '1 minute'
        and (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.left_at is null) < t.seats
        and not exists (select 1 from public.tournament_entries e where e.tournament_id = t.id and e.user_id = v_uid)
      order by t.created_at
      limit 1
      for update;
  else
    -- el torneo abierto más antiguo de esa mesa con sitio y en el que no estés;
    -- los de revancha son solo para quienes la pidieron
    select t.id into v_t from public.tournaments t
      where t.tier_id = p_tier and t.status = 'open' and t.closes_at > now() + interval '1 minute'
        and t.rematch_of is null
        and (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.left_at is null) < t.seats
        and not exists (select 1 from public.tournament_entries e where e.tournament_id = t.id and e.user_id = v_uid)
      order by t.created_at
      limit 1
      for update skip locked;
  end if;

  if v_t is null then
    select array_agg(c order by c) into v_courses
      from (select c from generate_series(0, (public._cfg('course_count'))::int - 1) c
            order by random() limit (public._cfg('holes_per_match'))::int) s;
    insert into public.tournaments (tier_id, entry_fee, courses, seats, closes_at, rematch_of)
      values (v_tier.id, v_tier.entry_fee, v_courses, v_seats,
              now() + make_interval(mins => (public._cfg('join_window_minutes'))::int),
              p_rematch)
      returning id into v_t;
  end if;

  select min(s) into v_seat from generate_series(0, v_seats - 1) s
    where not exists (select 1 from public.tournament_entries e where e.tournament_id = v_t and e.seat = s);
  v_name := coalesce((select username from public.profiles where id = v_uid), 'Jugador ' || upper(left(replace(v_uid::text, '-', ''), 4)));

  if v_tier.entry_fee > 0 then
    perform public._apply_tx(v_uid, 'entry', -v_tier.entry_fee, 'Entrada ' || v_tier.name, null);
  end if;
  insert into public.tournament_entries (tournament_id, user_id, seat, name, color, deadline)
    values (v_t, v_uid, v_seat, v_name, v_colors[v_seat + 1],
            now() + make_interval(mins => (public._cfg('play_minutes'))::int));
  return public._tournament_json(v_t, v_uid);
end $$;

revoke all on function public.join_tournament(text, uuid) from public, anon;
grant execute on function public.join_tournament(text, uuid) to authenticated;
