-- Avatar en la cuenta y amigos por nombre de usuario.
--  * profiles.avatar guarda el avatar elegido: 'icon:<id>' o una imagen 'data:image/...;base64,...'
--    (ya recortada a 256 px por el cliente). Así sobrevive a cambiar de navegador o dispositivo.
--  * Amistades con solicitud: quien añade crea una petición 'pending'; la otra persona la acepta
--    o la rechaza. Si las dos se añaden entre sí, queda aceptada al momento.
--  * friendships no tiene políticas RLS: solo se toca desde las funciones de abajo.
-- SQL no probado contra Postgres.

alter table public.profiles add column if not exists avatar text;
alter table public.profiles drop constraint if exists profiles_avatar_check;
alter table public.profiles add constraint profiles_avatar_check check (
  avatar is null
  or (avatar ~ '^icon:[a-z]{2,16}$')
  or (avatar ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and length(avatar) < 600000)
);

create table if not exists public.friendships (
  requester uuid not null references auth.users(id) on delete cascade,
  addressee uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
-- una sola fila por pareja, vaya en el sentido que vaya
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee_idx on public.friendships (addressee);
alter table public.friendships enable row level security;

-- my_profile ahora devuelve también el avatar
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
      'avatar', p.avatar,
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

-- Guarda el avatar (null = sin avatar). El formato lo valida la restricción de la columna.
create or replace function public.set_avatar(p_avatar text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_avatar is not null
     and not (p_avatar ~ '^icon:[a-z]{2,16}$'
              or (p_avatar ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and length(p_avatar) < 600000)) then
    raise exception 'bad_request';
  end if;
  update public.profiles set avatar = p_avatar, updated_at = now() where id = v_uid;
  return p_avatar;
end $$;

-- Añadir un amigo por nombre de usuario (sin mirar mayúsculas).
-- Devuelve 'pending' (petición enviada) o 'accepted' (la otra persona ya te había añadido).
create or replace function public.add_friend(p_username text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_other uuid;
  v_row public.friendships;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,16}$' then raise exception 'invalid_username'; end if;
  if not exists (select 1 from public.profiles where id = v_uid and username is not null) then
    raise exception 'username_required';
  end if;
  select id into v_other from public.profiles where lower(username) = lower(p_username);
  if v_other is null then raise exception 'user_not_found'; end if;
  if v_other = v_uid then raise exception 'cannot_friend_self'; end if;

  select * into v_row from public.friendships
    where (requester = v_uid and addressee = v_other) or (requester = v_other and addressee = v_uid);
  if found then
    if v_row.status = 'accepted' then raise exception 'already_friends'; end if;
    if v_row.requester = v_uid then raise exception 'request_pending'; end if;
    -- la otra persona ya te había añadido: se acepta
    update public.friendships set status = 'accepted' where requester = v_other and addressee = v_uid;
    return 'accepted';
  end if;

  insert into public.friendships (requester, addressee) values (v_uid, v_other);
  return 'pending';
end $$;

-- Responde a una petición recibida: aceptar o rechazar.
create or replace function public.respond_friend(p_username text, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_other uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select id into v_other from public.profiles where lower(username) = lower(coalesce(p_username, ''));
  if v_other is null then raise exception 'user_not_found'; end if;
  if p_accept then
    update public.friendships set status = 'accepted'
      where requester = v_other and addressee = v_uid and status = 'pending';
  else
    delete from public.friendships where requester = v_other and addressee = v_uid and status = 'pending';
  end if;
  if not found then raise exception 'not_found'; end if;
end $$;

-- Quita a un amigo, o cancela una petición enviada, o retira una recibida.
create or replace function public.remove_friend(p_username text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_other uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select id into v_other from public.profiles where lower(username) = lower(coalesce(p_username, ''));
  if v_other is null then raise exception 'user_not_found'; end if;
  delete from public.friendships
    where (requester = v_uid and addressee = v_other) or (requester = v_other and addressee = v_uid);
end $$;

-- Mis amigos y mis peticiones. De cada amigo: nombre, nivel, marco, avatar y victorias online.
-- Las peticiones no llevan avatar: solo se ve el de quien ya es amigo.
create or replace function public.my_friends()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  return jsonb_build_object(
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', p.username,
               'avatar', p.avatar,
               'level', public._level_of_xp(coalesce((p.progress ->> 'xp')::numeric, 0)),
               'frame', public._frame_for(p.frame, public._level_of_xp(coalesce((p.progress ->> 'xp')::numeric, 0)))
             ) order by lower(p.username))
      from public.friendships f
      join public.profiles p on p.id = case when f.requester = v_uid then f.addressee else f.requester end
      where f.status = 'accepted' and v_uid in (f.requester, f.addressee) and p.username is not null
    ), '[]'::jsonb),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.username) order by f.created_at)
      from public.friendships f join public.profiles p on p.id = f.requester
      where f.addressee = v_uid and f.status = 'pending' and p.username is not null
    ), '[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.username) order by f.created_at)
      from public.friendships f join public.profiles p on p.id = f.addressee
      where f.requester = v_uid and f.status = 'pending' and p.username is not null
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.set_avatar(text), public.add_friend(text), public.respond_friend(text, boolean),
  public.remove_friend(text), public.my_friends() from public, anon;
grant execute on function public.set_avatar(text), public.add_friend(text), public.respond_friend(text, boolean),
  public.remove_friend(text), public.my_friends() to authenticated;
