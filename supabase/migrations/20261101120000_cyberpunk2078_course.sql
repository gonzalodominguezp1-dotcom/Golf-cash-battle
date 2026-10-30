-- Hoyo nuevo: Cyberpunk2078 (acelerador, looping grande de radio 1,2 y un portal
-- que salta el muro). Como antes: primero se despliega submit-hole con el hoyo
-- nuevo y después se sube el número. No aplicar antes que la función.
update public.app_config set value = '15' where key = 'course_count';
