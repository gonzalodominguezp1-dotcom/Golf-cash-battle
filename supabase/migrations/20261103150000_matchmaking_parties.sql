-- Matchmaking arreglado y grupos de amigos.
--
-- 1. Un torneo se cierra en cuanto han terminado todos los que están dentro
--    (antes esperaba a llenar las 8 plazas o a que pasaran los 15 minutos de
--    inscripción). Quien juega solo ya no se queda "esperando a los demás":
--    si nadie entró mientras jugaba, se le devuelve la entrada al momento.
-- 2. El matchmaking solo mete a gente en torneos que siguen vivos (alguien
--    está todavía en la sala o jugando) y se serializa por mesa, así dos
--    amigos que entran a la vez caen en el mismo torneo y no uno en el torneo
--    viejo del otro.
-- 3. Grupos: hasta 4 amigos se juntan, el líder elige la mesa, cada uno pulsa
--    «Listo» (es su consentimiento para pagar esa entrada) y, cuando están
--    todos, el servidor los mete juntos en el mismo torneo. El resultado sigue
--    dependiendo solo de los golpes de cada uno.
--

-- ---------- 1. cierre en cuanto terminan todos ----------

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
  -- se cierra cuando no queda nadie por terminar (en la sala o jugando),
  -- esté llena la mesa o no; quien no acabó a tiempo cuenta como terminado
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

-- Hay alguien en el torneo que aún no ha terminado y sigue a tiempo.
create or replace function public._tournament_live(p_t uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tournament_entries e
                 where e.tournament_id = p_t and e.left_at is null and e.finished_at is null and now() < e.deadline)
$$;

-- Cierra los torneos que ya tocan: inscripción cerrada, mesa llena o nadie
-- pendiente de terminar.
create or replace function public._settle_due()
returns void language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  for v in
    select t.id from public.tournaments t
    where t.status = 'open' and (
      t.closes_at <= now()
      or (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.left_at is null) >= t.seats
      or not public._tournament_live(t.id)
    )
    order by t.created_at limit 20
    for update skip locked
  loop
    perform public._settle_tournament(v);
  end loop;
end $$;

-- ---------- 2. matchmaking ----------

-- Tiene un torneo de pago a medias (en la sala o jugando).
create or replace function public._in_active_match(p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tournament_entries e join public.tournaments t on t.id = e.tournament_id
                 where e.user_id = p_uid and t.status = 'open' and e.left_at is null
                   and e.finished_at is null and now() < e.deadline)
$$;

-- Torneo nuevo de esa mesa (hoyos al azar, los mismos para todos los que entren).
create or replace function public._new_tournament(p_tier text, p_rematch uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tier public.tiers;
  v_courses int[];
  v_t uuid;
begin
  select * into v_tier from public.tiers where id = p_tier;
  select array_agg(c order by c) into v_courses
    from (select c from generate_series(0, (public._cfg('course_count'))::int - 1) c
          order by random() limit (public._cfg('holes_per_match'))::int) s;
  insert into public.tournaments (tier_id, entry_fee, courses, seats, closes_at, rematch_of)
    values (v_tier.id, v_tier.entry_fee, v_courses, (public._cfg('players_per_match'))::int,
            now() + make_interval(mins => (public._cfg('join_window_minutes'))::int),
            p_rematch)
    returning id into v_t;
  return v_t;
end $$;

-- Sienta a p_uid en el torneo p_t y cobra la entrada.
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
            now() + make_interval(mins => (public._cfg('play_minutes'))::int));
end $$;

-- Torneo público de la mesa donde caben p_need jugadores más, ninguno de
-- p_users está ya dentro y sigue vivo (alguien en la sala o jugando). Llamar
-- con el candado de la mesa cogido.
create or replace function public._find_tournament(p_tier text, p_need int, p_users uuid[])
returns uuid language sql security definer set search_path = '' as $$
  select t.id from public.tournaments t
  where t.tier_id = p_tier and t.status = 'open' and t.rematch_of is null
    and t.closes_at > now() + interval '1 minute'
    and (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.left_at is null) + p_need <= t.seats
    and not exists (select 1 from public.tournament_entries e where e.tournament_id = t.id and e.user_id = any (p_users))
    and public._tournament_live(t.id)
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
    -- una búsqueda por mesa a la vez: quien entra justo después cae en el mismo torneo
    perform pg_advisory_xact_lock(hashtextextended('matchmaking:' || p_tier, 0));
    v_t := public._find_tournament(p_tier, 1, array[v_uid]);
  end if;

  if v_t is null then v_t := public._new_tournament(p_tier, p_rematch); end if;
  perform public._enter_tournament(v_t, v_uid);
  return public._tournament_json(v_t, v_uid);
end $$;

revoke all on function public._tournament_live(uuid), public._in_active_match(uuid), public._new_tournament(text, uuid),
  public._enter_tournament(uuid, uuid), public._find_tournament(text, int, uuid[]) from public, anon, authenticated;
revoke all on function public.join_tournament(text, uuid) from public, anon;
grant execute on function public.join_tournament(text, uuid) to authenticated;

