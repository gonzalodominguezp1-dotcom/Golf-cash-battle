# Validación de golpes y antibots

## Por qué el servidor repite cada tiro

El cliente no envía cuántos golpes hizo. Solo envía cada tiro (`tick`, `yaw`, `power`). La Edge Function `submit-hole` repite el hoyo con la misma física (`src/game/replay.js`) y es ella quien decide los golpes.

La física usa operaciones exactas en IEEE 754, así que da el mismo resultado en el navegador y en el servidor. Si cambia la física en un lado y no en el otro, las partidas se rompen. Por eso el cambio de `physics.js`, `replay.js` o `courses.js` exige `pnpm run sync:functions` y volver a desplegar `submit-hole`.

## Señales antibot

- `submit-hole` guarda en `shot_signals` el tiempo de cada tiro con la bola parada y el gesto del dedo.
- `src/antibot/risk.js` busca cuatro cosas, comparadas con la media del hoyo:
  - tiros instantáneos,
  - tiempos robóticos,
  - tiros sin gesto,
  - precisión imposible.

## Qué pasa con una cuenta marcada

- Se registra en `player_risk`.
- No entra en mesas de pago.
- Sus premios van a `held_payouts` en vez de pagarse.

## Revisión manual

En el editor SQL de Supabase:

- `select review_player('<id>', 'cleared')`: libera los premios.
- `select review_player('<id>', 'blocked')`: bloquea los premios.

## Umbrales

Están en `app_config.antibot`. Se ajustan con datos reales de partidas, no a ojo.

## Pendiente

Antibots y anticheat deben estar revisados y ajustados con datos reales antes de dinero real (ver [pendiente antes de dinero real](../operacion/dinero-real-pendiente.md)).
