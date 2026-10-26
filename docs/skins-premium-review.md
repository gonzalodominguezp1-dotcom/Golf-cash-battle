# Revisión de auditoría — skins premium

> Revisor: agente auditor (Haiku 5.5). Alcance: commits P1 → P10 más los ajustes `e00f9dd`, `0cd61a2` y `33a41db` (ver `git log --oneline -30`). No se ha modificado código del proyecto ni se ha hecho commit. Único archivo creado: este informe.
> Criterios: `docs/skins-premium-plan.md`, sección (g) (aceptación por paquete) y «Lista de verificación para el REVISOR/AUDITOR».

## 1. Resumen ejecutivo

- **Build y tests en verde**: `pnpm test` = 81/81 OK; `pnpm build` = OK (aviso de chunk principal > 500 kB, 893 kB sin gzip).
- **Árbol de trabajo limpio**: sólo `docs/` aparece sin seguimiento (contiene el plan). No hay bancos `*bench*.html` ni `zz-skbench.*`. `physics.js` y los tests de determinismo/replay/economía no se han tocado.
- **Ids de skins**: todos los ids anteriores a P1 siguen existiendo; se añaden `event_horizon`, `midas_touch`, y los desafíos `wins50` y `aces5`.
- **Render**: las 23 skins compilan y renderizan sin errores de shader en calidades Alta, Media y Baja (prueba en el navegador integrado).
- **Defectos que impiden dar P7, P3 y P4 por aceptados**:
  1. Seis de las ocho skins estrella no reciben sonido propio (`sfx.set` nunca se asigna; sólo `gold`, `ice` y `holo` coinciden por casualidad con un set existente).
  2. `uSpeed` llega en 0..1 pero tres patrones lo esperan en 0..12: la reacción a la velocidad de Kintsugi, Supernova y Dragón queda casi muerta.
  3. El contador `sinks` cuenta hoyos jugados y no embocadas, y su tope de +20 por guardado puede dejar bloqueado `save_progress` tras varias partidas sin sincronizar.
- **Fugas**: por hoyo, GolfGame no libera la geometría de la bola, la geometría de los rivales, las etiquetas ni los sistemas de partículas y anillos.
- **Visual**: se nota una mejora clara frente a las bolas planas originales, pero **no** todas las skins se ven «premium»: Prisma Holo y Criónova siguen lavadas o planas, y Kintsugi casi no muestra oro.

## 2. Verificaciones ejecutadas

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `git status` | Sólo `?? docs/` | `git status --short`, `--ignored` (dist/, node_modules/, .impeccable/, .vscode/ ignorados) |
| Bancos temporales | Ninguno | `find` por `*bench*` y `zz-*` fuera de node_modules: vacío |
| `pnpm test` | 81 pasan, 0 fallan | Salida completa de `node --test tests/*.test.js` |
| `pnpm build` | Exit 0; aviso de tamaño de chunk | `main-*.js` 893 kB (255 kB gzip) |
| Ids de skins | Todos los anteriores presentes | Comparación `git show 372d0df^:src/progress/skins.js` frente al actual |
| Tests de esquema e inventario | Presentes y en verde | `tests/skins-schema.test.js`, `tests/inventory.test.js`, bloque en `tests/progress.test.js` |
| `physics.js`, determinism/replay/economy | Sin cambios desde P1 | `git log 372d0df^..HEAD -- ...` vacío |
| `Math.random` fuera de simulación | Sólo en `src/ui/skinReveal.js` (UI) | `grep` en `src/game/render/skins` y `src/ui/skin*.js` |
| Migración SQL | Revisada a mano; no aplicada | `supabase/migrations/20261026120000_skin_inventory.sql` frente a `20261019140000_accounts_kyc_antibot.sql` |
| Compilación de shaders | 23 skins x {Alta, Media, Baja} sin errores | Ejecución en el navegador integrado con `createSkinMaterial` + `render` + `toDataURL` |
| Pantalla de skins y reveal | Pantalla OK en escritorio y 375×812; reveal no verificado en navegador | Ver sección 6 |

## 3. Tabla por paquete

Veredictos: **OK**, **Con reservas** (cumple lo esencial, con defectos que hay que corregir), **Fallo** (incumple un criterio de aceptación del plan).

