# Golf Cash Battle

Minigolf 3D para móvil (navegador) con partidas de 8 jugadores y entry fee: el que menos golpes hace se lleva el bote menos la comisión de la plataforma.

## Qué hay en este prototipo

- **Juego 3D** con Three.js y cámara en tercera persona detrás de la bola. Desliza a los lados para apuntar y hacia abajo para cargar la potencia; "Ver hoyo" muestra el recorrido entero.
- **5 hoyos** con su ambiente (pradera, playa, atardecer, nieve y cañón): setas rebotadoras, arena, aspa giratoria, aceleradores y bloques móviles. Cada partida juega 3, los mismos para todos.
- **Rivales en el campo**: los otros 7 juegan el mismo hoyo a la vez, con la misma física, y su resultado es el que hacen ahí. Clasificación en vivo arriba. En producción serán jugadores reales.
- **Sonidos** generados en el navegador (madera, hoyo, campanas, ambiente), con botón para silenciar.
- **Wallet** de créditos demo (100 de bienvenida, recargas demo, historial de movimientos). Sin dinero real.
- **Partidas** Práctica (gratis), Bronce 1, Plata 5, Oro 10 y Diamante 25. Bote = entrada × 8; premio = bote − 10%. Empates reparten el premio.

Las reglas económicas están en `src/config.js`.

## Desarrollo

```bash
npm install
npm run dev      # abre la URL "Network" desde el móvil en la misma wifi
npm test         # reparto del bote y wallet
npm run build
```

## Backend (Supabase)

Proyecto `golf-cash-battle` (`oyawgvqbmvtmlnyqwgdf`). Cada jugador entra como invitado (cuenta anónima) y recibe 100 créditos demo.

- Tablas: `wallets`, `transactions`, `matches`, `match_players`, `tiers`, `app_config`. RLS: cada usuario solo lee lo suyo y nadie escribe directamente.
- El saldo solo cambia dentro de funciones del servidor: `join_match` (cobra la entrada y elige los hoyos), `submit_hole`, `finish_match` (reparte el bote y la comisión), `abandon_match` (devuelve la entrada si no se ha jugado), `demo_deposit`.
- Requisito: en el panel de Supabase, Authentication → Sign In / Providers → activar *Allow anonymous sign-ins*.
- `VITE_BACKEND=local` usa la demo en el navegador (la vista previa). Si Supabase no responde, la app pasa sola a modo local.
- Depósitos cripto con NOWPayments (Edge Functions `crypto-deposit` y `nowpayments-ipn`, tabla `deposits`). El saldo solo sube cuando llega el aviso firmado con estado `finished`, una vez por depósito. Secrets: `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` y `NOWPAYMENTS_SANDBOX` (por defecto pruebas). URL del IPN: `https://oyawgvqbmvtmlnyqwgdf.supabase.co/functions/v1/nowpayments-ipn`.
- Torneos contra jugadores reales (mesas de pago): asíncronos, 8 plazas. Cada uno juega los mismos hoyos a su ritmo (20 min para terminar) y el bote se reparte cuando han terminado todos y la mesa está llena o se cierra la inscripción (15 min). Si al cerrar solo hay un jugador, se le devuelve la entrada. Tablas `tournaments`, `tournament_entries`, `tournament_holes`; funciones `join_tournament`, `start_round`, `leave_tournament`, `tournament_status`, `my_tournaments` (migración en `supabase/migrations/`).
- Validación de golpes: el cliente no manda cuántos golpes hizo, solo cada tiro (`tick`, `yaw`, `power`). La Edge Function `submit-hole` repite el hoyo con la misma física (`src/game/replay.js`) y guarda los golpes que salen. La física solo usa operaciones exactas en IEEE 754, así que da el mismo resultado en cualquier navegador y en el servidor. Tras tocar `src/game/physics.js`, `replay.js` o `courses.js`: `npm run sync:functions` y volver a desplegar `submit-hole`.
- Las puntuaciones de los rivales no se ven hasta que terminas tu ronda. Todos hacen al final un tiro de desempate, que solo cuenta si hay empate en cabeza.
- La práctica se juega en el móvil contra rivales simulados. Las partidas contra bots del prototipo (`join_match`) ya no admiten entrada de pago.
- Cuentas: se empieza como invitado (cuenta anónima). Al añadir el email (pestaña Cuenta) la misma cuenta pasa a permanente y conserva saldo, nivel y skins. Para entrar en otro móvil se pide un enlace o código por email. Perfil en `profiles` (nombre público, progreso); funciones `my_profile`, `set_username`, `save_progress`. Requisitos en el panel: Authentication → Sign In / Providers → *Allow manual linking* activado, y en URL Configuration la dirección de la web (GitHub Pages) como Site URL. Para que el email traiga código además de enlace, añadir `{{ .Token }}` a las plantillas *Change email address* y *Magic link*.
- Mesas con entrada: solo con email confirmado, +18 e identidad verificada; una identidad = una cuenta (se guarda un hash del documento, no el número). Lo comprueba un trigger en `tournament_entries` (`_paid_block`), así que no se puede saltar desde el cliente.
- Verificación de identidad: Edge Function `kyc` con proveedor intercambiable (`supabase/functions/kyc/providers.ts`). Con los secrets `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` y `DIDIT_WEBHOOK_SECRET` usa Didit (documento + selfie) y su webhook va a `https://oyawgvqbmvtmlnyqwgdf.supabase.co/functions/v1/kyc/webhook`. Sin ellos funciona en modo pruebas: fecha de nacimiento y número de documento escritos a mano. Antes de dinero real hay que poner Didit.
- Antibots: `submit-hole` guarda en `shot_signals` cuánto tarda cada tiro con la bola parada y el gesto del dedo que manda el móvil, y `src/antibot/risk.js` busca tiros instantáneos, tiempos robóticos, tiros sin gesto y precisión imposible frente a la media de todos en ese hoyo. Una cuenta marcada (`player_risk`) no entra en mesas de pago y sus premios van a `held_payouts`. Para revisarla, en el editor SQL: `select review_player('<id>', 'cleared')` (libera los premios) o `'blocked'`. Los umbrales se pueden cambiar en `app_config.antibot`.
- Publicación: `.github/workflows/pages.yml` publica en GitHub Pages al hacer push a `main` (Settings → Pages → Source: GitHub Actions).

## Estructura

- `src/game/` física (sin Three.js, reutilizable en servidor), hoyos, ambientaciones (`themes.js`), sonidos y render 3D (`render/`)
- `src/wallet/` interfaz `WalletService`, `LocalWallet` (demo local) y `SupabaseWallet`
- `src/backend/` elige backend y conecta con Supabase
- `src/match/` matchmaking, puntuación y reparto del bote (`MatchService` local con bots, `TournamentService` para torneos reales)
- `src/account/` cuenta, email y verificación de identidad
- `src/antibot/` nota de riesgo a partir de las señales de cada hoyo
- `supabase/functions/submit-hole/` repite los tiros en el servidor; `game/` y `antibot/` son copias de `src/` (`npm run sync:functions`)
- `supabase/functions/kyc/` verificación de identidad y su webhook

## Pendiente para dinero real

- Poner las claves de Didit (o del proveedor elegido) en lugar del modo pruebas.
- El antibots sube el coste de hacer trampas pero un bot cuidadoso puede imitar tiempos y gestos; lo que más frena es la precisión imposible, la retención de premios y que una identidad verificada solo tenga una cuenta. Hará falta revisar a mano las cuentas marcadas y ajustar los umbrales con datos reales.
- Pasarela de pagos y revisión legal del modelo de habilidad por país.
