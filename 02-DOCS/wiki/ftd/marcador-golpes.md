---
author: la-chaqueta (prompt 03-marcador-golpes)
branch: la-chaqueta-bionica
status: done
merged: 2026-11-25
merged_by: Chakets
---
# Marcador de golpes propio (abajo a la derecha)

## Intent
Que el jugador vea cuántos golpes lleva él en el hoyo actual, en tiempo real (en cuanto tira),
en Desktop y en móvil. Solo sus golpes, nunca los de los rivales.

## Scope
- Marcador `.stroke-marker` en `src/main.js` (pantalla de partida), abajo a la derecha.
- Lógica pura en `src/game/strokeMarker.js` (texto, color blanco→rojo según los golpes, aviso de último golpe, oculto en desempate).
- Estilos al final de `src/style.css`.
- Modo Libre: el marcador sustituye a la píldora «Golpes» de arriba (se quitó para no duplicar).
- Fuera de alcance: cambiar la barra de fuerza, el botón de mapa o los controles de escritorio.

## Decisions
- **Modo Libre:** la píldora «Golpes» de arriba desaparece; el marcador la sustituye.
- **Desempate:** el marcador se oculta (no se cuentan golpes allí).
- **Contenido:** solo el número y «golpes» (sin icono ni «Par N», por petición en esta sesión).
- **Color:** el número va de blanco (0 golpes) a rojo (máximo del hoyo, `maxStrokesOf`), lineal (`strokeColor`).
- **«último golpe»:** sin texto visible (se quitó con el subtítulo). El aviso queda como borde ámbar cuando el siguiente golpe es el último permitido, y en el texto accesible (`aria-label`). Pendiente decidir si se quiere texto visible.
- **Posición:** esquina inferior derecha, a la altura del botón «Ver mapa» (mismo borde inferior: 24 px en escritorio, 20 px en móvil).
- **Escritorio estrecho (900–1199 px):** la barra de controles sube a 116 px desde abajo; si no, choca con el marcador en la esquina.
- **Móvil:** la ayuda de toques (`.hint`) sube a 104 px para no solaparse con el marcador.
- **Final de partida:** no se toca. Un commit anterior había colado código de avatares en `main.js` (pantalla de resultados); se ha quitado de este commit.

## Checklist
- [x] Lógica pura con tests (`node --test tests/stroke-marker.test.js`): singular/plural, color blanco→rojo, último golpe, desempate, entradas raras.
- [x] El marcador se alimenta solo del `onStroke` local y se pone a 0 al empezar hoyo (`game.load`, reinicio, R, Ajustes → reiniciar).
- [x] `aria-live="polite"` y `pointer-events: none`.
- [x] Respeta `env(safe-area-inset-*)` y tiene reglas para el horizontal bajo.
- [x] Sin solapes con la barra de fuerza, el botón de mapa, la barra de controles ni la ayuda, en 1280×800, 390×844, 844×390, 900×700, 1024×768 y 1920×1080 (medido por cajas, arnés).
- [x] El borde inferior del marcador coincide con el del botón «Ver mapa» en los seis tamaños.
- [ ] Partida real en Modo Libre con Playwright: no hecho. La app pide inicio de sesión y no hay cuenta de prueba en el repo; las capturas son de un arnés con el mismo CSS y el mismo marcado.
- [ ] Verificar en una partida real que el número sube al tirar (no comprobado en vivo).

## Evidence
- `pnpm test`: 10/10 en `tests/stroke-marker.test.js`. La suite completa tiene 6 fallos en tests de `vfx` (`golden`, `SKINS y SIG`, `dir in…`, `rad en otras dirs…`). No los causa este cambio: en un export limpio de HEAD la suite pasa 1373/1373; esos ficheros `vfx` tienen cambios sin commitear en el worktree.
- `pnpm run build`: correcto.
- Medidas de cajas (arnés), antes de quitar el subtítulo: sin solapes en los seis tamaños. Quitar texto solo reduce la caja.

## Next
Fusionado en main el 2026-11-25 (c499c9f).
