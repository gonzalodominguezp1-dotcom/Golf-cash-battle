# Progreso: carga de partida (sigue a carga-partida-propuesta.md)

Rama de trabajo: `la-chaqueta-bionica-carga-partida` (worktree `.worktrees/la-chaqueta-bionica-carga-partida`, desde `origin/la-chaqueta-bionica`). Sin commits todavía.

## Decisiones del usuario (§5)
- Móvil de referencia: Nothing Phone 2a (Android gama media).
- Sala de práctica: se mantiene la sala tal cual; pendiente de decisión (F5).
- Intro de 2,2 s: se mantiene; pendiente de F5 (el usuario preguntó qué es; es la animación de cámara al empezar cada hoyo).
- Hold en sala: práctica 2000 ms, vivo 1000 ms.
- Volver al lobby con búsqueda activa: igual que ahora (hub con su 3D, se descarta lo preparado).
- Prefetch del motor: en reposo del hub, respetando `Save-Data`.
- Supabase staging: no existe confirmado; F2/F3 apagados en vivo con interruptor.
- Memoria: «hoyo actual + siguiente» en todas las calidades.
- «Reiniciar» en práctica: se mantiene.
- Optimización: se permite sin tocar shaders o bajando calidad gráfica; pendiente de datos.

## Línea base de tests (antes de F0)
- `node --test` sobre todos los tests salvo `rock-env` y `courses`: 1183 pass, 0 fail.
- `rock-env` y `courses` dieron timeout de 60 s en la primera ejecución.
- `pnpm run build`: OK.

## F0 — Instrumento de medición
- Estado: **implementada, pendiente de medición del usuario**.
- Verificación del agente y revisión propia:
  - `pnpm test`: 1238 pass, 0 fail (incluye `rock-env` y `courses`, que antes daban timeout).
  - `node --test tests/perf-probe.test.js`: 14 pass.
  - `pnpm run build`: OK.
  - Sin `?perf=1`: `createPerf(false)` no llama a `makeDeps`, no crea observadores ni `window.__gcbPerf`; el panel se importa solo con PERF.
- Pendiente (usuario, en Nothing Phone 2a):
  1. Sin `?perf=1`: no aparece el panel y `window.__gcbPerf` es `undefined`.
  2. Con `?perf=1`: aparece el panel; tras práctica de 3 hoyos, «Copiar informe» da JSON con marcas `gcb:*`, `derived` y `reliability`.
  3. Con pestaña oculta o sin foco, el informe sale NO FIABLE y sin FPS.
  4. `?perf=1&perfcourses=3,6,12` fuerza esos mapas en práctica; índices inválidos o mesas de pago se ignoran.
  5. El juego se ve y se juega igual que antes.
- Rollback: revertir el commit, o forzar `PERF = false` en `src/game/perfProbe.js`.
- Riesgo residual: el código de `perfProbe.js` sí viaja en el bundle principal aunque esté desactivado (ver tamaño en el build).

## F1 — Arreglos rápidos (implementadas, pendientes de verificar en producción)
Verificación local: `pnpm test` 1252 pass / 0 fail; `pnpm run build` OK. Sin commit ni push.

- **F1a, caché `immutable` para `/assets/*`** (`vercel.json`, `tests/vercel-headers.test.js` 4/4). Rollback: quitar la entrada.
- **F1b, prefetch del motor** (`src/main.js`, `src/game/prefetchRules.js`, `tests/prefetch-rules.test.js` 2/2). `PREFETCH_DECISION = 'idle'`; ponerlo en `'onPlay'` desactiva el prefetch en reposo. Las llamadas anticipadas al iniciar partida siguen activas con ese interruptor.
- **F1c, compilación correcta y primer frame oculto** (`src/game/GolfGame.js`, `src/game/warmupRules.js`, `tests/warmup-rules.test.js`). `WARM_GPU = true`; ponerlo en `false` devuelve el comportamiento anterior. Desviación del encargo: el `compileAsync` de `#buildScene` queda solo bajo `if (!WARM_GPU)`, para que el rollback funcione. Con `WARM_GPU = true` no hay compilación doble. Decisión del agente: si `load()` se llama con el bucle ya corriendo, lo para mientras calienta y lo reinicia al final.

Checklist de producción (tras fusionar y desplegar, con `?perf=1&perfcourses=3,6,12`):
1. `curl -sI` a `/assets/<x>.js` muestra `max-age=31536000, immutable`; `/` sigue con `max-age=0`; `version.json` sin `immutable`.
2. `import:end` antes de `room:end`; `prefetch:start`/`prefetch:end` presentes; sin prefetch con Data Saver.
3. Modo avión → Práctica da error controlado; con red, reintenta y funciona.
4. `programas_frame1` ≤ 12 en El Portal y Looping Neón (Medio).
5. Sin pantalla negra al entrar; la intro se ve entera; Bajo y Alto iguales; calidad a mitad de hoyo; Modo Libre, desempate `#hoyo3-empate` y volcán bien; hoyos 2 y siguientes arrancan bien.

Hallazgo no tratado: `vercel.json` usa `npx -y pnpm@…` en `installCommand` y `buildCommand`. CLAUDE.md prohíbe `npx`. Pendiente de decisión del usuario.

