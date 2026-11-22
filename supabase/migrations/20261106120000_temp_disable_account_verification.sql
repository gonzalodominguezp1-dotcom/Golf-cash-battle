-- TEMPORAL: desactiva la fase de verificación de cuenta (confirmación de email, verificación de
-- identidad/DNI y control de edad). Las mesas con entrada dejan de exigirlas.
--
-- Se mantienen: cuenta real (no anónima) y el bloqueo por revisión de riesgo ('account_review').
--
-- Para restaurar la verificación, volver a aplicar la definición original de _paid_block de
-- supabase/migrations/20261019140000_accounts_kyc_antibot.sql.

create or replace function public._paid_block(p_uid uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when u.id is null or u.is_anonymous then 'account_required'
    when coalesce(r.status, 'ok') in ('review', 'blocked') then 'account_review'
  end
  from (select p_uid as id) x
  left join auth.users u on u.id = x.id
  left join public.player_risk r on r.user_id = x.id
$$;
