---
type: plan
title: Plan — UI por pantallas (router, hub 3D, splash y migración de pantallas)
description: HOW de la UI por pantallas: arquitectura, contratos del router y de las pantallas, flujo de datos, pruebas, secuencia por fases, riesgos y tareas T001-T044.
tags: [sdd, plan, ui, navegacion, splash, hub]
timestamp: 2026-11-12T18:00:00Z
topic: sdd
slug: ui-pantallas
status: draft
---

# Plan — UI por pantallas: router, hub 3D, splash y migración

> Slug: `ui-pantallas` · Spec: [ui-pantallas](../specs/ui-pantallas.md) (aprobada; las Clarifications C1-C13 mandan sobre el cuerpo) · Rama: `la-chaqueta-bionica-ui` (worktree `.worktrees/la-chaqueta-bionica-ui`, aislamiento ya cumplido)
> Inherits: [constitution](../constitution.md) · Base de medida: `3d12edf` (el código de `HEAD` es idéntico: los commits posteriores solo tocan `02-DOCS/`).

## 0. Global constraints
Valores que toda tarea respeta, tal cual. El ejecutor de cada tarea los hereda aunque su fila no los repita:

- **Rama y git:** trabajar solo en `la-chaqueta-bionica-ui` dentro de `.worktrees/la-chaqueta-bionica-ui`. Commits gitmoji + Conventional Commits en español (`✨ feat(ui): …`), autor **Chakets**, **sin trailers de IA** (K3.1, K3.5). **Sin push.**
- **pnpm siempre** (`pnpm test`, `pnpm run build`, `pnpm dev`). Nunca `npm`/`npx`. **Sin dependencias nuevas** (C1.5): ni jsdom, ni librerías de UI/animación, ni sharp.
- **No se toca:** física (`physics.js`, `replay.js`, `courses.js`), economía (`config.js` TIERS/premios), `src/wallet/*`, `src/backend/*`, RLS, migraciones, Edge Functions, RPC de Supabase, `admin.html`, `vercel.json` (la CSP no cambia, AC36).
- **CSP:** `script-src 'self'` → ningún `<script>` inline; JS del splash en archivo propio. `style-src` permite `'unsafe-inline'` → el CSS del splash va en `<style>` dentro de `index.html`. Sin dominios nuevos.
- **Three.js** solo por `import()` dinámico. El chunk de entrada no lo importa estáticamente (AC13). `quality.js`, `ballPaint.js` y todos los `*Rules.js` siguen sin importar `three`.
- **Textos:** toda cadena visible de `src/screens/**` vive en `src/screens/texts/*.js` (AC23). UI en español sencillo (U6.2, K3.3). Identificadores de `src/screens/` en inglés.
- **Accesibilidad y táctil:** objetivos ≥44×44 px (U6.4, AC19); contraste AA y nada solo por color (U6.5); foco visible; nada depende de hover (AC24); `env(safe-area-inset-*)` en cabecera y barra inferior (AC20); sin scroll horizontal a 360 px (U6.7).
- **Movimiento:** transición de pantalla 200 ms (rango permitido 150-250, AC7); con `prefers-reduced-motion: reduce` → corte o fundido ≤80 ms (AC6). Ningún elemento parpadea más de 3 veces/s (U6.6, AC33).
- **Rendimiento:** JS de carga inicial ≤ +15 KB gzip respecto a la línea base (AC34); hub ≥55 FPS de media en 10 s a 375×812 (AC14); escena del hub con 0 llamadas de render cuando está tapada o la pestaña oculta (AC13). Cada tarea que toca render o carga anota cómo midió (P7.5).
- **Datos reales:** nada de datos de prueba, liga, desafíos con fecha, recompensas ni cofres (AC12, C1, C5, C6). El saldo lo da `wallet.getBalance()`; la UI no lo calcula ni lo cachea (S5.7). El hub no muestra saldo ni botón de silencio (C11).
- **Comportamiento que no cambia:** atajos 1-6 y M, Esc en partida (vista general / pausa), `#hoyoN` y `#hoyoN-empate`, `?skinlab=1`, popup de avisos de 5 s, `skinReveal` al volver al hub, abandono de partida en vivo al salir, login de siempre (`authScreen`).
- **Verificación visual** (toda tarea visual): `pnpm dev` + pane de navegador a **375×812, 360×640 y 1280×800**; consola sin errores; capturas en `02-DOCS/attachments/ui-pantallas/<tarea>-<vista>-<ancho>x<alto>.png`. Si el pane no puede emular CPU ×4 o giroscopio, se anota «no ejecutado» (nunca «pasado») y queda para el humano (Q2.5).
- **Tamaño por tarea:** ≤ ~400 líneas de diff y ≤12 archivos (`review_budget`). Los movimientos de código cuentan; el revisor usa `git diff --color-moved=zebra`.
- `pnpm test` y `pnpm run build` en verde al cerrar cada tarea (Q2.1). El juego funciona al final de cada fase.

## 1. Context & constraints
- **Hoy:** `src/main.js` (2784 líneas) tiene un router casero sin pila: `screen` global, `shell()` vacía `#app` y pinta cabecera + tabbar, `go(to)` despacha a `show*` (`main.js:99-245`). Teclado global en `main.js:174-216`. No hay `popstate`/`hashchange`: atrás sale de la app (spec §Problem).
- **Fugas conocidas** (spec §Problem, verificadas en código): `partyPanel` re-arma `setTimeout(poll, 3000)` sin `clear` (`:517`, solo para si `box` se desconecta); `onKeyR` del juego libre se añade a `window` en cada hoyo y nunca se quita (`:1668`); `fullscreenchange` en cada `playScreen` (`:1681`); `startNotifier` se re-arma para siempre (`:2781`); toasts con `setTimeout` sueltos (`:1699`).
- **Datos reales disponibles** (spec §Datos): `progress.level` → `{level, into, need}`, `progress.challenge(id)` → `{value, goal, done}`, `progress.claimable`, `progress.state` (racha, victorias, birdies…), `prestige.js` (`frameFor`, `FRAMES`), `CHALLENGES` (25, en `progress/skins.js`), `account.friends()` → `{friends, incoming, outgoing}`, `parties.mine()` → `{party, invites}`, `wallet.getBalance/getTransactions/subscribe`, `account.ranking/myRanking`.
- **Render reutilizable:** `lushEnvironment.js` (`makeLushTree`, `makeLushBush`, `makeLushRock`, `makeGrassClump`, `makeLushCloud`, `lushMountains`, `meadowGroundTexture`), tema `meadowDay` en `src/game/themes.js`, `AdditiveParticles` en `effects.js`, `ResolutionGovernor`, `quality.js` (`getQuality`, `qualityPreset`). `buildEnvironment` está acoplado a un `course` y no se usa para el hub (C8: un green suelto, no un hoyo del juego).
- **Captura existente:** `pnpm previews:capture` (`scripts/capture-course-previews.mjs`) arranca Vite, abre una página en Chrome headless (SwiftShader) por CDP y escribe WebP. Es el patrón para capturar las capas del splash desde la escena del hub.
- **Tests:** `node --test tests/*.test.js`; reglas puras en `*Rules.js` (patrón `tests/notify.test.js` + `src/ui/notifyRules.js`). No hay DOM en Node: lo que se prueba en Node no importa CSS ni toca `document` al cargarse.
- **Constitución que pesa:** K3.4 (carpeta nueva `src/screens/`, justificada abajo), U6.1/P7.3 (transición ≤1 s a 60 FPS), U6.3 (≤3 toques: hub → JUGAR → mesa = 2), U6.6 (excepción del botón de silencio, C11 → T008), P7.1 (60 FPS en gama media/baja), P7.5.
- **Justificación de `src/screens/` (K3.4):** separa la navegación (router, ciclo de vida, pantallas) de `src/ui/` (componentes sueltos ya existentes: avisos, ajustes, inspector, revelación). Es lo que sale de `main.js`; meterlo en `ui/` mezclaría pantallas con widgets reutilizables.

## 2. Architecture

```text
 index.html ──(HTML+CSS inline)──▶ #splash  ◀── public/splash.js (script clásico, sin imports, antes del bundle)
     │                                 ▲  window.gcbSplash.mark('bundle'|'session'|'progress'|'three'|'scene'|'hub')
     ▼                                 │
 src/main.js (arranque) ──▶ ui/splashBridge.js ──────────────┘
     │ crea ctx                                     import() ──▶ game/render/hubScene.js (+ three) ── hubAmbient.js
     ▼                                                              ▲ reglas puras: hubSceneRules.js
 screens/router.js  (pila, hash ↔ ruta, historial, Esc, back guard)
     │ routes.js: id → hash, padre, load()= import('./<pantalla>.js')
     ▼
 screens/host.js  (monta/desmonta en #app, transición, foco)       screens/lifecycle.js (scope: listeners/timers)
     │ mount(root, ctx, params) → { destroy, onCover?, onUncover?, onBack? }
     ├── hub.js (keepAlive; escena detrás; badges)          ◀── ui/notifier.js (avisos + cuentas para badges)
     ├── tables.js (Mesas) ◀── match/partyWatch.js          ◀── screens/*Rules.js (puras, node --test)
     ├── achievements.js · friends.js · ranking.js · skins.js · skinInspect.js
     ├── account.js (Perfil · Progreso · Monedero) · settings.js · maps.js
     └── play (legado: playScreen/startMatch/en vivo siguen en main.js; solo entrada/salida enrutadas)
 screens/components.js (cabecera, tarjeta, botones, badge, lista con estados) · screens/shared.js · screens/texts/*.js
```

