# Propuesta: carga de partida y cambios de hoyo sin tirones

Golf Cash Battle · three.js 0.169 · Vite 5 · pnpm · prioridad: móvil
Fecha: 2026-11-20 · Autor: arquitecto de rendimiento (agente) · Estado: propuesta, sin cambios en el repositorio

Fuentes leídas: `src/main.js` (completo), `src/game/GolfGame.js` (constructor, `load`, `#buildScene`, `dispose`, entrada, bucle, render), `src/game/render/{quality,textures,environment,course,hubScene}.js` (partes relevantes), `src/ui/splashBridge.js`, `src/match/matchmakingController.js`, `src/screens/matchmaking.js`, `src/ui/matchmakingView.js` (salida), `src/game/render/{resolutionGovernor,perfGovernor}.js`, `node_modules/three` r169 (`WebGLRenderer.compile/compileAsync/initTexture`, `WebGLPrograms`, `WebGLProgram.isReady`, `WebGLTextures`), `vercel.json`, `vite.config.js`, `package.json`, `scripts/verify.sh`, `02-DOCS/wiki/sdd/constitution.md`, `tests/golfgame-dispose.test.js`, `tests/helpers/fakeEnv.js`, los 4 JSON de medición. Además, una petición `curl -I` a un asset de producción para ver las cabeceras de caché.

---

## 0. Resumen

1. Desde el clic, el tiempo se reparte en: **sala de emparejamiento** (en práctica es una coreografía fija de 3,4-5,8 s, media ~4,6 s), **tramo posterior a la sala** (0,44-2,18 s medidos en escritorio) e **intro de cámara** (2,2 s fijos por hoyo, sin poder jugar).
2. El tramo posterior a la sala son **dos tareas largas seguidas**: `load()` síncrono (160-470 ms) y el **primer frame** (160-1800 ms). En el primer frame se paga el enlace de shaders, la subida de texturas, la primera sombra y los shaders del bloom.
3. **Hallazgo de código (alta confianza):** `compileAsync` se llama con el render target equivocado cuando hay bloom (`usePost`). Compila la variante «a pantalla» (ACES + sRGB), pero el juego dibuja en el render target del composer (variante sin tone mapping, lineal). Afecta a **14 de 17 hoyos en Medio** y a todos en Alto. Esa compilación previa se desperdicia, y el primer frame vuelve a compilar todo de forma síncrona.
4. Cada hoyo **destruye y crea el contexto WebGL** y reconstruye todo. Las transiciones bloquean 350-1170 ms en escritorio. **`load()` no se reutiliza en ningún sitio:** Reiniciar y Cambiar de mapa en Modo Libre también crean un `GolfGame` nuevo. Además, `#buildScene` solo libera geometrías, así que reutilizar el renderer exige primero un módulo de liberación.
5. En producción los chunks del juego (~95 KB gzip) se piden **después** de la sala, y los assets se sirven con `Cache-Control: public, max-age=0, must-revalidate`: cada carga los revalida.
6. Las cifras de frames (p50/p95) de las mediciones **no valen**: render por software, foco cambiante. Tampoco hay datos de móvil real. Lo sólido es la estructura (qué tareas largas hay y en qué orden) y los rangos en escritorio.
7. Recomendación, por fases: **F0** instrumento y línea base en móvil real → **F1** arreglos rápidos (cabeceras de caché, prefetch del motor, `compileAsync` correcto y esperado) → **F2** preparar el hoyo 1 durante la sala, en un contenedor oculto → **F3** renderer persistente durante la partida, con el hoyo siguiente preparado tras embocar → **F4** caché de texturas procedurales (en paralelo con F2).
8. Ideas del usuario: «3 mapas a la vez», no (más espera inicial y hasta 3 veces la memoria GPU, por el mismo beneficio que una ventana hoyo actual + siguiente). «Precargar en el splash», sí para el JS del motor. «Shaders en el splash», no: los programas mueren con el contexto del hub. El minijuego durante la carga, no.
9. La mayor ganancia restante es una **decisión de producto**: acortar la sala de práctica y la intro de 2,2 s. Los ~4,6 s de sala ya bastan para esconder la carga del hoyo 1.

---

## 1. Diagnóstico

### 1.1 Flujo real (verificado en código)

**Práctica y mesas locales** (`startMatch`, main.js l.305). Con `VITE_BACKEND=local` las mesas de pago también van por aquí con `MatchService` local.

```
clic ─ service.join (inmediato en local; ya trae match.courses = 3 índices)
     ─ go('matchmaking')
     ─ asientos: 200 ms + 7 × U(250..600) ms         (PLAYERS_PER_MATCH = 8)
     ─ 250 ms ─ setPhase('launching') ─ present()
     ─ go() «¡YA!» ─ 650 ms ─ leave() animación 520 ms (matchmakingView.js l.337)
     ─ playHole(0) → playScreen (l.363)
          loadGolfGame(): hubPreloader.release() + import('./game/GolfGame.js')   ← en prod el chunk se pide AQUÍ
          paintApp(view): releasePlay() → game.dispose() del anterior (renderer.dispose + forceContextLoss)
          .then: new GolfGame (nuevo WebGLRenderer, EffectComposer, bloom)        ┐
                 game.load(course): #applyQuality, #buildScene (entorno, pista,   │ TAREA LARGA 1
                 PMREM si toca, skin, efectos, bots), compileAsync SIN await,     │ (160-470 ms)
                 setAnimationLoop                                                 ┘
          primer rAF: composer.render → espera de enlace de programas, subida     ] TAREA LARGA 2
                 de texturas + mipmaps, mapa de sombras, shaders del bloom        ] (160-1800 ms)
          intro 2,2 s (INTRO_SECONDS): sin entrada hasta intro ≥ 1
```

Duración teórica de la sala de práctica: 200 + [1750..4200] + 250 + 650 + 520 = **3370-5820 ms** (media ~4595 ms). Las mediciones encajan: la primera tarea larga tras el clic empieza entre 4,25 y 5,3 s.

**En vivo / torneo** (Supabase, `startTournament` l.978 → `enterLive` → `showLiveRoom` → cuenta atrás hasta `startsAt` → `launchLive` l.1067 con bots cada 140 ms, `tournaments.start`, «¡YA!» 380 ms, salida → `beginLive` → `playLiveHole`). `match.courses` llega con el `join`. Entre hoyos no hay botón: `finishLiveHole` espera `LIVE_NEXT_MS = 1500` y pasa solo. El servidor solo exige `deadline + 2 min` (`time_up`), así que unos cientos de ms de carga no penalizan. El contador del hoyo va en ticks propios de cada jugador.

**Entre hoyos (práctica)**: embocar → `onDone` → `recordHole` → `showHoleResult` (overlay sobre el juego, que sigue dibujando) → clic «Siguiente hoyo» → `playHole(i+1)` → otra vez el destruir/crear completo.

**Modo Libre** (`playFreePlay` l.1467): «Reiniciar» llama a `onRestartHole` → `playFreePlay(courseIndex)` → **reconstrucción completa con contexto nuevo** (el `game.restart()` existente no se usa porque `onRestartHole` siempre viene definido). «Mapas» y «Siguiente hoyo» igual.

### 1.2 Hallazgos de código

