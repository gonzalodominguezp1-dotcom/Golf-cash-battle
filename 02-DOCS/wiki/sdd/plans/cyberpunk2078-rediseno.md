---
name: cyberpunk2078-rediseno-plan
status: draft
spec: 02-DOCS/wiki/sdd/specs/cyberpunk2078-rediseno.md
supersedes: 02-DOCS/wiki/sdd/plans/cyberpunk2078.md
---

# Plan técnico: hoyo 15 «Cyberpunk2078», rediseño

Borrador para aprobación. Parte del spec de rediseño aprobado en concepto.

## 0. Estado de partida

- El hoyo v1 existe sin commitear en el worktree: `LOOP_CYBER` (courses.js:59), el objeto del hoyo (352-369), tests v1 (courses.test.js:395-466), copia de servidor, webp, migración y wiki. La tarea de "añadir" pasa a ser **reemplazar** el hoyo.
- Línea base: `pnpm test` = 123/123 con los 3 tests v1.
- El tema `neon` lo usa también «Looping Neón» (courses.js:182). El hoyo nuevo necesita tema propio `cyber2078` (clon de `neon`) en `src/game/themes.js`.
- Geometría del looping con `dir = [0,-1]` (physics.js:416 y 446): boca en `z = loop.z + 0,9`; carril de entrada en `x = loop.x + 0,36`. Para carril en `x = -1,00`, `loop.x = -1,36`. `LOOP_LANE` y `LOOP_LANE_HALF` no cambian.

## A. Disposición (coordenadas de partida; definitivas tras la tarea 1)

Contorno 8 × 20 m: `[[-4,10],[4,10],[4,-10],[-4,-10]]`.

| Elemento | Valores | Justificación |
|---|---|---|
| Tee | (-1,0; 8,6) | Recto a la puerta de acceso, a 3,0 m |
| Portal de acceso a | (-1,0; 5,6), r 0,42 | Delante del muro; único paso al looping |
| Portal destino b | (-1,0; 3,0), r 0,42 | Detrás del muro; conserva la velocidad |
| Muro W1 | (-4; 4,2) → (0,4; 4,2) | Separa el tee de la bolsa del looping |
| Muro W2 | (0,4; 4,2) → (0,4; 0,6) | Cierra la bolsa por la derecha |
| Acelerador | x -1,0, z 0,8…2,2 (`w 0,8`, `d 1,4`, `dir [0,-1]`, `speed 11`) | Aceleración 40 m/s²; de 3 m/s llega a 11 en 1,4 m |
| Looping | `{x:-1.36, z:-0.3, dir:[0,-1], len:4.4, w:2.6, radius:1.2}` | Boca en z 0,6; ocupa x -2,66…-0,06 |
| Bloque móvil | `{x:2.2, z:1.2, w:1.2, d:0.6, axis:'x', range:1.0, speed:1.2}` | Periodo 5,2 s; deja ≥ 2,2 m libres en un lado |
| Molino | `windmill({x:2.2, z:-5.0, w:1.0, depth:1.4, left:0.4, right:4.0, speed:1.2, blades:3})` | Puerta 1,0 m; tapada ~29 % del tiempo |
| Bumper B1 | (3,2; 2,6), r 0,4 | Ruta B, fuera de la trayectoria del bloque |
| Bumper B2 | (2,6; -3,2), r 0,4 | Ruta B, antes del molino |
| Arena | (2,4; -7,6), w 1,4, d 1,2 | Frena el último putt |
| Cup | (2,4; -8,4) | Igual que la v1 |
| Waypoints (bots) | `[[-1,5.6],[2.4,3.2],[2.2,0.2],[1.0,-3.6],[2.2,-4.0]]` | El primero coincide con la `a` del portal |

Cifras medidas en la disposición de prueba (sin bloque ni molino):
- Umbral de entrada en R 1,2: 8,90 m/s en la boca (ventana 8,5–9,3 del test). Ideal sin rozamiento √(5gR) = 7,67 m/s; la diferencia la come `TRACK_DRAG`.
- Velocidad en la boca con el acelerador: 10,90 m/s, margen 2,0 m/s sobre el umbral.
- Entrada a 13 m/s: sale a 10,36 m/s. Cualquier entrada entre 8,9 y 13 completa.
- Carril de captura del portal: ±0,20 m.

## B. Plan de simulación

Todo determinista: `step()` de physics.js con `DT = 1/120`, desde el tee, con `quantizeShot` y `shotVelocity`.

