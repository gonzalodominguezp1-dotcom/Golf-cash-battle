-- La espera en la sala de matchmaking pasa de 15 a 10 segundos.
-- join_tournament lee live_fill_seconds de app_config (el 15 del código es solo
-- el valor de reserva si la clave faltara; la clave existe desde live_matches).
update public.app_config set value = '10' where key = 'live_fill_seconds';
