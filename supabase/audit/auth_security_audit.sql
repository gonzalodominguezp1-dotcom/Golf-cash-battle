-- Auditoría de seguridad de Auth y datos. SOLO LEE: se puede pegar entera en el SQL Editor de Supabase.
-- Cada consulta tiene que devolver 0 filas (salvo las marcadas "informativa"). Si devuelve algo, es un fallo a corregir.
-- El esquema base (wallets, profiles, el trigger de alta…) no está en supabase/migrations: esta auditoría es la única
-- forma de comprobar lo que de verdad hay desplegado.

-- 1. Tablas de public sin RLS. Con la clave pública cualquiera las lee y escribe.
select c.relname as tabla_sin_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 2. Políticas que dejan escribir a anon/authenticated directamente (el saldo y los premios solo deben cambiar por funciones).
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');

-- 3. Políticas de lectura abiertas a todo el mundo (using true). Informativa: revisar que sea intencionado.
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and cmd in ('SELECT', 'ALL') and (qual is null or qual in ('true', '(true)'));

-- 4. Privilegios directos de tabla para anon/authenticated distintos de SELECT.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT'
order by table_name, grantee;

-- 5. Funciones de public que anon puede ejecutar (sin sesión). Esperado: ninguna salvo las que la app llame sin entrar.
select p.proname as funcion, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute');

-- 6. Funciones internas (_nombre) ejecutables por anon o authenticated. Esperado: ninguna (solo service_role).
select p.proname as funcion, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like '\_%' escape '\'
  and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));

-- 7. SECURITY DEFINER sin search_path fijo (permite secuestrar funciones con un esquema propio).
select p.proname as funcion
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');

-- 8. Vistas de public que se saltan RLS (security_invoker apagado). Informativa.
select c.relname as vista
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
  and not coalesce((select option_value::boolean from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), false);

-- 9. Cómo se crea la cuenta nueva: qué hace el trigger de alta (saldo inicial, perfil). Informativa.
select t.tgname as trigger, pg_get_triggerdef(t.oid) as definicion
from pg_trigger t
where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;

-- 10. Cuentas con contraseña sin email confirmado o anónimas con saldo. Informativa: tras activar "Confirm email" no debería crecer.
select
  count(*) filter (where is_anonymous) as anonimos,
  count(*) filter (where not coalesce(is_anonymous, false) and email_confirmed_at is null) as email_sin_confirmar,
  count(*) filter (where not coalesce(is_anonymous, false) and email_confirmed_at is not null) as confirmadas
from auth.users;

-- 11. Administradores. Informativa: tiene que ser una lista corta y conocida.
select pg_get_functiondef('public._is_admin()'::regprocedure) as definicion_is_admin;