| Paquete | Commit | Veredicto | Evidencia / comentario |
|---|---|---|---|
| P1 esquema y tiers | `372d0df` | Con reservas | Tiers y re-tier según tabla (b) correctos; ids intactos; `RARITIES` alias. Archivos dentro del alcance. Reserva: el campo `shader` es `null` en todas las skins y el patrón se resuelve por id (`skinMaterial.js:68`), y `sfx` no se define en ninguna skin (ver defecto D1). |
| P2a normal de hoyuelos | `f3ba8e8` | OK | Entregado como PNG (`public/skins/dimples-normal.png` 450 kB; `-512.png` 166 kB), no WebP; el plan admite el fallback. Tamaño ≤ 600 kB. No re-ejecuté `scripts/bake-dimples.mjs`. No comprobé la costura visualmente. |
| P7 sonido por skin | `ba61566` | **Fallo** | Los 8 sets existen en `audio.js:329-549`, pero ninguna skin declara `sfx`. Sólo coinciden `gold`, `ice` y `holo` (por el id). Ver D1. El set `timbre` de las raras no existe, así que esas skins quedan mudas. |
| P4 inventario y migración | `6a9601e` | Con reservas | Seed/float deterministas (`inventory.js:43-53`); `recordMatch` y `attach` correctos en código; test de herencia pasa. Migración: se mantienen las claves antiguas y el saldo no se toca. Defectos: contador `sinks` mal definido y tope que puede bloquear el guardado (D3); el servidor acepta seed/float del cliente en la primera escritura sin derivarlos ni validar que la skin esté desbloqueada (D5); `variant` no se valida; no hay test de SQL (no hay base local). |
| P5 runtime FX | `a551b17` | Con reservas | `update` sin asignaciones (`skinFx.js:420-501`, `effects.js` Trail/RibbonTrail/AdditiveParticles); RNG propio; atlas con contador de referencias correcto. Reservas: `setLevel` añade/quita `PointLight` (`skinFx.js:254-260`), lo que cambia el número de luces y fuerza recompilación; cada rival crea su propio `SkinFX` con 12 decals y 4 anillos. |
| P2 núcleo de material | `7c5fcb6` (+ `e00f9dd`) | Con reservas | `createSkinMaterial` → `{material, update, setReveal, setInstance, dispose}` y envoltorio de compatibilidad. Compila en las tres calidades. Dispose libera canvas y mapas propios; los hoyuelos y los env maps son compartidos (correcto). Reserva: `uSpeed` con escala incorrecta (D2). No se ha medido `renderer.info` antes/después de 20 cambios de skin. |
| P3a–h patrones | `8cb177d`…`a6ca7ee`, `c89fc9a` | Con reservas | Los 8 compilan y renderizan (Alta, Media, Baja). Ficha visual: Kintsugi sin oro legible (magenta dominante), Damasco legible como metal pero con aspecto de camuflaje, Supernova convincente, Dragón con grietas naranjas más que escamas, Criónova pálida y plana, Prisma Holo con manchas sin lectura de lámina holográfica, Midas bien resuelto, Horizonte bien resuelto (el disco de acreción sólo aparece en «Probar efectos»). Reserva: D2 (uSpeed) afecta a Kintsugi, Supernova y Dragón. |
| P6 integración en partida | `adab8ab` | Con reservas | Integración leída en `GolfGame.js` (creación, `update`, `dispose`, `onHit/onWall/onBumper/onLip/onSink`, `genericFx` por skin). **No jugué una partida completa en el navegador**, así que el comportamiento en partida es sólo de código. Fugas por hoyo: D4. |
| ajuste acabado | `e00f9dd` | OK | Cambios en `envStudio.js`, `skinMaterial.js` y `skins.js` (ajustes de finish). Coherente con la intención del commit. Fuera de la lista de un paquete, pero es un ajuste, no un paquete. |
| P11 rendimiento | `0cd61a2` | Con reservas | `quality.js` con `skinFx`, `ballSegments`, `dimpleRes`. `perfGovernor.js` sin asignaciones por frame y con histéresis correcta. Reservas: `window.__skinlabPerf` no existe en `?skinlab=1` (verificado: `typeof` = `undefined`), así que no se cumple «exponer métricas en ?skinlab=1»; comentario de cabecera obsoleto («no está enganchado»); no probé el throttling x4 de DevTools. |
| conexión gobernador | `33a41db` | Con reservas | Conecta el gobernador y `ballSegments`, pero modifica `GolfGame.js`, que no está en la lista de archivos de P11. Fuera de propiedad de paquete. |
| P8 inspector 360° | `1c0d39f` | OK (con reservas menores) | Verificado en navegador: escritorio (1440×900) y 375×812 sin scroll horizontal (`scrollWidth` = `clientWidth` = 375); pantalla completa con panel inferior; «Probar efectos» funciona (ciclo golpe → choque → rebote → embocada). `destroy()` libera geometría, mapas, materiales, renderer y listeners globales. Reserva: el closure `crossed` se crea en cada frame (`skinInspector.js:403`). |
| P9 pantalla y tarjetas | `3745be0` | Con reservas | Verificado: orden por tier descendente, filtros (tier, colección, desbloqueadas), tocar abre la inspección, equipar es botón explícito, miniaturas 3D progresivas, móvil con dos columnas. Reservas: las tarjetas bloqueadas quedan muy oscuras (poco contraste); `hoverLoop` renderiza 12 fotogramas en un único trabajo síncrono (`skinThumbs.js:110`), con posible tirón; la caché de miniaturas no tiene límite. |
| P10 reveal | `97b9e70` | Con reservas | Duraciones por tier suman 1,5 s / 3,2 s / 4,2 s (`skinReveal.js:16-23`), salto con toque o Esc, versión reducida (`prefers-reduced-motion`), cola ordenada de menor a mayor tier. **No verificado en navegador** (requiere un desbloqueo real). Reservas: la imagen de 144 px se escala a 170–220 px CSS (D6); la «falsa rareza» de Mítica sólo cambia el color de los haces (`skinReveal.css:48-49`), sin mostrar un sello de tier inferior; `style.css` se modifica fuera de la lista de P10 (se eliminan reglas `.skin-card` y `.unlocks`; comprobado que ya no hay usos en `src`). |

