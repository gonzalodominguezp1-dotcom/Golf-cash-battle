-- Ajustes del jugador en la cuenta, para que valgan en el móvil y en el ordenador:
--  * profiles.settings guarda { sound, quality: { mobile, desktop }, controls, updatedAt }.
--    El cliente (src/settings/settings.js) sanea lo que lee y gana el cambio más reciente.
--  * set_settings(p_settings) los guarda. Solo se aceptan objetos JSON pequeños: son
--    preferencias, no datos de juego, y no dan ninguna ventaja.
--  * my_profile devuelve también 'settings'.

alter table public.profiles add column if not exists settings jsonb;
alter table public.profiles drop constraint if exists profiles_settings_check;
alter table public.profiles add constraint profiles_settings_check check (
  settings is null
  or (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 4096)
);

create or replace function public.set_settings(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_settings is not null
     and (jsonb_typeof(p_settings) <> 'object' or octet_length(p_settings::text) > 4096) then
    raise exception 'bad_request';
  end if;
  update public.profiles set settings = p_settings, updated_at = now() where id = v_uid;
  return p_settings;
end $$;

-- my_profile: igual que en 20261103130000_avatar_friends.sql, más 'settings'
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
      'settings', p.settings,
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

revoke all on function public.set_settings(jsonb) from public, anon;
grant execute on function public.set_settings(jsonb) to authenticated;
