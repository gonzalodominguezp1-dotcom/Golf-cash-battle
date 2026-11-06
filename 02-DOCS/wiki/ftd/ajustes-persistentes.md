---
author: sin identificar (pidió trabajar directamente en main)
branch: main
status: in-progress
---
# Ajustes persistentes + pantalla de Ajustes

## Intent
Lo que el jugador configura (sonido, calidad, controles y foto de perfil) debe seguir ahí al volver,
en el móvil y en el ordenador. Hoy cada ajuste se guarda suelto en `localStorage` y solo en ese
dispositivo; el avatar se sube a la cuenta, pero si la subida falla, al volver a entrar se pierde.
Además, los ajustes solo se pueden tocar dentro de una partida. Queremos una pantalla de Ajustes en
la UI principal, con un menú lateral en el ordenador y una barra de navegación inferior en el móvil,
y controles que se puedan editar.

## Scope
- `src/settings/settings.js` (nuevo): un único almacén de ajustes (sonido, calidad por tipo de
  dispositivo y controles). Se guarda en el dispositivo y en la cuenta (`profiles.settings`), y gana
  el último cambio. Migra las claves antiguas `gcb.muted.v2` y `gcb.quality`.
- `src/game/render/quality.js`: la calidad se lee del almacén y se guarda por separado para móvil y
  para ordenador (un móvil no hereda «Alto» del PC).
- `src/game/audio.js`: volumen general y volumen del ambiente, además de silenciar.
- `src/game/GolfGame.js`: aplica los controles: invertir la cámara (horizontal y vertical), invertir
  el ángulo de tiro, invertir la fuerza (empujar en vez de tirar), sensibilidad de la cámara y del
  apuntado, rueda del ratón para fuerza o zoom, y vibración.
- `src/progress/avatar.js`: si la subida falla, el avatar queda pendiente y se reintenta al entrar, en
  vez de que el servidor lo pise.
- `src/main.js` + `src/style.css`: pantalla Ajustes (secciones Controles, Calidad, Sonido), con menú
  lateral en el ordenador y barra inferior en el móvil; el menú de pausa de la partida usa el mismo
  panel.
- `supabase/migrations/…_player_settings.sql`: columna `profiles.settings`, la función RPC
  `set_settings` y `my_profile` devolviendo `settings`.
- Fuera de alcance: aplicar la migración en el Supabase de producción (lo hace el equipo); reasignar
  teclas.

## Checklist
- [x] Almacén de ajustes con tests (valores por defecto, saneado, migración, el último cambio gana, fallo de red, cambio de cuenta) → `tests/settings.test.js`
- [x] Avatar pendiente que se reintenta, también con subidas fuera de orden → `tests/avatar.test.js`
- [x] Calidad por dispositivo leída del almacén → test en `tests/settings.test.js`
- [x] Controles aplicados en GolfGame → multiplicadores probados (`inputFactors`); el uso en GolfGame se revisó leyendo el código (revisor de corrección). **No hay un test que mueva el ratón y mida el giro.**
- [x] Volumen general y del ambiente en el audio → build en verde. La ganancia por defecto es la de antes (0,9 general; 0,12 de ambiente). **No se escuchó en un dispositivo real.**
- [x] Pantalla Ajustes: menú lateral en el ordenador y barra inferior en el móvil → capturas en `02-DOCS/attachments/ajustes-persistentes/`
- [x] Menú de pausa con el mismo panel → capturas
- [x] Migración SQL escrita → revisor de seguridad sin hallazgos que bloqueen. **No se aplicó en ninguna base de datos.**
- [x] `pnpm test` y `pnpm run build` en verde

## Evidence
- `pnpm test`: 208 pasan, 0 fallan (antes del cambio: 185). `pnpm run build` correcto. `pnpm audit --prod`: sin vulnerabilidades.
- Playwright con el juego en modo local (`VITE_BACKEND=local`):
  - Ordenador (1366×860): se activaron invertir cámara horizontal e invertir ángulo, sensibilidad del apuntado 1,6, rueda en zoom, calidad Baja y volumen 35 %; tras recargar, `gcb.settings.v1` conserva los cinco y la pantalla los muestra.
  - iPhone 13 simulado: la barra de secciones queda fija a 12 px del borde inferior, no hay scroll horizontal, y elegir Alta guarda `quality.mobile` sin tocar `quality.desktop`.
  - Partida libre en los dos: la pausa muestra los ajustes guardados, cambiar la calidad la guarda para ese dispositivo, silenciar actualiza el botón del HUD y Reanudar cierra la pausa. Sin errores en la consola.
- `rsc risk`: nivel 2 por la migración (`alter table`). Se promovió a la spec `02-DOCS/wiki/sdd/specs/ajustes-persistentes.md` (`rsc spec gate`: PASS).
- Tres revisores en contexto limpio:
  - Seguridad: sin bloqueos.
  - Corrección: dos puntos que convenía arreglar, ya corregidos: «restablecer calidad» borraba la del otro dispositivo, y los ajustes de otra cuenta se subían a una cuenta vacía.
  - Tests: diez mutaciones sobrevivían. Se cubrieron con tests nuevos, y se comprobó que tres de ellas ahora fallan.
- Al subir, `main` traía 11 commits nuevos de la-chaqueta-bionica: iconos, una barra superior nueva en el móvil y un modal pequeño de ajustes (`openMenuSettings`). Al fusionar:
  - El engranaje del móvil abre la pantalla de Ajustes.
  - El modal se quitó: escribía en la clave antigua del silencio, que ya no existe.
  - La etiqueta de sonido con icono se pinta desde los ajustes.
  - La barra del escritorio, con seis secciones, se compacta entre 900 y 1439 px. Medido sin desbordar de 900 a 1920 px.
  - Resultado: 212 tests en verde, build correcto, y las pruebas de Playwright repetidas sin errores.
- Decisión aceptada y no cambiada: gana el último guardado del documento entero, no campo a campo. Una sesión abierta durante horas en otro dispositivo puede pisar un cambio más nuevo al guardar.

## Next
Push a `main` aprobado por el usuario el 2026-11-06. Falta que el equipo apruebe las capturas como referencia y aplique la migración `20261106140000_player_settings.sql` en Supabase. Hasta que se aplique, los ajustes se guardan solo en el dispositivo; nada falla.
