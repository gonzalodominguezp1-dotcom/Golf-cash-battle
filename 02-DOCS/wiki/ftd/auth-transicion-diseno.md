---
author: la-chaqueta-bionica
branch: la-chaqueta-bionica
status: diseño (listo para implementar)
date: 2026-11-25
---

# Transición entre vistas de la pantalla de entrada: diseño para implementar

Documento para el agente que implementa (Haiku). Sigue los pasos en orden. Solo se tocan dos archivos:
`src/ui/authScreen.js` y `src/ui/authScreen.css`. Cuando el texto dice «exacto», copia el código tal cual.

> **Antes de editar:** vuelve a leer los dos archivos. Otras personas los cambian; localiza cada bloque por su
> **texto**, no por número de línea. Si un bloque «viejo» no aparece igual, para y avisa: no improvises.

Vistas (nombres sin cambios): `login`, `signup`, `forgot`, `resetSent`, `check`, `reset`.
La API `mountAuth(root, auth, { recovery, guest, linkError, onDone })` no cambia.

---

## 1. Concepto: «Relevo dorado»

- La **tarjeta es un objeto fijo**: su marco y el borde de luz que gira no se apagan ni se reinician nunca. Solo cambia
  lo que hay dentro.
- El **contenido se desliza en la dirección del recorrido**. Las vistas forman una tira horizontal:
  `signup | login | forgot | resetSent/check`. Si vas hacia la derecha de la tira, la vista nueva entra por la derecha.
  Si vuelves, entra por la izquierda. La persona sabe siempre hacia dónde ha ido.
- **Dos capas con paralaje**: el título (`h2`) se mueve un 25 % más y llega 30 ms antes que el resto. Da profundidad
  y se lee primero.
- **Lo que se repite no se va**: el botón de Google, el separador «o con email», el campo Email y el botón principal
  se desplazan a su sitio nuevo. En login ↔ registro el email que has escrito «viaja» con la tarjeta.
- El **marco se adapta** a la altura nueva y hace un respiro mínimo (escala 0,985 y vuelta). El logo y el titular
  también se colocan en su sitio nuevo (el logo encoge en las vistas de trámite).
- Todo en **450 ms**. No hay ningún efecto que pare a la persona.

**Dirección elegida: View Transitions API** (`document.startViewTransition`) con elementos compartidos, y entrada CSS
direccional como respaldo.

Por qué (3 líneas):
1. Es la única forma de animar la altura de la tarjeta y mover el logo, el email y el botón sin animar `height` ni
   `top` en la página real. El navegador mueve capas ya pintadas.
2. El marco va en su propia capa y se muestra en vivo: el borde de luz sigue girando sin cortes.
3. Si el navegador no tiene la API, el mismo `show` cae a una animación CSS de 410 ms. No hay nada más que mantener.

**Alternativa de respaldo (más sencilla): «Fundido direccional escalonado».** Solo CSS. Los hijos de la vista nueva
entran con opacidad 0 → 1 y 16 px en horizontal según la dirección, escalonados 0/30/60/90 ms. La altura cambia de
golpe. Está ya incluida en este diseño como respaldo (sección 4.2). Si el producto rechaza la dirección principal,
implementa todo menos la sección 4.3 y el bloque `startViewTransition` de `show`.

---

## 2. Duraciones y curvas

Curvas: **salida** `cubic-bezier(0.5, 0, 0.75, 0)` (acelera al irse). **Entrada y movimiento**
`cubic-bezier(0.16, 1, 0.3, 1)` (la `--a-ease` de la pantalla). Desplazamiento base `S` = 16 px en móvil y 28 px desde
900 px (menor que el relleno de la tarjeta, así el contenido no sale del marco). `dir` = +1 si avanzas y −1 si vuelves.

