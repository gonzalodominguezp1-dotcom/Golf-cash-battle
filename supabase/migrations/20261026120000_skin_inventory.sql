-- Inventario de skins (P4): save_progress acepta `inventory` además de las
-- claves de siempre. Por skin: seed/float inmutables una vez guardados, los
-- contadores solo suben (y como mucho +20 por guardado, igual que aces/birdies),
-- máximo 64 skins y claves de ≤ 32 caracteres. Las entradas ya guardadas nunca
-- se borran. Un estado sin `inventory` conserva el que hubiera. No toca el saldo.
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
      -- seed y float: los de siempre si ya existen; si no, deben ser válidos
      if v_o is not null then
        v_entry := jsonb_build_object('seed', v_o -> 'seed', 'float', v_o -> 'float',
                                      'unlockedAt', v_o -> 'unlockedAt');
      else
        if jsonb_typeof(v_e -> 'seed') <> 'number' or (v_e ->> 'seed')::numeric < 0 or (v_e ->> 'seed')::numeric > 999
           or jsonb_typeof(v_e -> 'float') <> 'number' or (v_e ->> 'float')::numeric < 0 or (v_e ->> 'float')::numeric > 1 then
          raise exception 'progress_rejected';
        end if;
        v_entry := jsonb_build_object('seed', floor((v_e ->> 'seed')::numeric),
                                      'float', (v_e ->> 'float')::numeric,
                                      'unlockedAt', case when jsonb_typeof(v_e -> 'unlockedAt') = 'string'
                                                         then left(v_e ->> 'unlockedAt', 40)
                                                         else to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end);
      end if;
      v_entry := v_entry || jsonb_build_object('variant',
        case when jsonb_typeof(v_e -> 'variant') = 'string' and length(v_e ->> 'variant') <= 16
             then v_e ->> 'variant' else coalesce(v_o ->> 'variant', 'base') end);
      -- contadores: solo suben, +20 como mucho por guardado
      v_counter := jsonb_build_object('enabled',
        coalesce(case when jsonb_typeof(v_e #> '{counter,enabled}') = 'boolean' then (v_e #>> '{counter,enabled}')::boolean end,
                 (v_o #>> '{counter,enabled}')::boolean, false));
      foreach ck in array array['aces','sinks','birdies'] loop
        v_cprev := coalesce((v_o #>> array['counter', ck])::numeric, 0);
        v_c := case when jsonb_typeof(v_e #> array['counter', ck]) = 'number' then floor((v_e #>> array['counter', ck])::numeric) else null end;
        if v_c is null or v_c < v_cprev then v_c := v_cprev; end if;
        if v_c > v_cprev + 20 then raise exception 'progress_rejected'; end if;
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
