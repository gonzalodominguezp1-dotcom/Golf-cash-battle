-- Presencia: cada jugador con la app abierta manda un latido; «conectado» = latido en los últimos 90 s.
-- my_friends añade `online` a cada amigo para que Mesas invite y forme grupo solo con los conectados.

alter table public.profiles add column if not exists last_seen timestamptz;

create or replace function public.touch_presence()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.profiles set last_seen = now() where id = auth.uid();
end $$;

-- Igual que la versión de avatar_friends, más el campo `online` de cada amigo.
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
               'frame', public._frame_for(p.frame, public._level_of_xp(coalesce((p.progress ->> 'xp')::numeric, 0))),
               'online', coalesce(p.last_seen > now() - interval '90 seconds', false)
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

revoke all on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;
