# Skins premium — Diagnóstico, dirección artística y plan de implementación

> Documento de diseño. Objetivo: que las bolas parezcan objetos por los que alguien pagaría mucho (referencias: cuchillos de Counter-Strike — acabado, desgaste, patrón, inspección; skins Mythic/Legendary de Call of Duty — energía, estelas, reacciones, reveal).
> Regla que no cambia: **las skins son 100 % cosméticas**. Nada de este plan toca `physics.js`, la simulación determinista ni el resultado de una partida.

---

## (a) Diagnóstico — por qué hoy se ve «poco premium»

### Hallazgo principal
En partida la bola mide `BALL_R = 0.13` (`src/game/physics.js:7`) y ocupa muy pocos píxeles. **El microdetalle de textura apenas se ve en juego**; lo que vende una skin en juego es silueta luminosa, reflejos, estela, aura y reacción a los eventos. El microdetalle (acabado, desgaste, patrón) se vende en la **inspección** y en las **tarjetas**. Hoy fallan ambas capas.

### Material y render
| # | Problema | Referencia |
|---|---|---|
| 1 | Los hoyuelos son cuadrados de 3×3 px pintados al 7 % de negro sobre el color: no hay normal map, la bola no tiene relieve ni captura luz. | `src/game/render/ballSkins.js:84-86` |
| 2 | Las 5 skins procedurales nuevas salen del `paintBall` antes de pintar hoyuelos: **no tienen hoyuelos en absoluto** (parecen canicas). | `ballSkins.js:8-11` |
| 3 | Patrones 2D en proyección equirectangular de 512×256: estrellas, gemas y puntos se estiran y se pellizcan en los polos. | `ballSkins.js:29-31`, `:68-80`, `:312-321` |
| 4 | Las «animaciones» son desplazar el offset UV de la textura y un seno global de `emissiveIntensity`: la textura «resbala» sobre la esfera como papel pintado y toda la bola late a la vez. No hay shader. | `ballSkins.js:364-466` |
| 5 | Mismo material para todas: `clearcoat: 1` por defecto incluso en bronce, iridiscencia 1 forzada en diamante/esmeralda → todo parece el mismo plástico barnizado con película arcoíris turbia. No hay jerarquía de acabado por rareza. | `ballSkins.js:476-487` |
| 6 | **Los metales no tienen nada que reflejar.** El env map solo se activa en temas no «glowy» y con intensidad 0.12; en noche/neón/lava no hay entorno → Damasco (metalness 0.92), Kintsugi (0.72) y Dragón (0.5) se ven negros/planos. | `src/game/GolfGame.js:396-401` |
| 7 | El bloom está capado (0.08–0.14, umbral 0.85–0.95): los emisivos de las skins (intensidad ≤ 0.55, LDR) nunca superan el umbral → no brillan. | `GolfGame.js:79-85`, `:119-122` |
| 8 | Esfera de 32×24 segmentos: silueta poligonal visible en primeros planos y celebraciones. | `GolfGame.js:408-411` |
| 9 | Kintsugi genera un canvas emisivo de 512×256 píxel a píxel con fbm en el hilo principal (coste de arranque) y su textura no se libera al cambiar de skin. | `ballSkins.js:323-362`, `:398-412` |

### Efectos en juego
| # | Problema | Referencia |
|---|---|---|
| 10 | La estela es `THREE.Points` de 28 puntos con un único color (`skin.trail`): una fila de puntos, no una estela. Además crea un `THREE.Color` por punto y frame en arcoíris. | `src/game/render/effects.js:107-140` (`:134`), `GolfGame.js:449`, `:1270` |
| 11 | Golpe, choque, bumper, labio, arena, turbo y embocada usan efectos genéricos que **ignoran la skin** (puff verde `0x9be37f`, confeti estándar). Ninguna skin tiene efecto propio de golpe/embocada. | `GolfGame.js:622-627`, `:1119-1131`, `:1139-1142`, `:1157-1168` |
| 12 | Sin aura, sin idle, sin reacción a la velocidad, sin sonido propio. `sfx` no tiene variantes por skin. | `src/game/audio.js:227-243` |

### Datos, progreso y UI
| # | Problema | Referencia |
|---|---|---|
| 13 | Rarezas con nombres de metal (Bronce…Esmeralda) que chocan con nombres de skins («Oro puro», «Diamante», «Esmeralda real»); Esmeralda > Diamante no se entiende. No hay reglas visuales por rareza. | `src/progress/skins.js:4-10`, `:24`, `:30`, `:33` |
| 14 | Esquema heterogéneo: unas skins traen `material`, `secondary`, `shimmer`; otras no. No hay campos de FX, sonido, colección ni lore. | `skins.js:12-34` |
| 15 | No existe «instancia» de skin: sin desgaste/float, sin semilla de patrón, sin contador. Desbloquear = cumplir un stat. | `src/progress/Progress.js:3-4`, `:65-76` |
| 16 | El servidor solo guarda una lista blanca de claves: cualquier dato nuevo (inventario, contadores) **se perdería al sincronizar**. | `supabase/migrations/20261019140000_accounts_kyc_antibot.sql:216-227` |
| 17 | Las miniaturas de tarjetas, lobby y desafíos son un recorte 2D de la textura con un degradado radial: no muestran metal, clearcoat ni brillo. | `ballSkins.js:494-516`, `src/main.js:48`, `:211`, `:504` |
| 18 | El inspector 3D solo existe en escritorio (≥900 px), con luz ambiente 0.85 que lava el contraste y **sin env map** (el clearcoat no refleja nada). En móvil se oculta. | `src/main.js:278-395` (`:296`, `:524-535`), `src/style.css:1909` |
| 19 | Pulsar una tarjeta la equipa a la vez: no hay «inspeccionar antes de equipar». | `src/main.js:510-518` |
| 20 | El desbloqueo es la misma tarjeta con un `reveal` CSS de 0.7 s: cero ceremonia. | `src/main.js:1530-1535`, `:1773-1776`, `src/style.css:813` |
| 21 | Las tarjetas usan la lámina metálica genérica por rareza; no se distinguen las skins entre sí ni comunican rareza más allá del color. | `src/style.css:2372-2400`, `:754-813` |

---

