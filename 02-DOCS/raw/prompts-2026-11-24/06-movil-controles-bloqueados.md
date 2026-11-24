# Prompt 6 — Móvil: tras un popup de Chrome dejan de funcionar los controles

Soy Gonzalo. Trabaja en mi rama según `CLAUDE.md` (`la-yuinta-mangante`: fetch, checkout y pull antes de tocar nada). pnpm siempre.

## El fallo (SOLO en móvil)
En partida, en el móvil, salta un **popup/aviso de Chrome** y justo después **dejan de funcionar los controles del juego** (cámara, apuntar, tirar). Creo que viene de lo que hicimos en Desktop para que al hacer clic en la pantalla desapareciera el ratón (Pointer Lock). El aviso es algo del cursor. *(Adjunto captura del aviso si la tengo; si no está, pídemela.)* En Desktop no pasa y **en Desktop no hay que cambiar el comportamiento**.

## Lo que ya he visto en el código (`src/game/GolfGame.js`, ~1530-1905)
1. **`#onClickCanvas`** llama a `this.requestPointerLock()` en **cualquier** `click`, también el que el navegador genera tras un **toque** en móvil. En Chrome Android eso puede enseñar el aviso de puntero/pantalla («pulsa Esc para mostrar el cursor» o similar) y dejar el canvas en un estado de captura raro. `requestPointerLock()` (~873) no comprueba el tipo de puntero.
2. **El `drag` táctil se queda colgado:** en táctil, `#onPointerDown` hace `if (this.drag) return;`. Si llega el popup (o cualquier cosa que quite el foco) y el navegador no manda `pointerup`/`pointercancel` de ese dedo, `this.drag` se queda con un `pointerId` viejo y **todos los toques siguientes se ignoran**. `#onBlur` limpia la carga del ratón pero **no** limpia `this.drag`. `#onPointerCancel` solo limpia si coincide el id.
3. `pointerlockchange` añade/quita la clase `pointer-locked` del contenedor.
4. El canvas tiene `touch-action: none` y `setPointerCapture` en táctil.

## Qué hay que hacer
1. **Reproduce** antes de arreglar: Playwright con emulación de móvil (dispositivo con nombre, p. ej. `Pixel 7`, con `hasTouch`) en Modo Libre. Simula: toque → `click` → `requestPointerLock` (comprueba si se llama), y un `blur`/`visibilitychange` en mitad de un arrastre sin `pointerup`. Demuestra con un test que hoy los toques siguientes se ignoran.
2. **Pointer Lock solo para ratón de verdad:**
   - Pedirlo únicamente si el evento es `pointerType === 'mouse'` (en `click` usa `e.pointerType` del `PointerEvent`; si no existe, apóyate en el último `pointerdown`) **y** el dispositivo tiene puntero fino (`matchMedia('(pointer: fine)')` / `(hover: hover)`).
   - Nunca en táctil ni en lápiz. Los portátiles táctiles con ratón deben seguir funcionando con ratón.
3. **Que nada deje los controles muertos:**
   - Al `blur`, `visibilitychange` (oculto), `pagehide`, `pointerlockchange` (salida), `lostpointercapture` y al reabrir la pausa/ajustes: limpiar `this.drag`, la carga, `power`, puntos de apuntado y `orbiting`. Liberar la captura del puntero.
   - En `#onPointerDown` táctil: si hay un `drag` viejo cuyo dedo ya no está (otro `pointerId` y no hay captura activa), descartarlo y empezar el nuevo en vez de `return`.
   - Revisa que `paused`, `locked` y `overview` no se queden a `true` por un aviso del navegador.
4. **No romper Desktop:** el clic en la pantalla sigue ocultando el ratón (pointer lock), `Esc` sigue abriendo ajustes, y la carga con clic izquierdo + rueda sigue igual. Hay test de controles de escritorio (`tests/desktop-controls.test.js`): que siga verde.
5. Si te queda tiempo: comprueba también iOS Safari (no tiene Pointer Lock: que no lance errores).

## Pruebas y cierre
- Extrae la decisión «¿pido pointer lock?» y «¿descarto este drag?» a funciones puras y pruébalas con `node --test` (modelo: `tests/intro-skip.test.js`, `tests/desktop-controls.test.js`).
- Test (Playwright o simulado) que reproduce el bloqueo con el código viejo y pasa con el nuevo.
- `pnpm test` y `pnpm run build` en verde.
- Déjame una checklist para probar en un móvil Android real con Chrome (incluido: que salte una notificación/permiso del sistema a mitad de partida y los controles sigan).
- Commits en mi rama. Sin PR salvo que lo pida. **Ojo:** el prompt 7 (zoom con pellizco) toca el mismo bloque de entrada de `GolfGame.js`; deja el código ordenado para que encaje.