## 4. Lista priorizada de defectos

Severidad: **Alta** = incumple un criterio de aceptación o rompe una funcionalidad visible; **Media** = calidad o robustez relevante; **Baja** = mantenimiento o detalle.

| Id | Sev. | Defecto | Archivo:línea | Cómo reproducir / evidencia |
|---|---|---|---|---|
| D1 | **Alta** | Seis skins estrella no tienen sonido propio. `sfx.set` = `d.sfx ?? TIER_SFX[tier] ?? d.id`; ninguna skin define `sfx`, y los sets reales son `neon, steel, solar, dragon, ice, void, holo, gold`. Resultado: Kintsugi (`kintsugi_neon`), Damasco (`damascus_imperial`), Supernova (`supernova_solar`), Dragón (`crimson_dragon`), Horizonte (`event_horizon`) y Toque de Midas (`midas_touch`) reciben un set inexistente y `playSkin` sale en silencio (`audio.js:585-588`). Las raras (`timbre`) y las comunes (`generic`) también quedan mudas. | `src/progress/skins.js:51`; `src/game/audio.js:329-549, 585-588` | Ejecutar `node` sobre `src/progress/skins.js` y leer `s.sfx.set`. Corrección: añadir `sfx` a cada entrada de `RAW_SKINS` (`neon`, `steel`, `solar`, `dragon`, `void`, `gold`…) y definir un set real para `rare` o quitar `timbre`. |
| D2 | **Alta** | Contrato `uSpeed` inconsistente. El runtime pasa `speedN` = `min(1, v/12)` (0..1): `GolfGame.js:1358`, `skinInspector.js` (`matCtx.speed = min(1, speed/12)`). Kintsugi espera 0..12 (`kintsugi_neon.js:57, 62`), Supernova calcula `uSpeed*0.06` (`supernova_solar.js:58`), Dragón `uSpeed*0.35` (`crimson_dragon.js:38`) y Damasco 0..1 (`damascus_imperial.js:16`). Con la escala real, el pulso de Kintsugi apenas cambia (0.55→0.67 de velocidad), el calor de Supernova no supera 0.06 y la «respiración» del Dragón apenas reacciona. | `GolfGame.js:1358`; `src/ui/skinInspector.js` (`stepFx`); patrones citados | Leer `uSpeed` en cada patrón y compararlo con `matCtx.speed`. Corrección: fijar una única escala (p. ej., velocidad en unidades de juego) y documentarla en `patterns/index.js`. |
| D3 | **Alta** | Contador `sinks` mal definido y tope que puede bloquear el guardado. (a) `recordMatch` cuenta `holes.filter(h => h.strokes > 0)`: cuenta **todos** los hoyos jugados, incluidos los no embocados (8 golpes) y los de la partida en práctica. (b) La migración rechaza con `progress_rejected` un contador que suba más de 20 respecto al guardado (`v_c > v_cprev + 20`). Como el cliente reenvía el estado acumulado y el servidor no avanza, tras más de dos partidas sin sincronizar (p. ej., sin conexión) el delta supera 20 y **todo** `save_progress` falla, incluidos XP y victorias. Como `save` ignora el error (`Progress.js`, `.catch(() => {})`), no hay aviso. | `src/progress/Progress.js:137`; `src/main.js:1638`; `supabase/migrations/20261026120000_skin_inventory.sql:82` | Razonamiento sobre el código; no reproducido contra Postgres (no hay base local). Reproducir: tres partidas de 9 hoyos sin red, luego reconectar; `save_progress` debería fallar. Corrección: contar sólo embocadas (`strokes < 8` o un flag `sunk`), no aplicar el tope de +20 a contadores que sólo suben por eventos reales, o acumular y reenviar en lotes. |
| D4 | Media | Fugas por hoyo en GolfGame. `#disposeFx` libera skins y FX, pero no: la geometría de la bola (`new SphereGeometry(...)` en cada `#buildScene`), `ghostGeo`, las etiquetas de los rivales (`SpriteMaterial` + `labelTexture` por bot), `Particles`, `Shockwaves`, `AimDots`, `ballShadow` ni `ballGlow`. El código no recorre la escena anterior (`this.scene` se reemplaza). Antes de P6 ya había fugas de la escena de curso; P6 añade las de la bola y los rivales. | `src/game/GolfGame.js:433, 457, 465, 442-451` y `#buildScene` (`:406`) | Razonamiento sobre el código; no medido. Reproducir: jugar 10 hoyos y ver `renderer.info.memory.geometries` crecer. Corrección: `dispose()` explícito de cada objeto creado en `#buildScene`, o un `disposeScene(scene)` que recorra la escena. |
| D5 | Media | El servidor confía en seed y float en la primera escritura. La migración acepta `seed` (0..999) y `float` (0..1) enviados por el cliente para cualquier clave de skin, sin comprobar que la skin esté desbloqueada ni que el valor salga de `seedFor`/`floatFor`. Un cliente modificado puede fijar float 0 en cualquier skin. Lo mismo ocurre con el `float` local antes de la primera sincronización (la semilla del dispositivo, `deviceId`, sustituye al dueño). Es cosmético, pero incumple «seed/float inmutables... derivados de hash(owner)». | `supabase/migrations/20261026120000_skin_inventory.sql` (rama `else`, líneas 56-62); `src/progress/Progress.js:36-37` (clave de dueño = `deviceId` mientras no hay cuenta) | Revisión de código. Corrección: recalcular seed/float en el servidor a partir de `auth.uid()` y el id de skin (o rechazar valores distintos), y validar la skin contra una lista. |
| D6 | Media | Miniaturas del reveal borrosas. La miniatura 3D se renderiza a 144 px (`skinThumbs.js:15`) y se muestra a `clamp(170px, 50vw, 220px)`, con un `img` de 144 px de atributo, así que se escala 1,2–1,5x y en pantallas de DPR ≥ 1,2 queda borrosa. El `ballPreview` de 288 px inicial se sustituye por la de 144 px. | `src/ui/skinThumbs.js:15`; `src/ui/skinReveal.js:182, 203`; `src/ui/skinReveal.css:94, 101-102` | Revisión de CSS y código; no comparé capturas del reveal. Corrección: renderizar el reveal a 2x (288 px) o usar un render dedicado. |
| D7 | Media | Calidad visual insuficiente en algunas skins (ver sección 5): Prisma Holo sin lectura de lámina holográfica, Criónova pálida y plana, Kintsugi sin oro visible, Dragón sin lectura de escamas. | `patterns/holo.js`, `ice.js`, `kintsugi_neon.js`, `crimson_dragon.js` | Captura en el navegador (sección 5). |
| D8 | Media | `window.__skinlabPerf` no existe en `?skinlab=1` (la rejilla no monta GolfGame), y tras `dispose()` la referencia global sigue apuntando al gobernador del juego anterior, que lee el `skinFx` ya nulo. | `src/game/render/perfGovernor.js:70-72`; `GolfGame.js` (`this.perf = null` en `dispose`) | Verificado en navegador: `typeof window.__skinlabPerf` → `"undefined"`. Corrección: exponer métricas desde `mountSkinLab` o registrar y desregistrar el gobernador activo. |
| D9 | Media | Hoyuelos sobre metales sin verificar. `normalMap` se aplica a todos los materiales físicos con `normalScale` = `finish.dimples` (0,15–0,8), incluido Damasco (metalness 0,92) y Midas (1,0). Puede deformar el reflejo de forma visible. | `src/game/render/skins/skinMaterial.js:123-124` | No comprobado con zoom en el navegador. Recomendación: captura en primer plano y, si deforma, bajar `normalScale` en metales. |
| D10 | Baja | Error `WrongDocumentError` de pointer lock: **preexistente**. `requestPointerLock()` tiene la misma implementación antes de P6 (`git show adab8ab^`, líneas 225-240) que ahora (`GolfGame.js:243-257`). El `catch` reintenta con `el.requestPointerLock?.()` sin `.catch`, así que si el segundo intento rechaza (p. ej., el canvas ya no está en el documento tras `dispose()`), queda una promesa rechazada sin manejar. Esta causa es un razonamiento a partir del código; no lo reproduje en el navegador (no hay partida). | `src/game/GolfGame.js:251, 255` | Corrección: `el.requestPointerLock?.()?.catch?.(() => {})` y comprobar `el.isConnected` antes de pedir el bloqueo. |
| D11 | Baja | Rivales: un `SkinFX` completo por rival (12 decals, 4 anillos, 300 partículas de capacidad). | `GolfGame.js:462-470` | Revisión de código. Cada `SkinFX` crea 12 decals y 4 anillos, cada uno con su propio material (16 meshes y 16 materiales ocultos por rival); con 8 jugadores son unos 128 meshes y materiales ocultos por hoyo. |
| D12 | Baja | Cambio de nivel en `SkinFX` añade o quita `PointLight` y fuerza recompilación de los materiales de la escena. | `src/game/render/skins/skinFx.js:252-260` | Revisión de código. Afecta sólo a cambios de calidad en caliente (gobernador). |
| D13 | Baja | Closure por fotograma en el inspector. | `src/ui/skinInspector.js:403` | Revisión de código. |
| D14 | Baja | Hover de miniaturas: 12 renders + 12 `toDataURL` PNG síncronos en un solo trabajo. | `src/ui/skinThumbs.js:110` | Revisión de código; sin medir. |
| D15 | Baja | Caché de miniaturas y de env maps sin límite (por skin, semilla, desgaste y calidad). | `skinThumbs.js:22`; `envStudio.js:9` | Crecimiento acotado en la práctica (23 skins), pero sin límite explícito. |
| D16 | Baja | La «falsa rareza» de Mítica sólo cambia el color de los haces, no muestra un sello inferior. | `src/ui/skinReveal.css:48-49`; `skinReveal.js:180` | Revisión de código. |
| D17 | Baja | Comentario obsoleto en `perfGovernor.js` («no está enganchado en GolfGame.js») y ruido de formato en `ballSkins.js` (`}  return update;`). | `src/game/render/perfGovernor.js:12-13`; `src/game/render/ballSkins.js` (final de `setupSkinAnimation`) | Revisión de código. |
| D18 | Baja | Tiempo de frame: `Particles.update` (preexistente) crea un array con `filter` cada frame; los `emit` del código antiguo crean `Vector3`/`Euler`. Ajeno a P1-P11, pero relevante para el presupuesto de frame. | `src/game/render/effects.js:28-30, 66-67` | Preexistente. |
| D19 | Baja | Procesos de alcance: `style.css` modificado en P10 y `GolfGame.js` en `33a41db`, ambos fuera de la lista de archivos de su paquete. | commits `97b9e70`, `33a41db` | `git show --stat`. Sin impacto funcional comprobado. |
| D20 | Baja | Sin pruebas de: shaders (sólo se pueden comprobar en navegador), migración SQL, mapeo de sets de sonido y `uSpeed`. Recomendado añadir un test que compruebe que cada skin tiene `sfx.set` válido y que cada patrón usa la misma escala. | `tests/` | Revisión. |

