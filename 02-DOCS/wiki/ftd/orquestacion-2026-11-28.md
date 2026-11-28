---
title: Orquestación de tareas pendientes, Ola 1
status: in-progress
date: 2026-11-28
---

# Orquestación 2026-11-28: Ola 1 (tareas 2 y 6)

Fuente de las tareas: `02-DOCS/raw/prompts-2026-11-24/`. Cada tarea va en su worktree, con rama propia que sale de `la-chaqueta-bionica`. No hay nada fusionado ni subido.

## Tabla de tareas

| # | Tarea | Estado | Worktree | Rama | Tests | Build |
|---|---|---|---|---|---|---|
| 1 | Verificación de email | Hecha (FTD `done`; faltan las pruebas manuales) | — | — | verde (en la base) | rojo (causa previa) |
| 2 | Tutorial de bienvenida | Cerrada en su worktree, a falta de fusionar | `.worktrees/tarea-02-tutorial` | `la-chaqueta-bionica-tarea-02-tutorial` | verde, 1401/1401 | rojo (causa previa) |
| 3 | Marcador de golpes | FTD aún `in-progress`: falta la prueba en partida real. No se reimplementa | — | — | verde (en la base) | rojo (causa previa) |
| 4 | Avatares y marcos | Hecha (FTD `done`; faltan las pruebas manuales) | — | — | verde (en la base) | rojo (causa previa) |
| 5 | Skins de rivales | Pendiente (Ola 2) | — | — | — | — |
| 6 | Móvil: controles bloqueados | Cerrada en su worktree, a falta de fusionar. Estaba pendiente, no parcial | `.worktrees/tarea-06-movil` | `la-chaqueta-bionica-tarea-06-movil` | verde, 1371/1371 | rojo (causa previa) |
| 7 | Zoom con pellizco / rueda | Pendiente (Ola 2, después de la 6) | — | — | — | — |
| 8 | Spec de muros y farolas | Bloqueada por los cambios sin commitear | — | — | — | — |
| 9 | Ajustes y Resultado | Sin prompt: falta `09-pantallas-partida-ajustes-resultado.md` | — | — | — | — |

Los tests y el build de las tareas 2 y 6 los ha ejecutado el orquestador en cada worktree. No se ha copiado la salida de los subagentes.

**Build en rojo por una causa previa.** El commit `c125499` (fix de matchmaking) borró `src/game/render/hubScene.js`, `hubFlag.js`, `hubAmbient.js` y sus tests. Sin embargo, el `src/main.js` commiteado sigue importando `hubScene.js`. El `main.js` sin commitear de `.worktrees/la-chaqueta-bionica` ya no tiene ese import. Por eso el error es `Could not resolve "./game/render/hubScene.js" from "src/main.js"`. Ninguna de las dos tareas añade errores de build: los trabajadores lo comprobaron con un build que sustituye ese módulo por uno vacío.

Las dos ramas se fusionan sin conflictos entre sí (`git merge-tree`).

## Tarea 6: resumen

- **Pointer Lock:** solo se activa con `pointerType === 'mouse'` y un puntero fino.
- **Reseteo completo de la entrada:** limpia drag, carga, órbita y capturas. Se hace en `blur`, `visibilitychange` (pestaña oculta), `pagehide`, `lostpointercapture` y pausa.
- **Reseteo táctil:** al salir del pointer lock solo se limpia el estado táctil, así que Desktop se comporta igual que antes.
- **Drag colgado:** ya no bloquea los toques siguientes. Además, el `pointerup` en pausa y en la vista completa del mapa ahora suelta el drag; era otra forma de que se quedara colgado.
- **Ficheros:** `src/game/GolfGame.js`, `src/game/pointerRules.js` (nuevo) y `tests/pointer-rules.test.js` (nuevo, 14 tests). FTD: `movil-controles-bloqueados.md`.
- **Revisión:** 2 rondas. La última terminó con 0 bloqueantes y 0 importantes.

## Tarea 2: resumen

- **Cuándo sale el popup:** una sola vez, tras verificar el email y con el hub ya montado. No sale encima de una partida, de una búsqueda, del splash ni de otro diálogo.
- **Tutorial:** 7 pasos, y el de controles depende del dispositivo. Hay una entrada «Ver tutorial» en Ajustes.
- **Persistencia:** migración nueva, **sin aplicar**: `supabase/migrations/20261128120000_welcome_tutorial.sql`. Añade la columna `profiles.tutorial_seen_at` y la RPC `claim_welcome_tutorial()`, que es `security definer` con `search_path = ''`, solo la puede ejecutar `authenticated` y devuelve un booleano.
- **Marca de recién verificada:** va atada al uid. Para eso, `AuthService.exchangeCode` devuelve también `uid`; es el único cambio en el login.
- **Revisión:** 3 rondas de corrección y 1 de seguridad. La última terminó con 0 bloqueantes; su único importante (faltaba un test del uid) está arreglado y probado con un mutante.

