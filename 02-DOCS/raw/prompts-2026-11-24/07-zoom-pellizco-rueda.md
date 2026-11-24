# Prompt 7 — Zoom con pellizco en móvil, rueda = zoom en Desktop y menos tiros sin querer

Trabaja **siempre en la rama `la-chaqueta-bionica` y en su worktree de siempre** (`C:\Users\DEV\Desktop\golfito\.worktrees\la-chaqueta-bionica`; la rama ya está sacada ahí, no la saques en la carpeta de `main` ni crees otro worktree ni otra rama). Si la sesión corre en otro sitio (nube), trabaja en `la-chaqueta-bionica` igualmente. Antes de tocar nada: `git fetch origin la-chaqueta-bionica && git pull origin la-chaqueta-bionica`. Commits y push solo a `la-chaqueta-bionica`; nunca a `main` ni a `la-yuinta-mangante` salvo que se pida. pnpm siempre.

**Va después del prompt 6** (controles muertos en móvil): toca el mismo bloque de entrada de `src/game/GolfGame.js`. Si el arreglo del prompt 6 no está en la rama, avísame antes de empezar.

## Qué quiero
1. **Móvil:** el zoom de cámara se hace **pellizcando con dos dedos**, como el zoom de toda la vida. El **tiro sigue igual** (arrastrar desde la bola hacia atrás y soltar).
2. **Móvil:** paliar los **tiros sin querer** (missclicks), que les pasan sobre todo a los nuevos.
3. **Desktop:** la **rueda del ratón hace zoom**, reemplazando lo que hay ahora (hoy la rueda ajusta la fuerza).

## Estado actual (`src/game/GolfGame.js`, ~1560-1840)
- Táctil, un dedo: si empieza en la bola (`#touchesBall`, radio `BALL_TOUCH_PX = 56` o 3× la bola en pantalla) carga tiro: arrastrar en vertical = fuerza, horizontal = dirección. Si empieza fuera: arrastre horizontal gira la cámara y **vertical hace zoom** (`this.zoomLevel` 0.65–1.55, desde `d.zoom`). Solo se sigue **un** dedo (`this.drag`); un segundo dedo se ignora.
- `#executeShot` descarta potencias < 0.05; en táctil, al levantar el dedo **siempre** intenta tirar.
- Vista general (`overview`): un dedo gira la maqueta; rueda hace zoom 0.55–1.9.
- Rueda (`#onWheel`): con `settings.controls.wheel === 'power'` (por defecto) ajusta la fuerza ±5 %; con Ctrl/Alt, bola en movimiento o `wheel: 'zoom'` hace zoom ±0.08.
- Ajustes: `wheel: 'power' | 'zoom'` en `src/settings/settings.js` (`WHEEL_MODES`, `wheelPower`) y el selector «Rueda del ratón» en `src/ui/settingsPanel.js` (~62, ~70).
- Textos de ayuda en `src/main.js` (pantalla de partida): `.hint-touch` («Desliza: cámara · Arrastra la bola hacia atrás: tiro»), `.desktop-controls-bar` («Rueda: Zoom / Fuerza»), `.hint-mouse`.

## Qué hay que hacer
### Móvil: pellizco
- Seguir **varios punteros táctiles** (mapa `pointerId → posición`). Con 2 dedos: zoom = proporción de la distancia entre dedos respecto a la inicial, suavizado, dentro de los mismos límites (`0.65–1.55` en juego, `0.55–1.9` en vista general). Si conviene, el giro con dos dedos (ángulo entre ellos) también puede girar la cámara; decide y explica.
- Si estaba **cargando un tiro** y entra un segundo dedo: **cancelar el tiro** (sin tirar) y pasar a zoom. Al soltar un dedo del pellizco no debe tirar ni dar un salto de cámara.
- **Quitar el zoom con arrastre vertical** de un dedo: un dedo fuera de la bola solo gira la cámara.
- Evitar el zoom de la página del navegador (ya hay `touch-action: none` en el canvas; comprueba el `<meta viewport>` de `index.html` y gestos `gesturestart` de iOS).
- Funciona en la vista general del mapa también.

### Móvil: menos tiros sin querer
Propón e implementa una combinación razonable (explica cada una):
- **Zona muerta:** el tiro solo se arma si el dedo se separa de la bola más de X px (p. ej. 12–16 px); antes de eso, levantar no tira.
- **Potencia mínima táctil** algo más alta que 0.05 y/o **tiempo mínimo** de arrastre.
- **Cancelar arrastrando de vuelta a la bola:** si el dedo vuelve cerca de la bola antes de soltar, se cancela (indicador visual «suelta aquí para cancelar»).
- Ignorar toques mientras salta la intro/el banner, y el primer toque tras cerrar un menú/popup (ya hay algo parecido: `#skipClick`).
- Feedback claro mientras se carga: el arco/puntos de apuntado y la barra `.power` (ya existen), vibración suave.
- Opcional (ajuste «Confirmar tiro» en Ajustes, apagado por defecto). Solo si no complica.
- Todo con constantes nombradas, fáciles de ajustar.

### Desktop: rueda = zoom
- La rueda **siempre hace zoom** (en juego y en vista general), suave (usa `deltaY` proporcional, no solo el signo, y suaviza para trackpads).
- **Quitar** el modo «rueda = fuerza»: borra `wheel`/`wheelPower`/`WHEEL_MODES` de `settings.js` y el selector de `settingsPanel.js`, con **migración suave** de los ajustes ya guardados en el servidor (`set_settings`, `profiles.settings`): un valor `wheel` viejo se ignora sin errores. Revisa los tests de ajustes (`tests/` → busca `settings`) y `02-DOCS/wiki/ftd/ajustes-persistentes.md`.
- La fuerza en Desktop queda con el arrastre vertical del ratón mientras se mantiene el clic (como ya funciona).
- Actualiza todos los textos de ayuda: `.desktop-controls-bar` («Rueda: Zoom»), `.hint-mouse`, `.hint-touch` («Desliza: cámara · Pellizca: zoom · Arrastra la bola hacia atrás: tiro»), `settingsPanel.js` (~70) y el tutorial si ya existe (`src/screens/texts/tutorial.js`, prompt 2).

## Pruebas y cierre
- Lógica pura nueva (zoom por pellizco con límites, zona muerta, cancelar tiro, rueda → zoom) en funciones exportadas con tests `node --test`.
- Prueba Playwright con móvil emulado (`hasTouch`) simulando dos dedos (CDP `Input.dispatchTouchEvent`) para comprobar que el pellizco cambia `zoomLevel` y no tira.
- `tests/desktop-controls.test.js` y los de ajustes adaptados y en verde. `pnpm test` y `pnpm run build` en verde.
- Checklist para probar en un móvil real (pellizco, toque corto en la bola no tira, cancelar volviendo a la bola) y en Desktop (rueda y trackpad).
- Commits en `la-chaqueta-bionica`. Sin PR salvo que lo pida.