## 5. Prueba visual (navegador integrado)

Servidor propio en el puerto 5420 (detenido al final). Pestaña propia (cerrada al final). Perfil de prueba en `localStorage` con progreso ficticio (clave `gcb.progress.v1`), **borrado** al terminar.

**Pantalla de skins**
- Escritorio 1440×900: rejilla de 23 tarjetas con marco por tier, icono de forma, nombre, tier y barra de desgaste; chips «Marcador» en las legendarias con contador; filtros funcionales.
- 375×812: dos columnas; sin scroll horizontal; navegación inferior visible.
- Tarjetas bloqueadas: silueta muy oscura y poco contraste (D-UX, sin id).

**Inspector y `?skinlab=1`** (capturas a escala reducida, ampliadas con zoom)

| Skin (tier) | Día / noche | Veredicto honesto |
|---|---|---|
| Kintsugi Neón (Legendaria) | Sólo día (la rejilla de lab no tiene selector de tema) | Negro carbono con grietas magenta muy brillantes; **el oro no se lee**. Premium a medias. |
| Damasco Imperial (Legendaria) | Día | Metal con bandas claras y oscuras; se lee como metal, pero con aspecto de camuflaje. Aceptable. |
| Supernova Solar (Legendaria) | Día | Plasma naranja con granulación. Lo más convincente de las pruebas. |
| Dragón Carmesí (Legendaria) | Día | Obsidiana con grietas naranjas; se parece más a roca de lava que a escamas. Regular. |
| Criónova (Épica) | Día | Azul pálido con grietas tenues; aspecto plano y lavado, sin profundidad. **No premium.** |
| Prisma Holo (Épica) | Día | Manchas verdes, azules y moradas; **no hay lectura de lámina holográfica**. **No premium.** |
| Toque de Midas (Mítica) | Día | Oro pulido con reflejos; el mejor del lote. Premium. |
| Horizonte de Sucesos (Mítica) | Día | Esfera negra con halo fino naranja. Buena silueta; el disco de acreción sólo aparece en «Probar efectos». |