| Capa (nombre de transición) | Qué hace | Empieza | Dura | Acaba | Curva |
|---|---|---|---|---|---|
| Contenido viejo (`auth-body`, old) | opacidad 1 → 0; X 0 → −S·dir | 0 ms | 180 ms | 180 ms | salida |
| Título viejo (`auth-title`, old) | opacidad 1 → 0; X 0 → −1,25·S·dir | 0 ms | 160 ms | 160 ms | salida |
| Título nuevo (`auth-title`, new) | opacidad 0 → 1; X +1,25·S·dir → 0 | 60 ms | 360 ms | 420 ms | entrada |
| Contenido nuevo (`auth-body`, new) | opacidad 0 → 1; X +S·dir → 0 | 90 ms | 360 ms | **450 ms** | entrada |
| **Solape** | viejo y nuevo visibles a la vez | 60 ms | ~120 ms | 180 ms | — |
| Marco (`auth-card`, grupo) | tamaño y posición viejos → nuevos | 0 ms | 420 ms | 420 ms | entrada |
| Marco, respiro (`auth-card`, new) | escala 1 → 0,985 (40 %) → 1 | 0 ms | 420 ms | 420 ms | entrada |
| Compartidos en las dos vistas (`auth-social`, `auth-sep`, `auth-email`, `auth-submit`) | se desplazan a su sitio; fundido cruzado | 0 ms | 420 ms | 420 ms | entrada |
| Compartido que solo está en la vista vieja | igual que el contenido viejo | 0 ms | 180 ms | 180 ms | salida |
| Compartido que solo está en la vista nueva | igual que el contenido nuevo | 90 ms | 360 ms | 450 ms | entrada |
| Logo, titular, aviso de invitado (`auth-logo`, `auth-tagline`, `auth-notice`) | cambian de tamaño o posición | 0 ms | 420 ms | 420 ms | entrada |
| Banda legal (`auth-ticker`) | se coloca si cambia el alto de la página; el texto sigue corriendo | 0 ms | 420 ms | 420 ms | entrada |
| **Total View Transitions** | | | | **450 ms** | |
| Respaldo CSS (sin la API) | hijos: opacidad 0 → 1; X ±16 px → 0; retrasos 0/30/60/90 ms | 0 ms | 320 ms | **410 ms** | entrada |
| Movimiento reducido | cambio instantáneo | — | 0 ms | 0 ms | — |

---

## 3. Cambio en JS: `src/ui/authScreen.js` — exacto

Son cuatro sustituciones. No cambies nada más.

### 3.1 Estado de la transición y corte al entrar

Viejo:

```js
export function mountAuth(root, auth, { recovery = false, guest = false, linkError = null, onDone }) {
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    onDone();
  };
```

Nuevo:

```js
export function mountAuth(root, auth, { recovery = false, guest = false, linkError = null, onDone }) {
  let finished = false;
  // transición entre vistas en marcha ({ vt }) y momento del último cambio (ver show)
  let swap = null;
  let lastSwap = -Infinity;
  const done = () => {
    if (finished) return;
    finished = true;
    // si se entra a mitad de una transición, se corta: la pantalla de entrada se va
    swap?.vt.skipTransition();
    onDone();
  };
```

### 3.2 La tarjeta tiene un contenedor de contenido

El marco (`section.auth-card`, con el borde de luz en `::before`) ya no se vacía nunca. Las vistas se pintan dentro de
`div.auth-card-body`.

Viejo:

```js
  const card = el('section', { class: 'auth-card' });
```

Nuevo:

```js
  // el marco (borde de luz) no se sustituye nunca; las vistas se pintan dentro de body
  const body = el('div', { class: 'auth-card-body' });
  const card = el('section', { class: 'auth-card' }, body);
```

### 3.3 `show` con transición (más `render` y `focusView`)

Viejo (la función entera):

```js
  function show(view, arg, { focus = true } = {}) {
    stopListening?.();
    stopListening = null;
    page.dataset.view = view;
    // filter: las vistas devuelven null en los nodos opcionales y replaceChildren(null) pintaría el texto «null»
    card.replaceChildren(...views[view](arg).filter(Boolean));
    if (focus) card.querySelector('input')?.focus({ preventScroll: true });
  }
```

Nuevo:

```js
  // ---------- cambio de vista: «Relevo dorado» (02-DOCS/wiki/ftd/auth-transicion-diseno.md) ----------
  // orden de la tira de vistas: ir a una de índice mayor entra por la derecha; a una menor, por la izquierda
  const VIEW_ORDER = { signup: 0, reset: 0, login: 1, forgot: 2, resetSent: 3, check: 3 };
  // un segundo cambio antes de esto se ignora (doble clic: el 2.º clic caería sobre la vista nueva)
  const SWAP_LOCK_MS = 350;

  /** Pinta la vista al momento. anim → data-anim para el CSS: null (primera vista), 'none', 'vt', 'fwd' o 'back'. */
  function render(view, arg, focus, anim) {
    stopListening?.();
    stopListening = null;
    page.dataset.view = view;
    if (anim) page.dataset.anim = anim;
    // filter: las vistas devuelven null en los nodos opcionales y replaceChildren(null) pintaría el texto «null»
    body.replaceChildren(...views[view](arg).filter(Boolean));
    const title = body.querySelector('h2');
    title?.setAttribute('tabindex', '-1');
    if (focus) focusView(title);
  }

  /**
   * Con ratón (sin teclado virtual) el foco va al primer campo. En táctil, o si la vista no tiene campos, va al título:
   * no abre el teclado y el lector de pantalla anuncia la vista nueva. preventScroll: la página no salta.
   */
  function focusView(title) {
    const input = body.querySelector('input');
    if (input && mq('(hover: hover) and (pointer: fine)')) input.focus({ preventScroll: true });
    else title?.focus({ preventScroll: true });
  }

  function show(view, arg, { focus = true } = {}) {
    const from = page.dataset.view;
    // primera vista: sin transición (la tarjeta ya entra con auth-card-in y sus hijos con auth-swap)
    if (!from) return render(view, arg, focus, null);
    const now = performance.now();
    if (now - lastSwap < SWAP_LOCK_MS) return;
    lastSwap = now;
    // movimiento reducido: cambio instantáneo
    if (mq('(prefers-reduced-motion: reduce)')) return render(view, arg, focus, 'none');
    const dir = (VIEW_ORDER[view] ?? 0) < (VIEW_ORDER[from] ?? 0) ? 'back' : 'fwd';
    // navegador sin View Transitions: entrada CSS direccional y escalonada
    if (typeof document.startViewTransition !== 'function') return render(view, arg, focus, dir);
    const html = document.documentElement;
    html.classList.add('auth-vt');
    html.classList.toggle('auth-vt--back', dir === 'back');
    const vt = document.startViewTransition(() => render(view, arg, focus, 'vt'));
    const mine = { vt };
    swap = mine;
    // ready se rechaza si el navegador se salta la animación (pestaña oculta, cambio de tamaño): el DOM cambia igual
    vt.ready.catch(() => {});
    const cleanup = () => {
      if (swap !== mine) return; // ya empezó otra transición: sus clases siguen haciendo falta
      swap = null;
      html.classList.remove('auth-vt', 'auth-vt--back');
    };
    vt.finished.then(cleanup, cleanup);
  }
```

Notas para no romper nada:

- `stopListening?.()` y `stopListening = null` siguen siendo lo primero que pasa al pintar una vista (ahora en `render`).
- Todas las llamadas existentes `show(view, arg)` y `show(first, undefined, { focus: ... })` se quedan como están.
  **No cambies la llamada inicial** `show(first, undefined, { focus: mq('(min-width: 900px)') })`.
- En la vista inicial de escritorio con ratón el foco sigue yendo al primer campo, como ahora.
- Se usa `document.startViewTransition(callback)` (forma con función), no la forma con objeto `{ update, types }`:
  funciona en más navegadores.
- No se escribe ningún estilo en línea (CSP): solo clases en `<html>` y `data-anim` en `main.auth-screen`.

### 3.4 Error de la vuelta del correo, dentro del contenido

Viejo:

```js
  if (linkError && !recovery) card.prepend(el('p', { class: 'auth-error', role: 'alert', text: authMessage(linkError) }));
```

Nuevo:

```js
  if (linkError && !recovery) body.prepend(el('p', { class: 'auth-error', role: 'alert', text: authMessage(linkError) }));
```

---

## 4. CSS: `src/ui/authScreen.css` — exacto

Tres cambios: 4.1 sustituye un bloque, 4.2 y 4.3 añaden una sección nueva justo **antes** del comentario
`/* ---------- movimiento reducido: todo quieto, solo el póster ---------- */`, y 4.4 añade líneas dentro del bloque
de movimiento reducido.

### 4.1 Los hijos de la tarjeta pasan a ser hijos de `.auth-card-body`

Viejo:

```css
.auth-card > * { animation: auth-swap 0.35s var(--a-ease) backwards; }
.auth-card h2 { margin: 0 0 4px; font: 900 24px/1.1 var(--display); letter-spacing: -0.02em; color: #fff; }
.auth-card > .sub { margin: 0 0 14px; color: var(--a-dim); font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.auth-card > .link, .auth-card > .ghost { margin-top: 10px; }
.auth-card > .ghost { margin-bottom: 4px; }
```