| # | Hallazgo | Evidencia | Confianza |
|---|---|---|---|
| C1 | `compileAsync(scene, camera)` (GolfGame l.579) se ejecuta con `renderer.getRenderTarget() === null`. three r169 elige `toneMapping` y `outputColorSpace` del programa según el render target activo (`WebGLPrograms.js` l.111, l.165-172, l.202). Con `usePost` (bloom) el `RenderPass` dibuja en `composer.renderTarget1` → la variante es otra → **lo compilado antes no sirve** y el primer frame compila todo síncrono. `usePost` es verdadero en Medio para 14/17 hoyos (todos salvo El Molino del Prado, El Templo de la Selva y El Glaciar) y en Alto para todos. En Bajo no hay bloom. | lectura de three + `#applyQuality` l.267 + script sobre `THEMES` | Alta en el mecanismo. Magnitud no medida. |
| C2 | `compileAsync` no se espera: el bucle arranca en el mismo `load()` y el primer `composer.render` bloquea en `getProgramParameter(LINK_STATUS)` hasta que enlazan todos los programas. Sin `KHR_parallel_shader_compile`, `isReady()` devuelve true al momento (`WebGLProgram.js` l.1048), así que esperar no ayuda: el bloqueo pasa al primer render. | código three | Alta |
| C3 | Lo que `compile()` **no** cubre: materiales de profundidad de las sombras (se compilan en la primera pasada de sombra), los `ShaderMaterial` del bloom y del `OutputPass` (primer `composer.render`) y la subida de texturas (primer uso; `renderer.initTexture(t)` existe en r169, l.2794, y permite subirlas antes). | código three | Alta |
| C4 | Cada hoyo crea un `WebGLRenderer` nuevo y destruye el anterior con `forceContextLoss` (GolfGame l.468-486). Se pierden programas, texturas, el PMREM (`this.envMap ??=` solo dura una instancia) y el mapa de sombras. | código | Alta |
| C5 | **`load()` no se reutiliza en ningún flujo** (solo hay una llamada, main.js l.641). Si se reutilizara, `#buildScene` (l.493) solo libera geometrías: **no libera texturas, materiales ni mapas de sombra** de la escena anterior. Fugas de GPU garantizadas hasta escribir un módulo de liberación. Corrige la suposición de que Reiniciar/Cambiar mapa ya recargan sobre el mismo renderer. | grep `\.load(` | Alta |
| C6 | Materiales compartidos a nivel de módulo (`outlineMat`, `emberMat` en course.js; `trunkMat`, `rockMat`, `lampPostMat`… en environment.js; `reedMat`… en flora.js; `contactMat` perezoso). Si se liberan «todos los materiales de la escena», esos se recompilan en el hoyo siguiente. | grep | Alta |
| C7 | Las texturas procedurales no tienen caché (`textures.js`, `lushEnvironment.js`, `flora.js`, `attractions.js`, `cyberpunkEnvironment.js`). Dentro del mismo hoyo se repite trabajo: `dirtMaps` una vez para la plataforma y otra por cada tier, `rockFloorMaps` dos veces en temas de roca. `sandMaps` y los normal maps recorren píxel a píxel en JS (`getImageData` + bucles), con un coste que crece con `texScale` (0,5/1/2 → 128/256/512 px). El generador es determinista (`rand(seed)`), así que se puede cachear. Las skins de bola ya cachean canvases (`ballPaint.js` l.838, `ballSkins.js` l.9): hay precedente. | código | Alta en la duplicación. Peso en `load()` no medido. |
| C8 | three r169 comparte la subida a GPU entre texturas con la misma `source` (`WebGLTextures.js` `_sources`, `getTextureCacheKey`). Un caché puede devolver `master.clone()`: `repeat` y `offset` quedan independientes y la imagen se sube una vez. Ojo: `withNormals` y `sandMaps` **comparten el objeto `repeat`/`offset`** entre map, normalMap y roughnessMap. Al clonar hay que volver a enlazarlos. | código three + textures.js l.42-48, l.359-360 | Alta |
| C9 | La entrada se enlaza en el constructor (GolfGame l.142, `#bindInput` l.900-1266) con escuchas en `window` (`keydown`: Espacio, Esc → `onOpenSettings`; `pointermove/up`). Un juego preparado oculto durante la sala **robaría Esc y Espacio**. | código | Alta |
| C10 | Las claves de programa dependen del número de luces direccionales y puntuales (los temas tienen 0 o 2 `rim`, y `maxLights` recorta las puntuales), de la niebla, de las sombras y de `customProgramCacheKey` (agua, hierba, `bunker2`, skins por patrón). Entre hoyos de temas distintos **la reutilización de programas es parcial**. Su tasa es desconocida. | código | Media |
| C11 | Los rivales usan `pickRandomSkins` (Math.random) y `createSkinMaterial(skin, 'low')` con clave de programa por patrón (`skinMaterial.js` l.159): cada skin rival nueva compila en el primer frame. | código | Alta |
| C12 | La física no depende del render: `segmentsOf(course)` + `step()` con `t = tick·DT`. El tick empieza en `load()`. Los bots en vivo arrancan en `botStartTick = INTRO_SECONDS/DT`. Construir lo visual antes no toca la física **si `tick`, la bola y los bots se inicializan al arrancar el hoyo y no al prepararlo**. `physics.js`, `replay.js` y `courses.js` se copian al servidor (`sync:functions`): no se tocan. | código + constitución C1.4/Q2.2 | Alta |
| C13 | Contextos: el hub tiene su propio renderer (se libera en `loadGolfGame`); `skinThumbRender.js` crea un contexto temporal para miniaturas (en prod se cargó a los 234 ms del clic). `coursePreview.js` usa un `sharedRenderer`. Durante la sala puede haber un contexto transitorio de miniaturas además del hub. | código + JSON prod T1 | Media (no se contó en vivo) |
| C14 | Las cabeceras de producción de un asset con hash son `Cache-Control: public, max-age=0, must-revalidate` (`X-Vercel-Cache: HIT`). Cuadra con `transferSize 300 B / encodedBodySize 0` (respuestas 304) en la medición de prod. Cada carga paga una ida y vuelta por chunk. `vercel.json` solo define CSP y seguridad. | `curl -I` hoy | Alta |
| C15 | Peso del grupo de chunks del juego (dist local, puede diferir algo de prod): GolfGame 19,8 KB + course 37,8 + ballSkins 20,9 + skinFx 7,3 + textures 4,9 + effects 5,1 ≈ **96 KB gzip** (≈ 270 KB sin comprimir). three (135 KB gz) ya llega con la escena del hub. | `gzip -c` sobre `dist/assets` | Alta (para ese build) |
| C16 | Los gobernadores (`ResolutionGovernor`, `PerfGovernor`) toman los frames lentos tras la carga (<1 s cada uno) como señal de «el móvil no llega». Pueden bajar resolución o FX al empezar el hoyo. | código | Media (hipótesis) |

### 1.3 Qué cifras de las mediciones son sólidas y cuáles son ruido

**Sólidas (en ese navegador de escritorio con render por software; no extrapolables en valor absoluto a móvil):**

| Dato | Valor | Por qué es fiable |
|---|---|---|
| Duración aproximada de la sala (clic → primera tarea larga de carga) | 4,25-5,3 s en 8 de 9 tandas | Encaja con la coreografía calculada en el código (3,4-5,8 s) |
| Tramo posterior a la sala (inicio tarea 1 → fin tarea 2 ≈ «canvas») | dev: 2179 (El Portal frío), 1331, 1535, 509, 444 ms; prod: ~1690, 1553, 960 ms | Tareas largas de la API Long Tasks, contiguas (hueco ≤ 5 ms). El sondeo del canvas no podía correr mientras el hilo estaba bloqueado: «clic→canvas» ≈ fin de la tarea 2 |
| Tarea 1 (`load()` + constructor + release del hub) | 160-470 ms; `syncMs` de `load()` 150-385 ms | Medida directa y coherente entre tandas |
| Tarea 2 (primer frame) | 160-1800 ms, muy variable | Existe siempre. Su variabilidad es la señal: ver hipótesis H2 |
| Transiciones de hoyo (bloqueo total) | 350-1170 ms (mediana ~470), en dos tareas: ~170-400 ms al pulsar (desmontaje + DOM + `dispose`/contexto) y ~80-940 ms (`load` + primer frame) | Patrón repetido en 13 transiciones |
| Contexto recreado en cada hoyo | sí, siempre | Código + `__golf` nuevo + canvas nuevo |
| En prod, chunks del juego pedidos tras la sala | `GolfGame/course/skinFx` a los 4249 ms (T1), 4942 ms (T2), 8880 ms (T3) | Resource Timing |
| `renderer.info` tras cargar | programas 64-83, texturas 46-73, geometrías 86-184 | Lecturas directas. Varían por hoyo y por momento de lectura |

**Ruido o no fiable:**

- **Todos los p50/p95 de frames.** El rAF iba a 144 Hz (7 ms) con foco y a 35-70 ms sin él o con la pestaña tapada. El HUD de prod marcaba 18-22 FPS por el render por software. Solo vale el máximo de frame justo tras la carga, porque duplica la tarea larga 2.
- **La transición de 4,1 s de prod T1** (hoyo 1→2): la marca del clic se puso 1-2 s antes del clic real (lo dice el propio JSON). `loadSyncRel_ms` 3298 lo confirma.
- **prod T3 «clic→sala 3842 ms»**: anómalo, sin explicación (la práctica une al instante). Probablemente el clic llegó tarde por la herramienta o el foco.
- **Tiempos de red de dev** (Vite sin empaquetar) y **de prod** (todo 304 desde caché): no hay ninguna carga fría real.
- Los recuentos `render_calls: 1, triangles: 1` (lectura entre frames).
- `medicion-prod-mobile.json` del primer scratchpad: solo la carga del login (FCP/LCP vacíos). Útil únicamente para `main.js` 94 KB y supabase 64 KB transferidos.

**Hipótesis (no medidas):**

- **H1**: la tarea 2 es sobre todo compilación y enlace síncrono de shaders (agravada por C1). Le siguen la subida de texturas, la primera sombra y el bloom. Falta el desglose.
- **H2**: la gran variabilidad de la tarea 2 (El Portal: 1801 ms en sesión fría frente a 163 ms en otra tanda posterior) se debe a la **caché de shaders del proceso GPU de Chrome** (en memoria y en disco), que abarata recompilar fuentes idénticas en un contexto nuevo. Si se confirma: la primera partida de la vida del navegador es la peor y en iOS el comportamiento puede ser otro.
- **H3**: en un móvil de gama media, la CPU de `load()` será 2-5 veces más lenta que en este escritorio (12 núcleos) y la GPU real compila distinto que SwiftShader. Puede ir mejor o peor en la tarea 2. **No hay ningún dato.**
- **H4**: el primer bloque de cada transición (~170-400 ms) incluye un coste notable de `forceContextLoss`/`dispose` y de crear el DOM del HUD. Falta el desglose.

### 1.4 Qué falta medir antes de comprometer cada fase

| Falta | Bloquea |
|---|---|
| Línea base en **móvil real** (Android gama media; iPhone si es objetivo): sala, post-sala, transiciones, tareas largas, `KHR_parallel_shader_compile` disponible, GPU real | Criterios numéricos de F1-F3 |
| Desglose de la tarea 1: import, release del hub, constructor, entorno, pista, PMREM, skin, efectos, bots | Saber si F4 (texturas) merece la pena y si F2 necesita trocear `buildEnvironment` |
| Desglose del primer frame: programas nuevos en ese frame, tiempo de `initTexture` agregado, primera sombra, bloom | Magnitud de F1c y de C1 |
| Programas nuevos por hoyo (con nombre y clave) y reutilización entre hoyos | Ganancia de F3 en shaders y posible «dieta de variantes» |
| Memoria GPU aproximada (`renderer.info.memory` + estimación por texturas y sombras) tras 1, 2, 3 hoyos y tras volver al hub | Seguridad de F2/F3 y política por calidad |
| Contextos WebGL vivos en cada momento | Regla «nunca dos contextos» |
| Carga fría de red (DevTools «Fast 4G», caché desactivada) | Ganancia de F1a/F1b |
| Duración real de la sala en vivo (variable por `startsAt`) | Cuánta preparación cabe en vivo |

→ Por eso **F0 (instrumento + protocolo) va primero**. Ver §4.F0.

---

## 2. Evaluación de opciones

Leyenda de la ganancia: **post-sala** = tramo desde que acaba la sala hasta el primer frame jugable visible; **transición** = desde «Siguiente hoyo» hasta el hoyo visible. Las cifras de ganancia salen del escritorio medido; en móvil se esperan mayores en valor absoluto, pero están por medir.

### 2.1 Ideas del usuario

**(1) Cargar los 3 mapas de una vez, con pantalla de carga progresiva y minijuego con shaders ya compilados**