Componentes, una responsabilidad cada uno (interno salvo indicación):
- **`screens/router.js`** — pila de rutas y sincronía con `history`/`location.hash`. Puro respecto al DOM: recibe `win` por parámetro (dobles en test). No monta nada.
- **`screens/host.js`** — aplica la pila al DOM: monta la cima, desmonta lo tapado (salvo `keepAlive`), corre la transición, restaura el foco. Captura el fallo de `load()` → aviso y vuelta al hub.
- **`screens/lifecycle.js`** — `createScope()`: todo listener de `window`/`document`, timer, rAF y suscripción de una pantalla pasa por aquí y se libera en `destroy`. Es lo que hace cumplir AC5 por construcción.
- **`screens/routes.js`** — tabla declarativa de rutas con `import()` por pantalla (cada pantalla es un chunk propio → el chunk de entrada adelgaza al migrar).
- **`screens/components.js` + `screens/screens.css`** — piezas comunes en HTML string + enlazadores mínimos. Sin estado global.
- **`screens/texts/*.js`** — diccionario por pantalla (`common.js`, `hub.js`, `tables.js`…) con `t(key, vars)`. Un archivo por pantalla para que las tareas de F4 no compartan archivo.
- **`screens/*Rules.js`** — lógica pura de badges, anillo de nivel, orden de logros, última mesa, transición. Se prueban en Node.
- **`screens/shared.js`** — utilidades hoy sueltas en `main.js` (`h`, `esc`, `fmt`, `coin`, `ball`, `avatarHtml`, `avatarFace`).
- **`ui/notifier.js`** — el sondeo de avisos (hoy `startNotifier`) con `start/stop` y `subscribe(counts)` para los badges. **`match/partyWatch.js`** — el sondeo del grupo (hoy dentro de `partyPanel`) con ciclo de vida.
- **`game/render/hubScene.js` + `hubAmbient.js` + `hubSceneRules.js`** — escena 3D aislada del hub. No conoce el router ni el DOM de la UI: recibe un contenedor y órdenes `pause/resume`.
- **`public/splash.js`** (externo al bundle) — splash autónomo: progreso, TIP, parallax, error/Reintentar. Habla con el bundle solo por `window.gcbSplash`.
- **`ui/splashBridge.js`** — adaptador fino del bundle hacia `window.gcbSplash` (no-op si el splash no existe: `?skinlab=1`, fallo de carga del script).
- **Legado en `main.js`** — `playScreen`, `startMatch`, `startTournament`, sala y partida en vivo, overlays de partida. Quedan fuera de la migración (spec §Non-goals); solo su entrada y salida pasan por el router.

**La decisión que más pesa:** **router de pila con pantallas como módulos `mount(ctx) → { destroy }` cargados por `import()`, y todo efecto secundario canalizado por un `scope` inyectado.** Defensa frente a §1: las fugas actuales son listeners/timers de `window`/`document` sin dueño; con el `scope` cada uno tiene dueño y se libera al desmontar, y la prueba de limpieza (AC5) mide un solo punto. El `import()` por pantalla hace que la migración **reste** peso al chunk de entrada, que es la única forma realista de meter router + componentes + hub y seguir dentro de +15 KB gzip (AC34).

Alternativa descartada: **pantallas apiladas y vivas en el DOM** (todas montadas, la de abajo `hidden`+`inert`). Vuelta atrás instantánea y estado conservado, pero los sondeos y timers de las tapadas siguen vivos salvo disciplina perfecta de `onCover`, y el DOM crece. Recomendación: **destruir al tapar y remontar al destapar**, con el estado que importa (pestaña de ranking, filtros de skins, pestaña de cuenta) en `params` de la ruta o en memoria del módulo, como hoy (`rankingTab`, `accountTab`). Única excepción: el **hub** es `keepAlive` (su escena 3D es cara de crear) y se pausa en `onCover`.

Segunda decisión: **splash como script clásico en `public/`**, no como módulo de Vite. Vite agrupa todos los `<script type="module">` de `index.html` en el mismo chunk de entrada, así que el splash no podría pintarse antes del bundle (AC25). Un script clásico en `public/` se sirve tal cual (`script-src 'self'` lo permite), se ejecuta antes que los módulos diferidos y no se hashea (Vercel sirve `public/` con `must-revalidate`).

## 3. Interfaces & contracts

### 3.1 Router (`src/screens/router.js`)
```text
Route = {
  id: 'hub'|'tables'|'achievements'|'friends'|'ranking'|'skins'|'skin'|'account'|'settings'|'maps'|'play'|'lobby',
  hash: string,            // '#/', '#/mesas', '#/logros', '#/amigos', '#/ranking', '#/skins', '#/skins/:id',
                           // '#/cuenta/:tab?' (tab: perfil|progreso|monedero), '#/ajustes', '#/mapas', '#/jugar'
  parent?: id,             // para reconstruir la pila en entrada directa (skin → skins → hub)
  restorable: boolean,     // false en 'play': una recarga en #/jugar lleva al hub
  keepAlive?: boolean,     // true solo en 'hub'
  load: () => Promise<ScreenModule>,
}

createRouter({ routes, root = 'hub', win = window, isBusy = () => false }) -> Router
  router.start() -> { top, testHole }    // lee location.hash UNA vez
  router.push(id, params = {}) -> boolean   // false si ignora (misma cima, transición en curso, ruta desconocida)
  router.replace(id, params = {})
  router.back() -> 'popped' | 'guarded' | 'root'   // Esc, botón volver, atrás del sistema/navegador
  router.reset(id = root)                // vuelve a la raíz (fin de partida); deja una sola entrada de historial
  router.setBackGuard(fn | null)         // fn() -> boolean; true = consumido (pausa en partida, confirmación en vivo)
  router.top -> { id, params }; router.stack -> readonly [{ id, params }]
  router.subscribe(fn({ top, prev, action: 'push'|'pop'|'replace'|'reset'|'start' })) -> unsubscribe
  router.dispose()                       // quita popstate

parseHash(hash, routes) -> { id, params } | null     // puro
formatHash(id, params, routes) -> string             // puro
parseTestHash(hash) -> { hole: number, tie: boolean } | null   // '#hoyo3' → {hole:3,tie:false}; '#hoyo3-empate' → tie:true
```
Garantías:
- **Historial = pila.** Cada `push` hace `history.pushState({ gcb: depth })` con su hash; `back()` en profundidad > 0 hace `history.back()` y el `popstate` resultante hace el pop (una sola fuente de verdad). Un `popstate` sin `push` previo (atrás del sistema) también hace pop.
- **Atrás en el hub no hace nada (C12):** en la raíz hay una entrada centinela; un `popstate` en la raíz re-empuja el centinela y devuelve `'root'` sin cambiar de pantalla.
- **Entrada directa (AC4):** `start()` con `#/ranking` construye `[hub, ranking]` (padres incluidos) y deja el historial con la misma profundidad; atrás lleva al hub. Ruta no `restorable` o desconocida → hub.
- **`#hoyoN` (AC8):** `start()` captura `parseTestHash(location.hash)` en `testHole` y **no** reescribe el hash hasta el primer `push`. La práctica lee `ctx.testHole`, no `location.hash` (hoy `startMatch` lee `location.hash`, que el router cambiaría).
- **Doble toque (spec §Edge):** `push` devuelve `false` si la cima ya es esa ruta con esos `params` o si `isBusy()` (transición en curso).
- **Back guard:** si hay guard, `back()` lo llama primero; si devuelve `true`, no hay pop y el historial se re-arma (el jugador sigue en la partida con la pausa abierta).
- Nunca lanza por un hash raro: lo normaliza al hub.

### 3.2 Ciclo de vida de pantalla
```text
ScreenModule = { mount(root: HTMLElement, ctx: Ctx, params: object) -> Screen | Promise<Screen> }
Screen = {
  destroy(): void,              // obligatorio; tras él, ctx.scope.live() === { listeners: 0, timers: 0 }
  onCover?(): void,             // solo keepAlive (hub): pausa escena y sondeos
  onUncover?(from: id): void,   // solo keepAlive: reanuda; enfoca el icono de `from`
  title?: string,               // para document.title y aria
}
```
- `host.js` crea un `scope` nuevo por montaje y lo destruye **después** de `destroy()` (red de seguridad: si la pantalla olvida algo, el scope lo quita igual).
- Foco: el host guarda el `data-focus-key` del elemento activo al hacer `push`; al volver, enfoca `[data-focus-key="<clave>"]` en la pantalla destapada (AC2) o su `h1`.
- Error de `load()`/`mount()`: `notify({ kind: 'info', title: t('common.screenError') })` y `router.reset('hub')` (spec §Error paths).
- Transición: `transitionFor({ reduced }) -> { ms: 200, kind: 'slide' } | { ms: 80, kind: 'fade' }` (puro, en `transitionRules.js`). Con `ms` cumplido, `isBusy()` vuelve a `false`.

