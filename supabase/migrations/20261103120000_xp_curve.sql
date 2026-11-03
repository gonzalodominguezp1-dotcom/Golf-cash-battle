-- Curva de XP creciente: pasar del nivel n al n+1 cuesta 200 + 20·(n-1) (xpForLevel en src/progress/Progress.js).
-- XP acumulada para llegar al nivel L = 200·m + 10·m·(m-1), con m = L-1; aquí se despeja m.
create or replace function public._level_of_xp(p_xp numeric)
returns int language sql immutable set search_path = '' as $$
  select 1 + floor((sqrt(36100 + 40 * floor(greatest(p_xp, 0))) - 190) / 20)::int
$$;
