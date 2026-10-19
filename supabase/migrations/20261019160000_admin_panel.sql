-- Panel de administración (admin.html).
--
-- Quién es admin lo decide el servidor: el email de la cuenta tiene que estar
-- en public.admins y confirmado. Todas las funciones admin_* lo comprueban y
-- dejan constancia en admin_actions de lo que cambia dinero o cuentas.
--
-- Para dar acceso (SQL editor de Supabase):
--   insert into public.admins (email) values ('tu@email.com');

create table public.admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create table public.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users(id),
  action text not null,
  target uuid,
  note text,
  created_at timestamptz not null default now()
);
alter table public.admin_actions enable row level security;

create or replace function public._is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join public.admins a on a.email = lower(u.email)
    where u.id = auth.uid() and not coalesce(u.is_anonymous, false) and u.email_confirmed_at is not null
  )
$$;

create or replace function public._require_admin()
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return auth.uid();
end $$;

-- La página lo usa para saber si enseñar el panel.
create or replace function public.admin_check()
returns boolean language sql stable security definer set search_path = '' as $$
  select public._is_admin()
$$;

-- Números de arriba: comisión, dinero en juego y lo que espera revisión.
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'commission_total', (select coalesce(sum(commission), 0) from public.tournaments where status = 'settled'),
    'commission_7d', (select coalesce(sum(commission), 0) from public.tournaments
                      where status = 'settled' and settled_at > now() - interval '7 days'),
    'commission_today', (select coalesce(sum(commission), 0) from public.tournaments
                         where status = 'settled' and settled_at > date_trunc('day', now())),
    'tournaments_settled', (select count(*) from public.tournaments where status = 'settled'),
    'tournaments_open', (select count(*) from public.tournaments where status = 'open'),
    'players_playing', (select count(*) from public.tournament_entries e join public.tournaments t on t.id = e.tournament_id
                        where t.status = 'open' and e.left_at is null),
    'users', (select count(*) from auth.users),
    'accounts', (select count(*) from auth.users where not coalesce(is_anonymous, false) and email_confirmed_at is not null),
    'verified', (select count(*) from public.profiles where kyc_status = 'verified'),
    'balances', (select coalesce(sum(balance), 0) from public.wallets),
    'deposits', (select coalesce(sum(amount), 0) from public.deposits where credited_at is not null),
    'in_review', (select count(*) from public.player_risk where status = 'review'),
    'blocked', (select count(*) from public.player_risk where status = 'blocked'),
    'held_count', (select count(*) from public.held_payouts where status = 'held'),
    'held_amount', (select coalesce(sum(amount), 0) from public.held_payouts where status = 'held')
  );
end $$;

-- Cuentas del antibots. p_status: review | blocked | cleared | all
create or replace function public.admin_players(p_status text default 'review', p_search text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.updated_at desc)
    from (
      select r.user_id as id, u.email, p.username, r.status, r.score, r.flags, r.stats, r.note,
             r.updated_at, r.reviewed_at, p.kyc_status, coalesce(w.balance, 0) as balance,
             (select coalesce(sum(amount), 0) from public.held_payouts h where h.user_id = r.user_id and h.status = 'held') as held,
             (select count(*) from public.tournament_entries e where e.user_id = r.user_id) as tournaments,
             (select count(*) from public.tournament_entries e where e.user_id = r.user_id and e.position = 1) as wins
      from public.player_risk r
      left join auth.users u on u.id = r.user_id
      left join public.profiles p on p.id = r.user_id
      left join public.wallets w on w.user_id = r.user_id
      where (p_status = 'all' and r.status <> 'ok' or r.status = p_status)
        and (p_search is null or p_search = ''
             or u.email ilike '%' || p_search || '%' or p.username ilike '%' || p_search || '%'
             or r.user_id::text = p_search)
      order by r.updated_at desc
      limit 100
    ) x
  ), '[]'::jsonb);
end $$;

-- Ficha de un jugador: últimos torneos y señales para decidir si es un bot.
create or replace function public.admin_player(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(row_to_json(x))
      from (select e.tournament_id, t.tier_id, t.entry_fee, e.total, e.scores, e.position, e.payout, e.joined_at
            from public.tournament_entries e join public.tournaments t on t.id = e.tournament_id
            where e.user_id = p_user order by e.joined_at desc limit 10) x
    ), '[]'::jsonb),
    'signals', coalesce((
      select jsonb_agg(row_to_json(x))
      from (select course, strokes, waits, drags, turns, created_at from public.shot_signals
            where user_id = p_user order by created_at desc limit 12) x
    ), '[]'::jsonb),
    'held', coalesce((
      select jsonb_agg(row_to_json(x))
      from (select id, amount, note, status, created_at from public.held_payouts
            where user_id = p_user order by created_at desc limit 20) x
    ), '[]'::jsonb)
  );
