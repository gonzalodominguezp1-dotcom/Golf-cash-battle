
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

## 2026-11-12 — Alcance de la UI por pantallas (feature: ui-pantallas, task: spec)
Context   — se pide un hub tipo MatDrive con pantallas completas y splash; varios datos (liga, desafíos temporales, cofres, historial) no existen.
Decision  — solo interfaz y navegación; los datos inexistentes se listan como huecos y el modelo de desafíos se propone sin construirlo; sin service worker.
Why       — el saldo es real y lo decide el servidor (S5.7); mostrar datos falsos o cacheados induciría a error.

## 2026-11-12 — Clarify de la UI por pantallas (feature: ui-pantallas, task: clarify)
Context   — 13 preguntas al humano sobre datos reales, composición del hub, escena y navegación.
Decision  — sin retos con fecha ni pantallas Desafíos/Recompensas («desafíos» pasa a «logros»); hub con escena 3D propia (hoyo en bosque de día) cargada durante el splash; composición fija de C10; sin saldo ni botón de silencio en el hub; atrás en el hub no hace nada; bocetos aprobados antes de splash y hub.
Why       — decisión del humano; mantiene solo datos reales en un juego con saldo real.
Exception — U6.6 (botón de silencio visible) queda exceptuada en el hub por decisión del humano; el silencio sigue en Ajustes y con M. Pendiente de anotar en la tabla de enmiendas de la constitución.

## 2026-11-12 — Plan de la UI por pantallas (feature: ui-pantallas, task: plan)
Context   — `main.js` concentra navegación, pantallas y fugas de listeners/timers; hay que meter router, hub 3D y splash sin pasar de +15 KB gzip en la carga inicial.
Options   — (a) pantallas vivas apiladas en el DOM; (b) destruir al tapar y remontar al volver, con el hub como única pantalla viva; splash como módulo de Vite o como script clásico en `public/`.
Decision  — (b) con pantallas `mount(ctx) → { destroy }` cargadas por `import()` y todo efecto secundario en un `scope` inyectado; splash como script clásico en `public/splash.js` que habla con el bundle por `window.gcbSplash`. Three/escena no bloquean el splash: tras 8 s el hub usa la imagen fija.
Why       — el `scope` hace cumplir AC5 por construcción; los chunks por pantalla adelgazan la entrada (AC34); Vite agrupa los scripts módulo del HTML y el splash no podría pintarse antes del bundle (AC25).
Open      — saldo en la cabecera de Ranking (AC1 frente a C11; el plan sigue C11); amigos salen de Cuenta › Perfil hacia «Amigos y grupo» con un acceso en Perfil; `#hoyoN` se mantiene «como hoy» (prepara la práctica, se juega al pulsar Práctica).
