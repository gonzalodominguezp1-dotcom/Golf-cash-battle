---
type: analysis
title: Análisis de coherencia — vfx-lab-efectos
description: Cruce de constitución, spec, plan y tareas del banco de VFX antes de implementar. Segunda pasada, tras resolver la ronda 1.
tags: [sdd, analysis, vfx]
timestamp: 2026-11-06T21:00:00Z
topic: sdd
slug: vfx-lab-efectos
---

# Análisis de coherencia — vfx-lab-efectos

Artefactos leídos: [constitución](../constitution.md), [spec](../specs/vfx-lab-efectos.md), [plan y tareas](../plans/vfx-lab-efectos.md).

**GATE: PASS** (segunda pasada) — 0 CRITICAL, 0 HIGH, 0 MEDIUM abiertos, 1 LOW abierto.

La primera pasada (commit `df8f763`) dio `BLOCKED`: 1 HIGH, 4 MEDIUM, 2 LOW. Cada hallazgo se devolvió a su fase y se resolvió; la historia está en git.

## Mapa de cobertura

| REQ | Requisito | Tareas | Estado |
|---|---|---|---|
| AC1 | Se reproduce sin errores | T001, T007 | covered |
| AC2 | Bucle sin salto | T002, T003 | covered |
| AC3 | Una vez, sin partículas al acabar | T002–T004 | covered |
| AC4 | Paridad por semilla | T002, T003, T009 | covered |
| AC5 | Presupuesto por calidad | T003, T004, T012 | covered (medición humana) |
| AC6 | Reducción de movimiento | T002, T003, T011 | covered |
| AC7 | Máx. 3 destellos/s | T002, T003 | covered |
| AC8 | Crear, duplicar, editar, borrar efectos | T007 | covered |
| AC9 | Exportar bloqueado si excede | T007 | covered |
| AC10 | Primera tanda | T005, T006, T008–T010 | covered |
| AC11 | El juego lo dispara y `pnpm test`/`build` | T004, T010–T012 | covered |
| AC12 | El banco no está en el repo | T001, T013 | covered |
| AC13 | `low` conserva anillo, destello y 30 % | T017 | covered |
| AC14 | Pool lleno no corta partículas vivas | T017 | covered |
| AC15 | Errores de parámetro y pieza ausente | T017 | covered |
| AC16 | CRUD de skins (apariencia y efectos) | T015, T016 | covered |

Ninguna tarea queda sin criterio. Ningún criterio queda sin tarea.

## Estado de los hallazgos de la ronda 1

| # | Severidad | Estado | Cómo se resolvió |
|---|---|---|---|
| F1 | HIGH | resuelto | Entidad Skin en el plan, AC16 en la spec y tareas T015–T016 |
| F2 | MEDIUM | resuelto | Topes del `VfxPlayer` 24/60/120 y regla «sustituye al soplo genérico y se suma a la skin», como suposición |
| F3 | MEDIUM | resuelto | AC13–AC15 y tarea T017 |
| F4 | MEDIUM | resuelto | Bloques *Interfaces* de T005, T006, T007, T010 y T015 con firmas exactas |
| F5 | MEDIUM | resuelto | T014 ya no espera a T012; T012 bloquea `ship` desde la cola de decisiones |
| F6 | LOW | resuelto | El done-check de T001 comprueba que el banco ya no importa `engine.js` |
| F7 | LOW | resuelto | `strength` añadido a `VfxPlayer.play` |

## Hallazgos nuevos de esta pasada

| # | Severidad | Tipo | Conflicto | Estado |
|---|---|---|---|---|
| F8 | LOW | solape de archivos | T016 [P] y T017 editaban el mismo `selfcheck` del banco | resuelto: T017 depende ahora de T016 |
| F9 | LOW | ambiguo | AC16 dice «vista previa usa los efectos asignados» sin definir un resultado binario | **abierto**: se concreta al escribir la prueba de T015 y se acepta de forma consciente |

## Cumplimiento de la constitución
Sin infracciones. Física intacta (C1.4, Q2.2), módulos en `src/game/render/` (K3.4), autoría y ramas recogidas en §0 (K3.5, B4.x). P7.1 y Q2.5 dependen de la medición humana de T012, que queda en la cola de decisiones (entrada 8) y bloquea `ship`.

## Siguiente
`implement`, empezando por T001 (banco) y T002 (pruebas del esquema), que no dependen entre sí.
