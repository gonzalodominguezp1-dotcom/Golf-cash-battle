-- Contador del hoyo: 30 s en vez de 20 s. Cuando el primero emboca, los demás
-- tienen hole_time_limit segundos para embocar o quedan descalificados.
-- Las funciones ya leen el valor de app_config (_cfg('hole_time_limit')),
-- así que basta con cambiar la fila.

insert into public.app_config (key, value) values ('hole_time_limit', '30')
on conflict (key) do update set value = excluded.value;
