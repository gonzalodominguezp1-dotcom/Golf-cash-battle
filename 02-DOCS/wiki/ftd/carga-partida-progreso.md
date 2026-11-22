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