## (b) Dirección artística

### Principios
1. **Legibilidad a distancia primero**: cada skin tiene una *firma* reconocible a 30 m (color de emisión + forma de estela + aura). El detalle fino es para la inspección.
2. **Contraste de materiales**: mate vs. pulido, metal vs. dieléctrico, oscuro vs. emisión. Nada de «todo brillante».
3. **El movimiento vive en el objeto** (ruido 3D en espacio de objeto que fluye), nunca texturas que resbalan.
4. **Escalada por rareza**: cada tier añade una capa nueva, nunca solo «más brillo».
5. **Reacción**: la skin responde a velocidad, golpe, choque, labio y embocada.

### Sistema de rareza (sustituye Bronce…Esmeralda)

| Tier | id | Color de marco | Material | Animación | Estela | Eventos | Sonido | Reveal |
|---|---|---|---|---|---|---|---|---|
| Común | `common` | `#9AA4B2` gris | Plástico satinado (rough 0.35–0.5), sin clearcoat, hoyuelos normal map | Ninguna | Estela por defecto blanca tenue | Genéricos | Genérico | Tarjeta simple |
| Poco común | `uncommon` | `#4ADE80` verde | Clearcoat perlado, dos tonos, patrón en shader | Ninguna | Ribbon tintado | Puff de golpe tintado | Genérico | Destello verde |
| Rara | `rare` | `#3B82F6` azul | PBR completo: metalizado/perlado/anodizado, env map propio | Brillo especular que recorre al rodar (glints) | Ribbon tintado + degradado | Golpe y embocada tintados | +1 capa (timbre del golpe) | Haz azul |
| Épica | `epic` | `#A855F7` morado | Multicapa + emisión parcial en máscara (no global) | 1 capa animada en shader (flujo/pulso localizado) | Ribbon + partículas propias | Golpe, choque y embocada propios | Set propio (golpe/embocada) | Haz morado + partículas |
| Legendaria | `legendary` | `#F59E0B` oro | Multicapa + emisión HDR (atraviesa umbral de bloom) | 2+ capas, idle con la bola parada, reacción a velocidad | Ribbon con forma + partículas + distorsión ligera | Set completo (golpe, pared, bumper, labio, embocada cinemática 1.2 s) | Set completo + bucle de rodadura | Secuencia completa |
| Mítica | `mythic` | `#EF4444` → degradado carmesí/rosa animado | Todo lo anterior + estado **evolutivo/reactivo** (cambia con racha, contador o golpes del hoyo) | Estados y transiciones | Estela que cambia según estado | Transforma el hoyo/green al embocar; luz puntual breve (solo calidad Alta) | Firma sonora única | Secuencia completa + fase extra («falsa rareza» que sube a Mítica) |

Reglas visuales duras:
- **Común/Poco común nunca emiten luz**. **Rara** nunca emite. **Épica** emite solo en máscara ≤ 25 % de la superficie. **Legendaria/Mítica** pueden superar el umbral de bloom.
- El tier se comunica con **color + icono de forma** (Común ●, Poco común ◆, Rara ▲, Épica ⬟, Legendaria ★, Mítica ✦) por accesibilidad.
- El bloom global sigue ≤ 0.15 (decisión existente); el «glow» premium se consigue con emisión HDR en la máscara + sprite aditivo (aura), no subiendo el bloom.

