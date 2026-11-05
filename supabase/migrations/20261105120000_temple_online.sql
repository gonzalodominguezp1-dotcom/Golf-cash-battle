-- El Templo de la Selva entra en las partidas online (course_count 16).
--
-- Es un hoyo largo (par 10) con su propio máximo de 20 golpes. Hasta ahora el
-- servidor ponía siempre max_strokes (8) a quien llegaba tarde o no acababa,
-- y en un par 10 eso era un premio. Ahora cada hoyo usa su máximo:
-- course_max_strokes guarda los hoyos que tienen uno distinto (índice -> golpes;
-- los mismos que maxStrokes en src/game/courses.js) y el resto usa max_strokes.

insert into public.app_config (key, value) values ('course_max_strokes', '{"15": 20, "16": 12}')
on conflict (key) do update set value = excluded.value;

-- máximo de golpes del hoyo p_course
create or replace function public._course_max(p_course int)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((public._cfg('course_max_strokes') ->> p_course::text)::int, (public._cfg('max_strokes'))::int)
$$;

-- el máximo de cada hoyo que falta por jugar, desde el hoyo p_from (0 = el primero)
create or replace function public._max_tail(p_courses int[], p_from int)
returns int[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(public._course_max(p_courses[i]) order by i), '{}')
  from generate_series(p_from + 1, coalesce(array_length(p_courses, 1), 0)) i
$$;

revoke all on function public._course_max(int), public._max_tail(int[], int) from public, anon, authenticated;

create or replace function public._settle_tournament(p_t uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_t public.tournaments;
  v_n int;
  v_holes int;
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
    update public.tournament_holes th set strokes = public._course_max(v_t.courses[h + 1]), dq = true
      from public.tournament_entries x
      where x.id = th.entry_id and x.tournament_id = p_t and x.left_at is null
        and th.hole = h and not th.dq and th.sunk_tick > v_first + v_lim;
    update public.tournament_entries x set scores[h + 1] = public._course_max(v_t.courses[h + 1])
      from public.tournament_holes th
      where th.entry_id = x.id and th.hole = h and th.dq and x.tournament_id = p_t and x.left_at is null;
  end loop;
  update public.tournament_entries
    set total = (select coalesce(sum(s), 0) from unnest(scores) s)
    where tournament_id = p_t and left_at is null;

  -- quien no terminó (se quedó sin tiempo o se desconectó) se lleva el máximo en lo que le falte
  update public.tournament_entries
    set scores = scores || public._max_tail(v_t.courses, coalesce(array_length(scores, 1), 0)),
        total = total + (select coalesce(sum(s), 0) from unnest(public._max_tail(v_t.courses, coalesce(array_length(scores, 1), 0))) s),
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

create or replace function public.leave_tournament(p_t uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_e public.tournament_entries;
  v_t public.tournaments;
begin
  select * into v_t from public.tournaments where id = p_t for update;
  select * into v_e from public.tournament_entries where tournament_id = p_t and user_id = v_uid for update;
  if not found then raise exception 'match_not_found'; end if;
  if v_t.status <> 'open' or v_e.left_at is not null or v_e.finished_at is not null then
    return public._tournament_json(p_t, v_uid);
  end if;
  if v_e.started_at is null then
    update public.tournament_entries set left_at = now(), seat = -1 - seat where id = v_e.id;
    if v_t.entry_fee > 0 then
      perform public._apply_tx(v_uid, 'refund', v_t.entry_fee, 'Devolución de entrada', null);
    end if;
  else
    update public.tournament_entries
      set scores = scores || public._max_tail(v_t.courses, coalesce(array_length(v_e.scores, 1), 0)),
          total = total + (select coalesce(sum(s), 0) from unnest(public._max_tail(v_t.courses, coalesce(array_length(v_e.scores, 1), 0))) s),
          finished_at = now()
      where id = v_e.id;
  end if;
  perform public._settle_tournament(p_t);
  return public._tournament_json(p_t, v_uid);
end $$;

update public.app_config set value = '16' where key = 'course_count';
