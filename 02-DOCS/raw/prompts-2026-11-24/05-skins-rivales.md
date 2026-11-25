# Prompt 5 — Skins de bola de los rivales coherentes en partida

Trabaja **siempre en la rama `la-chaqueta-bionica` y en su worktree de siempre** (`C:\Users\DEV\Desktop\golfito\.worktrees\la-chaqueta-bionica`; la rama ya está sacada ahí, no la saques en la carpeta de `main` ni crees otro worktree ni otra rama). Si la sesión corre en otro sitio (nube), trabaja en `la-chaqueta-bionica` igualmente. Antes de tocar nada: `git fetch origin la-chaqueta-bionica && git pull origin la-chaqueta-bionica`. Commits y push solo a `la-chaqueta-bionica`; nunca a `main` ni a `la-yuinta-mangante` salvo que se pida. pnpm siempre.

## El problema
Dentro de la partida, las bolas de los **oponentes salen con una skin aleatoria**. Quiero que cada jugador vea a los demás con **la skin que cada uno tiene seleccionada**, igual en todos los mapas online (los 3 actuales y los que vengan). Si el usuario X tiene la skin «Dragón carmesí» equipada, todos sus rivales le ven con esa skin.

## Dónde está el azar (compruébalo)
- `src/game/GolfGame.js`:
  - `pickRandomSkins(n)` (línea ~48): «una skin al azar por rival».
  - `#prepareGhosts(n)` (~419) y la preparación del hoyo siguiente (~631) eligen `ghostSkins` al azar **antes** de saber quién es quién.
  - `#buildBots()` (~1180): asigna `botSkins[i]` por orden a `this.botPlayers` (bots y `RemoteBall` de humanos). Usa `#ghostHandle(skin)` → `createSkinMaterial(skin, { quality: 'low', instance: {}, theme })` con opacidad 0.75.
- La skin equipada de cada usuario vive en su progreso: `Progress.state.equipped` (`src/progress/Progress.js`, `equippedSkin`), guardado en el servidor vía `save_progress` (`profiles.progress`). Cada skin tiene además una **instancia** (semilla/acabado: `progress.instance(id)`, `src/progress/inventory.js`) que cambia su aspecto: tiene que verse igual que la ve su dueño.
- Los jugadores de la partida llegan en `_tournament_json` (`supabase/migrations/20261103180000_live_matches.sql`) sin skin. Cliente: `toPlayer()` en `src/match/TournamentService.js`, `buildRoster()` en `src/match/liveRules.js`, y en `src/main.js` (`showLiveRoom` y la partida contra bots) se montan los `bots` que se pasan a `game.load(course, { bots, ... })`.
- Catálogo: `SKINS` y `skinById` en `src/progress/skins.js`.

## Qué hay que hacer
1. **Servidor (migración nueva):** añadir a cada jugador de `_tournament_json` su skin equipada y su instancia (solo lo necesario para pintarla, p. ej. `{ id, seed }`), leída de `profiles.progress`. **Validar en el servidor** que la skin está desbloqueada para ese usuario (inventario, `20261026120000_skin_inventory.sql`); si no, mandar `classic`. Nada de datos privados.
2. **Cliente:**
   - Pasar la skin por `toPlayer()` → roster → `bots` de `game.load`. Cada `RemoteBall`/jugador lleva su `skin` + `instance`.
   - En `GolfGame`, sustituir el reparto aleatorio por **la skin de cada jugador**. `#prepareGhosts`/preparación del hoyo siguiente deben recibir la lista de skins reales (para seguir precompilando materiales durante la carga y no perder la optimización F3 del hoyo siguiente: mira `keyOf` y `#takeNext`).
   - Pasar la `instance` real a `createSkinMaterial` (hoy va `{}`), con calidad `low` como ahora para no castigar el móvil.
   - Si dos rivales llevan la misma skin con distinta instancia, que la caché `ghostHandles` no los mezcle (hoy la clave es `skin.id`).
   - **Bots** (partidas contra bots, o asientos rellenados con bots en vivo): pueden seguir con skin al azar, pero **determinista por partida** (semilla con `seededRng` de `liveRules.js` y el id del bot) para que la misma partida se vea igual en todos los dispositivos y en todos los hoyos.
   - Mantener la opacidad/«fantasma» actual de los rivales y la etiqueta con nombre y color.
   - Efectos de skin (`SkinFX`, `fx`) de los rivales: hoy no llevan. Decide si añadir los baratos (estela) con el gobernador de FX (`perfGovernor.js`) o dejarlo fuera; explícalo.
3. **Consistencia:** la misma skin en todos los hoyos de la partida y en los 3 mapas online. Revisa los temas con material especial (`themes.js`: neón/cyberpunk, glaciar, templo) por si `createSkinMaterial` necesita el tema del rival.

## Coordinación
El **prompt 4** (avatares y marcos públicos) toca el mismo `_tournament_json`. Si ese cambio ya está en la rama, amplía la misma función en vez de crear otra versión distinta.

## Pruebas y cierre
- Tests `node --test`: roster con skins, bot con skin determinista (misma semilla → misma skin), fallback a `classic` si llega una skin desconocida, `ghostHandles` con dos instancias de la misma skin. Hay tests de `GolfGame` sin GPU (`tests/golfgame-dispose.test.js`, `tests/game-preloader.test.js`): úsalos de modelo.
- `pnpm test` y `pnpm run build` en verde. Migración: avisa de que no se ha probado en Postgres y deja los pasos para aplicarla.
- Commits en `la-chaqueta-bionica`. Sin PR salvo que lo pida.
