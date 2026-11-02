-- Ranking de victorias (semanal, mensual, histórico) y marco de prestigio elegido.
--  * Las victorias salen SOLO de tournament_entries (mesas online ya liquidadas, position = 1):
--    el cliente no puede alterarlas. Semana lunes-domingo y mes natural, en UTC.
--  * Los hitos que dan bolas (top 10 / nº 1 de semana y mes, top 100 histórico) se conceden
--    aquí, al cerrar el periodo, de forma perezosa e idempotente: se evalúan al abrir el
--    ranking, sin pg_cron. Quedan en ranking_awards y no se retiran.
--  * El marco elegido va en profiles.frame y no en profiles.progress, porque save_progress
--    reconstruye progress desde cero y descartaría claves que no conoce.
-- Ids de marco: p25, p50, p75, p100, p125, p150 (los mismos que src/progress/prestige.js).
-- SQL no probado contra Postgres.

alter table public.profiles add column if not exists frame text;

create table if not exists public.ranking_awards (
  user_id uuid not null references auth.users(id),
  kind text not null check (kind in ('weekly_top10', 'weekly_first', 'monthly_top10', 'monthly_first', 'hist_top100')),
  period date not null,
  rank int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, period)
);

-- periodos ya repartidos: evita recalcular semanas y meses cerrados
create table if not exists public.ranking_closed (
  kind text not null check (kind in ('weekly', 'monthly')),
  period date not null,
  primary key (kind, period)
);

alter table public.ranking_awards enable row level security;
alter table public.ranking_closed enable row level security;

-- Nivel a partir de la XP: cada nivel cuesta 200 (XP_PER_LEVEL en src/progress/Progress.js).
create or replace function public._level_of_xp(p_xp numeric)
returns int language sql immutable set search_path = '' as $
  select 1 + floor(greatest(p_xp, 0) / 200)::int
$;

-- Marco que se luce: el elegido si ya se alcanzó, si no el más alto alcanzado, o null.
create or replace function public._frame_for(p_frame text, p_level int)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_frame ~ '^p(25|50|75|100|125|150)$' and substr(p_frame, 2)::int <= p_level then p_frame
    when p_level >= 25 then 'p' || least(150, (p_level / 25) * 25)::text
  end
$$;

-- Clasificación de victorias en [p_from, p_to). Nulos = sin límite (histórico).
-- Gana quien más victorias tiene; en empate, quien las alcanzó antes; luego el id para que
-- las posiciones sean únicas.
create or replace function public._ranking_rows(p_from timestamptz, p_to timestamptz)
returns table (uid uuid, wins bigint, last_win timestamptz, pos bigint)
language sql stable security definer set search_path = '' as $$
  select w.user_id, w.wins, w.last_win,
         row_number() over (order by w.wins desc, w.last_win asc, w.user_id)
  from (
    select e.user_id, count(*) as wins, max(t.settled_at) as last_win
    from public.tournament_entries e
    join public.tournaments t on t.id = e.tournament_id
    join public.profiles p on p.id = e.user_id and p.username is not null
    where t.status = 'settled' and e.position = 1 and e.left_at is null
      and (p_from is null or t.settled_at >= p_from)
      and (p_to is null or t.settled_at < p_to)
    group by e.user_id
  ) w
$$;

-- Reparte los hitos de las semanas y meses ya cerrados que falten.
create or replace function public._settle_ranking()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_first timestamp;
  v_week timestamp := date_trunc('week', now() at time zone 'utc');
  v_month timestamp := date_trunc('month', now() at time zone 'utc');
  d date;
begin
  select min(settled_at) at time zone 'utc' into v_first from public.tournaments where status = 'settled';
  if v_first is null then return; end if;

  for d in select g::date from generate_series(date_trunc('week', v_first), v_week - interval '7 days', interval '7 days') g loop
    if exists (select 1 from public.ranking_closed where kind = 'weekly' and period = d) then continue; end if;
    insert into public.ranking_awards (user_id, kind, period, rank)
      select uid, 'weekly_top10', d, pos from public._ranking_rows(d::timestamp at time zone 'utc', (d + 7)::timestamp at time zone 'utc') where pos <= 10
      on conflict do nothing;
    insert into public.ranking_awards (user_id, kind, period, rank)
      select uid, 'weekly_first', d, 1 from public._ranking_rows(d::timestamp at time zone 'utc', (d + 7)::timestamp at time zone 'utc') where pos = 1
      on conflict do nothing;
    insert into public.ranking_closed (kind, period) values ('weekly', d) on conflict do nothing;
  end loop;

  for d in select g::date from generate_series(date_trunc('month', v_first), v_month - interval '1 month', interval '1 month') g loop
    if exists (select 1 from public.ranking_closed where kind = 'monthly' and period = d) then continue; end if;
    insert into public.ranking_awards (user_id, kind, period, rank)
      select uid, 'monthly_top10', d, pos from public._ranking_rows(d::timestamp at time zone 'utc', (d + interval '1 month')::timestamp at time zone 'utc') where pos <= 10
      on conflict do nothing;
    insert into public.ranking_awards (user_id, kind, period, rank)
      select uid, 'monthly_first', d, 1 from public._ranking_rows(d::timestamp at time zone 'utc', (d + interval '1 month')::timestamp at time zone 'utc') where pos = 1
      on conflict do nothing;
    insert into public.ranking_closed (kind, period) values ('monthly', d) on conflict do nothing;
  end loop;
