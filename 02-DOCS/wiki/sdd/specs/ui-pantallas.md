---
type: spec
title: Spec — UI por pantallas (hub, pantallas completas y splash de marca)
description: WHAT y WHY de rediseñar la navegación móvil-primero en pantallas completas con un hub de iconos, un router con pila e historial, y una pantalla de carga de marca con parallax y progreso real.
tags: [sdd, spec, ui, navegacion, splash]
timestamp: 2026-11-12T12:00:00Z
topic: sdd
slug: ui-pantallas
status: draft
branch: la-chaqueta-bionica-ui
---

# Spec — UI por pantallas: hub, pantallas completas y splash de marca

> Slug: `ui-pantallas` · Status: draft · Created: 2026-11-12
> Inherits: [constitution](../constitution.md) · Rama: `la-chaqueta-bionica-ui` (sub-rama de `la-chaqueta-bionica`, se fusiona en ella al terminar).
> Referencia de estructura: MatDrive (matdrive.app). Solo la estructura y las buenas prácticas; ningún asset, texto ni ilustración suya.

## Problem & why

Hoy toda la navegación vive en `src/main.js` (2784 líneas). Un `screen` global solo marca la pestaña
activa: no hay pila, ni historial, ni hash. El botón atrás del navegador o del móvil **sale del juego**.
Cada pantalla se pinta vaciando `#app`. Hay fugas reales: el sondeo del grupo, el `keydown` del juego
libre (uno más por hoyo), `fullscreenchange` y el notificador nunca se limpian.

El lobby enseña una lista de mesas, no un menú de juego. Datos que ya existen y retienen al jugador
(racha, nivel, avatar, nombre, amigos, skins por reclamar) están escondidos en Cuenta o no se ven.
La primera impresión es un texto «cargando» sobre fondo vacío.

Disparador: el juego se quiere presentar como un juego móvil de verdad («por pantallas», como MatDrive),
con identidad propia, y `main.js` ya no admite más pantallas sin volverse inmanejable.

## Cost of not building it

- Cada pantalla nueva (desafíos, recompensas, torneos) engorda `main.js` y suma otra fuga de listeners.
- El botón atrás sigue sacando al jugador de la app: en móvil es la acción más común, y hoy rompe la sesión.
- La racha, el progreso y las novedades siguen invisibles: no hay motivo visible para volver mañana.
- La carga inicial se ve como una web rota hasta que llega el bundle.

## The cheapest alternative

Mantener el lobby actual y añadir solo: (a) `history.pushState` en `go()` para que atrás funcione,
(b) un chip de racha y nivel en el lobby, (c) un splash estático con el logo en `index.html`.
Resuelve el botón atrás y la primera impresión con poco código. **No basta** porque: no saca código de
`main.js` (el problema crece), no da sitio a desafíos/recompensas/torneos/progreso, no arregla las fugas
de forma sistemática y no cumple el objetivo de producto (hub de iconos + pantallas completas).
Se descarta, pero sirve de fase 0 si el resto se tuerce.

**No construirlo** también es una dirección: el juego sigue funcionando. El coste es el de la sección anterior.

## Goals

1. Un hub único con composición fija: barra superior, escena de fondo, columnas de iconos, botón JUGAR dominante y barra inferior.
2. Cada icono del hub abre una **pantalla completa** con cabecera (título, volver, saldo). Nunca un panel superpuesto ni un modal grande.
3. Navegación con pila: atrás del navegador, atrás del móvil y Esc vuelven a la pantalla anterior; la URL refleja la pantalla.
4. Cada pantalla es un módulo propio que monta y desmonta sin dejar listeners ni timers vivos.
5. Indicadores de retención en el hub, **solo con datos reales**: racha, progreso de nivel, cuenta atrás de eventos y puntos rojos de novedad.
6. Pantalla de carga de marca: aparece al instante, muestra progreso real y desaparece con un fundido cuando el hub está listo.
7. Ningún empeoramiento medible de rendimiento ni de peso de la carga inicial.

## Non-goals / out of scope