### Re-tier de las skins existentes
| Skin | Tier nuevo | Nota |
|---|---|---|
| classic, mint | Común | Solo upgrade de base (hoyuelos, acabado) |
| veteran, sunset, birdie | Poco común | |
| champ, zephyr_nacre, galaxy | Rara | galaxy pasa a nebulosa en shader 3D |
| star, streak, gold, lava, ice, highroller, holo | Épica | ice → concepto «Criónova» (#5), holo → «Prisma Holo» (#7) |
| supernova_solar, crimson_dragon, damascus_imperial, kintsugi_neon, diamond, emerald | Legendaria | conceptos estrella #1–#4 y #8 |
| **nueva** `event_horizon` | Mítica | concepto #6 |
| **nueva** `midas_touch` | Mítica | concepto #8 evolucionado |

Nuevos desafíos para míticas (stats ya existentes): `wins50` (50 victorias) y `aces5` (5 hoyos en uno).

### Conceptos de skin estrella

Formato: **Paleta** · **Material** · **Animación** · **Estela** · **Golpe** · **Rodar** · **Pared/bumper** · **Embocar** · **Sonido**.

#### 1. Kintsugi Neón — Legendaria (rework de `kintsugi_neon`)
- **Paleta**: carbono `#07070A`, trama `#16161C`, grietas magenta `#E205FF` → núcleo blanco `#FFE6FF`, oro de reparación `#E8B64A`.
- **Material**: fibra de carbono tejida (normal map de twill en shader, rough 0.32, clearcoat 1 rough 0.05, metalness 0). Grietas = metal oro pulido (metalness 1, rough 0.15) con emisión HDR magenta en el centro de la veta.
- **Animación**: pulso de energía que **viaja a lo largo de las grietas** (campo de distancia a la veta + fase por `uTime`); a más velocidad, más rápido y más brillante. Idle: «latido» cada 2.5 s.
- **Estela**: ribbon magenta fino con núcleo blanco + polvo de oro (partículas que caen).
- **Golpe**: las grietas destellan a blanco 120 ms + 6–10 esquirlas doradas.
- **Rodar**: chispas magenta ocasionales en contacto con el suelo (≥ 3 m/s).
- **Pared**: micro-grieta extra temporal que se «repara» en 0.6 s (uImpact).
- **Embocar**: veta dorada que se dibuja en el green desde la bola hasta el hoyo (decal 1.5 s) + anillo magenta.
- **Sonido**: zumbido de neón de alta frecuencia en el golpe, «cristal + campana» al embocar.

#### 2. Damasco Imperial — Legendaria (rework de `damascus_imperial`)
- **Paleta**: acero `#1C2326`, capas claras `#9FB3B8`, filo verde `#10B981`, grabado oro `#C9A44C`.
- **Material**: metalness 1, rough 0.18–0.35 alternando por capa del patrón (las capas claras más pulidas): el patrón se lee por **reflejo**, no por color. Env map obligatorio. Clearcoat 0.
- **Animación**: barrido de luz (anisotropía falsa) que recorre las capas al rodar; idle: grabado verde respira muy sutil.
- **Estela**: hilo de chispas de forja ámbar que caen con gravedad.
- **Golpe**: lluvia de chispas tipo yunque (12–20, aditivas, con rebote).
- **Rodar**: «siseo» metálico; glints que siguen la rotación.
- **Pared**: chispa direccional según la normal del choque.
- **Embocar**: el hoyo se ilumina con aro de metal al rojo que se enfría (naranja → gris en 1.2 s).
- **Sonido**: «ting» de acero templado en el golpe; martillo + vapor al embocar.

#### 3. Supernova Solar — Legendaria (rework de `supernova_solar`)
- **Paleta**: `#2A0500` fondo, `#ED450C`, `#FFB703`, núcleo `#FFFBEB`.
- **Material**: plasma: emisión HDR casi total con granulación solar (voronoi 3D animado) y manchas solares oscuras; rough 0.6, sin clearcoat (no es un objeto barnizado, es una estrella).
- **Animación**: convección real en 3D (voronoi con celdas que derivan + fbm), protuberancias en el limbo vía fresnel; brillo sube con la velocidad.
- **Estela**: ribbon de fuego ancho que se estrecha, con brasas.
- **Golpe**: llamarada solar (arco de partículas en dirección opuesta al tiro).
- **Rodar**: chamuscado temporal en el césped (decal oscuro que se desvanece en 2 s, máx. 12 decals).
- **Pared**: eyección coronal (puff naranja aditivo).
- **Embocar**: mini-supernova: flash blanco + onda de choque naranja + luz puntual 0.4 s (solo Alta).
- **Sonido**: «whoomp» grave + crepitar.

#### 4. Dragón Carmesí — Legendaria (rework de `crimson_dragon`)
- **Paleta**: obsidiana `#190408`, escama `#5B0A17`, borde `#E11D48`, brasa `#FF7A1A`.
- **Material**: escamas voronoi con **normal map** (cada escama abombada), metalness 0.6, rough 0.25; entre escamas, brillo de brasa (emisión en máscara) que late como respiración.
- **Animación**: respiración (4 s); con la bola parada > 3 s un «ojo» se abre en una escama (idle). Al acelerar, las escamas se «erizan» (normal más marcada).
- **Estela**: humo oscuro + brasas.
- **Golpe**: bocanada de fuego corta en la dirección del tiro.
- **Pared/bumper**: chispas rojas + escama que destella.
- **Embocar**: anillo de fuego alrededor del hoyo + silueta de alas de partículas (calidad Alta).
- **Sonido**: gruñido grave filtrado en el golpe, rugido corto al embocar.

#### 5. Criónova — Épica (sustituye a `ice` «Sangre fría», mismo desbloqueo)
- **Paleta**: `#E8FBFF`, `#7FD6FF`, `#1E6FA8`, grietas `#FFFFFF`.
- **Material**: hielo falso (sin `transmission`, demasiado caro en móvil): base translúcida simulada con fresnel + env, **grietas internas con parallax** (2 capas de ruido desplazadas por el vector de vista), rough 0.05, clearcoat 1.
- **Animación**: escarcha que crece desde los polos cuando la bola está parada y se derrite al rodar.
- **Estela**: rastro de escarcha en el suelo (decals que se evaporan) + copos.
- **Golpe**: esquirlas de hielo.
- **Embocar**: el hoyo se congela (aro de escarcha 2 s).
- **Sonido**: campanilla cristalina; crujido de hielo al embocar.

#### 6. Horizonte de Sucesos — Mítica (nueva, `event_horizon`, desafío `wins50`)
- **Paleta**: negro absoluto `#000000`, disco `#FFB25C` → `#FF4D8D` → `#7A5CFF`, fotón `#FFFFFF`.
- **Material**: esfera negra pura (rough 1, sin reflejo) con **anillo de fotones** por fresnel invertido en el borde + **disco de acreción** (malla plana extra, shader de ruido rotando, inclinado 15°).
- **Estados (mítica)**: el disco crece con la racha de victorias actual (0–5) y cambia de color (oro → rosa → violeta).
- **Estela**: estrellas «estiradas» hacia la bola (partículas que se mueven hacia atrás en lugar de quedarse).
- **Golpe**: onda de distorsión (anillo oscuro que se expande) + implosión de partículas.
- **Rodar**: las partículas cercanas (confeti, polvo) son atraídas hacia la bola.
- **Embocar**: todo se succiona hacia el hoyo (implosión 0.8 s) y luego destello blanco; el hoyo queda como mini agujero negro 2 s.
- **Sonido**: sub-bajo descendente (sine 60→30 Hz) + «whoosh» invertido.

#### 7. Prisma Holo — Épica (rework de `holo`)
- **Paleta**: base cromada `#D9DEE6`, espectro completo dependiente del ángulo.
- **Material**: lámina holográfica tipo pegatina «Holo» de CS: thin-film en función de `dot(N,V)` + **destellos de purpurina** (puntos de ruido que solo se encienden con cierto ángulo vista/luz). Metalness 1, rough 0.12.
- **Animación**: el espectro se desplaza con la rotación real de la bola (no con el tiempo).
- **Estela**: ribbon arcoíris con desplazamiento de tono a lo largo de la cinta.
- **Golpe**: prisma de rayos de colores (6 rayos cortos).
- **Embocar**: aro arcoíris + chispas.
- **Sonido**: arpegio brillante corto.

#### 8. Toque de Midas — Mítica (nueva, `midas_touch`, desafío `aces5`)
- **Paleta**: oro 24K `#FFCF4A` / `#B8860B`, sombras `#5A3A00`, glint `#FFFFFF`.
- **Material**: oro pulido (metalness 1, rough 0.08) con **filigrana grabada** (normal map procedural) y AO en los hoyuelos.
- **Estados (mítica)**: con cada embocada de la partida, el césped por donde rueda se tiñe más de oro (máscara de estela dorada cada vez más ancha). El contador de hoyos en uno se graba en la bola.
- **Estela**: polvo de oro + «pasos» dorados en el césped.
- **Golpe**: lluvia de pepitas.
- **Embocar**: el green alrededor del hoyo se convierte en oro en un radio de 1.5 m (shader de decal) + fuente de monedas.
- **Sonido**: «clink» de monedas + coro corto.

> Las demás skins reciben el **upgrade base de su tier** (hoyuelos reales, acabado por tier, env map, estela ribbon, golpe tintado) sin trabajo individual.

---

## (c) Sistema de acabados tipo CS

### Instancia de skin
Cada skin desbloqueada pasa a tener **instancia**:
```js
inventory[skinId] = {
  seed: 0..999,          // patrón (rotación/offset/variante del ruido)
  float: 0.0..1.0,       // desgaste
  variant: 'base'|'pulida'|'ennegrecida', // si la skin tiene variantes
  counter: { enabled: bool, aces: 0, sinks: 0, birdies: 0 },
  unlockedAt: ISOString,
}
```
- `seed` y `float` se derivan **deterministamente** de `hash(owner || deviceId, skinId)` al desbloquear: no se pueden re-tirar recargando. El servidor los trata como inmutables una vez guardados.
- Contadores solo suben (misma regla que `save_progress`).

### Desgaste (float)
| Rango | Nombre | Efecto en shader (`uWear`) |
|---|---|---|
| 0.00–0.07 | Recién forjada | Sin efecto. Clearcoat máximo. |
| 0.07–0.15 | Casi nueva | Micro-rayas en clearcoat (roughness del clearcoat +0.05 en ruido fino). |
| 0.15–0.38 | Probada en campo | Suciedad en hoyuelos (AO tintado), rayas visibles. |
| 0.38–0.45 | Desgastada | Pintura descascarillada en los puntos altos (revela capa base: blanco/metal), clearcoat irregular. |
| 0.45–1.00 | Curtida en batalla | Desconchones grandes, emisión debilitada en zonas gastadas (en épicas+). |

Implementación: máscara `wearMask = smoothstep(1-uWear, 1-uWear+0.05, fbm(objPos*k + uSeed))` ponderada por la altura del hoyuelo (los bordes se gastan antes). La capa base revelada se define por skin (`finish.underlayer`).

Las míticas tienen el float acotado a 0–0.15 (como «Recién forjada/Casi nueva»), para que siempre luzcan.

### Patrones y variantes raras
- `seed` rota/desplaza el ruido 3D: cada bola es única.
- Cada skin estrella puede definir **semillas especiales** (`rarePatterns: [{ seeds:[...], name:'Veta Real' }]`), p. ej. Kintsugi con ≥ 30 % de superficie dorada, Damasco con «ojo de tigre» centrado. Se muestran con insignia en la inspección.
- Variantes de color por skin (`variants`): pulida / ennegrecida / firma — mismas mecánicas, distinta paleta; desbloqueables como hitos secundarios.

### Contador («Marcador»)
- Opcional por skin (todas las Legendarias y Míticas lo traen; resto, desbloqueo secundario).
- Cuenta **hoyos en uno, embocadas y birdies** jugando con esa skin equipada.
- Se ve en: chip en el HUD al embocar (+1 animado), panel de inspección (display LCD naranja tipo StatTrak), y **grabado en la bola** (franja de dígitos en una banda ecuatorial, textura canvas 256×32 actualizada solo al cambiar).

### Inspección 360°
- Pantalla completa también en móvil; gesto de arrastre con inercia, pellizco/rueda para zoom (0.6×–2×), doble toque para «flip» rápido.
- **Luces de estudio**: env map de estudio propio (3 softboxes + aro) generado con PMREM; key cálida, rim fría, suelo reflectante con desvanecido. Botón «Barrido de luz» que hace girar un softbox para ver el acabado.
- Panel: tier, colección, **barra de desgaste** con marcador del float (5 franjas de color), número de patrón, insignia de patrón raro, contador, fecha de desbloqueo, lore de 1 línea.
- Botón «Probar efectos»: mini-escena con un tramo de césped: golpe → rodada con estela → choque → embocada, en bucle.
- Animación de entrada a la inspección (CS): la bola entra girando, se frena y queda con el «lado bueno» (máximo del patrón) hacia cámara.
- En partida (opcional, P12): mantener `I` / doble toque en la bola entre golpes → la cámara orbita la bola 2 s.

---

## (d) Efectos animados tipo CoD

### Arquitectura de shader
- `MeshPhysicalMaterial` + `onBeforeCompile` inyectando: varying de **posición en espacio de objeto** (`vObjPos`, sin costuras ni polos), uniforms comunes `uTime, uSpeed, uImpact, uWear, uSeed, uState, uQuality`, biblioteca GLSL (`noise3`, `fbm3`, `voronoi3`, `fresnel`, `hash`), y un **chunk de patrón por skin** que escribe `diffuseColor`, `roughnessFactor`, `metalnessFactor`, `totalEmissiveRadiance` y perturba la normal.
- Normal de hoyuelos: textura compartida horneada offline (`public/skins/dimples-normal.webp`, 1024×512; 512×256 en Baja), combinada con la normal del patrón.
- **Env map propio de la bola** (`material.envMap`), independiente de `scene.environment`: estudio neutro en temas de día, versión oscura con rim de color del tema en noche/neón. Así los metales reflejan siempre.
- Emisión HDR (valores 2–6) solo en máscaras → el bloom actual (umbral 0.85–0.95) la recoge sin subir la intensidad global.

### Familias de efectos de shader
| Familia | Técnica | Skins |
|---|---|---|
| Energía | Pulso por campo de distancia a vetas, velocidad ligada a `uSpeed` | Kintsugi, Damasco (grabado) |
| Fuego/plasma | Voronoi 3D animado + fbm, emisión HDR, fresnel de corona | Supernova, Lava, Racha |
| Glitch | Bloques cuantizados en `vObjPos`, desplazamiento RGB por canal en emisión, ráfagas aleatorias con semilla temporal | (futura skin Épica «Fallo de sistema») |
| Holo | Thin-film por `dot(N,V)` + purpurina angular | Prisma Holo, Céfiro Nácar |
| Hielo | Parallax de 2 capas de ruido por vector de vista | Criónova |
| Vacío | Fresnel invertido + malla de disco | Horizonte de Sucesos |
| Reveal | `uReveal` 0→1: disolución por ruido con borde emisivo del color de tier | Todas (animación de desbloqueo) |

### Partículas, estela, aura e impacto
- **RibbonTrail**: cinta de 32–48 segmentos orientada a cámara, ancho y opacidad por perfil (`fx.trail.width`, `taper`), shader con degradado, ruido de borde y desplazamiento de UV (fuego, arcoíris, energía). Se desvanece por tiempo, no solo por longitud. Sustituye a `Trail` en Media/Alta; `Trail` se queda para Baja.
- **Partículas por skin**: extender `Particles` con material **aditivo** y atlas de sprites (chispa, brasa, esquirla, copo, moneda, glifo) — 1 InstancedMesh aditivo más. Emisores declarativos en datos (`fx.hit`, `fx.roll`, `fx.wall`, `fx.lip`, `fx.sink`).
- **Aura**: sprite aditivo con fresnel (Legendaria+), escala con `uSpeed`, color del tier/skin.
- **Impacto**: `uImpact` (0→1, decae en 0.3 s) que el shader usa para destellos; ondas de choque tintadas (reutilizar `Shockwaves` con color de la skin).
- **Decals de suelo** (chamuscado, escarcha, oro): pool fijo de 12 planos con `polygonOffset`, se reutilizan.
- **Embocada cinemática** (Legendaria+): 1.2 s, secuenciada en `SkinFX.onSink()`; no retrasa `onSunk` (ya hay 2.2 s de margen en `GolfGame.js:1168`).

### Animación de reveal/desbloqueo
Secuencia (total 3.2 s Legendaria, 4.2 s Mítica, 1.5 s Común; saltable tras el primer toque):
1. 0–0.5 s: oscurece la pantalla, viñeta, sonido de «carga».
2. 0.5–1.3 s: haz de luz vertical del **color del tier** (en Mítica empieza dorado y «sube» a carmesí: falsa rareza).
3. 1.3–2.2 s: la bola se materializa con `uReveal` (disolución con borde emisivo) girando.
4. 2.2–2.8 s: estallido de partículas + golpe sonoro + sello del tier con icono.
5. 2.8–3.2 s: aparece nombre, float con contador rodando hasta su valor, número de patrón; botones «Inspeccionar» / «Equipar».
- Respeta `prefers-reduced-motion`: versión de 0.6 s sin partículas ni haces.

---

## (e) UI

### Tarjetas de skin
- Miniatura **renderizada en 3D** (render offscreen único por skin+instancia, cacheado a dataURL/ImageBitmap), con env de estudio: por fin se ve metal y clearcoat. Sustituye a `ballPreview` en tarjetas, lobby y desafíos (mantener `ballPreview` como fallback si WebGL falla).
- Marco del color del tier + icono de forma; franja inferior con nombre, tier, **mini-barra de desgaste**; chip «Marcador» si tiene contador; insignia de patrón raro.
- Fondo de tarjeta con «escena» de la skin (degradado de su paleta), no la lámina genérica del tier.
- Bloqueadas: silueta oscura con el halo del tier visible y el requisito con barra de progreso (genera deseo).
- Hover/toque: inclinación holo (ya existe `.holo`) + la miniatura cambia a vídeo-loop corto (sprite sheet de 12 frames generado en el mismo render offscreen) en Legendaria+.
- **Tocar = inspeccionar**; equipar es un botón explícito en la inspección.
- Filtros: tier, colección, desbloqueadas; orden por tier descendente por defecto (lo mejor arriba).

### Vista de inspección
Ver (c). Layout móvil: canvas a pantalla completa, panel inferior deslizable (bottom sheet) con datos; escritorio: canvas grande a la izquierda, panel a la derecha (sustituye `.skin-inspector-panel`).

### Pantalla de resultado / desbloqueo
- Las skins nuevas abren la secuencia de reveal (d) antes del resumen; si hay varias, en cola ordenadas de menor a mayor tier (la mejor al final).

---

## (f) Rendimiento

### Presupuesto por calidad (`src/game/render/quality.js`)
| Recurso | Baja | Media (móvil por defecto) | Alta (escritorio) |
|---|---|---|---|
| Material bola | `MeshStandardMaterial` + textura canvas horneada (sin anim. de shader) | Physical + shader de patrón (fbm ≤ 3 octavas, voronoi ≤ 1 capa) | Shader completo (fbm 4–5, parallax, purpurina) |
| Esfera | 24×16 | 48×32 | 64×48 (inspección 128×96) |
| Normal hoyuelos | 512×256 | 1024×512 | 1024×512 |
| Estela | `Trail` puntos (actual) | Ribbon 32 seg. | Ribbon 48 seg. + distorsión |
| Partículas skin activas | ≤ 40 | ≤ 120 | ≤ 300 |
| Aura | No | Sprite | Sprite + fresnel shell |
| Luz puntual en embocada | No | No | Sí (0.4 s) |
| Decals de suelo | 0 | 6 | 12 |
| Draw calls extra por skin | 0–1 | ≤ 3 | ≤ 5 |
| Memoria de texturas por skin | ≤ 0.5 MB | ≤ 2 MB | ≤ 4 MB |

### Reglas
- **Compilación sin tirones**: `renderer.compileAsync(scene, camera)` tras crear la bola en `#buildScene`, antes de quitar la intro.
- **Gobernador adaptativo** solo para FX de skin: media móvil del frame time; si > 20 ms durante 2 s, baja un escalón `skinFxLevel` (no toca la calidad global ni la física); recupera tras 10 s < 14 ms.
- Nada de `transmission`, refracción en pantalla ni passes extra de postproceso para skins.
- Cero asignaciones por frame en `update` (reutilizar Vector3/Color; corregir `effects.js:134`).
- Todo `dispose()` al cambiar de skin o salir (material, mapas, env, geometrías de FX).
- Inspector: render solo si visible (`IntersectionObserver` + `document.hidden`), DPR máx. 2, se destruye al salir de la pantalla.
- Miniaturas 3D: un solo renderer offscreen compartido, generación en cola con `requestIdleCallback`, cache en memoria por `skinId:seed:float`.
- Determinismo: los FX usan su propio RNG de render; ningún import desde `render/` hacia `physics.js` ni al revés (salvo constantes ya existentes como `BALL_R`).

---

## (g) Plan de tareas para implementadores

### Convenciones
- Cada paquete = 1 commit (o PR) autocontenido, con `pnpm test` y `pnpm build` en verde.
- **Propiedad de archivos**: un paquete solo edita los archivos listados. Si necesita otro, lo pide al coordinador.
- Modelos: **H** = Haiku 5.5 (high), **S** = Sonnet 5.5 (medium).
- Nuevos archivos de render de skins viven en `src/game/render/skins/`; de UI en `src/ui/`.

### Grafo de dependencias
```
Fase 0:  P1 (datos)   P2a (hornear hoyuelos)   P7 (audio, tras P1 solo por el esquema)
            │               │
Fase 1:  P2 (núcleo material) ──┬── P3a..P3h (un patrón por skin, paralelos entre sí)
            │                   │
         P4 (inventario/float)  P5 (FX runtime)
            │                   │
Fase 2:  P6 (integración GolfGame) ── P11 (rendimiento)
            │
Fase 3:  P8 (inspector) → P9 (pantalla skins + tarjetas) → P10 (reveal)
Opcional: P12 (inspección en partida + marcador grabado)
```
Paralelizables sin pisar archivos: {P1, P2a}; {P3a…P3h, P4, P5, P7} tras P2/P1; {P11, P8} tras P6.

---

#### P1 — Esquema de datos y tiers · **S** · Fase 0
- **Archivos**: `src/progress/skins.js`, `tests/progress.test.js`, nuevo `tests/skins-schema.test.js`, `src/main.js` (solo `RARITY_HEX` `:270-276` y los usos de `RARITIES[...]`), `src/style.css` (solo clases `rarity-*`/`tier--*`: `:603-605`, `:615-619`, `:778-787`, `:2372-2400`).
- **Trabajo**: `TIERS` = {common, uncommon, rare, epic, legendary, mythic} con `{name, order, color, icon}`; mantener `RARITIES` como alias exportado para no romper imports. Re-tier según la tabla de (b). Esquema por skin: `tier, collection, lore, palette{base,accent,secondary,glow}, finish{preset, roughness, metalness, clearcoat, underlayer}, shader` (id de patrón o `null`), `fx{trail{style,color,width,taper}, aura, hit, roll, wall, lip, sink}`, `sfx{set}`, `counter` (bool), `variants`, `rarePatterns`, `wearRange`. Añadir `event_horizon` y `midas_touch` y los desafíos `wins50`, `aces5`. `RARITY_HEX` lee `TIERS[t].color`. CSS: 6 clases `rarity-<tier>` con tokens `--foil/--edge/--glow/--ink`.
- **Aceptación**: todos los tests pasan; test de esquema valida que cada skin tiene campos obligatorios y un tier válido; ids de skins existentes intactos (no se pierde el equipado de nadie); las pantallas actuales siguen renderizando sin errores de consola.

#### P2a — Normal map de hoyuelos horneado · **H** · Fase 0 (paralelo a P1)
- **Archivos**: nuevo `scripts/bake-dimples.mjs`, nuevo `public/skins/dimples-normal.webp` y `public/skins/dimples-normal-512.webp`.
- **Trabajo**: script Node (sin dependencias nuevas; escribir PNG con zlib nativo y convertir a WebP solo si hay herramienta disponible, si no dejar PNG) que genera normal map equirectangular de ~336 hoyuelos distribuidos por Fibonacci en la esfera, perfil esférico suave, radio angular ~0.105 rad, en espacio tangente.
- **Aceptación**: sin costura visible en u=0/1 ni pellizco en polos al aplicarlo a una esfera; ≤ 600 KB el de 1024×512; script reproducible (`node scripts/bake-dimples.mjs`).

#### P2 — Núcleo del material premium · **S** · Fase 1 (tras P1, P2a)
- **Archivos**: `src/game/render/ballSkins.js` (refactor), nuevos `src/game/render/skins/shaderLib.js`, `src/game/render/skins/skinMaterial.js`, `src/game/render/skins/envStudio.js`, `src/game/render/skins/patterns/index.js` (registro con stubs para los 8 ids de P3).
- **Trabajo**: `createSkinMaterial(skin, { quality, instance, theme })` → `{ material, update(t, dt, { speed, impact, state }), dispose() }`. Inyección `onBeforeCompile` (ver d), uniforms comunes, normal de hoyuelos + normal del patrón, **chunk de desgaste** (`uWear`, `uSeed`, `finish.underlayer`), presets de acabado por tier (tabla b), `uReveal`. `envStudio.js`: genera y cachea 2 env maps PMREM (estudio claro / estudio oscuro con rim tintable). Fallback Baja: material estándar + `paintBall` (conservar `paintBall` y `ballPreview`). Mantener export `skinMaterial(skin)` como envoltorio compatible que devuelve `material` con `userData.update` para no romper `GolfGame.js:1219` y el inspector actual hasta P6/P8.
- **Aceptación**: todas las skins renderizan en las 3 calidades sin errores de compilación de shader; las skins sin `shader` propio se ven con hoyuelos en relieve y acabado de su tier; metales reflejan en temas de noche; sin costuras ni polos pellizcados; `dispose()` libera todo (comprobado con `renderer.info.memory` antes/después de 20 cambios de skin).

#### P3a…P3h — Un patrón por skin estrella · Fase 1 (tras P2; paralelos entre sí)
- **Archivos**: cada uno **solo** `src/game/render/skins/patterns/<id>.js` (exporta `{ glsl, uniforms, update(u, t, dt, ctx), quality: {low, medium, high} }`).
- **Paquetes y modelo**:
  - P3a `kintsugi_neon` — **S** (campo de distancia a vetas + pulso viajero)
  - P3b `damascus_imperial` — **H** (bandas fbm → rough/metal alternos; spec de (b) #2)
  - P3c `supernova_solar` — **S** (voronoi 3D animado + corona)
  - P3d `crimson_dragon` — **S** (escamas voronoi con normal + idle de ojo)
  - P3e `ice` → Criónova — **S** (parallax de 2 capas)
  - P3f `event_horizon` — **S** (fresnel invertido; el disco es FX de P5, aquí solo la esfera)
  - P3g `holo` → Prisma Holo — **H** (thin-film por ángulo + purpurina)
  - P3h `midas_touch` — **H** (oro + filigrana + AO hoyuelos; estado evolutivo vía `ctx.state`)
- **Aceptación** (cada uno): cumple paleta/material/animación de su ficha en (b); lectura clara a la distancia de cámara de juego (captura a 6 m); coste en Media ≤ 1.5× el material base (medir ms GPU con `EXT_disjoint_timer_query` si existe, si no FPS en escena vacía); variante Baja definida; `uSeed` cambia el patrón visiblemente; `uWear` funciona.

#### P4 — Inventario, float, patrón y contador · **S** · Fase 1 (tras P1; paralelo a P2/P3/P5)
- **Archivos**: nuevo `src/progress/inventory.js`, `src/progress/Progress.js`, nuevo `supabase/migrations/20261026120000_skin_inventory.sql`, `tests/progress.test.js` (bloque nuevo al final) o nuevo `tests/inventory.test.js`.
- **Trabajo**: `inventory` en el estado (ver c), asignación determinista de `seed`/`float` al desbloquear (también para skins ya desbloqueadas al migrar), `wearName(float)`, `recordMatch` incrementa contadores de la skin equipada (aces, sinks, birdies). Migración: `save_progress` acepta `inventory` (objeto, ≤ 64 entradas, `seed`/`float` inmutables si ya existen, contadores solo suben y ≤ +20 por guardado, claves de skin ≤ 32 chars), sin romper claves actuales.
- **Aceptación**: tests de determinismo de float (mismo owner+skin → mismo valor), de inmutabilidad y de contadores; un estado antiguo sin `inventory` se migra sin pérdida; `tests/economy.test.js` y `tests/determinism.test.js` intactos y en verde.

#### P5 — Runtime de FX de skin · **S** · Fase 1 (tras P1; paralelo a P2/P3/P4)
- **Archivos**: nuevo `src/game/render/skins/skinFx.js`, `src/game/render/effects.js` (añadir `RibbonTrail`, partículas aditivas, `GroundDecals`; corregir asignación en `:134`), `src/game/render/textures.js` (añadir atlas `skinSpriteAtlas()`).
- **Trabajo**: clase `SkinFX(scene, skin, { quality })` con `onHit(power, pos, dir)`, `onWall(strength, pos, normal)`, `onBumper(pos)`, `onLip(pos)`, `onSink(cupPos)`, `update(t, dt, { pos, speed, moving, camera })`, `setLevel(level)`, `dispose()`. Emisores declarativos leídos de `skin.fx`. Aura, decals, disco de acreción (`event_horizon`), luz puntual de embocada (solo Alta). No toca `GolfGame.js`.
- **Aceptación**: demo aislada (test de humo con escena mínima o página dev del inspector P8) muestra cada evento; límites de partículas/draw calls de (f) respetados por calidad; cero asignaciones por frame en `update` (revisar código); `dispose()` deja `renderer.info` como al inicio.

#### P6 — Integración en partida · **H** · Fase 2 (tras P2, P5)
- **Archivos**: solo `src/game/GolfGame.js`.
- **Trabajo** (puntos exactos):
  - `:408-411` bola con `createSkinMaterial` y segmentos según calidad; guardar handle para `update`/`dispose`.
  - `:449` crear `this.skinFx = new SkinFX(...)` (mantener `Trail` solo si calidad Baja, o delegar en SkinFX).
  - `:622-624` `this.skinFx.onHit(power, pos, dir)` (mantener puff/onda genéricos solo para Común).
  - `:1119-1121` `onBumper`; `:1126-1128` `onWall`; `:1139-1140` `onLip`; `:1162-1165` `onSink` (el confeti genérico solo para Común/Poco común).
  - `:1219` `update(t, dt, { speed, impact })`; `:1270` `this.skinFx.update(...)`.
  - `#buildScene`: `renderer.compileAsync` antes de terminar la intro; `dispose()` (`:371`) libera material y FX.
- **Aceptación**: `pnpm test` (en especial `determinism`, `replay`, `hole-timer`) en verde sin cambios en los tests; partida completa en día/noche/neón sin errores; las réplicas se ven con la skin y FX del jugador.

#### P7 — Sonido por skin · **H** · Fase 0/1 (tras P1; paralelo)
- **Archivos**: solo `src/game/audio.js`.
- **Trabajo**: `sfx.skin(set, event, { power })` con síntesis Web Audio para los sets: `neon`, `steel`, `solar`, `dragon`, `ice`, `void`, `holo`, `gold` (eventos `hit`, `wall`, `sink`, `roll` opcional). Capa encima del sonido base, volumen ≤ 0.6, respeta `isMuted()`.
- **Aceptación**: cada set suena distinto y reconocible; sin clipping al encadenar golpes; ningún buffer nuevo descargado (todo procedural); P6 o P5 lo invocan vía `skin.sfx.set`.

#### P8 — Inspector 360° v2 · **S** · Fase 3 (tras P2, P4; usa P5 para «Probar efectos»)
- **Archivos**: nuevo `src/ui/skinInspector.js`, nuevo `src/ui/skinInspector.css` (importado desde el módulo).
- **Trabajo**: mover/rehacer `createSkinInspector` (`src/main.js:278-395`) con API `createSkinInspector(container, { skin, instance, mode: 'panel'|'fullscreen' })` → `{ setSkin, playFx, destroy }`. Env de estudio, luces (key/rim/fill sin ambiente alto), suelo reflectante falso, inercia, pellizco, barrido de luz, «lado bueno», panel de datos (tier, desgaste con barra, patrón, rarePattern, contador, lore), «Probar efectos». Modo dev `?skinlab=1`: grid de todas las skins + sliders de float/seed/calidad (para el revisor).
- **Aceptación**: funciona en 375×812 (táctil) y escritorio; 60 FPS en escritorio y ≥ 45 en móvil medio en Media; sin fugas tras abrir/cerrar 20 veces; pausa cuando no es visible.

#### P9 — Pantalla de skins y tarjetas · **S** · Fase 3 (tras P8)
- **Archivos**: `src/main.js` (solo `showSkins` `:397-556`, el hero `:205-221`, `ball()` `:48` y lista de desafíos), `src/style.css` (solo sección skins `:738-813` y responsive `:1909`, `:1988-2075`), nuevo `src/ui/skinThumbs.js`.
- **Trabajo**: miniaturas 3D offscreen (cola + cache), tarjetas según (e), tocar = inspeccionar, botón equipar explícito, filtros/orden, inspector a pantalla completa en móvil (quitar el `display:none` de `:1909`).
- **Aceptación**: todas las tarjetas muestran material real (metal/clearcoat visibles); orden por tier desc.; equipar sigue funcionando y persiste; primera carga de la pantalla < 1.5 s en móvil medio (miniaturas progresivas con placeholder `ballPreview`).

#### P10 — Animación de reveal/desbloqueo · **S** · Fase 3 (tras P8; **no** en paralelo con P9 por `main.js`)
- **Archivos**: nuevo `src/ui/skinReveal.js`, nuevo `src/ui/skinReveal.css`, `src/main.js` (solo `:1530-1535` y `:1773-1776`, sustituir por `await showSkinReveal(newSkins)`).
- **Trabajo**: secuencia de (d), cola de varias skins, saltable, `prefers-reduced-motion`, sonido por tier (usa P7).
- **Aceptación**: tiempos por tier de (d) ±10 %; Mítica muestra la «falsa rareza»; tras el reveal el resumen de partida sigue igual; botón «Equipar» funciona.

#### P11 — Rendimiento y calidad adaptativa · **H** · Fase 2 (tras P5, P6)
- **Archivos**: `src/game/render/quality.js`, nuevo `src/game/render/perfGovernor.js`.
- **Trabajo**: añadir a cada preset `skinFx: 'low'|'medium'|'high'`, `ballSegments`, `dimpleRes`; gobernador de (f) que llama a `skinFx.setLevel()`; exponer métricas en `?skinlab=1`.
- **Aceptación**: en Baja la bola no usa shader custom; con throttling de CPU ×4 en DevTools el gobernador baja nivel en ≤ 3 s y la partida no cae de 30 FPS; sin cambios en la física.

#### P12 (opcional) — Inspección en partida y marcador grabado · **S** · tras P6, P4
- **Archivos**: `src/game/GolfGame.js` (input y cámara), `src/game/render/skins/skinMaterial.js` (banda de dígitos).
- **Aceptación**: mantener `I`/doble toque en la bola parada orbita 2 s sin afectar al temporizador ni al tiro; el contador grabado se actualiza al embocar.

### Recomendación de producto (fuera de código)
El juego tiene mesas con entrada de dinero. **No** introducir cajas/sobres de pago con resultado aleatorio ni mercado de reventa con dinero real: es el modelo que hoy está bajo escrutinio regulatorio (cajas botín) en varios países, incluido España. El float/patrón aleatorio se asigna solo en desbloqueos gratuitos por hitos; si se monetiza, que sea compra directa a precio fijo o pase de temporada con contenido visible. (Consultar asesoría legal antes de monetizar.)

---

## Lista de verificación para el REVISOR/AUDITOR (Haiku 5.5)

### Por cada paquete
- [ ] Solo se han modificado los archivos que el paquete lista (`git diff --stat`).
- [ ] `pnpm test` y `pnpm build` en verde. `tests/determinism.test.js`, `replay.test.js`, `economy.test.js` **sin modificaciones**.
- [ ] Ningún archivo de `src/game/render/` o `src/ui/` importa nada de física salvo constantes ya usadas (`BALL_R`); `physics.js` no cambia.
- [ ] Sin `Math.random()` en código que corra dentro de `step()`/simulación.
- [ ] Sin errores ni warnings nuevos en consola (WebGL, compilación de shader, 404 de assets).
- [ ] Textos de UI en español; nombres de tier y skin coherentes con la tabla (b).

### Visual (capturas con `?skinlab=1` y en partida)
- [ ] Cada skin en 3 temas (día, noche, neón) × 3 calidades: metales reflejan algo en noche/neón; nada «quemado» a blanco en neón.
- [ ] Hoyuelos visibles en inspección en todas las skins (incluidas las 5 procedurales).
- [ ] Sin costura vertical ni pellizco en polos (girar la bola en el inspector).
- [ ] Común/Poco común/Rara no emiten luz; Épica emite solo en máscara; Legendaria/Mítica atraviesan el bloom sin subir `bloom.strength` por encima de 0.15.
- [ ] Desgaste: 5 capturas de la misma skin con float 0.03 / 0.1 / 0.25 / 0.4 / 0.8 se distinguen; seed distinto → patrón distinto.
- [ ] Cada skin estrella: estela, golpe, pared, labio y embocada propios presentes y acordes a su ficha.
- [ ] Tier identificable sin color (icono de forma presente).

### Rendimiento
- [ ] Viewport 375×812 en Media: ≥ 45 FPS rodando con la skin más cara; escritorio Alta: ≥ 60 FPS.
- [ ] `renderer.info.memory` (geometries/textures) vuelve al valor inicial tras 20 cambios de skin y tras abrir/cerrar el inspector 20 veces.
- [ ] Sin tirón al empezar el hoyo (compileAsync en uso).
- [ ] Partículas activas y draw calls dentro de la tabla (f) por calidad.
- [ ] Baja usa material estándar sin shader custom.

### Datos y servidor
- [ ] Un `gcb.progress.v1` antiguo (sin `inventory`) carga, conserva la skin equipada y genera inventario.
- [ ] `seed`/`float` iguales al recargar y en otro dispositivo con la misma cuenta.
- [ ] La migración SQL: `save_progress` sigue aceptando las claves antiguas; rechaza cambiar `seed`/`float` existentes y bajadas de contadores; no toca saldo.
- [ ] El contador sube solo con la skin equipada y solo por eventos reales de la partida.

### UX
- [ ] Tocar tarjeta abre inspección; equipar requiere botón explícito; equipada se refleja en lobby y partida.
- [ ] Inspector disponible en móvil (pantalla completa) y escritorio.
- [ ] Reveal: saltable, cola de varias skins en orden ascendente de tier, versión corta con `prefers-reduced-motion`.
- [ ] Ninguna mecánica de pago aleatorio introducida.