- «Probar efectos» en Horizonte: el ciclo de golpe, rodada, choque y embocada se reproduce; el agujero negro se ve en el hoyo.
- Inspector en 375×812: pantalla completa con panel inferior deslizable y botón «Equipar»; sin scroll horizontal.
- Consola: sin errores de shader; sólo avisos de Vite y de Supabase (sin backend: «Anonymous sign-ins are disabled», esperado en este entorno).
- Aviso «Multiple instances of Three.js» durante la sesión: lo causó mi propia prueba al importar `three` directamente desde `node_modules`; no es un defecto de la aplicación.

**No verificado**: día/noche/neón en partida (sin acceso a la rejilla ni a una partida jugada), reveal al desbloquear, y la costura y los polos de los hoyuelos a primer plano.

## 6. Procesos y servidores

- Mi servidor Vite (`node node_modules/vite/bin/vite.js --port 5420`, PID 14556) se ha detenido.
- Siguen escuchando, **no son míos y no los he tocado**: puerto 5173 (PID 21128, `--host`), 5180 (PID 10156, `--strictPort`), 5190 (PID 8336, `--strictPort`) y 5200 (PID 14144, lanzado con `--port 5199`). Conviene que quien los lanzó los cierre.

## 7. Recomendaciones (prioridad)

1. Corregir D1 (sonido: añadir `sfx` a las skins y resolver `timbre`) y D2 (fijar una escala de `uSpeed`); ambos son rápidos.
2. Corregir D3 antes de desplegar la migración: contar sólo embocadas y no bloquear el guardado completo por un contador.
3. Revisar D5 con el servidor: derivar seed y float en `save_progress`.
4. Añadir `dispose` por hoyo (D4) y comprobar `renderer.info.memory` tras 10 hoyos.
5. Mejorar la resolución del reveal (D6) y medir hoyuelos sobre metales (D9).
6. Trabajo visual: Prisma Holo (lámina y purpurina más visibles), Criónova (más contraste y profundidad), Kintsugi (oro más fuerte que el magenta). Repetir la prueba en día, noche y neón desde una partida real.
7. Registrar `window.__skinlabPerf` desde el laboratorio (D8) y completar los tests de esquema (D20).
