---
type: spec
title: Spec — Banco de VFX y efectos de portales, choques y skins
description: WHAT y WHY de un banco de pruebas para crear, editar y aprobar efectos 3D (portales, choques, efectos de skin) y de llevar lo aprobado al juego.
tags: [sdd, spec, vfx, skins, portales]
timestamp: 2026-11-06T18:00:00Z
topic: sdd
slug: vfx-lab-efectos
status: clarified (approved in autopilot, not item by item)
---

# Spec — Banco de VFX y efectos de portales, choques y skins

> Slug: `vfx-lab-efectos` · Status: clarified, aprobada en autopilot (no punto por punto) · Created: 2026-11-06
> Inherits: [constitution](../constitution.md)
> Origen: análisis de `patch-gg/pixelfx` (MIT) y primer banco de pruebas en `C:\Users\DEV\Desktop\golfito-vfx-lab`, fuera del repo.

## Problem & why
Los efectos de Golf Cash Battle (estelas, auras, choques, portales) se escriben a mano como emisores en código y solo se
ven bien jugando una partida. Para afinar un efecto hay que recargar el juego, llegar al momento exacto y volver a
mirar. Eso frena la iteración y hace que los efectos se parezcan entre sí: el catálogo tiene 62 skins y los tiers bajos
comparten casi los mismos efectos. Quienes hacen el juego necesitan ver, ajustar y comparar un efecto en segundos, con
libertad creativa de videojuego, y estar seguros de que lo aprobado se ve igual en partida.

## Cost of not building it
Cada efecto nuevo cuesta ciclos de recarga y prueba en partida. Los portales, los choques y las firmas de skin siguen
siendo lo más suelto del código y lo más caro de afinar, y las skins de tier alto ofrecen poca diferencia visible frente
a las de tier bajo. No hay un daño crítico: es coste de tiempo y de calidad percibida, no un fallo.

## The cheapest alternative
Añadir entradas a las firmas de skin ya existentes y afinarlas jugando. Resuelve el contenido nuevo sin construir
herramienta alguna, pero no acorta el ciclo de iteración, que es el problema, y no cubre portales ni choques, que hoy
tienen código propio y no son datos. Quien decide (el equipo) ha elegido construir el banco igualmente.

**Objeción registrada y anulada por el equipo:** se advirtió que un banco con motor distinto al del juego duplicaría
el mantenimiento y los efectos podrían verse diferentes en partida. El equipo decidió seguir adelante y dejó la
condición de que el banco use las clases reales del juego donde existan, y que se pueda crear algo nuevo cuando eso dé
mejor resultado. El riesgo de divergencia se cubre con un criterio de paridad (ver Acceptance criteria).

## Goals
- Ver cualquier efecto de portal, choque o skin reproduciéndose al instante, sin entrar en una partida.
- Poder crear, duplicar, editar y borrar efectos y skins desde el banco, no solo reproducir los de ejemplo.
- Que un efecto aprobado en el banco se vea igual en el juego.
- Respetar el presupuesto de calidad (low, medium, high) y la reducción de movimiento en cada efecto desde el banco.
- Una primera tanda de efectos de portales, choques y skins con identidad propia, que cubra más de lo que hay hoy.
- Llevar al juego los efectos aprobados en este mismo ciclo.

## Non-goals / out of scope
- VFX de ambiente del mapa (lluvia, polvo, luciérnagas, atracciones): ciclo posterior.
- Efectos de personaje o avatar: el juego no tiene cuerpo animado, solo bola.
- Cambiar la física, las reglas del juego o el resultado de un tiro (constitución Q2.4).
- Subir el banco al repositorio: vive aparte, por decisión del equipo.
- Cambiar el estilo del juego a pixel art: el estilo es el 3D actual.
- Una tienda, rareza o desbloqueo nuevos para las skins: solo cambia la apariencia.
- Sonido nuevo: queda fuera salvo el que ya enlaza cada skin.

## Users & context
Los dos desarrolladores del proyecto (Gonzalo y su compañero) como autores de efectos, trabajando en el ordenador, y los
jugadores de navegador y móvil que ven esos efectos en partida, incluidos móviles de gama media y baja de 2024.

## What the user can do
Quien desarrolla, con el banco abierto en su ordenador, puede:
- elegir un efecto o skin de la lista y reproducirlo, en bucle o una vez, a velocidad y calidad elegidas;
- crear un efecto o skin nuevo, duplicar uno existente, editarlo y borrarlo;
- ajustar sus parámetros (colores, tamaño, duración, cantidad, semilla) y ver el cambio al momento;
- ver el coste de cada efecto (partículas vivas, tiempo por fotograma) y compararlo con su presupuesto;
- exportar el efecto aprobado para que el juego lo use.
Los jugadores no usan el banco. Solo ven el resultado en partida.

## What result they get
El banco muestra el efecto en una escena con la misma escala que el campo de juego (bola, pared, hoyo y suelo). Las
referencias aprobadas para decidir si algo es correcto son:
- **Portal:** un portal reproducible en bucle sin salto visible entre el final y el principio, con estado de entrada,
  estado estable y estado de salida.
