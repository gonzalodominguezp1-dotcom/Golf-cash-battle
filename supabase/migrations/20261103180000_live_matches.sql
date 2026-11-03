-- Partidas en vivo.
--
-- Hasta ahora los torneos eran asíncronos: cada uno jugaba cuando quería y el
-- bote se repartía cuando terminaban todos. Si alguien entraba y cerraba la
-- app (o un amigo del grupo no pulsaba «Empezar»), los demás se quedaban
-- «esperando a los otros jugadores» hasta 20 minutos.
--
-- Ahora una mesa es una sala en vivo:
-- 1. Se espera live_fill_seconds a que entre gente (o a que se llene) y la
--    partida arranca sola para todos a la vez (starts_at). Después ya no entra
--    nadie. Los huecos libres los rellenan bots en el cliente; los bots no
--    están en la base de datos y nunca cobran: el bote es solo de los jugadores
--    reales (entrada x jugadores reales) y si solo hay uno se le devuelve.
-- 2. Cada cliente manda un latido (tournament_status) cada pocos segundos. Quien
--    lleva más de live_idle_seconds sin dar señales deja de bloquear el cierre:
--    se le apunta el máximo en lo que le falte (y si ni siquiera empezó, se le
--    devuelve la entrada y sale de la mesa).
-- 3. Se ven las puntuaciones de los demás en los hoyos que tú ya has jugado
--    (para el marcador entre hoyos); el desempate sigue oculto hasta el final.
--
-- Los golpes los sigue contando el servidor (submit-hole, sin cambios) y el
-- reparto es el mismo: menos golpes gana, desempate por distancia.

insert into public.app_config (key, value) values
  ('live_fill_seconds', '15'),
  ('live_idle_seconds', '45')
on conflict (key) do nothing;

alter table public.tournaments add column if not exists starts_at timestamptz;
alter table public.tournament_entries add column if not exists last_seen timestamptz not null default now();

-- ¿Este jugador puede todavía terminar? (no se ha ido, no ha acabado, sigue a
-- tiempo y ha dado señales hace poco)
create or replace function public._entry_pending(e public.tournament_entries)
returns boolean language sql stable security definer set search_path = '' as $$
  select e.left_at is null and e.finished_at is null and now() < e.deadline
    and e.last_seen > now() - make_interval(secs => coalesce((public._cfg('live_idle_seconds'))::int, 45))
$$;

-- ---------- cierre ----------

