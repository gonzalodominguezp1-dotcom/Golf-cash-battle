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
