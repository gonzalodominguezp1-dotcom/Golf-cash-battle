# Golf Cash Battle

Minigolf 3D para navegador y móvil. Partidas de hasta 8 jugadores con entrada: el que menos golpes hace se lleva el bote menos la comisión de la plataforma.

> **Estado:** prototipo jugable con créditos demo. **No hay dinero real.** Antes de activarlo se cumplen los requisitos de la [constitución](02-DOCS/wiki/sdd/constitution.md) (sección 5, S5.10 y S5.11).

## Qué hay hoy

- **Juego 3D** con Three.js y cámara en tercera persona detrás de la bola. En móvil, deslizar en cualquier parte mueve la cámara; el tiro se carga arrastrando desde la bola hacia atrás. "Ver hoyo" muestra el recorrido entero.
- **Contador de 20 s:** cuando el primero emboca, los demás tienen 20 s. Quien no emboca queda descalificado en ese hoyo. En torneos cuenta desde el más rápido del hoyo y lo comprueba el servidor.
- **20 hoyos** en distintos ambientes (pradera, playa, atardecer, nieve, cañón, otoño, noche y volcán). Cada partida juega 3, iguales para todos. Los hoyos nuevos se añaden al final de `src/game/courses.js` y después se sube `course_count` en `app_config`.
- **Sensación de golpe:** tono de carga, temblor de cámara, onda en el impacto, bola que se aplasta al chocar y cámara lenta en golpes largos. Es solo visual: la física sigue a paso fijo.
- **Rivales en el campo:** los otros 7 juegan el mismo hoyo a la vez, con la misma física. Clasificación en vivo.
- **Skins**, con inventario y progreso.
- **Sonidos** generados en el navegador, con botón para silenciar.
- **Wallet demo:** 100 créditos de bienvenida, recargas demo e historial de movimientos.
- **Niveles de mesa:** Práctica (gratis), Bronce (entrada 1), Plata (5), Oro (10), Diamante (25) y Esmeralda (50). Bote = entrada × 8. Premio = bote − 10 %. Los empates reparten el premio.

Las reglas económicas están en `src/config.js`.

## Empezar

Requisitos: Node 22 (CI usa 22; `engines` pide 20 o superior) y pnpm 11.24.0.

```bash
git clone https://github.com/gonzalodominguezp1-dotcom/Golf-cash-battle.git
cd Golf-cash-battle
pnpm install
pnpm dev          # muestra una URL "Network" para abrir desde el móvil en la misma wifi
```

- Sin configurar nada, `pnpm dev` usa el backend de Supabase de producción (`oyawgvqbmvtmlnyqwgdf`).
- Para jugar sin servidor: `VITE_BACKEND=local pnpm dev`.

## Scripts

```bash
pnpm dev                 # servidor de desarrollo
pnpm test                # pruebas de juego, economía, progreso, antibots y skins
pnpm run build           # build de producción
pnpm run sync:functions  # copia física y réplica a las Edge Functions
```

## Flujo de trabajo

- El equipo trabaja en una rama y abre un PR contra `main`.
- GitHub Actions ejecuta `pnpm test` y `pnpm run build`, y `deno check` sobre las Edge Functions.
- Al fusionar en `main`, Vercel publica la web. Cada PR tiene su vista previa.
- El panel de administración está en `/admin.html`.
- Los cambios de base de datos van como migración nueva en `supabase/migrations/`. Las Edge Functions están en `supabase/functions/`.
- Antes de cambiar `src/game/physics.js`, `replay.js` o `courses.js`: ejecutar `pnpm run sync:functions` y volver a desplegar `submit-hole`.

Las reglas completas están en la [constitución del proyecto](02-DOCS/wiki/sdd/constitution.md).

## Backend (Supabase)

Proyecto `golf-cash-battle` (`oyawgvqbmvtmlnyqwgdf`). Cada jugador entra como invitado (cuenta anónima) y recibe 100 créditos demo.

- **Tablas principales:** `wallets`, `transactions`, `matches`, `match_players`, `tiers`, `app_config`, `profiles`, `tournaments`, `tournament_entries`, `tournament_holes`, `shot_signals`, `player_risk`, `held_payouts`, `deposits`. RLS: cada usuario solo lee lo suyo y nadie escribe directamente.
- **El saldo cambia solo dentro de funciones del servidor:** `join_match`, `submit_hole`, `finish_match`, `abandon_match`, `demo_deposit`, y para torneos `join_tournament`, `start_round`, `leave_tournament`, `tournament_status`, `my_tournaments`.
- **Configuración en el panel de Supabase:**
  - Authentication → Sign In / Providers: activar *Allow anonymous sign-ins* y *Allow manual linking*.
  - URL Configuration: la dirección de la web (Vercel) como Site URL y en Redirect URLs.
  - Para que el email traiga código además de enlace, añadir `{{ .Token }}` a las plantillas *Change email address* y *Magic link*.

