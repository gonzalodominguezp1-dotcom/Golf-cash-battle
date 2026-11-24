# Prompt 1 — Arreglar el flujo de verificación de email

Trabaja **siempre en la rama `la-chaqueta-bionica` y en su worktree de siempre** (`C:\Users\DEV\Desktop\golfito\.worktrees\la-chaqueta-bionica`; la rama ya está sacada ahí, no la saques en la carpeta de `main` ni crees otro worktree ni otra rama). Si la sesión corre en otro sitio (nube), trabaja en `la-chaqueta-bionica` igualmente. Antes de tocar nada: `git fetch origin la-chaqueta-bionica && git pull origin la-chaqueta-bionica`. Commits y push solo a `la-chaqueta-bionica`; nunca a `main` ni a `la-yuinta-mangante` salvo que se pida. pnpm siempre.

## El fallo (lo que ve un jugador nuevo)
1. Se crea la cuenta bien y le llega el correo de verificación.
2. El enlace del correo lleva a una **página 404**.
3. Vuelve a la pestaña del juego: se queda colgado con la sesión/cookie vieja; **aunque recargue no entra**. Solo entra abriendo el juego en otra pestaña.

Quiero el flujo entero arreglado: que al verificar el email se avise al cliente (y al servidor si hace falta) y **se obligue a recargar el estado del usuario** en todas las pestañas abiertas, sin que el jugador tenga que hacer nada raro.

## Lo que ya sé del código (compruébalo, no lo des por bueno)
- `src/account/AuthService.js`: `redirectTo` = `location.origin + location.pathname`. Se usa en `signUp`, `updateUser` (invitado anónimo), `resend` y `resetPasswordForEmail`.
- `src/backend/supabase.js` → `connectSupabase()`: cliente con `flowType: 'pkce'`. Sin sesión devuelve `{ mode: 'auth' }`. Solo escucha `PASSWORD_RECOVERY` antes de `getSession()`. Con sesión, recarga si `SIGNED_OUT` o cambia el uid.
- `src/ui/authScreen.js` → `mountAuth()`: escucha `SIGNED_IN` (para cuando la confirmación llega desde otra pestaña) y llama a `onDone`. La vista `check` («Confirma tu email») tiene el enlace «Ya lo he confirmado, entrar», que solo vuelve al login.
- `src/main.js` (~línea 1789): `onDone` hace `location.replace(origin + pathname + hash)`.
- `vercel.json`: **no tiene `rewrites`**. Cualquier ruta que no sea un fichero real da 404 en Vercel.
- El router (`src/screens/router.js`) usa hash, así que el pathname suele ser `/`, pero no hay garantía (p. ej. `/index.html`, previews, `admin.html`).
- Doc: `02-DOCS/wiki/ftd/auth-email-password.md` (dice que la confirmación por email **nunca se probó**) y `02-DOCS/wiki/backend/supabase.md` (línea ~57, URL Configuration).

## Hipótesis a confirmar, en este orden
1. **404:** el enlace del correo redirige a una URL que no existe en Vercel. Causas posibles: Site URL / Redirect URLs del panel de Supabase mal puestas (dominio viejo, `localhost`, preview de Vercel), `redirectTo` no está en la lista permitida y Supabase cae al Site URL, o la plantilla del email usa `{{ .SiteURL }}` con una ruta que no existe. Intenta leer la config de Auth con la Management API (`GET https://api.supabase.com/v1/projects/oyawgvqbmvtmlnyqwgdf/config/auth`: `site_url`, `uri_allow_list`, `mailer_templates_confirmation_content`). Si no tienes acceso, dime exactamente qué valores tengo que mirar y poner en el panel.
2. **Se queda colgado al recargar:** con PKCE, el `?code=` del enlace solo lo puede canjear el navegador que guardó el `code_verifier`. Si el enlace se abre en otro navegador (app de Gmail, móvil) el canje falla, la URL se queda con `?code=`/`#error=...` y la app arranca con un estado a medias. Revisa también qué deja el cliente en `localStorage` (`sb-<ref>-auth-token`, `-code-verifier`) cuando el canje falla, y si `getSession()` devuelve una sesión no confirmada o caducada que no se limpia.
3. **Otra pestaña sí entra:** confirma por qué (estado limpio en memoria, otro storage event, etc.).

