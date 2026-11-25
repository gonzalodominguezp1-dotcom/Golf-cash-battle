# Prompt para continuar el rediseño de assets (nueva sesión)

Pega esto al empezar la sesión nueva:

---
Continúa el rediseño 1 a 1 de los assets de entorno de Golf Cash Battle (three.js). Trabaja SOLO en el worktree `C:\Users\DEV\Desktop\golfito\.worktrees\la-chaqueta-bionica`, rama `la-chaqueta-bionica`. No cambies de rama, no crees worktrees, no hagas push ni toques main. Usa **pnpm** (nunca npm ni npx). No abras el navegador ni arranques servidores: el usuario verifica en `assets-lab.html` y en el juego. No hagas commit salvo que te lo pida.

Lee antes `02-DOCS/wiki/ftd/assets-entorno-1a1.md` entero (sobre todo «Estado para retomar», «Paso V», «Muros, lava, temas y luces» y «Checklist») y `02-DOCS/wiki/sdd/decisions.md` (últimas entradas del 2026-11-25).

Estado al cerrar la sesión anterior:
- Hecho y en el juego: muros por familia en los 17 temas (`course.js`, `GolfGame.js`, pendiente de verlo en pantalla); lava y caldera usan matas de ceniza (`environment.js` + `assets/ash.js`); erupción de ceniza y brasas en volcán y caldera (`assets/eruption.js`, `themes.js` `eruption: true`).
- Pendiente de visto bueno del usuario: aspecto de muros transparentes y costuras, aspecto de la ceniza (contraste) y de la erupción en pantalla.
- Pendiente de la lista: Paso 4 arbustos (visto bueno y sustitución), Paso 8 agua, Paso 9 especiales, Paso V2 árboles y rocas volcánicas, V3 lago de lava con agua nueva, V4 caldera, Paso T (un tema distinto por mapa), cierre (Paso F: retirar `makeTree`, `makeTuft`, `makeGrassClump` y `waterShader` cuando nada los use; previews con `pnpm previews:capture`). Luces (F2), shaders y optimización van en una fase posterior: no las toques.

Reglas:
- Límites: no toques física ni colisiones (`WALL_HALF`, `wallSegmentsOf`, `WALL_H` son fijos). Las luces (lava, farolas, atracciones) quedan para la fase de luces.
- Cada asset: laboratorio (`src/lab/assets/examples.js`, con «antes» y «después») → visto bueno del usuario → sustituir en el juego.
- Trabajo grande con subagentes `developer` (un único agente por tarea; Opus para lo complejo, Sonnet para lo mecánico); tras cada tarea, revisión de contexto limpio del diff.
- El worktree tiene cambios ajenos sin commitear (VFX, auth, hub, `assets 3d.txt`): no los toques ni los incluyas.
- Pruebas: `pnpm exec node --test <fichero>` por fichero; `pnpm test` completo tiene 6 fallos VFX ajenos ya existentes (golden, SKINS y SIG, cuatro de «dir in/rad»): no son tuyos. Antes de dar algo por hecho corre `pnpm test` y `pnpm build`.
- Anota cada entrega en la spec (Paso correspondiente) y en `02-DOCS/wiki/sdd/decisions.md` con la fecha de hoy.

Entrega: qué cambiaste (rutas), presupuestos medidos, resultado de las pruebas, y qué queda para la revisión visual del usuario.

Empieza por: confirmar con el usuario qué visto bueno tiene (muros, ceniza, erupción) y luego seguir por el Paso 4 (arbustos) o por V2 si el usuario lo pide.
---
