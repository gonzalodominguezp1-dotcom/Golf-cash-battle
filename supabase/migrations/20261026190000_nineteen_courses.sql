-- Un hoyo nuevo (El Molino del Prado, índice 18). Como antes: primero se despliega
-- submit-hole con el hoyo nuevo y después se sube el número.
update public.app_config set value = '19' where key = 'course_count';
