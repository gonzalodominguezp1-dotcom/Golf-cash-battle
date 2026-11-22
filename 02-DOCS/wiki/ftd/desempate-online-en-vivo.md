---
author: Claude (a petición de la persona de la rama la-chaqueta-bionica)
branch: la-chaqueta-bionica
status: review
---

# Desempate en partidas online en vivo

## Intent
En una partida en vivo contra jugadores reales, al terminar el último hoyo:
1. A veces solo entra al desempate uno de los empatados; al otro no le aparece la opción.
2. La tarjeta de desempate no lista bien a quién va al desempate.

## Scope
- `src/match/liveRules.js`: `humanLeaders`, nuevos `roundComplete` y `roundReady`.
- `src/main.js`: `liveAfterRound` (decidir cuando todos hayan cerrado la ronda), `liveTiebreak` (tarjeta y rivales).
- `tests/live.test.js`: casos nuevos de ronda y empate.

Fuera de alcance: el desempate del modo no en vivo (`afterLastHole`, `simulateTiebreak`), el servidor (SQL, edge function).

## Causa
- `liveAfterRound` decidía al terminar el último hoyo, con la vista que tenía el cliente en ese momento. El que acaba primero no ve completa la ronda del rival (el servidor muestra solo los hoyos que tú ya jugaste), no le aparece empate y llama a `finish`, que cierra su ronda. Después el servidor rechaza su tiro de desempate (`match_closed`).
- `humanLeaders` solo contaba a quien ya había terminado en la vista del cliente, así que la tarjeta podía listar empatados que no lo eran.

## Checklist
- [x] `roundComplete` / `roundReady` / `humanLeaders` nuevos en `liveRules.js` — prueba: `tests/live.test.js` (9/9 pasan)
- [x] `liveAfterRound` espera a `roundReady` antes de decidir, con latido (`onStatus`) y sin llamar a `finish` a quien aún puede empatar — prueba: test de `roundReady` (tests/live.test.js) y revisión del flujo; partida real pendiente
- [x] La tarjeta lista solo a los empatados con la ronda completa; avatar con «Tú» — prueba: test de `humanLeaders` con tres jugadores (tests/live.test.js)
- [x] Los rivales del desempate salen de los empatados, aunque falte la entrada en `live.roster` — prueba: revisión de código (no cubierto por tests)
- [ ] `pnpm test` pasa — prueba: salida de `pnpm test` (NO pasa: 4 fallos ajenos en vfx-runtime, ver Evidence)

## Evidence
- `node --test tests/live.test.js`: 9/9 pasan (incluidos 3 casos nuevos de ronda y empate).
- `node --input-type=module --check < src/main.js`: sintaxis OK.
- `pnpm test` completo: falla 4 casos de `tests/vfx-runtime.test.js` (dir/rad de partículas). Ese archivo y sus módulos (`src/game/render/vfx/`, `skinFx.js`) tienen WIP sin commitear de la rama que no toca este cambio; no hay relación con `main.js` ni `liveRules.js`.
- Pendiente: probar una partida online real con dos cuentas (no hecho aquí).

## Next
Revisar la prueba en navegador con dos cuentas reales y decidir qué hacer con los 4 fallos de vfx (WIP de la rama).