-- ---------- 3. grupos ----------

insert into public.app_config (key, value) values ('party_size', '4') on conflict (key) do nothing;

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  leader uuid not null references auth.users(id) on delete cascade,
  tier_id text references public.tiers(id),
  -- último torneo en el que entró el grupo junto (los miembros lo abren al verlo)
  tournament_id uuid references public.tournaments(id),
  -- por qué no se pudo buscar partida la última vez: 'busy:Nombre', 'blocked:Nombre', 'funds:Nombre'
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.party_members (
  -- un grupo por persona
  user_id uuid primary key references auth.users(id) on delete cascade,
  party_id uuid not null references public.parties(id) on delete cascade,
  ready boolean not null default false,
  joined_at timestamptz not null default now()
);
create index if not exists party_members_party_idx on public.party_members (party_id, joined_at);

create table if not exists public.party_invites (
  party_id uuid not null references public.parties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (party_id, user_id)
);
create index if not exists party_invites_user_idx on public.party_invites (user_id);

-- sin políticas: solo se tocan desde las funciones de abajo
alter table public.parties enable row level security;
alter table public.party_members enable row level security;
alter table public.party_invites enable row level security;

create or replace function public._are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships f where f.status = 'accepted'
                 and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)))
$$;

-- Saca a p_uid de su grupo. Si era el líder, pasa a serlo quien lleva más
-- tiempo; si no queda nadie, el grupo desaparece.
create or replace function public._party_leave(p_uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_p uuid;
  v_next uuid;
begin
  delete from public.party_members where user_id = p_uid returning party_id into v_p;
  if v_p is null then return; end if;
  select user_id into v_next from public.party_members where party_id = v_p order by joined_at, user_id limit 1;
  if v_next is null then
    delete from public.parties where id = v_p;
  else
    update public.parties set leader = case when leader = p_uid then v_next else leader end,
                              updated_at = now()
      where id = v_p;
    -- el grupo ha cambiado: hay que volver a confirmar
    update public.party_members set ready = false where party_id = v_p;
  end if;
end $$;

-- Mi grupo y mis invitaciones.
create or replace function public.my_party()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_p public.parties;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select p.* into v_p from public.parties p join public.party_members m on m.party_id = p.id where m.user_id = v_uid;
  return jsonb_build_object(
    'party', case when v_p.id is null then null else jsonb_build_object(
      'id', v_p.id,
      'leader', v_p.leader = v_uid,
      'tier_id', v_p.tier_id,
      'tournament_id', v_p.tournament_id,
      'last_error', v_p.last_error,
      'size', (public._cfg('party_size'))::int,
      'members', (
        select jsonb_agg(jsonb_build_object(
                 'name', coalesce(pr.username, 'Jugador'),
                 'avatar', pr.avatar,
                 'me', m.user_id = v_uid,
                 'leader', m.user_id = v_p.leader,
                 'ready', m.ready
               ) order by m.joined_at, m.user_id)
        from public.party_members m join public.profiles pr on pr.id = m.user_id
        where m.party_id = v_p.id
      ),
      'invited', coalesce((
        select jsonb_agg(pr.username order by i.created_at)
        from public.party_invites i join public.profiles pr on pr.id = i.user_id
        where i.party_id = v_p.id
      ), '[]'::jsonb)
    ) end,
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('party', i.party_id, 'from', pr.username) order by i.created_at desc)
      from public.party_invites i join public.profiles pr on pr.id = i.invited_by
      where i.user_id = v_uid and (v_p.id is null or i.party_id <> v_p.id)
    ), '[]'::jsonb)
  );
end $$;

