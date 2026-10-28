# Backend en Supabase

Proyecto `golf-cash-battle`. La referencia del proyecto está en el README.

## Cuentas

- Cada jugador entra como invitado (cuenta anónima) y recibe 100 créditos demo.
- Al añadir un email en la pestaña Cuenta, la misma cuenta pasa a permanente y conserva saldo, nivel y skins.
- Para entrar desde otro móvil se pide un enlace o código por email.
- Perfil en `profiles` (nombre público y progreso), con las funciones `my_profile`, `set_username` y `save_progress`.

## Tablas principales

`wallets`, `transactions`, `matches`, `match_players`, `tiers`, `app_config`, `profiles`, `tournaments`, `tournament_entries`, `tournament_holes`, `shot_signals`, `player_risk`, `held_payouts`, `deposits`.

- **RLS:** cada usuario solo lee lo suyo. Nadie escribe directamente en las tablas.
- **Saldo:** solo cambia dentro de funciones del servidor.

## Funciones del servidor

- Partidas: `join_match`, `submit_hole`, `finish_match`, `abandon_match`.
- Demo: `demo_deposit`.
- Torneos: `join_tournament`, `start_round`, `leave_tournament`, `tournament_status`, `my_tournaments`.
- Perfil: `my_profile`, `set_username`, `save_progress`.
- Antibots: `review_player`.

## Edge Functions

| Función | Qué hace | Secrets |
|---|---|---|
| `submit-hole` | Repite el hoyo y calcula los golpes | Ninguno propio |
| `kyc` | Verificación de identidad, con proveedor intercambiable | `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET` |
| `crypto-deposit` | Crea depósitos cripto | `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `NOWPAYMENTS_SANDBOX` |
| `nowpayments-ipn` | Recibe el aviso de pago firmado | Los de NOWPayments |

- El webhook de Didit apunta a `https://oyawgvqbmvtmlnyqwgdf.supabase.co/functions/v1/kyc/webhook`.
- La URL del IPN de NOWPayments es `https://oyawgvqbmvtmlnyqwgdf.supabase.co/functions/v1/nowpayments-ipn`.
- `NOWPAYMENTS_SANDBOX` está activado por defecto (pruebas).

## Depósitos cripto (en pruebas)

- El saldo solo sube cuando llega el aviso firmado con estado `finished`, una vez por depósito.

## Verificación de identidad (KYC)

- Con los secrets de Didit, usa documento y selfie.
- Sin esos secrets funciona en modo pruebas: fecha de nacimiento y número de documento escritos a mano. Este modo no es válido para dinero real.
- El proveedor está en `supabase/functions/kyc/providers.ts`.

## Configuración en el panel de Supabase

- **Authentication → Sign In / Providers:** activar *Allow anonymous sign-ins* y *Allow manual linking*.
- **URL Configuration:** la dirección de la web (Vercel) como Site URL y en Redirect URLs.
- **Plantillas de email:** añadir `{{ .Token }}` a *Change email address* y *Magic link* para que el correo traiga código además del enlace.

## Claves

- La clave pública (`sb_publishable_…`) está en `src/backend/supabase.js`. Es pública por diseño: solo permite lo que RLS y las funciones dejan hacer. Se puede cambiar con `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY`.
- La clave `service_role` nunca va al cliente ni al repositorio. Solo existe como secret de las Edge Functions.
- `.env` no se versiona.

## Migraciones

- Cada cambio de base de datos va en `supabase/migrations/` como fichero nuevo con fecha y hora en el nombre.
- Ya aplicadas: torneos asíncronos, cuentas y KYC, panel de administración, skins, progreso, hoyos nuevos (10, 18, 19, 20), volcán y grupos de revancha.
