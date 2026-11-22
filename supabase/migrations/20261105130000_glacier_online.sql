-- El Glaciar entra en las partidas online. Su máximo de 12 golpes ya está en
-- course_max_strokes (20261105120000_temple_online.sql).
update public.app_config set value = '17' where key = 'course_count';
