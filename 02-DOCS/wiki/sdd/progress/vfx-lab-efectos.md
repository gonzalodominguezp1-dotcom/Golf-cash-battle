---
type: progress
title: Progreso — vfx-lab-efectos
description: Registro del autopilot y cola de decisiones para el banco de VFX.
tags: [sdd, progress]
timestamp: 2026-11-06T18:00:00Z
topic: sdd
slug: vfx-lab-efectos
---

# Progreso — vfx-lab-efectos

Modo: **autopilot** (aprobación global del equipo, no punto por punto).

## Decision queue

| id | tipo | decisión | estado |
|----|------|----------|--------|
| 1 | review-after | La referencia visual de "Qué resultado obtiene" es mecánica (ficha por efecto, presupuesto, criterios). Una persona debe aprobar capturas o vídeo de cada efecto de la primera tanda. | pendiente |
| 2 | resuelto | Rama de trabajo: `CLAUDE.md` exige identificar a quién habla (`la-yuinta-mangante` o `la-chaqueta-bionica`). No se ha dicho. Hace falta antes de tocar código del juego o de hacer commit. | pendiente |
| 3 | review-after | Cambios del sync de rsc sin commitear: `.claude/rsc-bootstrap.mjs`, `.claude/settings.json`, `.rsc.json`. | pendiente |

## Log

- 2026-11-06 — spec escrita (`specs/vfx-lab-efectos.md`).

## Clarify (autopilot)

Preguntas registradas como suposición en la spec, y para revisión posterior:

| id | tipo | decisión | estado |
|----|------|----------|--------|
| 4 | review-after | Primera tanda: 1 portal, 3 choques, 3 efectos de skin (épico, legendario, mítico). | pendiente |
| 5 | review-after | Entrega al juego como archivos nuevos en `src/` revisables en PR, sin el banco. | pendiente |
| 6 | review-after | Los 3 efectos de skin no se asignan a una skin existente hasta aprobarlo. | pendiente |
| 7 | review-after | Semilla exigible solo a efectos nuevos; `effects.js` usa `Math.random()` hoy. | pendiente |
| 8 | review-after | Medir presupuesto en móvil real o emulado de gama media (no lo puede hacer el agente). | pendiente |

El bloqueo 2 (rama) queda resuelto: el compañero, `la-chaqueta-bionica`. Ningún punto es `blocking`.

## Implement (autopilot)

## T001 — 2026-11-06
- status: complete (banco, fuera del repo; sin tier)
- done-check: `window.__lab.singleThree === true`, `window.__lab.schema.validate` carga desde la ruta del juego, consola sin errores (comprobado en el navegador)
- files (fuera del repo): `golfito-vfx-lab/vite.config.js`, `src/gameBridge.js`, `src/main.js`
- decision: el done-check pasó a no exigir retirar `engine.js`; esa comprobación vive en T007

## T002/T003 — 2026-11-06
- status: implemented, en revisión (ronda 3 de 3, fix `43e515e`)
- red: `node --test tests/vfx-schema.test.js` falló por aserción con el módulo en stub; green: 10/10 al implementar
- commits: `29ef9cd` (feat), `06a09b5` (fix ronda 1), `43e515e` (fix ronda 2)
- risk: tier 1 (`rsc risk --base`), un revisor de contexto limpio por ronda
- review: ronda 1 → 10 hallazgos, todos corregidos (L1–L10); ronda 2 → 2 hallazgos (1 bloqueante: validador colgado con bucle minúsculo; 1 should-fix: presupuesto fraccionario), corregidos (L11–L12); ronda 3 en curso
- controls: tests ✅ (219/219) build ✅ audit ✅ traceability ✅ (AC2–AC7, AC13)
- mutantes comprobados: quitar el tope de `strength` y romper el bucle del runtime hacen fallar las pruebas

## T004 — 2026-11-06
- status: implemented, en revisión (ronda 1 de 3, commit `6cd2527`)
- red: 11 de 12 fallaban por aserción con el stub; green: 12/12
- risk: tier 1
- controls: tests ✅ (219/219) build ✅ audit ✅ traceability ✅ (AC3, AC5, AC11, AC14)
- pendiente conocido: la prueba de «`update` no asigna memoria» no existe como prueba automática (no hay forma fiable en `node --test` sin `--expose-gc`); la garantía es estructural (casillas fijas y paquete de emisiones precalculado en `play`)

## T003 — 2026-11-06 (actualización)
- status: PARKED (blocking), decisión humana pendiente
- review: ronda 3 de 3 agotada con 1 bloqueante (L13: `validate` sin acotar con un bucle de duración minúscula y `flashes: []`) y 1 should-fix (L14: conteo de ventana O(n²)). Misma clase que el bloqueante de la ronda 2 (trabajo no acotado en el validador).
- fix (commit `72abc22`, sin cuarta revisión): `flashRate` pasa a forma cerrada (q periodos enteros × destellos + resto cíclico, dos punteros): su coste depende solo del número de destellos, nunca de `1/duración`.
- evidencia propia: 37 pruebas en verde (suite 226/226), `validate` responde en <1 s con duraciones 1e-9, 1e-12 y 1e-300, con `flashes: []` y con 1e5 destellos; el mutante «el bucle no vuelve a emitir» y los de `strength`/tope mueren.
- por qué se aparca: el ledger corta en la ronda 3 y el protocolo exige aparcar una tarea que no converge; el agente no puede dar por buena su propia corrección.

