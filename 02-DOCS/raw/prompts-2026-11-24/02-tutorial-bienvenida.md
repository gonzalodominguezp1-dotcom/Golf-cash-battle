# Prompt 2 — Popup épico de bienvenida + tutorial por pasos

Soy Gonzalo. Trabaja en mi rama según `CLAUDE.md` (`la-yuinta-mangante`: fetch, checkout y pull antes de tocar nada). pnpm siempre.

**Depende del prompt 1** (verificación de email). Antes de empezar, busca en el código cómo se marca que el usuario «acaba de verificar» (flag de `sessionStorage`, parámetro de arranque o similar; mira `src/account/`, `src/backend/supabase.js` y `02-DOCS/wiki/ftd/auth-email-password.md`). Si no existe todavía, para y dímelo.

## Qué quiero
Cuando un jugador nuevo **verifica su cuenta a través del correo** y entra al juego, le salta un **popup súper épico y llamativo** de bienvenida, y desde ahí arranca un **tutorial del juego por pasos**.

### 1. Popup de bienvenida (la «entrada» del tutorial)
- Pantalla completa sobre el hub, fondo oscurecido con desenfoque, tarjeta central con:
  - Animación de entrada potente: zoom + rebote, destellos/rayos detrás girando, confeti o monedas cayendo, brillo que recorre el título. Reutiliza piezas que ya existen: mira `src/ui/skinReveal.js`/`.css` (revelado de skin), `src/ui/notifyPopup.js`/`.css`, la moneda del splash (`public/splash/`, `public/splash.js`) e iconos de `src/ui/icons.js`.
  - Título tipo «¡Cuenta verificada! Bienvenido a Golf Cash Battle», con su nombre de usuario.
  - Sonido de celebración (usa `src/game/audio.js`, respeta el volumen/mute de Ajustes).
  - Vibración corta en móvil si los ajustes lo permiten (`settings.controls.vibration`).
  - Dos botones: **«Empezar tutorial»** (principal, grande, animado) y «Saltar» (discreto).
- Respeta `prefers-reduced-motion`: misma información, animaciones suaves.
- Accesible: foco atrapado dentro, `Esc` = saltar, `role="dialog"`, `aria-modal`, contraste.
- Debe verse perfecto en Desktop y en móvil vertical/horizontal (prueba anchos de 360 px).

### 2. Tutorial por pasos
Pasos cortos (una frase + ilustración/animación), con barra de progreso, «Siguiente», «Atrás» y «Saltar». Contenido (ajústalo a lo que de verdad hace el juego; léelo en `02-DOCS/wiki/juego/reglas-y-economia.md`, `src/screens/hub.js`, `src/screens/tables.js`, `src/screens/maps.js` y la pantalla de partida en `src/main.js`):
1. Qué es el juego: minigolf multijugador, gana quien emboca con menos golpes.
2. Cómo tirar en **móvil**: arrastra desde la bola hacia atrás, suelta para tirar; desliza fuera de la bola para mover la cámara; pellizco para zoom (lo trae el prompt 7, escríbelo de forma que sea fácil cambiar el texto).
3. Cómo tirar en **Desktop**: ratón para apuntar, clic izquierdo mantenido para cargar fuerza y soltar; clic derecho cámara; rueda zoom; `Espacio` vista del mapa; `Esc` ajustes. Enseña solo el paso del dispositivo que esté usando (`matchMedia('(pointer: coarse)')`), con opción de ver el otro.
4. Tiempo por hoyo: cuando el primero emboca, empieza la cuenta atrás.
5. Mesas, entrada y bote (créditos de demostración, sin valor real).
6. Skins, marcos y avatar: dónde se cambian.
7. Amigos y grupo.
8. Cierre épico: «¡A jugar!» con botón que lleva a **Modo Libre** para practicar (o a Mesas si no hay Modo Libre accesible).
- Opcional si cabe bien: resaltar con un foco (spotlight) el botón real del hub del que habla cada paso.
- Los textos van en `src/screens/texts/` (crea `tutorial.js` y regístralo en `texts/index.js`), como el resto.

### 3. Cuándo sale y cuándo no
- Sale **una vez**: la primera entrada tras verificar el email.
- Guardar que ya lo vio **en el servidor**, no solo en `localStorage` (si entra desde otro dispositivo no debe salirle otra vez). Usa el `progress` que ya se guarda (`Progress.js` → `save_progress`) con un campo tipo `tutorialDone` (revisa `20261027120000_save_progress_clamp.sql` por si el servidor filtra campos) o una columna/RPC nueva con migración en `supabase/migrations/`.
- Cuentas que ya existían: **no** les sale de golpe. Añade en Ajustes o en el hub una entrada «Ver tutorial» para volver a verlo cuando quieran.
- Si el jugador cierra a medias, al volver no se reabre solo (cuenta como visto), pero puede abrirlo desde «Ver tutorial».
- No debe salir encima de una partida en vivo, ni de la pantalla de auth, ni del splash: espera a que el hub esté montado (`boot`/router en `src/screens/`).

## Pruebas y cierre
- Lógica pura (cuándo se muestra, avanzar/retroceder pasos, paso según dispositivo) en un módulo de reglas con tests `node --test` en `tests/`.
- `pnpm test` y `pnpm run build` en verde.
- Captura con Playwright el popup y 2-3 pasos en Desktop (1280×800) y móvil (390×844) y enséñamelas.
- Documenta la feature en `02-DOCS/wiki/ftd/tutorial-bienvenida.md` (formato de las otras FTD: Intent, Scope, Checklist, Evidence, Next) y enlázala en `02-DOCS/wiki/index.md` si procede.
- Commits en mi rama. Sin PR salvo que lo pida.
