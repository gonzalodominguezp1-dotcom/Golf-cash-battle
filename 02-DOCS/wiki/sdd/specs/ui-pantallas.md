---
type: spec
title: Spec — UI por pantallas (hub, pantallas completas y splash de marca)
description: WHAT y WHY de rediseñar la navegación móvil-primero en pantallas completas con un hub de iconos, un router con pila e historial, y una pantalla de carga de marca con parallax y progreso real.
tags: [sdd, spec, ui, navegacion, splash]
timestamp: 2026-11-12T12:00:00Z
topic: sdd
slug: ui-pantallas
status: clarified
branch: la-chaqueta-bionica-ui
---

# Spec — UI por pantallas: hub, pantallas completas y splash de marca

> Slug: `ui-pantallas` · Status: clarified (pendiente de aprobación) · Created: 2026-11-12
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

1. Un hub único con la composición fijada en C10: barra superior (usuario con anillo de nivel · logo · Ajustes y pantalla completa), escena 3D de un hoyo en un bosque de día (C7, C8), columna izquierda (Ranking, Logros), columna derecha (Skins, Amigos) y barra inferior (Mapas · JUGAR · Práctica).
2. Cada icono del hub abre una **pantalla completa** con cabecera (título y volver). Nunca un panel superpuesto ni un modal grande.
3. Navegación con pila: atrás del navegador, atrás del móvil y Esc vuelven a la pantalla anterior; la URL refleja la pantalla. En el hub, atrás no hace nada (C12).
4. Cada pantalla es un módulo propio que monta y desmonta sin dejar listeners ni timers vivos.
5. Indicadores de retención en el hub, **solo con datos reales**: anillo de progreso de nivel y puntos rojos de novedad (Amigos: solicitudes e invitaciones; Logros: logros completados no vistos).
6. Pantalla de carga de marca: aparece al instante, muestra progreso real y desaparece con un fundido cuando el hub está listo.
7. Ningún empeoramiento medible de rendimiento ni de peso de la carga inicial.

## Non-goals / out of scope

- **Física, economía, RLS, migraciones, Edge Functions y RPC de Supabase.** Ningún cambio. Solo se leen las APIs que ya existen.
- **Backend de desafíos diarios/semanales, cofres, liga o historial de partidas.** No existen. La spec propone el modelo de datos (abajo); construirlo es otra spec.
- **Service worker, caché offline o PWA instalable offline.** El saldo es real y debe venir siempre del servidor. Tema aparte (ver *decisión diferida*).
- **HUD de la partida 3D y overlays dentro de la partida** (resultado de hoyo, desempate, pausa, fin de partida). Siguen como hoy: son parte del juego, no navegación. Solo se enrutan la entrada y la salida.
- **Retos con fecha (diarios, semanales, eventos), pantalla Desafíos y pantalla Recompensas** (C1, C5, C6). Las skins por reclamar siguen como hoy. El hueco queda para un futuro icono «Eventos».
- **Saldo y botón de silencio en el hub** (C11). El saldo sigue en Cuenta y en la cabecera de mesas.
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
  - Pulsar JUGAR, elegir mesa y llegar a la partida en 2 toques (C9).
  - Abrir como pantallas completas: Ranking, Logros, Skins (con su inspector), Amigos y grupo, Mapas (juego libre), Mesas (tras JUGAR), Cuenta (desde el icono de usuario, con Perfil · Progreso · Monedero) y Ajustes.
  - Lanzar una práctica gratis con el botón Práctica.
  - Seguir reclamando skins como hoy: la revelación sale sola al volver al hub.
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
- En el hub se ven, con datos reales: avatar con el número de nivel y un anillo de progreso al siguiente nivel, el logo, los 4 iconos laterales, la barra inferior y puntos rojos de novedad (Amigos, Logros). No se ve el saldo.
- Cada pantalla tiene cabecera con título y botón volver (≥44 px). La de mesas muestra además el saldo.
- Cada lista enseña un estado de carga, uno vacío y uno de error con «Reintentar».
- No hay datos de prueba en ninguna pantalla.
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
- **U6.6**: nada parpadea más de 3 veces por segundo (el destello del logo y el fuego incluidos). **Excepción decidida por el humano (C11):** el botón de silencio no está en el hub; sigue en Ajustes y con la tecla M.
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
- **Atrás en el hub**: no hace nada; el jugador sigue en el hub (C12).
- **Atrás durante una partida**: abre la pausa, igual que Esc hoy; no abandona sin confirmar.
- **Partida en vivo en curso**: salir de ella sigue contando como abandono y se avisa antes, como hoy.
- **Sin sesión**: splash → login. Con sesión de invitado: hub con los huecos de cuenta marcados.
- **Modo sin conexión (`backend.mode === 'local'`)**: el hub muestra el aviso actual; las pantallas de datos remotos enseñan su estado de error o vacío.
- **Calidad baja**: menos capas de parallax y menos partículas en el splash; en el hub, menos resolución, menos partículas y apariciones más espaciadas.
- **Sin WebGL o fallo al crear la escena 3D**: el hub muestra en su lugar una imagen fija de la escena y todo lo demás funciona.
- **prefers-reduced-motion**: splash estático, sin parallax, sin deriva; hub con cámara quieta y sin apariciones; sin transiciones de deslizamiento (fundido corto o corte).
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
| Logros: retos permanentes (`CHALLENGES`, 25 hitos que desbloquean skins) | Real, solo cliente | `CHALLENGES` en `progress/skins.js` |
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

