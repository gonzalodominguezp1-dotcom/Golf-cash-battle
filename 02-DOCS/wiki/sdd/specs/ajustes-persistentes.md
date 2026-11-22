---
type: spec
title: Spec — Ajustes persistentes y pantalla de Ajustes
description: WHAT y WHY de guardar los ajustes del jugador (sonido, calidad, controles, avatar) entre visitas y dispositivos, y de la pantalla de Ajustes con controles editables.
tags: [sdd, spec, ajustes]
timestamp: 2026-11-06T12:00:00Z
topic: sdd
slug: ajustes-persistentes
status: draft
branch: main
---

# Spec — Ajustes persistentes y pantalla de Ajustes

> Slug: `ajustes-persistentes` · Status: draft · Created: 2026-11-06
> Inherits: [constitution](../constitution.md) · Promovida desde [ftd/ajustes-persistentes](../../ftd/ajustes-persistentes.md) porque el cambio de la cuenta (dónde se guardan los ajustes) es de riesgo 2.

## Problem & why
El jugador configura el juego (silencio, calidad gráfica, foto de perfil) y al volver otro día, o al pasar del
móvil al ordenador, lo vuelve a encontrar como estaba antes. Cada ajuste se recuerda suelto y solo en ese
dispositivo, y la foto de perfil se pierde si se cambió sin conexión. Además, los ajustes solo se pueden tocar
dentro de una partida, y los controles no se pueden cambiar: quien está acostumbrado a la cámara invertida, o
necesita apuntar más fino, no tiene ninguna opción.

## Cost of not building it
Cada visita empieza con la configuración rehecha a mano. En el móvil, quien bajó la calidad para que no se
caliente lo encuentra otra vez en la calidad por defecto en el ordenador, y al revés. Un jugador zurdo o con
otra costumbre de cámara juega peor que el resto en partidas con dinero de por medio, y no tiene arreglo. No
rompe nada hoy, pero es fricción en cada sesión y un motivo de abandono en los primeros días.

## The cheapest alternative
Recordar todo solo en el dispositivo, sin la cuenta. Resuelve «al volver mañana en el mismo móvil», pero no el
cambio de móvil a ordenador ni el móvil nuevo, que es lo que pidió el jugador («en móvil y Desktop»). Tampoco
da controles editables. Se descarta como solución completa, pero es el comportamiento de respaldo: sin cuenta
o sin conexión, los ajustes siguen guardados en el dispositivo.

## Goals
- Lo que el jugador elige en Ajustes sigue igual al volver, en el mismo dispositivo y en cualquier otro donde entre con su cuenta.
- La calidad gráfica se recuerda por separado para el móvil y para el ordenador.
- La foto de perfil no se pierde aunque se cambie sin conexión.
- Hay una pantalla de Ajustes en el menú principal: menú lateral en el ordenador y barra de secciones abajo en el móvil.
- Los controles se pueden editar: invertir la cámara (horizontal y vertical), invertir el ángulo de tiro, cargar empujando en vez de tirando, sensibilidad de la cámara y del apuntado, la rueda del ratón (fuerza o zoom) y la vibración.

## Non-goals / out of scope
- Reasignar teclas.
- Ajustes distintos por hoyo o por modo de juego.
- Música de fondo nueva o mezcla por tipo de efecto, más allá del volumen general y del ambiente.
- Aplicar el cambio de la cuenta en el servidor de producción: lo aplica el equipo tras aprobarlo.
- Cambiar la física, el antibots o cómo se valida un tiro en el servidor.

## Users & context
Jugadores de Golf Cash Battle en el móvil (táctil) y en el ordenador (ratón), con cuenta o como invitados.
Muchos empiezan en el móvil y luego juegan también en el ordenador. Entran en Ajustes desde el menú principal o
desde la pausa de una partida.

## What the user can do
- Abrir Ajustes desde el menú principal (botón de engranaje, la entrada «Ajustes» del menú del ordenador o la tecla 6) y desde la pausa de una partida.
- Cambiar de sección entre Controles, Calidad y Sonido.
- Activar o desactivar cada opción, mover los deslizadores y volver a los valores por defecto de una sección.
- Lo puede hacer cualquier jugador, con cuenta o sin ella. Solo quien tiene cuenta (no invitado) lleva sus ajustes a otros dispositivos.

## What result they get
- Cada cambio vale al momento, también en mitad de una partida, y se ve un «✓ Guardado».
- Al recargar o volver otro día, los ajustes están como los dejó.
- Con cuenta, al entrar en otro dispositivo encuentra los mismos controles y el mismo sonido. La calidad es la que eligió para ese tipo de dispositivo, o la automática si no eligió ninguna.
- Referencia visual: las capturas de la pantalla de Ajustes (ordenador y móvil) y de la pausa adjuntas a esta entrega. Están pendientes de tu aprobación (ver Points to clarify).