create or replace function public._settle_tournament(p_t uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_t public.tournaments;
  v_n int;
  v_holes int;
  v_max int := (public._cfg('max_strokes'))::int;
  v_best int;
  v_best_tb numeric;
  v_winners int;
  v_share numeric;
  v_tier text;
  v_lim int := coalesce((public._cfg('hole_time_limit'))::int, 20) * 120;
  v_first int;
  e record;
begin
  select * into v_t from public.tournaments where id = p_t for update;
  if not found or v_t.status <> 'open' then return false; end if;
  -- la sala aún está llenándose
  if v_t.starts_at is not null and now() < v_t.starts_at then return false; end if;
  -- se cierra cuando no queda nadie que pueda terminar
  if exists (select 1 from public.tournament_entries pe where pe.tournament_id = p_t and public._entry_pending(pe)) then
    return false;
  end if;

  select name into v_tier from public.tiers where id = v_t.tier_id;

  -- quien entró pero nunca empezó a jugar (cerró la app en la sala): fuera y se le devuelve
  for e in select * from public.tournament_entries
           where tournament_id = p_t and left_at is null and started_at is null and finished_at is null loop
    update public.tournament_entries set left_at = now(), seat = -1 - seat where id = e.id;
    if v_t.entry_fee > 0 then
      perform public._apply_tx(e.user_id, 'refund', v_t.entry_fee, 'Devolución ' || v_tier || ': no llegaste a jugar', null);
    end if;
  end loop;

  select count(*) into v_n from public.tournament_entries where tournament_id = p_t and left_at is null;
  v_holes := array_length(v_t.courses, 1);

  -- contador: en cada hoyo, quien emboca más de hole_time_limit segundos
  -- después del más rápido queda descalificado y se apunta el máximo
  for h in 0 .. v_holes - 1 loop
    select min(th.sunk_tick) into v_first
      from public.tournament_holes th join public.tournament_entries x on x.id = th.entry_id
      where x.tournament_id = p_t and x.left_at is null and th.hole = h;
    if v_first is null then continue; end if;
    update public.tournament_holes th set strokes = v_max, dq = true
      from public.tournament_entries x
      where x.id = th.entry_id and x.tournament_id = p_t and x.left_at is null
        and th.hole = h and not th.dq and th.sunk_tick > v_first + v_lim;
    update public.tournament_entries x set scores[h + 1] = v_max
      from public.tournament_holes th
      where th.entry_id = x.id and th.hole = h and th.dq and x.tournament_id = p_t and x.left_at is null;
  end loop;
  update public.tournament_entries
    set total = (select coalesce(sum(s), 0) from unnest(scores) s)
    where tournament_id = p_t and left_at is null;

  -- quien no terminó (se quedó sin tiempo o se desconectó) se lleva el máximo en lo que le falte
  update public.tournament_entries
    set scores = scores || array_fill(v_max, array[v_holes - coalesce(array_length(scores, 1), 0)]),
        total = total + v_max * (v_holes - coalesce(array_length(scores, 1), 0)),
        finished_at = now()
    where tournament_id = p_t and left_at is null and finished_at is null;

  if v_n < 2 then
    -- nadie real contra quien jugar (solo bots o nadie): se devuelve la entrada
    for e in select * from public.tournament_entries where tournament_id = p_t and left_at is null loop
      if v_t.entry_fee > 0 then
        perform public._apply_tx(e.user_id, 'refund', v_t.entry_fee, 'Devolución ' || v_tier || ': no hubo rivales', null);
      end if;
      update public.tournament_entries set position = 1 where id = e.id;
    end loop;
    update public.tournaments set status = 'cancelled', settled_at = now() where id = p_t;
    return true;
  end if;

  update public.tournaments set
    pot = v_t.entry_fee * v_n,
    commission = round(v_t.entry_fee * v_n * (public._cfg('commission'))::numeric, 2)
    where id = p_t returning * into v_t;
  update public.tournaments set prize = pot - commission where id = p_t returning * into v_t;

  -- menos golpes gana; entre los empatados en cabeza, el desempate más cercano
  select min(total) into v_best from public.tournament_entries where tournament_id = p_t and left_at is null;
  select min(coalesce(tiebreak, 1e6)) into v_best_tb from public.tournament_entries
    where tournament_id = p_t and left_at is null and total = v_best;
  select count(*) into v_winners from public.tournament_entries
    where tournament_id = p_t and left_at is null and total = v_best and coalesce(tiebreak, 1e6) = v_best_tb;
  v_share := round(v_t.prize / v_winners, 2);

  update public.tournament_entries p set
    position = r.pos,
    payout = case when p.total = v_best and coalesce(p.tiebreak, 1e6) = v_best_tb then v_share else 0 end
  from (
    select id, rank() over (order by total, case when total = v_best then coalesce(tiebreak, 1e6) else 0 end) pos
    from public.tournament_entries where tournament_id = p_t and left_at is null
  ) r
  where r.id = p.id;

  for e in select * from public.tournament_entries where tournament_id = p_t and payout > 0 loop
    perform public._apply_tx(e.user_id, 'prize', e.payout, 'Premio ' || v_tier, null);
  end loop;
  update public.tournaments set status = 'settled', settled_at = now() where id = p_t;
  return true;
end $$;

-- Hay alguien en el torneo que todavía puede terminar.
create or replace function public._tournament_live(p_t uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tournament_entries e
                 where e.tournament_id = p_t and public._entry_pending(e))
$$;

create or replace function public._settle_due()
returns void language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  for v in
    select t.id from public.tournaments t
    where t.status = 'open' and (t.starts_at is null or t.starts_at <= now())
      and not public._tournament_live(t.id)
    order by t.created_at limit 20
    for update skip locked
  loop
    perform public._settle_tournament(v);
  end loop;
end $$;

-- Tiene una partida de pago a medias de la que sigue pendiente (si se fue de la
-- app hace rato, puede entrar en otra; la vieja se le cierra con el máximo).
create or replace function public._in_active_match(p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tournament_entries e join public.tournaments t on t.id = e.tournament_id
                 where e.user_id = p_uid and t.status = 'open' and public._entry_pending(e))
$$;

-- ---------- salas ----------

create or replace function public._new_tournament(p_tier text, p_rematch uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tier public.tiers;
  v_courses int[];
  v_t uuid;
  v_start timestamptz := now() + make_interval(secs => coalesce((public._cfg('live_fill_seconds'))::int, 15));
begin
  select * into v_tier from public.tiers where id = p_tier;
  select array_agg(c order by c) into v_courses
    from (select c from generate_series(0, (public._cfg('course_count'))::int - 1) c
          order by random() limit (public._cfg('holes_per_match'))::int) s;
  insert into public.tournaments (tier_id, entry_fee, courses, seats, closes_at, starts_at, rematch_of)
    values (v_tier.id, v_tier.entry_fee, v_courses, (public._cfg('players_per_match'))::int, v_start, v_start, p_rematch)
    returning id into v_t;
  return v_t;
end $$;

-- Sienta a p_uid en el torneo p_t y cobra la entrada. Con la mesa llena, arranca ya.
create or replace function public._enter_tournament(p_t uuid, p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_t public.tournaments;
  v_seat int;
  v_name text;
  v_colors text[] := array['#ff4d4d','#4d8dff','#ffb020','#3ecf6e','#b46cff','#ff7ac6','#2ed3d3','#f2f2f2'];
begin
  select * into v_t from public.tournaments where id = p_t;
  select min(s) into v_seat from generate_series(0, v_t.seats - 1) s
    where not exists (select 1 from public.tournament_entries e where e.tournament_id = p_t and e.seat = s);
  if v_seat is null then raise exception 'match_full'; end if;
  v_name := coalesce((select username from public.profiles where id = p_uid), 'Jugador ' || upper(left(replace(p_uid::text, '-', ''), 4)));
  if v_t.entry_fee > 0 then
    perform public._apply_tx(p_uid, 'entry', -v_t.entry_fee, 'Entrada ' || (select name from public.tiers where id = v_t.tier_id), null);
  end if;
  insert into public.tournament_entries (tournament_id, user_id, seat, name, color, deadline)
    values (p_t, p_uid, v_seat, v_name, v_colors[v_seat + 1],
            greatest(now(), coalesce(v_t.starts_at, now())) + make_interval(mins => (public._cfg('play_minutes'))::int));
  if (select count(*) from public.tournament_entries e where e.tournament_id = p_t and e.left_at is null) >= v_t.seats then
    update public.tournaments set starts_at = least(starts_at, now() + interval '3 seconds'),
                                  closes_at = least(closes_at, now() + interval '3 seconds')
      where id = p_t;
  end if;
end $$;

-- Sala de la mesa que aún no ha empezado y donde caben p_need jugadores más.
create or replace function public._find_tournament(p_tier text, p_need int, p_users uuid[])
returns uuid language sql security definer set search_path = '' as $$
  select t.id from public.tournaments t
  where t.tier_id = p_tier and t.status = 'open' and t.rematch_of is null
    and t.starts_at is not null and t.closes_at > now() + interval '3 seconds'
    and (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.left_at is null) + p_need <= t.seats
    and not exists (select 1 from public.tournament_entries e where e.tournament_id = t.id and e.user_id = any (p_users))
  order by t.created_at
  limit 1
  for update
$$;

create or replace function public.join_tournament(p_tier text, p_rematch uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_t uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.tiers where id = p_tier) then raise exception 'unknown_tier'; end if;
  perform public._settle_due();
  if public._in_active_match(v_uid) then raise exception 'active_match'; end if;

  if p_rematch is not null then
    if not exists (select 1 from public.tournament_entries e join public.tournaments t on t.id = e.tournament_id
                   where e.tournament_id = p_rematch and e.user_id = v_uid and t.tier_id = p_tier) then
      raise exception 'rematch_invalid';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('rematch:' || p_rematch::text, 0));
    select t.id into v_t from public.tournaments t
      where t.rematch_of = p_rematch and t.tier_id = p_tier and t.status = 'open'
        and t.starts_at is not null and t.closes_at > now() + interval '3 seconds'
        and (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.left_at is null) < t.seats
        and not exists (select 1 from public.tournament_entries e where e.tournament_id = t.id and e.user_id = v_uid)
      order by t.created_at
      limit 1
      for update;
  else
    perform pg_advisory_xact_lock(hashtextextended('matchmaking:' || p_tier, 0));
    v_t := public._find_tournament(p_tier, 1, array[v_uid]);
  end if;

  if v_t is null then v_t := public._new_tournament(p_tier, p_rematch); end if;
  perform public._enter_tournament(v_t, v_uid);
  return public._tournament_json(v_t, v_uid);
end $$;

-- ---------- estado ----------

create or replace function public._tournament_json(p_t uuid, p_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', t.id, 'tier_id', t.tier_id, 'status', t.status, 'courses', to_jsonb(t.courses),
    'entry_fee', t.entry_fee, 'seats', t.seats, 'closes_at', t.closes_at,
    'starts_at', t.starts_at, 'server_now', now(),
    'pot', t.pot, 'commission', t.commission, 'prize', t.prize,
    'rematch_of', t.rematch_of,
    'time_limit', coalesce((public._cfg('hole_time_limit'))::int, 20),
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
        'started', e.started_at is not null,
        'finished', e.finished_at is not null,
        'online', public._entry_pending(e) or e.finished_at is not null,
        -- de los demás solo se ven los hoyos que tú ya has jugado
        'scores', case when v.reveal or e.user_id = p_uid then to_jsonb(e.scores)
                       else to_jsonb(e.scores[1:v.played]) end,
        'total', case when v.reveal or e.user_id = p_uid then e.total
                      else (select coalesce(sum(s), 0) from unnest(e.scores[1:v.played]) s) end,
        'tiebreak', case when v.reveal or e.user_id = p_uid then e.tiebreak end,
        'position', e.position, 'payout', e.payout
      ) order by e.seat)
      from public.tournament_entries e where e.tournament_id = t.id and e.left_at is null
    )
  )
  from public.tournaments t
  cross join lateral (
    select t.status <> 'open' or coalesce(m.finished_at is not null, false) as reveal,
           coalesce(array_length(m.scores, 1), 0) as played
    from (select 1) one
    left join public.tournament_entries m on m.tournament_id = t.id and m.user_id = p_uid
  ) v
  where t.id = p_t