1. **Sonda de la disposición (tarea 1, script temporal en el scratchpad).** Mide: golpes directos a la boca (debe ser 0); golpes por portal que entran y los que completan; golpes que embocan en un tiro (debe ser 0 en la ruta A); parada de la ruta A (mediana y dispersión).
2. **Bots de todo el hoyo.** Las 12 partidas de courses.test.js:57-71: al menos 9 con menos de 8 golpes; media ≤ 6,5.

Medición previa (en memoria): 0 de 2499 golpes directos a la boca; 2473 de 2499 entran por portal; 0 embocan en un tiro; parada mediana de la ruta A en z = -8,27.

**Conclusión honesta.** La ruta A se completa casi siempre, porque el acelerador fija la velocidad; su coste depende de la precisión del portal. Probablemente A cueste menos que B. Hipótesis de trabajo: A ≈ 2 golpes, B ≥ 2. **No es una cifra medida**.

Alternativas si la sonda no iguala las rutas:
- A más barata que B en más de 1 golpe: reducir r del portal (0,42 → 0,30) o añadir un obstáculo que frene antes de la cup.
- B más cara: ampliar la puerta del molino (1,0 → 1,2) o bajar la velocidad del bloque.

## C. Plan de efectos visuales

Los efectos leen el estado de la bola pero no lo escriben. Ningún efecto se importa desde physics.js, courses.js, replay.js, bots.js ni antibot/.

| Efecto | Archivo | Disparo |
|---|---|---|
| Bandas neón que se encienden al paso | `src/game/render/cyberpunkFx.js` (nuevo) | Distancia bola–banda (lectura) |
| Chevrons del acelerador que pulsan | `src/game/render/course.js` (~357-370) | Tiempo |
| Portal que gira y emite anillo | `course.js` (~392-400) + cyberpunkFx.js | Evento `portal` de step() |
| Estela tras la bola a más de 6 m/s | cyberpunkFx.js | Velocidad (lectura) |
| Destello de bumpers | `course.js` (~262, ~511) | Evento `bumper` de step() |
| Ciudad, letreros, cables | `src/game/render/cyberpunkEnvironment.js` | Solo tema `cyber2078` |
| Plataforma con neón y cables | `cyberpunkEnvironment.js` | Solo tema `cyber2078` |
| Cielo, niebla magenta, chispas | `environment.js` (`buildEnvironment`, `isNeon`) | Solo tema `cyber2078` |

Enganches: GolfGame.js:427-428 y el bucle de `courseView.update`. Hay que comprobarlos al implementar.

Verificación de que no tocan la simulación: grep de imports desde `src/game/*.js` fuera de `render/` sin resultados; test de determinismo (`replayHole` dos veces con el mismo golpe, igual bit a bit, con o sin el módulo de efectos); `pnpm sync:functions` sin diff; carga en calidad `low`.

## D. Tareas (orden de dependencia)

1. **Sonda de la disposición.** Ejecutar la sonda con la disposición de A; fijar coordenadas finales. Done: 0 golpes directos a la boca; proporción de entrada por portal; 0 entradas por la salida; coordenadas escritas en este plan.
2. **Hoyo.** Reemplazar el objeto `Cyberpunk2078` (352-369) y `LOOP_CYBER` (58-59) con `theme: 'cyber2078'`; añadir el tema en themes.js. Done: `COURSES.length === 15`, último = 'Cyberpunk2078', `loops[0].radius === 1.2`, `loops[0].x === -1.36`.
3. **Tests (reescribir v1 y añadir nuevos).** Los 3 tests v1 dependen de la geometría anterior, así que se reescriben: portal obligatorio (barrido de yaw ±45° y potencia 0,3–1,0; ningún golpe entra al looping sin pasar por el portal); looping (barrido yaw ±6°, potencia 0,5–1,0; ≥ 95 % entran y completan; velocidad ≥ umbral + 1); ruta B (existe un golpe sin portal ni looping que llega a la cup, ver decisión 2); entrada por la salida (0 entradas desde el campo). Done: los 4 tests nuevos fallan con la v1 y pasan con la nueva disposición.
4. **Freeplay.** `tests/freeplay.test.js:8-9` ya está en 15. Done: sigue en 15.
5. **Sincronía.** `pnpm sync:functions` tras la tarea 2. Done: diff sin salida para courses.js y physics.js.
6. **Entorno.** environment.js, cyberpunkEnvironment.js y themes.js, gateados por tema. Done: `pnpm test` verde; test de que en calidad `low` se añade menos de N mallas; otros hoyos neón sin cambios.
7. **Efectos.** cyberpunkFx.js (nuevo), enganche en GolfGame.js y cambios en course.js. Done: grep de imports sin resultados; test de determinismo pasa.
8. **Vista previa.** `pnpm previews:capture "Cyberpunk2078"` → `public/courses/course-15.webp`. Done: webp posterior a la tarea 6; `course-preview.test.js:37-41` pasa. **No verificado:** necesita Chrome con WebGL.
9. **Migración.** Sin cambios: `course_count = '15'`. Done: sin llamadas al remoto.
10. **Wiki.** Actualizar la descripción del ambiente neón del hoyo 15 en `reglas-y-economia.md`; revisar constitution.md:35, estructura-y-stack.md:44 y validacion-y-antibots.md:7. Done: grep del recuento viejo sin resultados.
11. **Verificación final.** `bash scripts/verify.sh` (test, build, Deno, audit, autoría). Done: 123 + tests nuevos en verde; build y audit sin errores. Lo que no se pueda ejecutar se registra como no verificado.

