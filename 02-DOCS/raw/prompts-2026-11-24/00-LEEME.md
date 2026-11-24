# Prompts para nuevas sesiones (2026-11-24)

Un prompt por cambio. Copia el contenido entero de cada fichero en una sesión nueva.

| # | Fichero | Depende de | Toca sobre todo |
|---|---|---|---|
| 1 | `01-verificacion-email.md` | — | `AuthService.js`, `supabase.js`, `authScreen.js`, `main.js`, `vercel.json`, panel de Supabase |
| 2 | `02-tutorial-bienvenida.md` | 1 | pantalla nueva + `main.js` + migración |
| 3 | `03-marcador-golpes.md` | — | `main.js` (HUD), `style.css` |
| 4 | `04-avatares-marcos-publicos.md` | — (coordinar con 5: mismo JSON del servidor) | migraciones, `TournamentService.js`, `matchmakingView.js`, `partyPanel.js`, `main.js` |
| 5 | `05-skins-rivales.md` | 4 recomendado antes | migraciones, `GolfGame.js` (`#buildBots`, `#prepareGhosts`), `main.js` |
| 6 | `06-movil-controles-bloqueados.md` | — (hacer antes que 7) | `GolfGame.js` (entrada) |
| 7 | `07-zoom-pellizco-rueda.md` | 6 | `GolfGame.js` (entrada), ajustes, textos del HUD |
| 8 | `08-spec-muros-farolas.md` | — | solo documentación (`ftd/assets-entorno-1a1.md`) |

**Orden recomendado:** 1 → 2, 6 → 7, 4 → 5; 3 y 8 cuando quieras. 6 y 7 tocan el mismo bloque de
`GolfGame.js`: no los lances a la vez. 4 y 5 tocan el mismo JSON de jugadores del servidor: mejor en serie.

Todos los prompts asumen que la sesión lee `CLAUDE.md` (rama por persona, pnpm siempre).
