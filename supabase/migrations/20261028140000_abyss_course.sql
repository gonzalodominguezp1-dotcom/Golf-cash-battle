-- Hoyo nuevo: El Abismo (agujeros de pared a pared que solo se cruzan saltando
-- desde una rampa). Como antes: primero se despliega submit-hole con el hoyo
-- nuevo y después se sube el número.
update public.app_config set value = '20' where key = 'course_count';
