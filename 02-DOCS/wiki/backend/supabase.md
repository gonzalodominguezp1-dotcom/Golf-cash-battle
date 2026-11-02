# Backend en Supabase

Proyecto `golf-cash-battle`. La referencia del proyecto está en el README.

## Cuentas

- La app abre con pantalla de entrada: login, registro y "he olvidado mi contraseña" (`src/ui/authScreen.js`, lógica en `src/account/AuthService.js`, reglas puras en `src/account/authRules.js`). Sin sesión no se juega con el servidor.
- Email + contraseña, con email confirmado por enlace (flujo PKCE). Los errores de entrada nunca dicen si un email tiene cuenta.
- La sesión se guarda en el dispositivo (supabase-js, `localStorage`) y se renueva sola.
- Un invitado antiguo (sesión anónima) ve la pantalla de registro: al crear la cuenta se le pone email y contraseña a la misma cuenta y conserva saldo, nivel y skins.
- Cambiar la contraseña desde Cuenta pide la actual.
- Admin (`admin.html`) sigue entrando con código por email.
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

- **Authentication → Sign In / Providers → Email:** activar *Confirm email* (sin esto cualquiera crea cuentas con emails ajenos y salta la comprobación de `_paid_block`), *Secure password change* y *Secure email change*. Longitud mínima de contraseña 8 y requisito *letters and digits* (la app pide lo mismo antes de enviar).
- **Authentication → Sign In / Providers:** *Allow anonymous sign-ins* **desactivado** (en producción ya lo está). Las sesiones de invitado antiguas siguen valiendo hasta que caduquen y se pueden convertir en cuenta desde la pantalla de registro.
- **Authentication → URL Configuration:** la dirección de la web (Vercel) como Site URL y en Redirect URLs, sin comodines abiertos (`https://dominio/` y, para vistas previas, solo los dominios propios). Es lo que impide que el enlace del correo mande a una web de otro.
- **Authentication → Rate Limits:** dejar los límites por defecto o más bajos (envío de emails, intentos de entrada por IP).
- **Authentication → Attack Protection:** activar CAPTCHA (hCaptcha o Turnstile) antes de abrir el registro al público, y *Leaked password protection* si el plan lo permite.
- **Authentication → Sessions:** caducidad de sesión y *Detect and revoke potentially compromised refresh tokens* activados.
- **Plantillas de email:** *Confirm signup* y *Reset password* con `{{ .ConfirmationURL }}`. La app usa flujo PKCE: el enlace solo funciona en el navegador donde se pidió.
- Google (más adelante): *Providers → Google* con Client ID/Secret propios y la URL de callback de Supabase en Google Cloud; en la app será `signInWithOAuth({ provider: 'google' })` desde `AuthService`.

## Claves

- La clave pública (`sb_publishable_…`) está en `src/backend/supabase.js`. Es pública por diseño: solo permite lo que RLS y las funciones dejan hacer. Se puede cambiar con `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY`.
- La clave `service_role` nunca va al cliente ni al repositorio. Solo existe como secret de las Edge Functions.
- `.env` no se versiona.

## Migraciones

- Cada cambio de base de datos va en `supabase/migrations/` como fichero nuevo con fecha y hora en el nombre.
- Ya aplicadas: torneos asíncronos, cuentas y KYC, panel de administración, skins, progreso, hoyos nuevos (10, 18, 19, 20), volcán y grupos de revancha.