## Qué tiene que quedar
1. **Ruta de vuelta propia y que siempre existe:** p. ej. `https://<dominio>/?auth=confirm` (o `/auth/callback` con `rewrites` en `vercel.json` que sirvan `index.html`). Una sola función que construya la URL de vuelta; no `location.pathname` a pelo. Añade también un `rewrite` de red de seguridad en `vercel.json` para rutas desconocidas → `index.html` (sin romper `admin.html`, `assets-lab.html` ni `/assets/*`). Respeta las cabeceras CSP actuales.
2. **Al llegar del enlace:**
   - Canje correcto (`exchangeCodeForSession` / evento `SIGNED_IN` con `email_confirmed_at`): limpiar la URL (`history.replaceState`), marcar «recién verificado» (lo usará el prompt 2, el tutorial) y arrancar la app con la cuenta.
   - Canje fallido (otro navegador, enlace caducado o usado): limpiar URL y restos de PKCE, **no** dejar la app colgada, enseñar en la pantalla de auth un mensaje claro: «Tu email ya está confirmado. Entra con tu email y contraseña» (o «El enlace ha caducado, te enviamos otro» si es error real). Mapear los errores nuevos en `authRules.js` con textos en español.
3. **Aviso a todas las pestañas:** cuando una pestaña confirma, las demás (la del registro, que está en la vista «Confirma tu email») tienen que enterarse y recargar el estado: usa `BroadcastChannel('gcb-auth')` con respaldo de evento `storage`, y además el `onAuthStateChange` que ya hay. La pestaña que esperaba debe entrar sola, sin recargar a mano.
4. **«Se manda algo al server que obliga a recargar el estado»:** al confirmar, llama a `my_profile` (o una RPC nueva tipo `confirm_landing()` si hace falta) para que el perfil, el saldo y `email_confirmed` salgan del servidor ya actualizados, y fuerza `db.auth.refreshSession()` para que el JWT nuevo lleve el email confirmado. Si `my_profile` devuelve `email_confirmed: false` justo tras confirmar, reintenta con espera corta.
5. **Botón «Ya lo he confirmado, entrar»:** antes de volver al login, intenta `refreshSession()`/`getSession()`; si ya hay sesión confirmada, entra directo.
6. **Arranque robusto:** en `connectSupabase()`, si `getSession()` devuelve algo inválido (usuario borrado, token que el servidor rechaza al cargar `my_profile`), cerrar sesión local, limpiar storage de Supabase y mostrar la pantalla de auth. Nunca una pantalla «Conectando…» eterna: pon un tiempo máximo con mensaje y botón de reintentar.
7. Lo mismo para el enlace de **recuperar contraseña** (comparte `redirectTo`): que no se rompa.

## Pruebas
- Reglas puras nuevas (construir URL de vuelta, leer parámetros de la URL de vuelta, mapear errores) en `src/account/authRules.js` con tests en `tests/auth-rules.test.js` (`node --test`).
- `pnpm test` y `pnpm run build` en verde.
- No puedes crear cuentas reales: déjame una **checklist manual** paso a paso (mismo navegador, otro navegador/app de Gmail, enlace caducado, dos pestañas abiertas, móvil) y la lista exacta de ajustes del panel de Supabase (Site URL, Redirect URLs, plantilla del email) que tengo que comprobar.

## Cierre
- Actualiza `02-DOCS/wiki/ftd/auth-email-password.md` y `02-DOCS/wiki/backend/supabase.md` con el flujo nuevo.
- Commits pequeños en `la-chaqueta-bionica` con mensajes en español. Sin PR salvo que lo pida.
- Expón una función/evento claro de «recién verificado» (p. ej. `sessionStorage['gcb.justVerified']` o un flag en la respuesta de arranque) y documenta su nombre: el prompt 2 (tutorial) lo va a usar.