Nuevo:

```css
/* contenido de la vista: es lo único que se sustituye al cambiar de vista; el marco se queda */
.auth-card-body { display: flow-root; }
.auth-card-body > * { animation: auth-swap 0.35s var(--a-ease) backwards; }
.auth-card h2 { margin: 0 0 4px; font: 900 24px/1.1 var(--display); letter-spacing: -0.02em; color: #fff; }
/* el título recibe el foco por programa (tabindex -1) al cambiar de vista en táctil: sin anillo */
.auth-card h2:focus { outline: none; }
.auth-card-body > .sub { margin: 0 0 14px; color: var(--a-dim); font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.auth-card-body > .link, .auth-card-body > .ghost { margin-top: 10px; }
.auth-card-body > .ghost { margin-bottom: 4px; }
```

### 4.2 y 4.3 Sección nueva (respaldo CSS + View Transitions)

Pega este bloque entero justo antes de `/* ---------- movimiento reducido: todo quieto, solo el póster ---------- */`:

```css
/* ---------- transición entre vistas: «Relevo dorado» (02-DOCS/wiki/ftd/auth-transicion-diseno.md) ---------- */
/* authScreen.js pone data-anim en .auth-screen en cada cambio de vista y lo deja hasta el siguiente.
   :where() deja la especificidad en la de .auth-card-body > *, así .auth-error:not(:empty) sigue temblando. */

/* con View Transitions o movimiento reducido, los hijos nuevos no hacen su propia entrada */
:where(.auth-screen[data-anim="vt"], .auth-screen[data-anim="none"]) .auth-card-body > * { animation: none; }

/* respaldo sin View Transitions: entrada direccional y escalonada (410 ms en total) */
:where(.auth-screen[data-anim="fwd"], .auth-screen[data-anim="back"]) .auth-card-body > * { animation: auth-swap-x 0.32s var(--a-ease) backwards; }
:where(.auth-screen[data-anim="fwd"], .auth-screen[data-anim="back"]) .auth-card-body > :nth-child(2) { animation-delay: 0.03s; }
:where(.auth-screen[data-anim="fwd"], .auth-screen[data-anim="back"]) .auth-card-body > :nth-child(3) { animation-delay: 0.06s; }
:where(.auth-screen[data-anim="fwd"], .auth-screen[data-anim="back"]) .auth-card-body > :nth-child(n + 4) { animation-delay: 0.09s; }
.auth-screen[data-anim="back"] { --auth-swap-x: -16px; }
@keyframes auth-swap-x { from { opacity: 0; transform: translateX(var(--auth-swap-x, 16px)); } }

/* View Transitions: los nombres solo existen mientras <html> tiene .auth-vt (lo pone y lo quita authScreen.js) */
html.auth-vt {
  /* la raíz no se captura: el vídeo de fondo no se congela; todo lo que se mueve tiene nombre propio */
  view-transition-name: none;
  --auth-vt-dir: 1;
  --auth-vt-shift: 16px;
  --auth-vt-ease: cubic-bezier(0.16, 1, 0.3, 1);
  --auth-vt-ease-in: cubic-bezier(0.5, 0, 0.75, 0);
  --auth-vt-morph: 420ms;
}
html.auth-vt--back { --auth-vt-dir: -1; }
@media (min-width: 900px) { html.auth-vt { --auth-vt-shift: 28px; } }

.auth-vt .auth-logo { view-transition-name: auth-logo; }
.auth-vt .auth-tagline { view-transition-name: auth-tagline; }
.auth-vt .auth-notice { view-transition-name: auth-notice; }
.auth-vt .auth-card { view-transition-name: auth-card; }
.auth-vt .auth-card-body { view-transition-name: auth-body; }
.auth-vt .auth-card h2 { view-transition-name: auth-title; }
.auth-vt .auth-social { view-transition-name: auth-social; }
.auth-vt .auth-sep { view-transition-name: auth-sep; }
.auth-vt .auth-form > label:has(> input[name="email"]) { view-transition-name: auth-email; }
.auth-vt .auth-form > .primary { view-transition-name: auth-submit; }
.auth-vt .auth-ticker { view-transition-name: auth-ticker; }

/* todos los grupos: mismo tiempo y misma curva para que el escenario se recoloque a la vez */
html.auth-vt::view-transition-group(*) { animation-duration: var(--auth-vt-morph); animation-timing-function: var(--auth-vt-ease); }

/* marco: la captura vieja (borde congelado) no se ve; la nueva es en vivo, así el borde sigue girando.
   block-size 100%: la captura se ajusta al alto del grupo mientras cambia de tamaño */
html.auth-vt::view-transition-old(auth-card) { animation: none; opacity: 0; }
html.auth-vt::view-transition-new(auth-card) { block-size: 100%; animation: auth-vt-frame var(--auth-vt-morph) var(--auth-vt-ease) both; }

/* contenido: recorte solo vertical, para que el contenido alto no asome por debajo del marco mientras encoge */
html.auth-vt::view-transition-group(auth-body) { overflow-x: visible; overflow-y: clip; }
html.auth-vt::view-transition-old(auth-body) { mix-blend-mode: normal; animation: auth-vt-out 180ms var(--auth-vt-ease-in) both; }
html.auth-vt::view-transition-new(auth-body) { mix-blend-mode: normal; animation: auth-vt-in 360ms var(--auth-vt-ease) 90ms both; }

/* título: segunda capa, se mueve más y llega antes (paralaje) */
html.auth-vt::view-transition-old(auth-title) { mix-blend-mode: normal; animation: auth-vt-title-out 160ms var(--auth-vt-ease-in) both; }
html.auth-vt::view-transition-new(auth-title) { mix-blend-mode: normal; animation: auth-vt-title-in 360ms var(--auth-vt-ease) 60ms both; }

/* compartidos que solo están en una de las dos vistas: salen o entran con el contenido */
html.auth-vt::view-transition-old(auth-social):only-child,
html.auth-vt::view-transition-old(auth-sep):only-child,
html.auth-vt::view-transition-old(auth-email):only-child,
html.auth-vt::view-transition-old(auth-submit):only-child { animation: auth-vt-out 180ms var(--auth-vt-ease-in) both; }
html.auth-vt::view-transition-new(auth-social):only-child,
html.auth-vt::view-transition-new(auth-sep):only-child,
html.auth-vt::view-transition-new(auth-email):only-child,
html.auth-vt::view-transition-new(auth-submit):only-child { animation: auth-vt-in 360ms var(--auth-vt-ease) 90ms both; }

/* banda legal: solo se recoloca; la captura nueva es en vivo y el texto no deja de correr */
html.auth-vt::view-transition-old(auth-ticker) { animation: none; opacity: 0; }
html.auth-vt::view-transition-new(auth-ticker) { animation: none; }

@keyframes auth-vt-out { to { opacity: 0; transform: translateX(calc(var(--auth-vt-shift) * var(--auth-vt-dir) * -1)); } }
@keyframes auth-vt-in { from { opacity: 0; transform: translateX(calc(var(--auth-vt-shift) * var(--auth-vt-dir))); } }
@keyframes auth-vt-title-out { to { opacity: 0; transform: translateX(calc(var(--auth-vt-shift) * var(--auth-vt-dir) * -1.25)); } }
@keyframes auth-vt-title-in { from { opacity: 0; transform: translateX(calc(var(--auth-vt-shift) * var(--auth-vt-dir) * 1.25)); } }
@keyframes auth-vt-frame { 0%, 100% { transform: scale(1); } 40% { transform: scale(0.985); } }
```