end $$;

-- Decisión sobre una cuenta. cleared libera sus premios retenidos y blocked los
-- anula (review_player); review la vuelve a dejar pendiente.
create or replace function public.admin_review(p_user uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public._require_admin();
begin
  if p_status = 'review' then
    update public.player_risk set status = 'review', note = p_note, reviewed_at = now(), updated_at = now()
      where user_id = p_user;
  elsif p_status in ('cleared', 'blocked') then
    perform public.review_player(p_user, p_status, p_note);
  else
    raise exception 'bad_status';
  end if;
  insert into public.admin_actions (admin_id, action, target, note) values (v_admin, 'review:' || p_status, p_user, p_note);
end $$;

create or replace function public.admin_held(p_status text default 'held')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
    from (
      select h.id, h.user_id, u.email, p.username, h.amount, h.note, h.status, h.created_at, h.resolved_at,
             coalesce(r.status, 'ok') as risk
      from public.held_payouts h
      left join auth.users u on u.id = h.user_id
      left join public.profiles p on p.id = h.user_id
      left join public.player_risk r on r.user_id = h.user_id
      where p_status = 'all' or h.status = p_status
      order by h.created_at desc
      limit 100
    ) x
  ), '[]'::jsonb);
end $$;

-- Un premio suelto: release lo pasa al saldo aunque la cuenta siga en revisión,
-- void lo anula. Para decidir sobre todos a la vez, admin_review.
create or replace function public.admin_resolve_payout(p_id uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := public._require_admin();
  h public.held_payouts;
  v_balance numeric;
begin
  if p_action not in ('release', 'void') then raise exception 'bad_action'; end if;
  select * into h from public.held_payouts where id = p_id for update;
  if not found or h.status <> 'held' then raise exception 'not_held'; end if;
  if p_action = 'release' then
    -- sin _apply_tx: lo volvería a retener si la cuenta sigue en revisión
    update public.wallets set balance = balance + h.amount, updated_at = now()
      where user_id = h.user_id returning balance into v_balance;
    if v_balance is null then raise exception 'wallet_not_found'; end if;
    insert into public.transactions (user_id, type, amount, balance_after, note, match_id)
      values (h.user_id, 'prize', h.amount, v_balance, h.note, h.match_id);
    update public.held_payouts set status = 'released', resolved_at = now() where id = p_id;
  else
    update public.held_payouts set status = 'void', resolved_at = now() where id = p_id;
  end if;
  insert into public.admin_actions (admin_id, action, target, note)
    values (v_admin, 'payout:' || p_action, h.user_id, h.amount::text);
end $$;

-- Torneos recientes con su comisión. p_status: open | settled | cancelled | all
create or replace function public.admin_tournaments(p_status text default 'all', p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
    from (
      select t.id, t.tier_id, t.entry_fee, t.seats, t.status, t.created_at, t.closes_at, t.settled_at,
             t.pot, t.commission, t.prize,
             (select count(*) from public.tournament_entries e where e.tournament_id = t.id) as players,
             (select count(*) from public.tournament_entries e where e.tournament_id = t.id and e.finished_at is not null) as finished,
             (select string_agg(e.name, ', ') from public.tournament_entries e where e.tournament_id = t.id and e.position = 1) as winners
      from public.tournaments t
      where p_status = 'all' or t.status = p_status
      order by t.created_at desc
      limit least(greatest(p_limit, 1), 200)
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_log(p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.created_at desc)
    from (
      select a.id, a.action, a.target, a.note, a.created_at, u.email as admin, tu.email as target_email, p.username as target_name
      from public.admin_actions a
      left join auth.users u on u.id = a.admin_id
      left join auth.users tu on tu.id = a.target
      left join public.profiles p on p.id = a.target
      order by a.created_at desc
      limit least(greatest(p_limit, 1), 200)
    ) x
  ), '[]'::jsonb);
end $$;

revoke all on function public._is_admin(), public._require_admin(), public.admin_check(), public.admin_overview(),
  public.admin_players(text, text), public.admin_player(uuid), public.admin_review(uuid, text, text),
  public.admin_held(text), public.admin_resolve_payout(uuid, text), public.admin_tournaments(text, int),
  public.admin_log(int) from public, anon;
revoke all on function public._is_admin(), public._require_admin() from authenticated;
grant execute on function public.admin_check(), public.admin_overview(), public.admin_players(text, text),
  public.admin_player(uuid), public.admin_review(uuid, text, text), public.admin_held(text),
  public.admin_resolve_payout(uuid, text), public.admin_tournaments(text, int), public.admin_log(int) to authenticated;
