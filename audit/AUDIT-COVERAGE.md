# Cobertura de la auditoría — Golf Cash Battle

Rama `la-chaqueta-bionica` · 2026-11-06. Primera pasada sobre `386c815` (218 archivos); **reauditoría sobre `5a05874`** (238 archivos: 20 nuevos y 31 modificados). Inventario generado con `git ls-files` y clasificado a mano.

## 1. Git y entorno

| Comprobación | Resultado |
|---|---|
| Rama pedida | `la-chaqueta-bionica` (nombre real del remoto; coincide con `CLAUDE.md`) |
| Primera pasada | `git checkout --detach origin/la-chaqueta-bionica` → `386c815`; sin ramas, commits ni push |
| Petición del usuario tras la primera pasada | «Descarga los commits, actualiza mi rama y vuelve a auditar». Respuestas: rama = `la-chaqueta-bionica`, **«Solo en local»** (sin push) |
| Actualización | `git fetch origin main la-chaqueta-bionica la-yuinta-mangante` · `git checkout -B la-chaqueta-bionica origin/la-chaqueta-bionica` · `git merge --ff-only origin/main` → **`5a05874`** (avance rápido; la rama no tenía commits propios, sin conflictos) |
| Estado local final | `la-chaqueta-bionica` = `5a05874`, **20 commits por delante de `origin/la-chaqueta-bionica` (`386c815`) sin subir**; árbol limpio salvo `?? audit/` |
| `main` y `la-yuinta-mangante` | Ambas en `5a05874` (la rama auditada coincide ahora con `main`) |
| Nota | Al principio de la sesión el `origin/main` local estaba desactualizado (`6305976`, de la clonación del contenedor); se corrigió con `git fetch` |
| Entorno | Sesión en la nube (contenedor efímero). **Ni la rama actualizada ni `audit/` están en GitHub**: se pierden si el contenedor se recicla sin push |

## 2. Resumen

| Estado | Archivos | Criterio |
|---|---|---|
| INSPECTED | 100 | Leído completo (o comparado byte a byte con un archivo ya leído) |
| PARTIALLY INSPECTED | 106 | Leídas las secciones relevantes, o revisado con barrido automático y ejecutado por los tests |
| NOT INSPECTED | 0 | — |
| EXCLUDED | 32 | Imágenes y binarios sin lógica |

**Núcleo de dinero, integridad y seguridad** (las 23 migraciones, Edge Functions, wallet, torneos y partidas en vivo, grupos, cuenta, admin, backend, antibots, repetición, configuración, CI y despliegue): **INSPECTED**. En `5a05874`, `main.js` pasa a PARTIALLY: el flujo en vivo (líneas 2013-2420) está leído completo y el resto del diff (sobre todo la interfaz de grupos y los iconos) se ha revisado con búsquedas. Lo PARTIALLY corresponde sobre todo al render 3D visual (`src/game/render/**`, `src/ui/skin*`: 12.204 líneas), revisado con barrido automático de sumideros peligrosos y no línea a línea.

## 3. Técnicas aplicadas

1. Lectura completa de los archivos del núcleo y seguimiento de los flujos entre módulos (lobby → `startMatch` → `TournamentService` → RPC/Edge → SQL → wallet).
2. `diff` entre `src/game/*` y `src/antibot/risk.js` y sus copias en `supabase/functions/submit-hole/` (idénticas).
3. Barridos con `grep` de: funciones trascendentes (determinismo), `innerHTML`/`eval`/`fetch`/`postMessage`, `catch` vacíos, `TODO`/`FIXME`/`mock`/`stub`, secretos en el árbol y en **todo el historial de Git**, palabras de apuestas, atributos de accesibilidad y listeners sin quitar.
4. Ejecución: suite de tests, cobertura de Node, `pnpm audit` (prod y completo), aplicación de las 18 migraciones en Postgres 16 desechable y 4 escenarios SQL, y 2 simulaciones de física con Node.
5. Contraste documentación ↔ código (README, wiki, constitución, especificación del ranking, FTD de la rama).

