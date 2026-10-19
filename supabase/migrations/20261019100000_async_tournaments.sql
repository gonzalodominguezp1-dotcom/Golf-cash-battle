-- Torneos asíncronos de 8 jugadores reales.
--
-- Cada jugador entra en el torneo abierto de su mesa (o se crea uno nuevo) y
-- juega los mismos hoyos a su ritmo. Los golpes no los manda el cliente: la
-- función submit-hole repite los tiros con la física y llama a _record_hole.
-- El torneo se reparte cuando han terminado todos los inscritos y la mesa está
-- llena o se ha cerrado la inscripción.

insert into public.app_config (key, value) values
  ('join_window_minutes', '15'),
  ('play_minutes', '20')
on conflict (key) do nothing;

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  tier_id text not null references public.tiers(id),
  entry_fee numeric not null,
  courses int[] not null,
  seats int not null,
  status text not null default 'open' check (status in ('open', 'settled', 'cancelled')),
  created_at timestamptz not null default now(),
  closes_at timestamptz not null,
  pot numeric not null default 0,
  commission numeric not null default 0,
  prize numeric not null default 0,
  settled_at timestamptz
);
create index tournaments_open_idx on public.tournaments (tier_id, created_at) where status = 'open';

create table public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id),
  user_id uuid not null references auth.users(id),
  seat int not null,
  name text not null,
  color text not null,
  joined_at timestamptz not null default now(),
  deadline timestamptz not null,
  started_at timestamptz,
  left_at timestamptz,
  finished_at timestamptz,
  scores int[] not null default '{}',
  total int not null default 0,
  tiebreak numeric,
  position int,
  payout numeric not null default 0,
  unique (tournament_id, user_id),
  unique (tournament_id, seat)
);
create index tournament_entries_user_idx on public.tournament_entries (user_id, joined_at desc);

-- golpes de cada hoyo tal como se jugaron; hole = número de hoyos es el desempate
create table public.tournament_holes (
  entry_id uuid not null references public.tournament_entries(id),
  hole int not null,
  shots jsonb not null,
  strokes int not null,
  distance numeric,
  created_at timestamptz not null default now(),
  primary key (entry_id, hole)
);

alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.tournament_holes enable row level security;
-- solo lectura de lo propio; todo lo demás pasa por las funciones
create policy "own entries" on public.tournament_entries for select using (user_id = (select auth.uid()));

