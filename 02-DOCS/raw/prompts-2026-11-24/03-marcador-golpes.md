# Prompt 3 — Marcador de golpes propio en cada hoyo (abajo a la derecha)

Trabaja **siempre en la rama `la-chaqueta-bionica` y en su worktree de siempre** (`C:\Users\DEV\Desktop\golfito\.worktrees\la-chaqueta-bionica`; la rama ya está sacada ahí, no la saques en la carpeta de `main` ni crees otro worktree ni otra rama). Si la sesión corre en otro sitio (nube), trabaja en `la-chaqueta-bionica` igualmente. Antes de tocar nada: `git fetch origin la-chaqueta-bionica && git pull origin la-chaqueta-bionica`. Commits y push solo a `la-chaqueta-bionica`; nunca a `main` ni a `la-yuinta-mangante` salvo que se pida. pnpm siempre.

## Qué quiero
Un marcador con **cuántos golpes llevas tú en el hoyo actual**, que se actualiza **en tiempo real** (en cuanto tiras) y sale **abajo a la derecha**, tanto en **Desktop** como en **móvil**. **Solo tus golpes**: nada de los rivales.

## Contexto del código
- La pantalla de partida se monta en `src/main.js` (función que pinta `play-screen`, ~líneas 480-830).
- El HUD tiene dos modos: `hud-freeplay` (Modo Libre: ya enseña «Golpes» en una píldora arriba) y `hud-lean` (partidas: solo FPS·latencia, Ajustes y Pantalla). El comentario dice que en partida **no** se enseñan golpes de rivales en directo: eso se mantiene.
- `GolfGame` ya llama `onStroke(n)` en cada tiro (`#executeShot`, `this.strokes++`) y `main.js` actualiza `strokesEl`. También se pone a 0 en reinicios/hoyo nuevo (busca `strokesEl.textContent = '0'`). `GolfGame.strokes` vive en `src/game/GolfGame.js`.
- Abajo a la derecha ya hay cosas: la barra `.power`, el botón `.map-btn` («Ver mapa»), la barra `.desktop-controls-bar`, el `.hole-timer` y en las pantallas principales un botón Lobby abajo a la izquierda. Mira `src/style.css` (media queries de móvil ~2100-2830 y `.hud-lean` ~2996) y **no tapes** ni el botón de mapa, ni la fuerza, ni la zona donde el dedo arrastra la bola.

## Diseño
- Una píldora/tarjeta compacta: icono de palo o bola + número grande + «golpes» (singular/plural) y debajo, pequeño, «Par N».
- Animación corta al cambiar el número (pop/escala + destello) y color según vaya respecto al par (igual o menos: verde; +1: amarillo; +2 o más: rojo), sin depender solo del color (el número manda).
- En el último golpe permitido (`maxStrokesOf(course)` de `src/config.js`) avisa sutilmente («último golpe»).
- Visible en: partidas online/en vivo, partidas contra bots, torneos, desempate (si en el desempate no se cuentan golpes, ocúltalo o adapta) y Modo Libre (aquí puede sustituir a la píldora «Golpes» de arriba para no duplicar; decide y explícalo).
- `aria-live="polite"` para lectores de pantalla.
- Respeta `env(safe-area-inset-*)` en móvil y el modo horizontal.
- No debe recibir toques (`pointer-events: none`) para no robar gestos de la cámara ni del tiro.

## Comprobaciones
- Se reinicia a 0 al empezar cada hoyo, al reiniciar en Modo Libre (R) y en replays/hoyo siguiente preparado (busca todos los sitios donde hoy se pone `strokesEl` a `'0'`).
- Con la bola de un rival en movimiento no cambia.
- No usa datos de red: sale del `onStroke` local, así que es instantáneo.
- Tests: si separas lógica (texto, color según par, «último golpe») hazla pura y pruébala con `node --test`. Hay tests de layout (`tests/layout-desktop-lobby.test.js`, `tests/desktop-controls.test.js`): añade uno parecido que compruebe que el marcador existe en el HUD de partida.
- `pnpm test` y `pnpm run build` en verde.
- Capturas Playwright de una partida (Modo Libre sirve) en 1280×800 y 390×844 (vertical) y 844×390 (horizontal) mostrando que no se solapa con nada. Enséñamelas.
- Commits en `la-chaqueta-bionica`. Sin PR salvo que lo pida.
