---
type: analysis
title: Análisis de coherencia — vfx-lab-efectos
description: Cruce de constitución, spec, plan y tareas del banco de VFX antes de implementar.
tags: [sdd, analysis, vfx]
timestamp: 2026-11-06T20:00:00Z
topic: sdd
slug: vfx-lab-efectos
---

# Análisis de coherencia — vfx-lab-efectos

Artefactos leídos: [constitución](../constitution.md), [spec](../specs/vfx-lab-efectos.md), [plan y tareas](../plans/vfx-lab-efectos.md).

**GATE: BLOCKED** — 0 CRITICAL, 1 HIGH, 4 MEDIUM, 2 LOW.

## Mapa de cobertura (spec → plan → tareas)

| REQ | Requisito de la spec | Plan | Tareas | Estado |
|---|---|---|---|---|
| AC1 | Cualquier efecto se reproduce sin errores | §2 banco, §5 | T001, T007 | covered |
| AC2 | Bucle sin salto | §3 garantías | T002, T003 | covered |
| AC3 | Una vez: sin partículas al acabar | §3 garantías | T002–T004 | covered |
| AC4 | Paridad por semilla | §3, §5 | T002, T003, T009 | covered |
| AC5 | Presupuesto por calidad | §0, §5 | T003, T004, T012 | covered (medición humana) |
| AC6 | Reducción de movimiento | §0, §5 | T002, T003, T011 | covered |
| AC7 | Máx. 3 destellos/s | §0, §3 | T002, T003 | covered |
| AC8 | Crear, duplicar, editar y borrar | §4 | T007 | **AMBIGUOUS**: solo efectos, no skins (F1) |
| AC9 | Exportar bloqueado si excede | §3 | T007 | covered |
| AC10 | Primera tanda | §2, §6 | T005, T006, T008–T010 | covered |
| AC11 | El juego lo dispara y se ve igual | §4, §5 | T004, T010, T011, T012 | covered |
| AC12 | El banco no está en el repo | §0 | T001, T013 | covered |
| Goal | Crear, editar y borrar **skins** desde el banco | no hay entidad skin | — | **GAP** (F1) |
| Edge | Muchos efectos a la vez sin cortes bruscos | §7 riesgo 1 | T004 (solo límite duro) | AMBIGUOUS (F3) |
| Error | Parámetro inválido, pieza del juego ausente | §3 | — | GAP menor (F3) |

## Hallazgos

| # | Severidad | Tipo | Artefacto A | Artefacto B | Conflicto | Resolver en |
|---|---|---|---|---|---|---|
| F1 | HIGH | GAP | Spec §Goals y §What the user can do: «crear, duplicar, editar y borrar efectos y skins» | Plan §4 y tareas: solo existe la entidad `Effect`; T007 solo hace CRUD de efectos | Lo que pidió el equipo («crear/borrar/editar todo tipo de efectos, skins y demás») no tiene entidad, tarea ni done-check para las skins | `plan` (entidad Skin en el banco y su exportación) y `tasks` |
| F2 | MEDIUM | AMBIGUOUS | Plan §0: presupuesto 40/120/300 «los de `LEVELS`» | Plan §2: `VfxPlayer` con su propio pool; §7 riesgo 1 | No dice cuántas partículas suma el `VfxPlayer` por encima de las de `SkinFX`, ni si el efecto de mundo sustituye al de la skin o se suma en pared/bumper/hoyo. Puede doblar el coste en P7.1 | `plan` |
| F3 | MEDIUM | AMBIGUOUS | Spec §Behaviour (casos límite y errores) | Tareas | «Sin cortes bruscos», «calidad `low` reconocible», «parámetro inválido muestra aviso» y «falta una pieza del juego» no tienen criterio binario ni tarea | `clarify` (criterio) y `tasks` |
| F4 | MEDIUM | AMBIGUOUS | Tareas T006, T007, T005, T010 | Plan §0 y regla de portadores | Faltan bloques *Interfaces* con firmas exactas: `buildPortal(scene, [x, z], r, color, y, time, seed = 0)`, la forma `P(cell, n, speed, spread, size, life, col, extra)` y lo que consume el editor | `tasks` |
| F5 | MEDIUM | CONTRADICTION | Tareas T014: depende de T001–T013 | T012 es humana (móvil real) y la constitución Q2.5 la exige | El cierre automático se queda parado en T012 durante el autopilot | `tasks` |
| F6 | LOW | DRIFT débil | Plan §6 paso 1: «retirar `engine.js` propio de la ruta crítica» | T001: su done-check no lo comprueba | Trabajo anunciado sin verificación | `tasks` |
| F7 | LOW | AMBIGUOUS | Plan §3: `VfxPlayer.play(effect, { pos, normal?, seed })` | Juego: `skinFx.onWall(strength, pos, normal)` | La fuerza del golpe no llega al efecto, que no puede escalar con ella | `plan` |

## Cumplimiento de la constitución
Sin infracciones. C1.4 y Q2.2 no se tocan (física intacta). K3.4 cumplido (módulos en `src/game/render/`). K3.5 y B4.x recogidos en §0. P7.1 y Q2.5 quedan cubiertos solo por la medición humana de T012 (brecha conocida: no hay medición de FPS en CI).

## Rutas recomendadas
- **plan:** F1, F2, F7.
- **clarify:** F3 (criterios).
- **tasks:** F1 (tareas de skin), F3, F4, F5, F6.
