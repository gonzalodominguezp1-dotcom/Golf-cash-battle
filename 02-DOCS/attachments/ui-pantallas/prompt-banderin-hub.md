# Prompt para la sesión del banderín del hub

> Cópialo entero en una sesión nueva de Claude Code abierta en el worktree `C:\Users\DEV\Desktop\golfito\.worktrees\la-chaqueta-bionica-ui` (rama `la-chaqueta-bionica-ui`).

```text
Trabaja en golf-cash-battle (minigolf 3D, Vite 5 + Three.js 0.169 + Supabase, JS vanilla), en el worktree C:\Users\DEV\Desktop\golfito\.worktrees\la-chaqueta-bionica-ui, rama la-chaqueta-bionica-ui. Lee CLAUDE.md del repo: usa SIEMPRE pnpm (nunca npm ni npx), no hagas push ni toques main ni la rama de otra persona. Responde en español.

OBJETIVO
Diseñar un BANDERÍN (la bandera del hoyo, con forma de banderín) con el logo del juego bordado, y luego integrarlo en la escena 3D que hay de fondo en el hub, para que el logo se vea sobre la bandera en vez de en la barra superior. Son DOS FASES: primero el diseño (me lo enseñas y lo apruebo), después la integración.

CONTEXTO DE LA ESCENA (ya existe, no la rehagas)
- src/game/render/hubScene.js: escena de día (green circular de radio 7, copa, bosque, montañas). La bandera es hoy un plano liso: `new THREE.PlaneGeometry(0.9, 0.55)` con material rojo (color 0xe01212, emissive 0x3a0000, side DoubleSide), en `flag.position.set(0.45, 2.1, 0)`, sobre un mástil blanco de 2.4 de alto (CylinderGeometry, y=1.2).
- La cámara ORBITA 360° alrededor del mástil (radio 8.5, altura 3.2, mirando a (0, 1.1, 0), una vuelta cada ~90 s), así que el banderín se ve por DELANTE y por DETRÁS: el logo no puede verse al revés ni espejado por la cara de atrás (usa dos caras con la textura correcta en cada una, o dos planos).
- Con reduced-motion la cámara está quieta; con calidad baja hay menos geometría. Respeta ambas cosas (sin animación extra en reduced-motion).
- El splash (public/splash/*.webp) y la imagen fija del hub (public/splash/hub-fallback.webp) se generan capturando esa misma escena con `pnpm splash:capture` (scripts/capture-splash-layers.mjs, Chrome headless del sistema por CDP). Al integrar, hay que regenerarlas para que el banderín salga también ahí.
- A distancia de órbita el banderín mide unos 60-90 px en pantalla de móvil (375×812): el logo debe ser GRANDE, de pocos detalles y legible a ese tamaño.

ASSETS DEL LOGO (en public/)
- logo.png y logo-black-gold.png: 1700×1467 con canal alfa (águila dorada con pelota y texto «GOLF CASH BATTLE»). Esta es la fuente de alta resolución.
- logo-header.png: solo 139×120, NO la uses como fuente.
- logo-square.png: 1024×1024 con alfa.
Mira primero las imágenes (Read) para ver cómo es el logo y sus colores.

FASE 1 — DISEÑO DEL BANDERÍN (aprobación mía antes de seguir)
1. Entrega una textura con alfa, 1024×640 px aprox. (proporción ~1.6:1, la del plano 0.9×0.55; si propones otra forma, justifica la proporción), en WebP con transparencia, ≤ 60 KB, en public/hub/banderin.webp, y una vista previa PNG en 02-DOCS/attachments/ui-pantallas/banderin-boceto.png (el banderín sobre el fondo public/splash/hub-fallback.webp, a 375×812 y a 1280×800).
2. Forma: banderín (pennant) de golf, p. ej. triangular o con cola de golondrina (swallowtail); borde recto pegado al mástil con unas anillas o dobladillo; el fondo fuera de la forma es transparente (alfa limpio, sin halo).
3. Estilo: tela roja intensa (parte de #e01212) con degradado y pliegues suaves pintados en la propia textura, ribete/dobladillo dorado (#f5c542 aprox., el dorado del logo), logo bordado centrado con un ligero relieve/contorno oscuro para que se lea sobre el rojo, sin sombra pesada. Coherente con la paleta del juego (esmeralda #10b981, dorado, oscuros #0b0f15). Nada de texto adicional distinto de «GOLF CASH BATTLE» del propio logo; todo texto en español si lo hubiera.
4. Cómo generarlo (elige lo que tengas disponible y dime cuál usaste): (a) si dispones de una herramienta de generación de imágenes, úsala con el brief anterior y compón el logo REAL (logo.png) encima para que no se deforme el logo; (b) si no, constrúyelo en código: un SVG (forma, degradado, pliegues, ribete) más el logo.png incrustado, renderizado a WebP con alfa con Chrome headless por CDP reutilizando el patrón y la función de limpieza de scripts/capture-splash-layers.mjs. Guarda el generador en scripts/ (p. ej. scripts/make-banderin.mjs con script `banderin:make` en package.json) para poder regenerarlo.
5. PARA y enséñame el boceto. No sigas a la fase 2 hasta que yo lo apruebe por escrito.

FASE 2 — INTEGRACIÓN EN EL FONDO DEL HUB (tras mi aprobación)
1. En hubScene.js sustituye el plano rojo liso por el banderín: textura public/hub/banderin.webp con `map`, `transparent: true`/`alphaTest` (sin bordes dentados), colorSpace sRGB, anisotropía razonable, DoubleSide con el logo bien orientado por ambas caras. Carga la textura con el cargador de three dentro de la escena (three sigue entrando por import() dinámico; la carga inicial NO debe cambiar). Libera la textura en dispose().
2. Ondeo suave opcional: desplazamiento ligero de vértices en el plano (subdividido) con seno desde el mástil hacia la punta, solo en calidad medium/high y NUNCA con reduced-motion; coste mínimo (sin shaders pesados). Ningún movimiento a más de 2 Hz.
3. Si la textura no carga, la escena sigue con el plano rojo de hoy (sin error visible).
4. Quita la mención al logo en la barra superior del hub si aún quedara (el hub ya no lleva logo en la cabecera) y deja un `h1` accesible con el nombre del juego.
5. Regenera las capas del splash y la imagen fija con `pnpm splash:capture` (el script debe salir con código 0, respetar los pesos: capas ≤ 110 KB sumadas, hub-fallback ≤ 40 KB, y comprobar al final que no queda ningún chrome.exe con el perfil temporal ni carpeta en %TEMP%; no toques otros Chrome míos).
6. El peso del splash completo (public/splash/ + <style> de index.html + public/splash.js) debe seguir < 150 KB (lo comprueba tests/splash-weight.test.js). La textura del banderín va en public/hub/, FUERA de ese presupuesto, pero ≤ 60 KB.
7. Tests (primero rojo, luego verde, con pnpm): reglas puras que añadas en src/game/render/hubSceneRules.js (p. ej. parámetros del ondeo por calidad y reduced-motion), y que dispose() libera la textura. No rompas tests/hub-scene-rules.test.js, tests/hub-ambient.test.js, tests/screen-hub*.test.js ni tests/splash*.test.js.
8. Ejecuta: pnpm test (tarda más de 2 minutos por tests/courses.test.js: espera el resultado real), pnpm run build y node scripts/initial-load-size.mjs (hoy ≈ 93518 B gzip, tope ≈ 100800 y `initialHasThree` debe seguir en false).

REGLAS
- NO abras el navegador visible: las verificaciones visuales y de FPS las hago yo siempre. Para el boceto sí puedes usar Chrome headless por CDP (como hace splash:capture).
- No cambies física, economía, RLS, Supabase/Edge Functions ni vercel.json; no añadas dependencias.
- Haz commits pequeños con gitmoji + Conventional Commits en español en la rama la-chaqueta-bionica-ui (el hook rechaza mensajes sin gitmoji válido), sin trailers de IA y sin push.
- Al acabar dame: archivos tocados, pesos (textura y capas), salida de tests/build/size, y una lista concreta de lo que debo mirar en el navegador (el banderín desde todos los ángulos de la órbita, el logo legible a 375×812, sin espejado por detrás, ondeo suave, FPS del hub ≥55 en medium y ≥45 en low con el panel visible, reduced-motion quieto, y el splash/hub-fallback con el banderín).
```
