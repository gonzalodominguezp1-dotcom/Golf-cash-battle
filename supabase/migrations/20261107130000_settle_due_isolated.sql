-- Un torneo que no se puede liquidar ya no bloquea las entradas de todos.
--
-- join_tournament, tournament_status, etc. llaman antes a _settle_due(). Si liquidar UN torneo
-- lanzaba un error (como el choque de asientos de 20261107120000), el error subía hasta
-- join_tournament y nadie podía entrar en ninguna mesa. Ahora cada torneo se liquida en su
-- propio subbloque: si falla, se deshace solo ese torneo, se deja un aviso en el log de
-- Postgres y se sigue con los demás. El torneo roto queda abierto hasta que se arregle.
--
-- Mismo cuerpo que la definición de 20261103180000_live_matches.sql, más el bloque exception.

create or replace function public._settle_due()
returns void language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  for v in
    select t.id from public.tournaments t
    where t.status = 'open' and (t.starts_at is null or t.starts_at <= now())
      and not public._tournament_live(t.id)
    order by t.created_at limit 20
    for update skip locked
  loop
    begin
      perform public._settle_tournament(v);
    exception when others then
      raise warning '_settle_due: el torneo % no se pudo liquidar (%: %)', v, sqlstate, sqlerrm;
    end;
  end loop;
end $$;

revoke all on function public._settle_due() from public, anon, authenticated;
