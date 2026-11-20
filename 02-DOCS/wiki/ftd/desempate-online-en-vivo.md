---
author: Claude (a petición de la persona de la rama la-chaqueta-bionica)
branch: la-chaqueta-bionica
status: in-progress
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
- [x] `roundComplete` / `roundReady` / `humanLeaders` nuevos en `liveRules.js` — prueba: `tests/live.test.js` (pendiente de ejecutar)
- [ ] `liveAfterRound` espera a `roundReady` antes de decidir, con latido (`onStatus`) y sin llamar a `finish` a quien aún puede empatar — prueba: test de la lógica de decisión y revisión manual del flujo
- [ ] La tarjeta lista solo a los empatados con la ronda completa; avatar con «Tú» — prueba: test de `humanLeaders` con tres jugadores
- [ ] Los rivales del desempate salen de los empatados, aunque falte la entrada en `live.roster` — prueba: revisión de código
- [ ] `pnpm test` pasa — prueba: salida de `pnpm test`

## Evidence
(pendiente)

## Next
Implementar `liveAfterRound` y la tarjeta en `src/main.js`, luego ejecutar `pnpm test`.
