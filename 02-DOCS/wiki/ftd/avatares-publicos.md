---
author: compañero (rama la-chaqueta-bionica)
branch: la-chaqueta-bionica
status: done
---
# Avatares y marcos públicos en todas partes

## Intent
La foto de perfil (avatar) y el marco de cada jugador tienen que verse siempre: en matchmaking, grupo,
final de partida (y resultados de cada hoyo), sala de espera de ronda, desempate, amigos y ranking.
Hasta ahora solo se veía la inicial en la mayoría de esas pantallas.

## Scope
- Servidor (migración nueva): `_tournament_json` (avatar y marco por jugador), `my_party` (marco de los
  miembros y lista `invited_players` con avatar y marco), `get_ranking` (avatar solo si es icono).
- Cliente: `toPlayer` (nuevo `src/match/playerRules.js`), `buildRoster`, `seatHtml` y la clave de
  `setSeat` de la sala, `standingsTable`, desempates, grupo (`partyPanel.js`), ranking.
- Fuera de alcance: prompt 5 (skins de rivales). `_tournament_json` queda fácil de ampliar.

## Decisiones
- **Privacidad:** solo `avatar` y `frame`. Funciones `security definer` con `search_path = ''`.
- **Tu jugador:** siempre lo que tienes equipado en el cliente (`avatar.get()` y `progress.prestige.frame`),
  no lo que llega del servidor.
- **Ranking, formato ligero:** el avatar viaja solo si es icono (`icon:<id>`, unos bytes). Las imágenes
  (hasta 600 KB cada una, en hasta 50 filas) no viajan: se pinta la inicial con el marco.
- **Bots:** sin avatar ni marco, inicial con su color.
- **Tamaños:** filas y asientos `xs`/`sm`; el ganador del final de partida con `hd` (marco ilustrado grande).
- **Sin cambios de firma:** las RPC se reemplazan con `create or replace`; `invited` sigue siendo la lista de nombres.

## Checklist
- [x] Migración `20261125120000_avatares_publicos.sql` escrita (3 funciones, mismas firmas).
      Evidencia: `tests/avatares-publicos.test.js` comprueba `security definer` y que no aparecen campos privados.
- [x] Migración aplicada en producción con la CLI (`supabase db push --linked --yes`). Evidencia: `migration list`
      muestra `20261125120000` en local y en remoto.
- [x] `toPlayer` y `buildRoster` conservan avatar y marco; sin avatar, cae al de por defecto.
      Evidencia: `node --test tests/avatares-publicos.test.js` → 7/7 pass.
- [x] Matchmaking, grupo, resultados y desempate usan `avatarHtml`.
      Evidencia: revisión de código; `pnpm run build` en verde.
- [x] Matchmaking: avatar y marco se ven en los asientos. Corregido el controlador de búsqueda, que los perdía
      (commit `76fec94`, prueba en `tests/matchmaking-controller.test.js`). Verificado por el usuario en la app.
- [ ] Grupo, final de partida, desempate y ranking: no verificados en la app. Quedan para una revisión futura.
- [x] `pnpm test`: 1340 pass, 6 fail. Los 6 fallos están en `tests/vfx-packs.test.js` y `tests/vfx-presets.test.js`,
      que no importan ningún módulo tocado aquí. Ya fallaban antes de este cambio.

## Evidence
- `pnpm run build`: compila sin errores (solo el aviso habitual de tamaño de chunks).
- `node --test tests/avatares-publicos.test.js`: 7 pass, 0 fail.

## Pasos para el usuario
1. Aplicar la migración en Supabase (tras revisar el SQL): `pnpm dlx supabase db push --linked --yes`.
2. Comprobar en la app: una partida de matchmaking, un grupo con amigos, el final de partida y el ranking.
3. Medir el tamaño real de `profiles.avatar`. Si las imágenes son grandes, valorar miniatura o RPC aparte con caché
   para `_tournament_json` (se manda en cada consulta de la partida).

## Next
Feature cerrada. Quedan dos cosas abiertas, sin prisa:
- Verificar en la app grupo, final de partida, desempate y ranking.
- Si el tamaño de las imágenes de avatar en `_tournament_json` resulta un problema real, pasar a miniatura o RPC con caché.
