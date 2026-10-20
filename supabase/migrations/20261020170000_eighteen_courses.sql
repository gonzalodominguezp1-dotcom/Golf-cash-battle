-- Ocho hoyos nuevos (Looping Neón, Doble Looping, Molino Neón, Tubos Neón,
-- El Molino, Molinos de Noche, Las Tuberías, Looping Nocturno). Como antes:
-- primero se despliega submit-hole con los hoyos nuevos y después se sube el número.
update public.app_config set value = '18' where key = 'course_count';