$$;

-- Estado de la partida y latido: mientras lo llames sigues contando como conectado.
create or replace function public.tournament_status(p_t uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  update public.tournament_entries set last_seen = now()
    where tournament_id = p_t and user_id = v_uid and left_at is null;
  if not found then raise exception 'match_not_found'; end if;
  perform public._settle_tournament(p_t);
  return public._tournament_json(p_t, v_uid);
end $$;

-- Empieza a jugar (la partida arranca a la vez para todos en starts_at).
create or replace function public.start_round(p_t uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  update public.tournament_entries set started_at = coalesce(started_at, now()), last_seen = now()
    where tournament_id = p_t and user_id = v_uid and left_at is null;
  if not found then raise exception 'match_not_found'; end if;
  return public._tournament_json(p_t, v_uid);
end $$;

revoke all on function public._entry_pending(public.tournament_entries), public._tournament_live(uuid),
  public._in_active_match(uuid), public._new_tournament(text, uuid), public._enter_tournament(uuid, uuid),
  public._find_tournament(text, int, uuid[]), public._settle_tournament(uuid), public._settle_due(),
  public._tournament_json(uuid, uuid) from public, anon, authenticated;
revoke all on function public.join_tournament(text, uuid), public.tournament_status(uuid), public.start_round(uuid) from public, anon;
grant execute on function public.join_tournament(text, uuid), public.tournament_status(uuid), public.start_round(uuid) to authenticated;