## T004 — 2026-11-06 (actualización)
- status: implemented, ronda 1 de 3 corregida (commit `72abc22`); su cierre espera a T003
- review: 8 hallazgos (5 should-fix, 3 nit) → 7 corregidos (L16–L22); L15 `intentional`: no hay prueba automática de «`update` no asigna memoria» (no es medible de forma fiable con `node --test`); se sustituyó el `for-of` por un bucle indexado y la garantía sigue siendo estructural
- controls: tests ✅ (226/226) build ✅ audit ✅ traceability ✅ (AC2, AC3, AC5, AC14)
- mutantes comprobados: bucle que no vuelve a emitir, sin guarda de `dt`, color sin hex: las pruebas los matan

## Decision queue (añadido)

| id | tipo | tarea | decisión | estado |
|----|------|-------|----------|--------|
| 9 | blocking | T003 | ¿Se acepta el arreglo de `flashRate` (forma cerrada, commit `72abc22`) sin una cuarta revisión independiente, dejando que la revisión de cierre de toda la rama lo cubra? Recomendación: sí, porque la causa de la clase de defecto desaparece y está probada con mutantes. Opciones: aceptar / pedir revisión humana del diff `43e515e..72abc22` en `schema.js`. | cerrada por una persona: aceptado sin cuarta revisión (2026-11-06) |

## T003 — 2026-11-06 (cierre)
- status: complete. La persona aceptó el arreglo de `flashRate` (`72abc22`) sin cuarta revisión; la revisión de cierre de toda la rama (etapa 5) lo volverá a leer.

## T005 — 2026-11-06
- status: complete
- red: 7 de 25 fallaban por aserción antes de implementar; green: 45/45 al implementar
- commits: `1cbb64e` (feat), `0901fac` (fix ronda 1), `1b…` ver `git log` (test de strength en anillos)
- risk: tier 1
- review: ronda 1 → 6 hallazgos (2 should-fix, 3 nit, 1 question), todos corregidos (L23–L28). Ronda 2 → pass, 1 nit (L29, corregido). Decisiones: las luces pasan a su propio pool (MAX_LIGHTS = 4) para que el tope de partículas no las pierda (AC13); `k` se define como brillo 0..1 y se valida; `strength` escala anillos y destellos; los anillos usan mezcla normal como los `Shockwaves` del juego.
- controls: tests ✅ (256/256 con T006) build ✅ audit ✅ traceability ✅ (AC10, AC13, AC6)
- mutantes comprobados: orientación wall, calma de luz, `k`, destello que no se repite en bucle, anillo cortado con el pool lleno, `strength` en anillos

## T006 — 2026-11-06
- status: complete
- red: 9 de 9 fallaban con el stub; green: 9/9 al implementar
- commits: `b3be292` (feat), `ecdec25` y `2ece887` (fix ronda 1 y 2)
- risk: tier 1
- review: ronda 1 → 4 hallazgos (1 should-fix: un tiempo NaN dejaba el portal atascado; 3 nit de pruebas), corregidos (L30–L33). Ronda 2 → pass, 2 nit (L34–L35), corregidos.
- files: `src/game/render/vfx/portalState.js` (puro) y `src/game/render/portal.js` (+10 líneas: `group` y `setOpen`, firma intacta, CRLF respetado)
- controls: tests ✅ (256/256) build ✅ audit ✅ traceability ✅ (AC10)
- mutantes comprobados: continuidad, guarda de `dt`, ronda de tiempos, `setOpen` con NaN, luz sin `open`, duración entera

## T004 — nota
- La ronda 2 formal de T004 no se ha hecho; el runtime se releyó entero en las dos rondas de T005 (que dio pass). Queda cubierto por la revisión de cierre de toda la rama (etapa 5).

## T007 — 2026-11-06
- status: complete (banco, fuera del repo; sin tier, sin revisión por tier)
- red: 10 de 10 pruebas de `golfito-vfx-lab/test/library.test.js` fallaban con el stub; green: 10/10 (`node --test test/`)
- done-check: `await window.__lab.selfcheck()` devuelve `ok: true` con 21 pasos: crear, duplicar, editar con errores por nombre, exportación bloqueada con un efecto inválido y con uno que excede el presupuesto (AC9), borrar con aviso y con `force` (AC8), reproducir cada efecto en low/medium/high dentro del tope y terminando vacío o en bucle, pieza del juego ausente (AC15), una sola copia de `three`. Consola sin errores. `grep -c "engine.js" src/main.js` da 0 y se retiraron `engine.js` y los seis efectos de prueba.
- verificado en el navegador: editar la duración a 0 desde el formulario pone el semáforo en rojo, lista los errores y deshabilita «Exportar»; devolverla a 1 lo vuelve a habilitar. Hallazgo propio: las listas de emisores, anillos y luces salían como `[object HTMLDivElement]` (append no aplana arrays); corregido.
- files (fuera del repo): `golfito-vfx-lab/src/{main,library,export,palettes,starter,gameBridge}.js`, `index.html`, `vite.config.js`, `test/library.test.js`
- decisión: `selfcheck` es asíncrono porque comprueba la carga por piezas con `loadGame`.

## Reparto del trabajo restante (a petición de la persona)
- Subagentes: Sonnet para contenido y pruebas (T008/T009 packs, T015 entidad Skin), Haiku para comprobaciones mecánicas (T013), Opus solo para UI, funcionalidad y complejidad (T016 editor de skins, T010/T011 integración en el juego).
