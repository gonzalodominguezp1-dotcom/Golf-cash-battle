# Prompt 4 — Avatares y marcos públicos en todas partes

Soy Gonzalo. Trabaja en mi rama según `CLAUDE.md` (`la-yuinta-mangante`: fetch, checkout y pull antes de tocar nada). pnpm siempre.

## Qué quiero
La **foto de perfil (avatar)** y el **marco** de cada usuario pasan a ser **públicos**: se tiene que ver la tuya y la de los demás **siempre**, en todas las pantallas donde sale un jugador: matchmaking, grupo, final de partida (y resultados de cada hoyo), sala/espera de ronda, desempate, amigos y ranking.

## Estado actual (compruébalo)
- Helper que pinta avatar + marco: `avatarHtml({ size, frame, av, initial, hd })` en `src/screens/shared.js`. Datos: `fromWire()` de `src/progress/avatar.js` y `frameById()` de `src/progress/prestige.js`.
- Ya se usa bien en: `src/screens/friends.js`, la lista de amigos de `src/screens/partyPanel.js` (línea ~67), el hub y Cuenta (solo el tuyo).
- **Solo inicial, sin avatar ni marco:**
  - `src/ui/matchmakingView.js` línea ~39-41 (asientos del matchmaking).
  - `src/screens/partyPanel.js` líneas ~87 y ~90 (miembros del grupo e invitados).
  - Pantallas de resultados de `src/main.js`: `showHoleResult`, `showResults`, `showEndOverlay`, `showLiveRoom`, `showRoundWait`, `showLiveResults`, `showTiebreakResult`. Revisa cada una.
  - Ranking (`src/screens/ranking.js`): la FTD `02-DOCS/wiki/ftd/avatar-servidor-amigos.md` dejó fuera los avatares del ranking por peso (hasta 50 imágenes). Decide un formato ligero.
- Servidor: `profiles.avatar` (jsonb, `20261103130000_avatar_friends.sql`) y `profiles.frame` (`20261118130000_frames_catalog.sql`, `_frame_for(frame, level)` decide el marco que se luce). Los jugadores de una partida llegan en `_tournament_json` (`supabase/migrations/20261103180000_live_matches.sql`) con solo `id, seat, name, color, ...`: **sin avatar ni marco**. El grupo (`20261103150000_matchmaking_parties.sql`, línea ~342) sí manda `avatar` en algún sitio: revisa qué falta.
- Cliente: `toPlayer()` en `src/match/TournamentService.js` y `SupabaseMatchService.js`; `buildRoster()` en `src/match/liveRules.js`.

## Qué hay que hacer
1. **Servidor (migración nueva en `supabase/migrations/`):**
   - Añadir `avatar` y `frame` (el que se luce, con `_frame_for`) a cada jugador en `_tournament_json`, a los miembros e invitados del grupo, y al ranking si decides incluirlo.
   - **Privacidad:** solo esos dos campos públicos; nunca email, saldo, KYC ni nada más. Mantén `security definer` + `search_path = ''` como el resto. Ojo con el tamaño: si el avatar es una imagen grande en base64, valora mandar una miniatura o un hash + RPC aparte con caché (mide el tamaño real de `profiles.avatar` con `toWire` de `avatar.js`).
   - Bots: no tienen avatar; que el cliente ponga uno por defecto bonito (inicial + color del jugador) y sin marco, o un marco «bot» neutro.
   - Las RPC se reemplazan con `create or replace`; no rompas firmas que use el cliente. Revisa `02-DOCS/wiki/backend/supabase.md` para cómo se aplican migraciones y `pnpm sync:functions` si toca Edge Functions.
2. **Cliente:** pasar `avatar`/`frame` por `toPlayer()` y `buildRoster()` y usar `avatarHtml` en todas las pantallas de la lista de arriba. Tamaños coherentes (`xs`/`sm`/`lg`), y en el podio/final de partida tamaño grande con el marco ilustrado (`hd`).
3. **Tu propio jugador** (`id: 'me'`) usa siempre lo que tienes equipado ahora (`avatar.get()` y `progress.prestige.frame`), aunque el servidor vaya un paso por detrás.
4. Rendimiento: las imágenes de marco ya se sirven de `public/`; no metas cientos de `<img>` hd en listas largas (usa `hd` solo en tamaños grandes). En matchmaking hay animaciones (`fx()`): no las rompas.

## Coordinación
El **prompt 5** (skins de rivales coherentes) también añade un campo a los jugadores de `_tournament_json`. Si ya existe ese cambio en la rama, júntalo en la misma función; si no, deja el JSON fácil de ampliar y avísame.

## Pruebas y cierre
- Tests `node --test`: que `toPlayer`/`buildRoster` conservan avatar y marco, y que un jugador sin avatar cae al de por defecto. Si puedes, test de texto sobre la migración (que no expone columnas privadas).
- `pnpm test` y `pnpm run build` en verde. La migración no se puede probar contra Postgres desde aquí: dilo claro y déjame los pasos para aplicarla.
- Capturas Playwright (con datos falsos/mocks) de matchmaking, grupo y final de partida en Desktop y móvil.
- FTD nueva en `02-DOCS/wiki/ftd/avatares-publicos.md`.
- Commits en mi rama. Sin PR salvo que lo pida.
