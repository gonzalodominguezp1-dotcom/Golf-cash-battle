-- Contador de 20 s: cuando el primero emboca un hoyo, los demás tienen
-- hole_time_limit segundos para embocar o quedan descalificados en ese hoyo
-- (se apunta el máximo de golpes).
--
-- En torneos asíncronos "el primero" es el más rápido del hoyo: submit-hole
-- guarda el paso de física en el que entró cada bola (sunk_tick, 120 por
-- segundo desde que empieza el hoyo) y al repartir se descalifica a quien
-- embocó más de 20 s después del más rápido. Quien se queda sin tiempo
-- jugando (el cliente ya conoce el mejor tiempo por first_ticks) llega ya
-- descalificado (dq).
--
-- _record_timed_hole sustituye a _record_hole (que se deja para no romper la
-- función desplegada mientras se actualiza).

insert into public.app_config (key, value) values ('hole_time_limit', '20')
on conflict (key) do nothing;

alter table public.tournament_holes
  add column if not exists sunk_tick int,
  add column if not exists dq boolean not null default false;

create or replace function public._tournament_json(p_t uuid, p_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', t.id, 'tier_id', t.tier_id, 'status', t.status, 'courses', to_jsonb(t.courses),
    'entry_fee', t.entry_fee, 'seats', t.seats, 'closes_at', t.closes_at,
    'pot', t.pot, 'commission', t.commission, 'prize', t.prize,
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
  select count(*) into v_n from public.tournament_entries where tournament_id = p_t and left_at is null;
  if v_n < v_t.seats and now() < v_t.closes_at then return false; end if;
  if exists (select 1 from public.tournament_entries
             where tournament_id = p_t and left_at is null and finished_at is null and now() < deadline) then
    return false;
  end if;

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

  -- quien no terminó a tiempo se lleva el máximo en los hoyos que le faltan
  update public.tournament_entries
    set scores = scores || array_fill(v_max, array[v_holes - coalesce(array_length(scores, 1), 0)]),
        total = total + v_max * (v_holes - coalesce(array_length(scores, 1), 0)),
        finished_at = now()
    where tournament_id = p_t and left_at is null and finished_at is null;

  select name into v_tier from public.tiers where id = v_t.tier_id;

  if v_n < 2 then
    -- nadie contra quien jugar: se devuelve la entrada
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

create or replace function public._record_timed_hole(
  p_user uuid, p_t uuid, p_hole int, p_shots jsonb, p_strokes int, p_distance numeric, p_sunk_tick int, p_dq boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_t public.tournaments;
  v_e public.tournament_entries;
  v_holes int;
  v_played int;
begin
  select * into v_t from public.tournaments where id = p_t for update;
  if not found then raise exception 'match_not_found'; end if;
  if v_t.status <> 'open' then raise exception 'match_closed'; end if;
  select * into v_e from public.tournament_entries where tournament_id = p_t and user_id = p_user for update;
  if not found or v_e.left_at is not null then raise exception 'match_not_found'; end if;
  if v_e.finished_at is not null then raise exception 'match_closed'; end if;
  if v_e.started_at is null then raise exception 'not_started'; end if;
  -- un poco de margen por si el último golpe llega justo
  if now() > v_e.deadline + interval '2 minutes' then raise exception 'time_up'; end if;
  v_holes := array_length(v_t.courses, 1);
  v_played := coalesce(array_length(v_e.scores, 1), 0);
  -- los hoyos van en orden; con todos jugados, el siguiente es el desempate
  if p_hole <> v_played then raise exception 'wrong_hole'; end if;

  insert into public.tournament_holes (entry_id, hole, shots, strokes, distance, sunk_tick, dq)
    values (v_e.id, p_hole, p_shots, p_strokes, p_distance, p_sunk_tick, p_dq);
  if p_hole < v_holes then
    update public.tournament_entries set scores = scores || p_strokes, total = total + p_strokes where id = v_e.id;
  else
    update public.tournament_entries set tiebreak = round(p_distance, 4), finished_at = now() where id = v_e.id;
  end if;
  perform public._settle_tournament(p_t);
  return public._tournament_json(p_t, p_user);
end $$;

revoke all on function public._record_timed_hole(uuid, uuid, int, jsonb, int, numeric, int, boolean) from public, anon, authenticated;
grant execute on function public._record_timed_hole(uuid, uuid, int, jsonb, int, numeric, int, boolean) to service_role;