- **Física, economía, RLS, migraciones, Edge Functions y RPC de Supabase.** Ningún cambio. Solo se leen las APIs que ya existen.
- **Backend de desafíos diarios/semanales, cofres, liga o historial de partidas.** No existen. La spec propone el modelo de datos (abajo); construirlo es otra spec.
- **Service worker, caché offline o PWA instalable offline.** El saldo es real y debe venir siempre del servidor. Tema aparte (ver *decisión diferida*).
- **HUD de la partida 3D y overlays dentro de la partida** (resultado de hoyo, desempate, pausa, fin de partida). Siguen como hoy: son parte del juego, no navegación. Solo se enrutan la entrada y la salida.
- **Pantalla de login/registro (authScreen).** Se mantiene su lógica. Solo se integra con el splash y el router (sin rediseño visual).
- **Panel de administración (`admin.html`).**
- **Traducción a otro idioma.** Solo se sacan los textos a un diccionario en español, listo para i18n.
- Cosas que un agente añadiría «por si acaso» y **no se hacen**: monedas o gemas blandas, tienda con pagos, notificaciones push, chat, música nueva, animaciones de personaje, tutorial guiado, vibración, sonidos nuevos, analítica o telemetría, nuevos dominios en la CSP, librerías de UI o de animación.

## Users & context

- **Jugador en móvil** (principal): una mano, vertical, iPhone con notch o Android de gama media/baja de 2024. Abre el juego, quiere jugar en ≤3 toques (U6.3) y ver qué hay de nuevo.
- **Jugador en escritorio**: teclado y ratón, atajos 1-6 y M ya aprendidos.
- **Jugador con movimiento reducido o lector de pantalla**: necesita versión estática y roles/etiquetas correctos.

## What the user can do

- **Cualquier jugador con sesión** (con cuenta o invitado):
  - Ver el hub al terminar la carga.
  - Tocar un icono del hub y entrar en su pantalla completa; volver con el botón de la cabecera, el gesto/botón atrás del sistema, el atrás del navegador o Esc.
  - Pulsar JUGAR y llegar a una partida en ≤3 toques desde el hub.
  - Abrir Ranking, Logros, Torneos, Desafíos, Recompensas, Progreso, Skins, Juego libre, Amigos/Grupo, Cuenta y Ajustes como pantallas completas.
  - Reclamar recompensas que existan de verdad (skins desbloqueadas por reclamar).
  - Ver solicitudes de amistad e invitaciones de grupo, aceptarlas, e invitar amigos a su grupo.
  - Usar todo con teclado en escritorio (Tab, Enter, Esc, atajos 1-6, M).
- **Cualquier visitante** (con o sin sesión): ver la pantalla de carga mientras arranca el juego, y un mensaje de reintento si la red falla.
- **Sin sesión**: tras la carga va a la pantalla de login de siempre.

## What result they get

Referencias que el humano debe aprobar (**hoy no existe ninguna aprobada**; ver *Points to clarify*):

1. **Wireframe del hub** a 375×812 y a 1280×800, con las zonas: barra superior, escena, dos columnas de iconos, JUGAR + 2 secundarios, barra inferior. Se entrega como página HTML estática en `02-DOCS/attachments/ui-pantallas/` antes de implementar la fase 3.
2. **Wireframe de una pantalla tipo** (cabecera + lista con estados cargando/vacío/error).
3. **Fotograma del splash** (estático, reduced-motion) a 375×812.

Resultado observable:

- La URL cambia al cambiar de pantalla y atrás vuelve a la pantalla anterior, sin recargar y sin salir de la app.
- En el hub se ven, con datos reales: saldo, avatar, nombre, nivel con barra al siguiente nivel, racha de victorias, puntos rojos de novedades (amistad, grupo, recompensas por reclamar).
- Cada pantalla tiene cabecera con título, botón volver (≥44 px) y saldo.
- Cada lista enseña un estado de carga, uno vacío y uno de error con «Reintentar».
- Datos de prueba (desafíos temporales) llevan una marca visible «DEMO», según la respuesta de *clarify*.
- El splash aparece antes de que cargue el bundle, con logo, pelota con estela de fuego, capas en parallax, barra de progreso con porcentaje y un TIP rotatorio; desaparece con fundido.

