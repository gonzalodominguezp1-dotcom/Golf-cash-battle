-- Avatar y marco públicos: se ven siempre (matchmaking, grupo, final de partida, desempate, amigos y ranking).
-- Solo se publican esos dos campos (avatar y marco que se luce). Nunca email, saldo, KYC ni nada más.
-- Se reemplazan funciones con `create or replace`: las firmas no cambian y los grants se conservan.

-- 1) Jugadores de una partida o torneo: avatar y marco de cada jugador (el marco que se luce, como en amigos).
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
        'avatar', pr.avatar,
        'frame', public._frame_for(pr.frame, public._level_of_xp(coalesce((pr.progress ->> 'xp')::numeric, 0))),
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
      from public.tournament_entries e
      left join public.profiles pr on pr.id = e.user_id
      where e.tournament_id = t.id and e.left_at is null
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

-- 2) Grupo: marco de cada miembro, e invitados con avatar y marco (`invited` sigue siendo la lista de nombres).
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
                 'frame', public._frame_for(pr.frame, public._level_of_xp(coalesce((pr.progress ->> 'xp')::numeric, 0))),
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
      ), '[]'::jsonb),
      'invited_players', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name', pr.username,
                 'avatar', pr.avatar,
                 'frame', public._frame_for(pr.frame, public._level_of_xp(coalesce((pr.progress ->> 'xp')::numeric, 0)))
               ) order by i.created_at)
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

-- 3) Ranking: formato ligero. Las imágenes de avatar (hasta 600 KB cada una) no viajan en el ranking
-- (hasta 50 filas); los de icono sí, son unos bytes. Lo demás cae a la inicial con el marco.
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
           'avatar', case when p.avatar like 'icon:%' then p.avatar end,
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
