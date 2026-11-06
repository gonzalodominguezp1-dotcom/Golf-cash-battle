
## 2026-11-06 — vfx-lab-efectos

- Alcance elegido: portales, choques y efectos de skin; VFX de ambiente del mapa queda para otro ciclo.
- Banco de pruebas fuera del repo (`golfito-vfx-lab`), por decisión del equipo. Se permite motor propio donde dé mejor resultado, pero con paridad con el juego.
- Objeción levantada y anulada: riesgo de dos motores divergentes. Se cubre con criterio de paridad en la spec.
- Integración al juego dentro del mismo ciclo. Autopilot activado.

## 2026-11-06 — vfx-lab-efectos (plan)

- Arquitectura: el efecto es dato puro interpretado por un runtime compartido; el banco importa ese mismo runtime para que juego y banco no diverjan.
- Los efectos de skin siguen el formato de emisor ya existente (`P(...)`), como presets no asignados.
- Choque bola contra bola: fuera de ciclo. No hay colisión entre bolas en la física; se sustituye por el golpe en bumper.