### 4.4 Movimiento reducido

Dentro del bloque existente `@media (prefers-reduced-motion: reduce) { ... }`, añade al final (antes de su `}`):

```css
  /* por si acaso: JS ya no arranca la transición con movimiento reducido */
  html.auth-vt::view-transition-group(*),
  html.auth-vt::view-transition-old(*),
  html.auth-vt::view-transition-new(*) { animation: none !important; }
```

### 4.5 Cómo se evita que el giro del borde se corte (explicación, no hay más código)

1. El borde vive en `.auth-card::before`. El elemento `.auth-card` **no se sustituye nunca** (solo los hijos de
   `.auth-card-body`), así que su animación `auth-spin` no se reinicia: en el respaldo CSS el giro sigue sin más.
2. Con View Transitions, el marco se captura como capa propia (`auth-card`). Como `.auth-card-body` tiene su propio
   nombre, el contenido **no** entra en esa captura: la capa `auth-card` es solo marco, fondo y sombra.
3. La captura vieja es una foto fija (el borde quieto). Se oculta (`opacity: 0`). La nueva es una **imagen en vivo**
   del elemento real: el `::before` sigue girando en ella, en el mismo punto de su ciclo. No hay doble destello ni salto.
4. `block-size: 100%` estira la imagen en vivo al alto del grupo mientras este cambia de tamaño. El estiramiento máximo
   es de un 15–25 % durante 420 ms; las esquinas y el borde de 2 px apenas cambian.

