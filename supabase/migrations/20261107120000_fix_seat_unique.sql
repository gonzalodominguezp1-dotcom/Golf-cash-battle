-- Arregla: nadie podía entrar en ningún torneo (join_tournament -> 409 / 23505).
--
-- Al salir de una sala (o al echar a quien no empezó) el asiento se pasa a negativo con
-- seat = -1 - seat. Ese asiento queda libre, otro jugador lo ocupa y, si también sale, su
-- asiento 0 vuelve a pasar a -1 y choca con el del primero en unique (tournament_id, seat).
-- _settle_tournament falla, el torneo nunca se liquida y, como join_tournament llama antes a
-- _settle_due(), bloquea las entradas de todos en todas las mesas.
--
-- Ahora el asiento solo es único entre quienes siguen dentro (left_at is null).
-- _enter_tournament ya elige solo entre asientos 0..seats-1 sin ocupar, así que no cambia.
-- Al aplicarla, el torneo atascado se liquida solo en el siguiente join_tournament.

alter table public.tournament_entries drop constraint if exists tournament_entries_tournament_id_seat_key;

create unique index if not exists tournament_entries_active_seat_idx
  on public.tournament_entries (tournament_id, seat) where left_at is null;