## What it must respect

Constitución (por número):

- **C1.2 / C1.5**: Vite 5, Three.js 0.169, sin dependencias nuevas.
- **C1.4**: física, replay y `courses.js` no importan DOM ni Three.
- **Q2.1**: `pnpm test` y `pnpm run build` en verde.
- **Q2.4**: lo visual no altera la física.
- **Q2.5**: prueba en móvil real o emulador de gama media antes de fusionar.
- **K3.1 / K3.5**: commits gitmoji en español, autor Chakets, sin trailers de IA.
- **K3.3**: UI en español; un idioma de identificadores por módulo.
- **K3.4**: carpetas de primer nivel en `src/` solo con motivo. `src/screens/` es nueva: el motivo es que sale de `main.js` y separa navegación de `ui/` (componentes). Se justifica en el plan.
- **S5.7**: el servidor decide el saldo; la UI nunca lo calcula ni lo cachea entre sesiones.
- **U6.1 / P7.3**: transición de menú a 60 FPS y ≤1 s.
- **U6.3**: ≤3 toques del inicio a jugar; cada pantalla nueva se justifica.
- **U6.4**: objetivos táctiles ≥44×44 px, usable con una mano.
- **U6.5**: contraste WCAG AA; nada solo por color (los puntos rojos llevan texto accesible).
- **U6.6**: botón de silencio visible; nada parpadea más de 3 veces por segundo (el destello del logo y el fuego incluidos).
- **U6.7**: vertical y horizontal sin scroll horizontal.
- **P7.1**: 60 FPS en móvil de gama media/baja con calidad automática.
- **P7.5**: un cambio de carga anota cómo se midió.

Otras restricciones:

- **CSP de `vercel.json`**: sin scripts inline, sin dominios nuevos. El CSS inline del splash va en `<style>` (permitido por `style-src 'unsafe-inline'`). El JS del splash es un archivo propio.
- **Permissions-Policy**: no bloquea el giroscopio; en iOS el permiso exige un gesto del usuario, así que en iOS el parallax usa el dedo o la deriva automática.
- **Calidad gráfica automática** (`quality.js`, ResolutionGovernor, PerfGovernor): no se rompe. Hub y splash consultan el nivel (bajo/medio/alto) para recortar capas y partículas.
- **Three.js solo cuando hace falta**: el hub y el splash no lo cargan; se sigue cargando al entrar en partida, inspector de skin o vista previa.
- **Comportamiento que debe seguir igual**: atajos 1-6 y M, Esc en partida (vista general / pausa), enlaces de prueba `#hoyoN` y `#hoyoN-empate`, `?skinlab=1`, el popup de avisos de 5 s, la reclamación con skinReveal, el abandono de partida en vivo al salir.
- **Decisiones previas**: no hay decisiones de UI en `decisions.md`. Las specs cyberpunk2078 son del hoyo 15, no de la UI.

## How it proves it

- **Pruebas unitarias** (`node --test`, en `tests/`): router (push, pop, replace, atrás con pila vacía, hash ↔ pantalla, ciclo montar/desmontar) y cada `*Rules.js` nuevo (badges, cuentas atrás, qué mostrar, progreso de carga, rotación de TIP). Se quedan en el repo.
- **Prueba de limpieza**: una prueba monta y desmonta cada pantalla N veces con dobles de `window`/timers y comprueba que listeners y timers vuelven a cero.
- **Navegador** (pane integrado, `pnpm dev`): por fase, capturas a 375×812, 360×640 y 1280×800; consola sin errores; red sin petición al chunk de Three.js en splash y hub.
- **Rendimiento**: `pnpm build` antes y después (tamaño de cada chunk, en bruto y gzip) y FPS del hub con CPU ×4 de throttling, 10 s en reposo. Los números se anotan en `02-DOCS/wiki/sdd/verifications/ui-pantallas-<fecha>.md`.
- **Accesibilidad**: recorrido con solo teclado de hub → pantalla → volver; roles y `aria-label` revisados con el árbol de accesibilidad.
- **Evidencia que queda**: capturas en `02-DOCS/attachments/ui-pantallas/`, el informe de verificación y los tests.
- **Lo que no se puede probar aquí**: móvil físico (Q2.5) y giroscopio real. Se anota como pendiente para el humano.