- Ganancia: transiciones casi instantáneas (igual que la ventana deslizante de F3).
- Coste: ~3 veces el trabajo de CPU y GPU **antes** del hoyo 1. Con 0,5-2,2 s por hoyo en escritorio (más en móvil) **no cabe con holgura en la sala** de ~4,6 s y alargaría la espera inicial, que es justo lo que se quiere reducir. Tres escenas residentes: texturas y geometrías por triplicado. Con sombras activas, cada sol reserva su mapa al primer render (1024² = 4 MB en Medio; **4096² = 64 MB en Alto**). Los programas dependen de las luces de cada escena (C10): hay que compilar cada escena con sus luces.
- El minijuego durante la carga compite por el mismo hilo y la misma GPU: carga más lenta. En móvil es otra escena WebGL o mucho DOM animado. La sala ya cumple ese papel.
- Riesgo: memoria GPU en móvil (pérdida de contexto o cierre de la pestaña en iOS), complejidad.
- **Veredicto: NO en esta forma.** Se consigue lo mismo con la ventana deslizante «hoyo actual + siguiente» (F2 + F3) con ~1/3 de la memoria y sin alargar la espera. Variante aceptable y opcional: preparar el hoyo 2 en la sala solo si sobra tiempo y la calidad es Alta (decisión del usuario, tras datos).

**(2) Aprovechar el splash para precargar recursos**

- JS del motor (chunks `GolfGame` y dependencias, ~96 KB gz): **SÍ, pero no en el splash** (ahí compite con el arranque, que tiene su margen de 8 s). Mejor en reposo del hub (`requestIdleCallback` tras `boot.hub()`) y, como seguro, al pulsar Jugar. Ganancia: quita el import del camino crítico en frío (en caché es ~1 ida y vuelta; en 4G frío, varios cientos de ms; sin medir). Coste: casi nada. Riesgo: una tarea de parseo de 50-300 ms en el hub (se mide). → **F1b.**
- Mapas, escenas y texturas en el splash: **NO.** Todavía no se sabe qué 3 hoyos tocarán (salen en `join`), el trabajo sería para un contexto que se destruye y alargaría el arranque. Lo único razonable, y opcional tras F4: generar en reposo del hub las texturas genéricas en CPU (madera, tierra, rayas, chevron, caja, punto suave), que no dependen del tema.

**(3) Compilar shaders en el splash**

- Los programas WebGL pertenecen al contexto. El del splash/hub se libera antes de crear el del juego (regla de un solo contexto), así que **no se conserva nada**.
- Lo único que podría ayudar es «calentar» la caché de shaders del proceso GPU de Chrome compilando en el contexto del hub **las mismas fuentes exactas** que usará el juego. Exige el mismo tone mapping, espacio de color, número de luces, sombras, niebla y defines. Es frágil, no está garantizado, no existe igual en Safari iOS y mete trabajo de GPU en el arranque.
- **Veredicto: NO** como fase. Como mucho, un experimento medible tras F3, si los datos de H2 lo justifican.

### 2.2 Alternativas

| Opción | Ganancia esperada | Coste | Riesgos | Veredicto |
|---|---|---|---|---|
| **A. Cabeceras de caché** `immutable` para `/assets/*` (vercel.json) | Quita una ida y vuelta por chunk en cada carga (arranque y juego). 50-200 ms por nivel de cascada en 4G; sin medir | Mínimo | Ninguno (nombres con hash). `version.json` e `index.html` siguen sin caché | **SÍ, F1a** |
| **B. Prefetch del motor** (separar `import` de `hubPreloader.release()`) | Quita la descarga y el parseo del motor del post-sala en frío | Bajo | Tarea de parseo en reposo del hub | **SÍ, F1b** |
| **C. `compileAsync` con la variante correcta + esperarlo + subir texturas con `initTexture` en trozos + primer render oculto antes de mostrar el canvas y arrancar la intro** | En temas con bloom elimina una compilación entera duplicada (C1). El bloqueo de 160-1800 ms pasa a compilación en paralelo (si hay `KHR_parallel_shader_compile`) y a tareas cortas. El tiempo total baja algo; el hilo deja de congelarse | Bajo-medio (solo GolfGame.js) | Si no hay la extensión, el bloqueo solo cambia de sitio. Hace falta un tope de tiempo. El tick debe empezar al mostrarse | **SÍ, F1c** |
| **D. Calentar el hoyo 1 durante la sala** (contenedor oculto, como `createHubPreloader`) usando `match.courses[0]` | Esconde casi todo el post-sala (0,44-2,18 s en escritorio; más en móvil) dentro de los ~4,6 s de sala. Post-sala objetivo < 250 ms | Medio-alto (API de GolfGame + orquestador + cableado en main.js) | Tirones en la animación de la sala (hay que trocear), cancelación, contexto del hub, robo de teclado (C9), revancha con el juego anterior vivo, mesa en vivo sin entorno de pruebas | **SÍ, F2** (la mayor ganancia en el primer hoyo) |
| **E. Renderer persistente durante la partida** (un contexto por partida) | Sin crear ni destruir contexto por hoyo. Conserva programas comunes (bloom, salida, sombras, bola, partículas, materiales compartidos), el PMREM y la canvas | Alto (módulo de liberación + reasignación de la canvas a la nueva pantalla) | Fugas de GPU si la liberación falla (C5). Texturas negras o blancas si se libera algo compartido (C6). Regresiones en salir, revancha y desempate | **SÍ, F3** |
| **F. Ventana deslizante: preparar hoyo N+1 tras embocar el N** (overlay de resultados o pausa en vivo) | Transición objetivo < 300 ms (hoy 350-1170 ms en escritorio) | Incluido en F3 | Dos escenas vivas un rato (memoria). Trabajo durante el espectador en vivo | **SÍ, F3** |
| **G. Caché de texturas procedurales** (por función + argumentos + `texScale`, con clones) | Quita la generación en CPU repetida dentro del hoyo, entre hoyos y entre partidas. Con F3 también evita volver a subirlas | Medio (textures.js + 4-5 módulos que generan) | Romper el enlace de `repeat` (C8). Memoria CPU de canvases (con tope LRU). Liberar un maestro en uso | **SÍ, F4** (en paralelo con F2) |
| **H. Caché de texturas «por tema»** | Pocos aciertos: 3 hoyos de 17 en 14 temas casi nunca repiten tema | — | — | **NO** como clave; la clave buena es la de G |
| **I. Renderer único hub + juego** | Sin crear contexto al entrar ni al volver; algún programa compartido | Alto (refactor de hubScene.js, estado global del renderer: sombras `autoUpdate`, gobernadores, bucles) | Fugas de estado entre escenas; muchas regresiones en el hub | **NO por ahora.** Revisar tras F3 con datos |
| **J. Acortar la sala de práctica / mesas locales** (asientos simulados) | La mayor ganancia bruta en práctica: de ~4,6 s a ~2 s posibles | Bajo | Es diseño y producto (sensación de «buscar rivales») | **Decisión del usuario** (F5) |
| **K. Intro de 2,2 s por hoyo** (acortar o saltar con un toque) | Hasta 2,2 s × 3 «hasta poder jugar» | Bajo | `botStartTick` depende de `INTRO_SECONDS` (mismo valor en todos los clientes en vivo; el servidor no lo usa, según grep en `supabase/functions`) | **Decisión del usuario** (F5) |
| **L. Reiniciar en Modo Libre sin reconstruir** (usar `game.restart()`) | Reinicio inmediato en vez de un contexto nuevo | Muy bajo | Se pierde la intro al reiniciar (cambio visible) | **Decisión del usuario**; con F3 se resuelve igualmente |
| **M. Dieta de variantes de shader** (unificar tipos de material o defines) | Proporcional a los programas eliminados (hoy 64-83 por hoyo) | Medio | Cambios visuales | **Tras F0**, con la lista de programas |
| **N. Texturas en un worker** (`OffscreenCanvas` 2D) | Saca de hilo la generación de texturas | Medio-alto (ImageBitmap, `flipY`, colorSpace) | Safari < 16.4 | **Solo si F0/F4 muestran que las texturas dominan** |
| **O. Hold en la sala** («Preparando el campo…» hasta N ms si la preparación no ha terminado) | Asegura el post-sala corto en móviles lentos | Bajo | Alarga la sala en esos móviles | **SÍ, dentro de F2**, con tope que decide el usuario |
| **P. Cortinilla** (no mostrar la canvas hasta el primer frame real) | Percepción: sin pantalla negra congelada | Muy bajo | Ninguno | **SÍ, dentro de F1c** |

---

## 3. Propuesta final recomendada

### 3.1 Orden y dependencias

```
Ola 0:  F0 instrumento + protocolo ──┬── (el usuario mide LÍNEA BASE en móvil real)
        F1a cabeceras (vercel.json) ─┘   (puede ir en paralelo con F0)
Ola 1:  F1b prefetch (main.js)  ∥  F1c compilación correcta (GolfGame.js)  ∥  F4 caché de texturas (render/*)
        (archivos disjuntos)                                                    → el usuario mide
Ola 2:  F2 hoyo 1 en la sala (GolfGame.js, main.js, gamePreloader.js)  [F4 puede seguir en paralelo]
                                                                                → el usuario mide
Ola 3:  F3 renderer persistente + hoyo siguiente (GolfGame.js, main.js, sceneDisposal.js)  [tras F2 y F4]
                                                                                → el usuario mide
F5 (decisiones de producto): sala más corta, intro, Reiniciar en Modo Libre, dieta de shaders, worker
```

Secuencial obligatorio: F0 → F1c → F2 → F3 (los tres tocan GolfGame.js y main.js). F1b toca main.js pero solo en `loadGolfGame` y en dos llamadas: puede ir en paralelo con F1c (GolfGame.js), no con F2. F4 solo toca `src/game/render/*` y un módulo nuevo: va en paralelo con F1 y F2. F3 necesita el contrato de F4 (ver §4.F4, «Contrato con F3»), así que empieza cuando F4 esté fusionado.