---

## 5. Casos límite y decisiones

| Caso | Qué pasa | Por qué |
|---|---|---|
| **Doble clic** en «Crear una cuenta», «Entrar» o «Ya tengo cuenta» | El 2.º `show` llega antes de 350 ms y se ignora (`SWAP_LOCK_MS`). | Sin el bloqueo, en el respaldo CSS el 2.º clic caería sobre un botón de la vista nueva (por ejemplo «He olvidado mi contraseña»). Con View Transitions, Chrome además da los clics de la animación a `<html>`, pero no dependemos de eso. |
| Otra transición empieza antes de que acabe la anterior | El navegador salta la vieja y su `update` se ejecuta igual. `cleanup` de la vieja no quita las clases porque `swap !== mine`. | Si quitara `auth-vt`, la nueva perdería los nombres a mitad. |
| **Vista inicial** | `page.dataset.view` está vacío → `render` directo, sin `data-anim`. Entran la tarjeta (`auth-card-in`) y sus hijos (`auth-swap`) como ahora. | La primera vista no tiene «de dónde venir». |
| **Altura distinta entre vistas** | **Se anima** con View Transitions: el grupo `auth-card` pasa del alto viejo al nuevo en 420 ms, y el logo, el titular y la banda legal se recolocan a la vez. En el respaldo CSS **se deja que cambie de golpe**. | El navegador mueve capas ya pintadas en la capa superior; la página real no se recalcula en cada fotograma. Nuestras animaciones (keyframes) solo usan `transform` y `opacity`. En el respaldo, animar `height` está prohibido y no hay forma limpia de hacerlo con `transform`. |
| Contenido viejo más alto que el marco que encoge | Se recorta en vertical (`overflow-y: clip` en el grupo `auth-body`) y ya ha desaparecido a los 180 ms. | Que no asome por debajo del marco. Si un navegador ignora `overflow` en el grupo, asoma unos 100 ms con poca opacidad: aceptable. |
| **Errores `role="alert"`** | El texto de error de la vista vieja se va con ella (cada vista empieza limpia). Los `role="alert"` de la vista nueva nacen vacíos y solo se rellenan tras un envío, que no puede ocurrir durante los 450 ms. El aviso de la vuelta del correo (`linkError`) se añade tras la vista inicial, sin transición: se ve y se anuncia al momento. | La transición es solo una capa visual: el árbol de accesibilidad ya tiene la vista nueva desde el primer fotograma, así que nada «tapa» un aviso para el lector de pantalla. `.auth-error:not(:empty)` sigue temblando gracias a `:where()`. |
| Envío que cambia de vista (`email_not_confirmed` → `check`, registro → `check`, recuperar → `resetSent`) | `show` arranca la transición; `onSubmit` vuelve y `form` reactiva el botón del formulario viejo (aún conectado un fotograma). | No importa: ese formulario se sustituye en el siguiente fotograma y no se puede pulsar entretanto. |
| Se entra (`done`) a mitad de transición (otra pestaña confirma) | `done` llama a `skipTransition()`; `finished` quita las clases. | Que la foto de la pantalla de entrada no quede encima del juego. |
| Pestaña oculta, cambio de tamaño u orientación, nombre repetido | El navegador se salta la animación; el DOM cambia igual. `ready.catch` evita el error en consola. | Cambio instantáneo, nunca roto. |
| Móvil con el teclado abierto | El foco pasa al título (no a un campo): el teclado se cierra y no se abre otro. | Pedido de producto: no abrir el teclado en móvil. |
| Movimiento reducido | Cambio instantáneo (`data-anim="none"`), sin View Transitions. | Pedido de accesibilidad. |
| Navegadores | Chrome/Edge ≥ 111, Safari ≥ 18, Firefox ≥ 144: View Transitions. El resto: respaldo CSS. | Detección por `typeof document.startViewTransition`. |