### Contenido mínimo por pantalla (con las recomendaciones; *clarify* puede moverlo)

| Pantalla | Contenido mínimo | Datos |
| --- | --- | --- |
| Mesas (Torneos) | Lista de mesas de hoy: entrada, premio, bote, reglas, jugar; última mesa destacada; saldo en la cabecera (C3, C9) | Reales |
| Logros | Todos los `CHALLENGES`: pendientes arriba con progreso, completados abajo, 2 por fila (C4) | Reales |
| Amigos y grupo | Amigos, solicitudes entrantes/salientes, añadir, grupo actual, invitar, invitaciones recibidas | Reales |
| Cuenta | Pestañas Perfil (lo de hoy) · Progreso (nivel y XP, marco actual y siguiente, partidas, victorias, racha, mejor racha, birdies, aces) · Monedero (lo de hoy, con historial) (C11) | Reales |
| Ranking, Skins, Ajustes, Mapas (juego libre) | Lo que hacen hoy; en Skins el texto «desafíos» pasa a «logros» (C5) | Reales |

### Modelo de datos propuesto para retos con fecha de la futura sección «Eventos» (solo propuesta; otra spec lo construye, C1)

- Un **desafío** tiene: identificador, tipo (`daily` | `weekly` | `event`), título, descripción, métrica que mide (las mismas estadísticas que ya existen: partidas, victorias, birdies, aces, racha…), objetivo numérico, recompensa (skin o XP; **nunca saldo**), inicio y fin en hora del servidor.
- El **avance** de un jugador en un desafío: progreso actual, completado sí/no, reclamado sí/no y fecha. Lo decide el servidor, igual que la XP tope de `save_progress`.
- La UI solo necesita: lista de desafíos activos con `endsAt`, progreso y si es reclamable. La cuenta atrás usa el reloj del servidor (como `clockOffset`).

## Acceptance criteria

**Router y navegación**

1. Given el hub, When el jugador toca «Ranking», Then la URL cambia a la de Ranking y se ve la pantalla de Ranking a pantalla completa con cabecera (título, volver, saldo).
2. Given Ranking abierta desde el hub, When el jugador pulsa atrás del navegador, Then vuelve al hub sin recargar la página y el foco queda en el icono «Ranking».
3. Given Ranking abierta, When el jugador pulsa Esc en escritorio, Then vuelve al hub.
4. Given un jugador con sesión y una recarga con la URL de una pantalla, When termina la carga, Then se ve esa pantalla y atrás lleva al hub. Sin sesión: login, y al entrar, la pantalla pedida.
5. Given cualquier pantalla, When se monta y desmonta 20 veces en la prueba de limpieza, Then no queda ningún listener de `window`/`document` ni timer vivo creado por ella. (Requisito derivado: las pantallas reciben sus dependencias —backend, wallet, progress, router— por parámetro, no por globales, para poder probarlas con dobles.)
6. Given `prefers-reduced-motion: reduce`, When se cambia de pantalla, Then no hay animación de deslizamiento; el cambio dura ≤100 ms.
7. Given movimiento normal, When se cambia de pantalla, Then la transición dura entre 150 y 250 ms.
8. Given `#hoyo3` en la URL, When carga el juego, Then arranca la práctica en el hoyo 3 como hoy.

**Hub**