## F2 — Hoyo 1 preparado durante la sala (implementada, sin verificar en navegador)
Verificación local: `pnpm test` 1275 pass / 0 fail; `pnpm run build` OK. Sin commit ni push.
- Archivos: `src/game/gamePreloader.js`, `src/game/loadingFlags.js`, `src/game/GolfGame.js` (`prepare`, `attach`, `setHandlers`, `#ensureInput`, camino rápido en `load`), `src/game/warmupRules.js` (`keyOf`), `src/main.js`, `tests/game-preloader.test.js` (22 tests).
- Interruptores: `WARM_IN_ROOM` (o `?warm=0`) apaga la preparación en sala; `WARM_LIVE = false` deja vivo sin preparar; `WARM_GPU` (F1c) apaga el calentamiento de GPU.
- Decisiones del usuario aplicadas: hold práctica 2000 ms, vivo 1000 ms; hub vuelve con su 3D y se descarta la preparación; vivo apagado; sala e intro sin cambios; «Reiniciar» en práctica intacto.
- Cambio de comportamiento a revisar: la preparación libera la escena 3D del hub al empezar la sala, así que al volver al hub con la búsqueda activa la escena se recrea (se ve primero la imagen fija). Es la consecuencia de liberar el hub; el usuario lo aceptó como «igual que ahora» pero conviene confirmarlo.
- Pendiente de medición en producción (checklist del informe de F2: práctica con `?perf=1&perfcourses=3,6,12`, `warm:take:hit`, `post_sala_ms`, tirones en la sala, Esc/Espacio durante la sala, revancha, calidad a mitad de búsqueda, giro de móvil, `?warm=0` para comparar).

## F3 — Renderer persistente y hoyo siguiente (implementada, sin verificar en navegador)
Verificación local: `pnpm test` 1290 pass / 0 fail; build OK. Sin commit ni push. F4 (caché de texturas) sigue sin hacer: F3 usa el contrato mínimo.
- Archivos: `src/game/render/sceneDisposal.js`, `src/game/holeWindowRules.js`, `src/game/GolfGame.js` (`prepareNext`, `whenNextReady`, `cancelNext`, `detach`, intercambio en `load`), `src/game/loadingFlags.js`, `src/main.js`, tests `scene-disposal` y `hole-window-rules`.
- Interruptores: `PERSISTENT_RENDERER` (o `?persist=0`) vuelve a F2; `NEXT_HOLE_PREBUILD` (o `?next=0`) no prepara el siguiente; `PERSISTENT_LIVE = false`: vivo como hoy.
- Revisar: (1) la bola y sus efectos se pasan un instante a la escena preparada durante `compileAsync`, en la misma tarea; (2) el material de la bola puede regenerarse si cambia el tema; (3) viento compartido devuelto al hoyo actual; (4) sin manejo de pérdida de contexto (three la recupera; se cancela `#next`); (5) si el siguiente no está listo a 1 s, se construye por el camino normal.
- Checklist: el informe del subagente F3 (práctica de 3 hoyos con `?perf=1&perfcourses=3,6,12`; `contextos_partida.creados = 1`; `next:hit`; texturas y geometrías sin crecer entre partidas; desempate `#hoyo3-empate`; Modo Libre; calidad a mitad de hoyo y paso a/desde Bajo; salir a mitad de hoyo 2; girar el móvil; `?perf=1&persist=0` para comparar; vivo igual que antes).

## F4 — Caché de texturas procedurales (implementada, sin verificar en navegador)
Verificación local: `pnpm test` 1299 pass / 0 fail; build OK. Sin commit ni push.
- Archivos: `src/game/render/textureCache.js` (nuevo), `src/game/render/textures.js` (12 generadores envueltos con `cached()`), `tests/texture-cache.test.js` (9 tests).
- No tocados (candidatos a otra pasada): `lushEnvironment.js`, `flora.js`, `attractions.js`, `cyberpunkEnvironment.js`.
- Interruptor: `TEXTURE_CACHE = false` (en `textureCache.js`) vuelve a generar cada vez; `maxBytes = 0` también.
- Límites: Bajo 8 MB, Medio 24 MB, Alto 64 MB (propuesta; no confirmados por el usuario).
- Riesgos a medir: `Texture.copy` marca `needsUpdate`, así que cada clon puede forzar una resubida a GPU de la imagen compartida; reenlace de `repeat` (arena, normales); comportamiento de `dispose` de clon con F3 en escena real.
- Checklist: capturas lado a lado de hierba, arena, tierra, madera, hielo y neón (idénticas); sin desalineación en arena; `stats().hits > 0` desde el hoyo 2; `load_desglose` baja; cambio de calidad sin cruzar texturas. `textureCache` no está expuesto en `window`: hace falta para leer `stats()` en consola.

## F5 — Decisiones de producto (implementada, sin verificar en navegador)
Verificación local: `pnpm test` 1308 pass / 0 fail; build OK. Sin commit ni push.
- Sala de práctica: mínimo 2500 ms desde el clic (`src/game/roomTiming.js`, `ROOM_MIN_MS = 2500`). Con `ROOM_MIN_MS = 0` o `?room=old`, tiempos de antes. Solo práctica y mesas locales.
- Intro: un toque la salta fuera del vivo (`src/game/introSkip.js`, `INTRO_SKIP = true`). El toque que salta no dispara golpe. Con `INTRO_SKIP = false`, no hay salto. En vivo sin cambios.
- No hechas (no aprobadas o dependen de datos de F0): dieta de shaders (prohibido tocar shaders), worker de texturas, caché de shaders de Chrome.
- Riesgo: el salto con ratón podría pedir pointer lock en el primer clic (el agente lo ha tratado ignorando el click siguiente); verificar en navegador.
- Checklist: sala ≥ 2,5 s y animación sin cortes; `?room=old` como comparación; intro saltable con toque (ratón y táctil) sin golpe en el toque que salta; intro en vivo igual; mesas de pago en local igual.
