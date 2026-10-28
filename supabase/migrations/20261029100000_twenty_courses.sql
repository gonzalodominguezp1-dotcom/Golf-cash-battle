-- Hoyo nuevo: El Molino del Prado (molino, looping y aceleradores). Como antes:
-- primero se despliega submit-hole con el hoyo nuevo y después se sube el número.
update public.app_config set value = '20' where key = 'course_count';