## Behaviour

### Main path

1. El jugador abre la URL. El splash se pinta con el HTML/CSS de `index.html`, antes del bundle.
2. La barra avanza según hitos reales: bundle principal, backend/sesión, progreso y saldo, recursos del hub. El TIP rota cada pocos segundos.
3. Con el hub listo y ≥600 ms visibles, el splash se funde y el hub queda interactivo.
4. Desde el hub, un toque en un icono hace push de su pantalla con una transición corta (150-250 ms), o sin transición si el usuario prefiere movimiento reducido.
5. Volver (cabecera, sistema, navegador, Esc) hace pop y devuelve el foco al icono de origen.
6. JUGAR abre el flujo de partida; al terminar la partida se vuelve al hub.

### Edge cases

- **Entrada directa a una URL de pantalla** (p. ej. recargar en Ranking): carga esa pantalla con el hub debajo en la pila; atrás vuelve al hub, no fuera.
- **Atrás en el hub**: no sale de la app por accidente. Comportamiento exacto en *Points to clarify*.
- **Atrás durante una partida**: abre la pausa, igual que Esc hoy; no abandona sin confirmar.
- **Partida en vivo en curso**: salir de ella sigue contando como abandono y se avisa antes, como hoy.
- **Sin sesión**: splash → login. Con sesión de invitado: hub con los huecos de cuenta marcados.
- **Modo sin conexión (`backend.mode === 'local'`)**: el hub muestra el aviso actual; las pantallas de datos remotos enseñan su estado de error o vacío.
- **Calidad baja**: menos capas de parallax y menos partículas en el splash; escena del hub estática.
- **prefers-reduced-motion**: splash estático, sin parallax, sin deriva, sin transiciones de deslizamiento (fundido corto o corte).
- **Rotar el móvil**: el hub se recompone sin scroll horizontal.
- **Doble toque rápido en un icono**: abre una sola pantalla.

### Error paths

- **La red falla en la carga**: al superar el máximo configurable, el splash muestra un mensaje y un botón «Reintentar»; la barra no finge progreso.
- **Una pantalla no puede cargar sus datos**: estado de error con «Reintentar» dentro de la pantalla; la navegación sigue funcionando.
- **Un módulo de pantalla falla al cargar**: aviso y vuelta al hub, sin pantalla en blanco.

## Datos: qué existe y qué falta

| Concepto | Estado | Dónde |
| --- | --- | --- |
| Saldo | Real (servidor) | `wallet.getBalance` / `subscribe` |
| Avatar y nombre | Real | `avatar.get()`, `account.load()` |
| Nivel y XP | Real (cliente, subido al servidor) | `progress.level` |
| Prestigio (marcos p25-p150) | Real | `prestige.js`, `profiles.frame` |
| Racha y mejor racha | Real, calculada en cliente | `progress.state.streak`, `bestStreak` |
| Victorias, partidas, birdies, aces | Real | `progress.state` |
| Ranking semanal/mensual/histórico | Real | `account.ranking`, `myRanking` |
| Premios de ranking | Real | `ranking_awards` en `my_ranking` |
| Desafíos permanentes (25 hitos que desbloquean skins) | Real, solo cliente | `CHALLENGES` en `progress/skins.js` |
| Skins por reclamar | Real, solo cliente (`claimed` no se sube) | `progress.claimable` / `claim` |
| Historial de movimientos del monedero | Real | `wallet.getTransactions` |
| Amigos, solicitudes | Real | `account.friends`, `addFriend`, `respondFriend` |
| Grupo e invitaciones | Real | `PartyService` |
| Mesas (entrada, premio, bote) | Real | `config.js` TIERS, `prizeFor`, `potFor` |
| Mis partidas activas | Real (máx. 10, no es historial) | `TournamentService.mine` |
| Cuenta atrás de sala en vivo | Real | `startsAt` + `clockOffset` |
| **Liga** | **No existe** | Solo un texto fijo «DIAMOND VIP» decorativo |
| **Torneos programados / lista pública** | **No existe** | Las partidas se llenan al momento |
| **Desafíos diarios/semanales y eventos temporales** | **No existe** | — |
| **Cofres** | **No existe** | — |
| **Logros (achievements)** | **No existe con ese nombre** | Lo más cercano: hitos `CHALLENGES` + `ranking_awards` |
| **Historial de partidas** | **No existe** | — |
| **Monedas blandas** | **No existe** (y no se crean) | — |