Orden: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11.

## E. Riesgos

- **Ruta A demasiado fácil:** el acelerador hace que casi todo golpe por portal complete. Principal riesgo de paridad.
- **Ruta B sin golpe único:** con la disposición de prueba no hay golpe único. Ver decisión 2.
- **Bots y portal:** los bots solo usan el portal si su waypoint coincide con `portals[0].a`.
- **Rendimiento y legibilidad:** solo se comprueban en navegador.
- **Webp:** el generador necesita Chrome con WebGL; sin verificar.
- **Cifras de la sección A:** son de la disposición de prueba y hay que repetirlas con la final.

## Enmienda

**2026-10-29 (decisión de la persona, D-A).** Se elimina el criterio de coste parecido entre la ruta A y la ruta B (spec, sección Enmienda). Quedan sin efecto: la sección B, punto 2 (coste de cada ruta, N = 200), la cifra de «Coste parecido» de la tarea 3 y las alternativas de coste de la sección B. No se mide ni se exige coste A/B.

## Registro de la sonda (2026-10-29, tarea 1 detenida)

Disposición de la sección A con los muros de bolsa (`[-4,0.6]-[-1.48,0.6]`, `[-0.52,0.6]-[0.4,0.6]`, `[-1.48,0.3]-[-0.52,0.3]`), sin cerrar la salida. Barrido de 93 puntos libres y el tee, con yaw y potencia cuantizados (71.911 golpes).

- Entradas por la boca sin portal: 459 sin bolsa cerrada; 51 con la bolsa cerrada.
- Entradas por la boca con portal: 1.699 sin cerrar; 1.894 con la bolsa cerrada.
- **Entradas por la salida desde el campo: 765** (sin cerrar la salida).

Pruebas de cierre de la salida (todas con la bolsa cerrada), sin conseguir 0:

| Variante | Entradas por la salida |
|---|---|
| Sin cambios | 765 |
| Muro diagonal que desvía la salida | 1.012 |
| Muro horizontal con hueco en el carril de salida | 1.139 |
| Arena pequeña sobre la salida (`x -1,72, z -2,2, w 1,0, d 1,6`) | 473 |
| Arena grande sobre la salida (`x -1,72, z -2,6, w 1,6, d 2,4`) | 337 |

Motivo: la captura de la salida (`enterLoop`, física) se comprueba antes que las colisiones y es simétrica. Un muro que impide entrar por la salida también impide salir. Sin cambiar física ni LOOP_LANE no hay disposición con 0 entradas por la salida que mantenga la ruta A.

Bots de la disposición con bolsa cerrada (modelo `bots.js`, 12 partidas de `courses.test.js`): 9 de 12 con menos de 8 golpes; media 5,67. Cumple el criterio.

Alternativas para decidir (no aplicadas): (a) aceptar entradas por la salida con un coste medido y un criterio distinto; (b) cambiar la orientación del looping para que la salida dé a una zona sin campo; (c) permitir la salida solo tras el portal de salida, con un segundo portal en la boca de salida (requiere decisión sobre física de portales).

## Decisiones que la persona debe aprobar

1. El concepto de dos rutas y la disposición como principio; coordenadas definitivas tras la tarea 1.
2. Qué significa «ruta B existe»: ¿basta una secuencia de golpes sin portal ni looping, o se exige un solo golpe? Con la disposición de prueba no hay golpe único.
3. El tema nuevo `cyber2078`, para no alterar «Looping Neón».
4. Reescribir los tests v1 (no se conservan) y el número de tests nuevos.
5. Migración sin cambios y orden de despliegue (submit-hole antes).
