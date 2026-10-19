-- Cuentas de verdad, verificación de identidad y antibots.
--
-- - La cuenta anónima se convierte en cuenta con email sin cambiar de id, así
--   que conserva saldo y movimientos. Para entrar desde otro móvil se usa un
--   enlace o código por email.
-- - Perfil en el servidor: nombre público y progreso (nivel, skins).
-- - Mesas de pago solo con email confirmado, identidad verificada y +18.
--   Una identidad = una cuenta (se guarda un hash del documento, no el número).
-- - Antibots: submit-hole guarda las señales de cada hoyo y la nota de riesgo.
--   Una cuenta marcada no entra en mesas de pago y sus premios se retienen
--   hasta que alguien la revise.

insert into public.app_config (key, value) values
  ('antibot', '{}'::jsonb),
  ('min_age', '18')
on conflict (key) do nothing;

-- ---------- perfil ----------

alter table public.profiles
  add column progress jsonb not null default '{}'::jsonb,
  add column birthdate date,
  add column kyc_status text not null default 'none' check (kyc_status in ('none', 'pending', 'verified', 'rejected')),
  add column kyc_reason text,
  add column kyc_provider text,
  add column verified_at timestamptz,
  add column identity_hash text unique,
  add column updated_at timestamptz not null default now();
create unique index profiles_username_lower_idx on public.profiles (lower(username));

-- Sesiones de verificación abiertas con el proveedor (o con el modo pruebas).
create table public.kyc_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  session_ref text not null,
  status text not null default 'pending',
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, session_ref)
);
create index kyc_sessions_user_idx on public.kyc_sessions (user_id, created_at desc);
alter table public.kyc_sessions enable row level security;
create policy "own kyc sessions" on public.kyc_sessions for select using (user_id = (select auth.uid()));

-- ---------- antibots ----------

-- Lo que se ve de cada hoyo jugado en torneo además de los golpes.
create table public.shot_signals (
  entry_id uuid not null references public.tournament_entries(id),
  hole int not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  course int not null, -- -1 = desempate
  strokes int not null,
  waits int[] not null, -- pasos con la bola parada antes de cada golpe
  drags int[] not null, -- pasos con el dedo en la pantalla (null si no llegó)
  turns int[] not null, -- cambios de dirección al apuntar
  created_at timestamptz not null default now(),
  primary key (entry_id, hole)
);
create index shot_signals_user_idx on public.shot_signals (user_id, created_at desc);
create index shot_signals_course_idx on public.shot_signals (course);

create table public.player_risk (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- ok | review: marcada por el antibots | cleared: revisada y limpia | blocked
  status text not null default 'ok' check (status in ('ok', 'review', 'cleared', 'blocked')),
  score numeric not null default 0,
  flags text[] not null default '{}',
  stats jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  note text
);

