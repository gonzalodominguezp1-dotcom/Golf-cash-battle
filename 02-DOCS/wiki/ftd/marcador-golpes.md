---
author: la-chaqueta (prompt 03-marcador-golpes)
branch: la-chaqueta-bionica
status: in-progress
---
# Marcador de golpes propio (abajo a la derecha)

## Intent
Que el jugador vea cuántos golpes lleva él en el hoyo actual, en tiempo real (en cuanto tira),
en Desktop y en móvil. Solo sus golpes, nunca los de los rivales.

## Scope
- Marcador `.stroke-marker` en `src/main.js` (pantalla de partida), abajo a la derecha.
- Lógica pura en `src/game/strokeMarker.js` (texto, tono según el par, aviso de último golpe, oculto en desempate).
- Estilos al final de `src/style.css`.
- Modo Libre: el marcador sustituye a la píldora «Golpes» de arriba (se quitó para no duplicar).
- Fuera de alcance: cambiar la barra de fuerza, el botón de mapa o los controles de escritorio.

## Decisions
- **Modo Libre:** la píldora «Golpes» de arriba desaparece; el marcador la sustituye.
- **Desempate:** el marcador se oculta (no se cuentan golpes allí).
- **«último golpe»:** aparece cuando el siguiente golpe es el último permitido (`golpes = maxStrokesOf - 1`).
- **Escritorio:** el marcador va 78 px desde abajo para quedar encima de la barra de controles (con 22 px solapaba entre 900 y 1100 px de ancho).
- **Móvil:** la ayuda de toques (`.hint`) sube a 104 px para no solaparse con el marcador en 390 px de ancho.

## Checklist
- [x] Lógica pura con tests (`node --test tests/stroke-marker.test.js`): singular/plural, tono, último golpe, desempate, entradas raras.
- [x] El marcador se alimenta solo del `onStroke` local y se pone a 0 al empezar hoyo (`game.load`, reinicio, R, Ajustes → reiniciar).
- [x] `aria-live="polite"` y `pointer-events: none`.
- [x] Respeta `env(safe-area-inset-*)` y tiene reglas para el horizontal bajo.
- [x] Sin solapes con la barra de fuerza, el botón de mapa, la barra de controles ni la ayuda, en 1280×800, 390×844, 844×390, 900×700, 1024×768 y 1920×1080 (medido por cajas).
- [ ] Partida real en Modo Libre con Playwright: no hecho. La app pide inicio de sesión y no hay cuenta de prueba en el repo; las capturas son de un arnés con el mismo CSS y el mismo marcado.
- [ ] Verificar en una partida real que el número sube al tirar (no comprobado en vivo).

## Evidence
- `pnpm test`: 10/10 en `tests/stroke-marker.test.js`. La suite completa tiene 6 fallos en tests de `vfx` (`golden`, `SKINS y SIG`, `dir in…`, `rad en otras dirs…`). No los causa este cambio: en un export limpio de HEAD la suite pasa 1373/1373; esos ficheros `vfx` tienen cambios sin commitear en el worktree.
- `pnpm run build`: correcto.
- Medidas de cajas (arnés): ver la tabla en la respuesta.

## Next
- Probar una partida real en Modo Libre: que el número suba al tirar y que el marcador no tape nada.
- Decidir si el aviso «último golpe» debe mostrarse también al llegar al máximo.