### 3.2 Criterios de aceptación (borrador; se fijan en números tras la línea base de F0)

Dispositivo de referencia: el móvil Android de gama media que elija el usuario, calidad automática (Medio), práctica en producción, 5 tandas «calientes» (segunda partida de la sesión) y 2 «frías» (navegador recién abierto). Mediana y máximo.

| Métrica (las calcula el instrumento de F0) | Línea base | Tras F1 | Tras F2 | Tras F3 |
|---|---|---|---|---|
| `post_sala_ms` (fin de la salida de la sala → primer frame visible) | medir | −30 % | **≤ 250 ms** (mediana) si la preparación terminó; **≤ 300 ms** de hold extra como máximo | = F2 |
| `max_longtask_post_sala_ms` | medir | ≤ 50 % de la base | ≤ 120 ms | = F2 |
| `max_longtask_sala_ms` (durante la sala) | medir | = base | ≤ 150 ms (preparación troceada) | = F2 |
| `transicion_ms` (clic «Siguiente hoyo» → hoyo visible) | medir | −20 % | = F1 | **≤ 300 ms** mediana, ≤ 600 ms máximo |
| `max_longtask_transicion_ms` | medir | — | — | ≤ 120 ms |
| `programas_frame1` (programas nuevos creados dentro del primer frame) | medir | **≤ 12** en temas con bloom (solo sombras y post) | ≤ 12 | ≤ 4 en hoyos 2-3 |
| Contextos WebGL creados por partida de 3 hoyos | 3 (+hub) | 3 | 3 | **1** |
| Fugas: `renderer.info.memory.textures/geometries` tras el hoyo 3 frente al hoyo 1 | — | — | — | ≤ 1,2× (sin crecimiento entre 3 partidas seguidas) |
| Visual idéntico (checklist con capturas lado a lado) | — | sí | sí | sí |
| `pnpm test` y `pnpm run build` en verde; replay y determinismo intactos | sí | sí | sí | sí |

Constitución P7.4 («preparación de partida y cambio de mapa ≤ 5 s»): hoy clic→canvas es 5-6,5 s en dev y 6-9,9 s en prod con la sala incluida. Tras F2 quedaría en sala + ~0,25 s, es decir, **en el límite**. Cumplirlo con margen pasa por la decisión J (sala más corta).

### 3.3 Qué decide el usuario en cada fase

- **F0**: dispositivo(s) de referencia; si se mide también en iPhone; si acepta un botón «Copiar informe» visible solo con `?perf=1`.
- **F1a**: nada (cambio de infraestructura sin efecto visible).
- **F1b**: prefetch en reposo del hub para todos los usuarios (~96 KB gz) o solo al pulsar Jugar; respetar `Save-Data`.
- **F1c**: nada visible salvo que la canvas aparezca un instante más tarde, ya con imagen. Confirmar que se acepta.
- **F2**: tope del hold en la sala (propuesta: práctica 2000 ms, en vivo 1000 ms); qué pasa si vuelve al hub con la búsqueda activa (hub sin 3D para conservar la preparación, recomendado, o hub 3D descartándola); activar en vivo sin poder probarlo (ver P7).
- **F3**: presupuesto de memoria. Propuesta: siempre «actual + siguiente» y nunca 3. En calidad Baja, el siguiente solo tras embocar.
- **F4**: tope del caché (propuesta: Bajo 8 MB, Medio 24 MB, Alto 64 MB de canvases en CPU).
- **F5**: sala más corta, intro, Reiniciar en Modo Libre, dieta de shaders.

---

## 4. Directrices para implementadores

### 4.0 Reglas comunes (todo implementador las lee antes que su bloque)

- Repo: `C:\Users\DEV\Desktop\golfito`. Lee `CLAUDE.md` del repo. **Ramas**: cada persona trabaja en la suya (`la-yuinta-mangante` para Gonzalo, `la-chaqueta-bionica` para su compañero). El usuario de git configurado es «Chakets», que probablemente es el compañero, pero **confírmalo con quien te habla antes de tocar nada**. Antes de cambiar: `git fetch origin <rama> && git checkout <rama> && git pull origin <rama>`. Nada de push a `main` ni a la rama del otro.
- Commits **solo si el orquestador lo pide**. Formato gitmoji + Conventional Commits (`⚡️ perf(game): …`). Autor Chakets o La Yuinta. **Sin trailers de IA** (constitución K3.5; `scripts/verify.sh` lo comprueba).
- Gestor: **pnpm** siempre (`pnpm install`, `pnpm test`, `pnpm run build`). Nunca `npm`/`npx`. No crear `package-lock.json`. No añadir dependencias.
- **No abrir navegador** para verificar. Las comprobaciones en navegador las hace el usuario: entrega su checklist.
- **Prohibido tocar**: `src/game/physics.js`, `src/game/replay.js`, `src/game/courses.js` (se copian al servidor), `src/game/bots.js` (salvo que se diga), `src/game/remoteBall.js`, `supabase/**`, `src/wallet/**`, `src/antibot/**`.
- **Mesas de pago**: nadie las juega en producción. Solo en el servidor local `pnpm dev` con `VITE_BACKEND=local` (monedero demo). En producción solo práctica (gratis).
- Lógica pura en módulos testables sin DOM ni WebGL, siguiendo el estilo `*Rules.js` del repo. Tests con `node --test` en `tests/<nombre>.test.js`, usando `tests/helpers/fakeEnv.js` (temporizadores falsos) donde haga falta. three se puede importar en Node (sin renderer) para tests de liberación.
- Toda medición nueva pasa por el instrumento de F0 (`src/game/perfProbe.js`) y es no-op sin `?perf=1`.
- Definición de terminado: `pnpm test` y `pnpm run build` en verde, tests nuevos que fallan sin el cambio, checklist manual para el usuario, nota de medición (constitución P7.5).
- Idioma: interfaz en español. Identificadores en un solo idioma por módulo (K3.3).

---

### F0 — Instrumento de medición y protocolo (modelo: **sonnet**)

**Objetivo.** Que el usuario pueda medir en un móvil real, sin DevTools, y pegar un informe JSON fiable. Desglosar las tareas largas de la carga.

**Archivos a tocar**
- NUEVO `src/game/perfProbe.js`: núcleo puro + enganche mínimo al DOM.
- NUEVO `src/ui/perfPanel.js`: botón flotante «Copiar informe» y «Reiniciar», solo con `?perf=1`.
- `src/game/GolfGame.js`: marcas (no cambiar comportamiento).
- `src/main.js`: marcas en `startMatch`, `startTournament`, `launchLive`, `playScreen`, `showHoleResult`/clic en «Siguiente», `finishLiveHole`, `goHome`; montar `perfPanel` si `?perf=1`; leer `?perfcourses=`.
- NUEVO `tests/perf-probe.test.js`.

**No tocar**: render (`src/game/render/*`), física, servidor, estilos globales (el panel lleva su CSS inline mínimo).

**Diseño**
- `perfEnabled(search = location.search): boolean`, pura (true solo con `perf=1`).
- `createProbe({ now, mark, measure, doc, nav, storage })`, inyectable para tests. Devuelve:
  - `mark(name, detail?)` → `performance.mark('gcb:' + name)` + muestra `{t, visible: doc.visibilityState === 'visible', focus: doc.hasFocus()}`.
  - `span(name)` → función `end()` que crea `performance.measure('gcb:' + name)`.
  - `gl(renderer, label)` → instantánea `{programs: renderer.info.programs?.length, geometries, textures, calls}`.
  - `count(name, delta)` → contadores (contextos creados y perdidos, texturas generadas…).
  - `frames.start(label)` / `frames.stop(label)` → histograma con rAF propio: `{n, p50, p95, max, gt33, gt50, gt100}`.
  - `report()` → JSON `{schema: 1, device: {ua, dpr, cores, memory, gpu, softwareGpu, parallelCompile}, quality, url, runs: [...], longtasks, loaf, reliability: {ok, reasons[]}, derived}`.
  - `reset()`.
  - `gpu` y `softwareGpu` salen de `WEBGL_debug_renderer_info` (`/SwiftShader|llvmpipe|Basic Render|software/i` → `softwareGpu: true`). `parallelCompile = !!renderer.extensions.has('KHR_parallel_shader_compile')`, leído en el primer `GolfGame`.
- Observadores: `PerformanceObserver` `longtask` y `long-animation-frame` (try/catch; LoAF guarda `duration`, `blockingDuration` y los 3 primeros `scripts[].sourceURL/invoker`).
- **Fiabilidad automática**: la tanda es NO FIABLE si en cualquier marca entre `click` y `playable + 6 s` hubo `visible=false` o `focus=false`, o si `softwareGpu`. Los frames solo se incluyen en `derived` si es fiable.
- Persistencia: últimas 10 tandas en `localStorage` (`gcb.perf.runs`), con try/catch.
- `window.__gcbPerf = probe` con `?perf=1`. `window.__golf` se mantiene.
- **Marcas** (nombres exactos, prefijo `gcb:`): `click`, `join:end`, `room:shown`, `room:launching`, `room:go`, `room:end` (tras `search.leave()`), `import:start`, `import:end`, `hub:release`, `ctx:create`, `ctx:lost`, `load:start`, `env:start`/`env:end`, `course:start`/`course:end`, `pmrem:start`/`pmrem:end`, `ball:start`/`ball:end` (skin + efectos), `bots:start`/`bots:end`, `load:end`, `compile:start`, `compile:end` (cuando resuelve `compileAsync`), `frame1:start`/`frame1:end` (primer `#frame`, con `gl()` antes y después), `playable` (primer frame con `intro >= 1`), `hole:done`, `hole:next:click`, `dispose:start`/`dispose:end`. Cada marca lleva `{hole, course, courseIndex}` en `detail`.
- **Métricas derivadas** (pura `derive(marks)`, testable): `sala_ms = room:end − click`; `post_sala_ms = frame1:end − room:end`; `jugable_ms = playable − click`; `transicion_ms[i] = frame1:end(i) − hole:next:click(i−1)`; `max_longtask_sala_ms`, `max_longtask_post_sala_ms`, `max_longtask_transicion_ms[i]`; `programas_frame1[i]`; `load_desglose[i]` (env, course, pmrem, ball, bots); `contextos_partida`.
- `?perfcourses=3,7,11` (solo con `perf=1` y **solo práctica**, `entryFee === 0`): en `startMatch`, tras `service.join`, sustituye `match.courses` por esos índices (validados con `0 <= i < COURSES.length`; si no son válidos, se ignora). Sirve para repetir el mismo trío entre tandas. **No lo apliques a mesas de pago ni a vivo.**
- Coste sin `?perf=1`: una constante booleana evaluada una vez; todas las llamadas son `if (!PERF) return`. Nada de `performance.mark` ni observadores.