- **Choque:** un destello en el momento del contacto, una onda que se expande y restos que caen, todo terminado dentro
  de la duración declarada y sin nada visible al acabar.
- **Skin:** cada efecto de la skin (estela, aura, rodadura, golpe, hoyo) distinguible a simple vista del de una skin de
  otra familia y de otro tier.
Al ser autopilot, la referencia visual definitiva (capturas aprobadas por una persona) queda anotada como
`review-after` en la cola de decisiones; mientras tanto, la referencia comprobable es mecánica: la ficha de cada efecto
con su duración, su presupuesto y sus criterios de abajo.

## What it must respect
- Constitución P7.1 y Q2.5: 60 FPS en móvil de gama media y baja de 2024. Cada efecto declara y cumple su presupuesto
  de partículas por calidad, y el juego baja la calidad solo si hace falta.
- Constitución U6.6: ningún efecto parpadea más de 3 veces por segundo.
- Constitución Q2.4: lo visual no altera la física ni el resultado de un tiro.
- Reducción de movimiento: con ella activa, los efectos se muestran quietos o muy atenuados, como ya hacen las skins.
- Las skins existentes y sus miniaturas no cambian de aspecto sin que se pida expresamente.
- El banco no entra en el repositorio ni en su build (decisión del equipo).
- Constitución K3.5: autoría de commits y sin trailers de IA. Ramas según `CLAUDE.md`.
- Constitución S5.2: cualquier dependencia nueva está justificada y sin CVE sin resolver.
- Licencia: lo que se adapte de pixelfx (MIT) lleva su crédito. Lo adaptado de otros proyectos se acredita igual.

## How it proves it
- Por cada criterio de aceptación hay una comprobación ejecutable y su registro queda guardado.
- Un efecto puede arrancarse sin interfaz y medirse: partículas vivas, tiempo por paso y fotograma final vacío.
- Paridad: el mismo efecto con la misma semilla produce la misma secuencia de partículas en el banco y en el juego.
- El presupuesto se mide en el banco y se anota la medida en un dispositivo real o emulado de gama media (Q2.5, P7.5).
- `pnpm test` y `pnpm run build` del juego pasan en verde tras la integración.

## Behaviour
- **Main path:** abro el banco, elijo un efecto, lo ajusto, lo veo repetirse, lo apruebo y lo exporto. El juego lo
  reproduce igual cuando la skin o el evento correspondiente lo dispara.
- **Edge cases:**
  - Efecto en bucle: no debe haber salto entre el último y el primer fotograma.
  - Efecto de una sola vez: no debe quedar nada visible al terminar su duración.
  - Calidad `low`: el efecto sigue siendo reconocible con menos partículas.
  - Misma semilla, misma secuencia; semilla distinta, variación visible.
  - Muchos efectos a la vez (varios choques seguidos): el límite de partículas se respeta sin cortes bruscos.
  - Borrar un efecto que usa una skin: el banco avisa antes de borrar.
- **Error paths:**
  - Un efecto con un parámetro inválido muestra un aviso claro y no rompe el banco.
  - Un efecto que supera su presupuesto se marca en rojo y no se puede exportar hasta corregirlo.
  - Si falta una pieza del juego, el banco lo dice y sigue funcionando con el resto.

## Acceptance criteria
- Given el banco abierto, When elijo cualquiera de los efectos de portal, choque o skin, Then se reproduce sin
  recargar y sin errores en consola.
- Given un efecto en bucle, When completa una vuelta, Then el primer y el último fotograma coinciden (sin salto).
- Given un efecto de una sola vez, When llega a su duración, Then no queda ninguna partícula viva ni nada visible.
- Given un efecto, When lo reproduzco con la misma semilla en el banco y en el juego, Then la secuencia de partículas
  coincide. Los efectos de choque y portal incluidos en esta tanda aceptan una semilla; sin semilla se comportan como
  hoy.
- Given cualquier efecto en calidad `high`, `medium` y `low`, When se mide, Then ninguna calidad supera su presupuesto
  de partículas declarado y el coste por paso queda registrado.
- Given reducción de movimiento activa, When se reproduce cualquier efecto, Then queda quieto o atenuado como una skin
  actual.
- Given cualquier efecto, When se reproduce durante 1 segundo, Then no hay más de 3 destellos de pantalla completa.
- Given un efecto nuevo, When lo creo, Then aparece en la lista y puedo duplicarlo, editarlo y borrarlo; con una
  skin que lo usa, el banco avisa antes de borrarlo.
- Given un efecto que supera su presupuesto, When intento exportarlo, Then se bloquea con el motivo.
- Given la primera tanda, When la reviso, Then hay al menos un portal con entrada, estable y salida, al menos tres
  choques distintos (pared, bumper, hoyo) y al menos un efecto distintivo por cada tier de skin que se toque.
- Given un efecto aprobado, When el juego lo dispara, Then se ve igual que en el banco y `pnpm test` y
  `pnpm run build` pasan.