### 3.3 Scope (`src/screens/lifecycle.js`)
```text
createScope({ win = window, doc = document, timers = globalThis }) -> Scope
  scope.on(target, type, fn, opts?) -> off()
  scope.timeout(fn, ms) -> cancel(); scope.interval(fn, ms) -> cancel(); scope.raf(fn) -> cancel()
  scope.sub(unsubscribe: () => void)    // p. ej. wallet.subscribe, router.subscribe, notifier.subscribe
  scope.child() -> Scope                // para pestañas y paneles internos
  scope.dispose()                       // idempotente
  scope.live() -> { listeners: number, timers: number, subs: number }
```

### 3.4 Contexto inyectado (AC5: nada por globales)
```text
Ctx = {
  backend, wallet, progress, avatar, settings,          // los de hoy, creados en el arranque
  router, scope, notifier, partyWatch,                  // partyWatch: fábrica, cada pantalla crea el suyo con su scope
  sfx, notify, icon, t,                                  // audio.js, notifyPopup.js, icons.js, diccionario
  quality: () => 'low'|'medium'|'high', reducedMotion: () => boolean,
  testHole: { hole, tie } | null,
  actions: {                                             // puente al legado de main.js (partida)
    startMatch(tier), startPractice(), playFreePlay(index|'tiebreak'),
    claimRewards(), toggleFullscreen(), toggleMute(),
  },
  hubScene: HubScene | null,                             // la creada durante el splash (solo la usa hub.js)
}
```
`createContext(deps) -> Ctx` vive en `src/screens/context.js`; `main.js` lo crea una vez tras `createBackend()`. En Node, los tests pasan dobles de cada campo.

### 3.5 Componentes comunes (`src/screens/components.js`)
```text
header({ title, back = true, balanceHtml = null, actionsHtml = '' }) -> string   // <header class="scr-head"> con botón volver ≥44 px, h1, saldo opcional
card({ cls, body }) -> string;  button({ label, kind: 'primary'|'secondary'|'ghost', attrs }) -> string
badge({ count, label }) -> string        // punto rojo + <span class="sr-only">N novedades</span>; '' si count = 0
listState(el, { state: 'loading'|'empty'|'error'|'ready', emptyText, errorText, onRetry, scope }) -> void   // «Reintentar» con onRetry
bindHeader(root, ctx)                    // conecta volver → ctx.router.back()
```
Garantías: todo control con clase de tamaño mínimo 44×44 px; el badge siempre tiene texto accesible; ningún texto literal (todo por `t`).

### 3.6 Diccionario (`src/screens/texts/`)
```text
t(key: 'ns.key', vars?: object) -> string   // 'hub.badge' + {n:2} → '2 novedades'; clave inexistente → lanza en test, devuelve la clave en producción
register(ns, dict)                          // cada archivo texts/<ns>.js se registra al importarse
```

### 3.7 Reglas puras
```text
// screens/hubRules.js
levelRing(level: {level, into, need}) -> { level, pct: 0..100, label: 'Nivel 7, 40 % al siguiente' }
friendsBadge(friendsData, partyData) -> { count, label }      // incoming + invites; label '' si 0
achievementsBadge(states: {id, done}[], seen: Set<id>) -> { count, label }
lastTier(storage, tiers) -> tierId | null; rememberTier(storage, tierId)   // clave 'gcb.lastTier.v1'; tier inexistente → null
// screens/achievementsRules.js
orderAchievements(challenges, stateOf) -> { pending: [...], done: [...] }  // pendientes por % desc, luego id; completados después
markSeen(storage, userId, doneIds); seenSet(storage, userId) -> Set        // clave 'gcb.achievements.seen.v1:<userId>'
// screens/transitionRules.js
transitionFor({ reduced }) -> { ms, kind }
// game/render/hubSceneRules.js
orbitAngle(tSeconds, periodS = 90) -> radians            // 360° por periodo, continuo
ambientPlan(rng, quality, reduced) -> { nextInMs, kind: 'particles'|'butterfly'|'ballIn' } | null   // null con reduced
scenePreset(quality) -> { pixelRatio, particles, trees, minGapMs }   // deriva de qualityPreset(); low < medium < high
shouldRender({ covered, hidden }) -> boolean            // false si tapada u oculta
```

### 3.8 Notifier y grupo
```text
// ui/notifier.js
createNotifier({ account, parties, timers, isHidden, onNotice }) -> { start(), stop(), subscribe(fn(counts)) -> off, counts }
  counts = { friendRequests, partyInvites }           // lo usa friendsBadge
// match/partyWatch.js
createPartyWatch({ parties, tournaments, tiers, timers, storage }) -> { start(), stop(), state, subscribe(fn(state)) -> off,
                                                                        apply(job, okMsg), pickTier(tier), onNewMatch(fn(match)) }
```
Mismo intervalo que hoy (`NOTIFY_POLL_MS` 5 s, `PARTY_POLL_MS` 3 s). `stop()` deja 0 timers.

### 3.9 Escena del hub (`src/game/render/hubScene.js`)
```text
createHubScene(container, { quality, reducedMotion, rng = Math.random }) -> Promise<HubScene>   // rechaza si no hay WebGL
HubScene = {
  firstFrame: Promise<void>,
  pause(), resume(), setQuality(q), resize(), dispose(),
  attach(container),                 // mover el canvas del contenedor de precarga al del hub
  stats: { renderCalls: number, fps(): number },
  renderLayer?(name: 'sky'|'forest'|'green') // solo en la página de captura
}
```
Contenido (C7, C8): cielo de `meadowDay`, suelo de pradera, green circular con collar, copa y bandera en el centro, anillo de bosque con `makeLushTree/Bush/Rock`, montañas con `lushMountains`; cámara orbitando 360° (`orbitAngle`); `hubAmbient.js` lanza al azar partículas (`AdditiveParticles`), mariposa (quad con aleteo) y bola que rueda y entra. Con `reducedMotion`: cámara quieta, sin apariciones. `pause()` hace `setAnimationLoop(null)` (0 render calls). `ResolutionGovernor` como en `GolfGame`.

### 3.10 Splash (`public/splash.js` + `#splash` en `index.html`)
```text
window.gcbSplash = { mark(name), done(), fail(reason), hideNow() }
window.__gcbSplashCore = createSplashCore({ now, weights, minMs = 600, maxMs = 15000 })   // núcleo puro para tests (vm)
  core.mark(name) -> pct            // monotónico; nunca baja; < 100 hasta 'hub'
  core.state(now) -> 'loading'|'ready'|'error'
  core.canHide(now) -> boolean      // 'hub' marcado Y ≥ minMs desde el inicio
  core.tipAt(now, tips, everyMs = 4000) -> index
  core.layersFor(quality, reduced) -> number   // high/medium 3, low 2, reduced 3 estáticas
pesos: html 5 · bundle 20 · session 20 · progress 15 · three 20 · scene 15 · hub 5  (suma 100)
```
- `maxMs` configurable con `data-max-ms` en `#splash` (15 000 por defecto, suposición de la spec). Superado sin `session` → estado error con mensaje y «Reintentar» (`location.reload()`). La barra no avanza sin hito.
- **Fallo de Three/escena no es error del splash:** si `three` o `scene` no llegan en 8 s tras `session`, el bridge marca `scene` como «omitida», el hub usa la imagen fija (spec §Edge «Sin WebGL») y el splash termina. Solo backend/sesión pueden bloquear con «Reintentar».
- Calidad: lee `localStorage['gcb.settings.v1'].quality[<kind>]`; si no hay, la misma heurística que `defaultQuality()` (prueba de paridad en T019).
- Parallax: 3 capas WebP (`public/splash/sky.webp`, `forest.webp`, `green.webp`) + capa CSS de pelota con estela de fuego; dedo/ratón (`pointermove`), giroscopio (`deviceorientation`, sin pedir permiso: en iOS no llega y se usa deriva), deriva automática sin input. Destello del logo: 1 pulso cada ≥0,5 s (≤2 Hz). TIP rotatorio cada 4 s.
- Peso: imágenes + `<style>` del splash + `splash.js` < 150 KB (AC29); el logo reutiliza `/logo-header.png` y no cuenta.

