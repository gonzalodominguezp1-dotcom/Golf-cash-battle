---
type: spec
title: Spec — Amigos y Mesas: invitaciones de grupo y solo amigos conectados
description: WHAT y WHY de mostrar las invitaciones de grupo en Amigos con Aceptar/Rechazar, y de limitar invitar y formar grupo en Mesas a los amigos conectados ahora mismo.
tags: [sdd, spec, amigos, mesas, grupo, presencia]
timestamp: 2026-11-16T20:00:00Z
topic: sdd
slug: amigos-mesas-grupo-conectados
status: pendiente de revisión humana
branch: amigos-ui-main
---

# Spec — Amigos y Mesas: invitaciones de grupo y solo amigos conectados

> Slug: `amigos-mesas-grupo-conectados` · Status: pendiente de revisión humana · Created: 2026-11-16
> Inherits: [constitution](../constitution.md) · Rama: `amigos-ui-main` (trabajo subido a `main`).
> **Nota de proceso:** esta spec se escribe *después* de implementar el cambio, porque el gate de tier 2 bloqueó el push de la migración. Las decisiones de abajo son las tomadas en la sesión; el humano debe revisarlas antes de darlas por aprobadas.

## Problem & why

Dos pantallas hacen mal la vida social del grupo:

1. En **Amigos** no se ven las invitaciones de grupo que llegan. Solo aparecen en **Mesas**, así que un jugador que entra por Amigos no sabe que le han invitado.
2. En **Mesas** se puede invitar y formar grupo con cualquier amigo, esté o no conectado. La invitación queda pendiente sobre alguien que no está jugando, y el grupo espera a un jugador ausente.

El jugador necesita ver las invitaciones donde gestiona a sus amigos, y que Mesas le ofrezca solo gente a la que puede llevar a jugar ya.

## Cost of not building it

- Las invitaciones de grupo se pierden si el jugador no pasa por Mesas: el grupo no se forma y el invitado no entra al torneo.
- Cada invitación a alguien desconectado deja un grupo esperando sin fecha. Se nota como pérdida de tiempo de los que sí están jugando.
- El botón de invitar desde Amigos ya existe; sin esta spec, Amigos enseña acciones que el resto de la pantalla no explica.

## The cheapest alternative

Dejar las invitaciones solo en Mesas y avisar con un texto «Invita solo a quien esté conectado». Resuelve la pérdida de invitaciones solo a medias: el jugador sigue sin verlas en Amigos, y el texto no evita invitar a alguien ausente. **No basta** porque el problema es que la app ofrece acciones sobre gente que no puede responderlas.

**No construirlo** también es una dirección: Amigos y Mesas siguen como estaban. El coste es el de la sección anterior.

## Goals

1. Quien tiene una invitación de grupo pendiente la ve en la pantalla de Amigos, sin tener que ir a Mesas.
2. Aceptar y Rechazar están claramente diferenciados: Aceptar con borde verde, Rechazar con borde rojo.
3. En Mesas, solo se puede invitar y formar grupo con amigos que estén conectados en ese momento.

## Non-goals / out of scope

- Mostrar el estado conectado/desconectado de los amigos en la pantalla de Amigos (solo se usa en Mesas).
- Notificaciones push de invitaciones a grupo; el aviso emergente existente no cambia.
- Cambiar Aceptar/Rechazar de las **peticiones de amistad** (siguen con su estilo actual).
- Presencia en tiempo real (websockets). Se usa un latido cada 30 s, con un margen de 90 s.
- Presencia de quien no tiene sesión iniciada o tiene cuenta anónima.
- Cualquier otra acción sobre amigos que no esté en este cambio.

## Users & context

- **Jugador con cuenta y nombre de usuario**: tiene amigos, recibe invitaciones y quiere formar grupo para un torneo.
- **Jugador sin amigos conectados**: ve un mensaje claro en Mesas, sin botones de invitar.

## What the user can do

- En **Amigos**: ver las invitaciones de grupo pendientes y responderlas con Aceptar o Rechazar. Invitar a un amigo al grupo (ya existente).
- En **Mesas**: invitar a un amigo conectado y formar grupo con él.
- Solo puede hacerlo quien tiene sesión iniciada con nombre de usuario. Los demás ven el mensaje de bloqueo de siempre.

## What result they get

- En Amigos, una invitación pendiente aparece con su nombre, «te invita a su grupo» y los botones Aceptar (borde verde) y Rechazar (borde rojo).
- Al aceptar, la invitación desaparece de la lista y el grupo se actualiza. Al rechazar, desaparece sin más.
- En Mesas, la lista de invitables contiene solo amigos conectados. Si ninguno lo está, aparece el mensaje «Ninguno de tus amigos está conectado ahora».