- Given el repositorio del juego, When reviso su árbol de archivos, Then el banco no está dentro.

## Points to clarify
- **suposición tomada** — la primera tanda es: un portal (entrada, estable y salida), tres choques (pared, bumper,
  hoyo) y tres efectos distintivos de skin, uno por cada tier épico, legendario y mítico. *Base:* cubre el
  mínimo por familia del criterio de aceptación y los tres tiers donde hoy hay menos diferencia visible. *Riesgo:* si
  se quieren más efectos, el ciclo crece. Origen: pregunta abierta de `specify`, resuelta en autopilot.
- **suposición tomada** — un efecto aprobado llega al juego como archivos nuevos dentro de `src/`, revisables en un
  PR, sin traer el banco ni sus herramientas. *Base:* K3.4 (los módulos entran en su carpeta) y la decisión de que el
  banco no entra al repo. *Riesgo:* si el equipo prefiere cargar efectos desde fuera del build, cambia el formato de
  entrega. Origen: pregunta abierta de `specify`, resuelta en autopilot.
- **suposición tomada** — los tres efectos de skin se entregan como ajustes disponibles y no se asignan a una skin
  existente hasta que alguien lo apruebe. *Base:* el criterio de que las skins existentes no cambian sin pedirlo.
  *Riesgo:* el jugador no ve el efecto nuevo hasta esa aprobación.
- **suposición tomada** — la semilla solo es exigible a los efectos de esta tanda. *Base:* `effects.js` usa
  `Math.random()` hoy y `skinFx.js` ya tiene un generador propio con semilla; reescribir todo lo existente queda fuera.
  *Riesgo:* dos reproducciones de un efecto antiguo siguen sin coincidir.
- **suposición tomada** — la persona que integra es el compañero, en la rama `la-chaqueta-bionica`. *Base:* lo
  confirmó en el chat. *Riesgo:* ninguno.
- **suposición tomada** — el banco funciona en el ordenador, no en móvil. *Base:* es una herramienta de autoría.
  *Riesgo:* si se quiere probar en un teléfono, hay que servirlo en la red local.
- **suposición tomada** — "crear, borrar y editar skins" se limita a la apariencia y los efectos de la skin, no a su
  precio, rareza ni desbloqueo. *Base:* la constitución y `skins.js` dicen que solo cambia la apariencia.
  *Riesgo:* si se esperaba editar también el catálogo del juego, el alcance crece.
- **suposición tomada** — el estilo es 3D actual, con libertad creativa de videojuego. *Base:* respuesta del equipo.
  *Riesgo:* ninguno conocido.
- **decisión diferida** — VFX de ambiente del mapa y su integración con los temas del campo.
- **decisión diferida** — probar el banco en red local desde un móvil real.
- **decisión diferida** — choque bola contra bola. *Base:* `physics.js` no tiene colisión entre bolas, solo con paredes, bumpers y obstáculos, y cambiarlo exige `sync:functions` y redespliegue (Q2.2). Se reabre si la física lo incorpora.
- **área no formulable** — cómo se reparte el presupuesto de partículas cuando coinciden varios efectos grandes a la
  vez en una partida de 8 jugadores. Se sospecha una regla de prioridad y todavía no se sabe plantear la pregunta.

## Clarifications
- 2026-11-06 — ¿Cuántos efectos tiene la primera tanda y qué skins se tocan? → 1 portal, 3 choques y 3 efectos de skin
  (épico, legendario, mítico), sin asignarlos a skins existentes todavía. *Por qué:* mínimo por familia, sin tocar el
  aspecto de lo que ya hay.
- 2026-11-06 — ¿Cómo llega un efecto al juego? → como archivos revisables en un PR, sin el banco. *Por qué:* el banco
  no entra al repo.
- 2026-11-06 — ¿Quién integra y en qué rama? → el compañero, en `la-chaqueta-bionica`. *Por qué:* lo dijo en el chat.
- 2026-11-06 — Hallazgo: `effects.js` usa `Math.random()`, así que la paridad por semilla no se cumple para efectos
  antiguos. → la semilla se exige solo a los efectos nuevos y deben aceptar una. *Por qué:* es lo único alcanzable sin
  reescribir el sistema actual.
- 2026-11-06 — Hallazgo del plan: el juego no tiene colisión bola contra bola, así que ese choque no tendría disparador. → se sustituye por el golpe en bumper (sí existe) en la primera tanda y el choque entre bolas pasa a decisión diferida. *Por qué:* un efecto sin disparador no puede cumplir «el juego lo dispara».

Resultado por punto de `specify`: tanda inicial, entrega al juego y rama → resueltas como suposición; banco solo en
ordenador, alcance de edición de skins y estilo 3D → validadas, siguen en pie; ambiente del mapa y móvil real →
diferidas, intactas; reparto de presupuesto entre efectos simultáneos → sigue sin formularse.

## Revisions
- 2026-11-06 — Primera versión, escrita en autopilot tras las respuestas del equipo: importar las clases reales con
  libertad para crear lo necesario, familias de portales, choques y skins, integración al juego incluida.
