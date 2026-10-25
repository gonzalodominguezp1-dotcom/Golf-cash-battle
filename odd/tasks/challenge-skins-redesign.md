# Feature: Rediseño de Skins de Bola por Desafío y Showcase Interactivo

## Objetivo
Rediseñar integralmente todas las skins de bola que se consiguen mediante desafío en Golf Cash Battle (`veteran`, `birdie`, `star`, `streak`, `ice`, `highroller`), creando un laboratorio interactivo en HTML (`challenge-skins.html`) con 4 opciones de diseño premium por cada skin (24 conceptos únicos), equipadas con:
- Renderizado 3D fotorrealista con Three.js (texturas procedurales, dimples, iridiscencia, brillo metálico, núcleos emisivos).
- Animaciones dinámicas de superficie (pulsos de energía, magma en movimiento, escarcha fractal, ondas de viento).
- Efectos de rodada en tiempo real (estelas procedurales de fuego, agua/rocío, hielo/escarcha, polvo de estrellas, chispas de latón y nitro).
- Efectos de acierto en hoyo (celebraciones inmersivas de embocado: supernovas, criocongelación, tornados de plumas, lluvia de diamantes y fuegos artificiales de alta gama).
- Síntesis de audio Web Audio API para acompañar los impactos, rodadas y celebraciones de hoyo sin dependencias externas.
- Inspector interactivo con controles de órbita 3D, simulador de rodada continua, disparador de acierto en hoyo, matriz comparativa 4-up y exportador de configuración JSON para integración inmediata en el juego principal.

## Skins de Desafío a Rediseñar (24 Opciones)
1. **Veterana** (`veteran` - Desafío: *Juega 10 partidas* - Rareza: Bronce)
   - Opción 1: *Damascus Steel & Forge Sparks* (Acero forjado con vetas doradas y chispas ámbar)
   - Opción 2: *Artisan Leather & Brass Steam* (Cuero clásico artesanal cosido en latón con halo de vapor cálido)
   - Opción 3: *Cyber Relic & Copper Surge* (Reliquia de bronce antiguo con circuitos de cobre palpitantes)
   - Opción 4: *Kintsugi Carbon Matrix* (Fibra de carbono mate con fracturas de oro kintsugi y ceniza noble)

2. **Pajarito** (`birdie` - Desafío: *Consigue 5 birdies* - Rareza: Plata)
   - Opción 1: *Zephyr Aero-Feather* (Nácar eólico aerodinámico con filamentos de pluma y micro-vórtices)
   - Opción 2: *Hydro-Aero Splash* (Cristal aguamarina con gotas en suspensión y estela de espuma oceánica)
   - Opción 3: *Sonic Mach-1 Wing* (Titanio aeroespacial pulido con conos de condensación supersónicos)
   - Opción 4: *Thunderbird Celestial* (Ópalo celeste con descargas electrostáticas cian internas y rayo cenital)

3. **Estrella** (`star` - Desafío: *Haz un hoyo en uno* - Rareza: Oro)
   - Opción 1: *Solar Supernova Core* (Corona solar ardiente con erupciones cromosféricas y estallido de supernova)
   - Opción 2: *Starlight Astrolabe* (Oro celestial grabado con astrolabio y estela de constelaciones geométricas)
   - Opción 3: *Pulsar Chronos* (Núcleo de neutrones con haces de energía gamma polares e implosión luminosa)
   - Opción 4: *Ace of Midas Bullion* (Oro macizo de 24K con corte marquesa, estela de monedas y cascada VIP)

4. **Racha** (`streak` - Desafío: *Gana 3 partidas seguidas* - Rareza: Oro)
   - Opción 1: *Blazing Inferno On-Fire* (Flama viva 3D volumétrica con magma interior y estela ardiente de ascuas)
   - Opción 2: *Cyan Nitro Velocity* (Combustión azul cobalto con estela de turbina jet térmica supersónica)
   - Opción 3: *Dragon's Crimson Scale* (Escamas de dragón obsidiana/carmesí con ojos de brasa y columna de humo)
   - Opción 4: *Overclocked Plasma Surge* (Matriz sobrecalentada de circuitos al rojo vivo con arcos voltaicos)

5. **Sangre Fría** (`ice` - Desafío: *Gana un desempate* - Rareza: Diamante)
   - Opción 1: *Zero-Kelvin Cryo-Nova* (Hielo glaciar fractal de 32 facetas con estela de escarcha y onda criogénica)
   - Opción 2: *Arctic Blizzard Prism* (Prisma de ventisca ártica con remolino de copos de nieve en gravedad cero)
   - Opción 3: *Liquid Nitrogen Flow* (Cromo subcero con evaporación de niebla densa arrastrándose a ras de suelo)
   - Opción 4: *Shattered Glacial Diamond* (Diamante azul ártico agrietado con pulsaciones cardíacas frías y esquirlas de luz)

6. **High Roller** (`highroller` - Desafío: *Gana una mesa de Oro o superior* - Rareza: Diamante)
   - Opción 1: *Crown Jewel Brilliant Cut* (Diamante corte brillante de 58 facetas con fuego prismático y lluvia de gemas)
   - Opción 2: *Royal Amethyst & Platinum* (Platino cepillado con amatista real, estela púrpura y coronación dorada)
   - Opción 3: *Black Card Titanium Carbon* (Titanio negro cepillado con bisel de oro rosa y red holográfica)
   - Opción 4: *Baccarat Emerald & Gold Velvet* (Esmeralda imperial en cojín con filigrana de oro y lluvia de fichas VIP)