> **Referencia pendiente de aprobación humana:** la captura de Amigos y Mesas con los botones nuevos. Queda en la cola de decisiones como `review-after`.

## What it must respect

- Amigos sigue sin tabla «Juega con amigos»: el grupo se gestiona desde Mesas, y Amigos solo enseña las invitaciones y las acciones de amigo.
- Las peticiones de amistad y sus acciones (aceptar, rechazar, cancelar, quitar) siguen funcionando como antes.
- El sondeo del grupo se para al salir de Amigos y al salir de Mesas. No quedan listeners ni timers vivos.
- Un fallo de red al enviar el latido no muestra nada al jugador.
- Las migraciones de producción son aditivas: añaden columna y función, no quitan nada. La versión anterior de la app sigue funcionando con la base de datos nueva.
- Sin esta migración, `my_friends` no devuelve `online` y Mesas no ofrece a nadie. Ese es el comportamiento seguro, no un error.

## How it proves it

- Tests automáticos (`pnpm test`): invitaciones en Amigos con Aceptar/Rechazar y su respuesta, invitar solo a conectados en Mesas, mensaje cuando nadie está conectado, y limpieza de scopes al salir.
- Build de producción (`pnpm build`) sin errores.
- Migración aplicada con `supabase db push --linked` tras `--dry-run`; `supabase migration list --linked` muestra `20261116120000` en local y remoto.
- Comprobación manual en producción, a cargo del humano (ver criterios).

## Behaviour

- **Main, Amigos:** al abrir la pantalla, se sondean las invitaciones de grupo. Cada invitación se pinta con su remitente, Aceptar y Rechazar.
- **Main, Aceptar / Rechazar:** la respuesta se envía al servidor; la lista se actualiza con lo que devuelve.
- **Main, Mesas:** la lista de amigos se lee al montar y se relee cada 30 s. Solo los amigos marcados como conectados aparecen como invitables.
- **Main, latido:** con sesión iniciada, se envía un latido al abrir la app y cada 30 s. El servidor marca al jugador como conectado durante 90 s.
- **Edge:** si ninguno de los amigos está conectado, Mesas dice que nadie está conectado y no muestra botones de invitar.
- **Edge:** si un amigo se desconecta mientras Mesas está abierta, desaparece de la lista en la siguiente lectura (máximo 30 s).
- **Error:** un fallo al leer la lista de amigos en Mesas deja la lista anterior; no vacía la pantalla.
- **Error:** un fallo del latido se ignora; el siguiente latido lo reintenta.

## Acceptance criteria

- Given un jugador con una invitación de grupo pendiente, When abre Amigos, Then ve la invitación con los botones Aceptar (borde verde) y Rechazar (borde rojo).
- Given un jugador que pulsa Aceptar en una invitación, When el servidor responde, Then la invitación desaparece de la lista y el grupo se actualiza.
- Given un amigo conectado y otro desconectado, When el jugador abre Mesas, Then solo el conectado tiene botón de invitar.
- Given que ningún amigo está conectado, When el jugador abre Mesas, Then ve «Ninguno de tus amigos está conectado ahora» y ningún botón de invitar.
- Given la pantalla de Amigos, When el jugador la abre y la cierra, Then no quedan timers ni suscripciones vivas del sondeo de grupo.
- Given la migración aplicada en producción, When se consulta `my_friends`, Then cada amigo trae el campo `online`.

## Points to clarify

- **suposición tomada** — el latido cada 30 s y la ventana de 90 s son un equilibrio entre precisión y carga. *Base:* la ventana de `live_idle_seconds` ya usada por las partidas en vivo (45 s), más margen para la pantalla en segundo plano. *Riesgo:* si se quiere precisión menor de 60 s, habrá que cambiar el intervalo.
- **suposición tomada** — la lista de Mesas se relee cada 30 s y no en tiempo real. *Riesgo:* un amigo que entra o sale puede tardar hasta 30 s en aparecer o desaparecer.
- **pregunta abierta** — ¿los amigos conectados que ya están en un torneo deben poder invitarse igualmente? Hoy se oculta solo a quien no tiene latido.
- **decisión diferida** — estado conectado en la pantalla de Amigos; fuera de este ciclo.
- **área no formulable** — cómo se comporta la presencia con varias pestañas abiertas del mismo jugador.

## Revisions

- 2026-11-16 — Escrita después de implementar. Commit `7fa2247` (cliente) y migración `20261116120000` aplicada en producción.