9. Given un jugador con sesión, When carga el hub, Then se ven, en la posición de C10: icono de usuario con su nivel y anillo de progreso; logo; Ajustes y pantalla completa; Ranking y Logros a la izquierda; Skins y Amigos a la derecha; Mapas · JUGAR · Práctica abajo; la escena 3D detrás. Todo a 375×812, 360×640 y 1280×800 sin scroll horizontal. No se ven saldo ni botón de silencio.
10. Given el hub, When el jugador pulsa JUGAR y luego una mesa, Then entra en la partida o en la sala (2 toques). La última mesa usada sale destacada; sin mesa previa, ninguna.
10b. Given el hub, When el jugador pulsa Práctica, Then arranca la práctica gratis como hoy (1 toque). When pulsa Mapas, Then abre el selector de juego libre.
10c. Given el hub, When el jugador toca su icono de usuario, Then abre Cuenta con las pestañas Perfil, Progreso y Monedero.
11. Given una solicitud de amistad o una invitación de grupo pendiente, When carga el hub, Then Amigos muestra un punto rojo con texto accesible («N novedades»). Given un logro completado que el jugador aún no ha visto en Logros, Then Logros muestra el punto. Sin pendientes, no hay punto.
12. Given cualquier pantalla, When se inspecciona, Then no hay datos de prueba ni elementos de liga, desafíos con fecha, recompensas o cofres.
13. Given el hub (C7), When se abre, Then su escena 3D usa Three.js cargado **durante el splash** (cuenta en el porcentaje) mediante import dinámico; el chunk de entrada no importa Three.js de forma estática. Given otra pantalla tapando el hub o la pestaña oculta, When pasa 1 s, Then la escena del hub no dibuja ningún fotograma (0 llamadas de render) hasta volver al hub.
14. Given el hub en reposo 10 s a 375×812 con calidad automática, When se mide, Then la media es ≥55 FPS (escritorio y emulación móvil con CPU ×4) y se anota junto con la línea base del lobby actual medida **antes de tocar nada** (primera tarea del plan). Con calidad Baja la escena reduce resolución y partículas según el preset de `quality.js`.

**Pantallas**

15. Given cada pantalla (Mesas, Logros, Amigos y grupo, Ranking, Skins, Cuenta, Ajustes, Mapas), When se abre, Then tiene cabecera, y sus listas muestran estado de carga, de vacío y de error con «Reintentar».
16. Given las pantallas migradas (Ranking, Skins, Cuenta, Ajustes, Mapas), When se usan, Then hacen todo lo que hacían antes (cambiar periodo de ranking, filtrar e inspeccionar skins, equipar, editar avatar, contraseña, depósito, ajustes, elegir hoyo libre).
17. Given skins por reclamar, When el jugador vuelve al hub, Then sale la revelación de skin de siempre y la skin pasa al inventario (sin cambios respecto a hoy).
17b. Given Logros, When se abre, Then muestra todos los logros en 2 columnas (también a 360 px), pendientes primero con su progreso, completados después; y en toda la UI no queda el texto «desafíos».
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
29. Given las imágenes del splash, su CSS inline en `index.html` y su JS propio, When se suman, Then pesan <150 KB y las imágenes son WebP (el logo y las fuentes que ya carga la app no cuentan si se reutilizan).
30. Given `prefers-reduced-motion`, When se ve el splash, Then es estático (sin parallax, sin deriva, sin partículas animadas).
31. Given calidad baja, When se ve el splash, Then usa menos capas y menos partículas que en calidad alta.
32. Given el splash en marcha, When el dedo o el ratón se mueven, Then las capas se desplazan a velocidades distintas (≥3 capas); sin input, derivan solas.
33. Given el destello del logo y el fuego, When se miden, Then ningún elemento parpadea más de 3 veces por segundo.

**Rendimiento y build**

34. Given `pnpm build` en la base de la rama (`3d12edf`) y al final, When se compara, Then el JS de la carga inicial no crece más de 15 KB gzip. «Carga inicial» = el chunk de entrada de `index.html` y sus imports estáticos (lo que el navegador pide antes del hub), sin los chunks de import dinámico (Three.js, GolfGame, inspector, Supabase). Las dos cifras quedan anotadas.
35. Given el repo, When se ejecuta `pnpm test`, Then pasan todos los tests existentes y los nuevos de router y reglas.
36. Given `vercel.json`, When se compara con el de antes, Then la CSP no cambia.

**Extras (opcionales, tareas separadas)**