### Modelo de datos propuesto para desafíos temporales (solo propuesta; otra spec lo construye)

- Un **desafío** tiene: identificador, tipo (`daily` | `weekly` | `event`), título, descripción, métrica que mide (las mismas estadísticas que ya existen: partidas, victorias, birdies, aces, racha…), objetivo numérico, recompensa (skin o XP; **nunca saldo**), inicio y fin en hora del servidor.
- El **avance** de un jugador en un desafío: progreso actual, completado sí/no, reclamado sí/no y fecha. Lo decide el servidor, igual que la XP tope de `save_progress`.
- La UI solo necesita: lista de desafíos activos con `endsAt`, progreso y si es reclamable. La cuenta atrás usa el reloj del servidor (como `clockOffset`).

## Acceptance criteria

**Router y navegación**

1. Given el hub, When el jugador toca «Ranking», Then la URL cambia a la de Ranking y se ve la pantalla de Ranking a pantalla completa con cabecera (título, volver, saldo).
2. Given Ranking abierta desde el hub, When el jugador pulsa atrás del navegador, Then vuelve al hub sin recargar la página y el foco queda en el icono «Ranking».
3. Given Ranking abierta, When el jugador pulsa Esc en escritorio, Then vuelve al hub.
4. Given una recarga con la URL de una pantalla, When termina la carga, Then se ve esa pantalla y atrás lleva al hub.
5. Given cualquier pantalla, When se monta y desmonta 20 veces en la prueba de limpieza, Then no queda ningún listener de `window`/`document` ni timer vivo creado por ella.
6. Given `prefers-reduced-motion: reduce`, When se cambia de pantalla, Then no hay animación de deslizamiento; el cambio dura ≤100 ms.
7. Given movimiento normal, When se cambia de pantalla, Then la transición dura entre 150 y 250 ms.
8. Given `#hoyo3` en la URL, When carga el juego, Then arranca la práctica en el hoyo 3 como hoy.

**Hub**

9. Given un jugador con sesión, When carga el hub, Then se ven saldo, avatar, nombre, nivel con barra de progreso, racha actual, el botón JUGAR, los iconos laterales y la barra inferior de 3-4 pestañas, a 375×812, 360×640 y 1280×800 sin scroll horizontal.
10. Given el hub, When el jugador pulsa JUGAR, Then llega a una partida de práctica o a una sala en ≤3 toques en total.
11. Given una solicitud de amistad pendiente, una invitación de grupo o una skin por reclamar, When carga el hub, Then el icono correspondiente muestra un punto rojo con texto accesible («N novedades»); sin pendientes, no hay punto.
12. Given un dato que no existe (liga, desafío temporal sin backend), When carga el hub, Then no se muestra como real; o se oculta o lleva la marca «DEMO» según *clarify*.
13. Given el hub abierto en móvil o escritorio, When se mide la red, Then no se ha pedido el chunk de Three.js.
14. Given el hub en reposo 10 s con CPU ×4, When se mide, Then la media es ≥55 FPS y no baja de la medida de referencia del lobby actual en más de 5 FPS.

**Pantallas**