-- Premios de cuentas en revisión: no llegan al saldo hasta que se liberan.
create table public.held_payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  note text,
  match_id uuid,
  status text not null default 'held' check (status in ('held', 'released', 'void')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index held_payouts_user_idx on public.held_payouts (user_id) where status = 'held';

alter table public.shot_signals enable row level security;
alter table public.player_risk enable row level security;
alter table public.held_payouts enable row level security;
create policy "own held payouts" on public.held_payouts for select using (user_id = (select auth.uid()));

-- ---------- reglas de cuenta ----------

-- Por qué una cuenta no puede jugar con dinero (null si puede).
create or replace function public._paid_block(p_uid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when u.id is null or u.is_anonymous or u.email is null or u.email_confirmed_at is null then 'account_required'
    when coalesce(r.status, 'ok') in ('review', 'blocked') then 'account_review'
    when p.kyc_status is distinct from 'verified' then 'kyc_required'
    when p.birthdate is null or p.birthdate > (current_date - make_interval(years => (public._cfg('min_age'))::int))::date then 'underage'
  end
  from (select p_uid as id) x
  left join auth.users u on u.id = x.id
  left join public.profiles p on p.id = x.id
  left join public.player_risk r on r.user_id = x.id
$$;

-- Cualquier entrada a un torneo de pago pasa por aquí, la cree quien la cree.
create or replace function public._check_paid_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_block text;
begin
  if (select entry_fee from public.tournaments where id = new.tournament_id) > 0 then
    v_block := public._paid_block(new.user_id);
    if v_block is not null then raise exception '%', v_block; end if;
  end if;
  return new;
end $$;
create trigger tournament_entries_paid_check before insert on public.tournament_entries
  for each row execute function public._check_paid_entry();

-- El saldo solo cambia aquí. Los premios de cuentas en revisión se retienen.
create or replace function public._apply_tx(p_user uuid, p_type public.tx_type, p_amount numeric, p_note text, p_match uuid default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_balance numeric;
begin
  if p_type = 'prize' and p_amount > 0
     and exists (select 1 from public.player_risk where user_id = p_user and status in ('review', 'blocked')) then
    insert into public.held_payouts (user_id, amount, note, match_id) values (p_user, p_amount, p_note, p_match);
    select balance into v_balance from public.wallets where user_id = p_user;
    return v_balance;
  end if;
  select balance into v_balance from public.wallets where user_id = p_user for update;
  if v_balance is null then
    raise exception 'wallet_not_found';
  end if;
  if v_balance + p_amount < 0 then
    raise exception 'insufficient_funds';
  end if;
  update public.wallets set balance = balance + p_amount, updated_at = now()
    where user_id = p_user returning balance into v_balance;
  insert into public.transactions (user_id, type, amount, balance_after, note, match_id)
    values (p_user, p_type, p_amount, v_balance, p_note, p_match);
  return v_balance;
end $$;

-- ---------- funciones del jugador ----------

create or replace function public.my_profile()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  return (
    select jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'pending_email', nullif(u.email_change, ''),
      'is_anonymous', coalesce(u.is_anonymous, false),
      'email_confirmed', u.email is not null and u.email_confirmed_at is not null,
      'username', p.username,
      'progress', p.progress,
      'kyc_status', p.kyc_status,
      'kyc_reason', p.kyc_reason,
      'adult', p.birthdate is not null
               and p.birthdate <= (current_date - make_interval(years => (public._cfg('min_age'))::int))::date,
      'in_review', coalesce(r.status, 'ok') in ('review', 'blocked'),
      'held', coalesce((select sum(amount) from public.held_payouts h where h.user_id = u.id and h.status = 'held'), 0),
      'paid_block', public._paid_block(u.id)
    )
    from auth.users u
    join public.profiles p on p.id = u.id
    left join public.player_risk r on r.user_id = u.id
    where u.id = v_uid
  );
end $$;

-- Nombre público: 3-16 letras, números o _, único sin mirar mayúsculas.
create or replace function public.set_username(p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_name is null or p_name !~ '^[A-Za-z0-9_]{3,16}$' then raise exception 'invalid_username'; end if;
  if exists (select 1 from public.profiles where lower(username) = lower(p_name) and id <> v_uid) then
    raise exception 'username_taken';
  end if;
  update public.profiles set username = p_name, updated_at = now() where id = v_uid;
  return public.my_profile();
end $$;

-- Progreso cosmético (nivel, estadísticas, skin puesta). Lo calcula el móvil;
-- aquí solo se guarda con límites: los contadores no bajan y la XP no sube a
-- saltos imposibles (salvo la primera vez, que sube lo que ya tenía el móvil).
-- No toca el saldo.
create or replace function public.save_progress(p_state jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_old jsonb;
  v_new jsonb := '{}'::jsonb;
  k text;
  v numeric;
  v_prev numeric;
  v_first boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if jsonb_typeof(p_state) <> 'object' then raise exception 'bad_request'; end if;
  select progress into v_old from public.profiles where id = v_uid for update;
  v_first := v_old = '{}'::jsonb;
  foreach k in array array['xp','matches','wins','streak','bestStreak','birdies','aces','tiebreakWins','bigWins'] loop
    v := case when jsonb_typeof(p_state -> k) = 'number' then floor((p_state ->> k)::numeric) else null end;
    v_prev := coalesce((v_old ->> k)::numeric, 0);
    if v is null or v < 0 then v := v_prev; end if;
    -- la racha puede volver a 0; el resto solo sube
    if k <> 'streak' and v < v_prev then v := v_prev; end if;
    if not v_first and k = 'xp' and v > v_prev + 2000 then raise exception 'progress_rejected'; end if;
    if not v_first and k <> 'xp' and k <> 'streak' and v > v_prev + 20 then raise exception 'progress_rejected'; end if;
    v_new := v_new || jsonb_build_object(k, v);
  end loop;
  v_new := v_new || jsonb_build_object('equipped',
    case when jsonb_typeof(p_state -> 'equipped') = 'string' and length(p_state ->> 'equipped') <= 32
         then p_state ->> 'equipped' else coalesce(v_old ->> 'equipped', 'classic') end);
  update public.profiles set progress = v_new, updated_at = now() where id = v_uid;
  return v_new;
end $$;

-- ---------- verificación de identidad (solo funciones del servidor) ----------

create or replace function public._kyc_open(p_user uuid, p_provider text, p_ref text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.kyc_sessions (user_id, provider, session_ref) values (p_user, p_provider, p_ref)
    on conflict (provider, session_ref) do nothing;
  update public.profiles set kyc_status = 'pending', kyc_reason = null, updated_at = now()
    where id = p_user and kyc_status in ('none', 'rejected');
end $$;

-- Resultado del proveedor. p_identity_hash identifica a la persona sin guardar
-- el documento: si ya lo usa otra cuenta, se rechaza.
create or replace function public._kyc_result(
  p_provider text, p_ref text, p_status text, p_birthdate date, p_identity_hash text, p_raw jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_s public.kyc_sessions;
  v_status text := p_status;
  v_reason text;
begin
  select * into v_s from public.kyc_sessions where provider = p_provider and session_ref = p_ref for update;
  if not found then raise exception 'session_not_found'; end if;
  if p_status = 'verified' then
    if p_birthdate is null or p_identity_hash is null then
      v_status := 'rejected'; v_reason := 'missing_data';
    elsif p_birthdate > (current_date - make_interval(years => (public._cfg('min_age'))::int))::date then
      v_status := 'rejected'; v_reason := 'underage';
    elsif exists (select 1 from public.profiles where identity_hash = p_identity_hash and id <> v_s.user_id) then
      v_status := 'rejected'; v_reason := 'duplicate_identity';
      insert into public.player_risk (user_id, status, flags) values (v_s.user_id, 'review', array['duplicate_identity'])
        on conflict (user_id) do update set
          status = case when public.player_risk.status = 'blocked' then 'blocked' else 'review' end,
          flags = array(select distinct unnest(public.player_risk.flags || 'duplicate_identity'::text)),
          updated_at = now();
    end if;
  elsif p_status = 'rejected' then
    v_reason := 'provider_declined';
  end if;

  update public.kyc_sessions set status = v_status, raw = p_raw, updated_at = now() where id = v_s.id;
  if v_status = 'verified' then
    update public.profiles set kyc_status = 'verified', kyc_reason = null, kyc_provider = p_provider,
      birthdate = p_birthdate, identity_hash = p_identity_hash, verified_at = now(), updated_at = now()
      where id = v_s.user_id;
  elsif v_status = 'rejected' then
    update public.profiles set kyc_status = 'rejected', kyc_reason = v_reason, updated_at = now()
      where id = v_s.user_id and kyc_status <> 'verified';
  end if;
  return v_status;
end $$;

-- ---------- antibots (solo submit-hole) ----------

create or replace function public._record_signals(
  p_user uuid, p_t uuid, p_hole int, p_course int, p_strokes int, p_waits int[], p_drags int[], p_turns int[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_entry uuid;
begin
  -- solo el hoyo que toca: va antes de _record_hole para que la nota de riesgo
  -- ya esté puesta si este hoyo cierra el torneo y reparte el premio
  select id into v_entry from public.tournament_entries
    where tournament_id = p_t and user_id = p_user and left_at is null and finished_at is null
      and started_at is not null and coalesce(array_length(scores, 1), 0) = p_hole;
  if v_entry is null then return; end if;
  insert into public.shot_signals (entry_id, hole, user_id, course, strokes, waits, drags, turns)
    values (v_entry, p_hole, p_user, p_course, p_strokes, p_waits, p_drags, p_turns)
    on conflict (entry_id, hole) do nothing;
end $$;

-- Lo que necesita assessRisk: últimos hoyos del jugador y la media de todos.
create or replace function public._risk_inputs(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rules', public._cfg('antibot'),
    'holes', coalesce((
      select jsonb_agg(jsonb_build_object('course', course, 'strokes', strokes, 'waits', waits, 'drags', drags) order by created_at desc)
      from (select * from public.shot_signals where user_id = p_user order by created_at desc limit 60) s
    ), '[]'::jsonb),
    'baseline', coalesce((
      select jsonb_object_agg(course, jsonb_build_object('avg', avg, 'n', n))
      from (select course, avg(strokes)::float8 avg, count(*) n from public.shot_signals
            where course >= 0 and user_id <> p_user group by course) b
    ), '{}'::jsonb)
  )
$$;

-- Guarda la nota. Una cuenta revisada a mano (cleared/blocked) no cambia sola,
-- salvo que vuelva a salir marcada con algo nuevo.
create or replace function public._set_risk(p_user uuid, p_score numeric, p_flags text[], p_stats jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare v_r public.player_risk;
begin
  select * into v_r from public.player_risk where user_id = p_user for update;
  if not found then
    insert into public.player_risk (user_id, status, score, flags, stats)
      values (p_user, case when cardinality(p_flags) > 0 then 'review' else 'ok' end, p_score, p_flags, p_stats)
      returning * into v_r;
    return v_r.status;
  end if;
  update public.player_risk set
    score = p_score, stats = p_stats, updated_at = now(),
    flags = array(select distinct unnest(v_r.flags || p_flags)),
    status = case
      when v_r.status = 'blocked' then 'blocked'
      when v_r.status = 'cleared' and p_flags <@ v_r.flags then 'cleared'
      when cardinality(p_flags) > 0 then 'review'
      else v_r.status
    end
    where user_id = p_user returning * into v_r;
  return v_r.status;
end $$;

-- Para revisar a mano desde el panel de Supabase (SQL editor):
--   select public.review_player('<user id>', 'cleared', 'jugador real');
--   select public.review_player('<user id>', 'blocked', 'bot');
create or replace function public.review_player(p_user uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare h record;
begin
  if p_status not in ('cleared', 'blocked') then raise exception 'bad_status'; end if;
  insert into public.player_risk (user_id, status, reviewed_at, note) values (p_user, p_status, now(), p_note)
    on conflict (user_id) do update set status = p_status, reviewed_at = now(), note = p_note, updated_at = now();
  for h in select * from public.held_payouts where user_id = p_user and status = 'held' for update loop
    if p_status = 'cleared' then
      perform public._apply_tx(p_user, 'prize', h.amount, h.note, h.match_id);
      update public.held_payouts set status = 'released', resolved_at = now() where id = h.id;
    else
      update public.held_payouts set status = 'void', resolved_at = now() where id = h.id;
    end if;
  end loop;
end $$;

revoke all on function public._paid_block(uuid), public._check_paid_entry(), public._kyc_open(uuid, text, text),
  public._kyc_result(text, text, text, date, text, jsonb),
  public._record_signals(uuid, uuid, int, int, int, int[], int[], int[]), public._risk_inputs(uuid),
  public._set_risk(uuid, numeric, text[], jsonb), public.review_player(uuid, text, text) from public, anon, authenticated;
grant execute on function public._kyc_open(uuid, text, text), public._kyc_result(text, text, text, date, text, jsonb),
  public._record_signals(uuid, uuid, int, int, int, int[], int[], int[]), public._risk_inputs(uuid),
  public._set_risk(uuid, numeric, text[], jsonb), public.review_player(uuid, text, text) to service_role;
revoke all on function public.my_profile(), public.set_username(text), public.save_progress(jsonb) from public, anon;
grant execute on function public.my_profile(), public.set_username(text), public.save_progress(jsonb) to authenticated;