37. Given una versión nueva con notas, When el jugador abre el juego por primera vez tras actualizar, Then ve un modal de novedades con «No volver a mostrar»; si lo marca, no vuelve a salir para esa versión.
38. Given el juego abierto, When se publica una versión nueva, Then en la siguiente comprobación periódica aparece un aviso «Hay versión nueva» con «Recargar».
39. Given el manifest, When se valida, Then tiene `id`, `scope`, `categories`, `orientation` e iconos `maskable`, y `theme-color` coincide con el de `index.html`.

## Points to clarify

Las 13 preguntas abiertas se resolvieron en *Clarifications* (C1-C13). Quedan:

- **suposición tomada** — La racha y el resto de estadísticas se ven en Cuenta › Progreso, no en el hub. *Base:* la composición de C10 no les da sitio. *Riesgo:* bajo; si se quiere un chip de racha en el hub, es un cambio pequeño.
- **suposición tomada** — El punto rojo de Logros marca logros completados desde la última vez que se abrió Logros, recordado en el dispositivo. *Base:* no hay dato de «visto» en el servidor y no se toca el backend. *Riesgo:* en otro dispositivo el punto puede volver a salir una vez.
- **suposición tomada** — El inspector de skin pasa a ser una pantalla completa apilada sobre Skins. *Base:* la regla «nunca un panel superpuesto». *Riesgo:* bajo; cambia solo cómo se abre.
- **suposición tomada** — La revelación de skin (skinReveal) y el popup de avisos siguen como capa superpuesta. *Base:* son eventos, no navegación. *Riesgo:* ninguno sobre lo pedido.
- **suposición tomada** — Los overlays dentro de la partida no se migran. *Base:* son parte del juego. *Riesgo:* si se quieren como pantallas, es otra spec.
- **suposición tomada** — La racha que se muestra es la calculada en el cliente y guardada en el perfil. *Base:* es el dato real que hay. *Riesgo:* puede diferir entre dispositivos hasta sincronizar.
- **suposición tomada** — El máximo de espera del splash por defecto es 15 s. *Base:* P7.4 (≤5 s preparar partida) con margen para red móvil. *Riesgo:* configurable.
- **suposición tomada** — `src/screens/` es una carpeta nueva de primer nivel. *Base:* K3.4 la permite con motivo. *Riesgo:* bajo.
- **decisión diferida** — Service worker / caché offline: fuera de este ciclo; si se hace, solo para assets estáticos y nunca para saldo ni API.
- **decisión diferida** — Backend de desafíos temporales, cofres, liga e historial de partidas: otra spec, con su migración.
- **decisión diferida** — Sección «Eventos» con retos con fecha y su backend (C1, C5).
- **área no formulable** — La identidad visual de la UI sobre una escena de bosque de día (el CSS actual es oscuro con oro/esmeralda/amarillo `#FFD23F`, sin tokens cyberpunk). Se concreta en los bocetos de C13.

## Clarifications