## Hallazgos de revisión abiertos

- **T6:** si Chrome mantiene `hasPointerCapture(idViejo)` en true tras el aviso sin quitar el foco, el siguiente toque seguiría ignorándose. Solo se puede comprobar en un móvil real (caso 5 de la checklist). El plan B está en la FTD.
- **T6:** cuando el primer dedo se levanta, un segundo dedo que siga apoyado se descarta. Es una nota para la tarea 7, que trae el pellizco.
- **T6:** en Desktop, al cambiar de ventana se corta también la órbita con clic derecho. Es intencional.
- **T2:** en el repo no hay ningún trigger que cree la fila de `profiles` al registrarse, porque el esquema base no está versionado. Si la fila no existiera, la RPC devolvería false y el popup no saldría.
- **T2 (seguridad, menor):** si `profiles` tiene una política de lectura abierta en producción, `tutorial_seen_at` sería visible para otros usuarios. Se comprueba con las consultas 2 y 3 de `supabase/audit/auth_security_audit.sql`.
- **T2:** si se cierra la pestaña con la bienvenida pendiente, ya no se vuelve a mostrar, aunque se puede abrir desde «Ver tutorial».

## Checklist manual

**Tarea 6.** Checklist completa en `02-DOCS/wiki/ftd/movil-controles-bloqueados.md`:
- Android Chrome:
  - notificación o permiso del sistema a mitad de partida;
  - aviso de Chrome sin cambiar de app: comprobar que el siguiente toque responde;
  - cambiar de app y volver;
  - girar la pantalla.
- Portátil táctil con ratón.
- iOS Safari: sin errores.
- Desktop: un clic oculta el ratón, `Esc` abre Ajustes, la carga funciona con clic izquierdo y rueda, y alt-tab durante el clic derecho.

**Tarea 2.** Checklist completa en `02-DOCS/wiki/ftd/tutorial-bienvenida.md`:
- Tamaños: Desktop 1280×800, móvil 390×844 y 360 px en vertical y en horizontal.
- Accesibilidad: reduced-motion; teclado, Esc y foco. Con el tutorial abierto, las teclas no deben llegar al hub.
- Sonido y vibración en el primer toque, y con el sonido silenciado.
- Cuentas: una cuenta nueva tras verificar y una cuenta antigua (a esta no le sale).
- Segundo dispositivo: no le sale tras aplicar la migración.
- Cierres: cerrar a medias, «Ver tutorial» y búsqueda activa.
- Cambio de cuenta: cerrar sesión y entrar con otra cuenta en la misma pestaña.
- Salir del hub justo cuando se abre.

## Decisiones pendientes

1. **Build roto por `hubScene.js`.** Recomendación: commitear en `la-chaqueta-bionica` el cambio de `main.js` que quita el import. Alternativa: restaurar los ficheros borrados en un commit aparte.
2. **Fusionar las tareas 6 y 2 en `la-chaqueta-bionica`.** Recomendación: fusionar primero la 6 y después la 2. Después de cada fusión se vuelven a ejecutar test y build. Se haría en un worktree temporal, para no tocar `.worktrees/la-chaqueta-bionica` y sus cambios sin commitear.
3. **Aplicar la migración del tutorial.** Recomendación: primero ejecutar `auth_security_audit.sql` (consultas 2 y 3) y confirmar que existe la fila de `profiles`. Después, `pnpm dlx supabase db push --linked --yes`.
4. **Tarea 9.** Falta el prompt. Recomendación: pasarlo antes de la Ola 3.
5. **Tarea 8 y los cambios sin commitear.** Recomendación: commitearlos en su rama antes de la Ola 2. Tocan `GolfGame.js` y `main.js`, igual que las tareas 5 y 7.
6. **Sincronización de la wiki.** `rsc/knowledge` no ha podido subir `tutorial-bienvenida.md`, `decisions.md`, `index.md` y `reglas-y-economia.md` porque chocan con cambios que ya están en esa rama. Recomendación: juntarlos a mano al fusionar.

## Siguiente: Ola 2

Empieza la tarea 7, con la 6 ya fusionada, y a la vez la tarea 5. Las dos tocan `GolfGame.js`, pero en bloques distintos.
