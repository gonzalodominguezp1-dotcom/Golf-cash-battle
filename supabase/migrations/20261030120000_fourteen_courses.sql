-- Se quitan siete hoyos (La Recta, El Codo, La Colina, El Volcán, Molino Neón,
-- El Molino, Looping Nocturno) y los índices se renumeran. Como antes: primero
-- se despliega submit-hole con el catálogo nuevo y después se baja el número.
update public.app_config set value = '14' where key = 'course_count';