### 2026-11-12
- **C1 — Retos con fecha.** El humano: «No quiero de momento desafíos diarios y semanales. En todo caso los pondremos en eventos». → Desafíos muestra solo los retos permanentes reales (`CHALLENGES`). Sin sección temporal, sin datos DEMO y sin cuenta atrás de desafíos en el hub. Los retos con fecha pasan a una futura sección «Eventos» (decisión diferida, otra spec).
- **C2 — Liga.** Elegida la recomendación: el hub muestra «Nv N · <marco>» con barra de XP al siguiente nivel; Progreso muestra cuánto falta para el siguiente marco. No se usa la palabra «liga».
- **C3 — Torneos.** El humano eligió «Solo mesas»: la pantalla Torneos es la lista de mesas del lobby actual (entrada, premio, bote, reglas y botón de jugar) en su propia pantalla. Sin «mis partidas activas» ni calendario. La sala en vivo sigue como hoy, dentro del flujo de partida.
- **C4 — Logros.** El humano: «Pantalla de logros incluirá todos los desafíos pendientes primero (y su progreso) y abajo los completados. 2 desafíos por fila». → Logros = todos los retos permanentes (`CHALLENGES`, que ya incluyen los hitos de ranking): pendientes arriba con barra de progreso, completados abajo, en rejilla de 2 por fila (también en móvil).
- **C5 — Desafíos.** El humano: «Quítalo del hub, ahora los desafíos pasan a llamarse logros». → No hay icono ni pantalla Desafíos. En toda la UI (también en Skins) el texto «desafíos» pasa a «logros». El hueco queda para un futuro icono «Eventos».
- **C6 — Recompensas.** El humano: «No incluyas ese botón, el sistema de recompensas seguirá funcionando como hasta ahora». → Sin icono ni pantalla Recompensas. La revelación de skins por reclamar sigue saliendo sola al volver al hub (como hoy al volver al lobby). Cofres: fuera.
- **C7 — Escena del hub.** El humano: «Capas de parallax para la pantalla de carga. La pantalla del hub tendrá como protagonista un hoyo con three.js, la cámara irá rotando 360º, habrá alguna animación de partículas o alguna mariposa volando o una bola entrando al hoyo (todo esto aleatorio)». → El hub muestra un hoyo real en 3D con la cámara orbitando 360° en bucle lento y animaciones ambientales aleatorias (partículas, mariposa, bola que entra en el hoyo). Three.js se carga durante el splash. La escena se pausa cuando otra pantalla la tapa o la pestaña está oculta, y respeta el nivel de calidad. Con reduced-motion: cámara quieta y sin animaciones ambientales. Se sustituye el criterio 13 anterior («sin Three.js en el hub»).
- **C8 — Qué escena.** El humano: «No quiero un mapa, debe ser simplemente un hoyo en el centro, con entorno de día bosque normal, con apariciones aleatorias de los elementos que te he indicado». → La escena del hub no es ninguno de los 17 hoyos del juego: es un green con su hoyo y bandera en el centro, en un bosque normal de día, con apariciones aleatorias (partículas, mariposa, bola que entra en el hoyo). *Suposición tomada:* las capas del splash se capturan de esta misma escena (cielo, bosque lejano, green/hierba en primer plano), así el paso splash → hub es continuo. *Riesgo:* si el humano quiere otro paisaje en el splash, cambian solo las imágenes.
- **C9 — JUGAR.** Elegida la recomendación: JUGAR abre la pantalla de mesas con la última mesa usada destacada (2 toques hasta la partida). Secundarios: «Amigos/Privada» (grupo) y «Juego libre». *(Los secundarios quedan sustituidos por C10.)*
- **C10 — Composición del hub.** El humano fija la composición:
  - **Barra inferior:** Mapas (Juego libre) a la izquierda · JUGAR en el centro (botón dominante) · Práctica a la derecha.
  - **Columna izquierda:** Ranking arriba, Logros abajo.
  - **Columna derecha:** Skins arriba, Amigos abajo.
  - **Barra superior:** icono de usuario con el nivel (anillo de progreso alrededor del número) a la izquierda · logo en el centro · Ajustes y pantalla completa a la derecha.
  - No hay iconos de Torneos ni Progreso en el hub: Torneos (mesas) se abre con JUGAR.
- **C11 — Saldo, silencio y cuenta.** El humano: «Saldo desaparece, botón de silencio también. Acceso a la cuenta se accederá pulsando en el icono de usuario». → El hub no muestra saldo ni botón de silencio. El icono de usuario abre Cuenta, que incluye Progreso (nivel, marco, estadísticas) y el monedero.
  - **Excepción a la constitución U6.6** («botón de silencio visible»): decidida por el humano. El silencio sigue en Ajustes y con la tecla M. Se registra en la tabla de enmiendas de la constitución (D8.2).
  - *Suposición tomada:* el saldo sigue visible en la cabecera de la pantalla de mesas y en Cuenta. *Base:* para elegir una mesa de pago hay que ver si alcanza (S5.7: el dato es del servidor). *Riesgo:* si tampoco se quiere ahí, solo cambia esa cabecera.
- **C12 — Atrás en el hub.** El humano: «No hace nada». → Con el hub en pantalla, atrás (sistema o navegador) deja al jugador en el hub. Para salir se cierra la pestaña o la app.
- **C13 — Bocetos.** Elegida la recomendación: boceto HTML estático del splash antes de la fase 2 y del hub antes de la fase 3, a 375×812 y 1280×800. El humano lo aprueba y se construye contra él; queda en `02-DOCS/attachments/ui-pantallas/`.

## Revisions

- 2026-11-12 — Borrador inicial.
- 2026-11-12 — Revisión en frío: línea base de FPS y de bundle definida (14, 34), peso del splash acotado (29), sesión en recarga y dependencias inyectadas (4, 5), JUGAR sin mesa previa (10), tabla de contenido mínimo por pantalla. Los extras 37-39 se mantienen porque los pidió el humano como tareas opcionales.