## Checklist de Tareas
- [x] `task-1`: Estructura HTML y arquitectura de datos de las 24 variantes de skins de desafío con sus parámetros completos de texturas, físicas, materiales, estelas y aciertos en hoyo.
- [x] `task-2`: Motor 3D Three.js con generación procedural de texturas de alta resolución (1024x512), hoyuelos realistas de bola de golf, materiales físicos avanzados (MeshPhysicalMaterial, iridiscencia, rugosidad, metalizado) y shaders dinámicos.
- [x] `task-3`: Sistema de simulación de rodada y partículas de estela en tiempo real (fuego, hielo/escarcha, agua/rocío, relámpagos, polvo de estrellas y nitro) con controles interactivos de velocidad.
- [x] `task-4`: Sistema de efectos de acierto en hoyo con animaciones cinemáticas, física de caída en copa, explosiones de partículas temáticas y síntesis sonora procedural con Web Audio API.
- [x] `task-5`: Interfaz luxury clubhouse según DESIGN.md (Outfit/Plus Jakarta Sans, obsidiana `#08070D`, acentos dorados `#FFD23F`, selector de bolas, pestañas de 4 opciones, modo comparador cuádruple, presets y exportador JSON) y verificación visual.
- [x] `task-6`: Mapeo procedural esférico 3D continuo sin cortes visuales (Seamless 3D noise & Voronoi), mapa de normales físico de hoyuelos (dimples), y remoción de efectos de rodada y hoyo a solicitud del usuario.
- [x] `task-7`: Personalizador dinámico de colores interactivo (color pickers para Base, Acento, Secundario y Brillo, presets de lujo en un clic, regeneración inmediata de textura 3D en tiempo real y sincronización en visor y JSON exportable).

## Registro de Estado y Evidencia
- **Ruta implementada**: Directa con orquestador y tareas desacopladas.
- **Commit**: `3c5656a`, `7357a30`, `4342bc2` (feat(skins): add real-time color customizer with hex pickers and luxury palette presets).
- **Engram Mirror**: `odd/challenge-skins-redesign/tasks` (marcado local).
- **Modo TDD**: Functional checks + validación interactiva visual en navegador + 68/68 unit tests pasando + build de producción Vite exitoso.
- **task-1 completada**: Definición estructurada de `CHALLENGE_SKINS_DATA` con 24 variantes de skins, metadatos de rareza, requisito de desafío, parámetros de material 3D (roughness, metalness, clearcoat, iridescence, emissive), tipo de estela de rodada y efecto de acierto en hoyo.
- **task-2 completada**: Función `generateProceduralTexture(opt)` implementando 24 patrones procedurales con canvas 2D proyectados esféricamente, incluyendo textura de hoyuelos de bola de golf y renderizado fotorrealista con `MeshPhysicalMaterial` e iluminación de estudio de tres puntos más punto de halo.
- **task-3 completada**: Simulador dinámico `isRolling` con rotación física, tira de fairway activable, control de velocidad variable (1 a 10 m/s) y emisor de partículas continuo `emitTrail` con paletas de color y físicas personalizadas por elemento (fuego, hielo, agua, nitro, etc.).
- **task-4 completada**: Disparador interactivo `btn-hole-celebrate` con emisor explosivo de 120 partículas temáticas (con gravedad, rotación y desvanecimiento) y motor de síntesis de audio procedural Web Audio API (`playHoleCelebrationSound` y `playRollSound`) con sonido de impacto en copa y acorde triunfal.
- **task-5 completada**: Diseño de UI de alto estándar según `DESIGN.md`: tipografías Outfit y Plus Jakarta Sans, paleta obsidiana/oro/esmeralda, barra lateral con miniaturas de bola activas, selector de 4 opciones con previsualizaciones, modo comparador cuádruple (4-Up) con renderizadores sincronizados, cajón técnico con exportador JSON y enlace integrado en la pantalla de Skins de `src/main.js`. 68/68 tests pasando y compilación `pnpm build` sin errores.
- **task-6 completada**: Reescritura matemática a espacio vectorial 3D sobre la esfera unitaria `(nx, ny, nz) = uvToSphere(u, v)`, eliminando al 100% las costuras en el meridiano u=0/u=1 y las singularidades polares. Implementación de Voronoi esférico 3D (`voronoiSpherical`), puntos de Fibonacci uniformes en esfera y ruido fbm3D. Inclusión de mapa de normales de hoyuelos de competición con toggle interactivo. Eliminación total de efectos de rodada y hoyo a solicitud del usuario para enfocarse exclusivamente en la calidad material del render 3D de la bola. 68/68 tests pasando y Vite build completado en 1.79s.
- **task-7 completada**: Personalizador de colores en tiempo real implementado en `challenge-skins.html`: selectores de color nativos para Base, Acento, Secundario y Brillo/Shimmer con inputs sincronizados en hex, regeneración procedural 3D instantánea al interactuar, 7 paletas preset de lujo de un clic (Obsidiana & Oro, Esmeralda, Zafiro, Amatista, Rubí, Platino, Oro Rosa), botón para restablecer a los tonos originales y actualización automática del bloque de configuración JSON listo para copiar. Compilación Vite exitosa (1.48s) y 68/68 tests unitarios pasando.