## 4. Limitaciones y lo que no se pudo verificar

| Limitación | Consecuencia |
|---|---|
| Sin `node_modules` (prohibido instalar) | Sin `vite build`; 4 suites (30 casos) sin ejecutar; el render 3D no se pudo ejecutar ni perfilar |
| Sin Deno | Sin `deno check` ni pruebas de las Edge Functions |
| Esquema base fuera del repo (GCB-005) | RLS de `wallets`, `profiles`, `transactions`, `tiers` y `app_config`; las RPC `demo_deposit`, `credit_deposit`, `join_match`, `submit_hole`, `finish_match_tb`, `abandon_match` y `active_match`; el trigger de alta. **No auditables.** Los escenarios SQL usan un esquema base **simulado** (`audit/evidence/stub_baseline.sql`) |
| Sin acceso al proyecto Supabase ni a Vercel | Configuración de Auth (confirmación de email, CAPTCHA, rate limits, URLs), secrets desplegados (¿hay claves de Didit? ¿`NOWPAYMENTS_SANDBOX`?), `verify_jwt` de `kyc`, versión desplegada de cada función y de `course_count`: **no verificados** |
| Sin navegador ni dispositivo | Accesibilidad, responsive y rendimiento revisados en código, no medidos. GCB-041 queda como sospecha |
| Estado del CI en GitHub | No consultado |
| Carrera de GCB-009 | Reproducida con una ventana ampliada artificialmente (`pg_sleep`); la ventana real es más corta, pero existe |

**Archivos NOT INSPECTED: 0.** Los 8 que quedaban (`01-TOOLS/_TEMPLATE/README.md`, `02-DOCS/raw/.gitkeep`, 4 documentos `cyberpunk2078*` y 2 hojas de estilo) se revisaron en una segunda pasada sin hallazgos nuevos.

**Comprobaciones que siguen sin poder hacerse, y por qué:**

| Comprobación | Motivo |
|---|---|
| `pnpm run build` | Requiere `vite` en `node_modules`; ni el proyecto ni la máquina lo tienen (búsqueda en `/usr/lib/node_modules`, `/usr/local/lib/node_modules`, `~/.npm`, `~/.local/share/pnpm`, `~/.cache` y `/opt`: solo aparece un `vite` interno de playwright-core, que no sirve). Instalarlo está prohibido por la tarea |
| `deno check` | Deno no está instalado y descargarlo equivale a instalarlo |
| 30 casos de las 4 suites con `three` | `three` no existe en la máquina; mismo motivo |
| Revisión de `main` (20 commits por delante) | Fuera del alcance: la tarea fija la rama `la-chaqueta-bionica` y prohíbe cambiar a `main`. Solo se han consultado con `git show` y `git diff` dos piezas para advertir del riesgo |
| Render 3D línea a línea | 12.204 líneas de código visual sin flujo de dinero ni de datos de usuario; cubiertas con análisis estructural. Su comportamiento real (memoria, FPS) solo se puede medir en un navegador con `three` |

### 4.1 Por qué el render 3D no necesita revisión línea a línea para la integridad

Se ha verificado que **ningún módulo de render puede influir en los golpes ni en el resultado oficial**:

1. `src/game/physics.js`, `courses.js` y `antibot/risk.js` no importan nada; `replay.js` solo importa `physics.js`; `submit-hole/index.ts` solo importa supabase-js y sus copias de `game/` y `antibot/`. El grafo es unidireccional.
2. Los 7 módulos de render que importan `physics.js` solo usan constantes (`BALL_R`, `CUP_R`, `WALL_HALF`…) y funciones de consulta (`loopTable`, `tubeTable`, `sampleAt`, `rampHeight`, `moverPos`, `wallSegmentsOf`). Las tablas cacheadas se **leen** (`terrain.js:85-87`, `.map` en `attractions.js:669` y `course.js:647`); no se escribe en ellas ni en el estado de la bola o el hoyo (búsqueda de asignaciones: 0 coincidencias en `src/game/render` y `src/ui`).
3. El resultado oficial lo calcula `submit-hole` en un proceso aparte con sus propias copias, así que un fallo de render solo afectaría a lo que se ve en el cliente.