## What it must respect
- La física y la simulación no cambian: los controles solo cambian cómo un gesto se convierte en dirección y fuerza; el tiro que se manda sigue siendo el mismo dato cuantizado.
- Sin ajustes elegidos, el juego se comporta como hoy: mismo volumen, misma calidad automática y los mismos controles.
- Lo que ya estaba guardado (el silencio y la calidad de antes) se conserva al actualizar.
- El avatar sigue mandando desde la cuenta cuando no hay un cambio local pendiente (decisión de `cuenta-wallet-avatar` y `avatar-servidor-amigos`).
- Los ajustes son preferencias sin valor de juego: no dan ventaja ni pasan por la economía. Lo que se guarda en la cuenta se acota en tamaño y forma.
- Accesibilidad: los interruptores se pueden usar con el teclado y los lectores de pantalla los leen como interruptores.

## How it proves it
- Tests de unidad del almacén de ajustes: valores por defecto, saneado de lo raro, migración de lo guardado antes, el cambio más reciente gana, fallo de red, cambio de cuenta en el mismo dispositivo, calidad por dispositivo y los multiplicadores de los controles.
- Test del avatar pendiente que se reintenta al entrar.
- Prueba en el navegador (Playwright) en el ordenador y en un iPhone simulado: cambiar ajustes, recargar y comprobar que siguen; abrir la pausa en una partida y cambiar calidad y sonido. Quedan las capturas y la salida del script.
- `pnpm test` y `pnpm run build` en verde.

## Behaviour
- Main path: el jugador cambia un ajuste → se aplica al momento → queda recordado en el dispositivo → con cuenta, se lleva a la cuenta poco después del último cambio.
- Al entrar con la cuenta: si la cuenta tiene ajustes más recientes, se usan esos; si los del dispositivo son más recientes (o la cuenta no tiene), se llevan a la cuenta.
- Edge cases: valores fuera de rango o desconocidos vuelven al valor por defecto; dos cuentas en el mismo dispositivo: al entrar con otra cuenta mandan los ajustes de esa cuenta; muchos cambios seguidos de un deslizador se llevan a la cuenta una sola vez.
- Error paths: sin conexión o con la cuenta caída, el ajuste se queda en el dispositivo y se vuelve a intentar al entrar la próxima vez; el jugador no ve ningún error y el juego sigue funcionando.

## Acceptance criteria
- Given un jugador en el ordenador, When cambia invertir cámara, sensibilidad del apuntado, rueda a zoom, calidad Baja y volumen 35 % y recarga, Then los cinco ajustes siguen igual.
- Given un jugador en el móvil, When elige calidad Alta, Then la calidad del ordenador sigue en automática.
- Given ajustes guardados con la versión anterior (silencio activado, calidad Baja), When se abre el juego actualizado, Then sigue silenciado y en Baja.
- Given un cambio de ajustes que no llegó a la cuenta por falta de red, When el jugador vuelve a entrar y la cuenta tiene ajustes más viejos, Then se conservan los del dispositivo y se llevan a la cuenta.
- Given un avatar cambiado sin red, When el jugador vuelve a entrar, Then sigue viendo su avatar nuevo y se reintenta llevarlo a la cuenta.
- Given «invertir ángulo de tiro» activado, When el jugador mueve el dedo o el ratón a la derecha al apuntar, Then la dirección gira hacia el lado contrario que sin la opción.
- Given la pantalla de Ajustes en un móvil, Then las secciones están en una barra fija abajo, sin scroll horizontal; en el ordenador, en un menú lateral.
- Given la pausa de una partida, When cambia la calidad o el sonido, Then se aplica sin salir de la partida y se recuerda.

## Points to clarify
- **suposición tomada** — La calidad se guarda por tipo de dispositivo (móvil u ordenador), no por aparato. *Base:* un PC no debería imponer «Alto» a un móvil; dos móviles suelen soportar algo parecido. *Riesgo:* un móvil viejo y uno nuevo de la misma cuenta comparten calidad; el viejo puede ir lento hasta que el jugador la baje.
- **suposición tomada** — Gana el cambio más reciente según la hora de cada dispositivo. *Base:* es lo más simple y lo que espera un jugador. *Riesgo:* con un reloj muy desajustado, un cambio viejo puede pisar uno nuevo; el jugador lo corrige al volver a cambiarlo.
- **suposición tomada** — El orden de las secciones es Controles, Calidad, Sonido (el jugador dejó elegirlo). *Base:* Controles es lo que más se toca al empezar. *Riesgo:* ninguno funcional.
- **pregunta abierta** — ¿Apruebas las capturas de la pantalla de Ajustes y de la pausa como referencia visual? Hasta entonces, «What result they get» no tiene referencia aprobada.
- **decisión diferida** — Reasignar teclas y ajustes por modo de juego, para otra entrega si se piden.