### Validación de golpes

El cliente no manda cuántos golpes hizo, solo cada tiro (`tick`, `yaw`, `power`). La Edge Function `submit-hole` repite el hoyo con la misma física (`src/game/replay.js`). La física usa operaciones exactas en IEEE 754, así que da el mismo resultado en el navegador y en el servidor.

Los rivales no ven las puntuaciones hasta terminar su ronda. Al final, todos hacen un tiro de desempate, que solo cuenta si hay empate en cabeza.

### Cuentas

- Se empieza como invitado. Al añadir un email (pestaña Cuenta), la misma cuenta pasa a permanente y conserva saldo, nivel y skins.
- Para entrar desde otro móvil se pide un enlace o código por email.
- Perfil en `profiles` (nombre público y progreso), con las funciones `my_profile`, `set_username` y `save_progress`.

### Torneos

- Torneos asíncronos de 8 plazas. Cada jugador juega los mismos hoyos a su ritmo (20 min para terminar).
- El bote se reparte cuando han terminado todos y la mesa está llena, o cuando se cierra la inscripción (15 min).
- Si al cerrar solo hay un jugador, se le devuelve la entrada.

### Antibots

- `submit-hole` guarda en `shot_signals` el tiempo de cada tiro con la bola parada y el gesto del dedo.
- `src/antibot/risk.js` busca tiros instantáneos, tiempos robóticos, tiros sin gesto y precisión imposible, comparados con la media del hoyo.
- Una cuenta marcada (`player_risk`) no entra en mesas de pago, y sus premios van a `held_payouts`.
- Revisión manual en el editor SQL: `select review_player('<id>', 'cleared')` libera los premios; `'blocked'` los bloquea.
- Los umbrales están en `app_config.antibot`.

### Verificación de identidad

- Edge Function `kyc`, con proveedor intercambiable (`supabase/functions/kyc/providers.ts`).
- Con los secrets `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` y `DIDIT_WEBHOOK_SECRET` usa Didit (documento y selfie). Su webhook va a `https://oyawgvqbmvtmlnyqwgdf.supabase.co/functions/v1/kyc/webhook`.
- Sin esos secrets funciona en modo pruebas: fecha de nacimiento y número de documento escritos a mano. Este modo no es válido para dinero real.

### Depósitos cripto (en pruebas)

- Edge Functions `crypto-deposit` y `nowpayments-ipn`, tabla `deposits`.
- El saldo solo sube cuando llega el aviso firmado con estado `finished`, una vez por depósito.
- Secrets: `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` y `NOWPAYMENTS_SANDBOX` (por defecto, pruebas).
- URL del IPN: `https://oyawgvqbmvtmlnyqwgdf.supabase.co/functions/v1/nowpayments-ipn`.

## Claves y seguridad

- La clave pública de Supabase (`sb_publishable_…`) está en `src/backend/supabase.js`. Es pública por diseño: solo permite lo que RLS y las funciones dejan hacer. Se puede cambiar con `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY`.
- La clave `service_role` nunca va al cliente ni al repositorio. Solo existe como secret de las Edge Functions.
- Los secretos van en variables de entorno o en los secrets del proveedor. `.env` no se versiona.

## Dinero real: pendiente

Estos puntos deben cumplirse antes de activarlo (constitución S5.10 y S5.11):

- Proveedor de identidad real (Didit o equivalente) en lugar del modo pruebas.
- Antibots y anticheat implementados, revisados y ajustados con datos reales.
- Revisión legal del modelo de habilidad por país.
- Pasarela de pagos en producción.
- Auditoría de RLS y de las funciones `SECURITY DEFINER`.
- Protección contra abuso en el registro anónimo.

## Estructura

- `src/game/`: física (sin Three.js, reutilizable en el servidor), hoyos (`courses.js`), ambientaciones (`themes.js`), bots, sonidos y render 3D (`render/`).
- `src/wallet/`: interfaz `WalletService`, `LocalWallet` (demo local) y `SupabaseWallet`.
- `src/backend/`: elige el backend y conecta con Supabase.
- `src/match/`: matchmaking, puntuación y reparto del bote (`MatchService` local, `SupabaseMatchService`, `TournamentService`).
- `src/account/`: cuenta, email y verificación de identidad.
- `src/antibot/`: nota de riesgo a partir de las señales de cada hoyo.
- `src/progress/` y `src/ui/`: progreso, inventario, skins y componentes de interfaz.
- `supabase/functions/`: `submit-hole`, `kyc`, `crypto-deposit`, `nowpayments-ipn`.
- `supabase/migrations/`: cambios de base de datos, en orden.
- `02-DOCS/`: wiki del proyecto. Empieza por [`02-DOCS/wiki/index.md`](02-DOCS/wiki/index.md).