## 4. Data model & flow
- **Arranque:** HTML pinta `#splash` (AC25) → `splash.js` marca `html` → el bundle ejecuta y marca `bundle` → `createBackend()`; sin sesión → `mountAuth` y `gcbSplash.done()` (el login de siempre); con sesión → `session` → `progress.attach` + `wallet.getBalance()` → `progress` → `import('hubScene.js')` (three) → `three` → `createHubScene(precarga)` + `firstFrame` → `scene` → `router.start()` monta el hub (+ pantalla pedida si hay hash) → `hub` → splash se funde (≥600 ms, AC27).
- **Navegación:** toque → `router.push` → `history.pushState` → `subscribe` → `host` desmonta/monta con transición → foco. Atrás (sistema/navegador/Esc/cabecera) → `router.back()` → guard? → `history.back()` → `popstate` → pop.
- **Badges (AC11):** `notifier` (5 s, solo con pestaña visible) → `counts` → `friendsBadge` → punto en Amigos. Logros: `progress.challenge(id)` de cada `CHALLENGES` + `seenSet(localStorage)` → `achievementsBadge`. Abrir Logros llama `markSeen`.
- **Grupo:** `partyWatch` vive solo mientras Mesas o Amigos están montadas (scope). Si el grupo entra en un torneo (`newPartyMatch`), `onNewMatch` → `actions.enterLive(match)` (legado), como hoy.
- **Última mesa (AC10):** `rememberTier` al confirmar `startMatch(tier)`; Mesas destaca `lastTier()`; sin dato, ninguna.
- **Saldo:** solo en Mesas (cabecera) y Cuenta › Monedero, vía `wallet.getBalance()` y `wallet.subscribe` (en el scope). Nunca en `localStorage`.
- **Partida:** `push('play')` con back guard (pausa / confirmación en vivo); al terminar o salir → `router.reset('hub')` → `claimRewards()` en el `mount`/`onUncover` del hub (AC17).
- **Almacenamiento nuevo, todo local y no sensible:** `gcb.lastTier.v1`, `gcb.achievements.seen.v1:<userId>`, y en F5 `gcb.whatsnew.dismissed.v1`. Siempre con `try/catch`.

## 5. Testing strategy

| Criterio | Nivel | Qué afirma | Qué simula |
|---|---|---|---|
| AC1-AC3 | Unidad (`tests/router.test.js`) + navegador | push cambia hash; back y Esc hacen pop; foco al icono | `win` falso (history, location, popstate) |
| AC4 | Unidad + navegador | `start('#/ranking')` → `[hub, ranking]`; no restorable → hub; sin sesión: login y luego la pantalla (el hash sobrevive a `location.replace`) | `win` falso |
| AC5 | Unidad (`tests/lifecycle.test.js`, `tests/screen-<id>.test.js`) | 20 × mount/destroy de cada pantalla deja `scope.live()` a 0 y el `win`/`doc` falso sin listeners | `tests/helpers/fakeEnv.js`: window/document/timers contadores + elementos stub |
| AC6-AC7 | Unidad (`transitionRules`) + navegador | 200 ms normal; ≤80 ms con reduced | `reduced` por parámetro |
| AC8 | Unidad (`parseTestHash`) + navegador | `#hoyo3` → Práctica en el hoyo 3; `-empate` fuerza desempate | — |
| AC9, AC10c, AC22, AC24 | Navegador (árbol de accesibilidad) | composición C10, nombres accesibles, sin hover | — |
| AC10, AC10b | Unidad (`lastTier`) + navegador | 2 toques a partida; última mesa destacada | storage falso |
| AC11 | Unidad (`hubRules`) | badge con `count` y texto «N novedades»; 0 → sin punto | datos de friends/party |
| AC12 | Grep en done-check | sin `DIAMOND VIP`, sin «desafío», sin datos demo en `src/screens` | — |
| AC13 | Navegador | `__gcbHub.stats.renderCalls` no cambia en 1 s con pantalla encima o pestaña oculta; three pedido durante el splash | — |
| AC14 | Navegador (medición) | media ≥55 FPS 10 s; low reduce resolución/partículas (`scenePreset`) | CPU ×4 si el pane lo permite; si no, «no ejecutado» |
| AC15-AC18 | Navegador por pantalla + unidad de reglas | cabecera; estados cargando/vacío/error con Reintentar; paridad funcional | backend en modo `local` para error/vacío |
| AC17b | Unidad (`achievementsRules`) + navegador a 360 px | pendientes primero; 2 columnas | — |
| AC19-AC21 | Navegador | 44×44 (script de medida en consola), safe-area simulada, recorrido con Tab | — |
| AC23 | Unidad (`tests/screen-strings.test.js`) | ningún literal en español fuera de `src/screens/texts/` | lee los fuentes |
| AC25-AC33 | Unidad (`tests/splash.test.js` con `node:vm`) + navegador | núcleo monotónico, 600 ms, error a `maxMs`, TIP, capas por calidad, ≤3 Hz | `now` falso, `window` falso |
| AC29 | Unidad (`tests/splash-weight.test.js`) | suma de bytes < 150 KB, imágenes `.webp` | fs |
| AC34 | Script (`scripts/initial-load-size.mjs`) | entrada + imports estáticos gzip ≤ base + 15 KB | `dist/` |
| AC35 | `pnpm test` | todo verde | — |
| AC36 | `git diff 3d12edf -- vercel.json` vacío | CSP igual | — |
| AC37-AC39 | Unidad (`whatsNewRules`, `versionRules`) + navegador + validación del manifest | modal una vez por versión; aviso al cambiar `version.json`; manifest completo | `fetch` falso |

Snippet de FPS (idéntico en línea base y final, se pega en la consola del pane):
```js
await new Promise((ok) => { let n = 0; const t0 = performance.now(); const f = (t) => { n++; t - t0 < 10000 ? requestAnimationFrame(f) : ok(n / ((t - t0) / 1000)); }; requestAnimationFrame(f); })
```
Lo que no se prueba aquí: móvil físico (Q2.5), giroscopio real, safe-area real de iPhone. Quedan como pendientes humanos en el informe de verificación.

## 6. Sequencing & dependencies
Fases entregables; al final de cada una el juego funciona y se verifica (tarea de verificación de fase).

1. **F0 — Línea base** (T001). Antes de tocar código.
2. **F1 — Cimientos** (T002-T012). Router puro, textos, reglas, scope, notifier/partyWatch, extracción de utilidades, componentes, enmienda U6.6; luego el cableado en `main.js` con adaptadores de legado (el lobby actual es la raíz, sin cambio visual) y el arreglo de fugas. Paralelo: T002-T008 (archivos disjuntos). Secuencial: T009 → T010 → T011 → T012.
3. **F2 — Escena y splash** (T013-T022). Reglas de escena → escena base (+ página de laboratorio) → en paralelo apariciones (T015) y captura de capas (T016) → boceto del splash (T017) → **PARADA HUMANA** (T018) → núcleo del splash (T019) → visual del splash (T020) → puente en `main.js` (T021) → verificación (T022). Al final de F2 el lobby actual sigue siendo la raíz; three se precarga durante el splash.
4. **F3 — Hub** (T023-T027). Boceto del hub y de la pantalla tipo (T023, puede adelantarse en paralelo a T017-T021) → **PARADA HUMANA** (T024) → hub sin escena (T025) → escena + badges + pausa (T026) → verificación (T027). El lobby pasa a ser la ruta `tables` (legado) bajo JUGAR.
5. **F4 — Migración** (T028-T040). Una pantalla por tarea, sacando su código de `main.js`. Secuenciales por `main.js`, salvo T029 (Logros, nueva) y T036 (Progreso, nueva) que son [P].
6. **F5 — Extras opcionales** (T041-T043). `version.json` y aviso → modal de novedades; manifest en paralelo.
7. **Cierre** (T044).

## 7. Risks & open decisions
Ordenados por daño:
1. **FPS del hub 3D en móvil de gama media/baja (P7.1, AC14).** Disparador: bosque + sombras + orbitado continuo en un Android de 2024. Impacto: hub a <55 FPS y batería. Mitigación: `scenePreset` por calidad (low sin sombras, pixelRatio 1, menos árboles fusionados con `batch.js`), `ResolutionGovernor`, pausa al tapar/ocultar, imagen fija si no hay WebGL. Se mide **en T014**, antes de construir nada encima; si no llega, se para y se decide con el humano.
2. **Carga inicial y red móvil (AC26, AC28, AC34).** Disparador: three (~150 KB gzip) se descarga durante el splash; en 3G el splash tarda. Impacto: más espera o error falso. Mitigación: la escena es opcional para terminar el splash (8 s de margen y luego imagen fija); solo backend/sesión pueden dar «Reintentar»; las pantallas van en chunks propios y el chunk de entrada adelgaza al migrar. Se mide en T012, T022, T027, T040 y T044.
3. **Regresiones al sacar código de `main.js`** (partida en vivo y abandono, grupo → torneo automático, `skinReveal`, `#hoyoN`, `?skinlab=1`, Esc en partida). Mitigación: adaptadores de legado primero (F1) y migración de una pantalla por tarea con la lista de comportamientos de §0 en el done-check; `playScreen` y el bloque en vivo no se migran.
4. **Semántica de atrás entre navegadores** (gesto de iOS Safari, atrás de Android, bfcache, centinela de C12). Mitigación: router puro con `win` falso y casos de pila vacía/centinela/guard; prueba en el pane; Q2.5 en dispositivo real como pendiente humano.
5. **Presupuesto de revisión por movimientos de código.** Las tareas de Cuenta y Skins mueven cientos de líneas: el diff supera 400 aunque el cambio real sea pequeño. Mitigación: Cuenta en tres tareas (T034-T036), Skins en dos (T032-T033); revisión con `--color-moved`.
6. Menores: `splash.js` en `public/` sin hash (Vercel revalida); duplicación de la heurística de calidad en el splash (prueba de paridad); doble sondeo de `parties.mine()` (notifier 5 s + partyWatch 3 s, igual que hoy).