end $$;

-- Ranking de un periodo: top 50 con nivel y marco, y la posición del jugador aunque quede fuera.
-- p_period: 'weekly' | 'monthly' | 'historic'
create or replace function public.get_ranking(p_period text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_from timestamptz;
  v_to timestamptz;
  v_top jsonb;
  v_me jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_period not in ('weekly', 'monthly', 'historic') then raise exception 'bad_request'; end if;
  perform public._settle_ranking();

  if p_period = 'weekly' then
    v_from := date_trunc('week', now() at time zone 'utc') at time zone 'utc';
    v_to := v_from + interval '7 days';
  elsif p_period = 'monthly' then
    v_from := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
    v_to := (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'pos', r.pos, 'name', p.username, 'wins', r.wins,
           'level', public._level_of_xp(coalesce((p.progress ->> 'xp')::numeric, 0)),
           'frame', public._frame_for(p.frame, public._level_of_xp(coalesce((p.progress ->> 'xp')::numeric, 0))),
           'me', r.uid = v_uid) order by r.pos), '[]'::jsonb)
    into v_top
    from public._ranking_rows(v_from, v_to) r
    join public.profiles p on p.id = r.uid
    where r.pos <= 50;

  select jsonb_build_object('pos', r.pos, 'wins', r.wins)
    into v_me
    from public._ranking_rows(v_from, v_to) r where r.uid = v_uid;

  return jsonb_build_object('period', p_period, 'from', v_from, 'to', v_to, 'top', v_top, 'me', v_me);
end $$;

-- Hitos de ranking del jugador, su marco elegido y su posición actual en cada ranking.
-- Aquí se concede también el top 100 histórico (permanente una vez conseguido).
create or replace function public.my_ranking()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_pos bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public._settle_ranking();

  select pos into v_pos from public._ranking_rows(null, null) where uid = v_uid;
  if v_pos is not null and v_pos <= 100 then
    insert into public.ranking_awards (user_id, kind, period, rank)
      values (v_uid, 'hist_top100', date '1970-01-01', v_pos) on conflict do nothing;
  end if;

  return jsonb_build_object(
    'weeklyTop10', (select count(*) from public.ranking_awards where user_id = v_uid and kind = 'weekly_top10'),
    'weeklyFirst', (select count(*) from public.ranking_awards where user_id = v_uid and kind = 'weekly_first'),
    'monthlyTop10', (select count(*) from public.ranking_awards where user_id = v_uid and kind = 'monthly_top10'),
    'monthlyFirst', (select count(*) from public.ranking_awards where user_id = v_uid and kind = 'monthly_first'),
    'histTop100', (select count(*) from public.ranking_awards where user_id = v_uid and kind = 'hist_top100'),
    'frame', (select frame from public.profiles where id = v_uid)
  );
end $$;

-- Elige el marco que se luce (null = automático, el más alto). Solo uno ya alcanzado, según
-- la XP guardada en el servidor (save_progress limita cuánto puede subir por guardado).
create or replace function public.set_frame(p_frame text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_level int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select public._level_of_xp(coalesce((progress ->> 'xp')::numeric, 0)) into v_level from public.profiles where id = v_uid;
  if p_frame is not null and (p_frame !~ '^p(25|50|75|100|125|150)$' or substr(p_frame, 2)::int > coalesce(v_level, 1)) then
    raise exception 'bad_request';
  end if;
  update public.profiles set frame = p_frame, updated_at = now() where id = v_uid;
  return p_frame;
end $$;

revoke all on function public._level_of_xp(numeric), public._frame_for(text, int),
  public._ranking_rows(timestamptz, timestamptz), public._settle_ranking() from public, anon, authenticated;
revoke all on function public.get_ranking(text), public.my_ranking(), public.set_frame(text) from public, anon;
grant execute on function public.get_ranking(text), public.my_ranking(), public.set_frame(text) to authenticated;
