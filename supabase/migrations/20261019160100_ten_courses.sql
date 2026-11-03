-- Cinco hoyos nuevos (La Colina, El Portal, Molinos, El Volcán, La Herradura).
-- Los torneos eligen sus hoyos entre 0 y course_count - 1, así que primero hay
-- que desplegar submit-hole con los hoyos nuevos y después subir este número.
update public.app_config set value = '10' where key = 'course_count';