Decisiones abiertas (se registran en `decisions.md`):
- a) **Saldo en la cabecera de Ranking.** AC1 lo pide; C11 (que manda) dice «mesas y Cuenta». El plan sigue C11; el humano confirma o enmienda AC1.
- b) **Amigos fuera de Cuenta › Perfil.** Hoy los amigos están en Perfil; la spec los pone en «Amigos y grupo». El plan los mueve y deja en Perfil un acceso «Amigos» (sin duplicar la lista).
- c) **`#hoyoN` «como hoy»** significa: el hash prepara la práctica y se juega al pulsar Práctica (hoy no arranca sola). El plan conserva eso.
- d) Ruta del laboratorio de escena: `scripts/hub-scene-lab.html` (solo dev, como `course-preview-capture.html`; no entra en el build).

Rollback: cada fase es una serie de commits sin base de datos ni física; revertir los commits de la fase devuelve la anterior. Hasta F4 el legado sigue en `main.js`.

## Revisions
- 2026-11-12 — Primera versión, derivada de la spec aprobada (C1-C13).

## Tasks
<!-- generated by tasks on 2026-11-12; IDs are stable, do not renumber -->

Criterios: `AC<n>` = criterio n de *Acceptance criteria* de la spec (AC10b, AC10c, AC17b tal cual). `S§<sección>` = requisito del cuerpo de la spec sin número. Riesgo: `rsc risk` sobre las rutas previstas da **tier 1** (un revisor) a todo lo que toca `src/`, `public/`, `scripts/`, `index.html` y bocetos, y **tier 0** a `02-DOCS/wiki/**`. Los gates humanos no tienen tier.

Cada fila es autocontenida para un ejecutor de contexto limpio: lee §0 (restricciones globales), la fila y su bloque *Interfaces* si lo hay. Done-check en una línea: comandos desde la raíz del worktree.