Lo pendiente en el render es solo rendimiento y memoria (GCB-041), que requiere un navegador con `three`.

## 5. Revisión cruzada final

- **Reauditoría (`5a05874`):** los 47 hallazgos anteriores se revisaron uno por uno sobre el código nuevo (columna «Estado en `5a05874`» de `BUGS-AND-ISSUES.md`). Se añadieron GCB-048 a GCB-053. Los escenarios de dinero y la simulación de pausa se reejecutaron sobre las 23 migraciones y la física nueva.

- Los IDs `GCB-001`…`GCB-047` de `BUGS-AND-ISSUES.md` son la referencia única; el resto de informes los citan sin redefinirlos.
- Cada hallazgo marcado «CONFIRMADO (ejecución)» tiene su script en `audit/evidence/`. Se han revisado los números de línea citados contra el código de `386c815`.
- Falsos positivos descartados y documentados al final del resumen de `BUGS-AND-ISSUES.md` (5).
- `git status` al terminar: solo `?? audit/`; ningún archivo del proyecto modificado.

## 6. Inventario completo

| Archivo | Estado | Notas |
|---|---|---|
| `.claude/launch.json` | INSPECTED | Leído completo |
| `.claude/rsc-bootstrap.mjs` | PARTIALLY INSPECTED | Barrido de ejecución y red (solo imprime avisos; no ejecuta npx) |
| `.claude/settings.json` | INSPECTED | Leído completo |
| `.github/workflows/ci.yml` | INSPECTED | Leído completo |
| `.gitignore` | INSPECTED | Leído completo |
| `.rsc.json` | PARTIALLY INSPECTED | Primeras 1.500 bytes (skills, optOuts, permisos) |
| `01-TOOLS/.gitignore` | INSPECTED | Leído completo |
| `01-TOOLS/_TEMPLATE/.env.example` | INSPECTED | Leído completo |
| `01-TOOLS/_TEMPLATE/.gitignore` | INSPECTED | Leído completo |
| `01-TOOLS/_TEMPLATE/CREDENTIALS.md` | INSPECTED | Leído completo |
| `01-TOOLS/_TEMPLATE/README.md` | INSPECTED | Leído completo (plantilla sin lógica) |
| `01-TOOLS/_TEMPLATE/test_connection.sh` | INSPECTED | Leído completo |
| `02-DOCS/raw/.gitkeep` | INSPECTED | Vacío (0 bytes) |
| `02-DOCS/wiki/arquitectura/estructura-y-stack.md` | PARTIALLY INSPECTED | Cabecera |
| `02-DOCS/wiki/backend/supabase.md` | INSPECTED | Leído completo |
| `02-DOCS/wiki/backend/validacion-y-antibots.md` | INSPECTED | Leído completo |
| `02-DOCS/wiki/ftd/auth-email-password.md` | INSPECTED | Leído completo |
| `02-DOCS/wiki/ftd/avatar-servidor-amigos.md` | INSPECTED | Leído completo |
| `02-DOCS/wiki/ftd/cuenta-wallet-avatar.md` | INSPECTED | Leído completo |
| `02-DOCS/wiki/harness/decisions.md` | PARTIALLY INSPECTED | Cabecera |
| `02-DOCS/wiki/harness/installation-plan.md` | PARTIALLY INSPECTED | Cabecera |
| `02-DOCS/wiki/index.md` | PARTIALLY INSPECTED | Cabecera |
| `02-DOCS/wiki/juego/reglas-y-economia.md` | INSPECTED | Leído completo |
| `02-DOCS/wiki/operacion/dinero-real-pendiente.md` | INSPECTED | Leído completo |
| `02-DOCS/wiki/operacion/flujo-y-despliegue.md` | INSPECTED | Leído completo |
| `02-DOCS/wiki/sdd/config.yaml` | INSPECTED | Leído completo |
| `02-DOCS/wiki/sdd/constitution.md` | PARTIALLY INSPECTED | Reglas Q2.x, K3.x, S5.x, D8.4 y §8 de brechas |
| `02-DOCS/wiki/sdd/plans/cyberpunk2078-rediseno.md` | INSPECTED | Leído (barrido de despliegue, migración y verificación): confirma el orden submit-hole → migración y que la vista previa no se verificó |
| `02-DOCS/wiki/sdd/plans/cyberpunk2078.md` | INSPECTED | Leído (mismo barrido) |
| `02-DOCS/wiki/sdd/specs/cyberpunk2078-rediseno.md` | INSPECTED | Leído (mismo barrido); los efectos no alimentan la física (coherente con el código) |
| `02-DOCS/wiki/sdd/specs/cyberpunk2078.md` | INSPECTED | Leído (mismo barrido) |
| `02-DOCS/wiki/sdd/specs/ranking-prestigio.md` | INSPECTED | Leída completa; contrastada con ranking_prestige.sql (criterios 2 y 7 incumplidos) |
| `CLAUDE.md` | INSPECTED | Leído completo |
| `README.md` | INSPECTED | Leído completo |
| `admin.html` | INSPECTED | Leído completo |
| `index.html` | INSPECTED | Leído completo |
| `odd/tasks/camera-obstruction-transparency.md` | PARTIALLY INSPECTED | Solo cabecera (documentación de tareas) |
| `odd/tasks/challenge-skins-redesign.md` | PARTIALLY INSPECTED | Solo cabecera (documentación de tareas) |
| `odd/tasks/course-card-previews.md` | PARTIALLY INSPECTED | Solo cabecera (documentación de tareas) |
| `odd/tasks/cyberpunk-neon-environment.md` | PARTIALLY INSPECTED | Solo cabecera (documentación de tareas) |
| `odd/tasks/desktop-version.md` | PARTIALLY INSPECTED | Solo cabecera (documentación de tareas) |
| `odd/tasks/luxury-esport-redesign.md` | PARTIALLY INSPECTED | Solo cabecera (documentación de tareas) |
| `odd/tasks/migrate-to-pnpm.md` | PARTIALLY INSPECTED | Solo cabecera (documentación de tareas) |
| `odd/tasks/redesign-loopings.md` | PARTIALLY INSPECTED | Solo cabecera (documentación de tareas) |
| `odd/tasks/remove-text-icons-and-custom-design-plan.md` | PARTIALLY INSPECTED | Solo cabecera (documentación de tareas) |
| `odd/tasks/solo-free-play.md` | PARTIALLY INSPECTED | Solo cabecera (documentación de tareas) |
| `odd/tasks/static-course-previews.md` | PARTIALLY INSPECTED | Solo cabecera (documentación de tareas) |
| `package.json` | INSPECTED | Leído completo |
| `pnpm-lock.yaml` | PARTIALLY INSPECTED | Versiones resueltas y engines de vite, esbuild, three y supabase-js; usado por pnpm audit |
| `pnpm-workspace.yaml` | INSPECTED | Leído completo |
| `public/android-chrome-192x192.png` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/android-chrome-512x512.png` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/apple-touch-icon.png` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-1.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-10.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-11.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-12.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-13.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-14.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-15.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-16.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-17.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-2.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-3.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-4.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-5.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-6.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-7.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-8.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/course-9.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/courses/tiebreak.webp` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/favicon-16x16.png` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/favicon-32x32.png` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/favicon.ico` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/logo-black-gold.png` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/logo-header.png` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/logo-square.png` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/logo.png` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/og-image.jpg` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/site.webmanifest` | INSPECTED | Leído completo |
| `public/skins/dimples-normal-512.png` | EXCLUDED | Binario o imagen (sin lógica) |
| `public/skins/dimples-normal.png` | EXCLUDED | Binario o imagen (sin lógica) |
| `scripts/bake-dimples.mjs` | PARTIALLY INSPECTED | Cabecera y E/S (genera un PNG local) |
| `scripts/capture-course-previews.mjs` | PARTIALLY INSPECTED | Barrido (lanza Chromium con --no-sandbox; solo herramienta local) |
| `scripts/course-preview-capture.html` | PARTIALLY INSPECTED | Cabecera (página de captura local) |
| `scripts/route-planner.mjs` | PARTIALLY INSPECTED | Cabecera e imports (solucionador de tiros, GCB-047) |
| `scripts/sync-functions.mjs` | INSPECTED | Leído completo |
| `scripts/verify.sh` | INSPECTED | Leído completo |
| `src/account/AccountService.js` | INSPECTED | Leído completo |
| `src/account/AuthService.js` | INSPECTED | Leído completo |
| `src/account/authRules.js` | INSPECTED | Leído completo |
| `src/account/friendRules.js` | INSPECTED | Leído completo |
| `src/admin/admin.css` | INSPECTED | Leído completo; sin defectos (no quita el foco por defecto) |
| `src/admin/admin.js` | INSPECTED | Leído completo |
| `src/antibot/risk.js` | INSPECTED | Leído completo |
| `src/backend/index.js` | INSPECTED | Leído completo |
| `src/backend/supabase.js` | INSPECTED | 386c815 completo + diff de 5a05874 (PartyService) |
| `src/config.js` | INSPECTED | Leído completo |
| `src/game/GolfGame.js` | PARTIALLY INSPECTED | 5a05874: bucle #frame, pausa, contador, noteRemoteSunk/#noteSunk/#timeUp y load(live) releídos; render no revisado línea a línea |
| `src/game/audio.js` | PARTIALLY INSPECTED | Barrido: AudioContext y buffers |
| `src/game/bots.js` | PARTIALLY INSPECTED | Cabecera y RNG (solo práctica local) |
| `src/game/courses.js` | PARTIALLY INSPECTED | 5a05874: barrido de determinismo repetido y copia sincronizada; ejecutado por tests |
| `src/game/physics.js` | PARTIALLY INSPECTED | 5a05874: barrido de determinismo repetido (sin funciones trascendentes) y copia sincronizada con submit-hole; ejecutado por tests y simulación |
| `src/game/render/attractions.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/ballPaint.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/ballSkins.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/batch.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/course.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/coursePreview.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/coursePreviewStatic.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/cyberpunkEnvironment.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/cyberpunkFx.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/cyberpunkPuddles.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/cyberpunkRain.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/effects.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/environment.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/lava.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/lushEnvironment.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/perfGovernor.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/portal.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/quality.js` | PARTIALLY INSPECTED | Barrido de almacenamiento |
| `src/game/render/skins/envStudio.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/fxRules.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/patterns/abyssal_tide.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/patterns/anima_errante.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/patterns/antimatter_void.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/patterns/crimson_dragon.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/patterns/cronometro_laton.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/patterns/damascus_imperial.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/patterns/event_horizon.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/patterns/holo.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/patterns/ice.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/patterns/index.js` | INSPECTED | Leído completo |
| `src/game/render/skins/patterns/kintsugi_neon.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/patterns/midas_touch.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/patterns/supernova_solar.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/patterns/tormenta_voltaica.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/shaderLib.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/skinFx.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/skins/skinMaterial.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/terrain.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/render/textures.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/game/replay.js` | INSPECTED | Leído completo |
| `src/game/themes.js` | PARTIALLY INSPECTED | Datos de ambientación (25 temas); 100 % de líneas cubiertas por tests |
| `src/main.js` | PARTIALLY INSPECTED | 386c815: leído completo. 5a05874: flujo en vivo (2013-2420) leído completo; resto del diff (+968 líneas: interfaz de grupos e iconos) revisado con búsquedas; los hallazgos anteriores, uno por uno |
| `src/match/MatchService.js` | INSPECTED | Leído completo |
| `src/match/SupabaseMatchService.js` | INSPECTED | Leído completo |
| `src/match/TournamentService.js` | INSPECTED | 386c815 completo + diff de 5a05874 (latido, finish, get, startsAt/clockOffset) |
| `src/progress/Progress.js` | INSPECTED | Leído completo |
| `src/progress/avatar.js` | INSPECTED | Leído completo |
| `src/progress/inventory.js` | PARTIALLY INSPECTED | Barrido de la semilla (FNV) y saneado; cubierto por tests |
| `src/progress/prestige.js` | INSPECTED | Leído completo |
| `src/progress/skins.js` | PARTIALLY INSPECTED | Catálogo de skins (requisitos y patrones) |
| `src/style.css` | PARTIALLY INSPECTED | Barrido de accesibilidad (focus, outline, media, reduced-motion) |
| `src/ui/authScreen.css` | INSPECTED | Leído completo; sin defectos |
| `src/ui/authScreen.js` | PARTIALLY INSPECTED | Líneas 1-80 y barrido de sumideros (solo textContent) |
| `src/ui/skinInspector.css` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/ui/skinInspector.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/ui/skinReveal.css` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/ui/skinReveal.js` | PARTIALLY INSPECTED | Sumideros innerHTML (datos estáticos o escapados) |
| `src/ui/skinThumbRender.js` | PARTIALLY INSPECTED | Barrido de sumideros (eval, fetch, innerHTML, storage, postMessage: sin riesgo) + análisis estructural de asignaciones en bucles por frame (solo por eventos: descartado) y balance creación/dispose de objetos GPU (GCB-041); render visual no revisado línea a línea |
| `src/ui/skinThumbs.js` | PARTIALLY INSPECTED | Barrido IndexedDB y catch |
| `src/wallet/LocalWallet.js` | INSPECTED | Leído completo |
| `src/wallet/SupabaseWallet.js` | INSPECTED | Leído completo |
| `src/wallet/WalletService.js` | INSPECTED | Leído completo |
| `supabase/audit/auth_security_audit.sql` | INSPECTED | Leído completo |
| `supabase/functions/crypto-deposit/index.ts` | INSPECTED | Leído completo |
| `supabase/functions/deno.d.ts` | INSPECTED | Leído completo |
| `supabase/functions/deno.json` | INSPECTED | Leído completo |
| `supabase/functions/kyc/index.ts` | INSPECTED | Leído completo |
| `supabase/functions/kyc/providers.ts` | INSPECTED | Leído completo |
| `supabase/functions/nowpayments-ipn/index.ts` | INSPECTED | Leído completo |
| `supabase/functions/submit-hole/antibot/risk.js` | INSPECTED | Idéntico a src/antibot/risk.js (diff) y leído |
| `supabase/functions/submit-hole/game/courses.js` | INSPECTED | Idéntico a src/game/courses.js en 5a05874 (diff) |
| `supabase/functions/submit-hole/game/physics.js` | INSPECTED | Idéntico a src/game/physics.js en 5a05874 (diff) |
| `supabase/functions/submit-hole/game/replay.js` | INSPECTED | Idéntico a src/game/replay.js (diff) y leído |
| `supabase/functions/submit-hole/index.ts` | INSPECTED | 386c815 completo + diff de 5a05874 (tope de 20 tiros) |
| `supabase/functions/tsconfig.json` | INSPECTED | Leído completo |
| `supabase/migrations/20261019100000_async_tournaments.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261019140000_accounts_kyc_antibot.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261019160000_admin_panel.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261019160100_ten_courses.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261020170000_hole_timer.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261020180000_eighteen_courses.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261026120000_skin_inventory.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261026190000_nineteen_courses.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261027120000_save_progress_clamp.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261027140000_rematch_groups.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261028120000_inside_volcano.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261029100000_twenty_courses.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261029110000_abyss_course.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261030120000_fourteen_courses.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261101120000_cyberpunk2078_course.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261102120000_ranking_prestige.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261103120000_xp_curve.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `supabase/migrations/20261103130000_avatar_friends.sql` | INSPECTED | Leída completa; aplicada en Postgres 16 sobre un esquema base simulado |
| `tests/antibot.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/auth-rules.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/avatar.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/course-preview.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/courses.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/cyberpunk-rain.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/desktop-controls.test.js` | INSPECTED | Analizado caso a caso: 9/14 tautológicos |
| `tests/determinism.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/economy.test.js` | INSPECTED | Leído completo |
| `tests/freeplay.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/friends.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/hole-timer.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/inventory.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/loop-blocks-ball.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/prestige.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/progress.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/replay.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/skin-fx-rules.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/skins-new.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `tests/skins-schema.test.js` | PARTIALLY INSPECTED | Ejecutado (node --test); estructura y relación con imports analizadas |
| `vercel.json` | INSPECTED | Leído completo |
| `vite.config.js` | INSPECTED | Leído completo |
| `src/match/LiveRoom.js` | INSPECTED | Nuevo en 5a05874. Leído completo (GCB-048, GCB-049) |
| `src/match/liveRules.js` | INSPECTED | Nuevo. Leído completo (roster, bots, marcador) |
| `src/match/PartyService.js` | INSPECTED | Nuevo. Leído completo |
| `src/match/partyRules.js` | INSPECTED | Nuevo. Leído completo |
| `src/game/remoteBall.js` | PARTIALLY INSPECTED | Nuevo. Validación de tiros recibidos (`cleanShots`, `mergeShots`; GCB-052) e imports; cubierto por `tests/live.test.js` |
| `supabase/migrations/20261103150000_matchmaking_parties.sql` | INSPECTED | Nuevo. Leída completa; aplicada en Postgres 16 |
| `supabase/migrations/20261103180000_live_matches.sql` | INSPECTED | Nuevo. Leída completa; aplicada; escenarios A-C ejecutados |
| `supabase/migrations/20261105120000_temple_online.sql` | INSPECTED | Nuevo. Leída completa; aplicada |
| `supabase/migrations/20261105130000_glacier_online.sql` | INSPECTED | Nuevo. Leída completa; aplicada |
| `supabase/migrations/20261106120000_temp_disable_account_verification.sql` | INSPECTED | Nuevo. Leída completa; aplicada; ejecutado con cuenta de menor sin confirmar (GCB-006) |
| `tests/live.test.js` | PARTIALLY INSPECTED | Nuevo. Ejecutado; 6/6 sin tautologías (usa los módulos reales) |
| `tests/party.test.js` | PARTIALLY INSPECTED | Nuevo. Ejecutado; 3 de 7 leen texto SQL, uno con una garantía falsa (GCB-053) |
| `tests/icons.test.js` | PARTIALLY INSPECTED | Nuevo. Ejecutado (4/4) |
| `tests/resolution-governor.test.js` | PARTIALLY INSPECTED | Nuevo. Ejecutado (5/5) |
| `src/ui/icons.js` | PARTIALLY INSPECTED | Nuevo (523 líneas). Barrido de sumideros: SVG con datos estáticos; `label` solo recibe textos de la app |
| `src/game/render/flora.js` | PARTIALLY INSPECTED | Nuevo. Barrido de sumideros (sin coincidencias) |
| `src/game/render/resolutionGovernor.js` | PARTIALLY INSPECTED | Nuevo. Barrido de sumideros; cubierto por su test |
| `scripts/icons-mockup.mjs` | PARTIALLY INSPECTED | Nuevo. Cabecera (genera un PNG local con Playwright) |
| `02-DOCS/wiki/juego/iconos/index.md` | PARTIALLY INSPECTED | Nuevo. Cabecera |
| `02-DOCS/wiki/juego/iconos/mockup.png` | EXCLUDED | Imagen |
