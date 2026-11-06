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
