
## 2026-11-06 — vfx-lab-efectos

- Alcance elegido: portales, choques y efectos de skin; VFX de ambiente del mapa queda para otro ciclo.
- Banco de pruebas fuera del repo (`golfito-vfx-lab`), por decisión del equipo. Se permite motor propio donde dé mejor resultado, pero con paridad con el juego.
- Objeción levantada y anulada: riesgo de dos motores divergentes. Se cubre con criterio de paridad en la spec.
- Integración al juego dentro del mismo ciclo. Autopilot activado.

## 2026-11-06 — vfx-lab-efectos (plan)

- Arquitectura: el efecto es dato puro interpretado por un runtime compartido; el banco importa ese mismo runtime para que juego y banco no diverjan.
- Los efectos de skin siguen el formato de emisor ya existente (`P(...)`), como presets no asignados.
- Choque bola contra bola: fuera de ciclo. No hay colisión entre bolas en la física; se sustituye por el golpe en bumper.

## 2026-11-06 — flashRate en forma cerrada (feature: vfx-lab-efectos, task: T003)
Context   — tres rondas de revisión encontraron trabajo no acotado en el validador: expandir las repeticiones de un bucle costaba 1/duración, y el conteo de ventana era O(n²).
Options   — (a) guardas puntuales por entrada; (b) topes de repeticiones; (c) calcular en forma cerrada.
Decision  — (c): una ventana de 1 s abarca q periodos enteros más un resto cíclico, contado con dos punteros.
Why       — las guardas (a) y (b) dejaban siempre otra entrada que se cuelga; (c) hace que el coste dependa solo del número de destellos.

## 2026-11-06 — maxParticles entero y VfxPlayer con topes propios (feature: vfx-lab-efectos, task: T003/T004)
Context   — con un tope fraccionario `emissions` superaba `budget()`, y el plan original fijaba 40/120/300 para los efectos.
Decision  — `maxParticles` debe ser entero y `budget` lo trunca; el tope por efecto es el del `VfxPlayer` (24/60/120), el más estricto.
Why       — mantiene «nunca más emisiones que el presupuesto» y acota el peor caso junto a `SkinFX`.
