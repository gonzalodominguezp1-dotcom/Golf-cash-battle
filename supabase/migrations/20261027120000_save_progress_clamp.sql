-- Correcciones de revisión sobre save_progress (D3 y D5). NO sustituye a la migración
-- 20261026120000: la redefine con CREATE OR REPLACE.
--  * D3: los topes (+20 por contador, +2000 de xp) ahora RECORTAN el valor en vez de
--    rechazar el guardado entero. Así varias partidas sin sincronizar no bloquean xp ni
--    victorias: el servidor avanza como mucho el tope por guardado y alcanza al cliente
--    en los siguientes (el cliente reenvía siempre el acumulado). Sigue sin haber saltos
--    absurdos y los valores nunca bajan.
--  * D5: seed y float de una skin nueva ya no se toman del cliente: se derivan aquí con un
--    hash determinista de (auth.uid(), id de skin), así que no se pueden elegir. Limitación:
--    (1) la fórmula es md5, distinta de la de JS (FNV-1a, clave deviceId), por lo que el
--    valor local previo a la primera sincronización puede diferir; manda el del servidor
--    (Progress.attach ya lo respeta). (2) wearRange: el servidor sólo conoce la tabla
--    v_narrow de abajo (míticas, 0..0.15); una skin con wearRange estrecho nueva debe
--    añadirse en una migración posterior, si no usará 0..1. (3) El servidor no sabe qué
--    skins están desbloqueadas (no hay tabla de requisitos), así que una skin cualquiera
--    puede darse de alta: es sólo cosmético y el máximo sigue siendo 64 entradas.
-- SQL no probado contra Postgres.
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
  v_inv_old jsonb;
  v_inv jsonb;
  v_in jsonb;
  v_e jsonb;
  v_o jsonb;
  v_entry jsonb;
  v_c numeric;
  v_cprev numeric;
  v_counter jsonb;
  ck text;
  sk text;
  v_h bigint;
  v_seed bigint;
  v_u numeric;
  v_hi numeric;
  v_narrow text[] := array['event_horizon','midas_touch'];
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
    -- exceso: se recorta al tope por guardado (no se rechaza todo el guardado)
    if not v_first and k = 'xp' and v > v_prev + 2000 then v := v_prev + 2000; end if;
    if not v_first and k <> 'xp' and k <> 'streak' and v > v_prev + 20 then v := v_prev + 20; end if;
    v_new := v_new || jsonb_build_object(k, v);
  end loop;
  v_new := v_new || jsonb_build_object('equipped',
    case when jsonb_typeof(p_state -> 'equipped') = 'string' and length(p_state ->> 'equipped') <= 32
         then p_state ->> 'equipped' else coalesce(v_old ->> 'equipped', 'classic') end);

  -- inventario: parte de lo guardado y le suma/actualiza lo que llega
  v_inv_old := case when jsonb_typeof(v_old -> 'inventory') = 'object' then v_old -> 'inventory' else '{}'::jsonb end;
  v_inv := v_inv_old;
  v_in := p_state -> 'inventory';
  if v_in is not null and jsonb_typeof(v_in) = 'object' then
    if (select count(*) from jsonb_object_keys(v_in)) > 64 then raise exception 'progress_rejected'; end if;
    for sk, v_e in select * from jsonb_each(v_in) loop
      if length(sk) < 1 or length(sk) > 32 or jsonb_typeof(v_e) <> 'object' then raise exception 'progress_rejected'; end if;
      v_o := v_inv_old -> sk;
      if v_o is null and (select count(*) from jsonb_object_keys(v_inv)) >= 64 then raise exception 'progress_rejected'; end if;
      -- seed y float: los de siempre si ya existen; si no, se derivan en el servidor
      if v_o is not null then
        v_entry := jsonb_build_object('seed', v_o -> 'seed', 'float', v_o -> 'float',
                                      'unlockedAt', v_o -> 'unlockedAt');
      else
        v_h := ('x' || substr(md5('seed|' || v_uid::text || '|' || sk), 1, 8))::bit(32)::bigint;
        v_seed := (v_h & 4294967295) % 1000;
        v_h := ('x' || substr(md5('float|' || v_uid::text || '|' || sk), 1, 8))::bit(32)::bigint;
        v_u := ((v_h & 4294967295) % 1000000) / 1000000.0;
        if sk = any (v_narrow) then v_hi := 0.15; else v_hi := 1; end if;
        v_entry := jsonb_build_object('seed', v_seed,
                                      'float', round(v_u * v_hi, 3),
                                      'unlockedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
      end if;
      v_entry := v_entry || jsonb_build_object('variant',
        case when jsonb_typeof(v_e -> 'variant') = 'string' and length(v_e ->> 'variant') <= 16
             then v_e ->> 'variant' else coalesce(v_o ->> 'variant', 'base') end);
      -- contadores: solo suben, +20 como mucho por guardado (el exceso se recorta)
      v_counter := jsonb_build_object('enabled',
        coalesce(case when jsonb_typeof(v_e #> '{counter,enabled}') = 'boolean' then (v_e #>> '{counter,enabled}')::boolean end,
                 (v_o #>> '{counter,enabled}')::boolean, false));
      foreach ck in array array['aces','sinks','birdies'] loop
        v_cprev := coalesce((v_o #>> array['counter', ck])::numeric, 0);
        v_c := case when jsonb_typeof(v_e #> array['counter', ck]) = 'number' then floor((v_e #>> array['counter', ck])::numeric) else null end;
        if v_c is null or v_c < v_cprev then v_c := v_cprev; end if;
        if v_c > v_cprev + 20 then v_c := v_cprev + 20; end if;
        v_counter := v_counter || jsonb_build_object(ck, v_c);
      end loop;
      v_entry := v_entry || jsonb_build_object('counter', v_counter);
      v_inv := v_inv || jsonb_build_object(sk, v_entry);
    end loop;
  end if;
  if v_inv <> '{}'::jsonb then v_new := v_new || jsonb_build_object('inventory', v_inv); end if;

  update public.profiles set progress = v_new, updated_at = now() where id = v_uid;
  return v_new;
end $$;

revoke all on function public.save_progress(jsonb) from public, anon;
grant execute on function public.save_progress(jsonb) to authenticated;