| ID | Fase | [P] | Task | Criterio(s) | Archivos | Done-check | Depende de | Tier |
|---|---|---|---|---|---|---|---|---|
| T001 | F0 |  | Medir la línea base de build y FPS del lobby actual sin tocar código de producto | AC14, AC34, P7.5 | `scripts/initial-load-size.mjs` (nuevo), `02-DOCS/wiki/sdd/verifications/ui-pantallas-<fecha>.md` (nuevo, sección «Línea base») | `pnpm run build` en verde; `node scripts/initial-load-size.mjs` imprime JSON `{entry:{raw,gzip},initial:{raw,gzip},initialHasThree:false,chunks:[...]}` (inicial = `<script type="module">` + `<link rel="modulepreload">` de `dist/index.html`, gzip con `zlib.gzipSync` nivel 9; `initialHasThree` busca `WebGLRenderer` en esos chunks); el informe recoge esas cifras, el FPS del lobby (snippet de §5, 375×812, 10 s, con y sin CPU ×4 o «no ejecutado») y `git diff --stat 3d12edf -- src` vacío | — | 1 |
| T002 | F1 | [P] | Implementar el router de pila puro con test primero | AC1, AC2, AC3, AC4, AC8, S§Edge (doble toque, atrás en hub) | `src/screens/router.js`, `tests/router.test.js` | `node --test tests/router.test.js` en verde (escrito antes en rojo): push/pop/replace/reset, hash ↔ ruta, entrada directa con padres, centinela en raíz, back guard, doble push ignorado, `parseTestHash('#hoyo3-empate')`; `grep -c "document\." src/screens/router.js` = 0 | — | 1 |
| T003 | F1 | [P] | Crear el diccionario de textos y la prueba de cadenas fuera del diccionario | AC23, K3.3 | `src/screens/texts/index.js`, `src/screens/texts/common.js`, `tests/texts.test.js`, `tests/screen-strings.test.js` | `node --test tests/texts.test.js tests/screen-strings.test.js` en verde; la prueba de cadenas falla con un archivo temporal `src/screens/_tmp.js` que contenga `'Hola mundo'` (comprobado y borrado) | — | 1 |
| T004 | F1 | [P] | Implementar las reglas puras del hub, logros y transición con test primero | AC6, AC7, AC10, AC11, AC17b | `src/screens/hubRules.js`, `src/screens/achievementsRules.js`, `src/screens/transitionRules.js`, `tests/hub-rules.test.js`, `tests/achievements-rules.test.js` | `node --test tests/hub-rules.test.js tests/achievements-rules.test.js` en verde; `grep -lE "from 'three'\|document\." src/screens/*Rules.js` vacío | — | 1 |
| T005 | F1 | [P] | Implementar el scope de ciclo de vida y el entorno falso para la prueba de limpieza | AC5 | `src/screens/lifecycle.js`, `tests/helpers/fakeEnv.js`, `tests/lifecycle.test.js` | `node --test tests/lifecycle.test.js` en verde: 20 ciclos con listeners de window/document, timeouts, intervals, rAF y subs dejan `live()` en 0 y el fake sin listeners; `dispose()` idempotente | — | 1 |
| T006 | F1 | [P] | Extraer el notificador y el sondeo del grupo a módulos con start/stop | AC5, AC11, S§Problem (fugas) | `src/ui/notifier.js`, `src/match/partyWatch.js`, `tests/notifier.test.js`, `tests/party-watch.test.js` | `node --test tests/notifier.test.js tests/party-watch.test.js tests/notify.test.js tests/party.test.js` en verde; tras `stop()` los timers falsos vivos = 0; `counts` refleja incoming + invites | — | 1 |
| T007 | F1 | [P] | Mover utilidades de pintado de `main.js` a `src/screens/shared.js` sin cambiar comportamiento | S§Problem, K3.4 | `src/screens/shared.js`, `src/main.js` | `pnpm test` y `pnpm run build` en verde; `grep -cE "^const (h\|esc\|fmt\|coin\|ball\|avatarHtml\|avatarFace) =" src/main.js` = 0; navegador: lobby, skins y cuenta idénticos a 375×812 y 1280×800, consola sin errores | — | 1 |
| T008 | F1 | [P] | Anotar la excepción U6.6 (silencio fuera del hub) en la tabla de enmiendas | C11, D8.2 | `02-DOCS/wiki/sdd/constitution.md` | La tabla *Amendment log* tiene una fila 2026-11-12 con versión 1.1.1, cambio «Excepción a U6.6 en el hub», motivo C11 y responsable Chakets; `version:` del frontmatter = 1.1.1; nada más cambia (`git diff --stat` = 1 archivo) | — | 0 |
| T009 | F1 |  | Crear los componentes comunes y su CSS | AC15, AC19, AC20, AC21, AC22 | `src/screens/components.js`, `src/screens/screens.css`, `src/screens/texts/common.js`, `tests/components.test.js` | `node --test tests/components.test.js` en verde (badge con `sr-only` y vacío con 0; `listState` pinta los 4 estados y «Reintentar» llama a `onRetry`; cabecera con botón volver con `aria-label`); `pnpm run build` en verde | T003 | 1 |
| T010 | F1 |  | Cablear el router en `main.js` con adaptadores de legado (lobby como raíz) | AC1, AC2, AC3, AC4, AC8, AC21 | `src/screens/routes.js`, `src/screens/host.js`, `src/screens/context.js`, `src/main.js` | `pnpm test` y `pnpm run build` en verde; navegador: ir a Ranking cambia la URL a `#/ranking`, atrás del navegador y Esc vuelven al lobby sin recargar, atrás en el lobby no sale; recargar en `#/ranking` deja Ranking con lobby debajo; atajos 1-6 y M siguen; aspecto del lobby igual (captura `T010-lobby-375x812.png`) | T002, T005, T007 | 1 |
| T011 | F1 |  | Poner back guard en partida y en vivo y cerrar las fugas de `main.js` | AC5, AC8, S§Edge (atrás en partida, partida en vivo), S§Problem | `src/main.js`, `src/screens/context.js` | `pnpm test` y `pnpm run build` en verde; `grep -c "setTimeout(poll" src/main.js` = 0, `grep -c "function startNotifier" src/main.js` = 0, `grep -c "addEventListener('fullscreenchange'" src/main.js` = 0; navegador: en juego libre jugar 3 hoyos y `getEventListeners(window).keydown.length` (consola) no crece; atrás en partida abre la pausa; en `#hoyo3` → Práctica arranca el hoyo 3 y `#hoyo3-empate` fuerza desempate; salir de una mesa en vivo pide confirmación | T010, T006 | 1 |
| T012 | F1 |  | Verificar la fase 1 | AC1-AC5, AC8, AC34, AC35 | `02-DOCS/wiki/sdd/verifications/ui-pantallas-<fecha>.md` | `pnpm test` y `pnpm run build` en verde; `node scripts/initial-load-size.mjs` anotado con delta vs T001; capturas `T012-lobby-{375x812,360x640,1280x800}.png`; consola sin errores; `?skinlab=1` abre el laboratorio | T001-T011 | 0 |
| T013 | F2 | [P] | Implementar las reglas puras de la escena del hub con test primero | AC13, AC14, S§Edge (calidad baja, reduced-motion) | `src/game/render/hubSceneRules.js`, `tests/hub-scene-rules.test.js` | `node --test tests/hub-scene-rules.test.js` en verde: `orbitAngle` continuo y 2π por periodo; `ambientPlan` = null con reduced; `scenePreset('low')` < medium < high en partículas y árboles; `shouldRender` false si tapada u oculta; `grep -c "from 'three'" src/game/render/hubSceneRules.js` = 0 | — | 1 |
| T014 | F2 |  | Construir la escena base del hub (green, copa, bandera, bosque de día, órbita, pausa, calidad) y su página de laboratorio | AC13, AC14, C7, C8 | `src/game/render/hubScene.js`, `scripts/hub-scene-lab.html`, `scripts/hub-scene-lab.js` | `pnpm run build` en verde y `node scripts/initial-load-size.mjs` da `initialHasThree: false`; navegador en `/scripts/hub-scene-lab.html`: escena orbitando, `lab.scene.pause()` y 1 s después `stats.renderCalls` sin cambio; FPS (snippet §5) a 375×812 en low/medium/high anotado en el informe; `?nowebgl=1` rechaza la promesa; capturas `T014-escena-{375x812,1280x800}.png` | T013 | 1 |
| T015 | F2 | [P] | Añadir las apariciones aleatorias (partículas, mariposa, bola que entra) | C7, AC14, S§Edge (reduced-motion, calidad baja) | `src/game/render/hubAmbient.js`, `src/game/render/hubScene.js`, `tests/hub-scene-rules.test.js` | `node --test tests/hub-scene-rules.test.js` en verde; navegador en el laboratorio con `?seed=1`: aparecen los 3 tipos en 90 s; con reduced-motion emulado ninguno; FPS no baja >3 respecto a T014 (anotado) | T014 | 1 |
| T016 | F2 | [P] | Capturar las capas WebP del splash y la imagen fija del hub desde la escena | AC29, C8, S§Edge (sin WebGL) | `scripts/capture-splash-layers.mjs`, `package.json` (script `splash:capture`), `public/splash/sky.webp`, `public/splash/forest.webp`, `public/splash/green.webp`, `public/splash/hub-fallback.webp` | `pnpm splash:capture` termina con código 0 y escribe los 4 archivos; `node -e "const fs=require('fs');const s=['sky','forest','green'].reduce((a,n)=>a+fs.statSync('public/splash/'+n+'.webp').size,0);if(s>110*1024)process.exit(1)"` sale 0; capas con transparencia (forest, green) | T014 | 1 |
| T017 | F2 |  | Hacer el boceto HTML estático del splash a 375×812 y 1280×800 | S§What result they get (3), C13 | `02-DOCS/attachments/ui-pantallas/splash-boceto.html`, `02-DOCS/attachments/ui-pantallas/splash-boceto-{375x812,1280x800,reduced-375x812}.png` | El HTML abre sin servidor y sin errores de consola; muestra logo, pelota con estela, 3 capas, barra con %, TIP y estado «Reintentar»; capturas guardadas en las dos medidas y el fotograma reduced-motion | T016 | 1 |
| T018 | F2 |  | GATE humano: aprobar el boceto del splash | C13 | — | El humano escribe la aprobación (o los cambios) en chat; se anota en `02-DOCS/wiki/sdd/decisions.md` con fecha. Sin aprobación no empieza T019 | T017 | — |
| T019 | F2 |  | Implementar el núcleo del splash (hitos, 600 ms, máximo, TIP, calidad) con test primero | AC26, AC27, AC28, AC31, AC33 | `public/splash.js`, `tests/splash.test.js` | `node --test tests/splash.test.js` en verde (vm): % monotónico y <100 sin `hub`; `canHide` falso antes de 600 ms; error a `maxMs` sin `session`; TIP rota cada 4 s; `layersFor('low')` < `layersFor('high')`; paridad de la heurística con `defaultQuality()` de `quality.js` | T018 | 1 |
| T020 | F2 |  | Pintar el splash en `index.html` (HTML+CSS inline) y su capa visual en `splash.js` | AC25, AC29, AC30, AC31, AC32, AC33 | `index.html`, `public/splash.js`, `tests/splash-weight.test.js` | `node --test tests/splash-weight.test.js` en verde (<150 KB, solo `.webp`); `grep -c "<script>" index.html` = 0; navegador con red lenta: el splash se ve antes de que cargue `main-*.js`; ratón/dedo mueve 3 capas a velocidades distintas; sin input derivan; reduced-motion estático; capturas `T020-splash-{375x812,360x640,1280x800}.png` | T019, T016 | 1 |
| T021 | F2 |  | Conectar el arranque con el splash y precargar three y la escena | AC13, AC26, AC27, AC28, S§Edge (sin sesión, sin WebGL) | `src/ui/splashBridge.js`, `src/main.js`, `src/screens/context.js` | `pnpm test` y `pnpm run build` en verde; navegador: la barra pasa por los hitos (log `gcbSplash` en consola) y llega a 100 con el lobby listo; pestaña de red: el chunk de three se pide durante el splash; offline: «Reintentar» tras `maxMs`; sin sesión: splash → login; `?skinlab=1`: sin splash | T020, T014, T011 | 1 |
| T022 | F2 |  | Verificar la fase 2 | AC13, AC25-AC33, AC34, AC36 | `02-DOCS/wiki/sdd/verifications/ui-pantallas-<fecha>.md` | `pnpm test` y `pnpm run build` en verde; delta de `initial-load-size.mjs` anotado; `git diff 3d12edf -- vercel.json` vacío; capturas del splash en las 3 medidas y reduced; juego jugable de punta a punta (lobby → práctica → fin) | T012-T021 | 0 |
| T023 | F3 | [P] | Hacer el boceto HTML estático del hub y de la pantalla tipo | S§What result they get (1, 2), C10, C13 | `02-DOCS/attachments/ui-pantallas/hub-boceto.html`, `02-DOCS/attachments/ui-pantallas/pantalla-tipo-boceto.html`, `02-DOCS/attachments/ui-pantallas/{hub,pantalla-tipo}-boceto-{375x812,1280x800}.png` | Ambos HTML abren sin servidor y sin errores; el hub sigue C10 exacto (usuario+anillo · logo · Ajustes y pantalla completa / Ranking, Logros / Skins, Amigos / Mapas · JUGAR · Práctica) sobre `hub-fallback.webp`, sin saldo ni silencio; la pantalla tipo muestra cabecera y los estados cargando/vacío/error | T016, T009 | 1 |
| T024 | F3 |  | GATE humano: aprobar el boceto del hub y de la pantalla tipo | C13 | — | El humano aprueba en chat; se anota en `decisions.md` con fecha. Sin aprobación no empieza T025 | T023, T022 | — |
| T025 | F3 |  | Construir la pantalla hub (composición C10, navegación) y pasar el lobby a la ruta Mesas | AC9, AC10, AC10b, AC10c, AC12, AC19-AC22, AC24 | `src/screens/hub.js`, `src/screens/hub.css`, `src/screens/texts/hub.js`, `src/screens/routes.js`, `src/main.js`, `tests/screen-hub.test.js` | `node --test tests/screen-hub.test.js` en verde (20 mount/destroy sin fugas); `pnpm run build` en verde; navegador: hub según el boceto aprobado a 375×812, 360×640 y 1280×800 sin scroll horizontal; JUGAR → Mesas (lobby legado) → mesa = 2 toques; Práctica = 1 toque; Mapas abre juego libre; usuario abre Cuenta; Tab recorre todo con foco visible; capturas `T025-hub-*.png` | T024, T010, T009, T004 | 1 |
| T026 | F3 |  | Montar la escena 3D detrás del hub con pausa, imagen fija y badges reales | AC9, AC11, AC13, AC14, AC17, AC22 | `src/screens/hub.js`, `src/screens/hub.css`, `src/ui/splashBridge.js`, `src/screens/context.js` | `pnpm test` y `pnpm run build` en verde; navegador: con Ranking encima, `__gcbHub.stats.renderCalls` igual tras 1 s; pestaña oculta igual; sin WebGL (`?nowebgl=1`) sale `hub-fallback.webp`; solicitud de amistad pendiente → punto en Amigos con texto «1 novedad» en el árbol de accesibilidad; logro completado no visto → punto en Logros; skin por reclamar → `skinReveal` al volver al hub | T025, T015, T021 | 1 |
| T027 | F3 |  | Verificar la fase 3 | AC9-AC14, AC17, AC19-AC22, AC24, AC34 | `02-DOCS/wiki/sdd/verifications/ui-pantallas-<fecha>.md` | FPS del hub (snippet §5) 10 s a 375×812, media ≥55 en escritorio y con CPU ×4 (o «no ejecutado»), junto a la línea base de T001; delta de `initial-load-size.mjs` anotado y `initialHasThree: false`; capturas del hub en las 3 medidas; `pnpm test` y `pnpm run build` en verde | T025, T026 | 0 |
| T028 | F4 |  | Migrar Mesas a `src/screens/tables.js` (saldo en cabecera, última mesa, grupo) | AC10, AC12, AC15, AC16, C3, C9, C11 | `src/screens/tables.js`, `src/screens/tables.css`, `src/screens/texts/tables.js`, `src/screens/routes.js`, `src/main.js`, `tests/screen-tables.test.js` | `node --test tests/screen-tables.test.js` en verde (20 ciclos sin fugas, partyWatch parado); `grep -c "async function showLobby" src/main.js` = 0; navegador: cabecera con saldo y volver; última mesa destacada; en grupo los botones dicen «Mesa del grupo»; modo `local` muestra el aviso sin conexión; capturas `T028-mesas-*.png` | T027 | 1 |
| T029 | F4 | [P] | Crear la pantalla Logros (2 por fila, pendientes primero) | AC11, AC15, AC17b, C4, C5 | `src/screens/achievements.js`, `src/screens/achievements.css`, `src/screens/texts/achievements.js`, `tests/screen-achievements.test.js` | `node --test tests/screen-achievements.test.js tests/achievements-rules.test.js` en verde; navegador a 360×640: 2 columnas, pendientes con barra arriba, completados abajo; al abrir, el punto de Logros desaparece en el hub; capturas `T029-logros-*.png` | T027 | 1 |
| T030 | F4 |  | Migrar Amigos y grupo a `src/screens/friends.js` (desde `partyPanel` y `friendsPanel`) | AC11, AC15, AC18 | `src/screens/friends.js`, `src/screens/friends.css`, `src/screens/texts/friends.js`, `src/screens/routes.js`, `src/main.js`, `tests/screen-friends.test.js` | `node --test tests/screen-friends.test.js` en verde; `grep -cE "async function (partyPanel\|friendsPanel)" src/main.js` = 0; navegador: añadir, aceptar y quitar amigo; invitar al grupo, unirse, salir; estados cargando/vacío/error con Reintentar; Cuenta › Perfil tiene un acceso «Amigos»; capturas `T030-amigos-*.png` | T028 | 1 |
| T031 | F4 |  | Migrar Ranking a `src/screens/ranking.js` | AC1, AC2, AC3, AC15, AC16 | `src/screens/ranking.js`, `src/screens/ranking.css`, `src/screens/texts/ranking.js`, `src/screens/routes.js`, `src/main.js`, `tests/screen-ranking.test.js` | `node --test tests/screen-ranking.test.js` en verde; `grep -c "async function showRanking" src/main.js` = 0; navegador: cambiar Semanal/Mensual/Histórico; atrás devuelve el foco a «Ranking» en el hub; error con Reintentar en modo `local`; capturas `T031-ranking-*.png` | T030 | 1 |
| T032 | F4 |  | Migrar la rejilla y filtros de Skins a `src/screens/skins.js` | AC15, AC16, AC17b, C5 | `src/screens/skins.js`, `src/screens/skins.css`, `src/screens/texts/skins.js`, `src/screens/routes.js`, `src/main.js`, `tests/screen-skins.test.js` | `node --test tests/screen-skins.test.js` en verde; `grep -c "async function showSkins" src/main.js` = 0; navegador: filtros por rareza, colección y «Solo desbloqueadas»; equipada marcada; la lista de retos de Skins se sustituye por un enlace a Logros; capturas `T032-skins-*.png` | T031 | 1 |
| T033 | F4 |  | Convertir el inspector de skin en pantalla apilada `#/skins/:id` y renombrar «desafíos» a «logros» | AC4, AC15, AC16, AC17b, C5 | `src/screens/skinInspect.js`, `src/screens/texts/skins.js`, `src/screens/routes.js`, `src/screens/skins.js`, `src/main.js` | `pnpm test` y `pnpm run build` en verde; `grep -rniE "desaf[ií]o" src index.html` sin líneas visibles en UI (comentarios aparte); navegador: tocar una skin abre `#/skins/<id>`, atrás vuelve a Skins con foco en la tarjeta; equipar funciona; recargar en `#/skins/<id>` deja hub → skins → inspector; el inspector 3D se destruye al salir (sin canvas huérfano) | T032 | 1 |
| T034 | F4 |  | Migrar Cuenta a `src/screens/account.js` con pestañas y la pestaña Perfil | AC10c, AC15, AC16, C11 | `src/screens/account.js`, `src/screens/account/profile.js`, `src/screens/account.css`, `src/screens/texts/account.js`, `src/screens/routes.js`, `src/main.js`, `tests/screen-account.test.js` | `node --test tests/screen-account.test.js` en verde; pestañas Perfil · Progreso · Monedero con `#/cuenta/perfil` etc.; navegador: editar avatar, nombre, contraseña, marco y KYC como hoy; Progreso y Monedero visibles como marcadores de T035/T036 que delegan en el legado; capturas `T034-cuenta-*.png` | T033 | 1 |
| T035 | F4 |  | Migrar la pestaña Monedero (saldo, historial, depósito) | AC12, AC15, AC16, S5.7 | `src/screens/account/wallet.js`, `src/screens/account.css`, `src/screens/texts/account.js`, `src/main.js` | `pnpm test` y `pnpm run build` en verde; `grep -cE "function (walletPane\|bindWallet)" src/main.js` = 0; `grep -rc "DIAMOND VIP" src` = 0; navegador: saldo real, historial con estados cargando/vacío/error, depósito como hoy; `wallet.subscribe` se libera al salir (scope) | T034 | 1 |
| T036 | F4 | [P] | Crear la pestaña Progreso (nivel, XP, marco actual y siguiente, estadísticas) | AC10c, AC15, C2, C11 | `src/screens/account/progress.js`, `src/screens/texts/progress.js`, `src/screens/hubRules.js`, `tests/hub-rules.test.js` | `node --test tests/hub-rules.test.js` en verde (incluye `nextFrame(level)`); navegador: «Nv N · <marco>», barra de XP, cuánto falta al siguiente marco, partidas, victorias, racha, mejor racha, birdies, aces con datos reales; sin la palabra «liga» | T034 | 1 |
| T037 | F4 |  | Migrar Ajustes a `src/screens/settings.js` | AC15, AC16, U6.6 (excepción) | `src/screens/settings.js`, `src/screens/texts/settings.js`, `src/screens/routes.js`, `src/main.js`, `tests/screen-settings.test.js` | `node --test tests/screen-settings.test.js` en verde; `grep -c "async function showSettings" src/main.js` = 0; navegador: todas las secciones guardan como hoy; el silencio está aquí y con M | T035 | 1 |
| T038 | F4 |  | Migrar Mapas (selector de juego libre) a `src/screens/maps.js` | AC10b, AC15, AC16 | `src/screens/maps.js`, `src/screens/maps.css`, `src/screens/texts/maps.js`, `src/screens/routes.js`, `src/main.js`, `tests/screen-maps.test.js` | `node --test tests/screen-maps.test.js tests/freeplay.test.js` en verde; `grep -c "function showFreePlayCourseSelect" src/main.js` = 0; navegador: elegir hoyo, jugar, «Elegir otro mapa» vuelve a Mapas, «Lobby principal» vuelve al hub; capturas `T038-mapas-*.png` | T037 | 1 |
| T039 | F4 |  | Retirar el legado de navegación (`shell` con topbar/tabbar, adaptadores, `screen`) | AC12, AC23, AC34, S§Problem | `src/main.js`, `src/screens/routes.js`, `src/screens/host.js`, `src/style.css` | `pnpm test` y `pnpm run build` en verde; `grep -cE "let screen\|function go\(\|class=\"tabbar\"" src/main.js` = 0; `wc -l src/main.js` anotado (baja frente a 2784); navegador: todas las rutas abren y vuelven; overlays de partida intactos | T038, T029, T036 | 1 |
| T040 | F4 |  | Verificar la fase 4 | AC1-AC24, AC34, AC35 | `02-DOCS/wiki/sdd/verifications/ui-pantallas-<fecha>.md` | `pnpm test` y `pnpm run build` en verde; cada pantalla en 3 medidas con capturas; script de 44×44 en consola sin elementos menores; recorrido con teclado hub → cada pantalla → volver; delta de `initial-load-size.mjs` ≤ +15 KB gzip | T028-T039 | 0 |
| T041 | F5 |  | Publicar `version.json` en el build y avisar de versión nueva (opcional) | AC38 | `vite.config.js`, `src/ui/versionCheck.js`, `src/ui/versionRules.js`, `tests/version-rules.test.js` | `node --test tests/version-rules.test.js` en verde; `pnpm run build` deja `dist/version.json` con la versión; navegador: cambiar el `version.json` servido → en la siguiente comprobación sale «Hay versión nueva» con «Recargar»; el intervalo vive en un scope y para con la pestaña oculta | T040 | 1 |
| T042 | F5 |  | Mostrar el modal de novedades con «No volver a mostrar» (opcional) | AC37 | `src/ui/whatsNew.js`, `src/ui/whatsNewRules.js`, `src/ui/releaseNotes.js`, `src/screens/hub.js`, `tests/whats-new.test.js` | `node --test tests/whats-new.test.js` en verde; navegador: primera apertura tras cambiar versión → modal; marcar «No volver a mostrar» y recargar → no sale para esa versión | T041 | 1 |
| T043 | F5 | [P] | Completar el manifest y alinear `theme-color` (opcional) | AC39 | `public/site.webmanifest`, `index.html`, `public/icon-maskable-512.png`, `tests/manifest.test.js` | `node --test tests/manifest.test.js` en verde: `id`, `scope`, `categories`, `orientation`, un icono `purpose: "maskable"` y `theme_color` igual al `<meta name="theme-color">` de `index.html` | T040 | 1 |
| T044 | Cierre |  | Cerrar: todos los done-checks y la verificación del proyecto | todos (AC1-AC36; AC37-AC39 si se hicieron) | `02-DOCS/wiki/sdd/verifications/ui-pantallas-<fecha>.md` | Cada fila marcada; `pnpm test`, `pnpm run build`, `pnpm audit --prod` y `bash scripts/verify.sh` con código 0; `git diff 3d12edf -- vercel.json` vacío; delta de carga inicial ≤ +15 KB gzip anotado con las dos cifras e `initialHasThree: false`; pendientes humanos listados (Q2.5 móvil real, giroscopio, safe-area real) | T001-T040 (+T041-T043 si se hacen) | — |

