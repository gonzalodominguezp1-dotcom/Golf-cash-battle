-- Catálogo de marcos de avatar: 18 ilustraciones (f_*) que sustituyen a los antiguos p25..p150.
-- Los ids, niveles y retos son los de FRAMES en src/progress/prestige.js. Cada marco se consigue por:
--   level : nivel (sale de la XP guardada),
--   stat  : una estadística de profiles.progress que alcance la meta (los mismos retos de CHALLENGES),
--   award : un hito de ranking concedido por el servidor (ranking_awards).

create or replace function public._frame_rules()
returns table (id text, kind text, key text, goal int) language sql immutable set search_path = '' as $$
  select * from (values
    ('f_rustic', 'level', null, 5), ('f_scifi', 'level', null, 15), ('f_cyber', 'level', null, 25),
    ('f_sakura', 'level', null, 40), ('f_toxic', 'level', null, 55), ('f_frost', 'level', null, 70),
    ('f_magma', 'level', null, 90), ('f_vortex', 'level', null, 110), ('f_arcane', 'level', null, 130),
    ('f_emperor', 'level', null, 150),
    ('f_roulette', 'stat', 'bigWins', 1), ('f_kraken', 'stat', 'matches', 50), ('f_pharaoh', 'stat', 'wins', 50),
    ('f_oni', 'stat', 'bestStreak', 5), ('f_thunder', 'stat', 'birdies', 50), ('f_astral', 'stat', 'aces', 3),
    ('f_phoenix', 'award', 'weekly_top10', 1), ('f_void', 'award', 'hist_top100', 1)
  ) as v(id, kind, key, goal)
$$;

-- ¿Ha conseguido este usuario ese marco? (id desconocido = no)
create or replace function public._frame_open(p_uid uuid, p_frame text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public._frame_rules() r
    left join public.profiles p on p.id = p_uid
    where r.id = p_frame and (
      (r.kind = 'level' and public._level_of_xp(coalesce((p.progress ->> 'xp')::numeric, 0)) >= r.goal)
      or (r.kind = 'stat' and coalesce((p.progress ->> r.key)::numeric, 0) >= r.goal)
      or (r.kind = 'award' and (select count(*) from public.ranking_awards a where a.user_id = p_uid and a.kind = r.key) >= r.goal)
    )
  )
$$;

-- Marco que se luce: el guardado si existe (set_frame ya comprobó que lo había conseguido; los retos y
-- hitos no se pierden) o, si el guardado es de nivel, que el nivel lo cubra; si no, el de nivel más alto alcanzado, o null.
create or replace function public._frame_for(p_frame text, p_level int)
returns text language sql immutable set search_path = '' as $$
  select coalesce(
    (select r.id from public._frame_rules() r where r.id = p_frame and (r.kind <> 'level' or r.goal <= p_level)),
    (select r.id from public._frame_rules() r where r.kind = 'level' and r.goal <= p_level order by r.goal desc limit 1)
  )
$$;

-- Elige el marco que se luce (null = automático, el de nivel más alto). Solo uno ya conseguido.
create or replace function public.set_frame(p_frame text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_frame is not null and not public._frame_open(v_uid, p_frame) then
    raise exception 'bad_request';
  end if;
  update public.profiles set frame = p_frame, updated_at = now() where id = v_uid;
  return p_frame;
end $$;

-- Los marcos antiguos (p25..p150) ya no existen: vuelven al automático.
update public.profiles set frame = null where frame ~ '^p[0-9]+$';

revoke all on function public._frame_rules(), public._frame_open(uuid, text) from public, anon, authenticated;
revoke all on function public.set_frame(text) from public, anon;
grant execute on function public.set_frame(text) to authenticated;