15. Given cada pantalla (Torneos, Desafíos, Amigos y grupo, Recompensas, Progreso, Ranking, Skins, Cuenta, Ajustes, Juego libre), When se abre, Then tiene cabecera, y sus listas muestran estado de carga, de vacío y de error con «Reintentar».
16. Given las pantallas migradas (Ranking, Skins, Cuenta, Ajustes, Juego libre), When se usan, Then hacen todo lo que hacían antes (cambiar periodo de ranking, filtrar e inspeccionar skins, equipar, editar avatar, contraseña, depósito, ajustes, elegir hoyo libre).
17. Given Recompensas con skins por reclamar, When el jugador reclama, Then se ve la revelación de skin de siempre y la skin pasa al inventario.
18. Given Amigos y grupo, When el jugador acepta una solicitud o invita a un amigo, Then usa las APIs actuales y la lista se actualiza.

**UX obligatoria**

19. Given cualquier pantalla, When se mide, Then todo control táctil mide ≥44×44 px.
20. Given un iPhone con notch (375×812 con safe-area simulada), When se ve cualquier pantalla, Then cabecera y barra inferior no quedan bajo el notch ni bajo la barra de inicio.
21. Given solo teclado, When se recorre hub → pantalla → volver, Then todo control es alcanzable con Tab, tiene foco visible y se activa con Enter/Espacio.
22. Given un lector de pantalla, When recorre el hub, Then cada icono tiene nombre accesible y los badges se leen como texto.
23. Given los textos de las pantallas nuevas y migradas, When se buscan cadenas en español fuera del diccionario, Then no hay ninguna en los módulos de `src/screens/`.
24. Given un dispositivo táctil, When se usa el hub, Then nada depende de hover.

**Splash**

25. Given una carga en frío, When llega el HTML, Then el splash se pinta antes de que se ejecute el bundle principal (sin depender de él).
26. Given el splash, When avanza la carga, Then el porcentaje sube solo al completar hitos reales y nunca baja; no llega a 100 % hasta que el hub está listo.
27. Given una carga muy rápida, When el hub está listo antes de 600 ms, Then el splash sigue visible hasta los 600 ms y luego se funde.
28. Given la red caída, When se supera el máximo configurado, Then aparece un mensaje y «Reintentar», que vuelve a intentar la carga.
29. Given las imágenes y el CSS del splash, When se suman, Then pesan <150 KB y las imágenes son WebP.
30. Given `prefers-reduced-motion`, When se ve el splash, Then es estático (sin parallax, sin deriva, sin partículas animadas).
31. Given calidad baja, When se ve el splash, Then usa menos capas y menos partículas que en calidad alta.
32. Given el splash en marcha, When el dedo o el ratón se mueven, Then las capas se desplazan a velocidades distintas (≥3 capas); sin input, derivan solas.
33. Given el destello del logo y el fuego, When se miden, Then ningún elemento parpadea más de 3 veces por segundo.

**Rendimiento y build**

34. Given `pnpm build` antes y después, When se compara, Then el JS de la carga inicial (sin Three.js) no crece más de 15 KB gzip, y la cifra queda anotada.
35. Given el repo, When se ejecuta `pnpm test`, Then pasan todos los tests existentes y los nuevos de router y reglas.
36. Given `vercel.json`, When se compara con el de antes, Then la CSP no cambia.

**Extras (opcionales, tareas separadas)**

37. Given una versión nueva con notas, When el jugador abre el juego por primera vez tras actualizar, Then ve un modal de novedades con «No volver a mostrar»; si lo marca, no vuelve a salir para esa versión.
38. Given el juego abierto, When se publica una versión nueva, Then en la siguiente comprobación periódica aparece un aviso «Hay versión nueva» con «Recargar».
39. Given el manifest, When se valida, Then tiene `id`, `scope`, `categories`, `orientation` e iconos `maskable`, y `theme-color` coincide con el de `index.html`.

## Points to clarify