**Tests (`tests/perf-probe.test.js`)**: `perfEnabled` con distintas `search`; `derive()` sobre una secuencia de marcas sintética (incluidos hoyos sin `room:end`, es decir, vivo reanudado); la fiabilidad marca NO FIABLE con `focus=false` o `softwareGpu`; el histograma de frames da p50/p95/max correctos; con la sonda desactivada no se llama a `mark`; `perfcourses` se ignora con índices inválidos y con `entryFee > 0` (extrae la regla a una función pura `forcedCourses(search, tier, total)`).

**Protocolo para el usuario (va en el checklist)**
1. Móvil Android de referencia, Chrome actualizado, cargador puesto, brillo fijo, sin ahorro de energía. Calidad automática.
2. Abrir `https://golf-cash-battle.vercel.app/?perf=1&perfcourses=3,6,12` (El Portal, Looping Neón y El Molino del Prado: hay bloom, neón y día).
3. «Fría»: cerrar Chrome del todo (multitarea), abrir, entrar, Práctica, jugar los 3 hoyos (pulsar «Siguiente hoyo» nada más salga), «Copiar informe», pegarlo en el chat. «Caliente»: repetir otra partida sin cerrar. Hacer 2 frías y 5 calientes.
4. No cambiar de app ni bloquear la pantalla durante la tanda (si no, sale NO FIABLE).
5. Opcional, red fría: en un PC, DevTools → Network «Fast 4G» + «Disable cache», misma URL, una tanda.
6. Mesas de pago: solo en local (`pnpm dev`, `VITE_BACKEND=local`). En producción, nunca.

**Checklist manual (usuario)**: sin `?perf=1` no aparece el panel y no hay `window.__gcbPerf`; con `?perf=1` el informe tiene las marcas de los 3 hoyos; `perfcourses` fuerza los mapas en práctica; el juego se ve y se juega igual.

**Riesgos y rollback**: bajo; revertir el commit. **No hacer**: medir FPS como criterio cuando `softwareGpu` es true; cambiar el comportamiento del juego; enviar el informe a ningún servidor.

---

### F1a — Cabeceras de caché para assets con hash (modelo: **haiku**)

**Objetivo.** Que los chunks con hash no se revaliden en cada carga.

**Archivo**: solo `vercel.json`. **No tocar** el bloque CSP existente.

**Diseño**: añadir al array `headers` una entrada nueva (sin modificar la existente):
```json
{ "source": "/assets/(.*)", "headers": [ { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" } ] }
```
No tocar `/`, `index.html`, `admin.html`, `version.json`, `/splash/*`, `/hub/*` ni `/skins/*` (no llevan hash o deben refrescarse).

**Tests**: añadir a `tests/manifest.test.js` o crear `tests/vercel-headers.test.js`. El test lee `vercel.json` y comprueba que existe la regla `/assets/(.*)` con `immutable`, que la regla CSP sigue intacta y que ninguna regla con `immutable` cubre `/` ni `version.json`.

**Checklist (usuario, tras desplegar la rama en la vista previa de Vercel)**: `curl -sI https://<preview>/assets/<cualquier>.js` muestra `max-age=31536000, immutable`; `curl -sI https://<preview>/` sigue con `max-age=0`; el aviso de versión nueva (`versionCheck`) sigue funcionando tras un segundo despliegue.

**Riesgo**: ninguno conocido. Rollback: quitar la entrada. **No hacer**: cachear `index.html` ni `version.json`.

---

### F1b — Prefetch del motor del juego (modelo: **sonnet**)

**Objetivo.** Que `import('./game/GolfGame.js')` no esté en el camino crítico tras la sala.

**Archivos**: `src/main.js`. NUEVO `src/game/prefetchRules.js` (pura) y `tests/prefetch-rules.test.js`. **No tocar** GolfGame.js ni splashBridge.js.

**Diseño**
- En main.js separar (l.72):
  ```js
  let golfGameP = null;
  const importGolfGame = () => (golfGameP ??= import('./game/GolfGame.js').then((m) => m.GolfGame)
    .catch((e) => { golfGameP = null; throw e; }));          // un fallo de red permite reintentar
  const loadGolfGame = () => { hubPreloader.release(); return importGolfGame(); };
  ```
- Llamar `importGolfGame().catch(() => {})` (sin liberar el hub) al **inicio** de `startMatch`, `startTournament` y `enterLive`, y en `playFreePlay` (el import ya está en curso cuando se pinta la pantalla).
- Prefetch en reposo del hub: tras `boot.hub()` (l.1608), si `shouldIdlePrefetch({ saveData: navigator.connection?.saveData, effectiveType: navigator.connection?.effectiveType, decision })` es true → `requestIdleCallback(() => importGolfGame().catch(() => {}), { timeout: 8000 })` (si no hay `requestIdleCallback`, `setTimeout` de 4000). `decision` es una constante (`'idle' | 'onPlay'`) que elige el usuario; por defecto `'idle'`.
- `prefetchRules.js`: `shouldIdlePrefetch({saveData, effectiveType, decision})` → false si `decision === 'onPlay'`, si `saveData` o si `effectiveType` es `'slow-2g'`/`'2g'`.
- Marcas F0: `prefetch:start`, `prefetch:end`.

**Tests**: reglas de `shouldIdlePrefetch`. Test de fuente (estilo `golfgame-dispose.test.js`): `loadGolfGame` llama a `hubPreloader.release()` y `importGolfGame` no.

**Checklist (usuario)**: con `?perf=1` en producción (tras desplegar), el informe muestra `import:end` antes de `room:end` en una partida normal; nada se rompe sin red tras cargar el hub (modo avión → Práctica → error controlado como hoy); el hub no da tirones visibles a los ~4-8 s de abrirlo (si los da, el usuario decide `'onPlay'`).

**Riesgos**: tarea de parseo en el hub (se ve en `longtasks`). Rollback: `decision = 'onPlay'` o revertir. **No hacer**: liberar el hub en el prefetch; importar `skinInspector`.

---

### F1c — Compilación correcta, esperada, y primer frame oculto (modelo: **sonnet**)

**Objetivo.** Eliminar la compilación duplicada en temas con bloom (C1), no congelar el hilo en el primer frame y no mostrar la canvas hasta tener imagen.