-- Invita a un amigo (por nombre de usuario). Si aún no tienes grupo, se crea
-- contigo de líder.
create or replace function public.party_invite(p_username text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_other uuid;
  v_p uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select id into v_other from public.profiles where lower(username) = lower(coalesce(p_username, ''));
  if v_other is null then raise exception 'user_not_found'; end if;
  if v_other = v_uid then raise exception 'cannot_invite_self'; end if;
  if not public._are_friends(v_uid, v_other) then raise exception 'not_friends'; end if;

  select party_id into v_p from public.party_members where user_id = v_uid;
  if v_p is null then
    insert into public.parties (leader) values (v_uid) returning id into v_p;
    insert into public.party_members (user_id, party_id) values (v_uid, v_p);
  end if;
  perform 1 from public.parties where id = v_p for update;
  if exists (select 1 from public.party_members where user_id = v_other and party_id = v_p) then
    raise exception 'already_in_party';
  end if;
  if (select count(*) from public.party_members where party_id = v_p)
     + (select count(*) from public.party_invites where party_id = v_p) >= (public._cfg('party_size'))::int then
    raise exception 'party_full';
  end if;
  insert into public.party_invites (party_id, user_id, invited_by) values (v_p, v_other, v_uid)
    on conflict (party_id, user_id) do nothing;
  return public.my_party();
end $$;

-- Acepta o rechaza una invitación. Aceptar te saca del grupo en el que estuvieras.
create or replace function public.party_respond(p_party uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.parties where id = p_party for update;
  delete from public.party_invites where party_id = p_party and user_id = v_uid;
  if not found then raise exception 'invite_not_found'; end if;
  if p_accept then
    if (select count(*) from public.party_members where party_id = p_party) >= (public._cfg('party_size'))::int then
      raise exception 'party_full';
    end if;
    perform public._party_leave(v_uid);
    insert into public.party_members (user_id, party_id) values (v_uid, p_party);
    update public.party_members set ready = false where party_id = p_party;
    update public.parties set last_error = null, updated_at = now() where id = p_party;
  end if;
  return public.my_party();
end $$;

-- Sales del grupo. Las invitaciones que ya se mandaron siguen valiendo para el grupo.
create or replace function public.party_leave()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public._party_leave(v_uid);
  return public.my_party();
end $$;

-- El líder elige la mesa del grupo. Cambiarla quita los «Listo».
create or replace function public.party_set_tier(p_tier text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_p public.parties;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select p.* into v_p from public.parties p join public.party_members m on m.party_id = p.id where m.user_id = v_uid for update of p;
  if v_p.id is null then raise exception 'no_party'; end if;
  if v_p.leader <> v_uid then raise exception 'not_leader'; end if;
  -- la práctica es contra rivales simulados en el propio dispositivo
  if not exists (select 1 from public.tiers where id = p_tier and entry_fee > 0) then raise exception 'party_paid_only'; end if;
  if v_p.tier_id is distinct from p_tier then
    update public.parties set tier_id = p_tier, last_error = null, updated_at = now() where id = v_p.id;
    update public.party_members set ready = false where party_id = v_p.id;
  end if;
  return public.my_party();
end $$;

-- Mete a todo el grupo en el mismo torneo. Si alguien no puede, no entra
-- nadie y se apunta el motivo en last_error. Devuelve el torneo o null.
create or replace function public._party_queue(p_party uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_p public.parties;
  v_fee numeric;
  v_users uuid[];
  v_t uuid;
  m record;
begin
  select * into v_p from public.parties where id = p_party for update;
  select entry_fee into v_fee from public.tiers where id = v_p.tier_id;
  select array_agg(user_id order by joined_at, user_id) into v_users from public.party_members where party_id = p_party;

  for m in select pm.user_id, coalesce(pr.username, 'Jugador') as name,
                  coalesce((select balance from public.wallets w where w.user_id = pm.user_id), 0) as balance
           from public.party_members pm join public.profiles pr on pr.id = pm.user_id
           where pm.party_id = p_party order by pm.joined_at loop
    v_p.last_error := case
      when public._in_active_match(m.user_id) then 'busy:' || m.name
      when public._paid_block(m.user_id) is not null then 'blocked:' || m.name
      when m.balance < v_fee then 'funds:' || m.name
    end;
    if v_p.last_error is not null then
      update public.parties set last_error = v_p.last_error, updated_at = now() where id = p_party;
      update public.party_members set ready = false where party_id = p_party;
      return null;
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended('matchmaking:' || v_p.tier_id, 0));
  v_t := public._find_tournament(v_p.tier_id, array_length(v_users, 1), v_users);
  if v_t is null then v_t := public._new_tournament(v_p.tier_id, null); end if;
  for i in 1 .. array_length(v_users, 1) loop
    perform public._enter_tournament(v_t, v_users[i]);
  end loop;
  update public.parties set tournament_id = v_t, last_error = null, updated_at = now() where id = p_party;
  update public.party_members set ready = false where party_id = p_party;
  return v_t;
end $$;

-- «Listo» (o quitarlo). Pulsarlo es aceptar pagar la entrada de la mesa del
-- grupo. Cuando están listos todos (y sois al menos dos), se busca partida.
create or replace function public.party_ready(p_ready boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_p public.parties;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select p.* into v_p from public.parties p join public.party_members m on m.party_id = p.id where m.user_id = v_uid for update of p;
  if v_p.id is null then raise exception 'no_party'; end if;
  if p_ready and v_p.tier_id is null then raise exception 'no_tier'; end if;
  perform public._settle_due();
  update public.party_members set ready = p_ready where user_id = v_uid;
  if p_ready then
    update public.parties set last_error = null where id = v_p.id;
    if (select count(*) from public.party_members where party_id = v_p.id) >= 2
       and not exists (select 1 from public.party_members where party_id = v_p.id and not ready) then
      perform public._party_queue(v_p.id);
    end if;
  end if;
  return public.my_party();
end $$;

revoke all on function public._are_friends(uuid, uuid), public._party_leave(uuid), public._party_queue(uuid)
  from public, anon, authenticated;
revoke all on function public.my_party(), public.party_invite(text), public.party_respond(uuid, boolean),
  public.party_leave(), public.party_set_tier(text), public.party_ready(boolean) from public, anon;
grant execute on function public.my_party(), public.party_invite(text), public.party_respond(uuid, boolean),
  public.party_leave(), public.party_set_tier(text), public.party_ready(boolean) to authenticated;