- **pregunta abierta** — Qué pantallas usan datos reales y cuáles simulados, y cómo se marcan los simulados en producción (juego con saldo real). *Recomendación:* Desafíos = hitos permanentes reales (`CHALLENGES`) + sección temporal con datos de prueba **solo fuera de producción** y marca «DEMO»; en producción, la sección temporal dice «Próximamente».
- **pregunta abierta** — La barra superior pide «liga». No existe. *Recomendación:* mostrar nivel + barra al siguiente nivel + marco de prestigio actual y el siguiente (Bronce p25…Maestro p150) como «rango»; no inventar liga.
- **pregunta abierta** — Torneos: no hay torneos programados. *Recomendación:* la pantalla Torneos muestra las mesas (entrada, premio, bote, reglas), las partidas activas propias y la sala en vivo con cuenta atrás real; nada de calendario.
- **pregunta abierta** — Logros: no existen. *Recomendación:* Logros = premios de ranking (`ranking_awards`) + hitos de estadísticas ya alcanzados; Desafíos = hitos aún por alcanzar + temporales.
- **pregunta abierta** — Recompensas: *Recomendación:* skins por reclamar (real) + historial de movimientos del monedero (real); cofres = hueco listado, sin UI falsa.
- **pregunta abierta** — Escena de fondo del hub: 3D vivo (cargaría Three.js en el hub y contradice el criterio 13) o capas WebP con parallax. *Recomendación:* capas WebP, compartidas con el splash en versión noche/cyberpunk.
- **pregunta abierta** — Origen de las capas del splash. Las miniaturas de `public/courses/` son el hoyo aislado sobre blanco: no sirven. *Recomendación:* capturar el hoyo 13 «El Molino del Prado» (tema `meadowDay`) con el script de capturas que ya existe, separado en cielo (degradado CSS), fondo lejano y primer plano (WebP con transparencia).
- **pregunta abierta** — Flujo de JUGAR. *Recomendación:* JUGAR repite la última mesa usada (1 toque + confirmación) y un secundario «Elegir mesa» abre Torneos; los secundarios son «Amigos/Privada» y «Torneo».
- **pregunta abierta** — Pestañas de la barra inferior. *Recomendación:* Jugar · Skins · Ranking · Cuenta (Ajustes va en el botón Menú; Juego libre pasa a icono lateral).
- **pregunta abierta** — Atrás en el hub: ¿no hacer nada, pedir confirmación «¿Salir?» o dejar salir? *Recomendación:* en el hub atrás no hace nada visible (se queda); en la app instalada (standalone) un segundo atrás en 2 s sale.
- **pregunta abierta** — Referencias visuales: ¿apruebas los wireframes HTML antes de implementar cada fase visual, o vale que yo las proponga y las revises después? *Recomendación:* aprobar el wireframe del hub y del splash antes de sus fases.
- **suposición tomada** — El inspector de skin pasa a ser una pantalla completa apilada sobre Skins. *Base:* la regla «nunca un panel superpuesto». *Riesgo:* bajo; cambia solo cómo se abre.
- **suposición tomada** — La revelación de skin (skinReveal) y el popup de avisos siguen como capa superpuesta. *Base:* son eventos, no navegación. *Riesgo:* ninguno sobre lo pedido.
- **suposición tomada** — Los overlays dentro de la partida no se migran. *Base:* son parte del juego. *Riesgo:* si se quieren como pantallas, es otra spec.
- **suposición tomada** — La racha que se muestra es la calculada en el cliente y guardada en el perfil. *Base:* es el dato real que hay. *Riesgo:* puede diferir entre dispositivos hasta sincronizar.
- **suposición tomada** — El máximo de espera del splash por defecto es 15 s. *Base:* P7.4 (≤5 s preparar partida) con margen para red móvil. *Riesgo:* configurable.
- **suposición tomada** — `src/screens/` es una carpeta nueva de primer nivel. *Base:* K3.4 la permite con motivo. *Riesgo:* bajo.
- **decisión diferida** — Service worker / caché offline: fuera de este ciclo; si se hace, solo para assets estáticos y nunca para saldo ni API.
- **decisión diferida** — Backend de desafíos temporales, cofres, liga e historial de partidas: otra spec, con su migración.
- **área no formulable** — La identidad visual del hub (cuánto «cyberpunk» lleva una UI cuyo CSS no tiene tokens cyberpunk: hoy es oscuro con oro/esmeralda/amarillo `#FFD23F`). Se concretará con el wireframe.

## Revisions

- 2026-11-12 — Borrador inicial.