**Archivos**: `src/game/GolfGame.js`. NUEVO `src/game/warmupRules.js` (pura, la reutilizan F2 y F3). NUEVO `tests/warmup-rules.test.js`. Ajustar `tests/golfgame-dispose.test.js` solo si cambia algo de lo que comprueba (no debería). **No tocar** main.js, render/*, física.

**Diseño**
- `warmupRules.js`:
  - `yieldToMain()`: `globalThis.scheduler?.yield?.() ?? new Promise((r) => setTimeout(r, 0))`.
  - `runSteps(steps, { signal, yieldFn = yieldToMain, onProgress })`: ejecuta funciones (sync o async) una por tarea; entre pasos llama a `yieldFn`; si `signal.cancelled`, para y resuelve `{cancelled: true}`; un error se propaga; `onProgress(i/n)`.
  - `withCap(promise, ms, timers)`: resuelve `{ok: true, value}` o `{ok: false, timeout: true}`.
  - `chunk(list, n)`.
  - `collectTextures(root)`: recorre los materiales (array o único) y recoge `map, normalMap, roughnessMap, metalnessMap, emissiveMap, alphaMap, aoMap, bumpMap, lightMap, displacementMap, specularMap`, más las texturas dentro de `material.uniforms[*].value`. Devuelve un `Set`. Se prueba con objetos three reales en Node.
- En `GolfGame`:
  - `#compileTarget()` → `this.usePost ? this.composer.renderTarget1 : null`.
  - `async #warmGpu(token)`:
    1. `const prev = renderer.getRenderTarget(); renderer.setRenderTarget(this.#compileTarget()); const p = renderer.compileAsync(this.scene, this.camera); renderer.setRenderTarget(prev);`. `compile()` crea los programas de forma síncrona dentro de la llamada, así que restaurar justo después es correcto.
    2. `await withCap(p, 4000)`. Marcas `compile:start/end`.
    3. Subir texturas en trozos de 4 por tarea: `for (const part of chunk([...collectTextures(scene)], 4)) { part.forEach((t) => renderer.initTexture(t)); await yieldToMain(); if (token !== this.#loadToken) return; }`.
    4. Primer render real (el mismo código del final de `#frame`: `usePost ? composer.render(0) : renderer.render`) con la canvas aún oculta. Compila sombras y post y reserva el mapa de sombras. Marcas `frame1:start/end` + `probe.gl()`.
  - `load()`: igual que hoy hasta `#buildScene` y `#placeCamera`, pero **no arranca el bucle**. Pone `this.renderer.domElement.style.visibility = 'hidden'`, incrementa `this.#loadToken` y llama a `this.#warmGpu(token).catch(() => {}).finally(() => { if (disposed || token stale) return; visibility = ''; running = true; clock.start(); setAnimationLoop(...) })`. El tick y la intro empiezan al mostrarse (el tick 0 ocurre al ver el hoyo: igual que hoy en la práctica, sin efecto en la física).
  - `this.ready` (Promise) queda expuesta para F2/F3.
  - Quitar la llamada actual a `compileAsync` de `#buildScene` (l.579).
- Vivo: `onGame` y `noteRemoteSunk` funcionan antes de arrancar (solo tocan estado).
- Calidad Baja: mismo flujo; `usePost` es false, así que el target es `null`.
- Errores: cualquier fallo en el calentamiento arranca igual (bloque `finally`). Tope global de 6 s.

**Tests**: `runSteps` (cede entre pasos, se cancela, propaga errores, progreso), `withCap`, `chunk`, `collectTextures` con `Mesh`, `MeshStandardMaterial({map, normalMap})`, material múltiple y `ShaderMaterial` con uniform de textura. Test de fuente: en `GolfGame.js` la llamada a `compileAsync` va precedida de `setRenderTarget(` y ya no está en `#buildScene`.

**Instrumentación**: marcas listadas; `programas_frame1` debe caer en temas con bloom.

**Checklist (usuario)**: con `?perf=1&perfcourses=3,6,12`, en Medio: `programas_frame1` ≤ 12 en El Portal y Looping Neón (comparar con la línea base); sin pantalla negra congelada al entrar (la canvas aparece ya con imagen); la intro se ve entera; Bajo y Alto se ven igual que antes; cambiar la calidad a mitad de hoyo en Ajustes sigue funcionando; Modo Libre, desempate (`#hoyo3-empate`) y el hoyo del volcán se ven bien.

**Riesgos**: sin `KHR_parallel_shader_compile` el bloqueo solo cambia de sitio (se ve en `device.parallelCompile`); si `compileAsync` no resuelve, entra el tope. Rollback: revertir. **No hacer**: tocar `tick` ni la física; arrancar la intro mientras la canvas está oculta; dejar dos `compileAsync`.

---

### F2 — Preparar el hoyo 1 durante la sala (modelo: **opus**)

**Objetivo.** Al acabar la sala el hoyo 1 ya está construido, compilado, con texturas subidas y un frame dibujado en un contenedor oculto. Mostrarlo cuesta < 250 ms.

**Requisitos previos**: F0 y F1c fusionados (usa `warmupRules.js` y `#warmGpu`). F1b fusionado (usa `importGolfGame`).

**Archivos a tocar**: `src/game/GolfGame.js`, `src/main.js`, NUEVO `src/game/gamePreloader.js` (orquestación con dependencias inyectadas, testable), NUEVO `tests/game-preloader.test.js`, ampliar `tests/warmup-rules.test.js` si añades reglas puras (`keyOf`, `holdDecision`). NUEVO `src/game/loadingFlags.js` (interruptores).
**No tocar**: `src/ui/splashBridge.js` (usa su API pública `release/reload/current`), `src/screens/hub.js`, render/*, física, servidor, `matchmakingController.js` (usa `setStatus`/fases existentes).

**Diseño: GolfGame**
1. **Entrada fuera del constructor (C9)**: mover `this.#bindInput()` del constructor a un `#ensureInput()` que se llama al arrancar el hoyo (en `load()`, una sola vez por instancia). `#unbindInput` en `dispose` sigue igual (debe tolerar no haber enlazado nunca).
2. **Manejadores separados**: `setHandlers(handlers)` asigna los `on*`. El constructor lo llama con su segundo argumento: la firma actual se mantiene.
3. **`attach(container)`**: mueve `renderer.domElement` y `cupMarker` a `container`, `resizeObserver.disconnect(); resizeObserver.observe(container); this.container = container; #resize()`. Mover una canvas en el DOM no pierde el contexto (el hub ya lo hace con `attach`).
4. **Construcción partida** en `#buildStatic()` (entorno, pista, `cyberFx`, PMREM, recorte de luces), `#buildBall()` (skin, malla, sombra de contacto, halo, partículas, `SkinFX`, `AimDots`, `Shockwaves`) y `#buildBots()` (réplicas y etiquetas). `#buildScene()` = las tres (el camino de hoy).
5. **Skins rivales elegidas al preparar** (C11): `prepare` recibe `ghosts: n`, ejecuta `pickRandomSkins(n)` y crea sus `ghostHandles`. `#buildBots` las reutiliza en orden si existen. Así los programas de las réplicas se compilan en la preparación.
6. **`async prepare(course, { skin, instance, ghosts, signal, onProgress })`**: aplica curso, tema y calidad (lo que hoy hace `load()` antes de `#buildScene`, **sin** estado de juego: ni tick, ni bola de física, ni golpes, ni bots). Ejecuta con `runSteps`: `#applyCourseVisuals` → `#buildStatic` → `#buildBall` → réplicas → `#warmGpu` (de F1c) → listo. Guarda `this.preparedKey = keyOf(...)`. No arranca el bucle. No suena audio.
7. **`load(course, opts)`**: si `this.preparedKey === keyOf(course, opts.skin, opts.instance, getQuality())` y no hay cambios → **camino rápido**: estado de juego (todo lo de hoy en `load()` de `this.botPlayers` a `this.camYaw`), `#buildBots()`, `#ensureInput()`, `#placeCamera(1, true)`, visibilidad, arranque del bucle (con `ready` ya resuelto: casi inmediato). Si no coincide → camino de hoy (F1c).
8. `keyOf(course, skin, instance, quality)` en `warmupRules.js`: `${course.name}|${skin.id}|${instance?.seed ?? ''}|${quality}`.

**Diseño: `gamePreloader.js`**
```js
export function createGamePreloader({ importGame, releaseHub, releaseCurrentGame, makeHolder, enabled, timers, probe })
// → { warm(req) -> handle, take(handle, key) -> GolfGame|null, release(), holds(): boolean }
// req = { course, courseIndex, skin, instance, ghosts, quality }
// handle = { ready: Promise<boolean>, progress: number, cancel() }
```
- `warm`: si `!enabled()` → handle con `ready` resuelto a false. Si no: `gen++` (cancela y libera lo anterior: **nunca dos juegos preparados**), `releaseCurrentGame()` (revancha: el juego anterior sigue vivo bajo el overlay final), `releaseHub()`, `await importGame()`, `holder = makeHolder()` (div `position:fixed;left:-99999px;top:0;width:100vw;height:100vh;visibility:hidden;pointer-events:none;aria-hidden`), `game = new GolfGame(holder, {})`, `await game.prepare(...)`. En cada `await`, si la generación cambió → `game.dispose(); holder.remove()`. Errores → `console.warn`, liberar, `ready = false`.
- `take(handle, key)`: devuelve el juego si coincide la clave y no está cancelado (lo saca del preloader; el holder se elimina tras `attach`). Si no coincide → `release()` y `null`.
- `holds()`: true si hay un juego preparado o en preparación.
- Patrón de generación idéntico a `createHubPreloader` (splashBridge.js l.143-255): úsalo de referencia.

**Diseño: cableado en main.js**
- `const gamePreloader = createGamePreloader({ importGame: importGolfGame, releaseHub: () => hubPreloader.release(), releaseCurrentGame: () => { if (game) releasePlay(); }, makeHolder, enabled: () => WARM_IN_ROOM && !urlOff('warm'), ... })`.
- **Práctica y mesas locales** (`startMatch`): tras `service.join` y `perfcourses`, `const warm = gamePreloader.warm({ course: COURSES[match.courses[0]], courseIndex: match.courses[0], skin: progress.skin, instance: progress.instance(progress.skin.id), ghosts: match.players.length - 1 })`. En `onCancel` → `warm.cancel()`. Antes de `search.go()`: `await holdForWarm(warm, search, HOLD_PRACTICE_MS)`, que si no está listo pone `search.setStatus('Preparando el campo…')` y espera `withCap`. Si `search.ended` tras esperar → `return` (y `warm.cancel()`). `playHole(match, 0)` pasa `prepared: gamePreloader.take(warm, keyOf(...))`.
- **Vivo**: en `showLiveRoom` → `live.warm = gamePreloader.warm({ ..., ghosts: match.seats - 1 })`. En `launchLive`, antes de `search.go()` → hold con `HOLD_LIVE_MS`. En `playLiveHole(live, index)` usa el preparado solo si `index === 0` y la clave coincide. `stopLive` y su `onCancel` → `gamePreloader.release()`. Reanudación (`beginLive` sin sala, `holesPlayed > 0`) → sin preparación (camino de hoy).
- **`playScreen`**: acepta `prepared`. `game = prepared ?? new GolfGame(stage, handlers)`. Si es preparado: `game.setHandlers(handlers); game.attach(stage)`. Después `game.load(course, opts)` como hoy (toma el camino rápido solo). `loadGolfGame()` sigue liberando el hub (ya liberado; no hace nada).
- **Hub con búsqueda activa** (decisión del usuario; por defecto «conservar»): en `reviveHubScene` (l.216) → `if (gamePreloader.holds()) return;` (el hub muestra la imagen fija). En `goHome` o al cancelar la búsqueda → `gamePreloader.release()` **antes** de revivir el hub.
- **Modo Libre**: sin preparación (no hay sala).
- **Interruptores** en `src/game/loadingFlags.js`: `WARM_IN_ROOM = true`, `HOLD_PRACTICE_MS = 2000`, `HOLD_LIVE_MS = 1000`. Con `?perf=1`, `?warm=0` lo apaga (comparación A/B en el mismo build).

**Calidad**: la preparación usa `getQuality()` en el momento; si el usuario la cambia en la sala, la clave no coincide y se reconstruye (correcto). En Bajo prepara igual (es donde más se gana).
**Contextos**: preparar libera el hub antes de crear el renderer, así que hay como mucho uno. El contexto temporal de miniaturas (C13) puede coincidir: es aceptable, pero se cuenta con `ctx:create`.
**Memoria**: una escena, como hoy.
**Física y determinismo**: `prepare` no toca `tick`, bola, golpes ni bots. Todo ese estado se inicializa en `load()` al arrancar.

**Tests (`tests/game-preloader.test.js`, con `fakeEnv` y un `GolfGame` falso con `prepare` controlable)**:
- `warm` llama en orden a `releaseCurrentGame` → `releaseHub` → `importGame` → constructor → `prepare`.
- Un segundo `warm` libera el primero (dispose + holder fuera): nunca hay dos.
- `cancel` durante `prepare` libera al resolver.
- `take` con otra clave libera y devuelve null.
- Un error en `prepare` da `ready=false` y libera.
- `holds()` en cada estado.
- `enabled=false` no crea nada.
- `holdForWarm` respeta el tope y pone el estado.

En `warmup-rules.test.js`: `keyOf`. Test de fuente en GolfGame.js: el constructor ya no llama a `#bindInput` y `load()` tiene el camino rápido por `preparedKey`.

**Instrumentación**: marcas `warm:start`, `warm:step:<nombre>`, `warm:ready`, `warm:cancel`, `warm:take:hit|miss`, `hold:start/end`; `post_sala_ms` y `max_longtask_sala_ms`.

**Checklist (usuario)**
1. Práctica en producción con `?perf=1&perfcourses=3,6,12`: al acabar la sala el hoyo aparece al momento con su intro; en el informe, `warm:take:hit` y `post_sala_ms` bajo.
2. La animación de la sala (asientos, radar) no da tirones visibles.
3. Cancelar la búsqueda a mitad → vuelta al hub con escena 3D; segunda partida normal.
4. «Volver al lobby» con la búsqueda activa → el hub sin 3D (imagen fija); al lanzarse, la partida entra bien.
5. Pulsar Esc y Espacio durante la sala no abre los ajustes del juego.
6. Revancha desde el resultado final → sala → hoyo 1 sin fallos.
7. Cambiar la calidad en Ajustes con la búsqueda activa → el hoyo se ve con la calidad nueva.
8. Girar el móvil durante la sala → el hoyo aparece a tamaño correcto.
9. `?perf=1&warm=0` → comportamiento de antes (para comparar).
10. Mesas de pago **solo en local** (`pnpm dev`, `VITE_BACKEND=local`): mesa barata, igual que en práctica.
11. Vivo: no se puede probar sin entorno de staging (pregunta P7).

**Riesgos y rollback**: tirones en la sala si un paso es muy largo (el informe dice cuál); `WARM_IN_ROOM = false` lo desactiva sin revertir. Tiempos en vivo: hold máximo de 1 s.
**No hacer**: crear el juego preparado sin liberar antes el hub; arrancar el bucle o el audio al preparar; inicializar `tick`, bola o bots en `prepare`; consumir el `rng` sembrado de los bots en vivo durante la preparación; preparar los 3 hoyos.

---

### F3 — Renderer persistente durante la partida + hoyo siguiente preparado (modelo: **opus**)

**Objetivo.** Un contexto WebGL por partida. El hoyo N+1 se construye mientras el jugador ve el resultado del N. La transición es un intercambio de escenas.

**Requisitos previos**: F2 fusionado (API `prepare`/`attach`/`setHandlers`/camino rápido). F4 fusionado o, como mínimo, su contrato de propiedad de texturas.

**Archivos a tocar**: `src/game/GolfGame.js`, `src/main.js`, NUEVO `src/game/render/sceneDisposal.js` (puro sobre objetos three), NUEVO `tests/scene-disposal.test.js`, NUEVO `src/game/holeWindowRules.js` + `tests/hole-window-rules.test.js`, `src/game/loadingFlags.js` (`PERSISTENT_RENDERER`, `NEXT_HOLE_PREBUILD`).
**No tocar**: física, servidor, hubScene.js, splashBridge.js, render/* salvo para marcar compartidos (ver abajo).

**Diseño: liberación (`sceneDisposal.js`)**
- `collectSceneResources(root)` → `{ geometries, textures, lights, instanced, materials }` (Sets). Las texturas se recogen con `collectTextures` de `warmupRules.js` (F1c).
- `disposeSceneResources(root, { isShared = (r) => r?.userData?.gcbShared === true, keep = new Set() })`: libera geometrías, texturas, `light.shadow.map` (y `light.dispose?.()`) e `InstancedMesh.dispose()` que no sean compartidos ni estén en `keep`. **Los materiales NO se liberan** (decisión de diseño: mantienen sus programas vivos durante la partida como caché de shaders; el número está acotado por las variantes distintas, ≤ 4 hoyos por partida). Todo se suelta al acabar la partida con `dispose()` + `forceContextLoss`. Devuelve los recuentos. Idempotente.
- `scene.environment` (PMREM) va en `keep`: se conserva durante toda la partida.
- Compartidos: los materiales de módulo (C6) no se liberan (no se liberan materiales). Las texturas del caché de F4 que se entregan **como clones desechables** sí se pueden liberar; los maestros nunca están en una escena. Una textura que deba sobrevivir lleva `userData.gcbShared = true` (por ejemplo `contactMat.map`, si quien implementa F4 o F3 lo detecta).

**Diseño: GolfGame**
- Estado de escena por hoyo en un objeto `#stage = { scene, env, courseView, cyberFx, course, theme, key }`. `#next` guarda una escena preparada.
- `async prepareNext(course, { ghosts, signal })`: construye otra `THREE.Scene` con `#buildStatic` (entorno, pista, `cyberFx`) sobre el **mismo renderer**; `compileAsync` con su `#compileTarget()` (con las luces de esa escena) y `initTexture` en trozos (F1c). **No dibuja** en pantalla. Sin primer render oculto: los programas de sombra y post ya existen desde el hoyo 1. Guarda `#next.key`.
- En `load(course, opts)`: si `#next?.key` coincide → intercambio: la escena nueva pasa a activa, se mueven a ella la bola, el halo, la sombra, las partículas, `SkinFX`, `AimDots` y las ondas (`scene.add` las quita de la anterior; si cambia la skin, se reconstruye la bola), `#buildBots()`, reinicio de estado, `#applyQuality()`, `shadowMap.needsUpdate = true`. Después `disposeSceneResources(old)` en el siguiente `requestIdleCallback`/`setTimeout(0)`, para no sumar a la tarea de intercambio.
- La bola y los efectos se mantienen entre hoyos si la skin no cambia (ahorra programas y texturas de skin).
- `detach()`: quita la canvas de su contenedor y desconecta el `ResizeObserver` (antes de que `paintApp` vacíe `#app`).

**Diseño: main.js**
- `paintApp(content, { keepGame = false } = {})`: con `keepGame` y `PERSISTENT_RENDERER`, en vez de `releasePlay()` hace `game.detach()` + `playScope?.dispose()` + `gameGuard = null` (sin `dispose` del juego).
- `playHole`, `playLiveHole`, `playTiebreak`, `liveTiebreak` y `playFreePlay` (siguiente/repetir) llaman a `playScreen(..., { reuse: true })`. Dentro, si `game` existe y no está `disposed`: `game.setHandlers(handlers); game.attach(stage); game.load(...)`.
- Cualquier salida (`goHome`, `enterTables/Settings/Maps`, `showSearch`, quit, map select) sigue llamando a `releasePlay()`, que hace `dispose` completo: un contexto por partida y cero al volver al hub.
- **Disparo del siguiente** (reglas puras en `holeWindowRules.js`: `nextToPrepare({ mode, index, holes, tied })`):
  - práctica y local: en `onDone` del hoyo `i` (antes de `recordHole`), si `i + 1 < holes` → `game.prepareNext(COURSES[match.courses[i+1]], ...)`;
  - vivo: en `onDone` (el jugador ya terminó; los demás siguen y se ven: los pasos troceados mantienen la vista) → igual. `finishLiveHole` mantiene `LIVE_NEXT_MS`. Si `#next` no está listo al vencer, `playLiveHole` espera `withCap(next.ready, 1000)`;
  - desempate: al pintar el overlay de empate (`afterLastHole` y `liveTiebreak`) → `prepareNext(TIEBREAK_COURSE)`;
  - último hoyo sin empate: nada.
- Cancelación: `releasePlay()` cancela `#next` (señal) y lo libera.
- Calidad Baja: igual. Si el informe muestra presión de memoria, decide el usuario.
- Revancha: por simplicidad, `dispose` del juego al empezar la sala (lo hace F2 con `releaseCurrentGame`). Reutilizar el renderer en la revancha queda como mejora futura.

**Tests**
- `tests/scene-disposal.test.js` con three real en Node: escena con `Mesh` + `MeshStandardMaterial({ map, normalMap })` + `InstancedMesh` + `DirectionalLight` (con `shadow.map = { dispose: spy }`) + material con `uniforms.tex.value`. Comprueba: se lanzan los eventos `dispose` de geometrías y texturas; los materiales no; `userData.gcbShared` se respeta; `keep` se respeta; es idempotente; los recuentos son correctos.
- `tests/hole-window-rules.test.js`: `nextToPrepare` para práctica, vivo, último hoyo, empate y Modo Libre.
- Test de fuente: `paintApp` con `keepGame` no llama a `game.dispose`.

**Instrumentación**: `next:prepare:start/end`, `swap:start/end`, `dispose:old:start/end` (con recuentos), `probe.gl()` tras cada hoyo, contador `ctx:create` por partida.

**Checklist (usuario)**
1. Práctica de 3 hoyos con `?perf=1&perfcourses=3,6,12`: «Siguiente hoyo» entra al momento; en el informe `contextos_partida = 1` y `transicion_ms` bajo.
2. Hoyos 2 y 3 **sin superficies negras, blancas o sin textura** (síntoma de liberar algo compartido). Repetir con `perfcourses=2,13,0` (dos de cañón y Zigzag) y `perfcourses=7,8,14` (neón rosa ×2 y Cyberpunk).
3. Tres partidas seguidas y vuelta al hub: el informe no muestra crecimiento de texturas ni geometrías entre partidas.
4. Desempate forzado: `#hoyo3-empate` en práctica.
5. Modo Libre: Siguiente, Repetir y Mapas.
6. Cambiar la calidad en Ajustes entre hoyos y a mitad de hoyo.
7. Salir a mitad de hoyo 2 → hub con escena 3D.
8. Pantalla completa y girar el móvil entre hoyos.
9. `?perf=1&persist=0` → comportamiento de F2 (comparación).
10. Mesas de pago solo en local.

**Riesgos y rollback**: fugas o texturas rotas (los recuentos del informe y la checklist 2-3 lo detectan); `PERSISTENT_RENDERER = false` vuelve al camino de F2. Pérdida de contexto en móvil (iOS en segundo plano): manejar `webglcontextlost` con `releasePlay()` + aviso y volver al hub (comprobar qué hace hoy; no empeorarlo).
**No hacer**: liberar materiales de la escena anterior; liberar `scene.environment`; preparar más de un hoyo por delante; construir el siguiente mientras el jugador aún juega su hoyo (solo tras `onDone`); tocar `tick` o la bola durante `prepareNext`.

---

### F4 — Caché de texturas procedurales (modelo: **sonnet**; en paralelo con F1 y F2)

**Objetivo.** No regenerar en CPU texturas idénticas, ni dentro del mismo hoyo, ni entre hoyos, ni entre partidas.

**Archivos a tocar**: NUEVO `src/game/render/textureCache.js`, `src/game/render/textures.js` (envolver los exportadores deterministas), opcionalmente `lushEnvironment.js` (`meadowGroundTexture`), `flora.js` (`groundDetailTexture`), `attractions.js` (`neonGridTexture`, `loopChevronTexture`, `metalPlateTexture`) y `cyberpunkEnvironment.js` (texturas de rascacielos y rejilla). NUEVO `tests/texture-cache.test.js`.
**No tocar**: GolfGame.js, main.js (archivos de F2), física, `ballPaint.js`/`ballSkins.js` (ya tienen su caché), `labelTexture` (texto dinámico), `skinSpriteAtlas` (tiene el suyo).

**Diseño**
- `createTextureCache({ maxBytes, now })` → `{ get(key, make), stats(), clear() }`. La pública por defecto es `textureCache`, con `maxBytes` según la calidad (Bajo 8 MB, Medio 24 MB, Alto 64 MB; lo confirma el usuario).
- `make()` devuelve una `Texture` o un paquete `{ map, normalMap?, roughnessMap? }`. El caché guarda el **maestro** y entrega **clones** (`t.clone()` comparte `source`, así que la GPU sube la imagen una vez; C8).
- **Reenlazar en el paquete clonado**: si en el maestro `normalMap.repeat === map.repeat` (mismo objeto), en el clon se hace `normalMap.repeat = roughnessMap.repeat = map.repeat` y lo mismo con `offset`. Es lo que esperan `withNormals` y `sandMaps` (C8).
- Clave: `${nombre}|${JSON.stringify(args)}|${quality().texScale}|a${anisotropy}`.
- LRU por bytes (`width × height × 4 × 1,33`). Al expulsar un maestro: `master.dispose()`; los clones vivos siguen siendo válidos para three, que volverá a subir la imagen si hace falta.
- Envolver en textures.js: `grassMaps`, `rockFloorMaps`, `woodMaps`, `sandMaps`, `dirtMaps`, `iceTexture`, `stripeTexture`, `chevronTexture`, `slopeShadeTexture`, `crateTexture`, `abyssTexture`, `softDotTexture`. Mantener firmas y valores de retorno.
- `stats()` → `{ hits, misses, bytes, entries, msGenerated }` (medir el tiempo de `make()` con `performance.now()`). F0 lo incluye en el informe si existe (`probe.count('tex:*')` o leer `textureCache.stats()` en `load:end`).
- **Contrato con F3**: lo que entrega el caché es siempre un clon desechable (se puede llamar a `dispose()`); los maestros nunca se añaden a una escena. F3 libera los clones al cambiar de hoyo.
- Determinismo visual: los generadores usan `rand(seed)` fijo, así que la salida es idéntica.

**Tests (`tests/texture-cache.test.js`, three real en Node con `new THREE.Texture({ width: 256, height: 256 })` como imagen falsa)**: segunda llamada con la misma clave → acierto, sin `make()`, y el clon comparte `source` con el maestro; `repeat` independiente entre clones; reenlace `normalMap.repeat === map.repeat` en el paquete clonado; la clave cambia con `texScale`; la LRU expulsa por bytes y llama a `dispose` del maestro; `stats()` correcto. Test de fuente: `labelTexture` no pasa por el caché.

**Checklist (usuario)**: capturas lado a lado (antes/después, mismos `perfcourses`) de hierba, arena, tierra lateral, paredes de madera, hielo y neón: idénticas; `stats().hits > 0` desde el hoyo 2 y en la segunda partida; `load_desglose` del hoyo baja (ver informe).
**Riesgos**: `repeat` mal enlazado (arena o normales desalineadas); memoria CPU (tope LRU). Rollback: revertir o `maxBytes = 0` (sin caché).
**No hacer**: cachear por tema; devolver el maestro; cachear texturas con texto o animadas que se compartan mal entre hoyos sin clonar.

---

### F5 — Decisiones de producto y opciones condicionadas a datos (modelo: **sonnet** cada una)

Cada una es un cambio pequeño y aislado. Solo se hace tras la decisión del usuario o con datos de F0.
- **Sala de práctica más corta** (`startMatch` l.337-353): espaciado de asientos menor o adaptativo (acabar en cuanto `warm.ready` y haya pasado un mínimo). Test puro de la función de tiempos. No afecta al vivo.
- **Intro** (`INTRO_SECONDS` en GolfGame l.27, y su uso en `botStartTick` l.160): acortar o permitir saltarla con un toque **solo fuera del vivo**, o en vivo con el mismo valor para todos los clientes. Comprobar `supabase/functions/submit-hole` (hoy no la usa).
- **Reiniciar en Modo Libre** con `game.restart()` en vez de `playFreePlay` (main.js l.1480).
- **Dieta de variantes de shader**: con la lista de programas del informe F0, proponer unificaciones (por ejemplo Lambert y Standard en el decorado) y aprobarlas con capturas.
- **Texturas en un worker**: solo si `msGenerated` de F4 domina `load()` en móvil.
- **Experimento de caché de shaders de Chrome** (H2): solo con datos.

---

## 5. Preguntas abiertas (solo las decide el usuario)

1. **Dispositivo de referencia**: ¿qué Android de gama media se usa para fijar los criterios? ¿iPhone es objetivo (Safari tiene otros límites de memoria y de compilación)?
2. **Sala de práctica**: hoy son 3,4-5,8 s de asientos simulados. ¿Se puede acortar, o hacerla adaptativa y terminar cuando el hoyo esté listo? Es la mayor ganancia bruta, y sin ella P7.4 (≤ 5 s) queda en el límite.
3. **Intro de 2,2 s por hoyo**: ¿se acorta, se puede saltar con un toque, o se queda?
4. **Hold en la sala**: ¿cuánto puede esperar como máximo si el hoyo aún no está listo? Propuesta: práctica 2000 ms y vivo 1000 ms.
5. **Volver al hub con la búsqueda activa**: ¿hub sin escena 3D para conservar el hoyo preparado (recomendado) o hub 3D descartando la preparación?
6. **Prefetch del motor**: ¿en reposo del hub para todos (~96 KB gz) o solo al pulsar Jugar? ¿Respetar `Save-Data`?
7. **Flujo en vivo**: ¿existe un proyecto Supabase de staging con mesas de prueba sin dinero real? Si no, ¿se activan F2/F3 en vivo solo con tests y pruebas de práctica, o se dejan apagados en vivo (`mode === 'live'`) hasta poder probarlo?
8. **Memoria**: ¿se acepta «hoyo actual + siguiente» en todas las calidades? ¿Preparar también el hoyo 2 en la sala en calidad Alta?
9. **Modo Libre «Reiniciar»**: ¿reinicio instantáneo sin intro (`game.restart()`) o reconstrucción con intro?
10. **Visual**: ¿se aceptarían cambios visuales menores para reducir variantes de shader, si los datos muestran que la compilación domina?
11. **Quién implementa**, para saber la rama: ¿Gonzalo (`la-yuinta-mangante`) o el compañero (`la-chaqueta-bionica`)? El usuario de git actual es «Chakets».

---

## Anexo A — Datos por tanda (escritorio, render por software; orientativos)

| Tanda | Mapa hoyo 1 | Tarea 1 (inicio, dur) | Tarea 2 (dur) | Post-sala | Transición 1→2 (bloqueo) | Transición 2→3 (bloqueo) |
|---|---|---|---|---|---|---|
| dev móvil T1 (fría) | El Portal | 5286, 374 | 1801 | ~2180 | 267+281 (sin clic exacto) | 281+197 = 478 (clic→hoyo 523) |
| dev mesas T1 | Looping Neón | 4866, 286 | 1043 | ~1330 | 400+292 = 692 | 238+718 = 956 |
| dev mesas T2 | Doble Looping | 4664, 391 | 1138 | ~1535 | 171+197 = 368 | 224+495 = 719 |
| dev mesas T3 | El Portal | 4497, 345 | 163 | ~510 | 192+183 = 375 | 320+83 = 403 |
| dev mesas T4 | Turbo | 4743, 203 | 239 | ~445 | 278+191 = 469 | 265+204 = 469 |
| prod T1 | Zigzag | 4293, 399 | 1282 | ~1690 | (marca errónea) | 169+940 = 1109 (1168) |
| prod T2 | ? | 4997, 299 | 1244 | ~1550 | 171+182 = 353 (390) | 274+236 = 510 (553) |
| prod T3 | ? | 8924, 471 | 487 | ~960 | 198+193 = 391 (442) | 214+240 = 454 (516) |

## Anexo B — Hoyos con bloom en calidad Media (`usePost`)

Con bloom (les afecta C1): 0 Zigzag, 1 Turbo, 2 Bloques, 3 El Portal, 4 Molinos, 5 La Herradura, 6 Looping Neón, 7 Doble Looping, 8 Tubos Neón, 9 Molinos de Noche, 10 Las Tuberías, 11 Dentro del Volcán, 13 El Abismo, 14 Cyberpunk2078.
Sin bloom (usan PMREM si `env`): 12 El Molino del Prado, 15 El Templo de la Selva, 16 El Glaciar. En Alto todos llevan bloom; en Bajo ninguno.
