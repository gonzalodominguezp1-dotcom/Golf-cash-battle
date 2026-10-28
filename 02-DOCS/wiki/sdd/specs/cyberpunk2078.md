---
name: cyberpunk2078
status: draft
---

# Spec: hoyo 15 «Cyberpunk2078»

## Qué y por qué

Hoyo nuevo al final de `COURSES` (pasa de 14 a 15). Par 4. Plataforma neón flotante con un looping grande y de carril ancho, un portal que salta un muro, dos rebotes de disco y un boost que da velocidad antes del looping.

Referencia visual: `02-DOCS/raw/cyberpunk2078-referencia.jpg`. Es referencia de estilo y disposición, no de medidas. Ese archivo es hoy untracked en el checkout principal; en este worktree no existe todavía.

## Decisiones

1. **Chevrons = boost.** La rampa solo sube `h` a lo largo de un eje y no da velocidad hacia el looping. El boost (`speed: 9`, primitiva existente) sí la da, y esa velocidad es lo que permite entrar en R 1,2 m. Los chevrons son solo visuales: `loopChevronTexture` es decorativo y la física no lo lee.
2. **Rebotes = discos circulares.** Los bumpers existentes son discos (`{x, z, r}`); no hay bumpers laterales ni planos. El aspecto plano de la referencia sale del render, sin lógica nueva.
3. **Looping.** Radio `1,2 m` (límite para entrar tras un boost, cálculo ideal; sin medir). Ancho de carril: `LOOP_LANE` y `LOOP_LANE_HALF` son constantes globales en `physics.js:315-316`, no campos por hoyo. Propuesta: `LOOP_LANE 0,36 → 0,60` y `LOOP_LANE_HALF 0,33 → 0,55` (mismo ratio). Esto **también cambia** los otros 4 loops de 3 hoyos (Looping Neón, Doble Looping, El Molino del Prado). `LOOP_CAPTURE` pasa de 0,20 a 0,42. Hay que revisar `tests/courses.test.js` (umbral de R=0,8 en la línea 217).
4. **Disposición.** Propuesta abajo. Falta validarla con vista cenital y con la simulación de la fase de plan.

## Disposición propuesta

Coordenadas en metros (x, z). `-z` es hacia delante.

- **Contorno:** rectángulo `[[-4,10],[4,10],[4,-10],[-4,-10]]`.
- **Tee:** `[-2.4, 8.4]`. **Cup:** `[2.4, -8.4]`.
- **Boost de entrada:** `{x: -1.0, z: 5.0, w: 1.6, d: 2.2, dir: [0,-1], speed: 9}`. Va en línea con el carril de entrada del looping.
- **Looping grande:** `{x: -1.0, z: 2.2, dir: [0,-1], len: 4.4, w: 2.6, radius: 1.2}`. Tramo en el suelo: z 1,3 a 3,1; altura del anillo: 2,4 m. La posición exacta del eje se fija en el plan, para que el carril de entrada quede centrado en el boost.
- **Muro divisor:** `[[-4,-0.4],[1.2,-0.4]]`. Hueco a la derecha, x de 1,2 a 4.
- **Portal (atajo sobre el muro):** entrada `a: [-2.8, 0.8]`, salida `b: [-2.8, -2.2]`, `r: 0.42`. Sin tubo.
- **Rebotes (discos):** `{x: 1.9, z: 0.6, r: 0.4}` y `{x: -0.6, z: -5.0, r: 0.4}`.
- **Arena:** `{x: 2.4, z: -7, w: 1.4, d: 2}`.
- **Waypoints** (para los bots): a definir en el plan, tras la simulación.
- Sin `spinners`, `movers`, `windmills` ni `ramps`.

## Criterios de aceptación

- Par 4. Tee y cup válidos: fuera de lava y de pendiente, como exige `courses.test.js:13-34`.
- El portal de salida `b` no cae sobre otro portal (`courses.test.js:23`).
- El looping de R 1,2 m se completa cuando la bola entra desde el boost.
- `pnpm test` sigue en verde. El total pasa de 120 a 120 salvo tests nuevos; el conteo de `tests/freeplay.test.js` pasa de 14 a 15, con el cambio justificado.
- Bots: al menos 9 de 12 terminan el hoyo con menos de 8 golpes, y la media es ≤ 6,5 (par + 2,5), según `tests/courses.test.js:57-71`.
- `pnpm sync:functions` deja iguales `src/game/courses.js` y `supabase/functions/submit-hole/game/courses.js`.
- Vista previa: `public/courses/course-15.webp` y entrada `'Cyberpunk2078': '/courses/course-15.webp'` en `coursePreviewStatic.js`, antes de `'Desempate'`.
- Migración nueva que sube `course_count` a `15`, con la misma nota de orden que tenía La Red: primero desplegar `submit-hole`, luego la migración. No se aplica nada en Supabase.
- `02-DOCS/wiki/juego/reglas-y-economia.md`: el recuento pasa de 14 a 15 y se añade el hoyo al listado.

## Riesgos

- **Carril global:** cambia 3 hoyos existentes. Puede mover sus tiempos o sus tests; hay que revisar los bots de todos.
- **Captura más ancha:** entrar al looping es más fácil en todos los hoyos con loop.
- **R 1,2 m tras boost:** el cálculo es ideal (sin rozamiento). Puede fallar con rozamiento real; hay que medirlo.
- **Disposición sin validar:** las coordenadas son propuesta. No hay vista cenital ni simulación todavía.

## Preguntas abiertas

- ¿Apruebas la disposición tal cual, o mandas una vista cenital para ajustarla?
- ¿Confirmas `LOOP_LANE 0,60` y `LOOP_LANE_HALF 0,55`, o prefieres otro ancho?
