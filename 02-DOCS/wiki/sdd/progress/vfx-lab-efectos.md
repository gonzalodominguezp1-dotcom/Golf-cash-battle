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
| 2 | blocker | Rama de trabajo: `CLAUDE.md` exige identificar a quién habla (`la-yuinta-mangante` o `la-chaqueta-bionica`). No se ha dicho. Hace falta antes de tocar código del juego o de hacer commit. | pendiente |
| 3 | review-after | Cambios del sync de rsc sin commitear: `.claude/rsc-bootstrap.mjs`, `.claude/settings.json`, `.rsc.json`. | pendiente |

## Log

- 2026-11-06 — spec escrita (`specs/vfx-lab-efectos.md`).
