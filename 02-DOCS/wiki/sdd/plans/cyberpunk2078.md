---
name: cyberpunk2078-plan
status: draft
spec: 02-DOCS/wiki/sdd/specs/cyberpunk2078.md
---

# Plan técnico: hoyo 15 «Cyberpunk2078»

Parte del spec aprobado. Solo cambia lo que el spec pide: constantes de carril, un hoyo nuevo al final del catálogo y los archivos de sincronía, preview, migración y wiki. Sin física nueva.

## Correcciones al spec

- **Posición del looping.** La entrada del looping está en `loopEntry(l) = (x - dir.x·LOOP_PAD, z - dir.y·LOOP_PAD)` y el carril de entrada en `off = +LOOP_LANE` a lo largo de `loopSide = (-dir.y, dir.x)` (`physics.js:414-416`, `446`). Para `dir = [0,-1]` eso da `x = loop.x + LOOP_LANE`. Con el boost en `x = -1,0` el looping va en **`x = -1,6`** (no `-1,0`).
- **Hoyos con loop.** Son 3 hoyos y 4 loops (Looping Neón, Doble Looping, El Molino del Prado), no 4 hoyos.

## Tareas

Cada tarea tiene un *done-check* verificable. El orden es el de dependencia.

1. **Ensanchar el carril global.** `src/game/physics.js:315-316`: `LOOP_LANE 0.36 → 0.60`, `LOOP_LANE_HALF 0.33 → 0.55`.
   - *Done-check:* `pnpm test` ejecutado. Si fallan los tests de looping (`courses.test.js:121`, `135`, `196`, `222`, `234`) o el umbral de R=0,8 (`:217`), se ajustan **con justificación escrita**. Si no, no se toca nada.
2. **Añadir el hoyo.** `src/game/courses.js`: el objeto nuevo va al final de `COURSES`, tras «El Abismo», con los valores del spec y `loop.x = -1.6`. Constantes de looping en la misma zona que `LOOP_A`, `LOOP_B1`, etc. (`:50-57`).
   - *Done-check:* `COURSES.length === 15` y `COURSES.at(-1).name === 'Cyberpunk2078'`.
3. **Simular la geometría.** Script temporal fuera del repo (en el scratchpad), que lanza golpes deterministas con `step()` desde el tee: la bola debe entrar al looping tras el boost y completarlo con R 1,2, y el portal debe saltar el muro.
   - *Done-check:* el script reporta, para el golpe elegido, entrada al looping y completado; se fijan las posiciones definitivas (boost, muro, portal, discos) según el resultado.
4. **Tests nuevos.** `tests/courses.test.js`: un test de looping R 1,2 (entra tras el boost y se completa), y uno del portal que salta el muro. `tests/freeplay.test.js:8-9`: `14 → 15` (cambio justificado: hoyo nuevo).
   - *Done-check:* los tests nuevos fallan antes de la tarea 2 y pasan después.
5. **Sincronizar la copia de servidor.** `pnpm sync:functions` (`package.json:10`, `scripts/sync-functions.mjs`).
   - *Done-check:* `src/game/courses.js` y `supabase/functions/submit-hole/game/courses.js` son idénticos (`diff` sin salida), y lo mismo para `physics.js`.
6. **Vista previa.** `public/courses/course-15.webp` y `'Cyberpunk2078': '/courses/course-15.webp'` en `src/game/render/coursePreviewStatic.js`, antes de `'Desempate'`.
   - *Done-check:* `tests/course-preview.test.js:37-41` pasa. **No verificado:** cómo se genera el webp (`course-14` es la referencia). Se revisa en la tarea.
7. **Migración.** `supabase/migrations/20261101120000_cyberpunk2078_course.sql`: `update public.app_config set value = '15' where key = 'course_count';`, con la nota de orden (primero desplegar `submit-hole`, después la migración). No se aplica nada en Supabase.
   - *Done-check:* el archivo existe; no hay llamadas al remoto.
8. **Wiki.** `02-DOCS/wiki/juego/reglas-y-economia.md:18`: «14 hoyos» → «15 hoyos», y añadir el hoyo al listado de ambientes. Revisar también `02-DOCS/wiki/sdd/constitution.md:35`, `02-DOCS/wiki/arquitectura/estructura-y-stack.md:44` y `02-DOCS/wiki/backend/validacion-y-antibots.md:7` por si citan el recuento.
   - *Done-check:* `grep` del recuento viejo sin resultados en la wiki.
9. **Verificar.** `pnpm test` completo y, para los bots, `tests/courses.test.js:57-71`: al menos 9 de 12 con menos de 8 golpes, media ≤ 6,5.
   - *Done-check:* la suite pasa; el total de tests es 120 más los nuevos, y el conteo de `freeplay` es 15.

## Orden y dependencias

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. La 1 va primero porque cambia el comportamiento que el hoyo necesita. La 5 va después de cualquier cambio en `courses.js` o `physics.js`. La 7 solo se despliega después de `submit-hole` (tarea 5).

## Riesgos

- **Carril global:** cambia 3 hoyos existentes; sus tests y sus bots pueden cambiar. Se revisan en la tarea 9.
- **R 1,2 tras boost:** el cálculo es ideal; con rozamiento real puede no completarse. La tarea 3 lo mide antes de fijar posiciones.
- **Webp sin proceso conocido:** la tarea 6 depende de cómo se generó `course-14`.
- **Sincronía de la copia de servidor:** si no se ejecuta la tarea 5, el servidor rechazará o desviará los golpes del hoyo nuevo.

## Fuera de alcance

- Aplicar la migración en Supabase.
- Cambiar otros hoyos, salvo los efectos del carril global.
- Nuevas primitivas o física nueva.