### Paralelismo por fase
- **F1:** T002, T003, T004, T005, T006, T007 y T008 a la vez (archivos disjuntos; solo T007 toca `main.js`). Luego T009 (necesita T003). T010 → T011 → T012 en serie (todas tocan `main.js` o verifican).
- **F2:** T013 puede adelantarse a F1 (archivos disjuntos). T015 ∥ T016 tras T014. T017 → T018 → T019 → T020 → T021 → T022 en serie. T023 (boceto del hub) puede correr en paralelo con T017-T021.
- **F3:** T025 → T026 → T027 en serie.
- **F4:** T029 (Logros) en paralelo con T028/T030/T031; T036 (Progreso) en paralelo con T035. El resto en serie por `main.js` y `routes.js`.
- **F5:** T043 en paralelo con T041 → T042.

### Interfaces por tarea (para ejecutores de contexto limpio)

**T002 — Interfaces**
- Consumes: nada. `win` falso con `history.{pushState,replaceState,back,go,state}`, `location.hash`, `addEventListener('popstate')`.
- Produces: `createRouter({ routes, root, win, isBusy }) -> Router` y `parseHash`, `formatHash`, `parseTestHash` exactamente como §3.1. Hashes: `#/`, `#/mesas`, `#/logros`, `#/amigos`, `#/ranking`, `#/skins`, `#/skins/:id`, `#/cuenta/:tab?`, `#/ajustes`, `#/mapas`, `#/jugar` (no restorable). En F1 la raíz es `lobby` con hash `#/`; en F3 pasa a `hub`.