-- Estado del torneo visto por p_uid. Las puntuaciones de los demás solo se ven
-- cuando has terminado tu ronda (o el torneo está cerrado): así nadie juega
-- sabiendo qué tiene que batir.
create or replace function public._tournament_json(p_t uuid, p_uid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', t.id, 'tier_id', t.tier_id, 'status', t.status, 'courses', to_jsonb(t.courses),
    'entry_fee', t.entry_fee, 'seats', t.seats, 'closes_at', t.closes_at,
    'pot', t.pot, 'commission', t.commission, 'prize', t.prize,
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

-- Cierra el torneo si ya toca: reparte el bote o devuelve las entradas.
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

  -- quien no terminó a tiempo se lleva el máximo en los hoyos que le faltan
  v_holes := array_length(v_t.courses, 1);
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

-- Cierra los torneos que ya tocan (se llama desde las funciones de los jugadores).
create or replace function public._settle_due()
returns void language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  for v in
    select t.id from public.tournaments t
    where t.status = 'open' and (
      t.closes_at <= now()
      or (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.left_at is null) >= t.seats
    )
    order by t.created_at limit 20
    for update skip locked
  loop
    perform public._settle_tournament(v);
  end loop;
end $$;

create or replace function public.join_tournament(p_tier text)
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

  -- el torneo abierto más antiguo de esa mesa con sitio y en el que no estés
  select t.id into v_t from public.tournaments t
    where t.tier_id = p_tier and t.status = 'open' and t.closes_at > now() + interval '1 minute'
      and (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.left_at is null) < t.seats
      and not exists (select 1 from public.tournament_entries e where e.tournament_id = t.id and e.user_id = v_uid)
    order by t.created_at
    limit 1
    for update skip locked;

  if v_t is null then
    select array_agg(c order by c) into v_courses
      from (select c from generate_series(0, (public._cfg('course_count'))::int - 1) c
            order by random() limit (public._cfg('holes_per_match'))::int) s;
    insert into public.tournaments (tier_id, entry_fee, courses, seats, closes_at)
      values (v_tier.id, v_tier.entry_fee, v_courses, v_seats,
              now() + make_interval(mins => (public._cfg('join_window_minutes'))::int))
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

-- Marca el inicio de la ronda: desde aquí ya no se devuelve la entrada.
create or replace function public.start_round(p_t uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  update public.tournament_entries set started_at = coalesce(started_at, now())
    where tournament_id = p_t and user_id = v_uid and left_at is null;
  if not found then raise exception 'match_not_found'; end if;
  return public._tournament_json(p_t, v_uid);
end $$;

-- Antes de empezar: se devuelve la entrada. Después: abandono, los hoyos que
-- falten cuentan con el máximo de golpes.
create or replace function public.leave_tournament(p_t uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_e public.tournament_entries;
  v_t public.tournaments;
  v_max int := (public._cfg('max_strokes'))::int;
  v_left int;
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
    v_left := array_length(v_t.courses, 1) - coalesce(array_length(v_e.scores, 1), 0);
    update public.tournament_entries
      set scores = scores || array_fill(v_max, array[v_left]), total = total + v_max * v_left, finished_at = now()
      where id = v_e.id;
  end if;
  perform public._settle_tournament(p_t);
  return public._tournament_json(p_t, v_uid);
end $$;

-- Solo la llama la función submit-hole, después de repetir los golpes.
create or replace function public._record_hole(p_user uuid, p_t uuid, p_hole int, p_shots jsonb, p_strokes int, p_distance numeric)
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

  insert into public.tournament_holes (entry_id, hole, shots, strokes, distance)
    values (v_e.id, p_hole, p_shots, p_strokes, p_distance);
  if p_hole < v_holes then
    update public.tournament_entries set scores = scores || p_strokes, total = total + p_strokes where id = v_e.id;
  else
    update public.tournament_entries set tiebreak = round(p_distance, 4), finished_at = now() where id = v_e.id;
  end if;
  perform public._settle_tournament(p_t);
  return public._tournament_json(p_t, p_user);
end $$;

-- Estado de un torneo en el que estás (y lo cierra si ya toca).
create or replace function public.tournament_status(p_t uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.tournament_entries where tournament_id = p_t and user_id = v_uid and left_at is null) then
    raise exception 'match_not_found';
  end if;
  perform public._settle_tournament(p_t);
  return public._tournament_json(p_t, v_uid);
end $$;

-- Tus últimos torneos, para ver resultados pendientes y premios.
create or replace function public.my_tournaments()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  perform public._settle_due();
  return coalesce((
    select jsonb_agg(public._tournament_json(e.tournament_id, v_uid) order by e.joined_at desc)
    from (select tournament_id, joined_at from public.tournament_entries
          where user_id = v_uid and left_at is null order by joined_at desc limit 10) e
  ), '[]'::jsonb);
end $$;

revoke all on function public._tournament_json(uuid, uuid), public._settle_tournament(uuid), public._settle_due(),
  public._record_hole(uuid, uuid, int, jsonb, int, numeric) from public, anon, authenticated;
grant execute on function public._record_hole(uuid, uuid, int, jsonb, int, numeric) to service_role;
revoke all on function public.join_tournament(text), public.start_round(uuid), public.leave_tournament(uuid),
  public.tournament_status(uuid), public.my_tournaments() from public, anon;
grant execute on function public.join_tournament(text), public.start_round(uuid), public.leave_tournament(uuid),
  public.tournament_status(uuid), public.my_tournaments() to authenticated;

-- Las partidas contra bots del prototipo aceptaban los golpes que mandaba el
-- cliente. Ya no se pueden jugar con dinero: solo práctica.
create or replace function public._legacy_free_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.entry_fee > 0 then raise exception 'use_tournaments'; end if;
  return new;
end $$;
create trigger matches_free_only before insert on public.matches
  for each row execute function public._legacy_free_only();