---

## 6. Criterios de aceptación

### 6.1 Lo que comprueba Haiku (desde la raíz del worktree)

1. `pnpm run build` termina con código 0.
2. `pnpm exec node --test tests/auth-rules.test.js tests/auth-return.test.js` pasa entero.
3. `grep -c "startViewTransition" src/ui/authScreen.js` → `2` (la detección y la llamada).
4. `grep -n "card.replaceChildren\|card.prepend\|card.querySelector" src/ui/authScreen.js` → nada.
5. `grep -n "body.replaceChildren" src/ui/authScreen.js` → 1 línea, dentro de `render`.
6. `grep -c "stopListening?.()" src/ui/authScreen.js` → `1`, dentro de `render`.
7. `grep -n "innerHTML\|\.style\." src/ui/authScreen.js` → nada (CSP: ni markup ni estilos en línea).
8. `grep -nE "^\.auth-card > " src/ui/authScreen.css` → nada.
9. `grep -n "view-transition-name" src/ui/authScreen.css` → todas las líneas empiezan por `.auth-vt ` o están dentro de
   `html.auth-vt {`.
10. Las `@keyframes` nuevas (`auth-swap-x`, `auth-vt-out`, `auth-vt-in`, `auth-vt-title-out`, `auth-vt-title-in`,
    `auth-vt-frame`) solo contienen `opacity` y `transform`.
11. `grep -n "show(first, undefined, { focus: mq('(min-width: 900px)') })" src/ui/authScreen.js` → 1 línea (sin tocar).

### 6.2 Lo que comprueba una persona (lista visual)

Con `pnpm dev`. Para ver cada fotograma: DevTools → panel **Animations** → velocidad 10 %.

- [ ] **Chrome escritorio, login → «Crear una cuenta»:** el contenido sale hacia la izquierda y el registro entra por
      la derecha; el título llega un instante antes; el botón de Google, «o con email», el campo Email (con lo escrito)
      y el botón principal se deslizan a su sitio; la tarjeta crece suave. Total menos de medio segundo.
- [ ] **Registro → «Entrar»:** lo mismo al revés (entra por la izquierda).
- [ ] **Login → «He olvidado mi contraseña» → «Volver a entrar»:** el logo encoge y vuelve a crecer suave (en escritorio
      pasa de grande a pequeño); el titular se recoloca sin verse doble.
- [ ] **El borde de luz no se para ni salta** en ningún cambio, ni a 10 %.
- [ ] **No se ve la tarjeta duplicada** ni un fondo que parpadea; el vídeo de fondo y la banda legal siguen moviéndose.
- [ ] Ningún contenido asoma fuera del marco de forma visible.
- [ ] **Foco (escritorio con ratón):** tras cada cambio, el cursor está en el primer campo y se puede escribir ya; la
      página no se desplaza. En «Revisa tu email» y «Confirma tu email» el foco está en el título (sin anillo).
- [ ] **Móvil real (o emulación táctil):** tras cada cambio **no se abre el teclado**; el lector de pantalla
      (VoiceOver/TalkBack) anuncia el título nuevo.
- [ ] **Doble clic rápido** en «Crear una cuenta» y en «Entrar»: solo un cambio, y no se activa nada de la vista nueva.
- [ ] **Errores:** login con contraseña mala → el error aparece y tiembla; cambia a registro y vuelve → empieza limpio.
      En «Confirma tu email», un fallo al reenviar sigue temblando.
- [ ] **Vista inicial:** al cargar no hay deslizamiento; entra como antes (tarjeta que sube, hijos que aparecen).
- [ ] **Movimiento reducido** (DevTools → Rendering → `prefers-reduced-motion: reduce`, o el ajuste del sistema): los
      cambios son instantáneos.
- [ ] **Safari 18 y Firefox reciente:** la transición se ve igual que en Chrome.
- [ ] **Navegador sin la API** (en Chrome, ejecuta en consola `delete Document.prototype.startViewTransition` y cambia
      de vista): los hijos entran escalonados desde el lado correcto; la altura cambia de golpe; sin errores en consola.
- [ ] Consola sin errores ni avisos nuevos en todos los casos.
