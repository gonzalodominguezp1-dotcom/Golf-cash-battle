# Arquitectura y stack

## Stack

- **Front:** JavaScript con módulos ES, Vite 5 y Three.js 0.169. Sin framework de interfaz.
- **Backend:** Supabase (Postgres con RLS, autenticación, Edge Functions en Deno).
- **Gestor de paquetes:** pnpm 11.24.0. Node 22 en CI (`engines` pide 20 o superior).
- **Despliegue:** Vercel para la web, Supabase para la base de datos y las funciones.

## Carpetas de `src/`

- `src/game/`: física, hoyos, ambientaciones, bots, sonidos y render 3D. La física no usa Three.js, así que se puede reutilizar en el servidor.
  - `src/game/render/`: todo lo que dibuja la escena, incluidas las skins premium (`skins/`).
- `src/wallet/`: interfaz `WalletService` con dos implementaciones, `LocalWallet` (demo local) y `SupabaseWallet`.
- `src/backend/`: elige el backend según `VITE_BACKEND` y conecta con Supabase.
- `src/match/`: matchmaking, puntuación y reparto del bote. Tiene `MatchService` (local), `SupabaseMatchService` y `TournamentService`.
- `src/account/`: cuenta, email y verificación de identidad.
- `src/antibot/`: nota de riesgo a partir de las señales de cada hoyo.
- `src/progress/`: progreso, inventario y skins.
- `src/ui/`: componentes de interfaz, incluido el inspector de skins y la animación de desbloqueo.
- `src/admin/`: panel de administración (se sirve desde `admin.html`).
- `src/config.js`: reglas económicas de la plataforma.

## Otras carpetas

- `supabase/functions/`: Edge Functions `submit-hole`, `kyc`, `crypto-deposit` y `nowpayments-ipn`.
- `supabase/migrations/`: cambios de base de datos en orden cronológico. Nunca se editan migraciones ya aplicadas; se añade una nueva.
- `tests/`: pruebas con `node --test` (economía, hoyos, física, antibots, progreso, skins, temporizador).
- `scripts/`: `sync-functions.mjs`, que copia la física a las Edge Functions.
- `01-TOOLS/`: plantillas de herramientas del harness. No forma parte del juego.
- `02-DOCS/`: esta wiki.

## Cómo se conectan las partes

1. El cliente calcula la física del tiro en el navegador y pinta la escena con Three.js.
2. Al terminar un hoyo, el cliente envía solo el tiro (`tick`, `yaw`, `power`), no el número de golpes.
3. La Edge Function `submit-hole` repite el hoyo con la misma física (`src/game/replay.js`) y calcula los golpes.
4. Las funciones SQL de Supabase cambian los saldos. Las tablas no se escriben directamente desde el cliente.

Detalle en [Backend en Supabase](../backend/supabase.md) y [Validación de golpes y antibots](../backend/validacion-y-antibots.md).

## Dónde se toca la física

Antes de cambiar `src/game/physics.js`, `replay.js` o `courses.js`: ejecutar `pnpm run sync:functions` y volver a desplegar `submit-hole`. Si no se hace, el servidor y el cliente darán resultados distintos.