**T004 — Interfaces**
- Consumes: `progress.level -> { level, into, need }`; `progress.challenge(id) -> { value, goal, done }`; `CHALLENGES` de `src/progress/skins.js`; `account.friends() -> { friends, incoming, outgoing }`; `parties.mine() -> { party, invites }`; `TIERS` de `src/config.js`.
- Produces: las firmas de §3.7 (`hubRules`, `achievementsRules`, `transitionRules`). `storage` es un objeto `{ getItem, setItem }` inyectado.

**T005 — Interfaces**
- Produces: `createScope({ win, doc, timers }) -> Scope` (§3.3) y `tests/helpers/fakeEnv.js` → `fakeEnv() -> { win, doc, timers, liveListeners(), liveTimers(), el(tag) }` (elementos stub con `addEventListener`, `querySelector` que devuelve stubs, `innerHTML`, `classList`, `dataset`). Las pruebas `tests/screen-*.test.js` de F3-F4 lo reutilizan: `for 20 × { const s = await mod.mount(env.el('main'), ctx, {}); s.destroy(); }` y `assert.equal(env.liveListeners() + env.liveTimers(), 0)`.

**T006 — Interfaces**
- Consumes: `newNotices(seen, friends, party, { seed })` y `NOTIFY_POLL_MS` de `src/ui/notifyRules.js`; `newPartyMatch`, `partyMessage` de `src/match/partyRules.js`; `parties.{mine,invite,respond,leave,ready,setTier}`, `tournaments.get(id, TIERS)`.
- Produces: `createNotifier(...)` y `createPartyWatch(...)` de §3.8. `main.js` todavía no los usa (lo hace T011).

**T009 — Interfaces**
- Consumes: `t(key, vars)` de T003.
- Produces: §3.5. Clases CSS con prefijo `scr-`; tokens de `:root` de `src/style.css` (sin tokens nuevos salvo los del boceto aprobado en F3).

**T010 — Interfaces**
- Consumes: router (T002), scope (T005), `src/screens/shared.js` (T007).
- Produces: `routes.js` con todas las rutas de §3.1 declaradas; las aún no migradas apuntan a un adaptador `legacy(id)` que llama a la función `show*` de `main.js` registrada en `ctx.legacy[id]`. `host.js` según §3.2. `createContext(deps) -> Ctx` (§3.4). `go(to)` queda como fachada fina sobre `router.push` mientras haya legado.

**T011 — Interfaces**
- Consumes: `router.setBackGuard(fn)`; `createNotifier`, `createPartyWatch` (T006); `stopLive()` y el `confirm` de abandono actuales.
- Produces: `ctx.testHole` usado por `startMatch` en lugar de `location.hash`; `onKeyR`, `fullscreenchange` y toasts registrados en un scope por partida que se libera en `game.dispose()`/salida.

**T014 — Interfaces**
- Consumes: `scenePreset`, `orbitAngle`, `shouldRender` (T013); `makeLushTree/Bush/Rock`, `lushMountains`, `meadowGroundTexture` de `lushEnvironment.js`; `THEMES.meadowDay` de `src/game/themes.js`; `ResolutionGovernor`; `getQuality()`.
- Produces: `createHubScene(container, opts) -> Promise<HubScene>` (§3.9) con `renderLayer(name)` para la captura. Laboratorio: `scripts/hub-scene-lab.html` expone `window.lab = { scene }` y lee `?q=low|medium|high&layer=sky|forest|green&nowebgl=1&seed=N`.

**T016 — Interfaces**
- Consumes: el laboratorio de T014 (`?layer=` y fondo transparente); el patrón Vite + Chrome headless + CDP de `scripts/capture-course-previews.mjs`.
- Produces: `pnpm splash:capture` → 4 WebP en `public/splash/`. Calidad WebP ajustada para que las 3 capas sumen ≤110 KB.

**T019 / T020 — Interfaces**
- Produces: `window.gcbSplash` y `window.__gcbSplashCore` (§3.10). Marcado en `index.html`: `<div id="splash" data-max-ms="15000" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="5" aria-label="Cargando">` antes de `#app`; `<script src="/splash.js"></script>` (clásico) antes de `<script type="module" src="/src/main.js">`. `tests/splash.test.js` carga `public/splash.js` con `node:vm` y un `window` falso.

**T021 — Interfaces**
- Consumes: `window.gcbSplash` (T020), `createHubScene` (T014), `createContext` (T010).
- Produces: `src/ui/splashBridge.js` → `splash = { mark(name), done(), fail(reason) }` (no-op sin `window.gcbSplash`); `ctx.hubScene` con la escena precargada en un contenedor oculto; margen de 8 s para `three`/`scene` antes de marcarla omitida.

**T025 / T026 — Interfaces**
- Consumes: `levelRing`, `friendsBadge`, `achievementsBadge` (T004); `header`, `badge` (T009); `ctx.notifier.subscribe`; `ctx.hubScene.{attach,pause,resume,stats}`; `ctx.actions.{startPractice, claimRewards, toggleFullscreen}`.
- Produces: `hub.js` con `keepAlive`, `onCover` → `hubScene.pause()`, `onUncover(from)` → `resume()` + foco en `[data-focus-key=from]` + `claimRewards()`; `document.visibilitychange` en el scope; `window.__gcbHub = { stats }` solo en dev (`import.meta.env.DEV`).

**T028 — Interfaces**
- Consumes: `createPartyWatch` (T006), `lastTier/rememberTier` (T004), `ctx.actions.startMatch(tier)`, `TIERS`, `prizeFor`, `potFor`.
- Produces: pantalla `tables` con saldo en cabecera (`wallet.subscribe` en el scope) y botones de mesa que respetan el estado del grupo como `paintTiers` de hoy.

**T034 — Interfaces**
- Produces: `account.js` con `params.tab ∈ {'perfil','progreso','monedero'}` (por defecto `perfil`) y un registro de pestañas `tabs = { perfil, progreso, monedero }` donde cada una es `mount(el, ctx) -> { destroy }`; T035 y T036 sustituyen sus marcadores sin tocar el resto.

## Review Workload Forecast

| Dimension | Forecast | Why |
| --- | --- | --- |
| Estimated changed lines | ~6.000-7.000 (de ellas ~2.000 movidas desde `main.js`) | router+host+scope ~600, reglas ~400, componentes+CSS ~500, escena ~700, splash ~600, hub ~500, 11 pantallas ~2.500, tests ~1.200 |
| Files / areas | ~70 entre `src/screens/`, `src/ui/`, `src/match/`, `src/game/render/`, `public/`, `scripts/`, `index.html`, `tests/`, `02-DOCS/` | sin base de datos, física ni CSP |
| Risk | máximo tier 1; 0 tareas de tier 2; 2 gates humanos (T018, T024) | `rsc risk` no marca ninguna ruta como sensible; un revisor por tarea |
| Suggested delivery | autochain por fase: un PR por fase (F0+F1, F2, F3, F4, F5) hacia `la-chaqueta-bionica` | supera de largo `line_budget` 400; cada fase deja el juego funcionando y es revertible sola |
