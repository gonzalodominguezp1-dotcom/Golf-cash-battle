---
author: la-chaqueta-bionica
branch: la-chaqueta-bionica
status: diseño (listo para implementar)
date: 2026-11-25
---

# Rediseño de la pantalla de entrada: diseño para implementar

Documento para el agente que implementa. Sigue los pasos en orden. No cambies nada fuera de la lista de archivos.
Cuando el texto dice «exacto», copia el código tal cual.

## 1. Concepto

- **Nombre: «Cumbre dorada».** El fondo es el vídeo del lobby: una bandera con el logo en una cumbre, al atardecer. La pantalla
  es la puerta a esa cumbre. Logo dorado grande con halo que respira, tarjeta oscura con un borde de luz dorada que gira, CTA
  dorado con brillo. La sensación es de juego premium y competición, no de formulario.
- **Paleta** (variables en `.auth-screen`): fondo/velo `--a-ink #06080e`, tarjeta `--a-card rgba(10,13,21,0.92)`,
  oro `--a-gold #ffd03b`, naranja `--a-orange #ff9500`, oro profundo `--a-gold-deep #d4af37`, texto `--a-text #f8fafc`,
  texto secundario `--a-dim #cbd5e1`, apagado `--a-muted #94a3b8`, línea `--a-line rgba(255,255,255,0.12)`,
  foco `--a-focus #38bdf8` (el cian del juego), bien `--a-ok #34d399`, error `--a-bad #f87171`
  (más claro que `--neg` para AA sobre fondo oscuro).
- **Tipografía:** la del juego, ya cargada en `index.html`: `var(--display)` (Outfit 800/900) para titular, títulos y botones;
  `var(--body)` (Plus Jakarta Sans) para el resto.
- **Contraste:** el póster es claro (cielo crema y rosa). Todo el texto va o sobre el velo oscuro (mínimo 50 % de negro arriba,
  92 % abajo) con sombra de texto, o dentro de la tarjeta casi opaca.

## 2. Estructura de la página

```
main.auth-screen[data-view="signup|login|forgot|resetSent|check|reset"]
├─ div.auth-bg  [aria-hidden="true"]                 capa fija detrás de todo
│  ├─ div.auth-media                                 póster por CSS (9x16 en vertical, 16x9 en horizontal) + deriva lenta
│  │  └─ video.auth-video                            lo añade JS después del primer pintado; invisible hasta «playing»
│  └─ div.auth-veil                                  degradados oscuros (contraste AA)
├─ div.auth-stage                                    1 columna en móvil; 2 columnas (héroe | tarjeta) desde 900px
│  ├─ header.auth-hero
│  │  ├─ h1.auth-logo                                flota; halo en ::before
│  │  │  └─ img.auth-logo-img  alt="Golf Cash Battle" (/auth/logo-hero.webp, 320x276)
│  │  ├─ p.auth-tagline                              «Duelos de golf en directo. <em>Crea tu cuenta y juega ya.</em>»
│  │  ├─ p.notice.auth-notice                        solo si guest
│  │  └─ ul.auth-perks  [aria-label]                 3 beneficios
│  │     └─ li.auth-perk > img.auth-perk-ico[alt=""] + span
│  └─ section.auth-card                              borde dorado giratorio (::before) + fondo (::after)
│     ├─ h2                                          título de la vista
│     ├─ p.sub                                       intro corta
│     ├─ div.auth-social                             solo signup y login
│     │  ├─ button.auth-google > svg.auth-google-mark + span «Continuar con Google»
│     │  └─ p.auth-error[role="alert"]               error de Google
│     ├─ p.auth-sep > span «o con email»             solo signup y login
│     └─ form.form.auth-form
│        ├─ label > input                            email
│        ├─ label > div.auth-pw > input + button.auth-eye
│        ├─ ul.auth-checks                           checklist de contraseña (signup, reset)
│        ├─ p.auth-error[role="alert"]
│        ├─ button.primary(.auth-cta)                submit; .auth-cta solo en signup (pulso)
│        └─ div.auth-links(.auth-links--center) > button.link …
└─ p.legal.auth-legal
```

El `main` ya **no** lleva la clase `screen` (su animación con `filter` y su `max-width` rompen el fondo a pantalla completa).

## 3. Cambios de markup por vista

Vista inicial: `recovery` → `reset`. Si no, `signup`, salvo que haya `lastEmail()` y no sea `guest` → `login`
(quien ya entró en este dispositivo ve «Entrar»; todo el que llega nuevo ve el registro).

| Vista | Cambios |
|---|---|
| `signup` | Título «Crea tu cuenta», intro «Gratis y en menos de un minuto.». Bloque Google + separador entre intro y formulario. **Se quita el campo «Repite la contraseña»** (formulario corto; el ojo permite revisar lo escrito). Submit «Crear cuenta y jugar» con clase `auth-cta`. Enlace abajo centrado: texto «¿Ya tienes cuenta?» + enlace «Entrar». |
| `login` | Título «Hola de nuevo», intro igual que hoy. Bloque Google + separador entre intro y formulario. Enlaces igual que hoy. |
| `forgot` | Sin cambios de markup. |
| `resetSent` | Sin cambios de markup. |
| `check` | Sin cambios de markup. |
| `reset` | Sin cambios de markup (mantiene «Repite la contraseña»). |
| Todas | `page.dataset.view` = vista. En móvil los beneficios solo se ven en `signup`; en escritorio en `signup` y `login`. En `forgot`, `resetSent`, `check` y `reset` el logo es más pequeño. Los campos con error reciben `aria-invalid="true"`. |

## 4. Paso previo: logo en alta resolución

`public/logo-header.png` mide 139x120 y se ve borroso por encima de ese tamaño. `public/android-chrome-512x512.png` es el
mismo logo a 512 px con transparencia. Genera un recorte (probado, sale 320x276 y ~31 KB):

```bash
mkdir -p public/auth
node -e "require('sharp')('public/android-chrome-512x512.png').extract({left:29,top:61,width:454,height:391}).resize({width:320}).webp({quality:88,alphaQuality:100}).toFile('public/auth/logo-hero.webp').then(i=>console.log(JSON.stringify(i)))"
```

Ejecútalo desde la raíz del worktree. Debe imprimir `"width":320,"height":276`.

## 5. Cambios en `src/ui/authScreen.js`

Mantén `el()`, `field()`, `emailField`, `passwordField`, `checklist()`, `mountAuth(root, auth, {recovery, guest, linkError, onDone})`,
la lógica de `done`, `tryEnter`, `onAuthStateChange`, `local`, `link` y las vistas `forgot`, `resetSent`, `check`, `reset`.
Nada de `innerHTML`.

### 5.1 Imports (añadir una línea)

```js
import { iconUrl } from './icons.js';
```

### 5.2 Nuevas funciones auxiliares de módulo (después de `checklist`) — exacto

```js
const mq = (q) => {
  try {
    return !!globalThis.matchMedia?.(q).matches;
  } catch {
    return false;
  }
};

// qué campo marca aria-invalid según el código de error (invalid_credentials no marca nada: no delata cuál falla)
const FIELD_OF_ERROR = {
  invalid_email: 'email',
  password_short: 'password',
  password_long: 'password',
  password_weak: 'password',
  weak_password: 'password',
  same_password: 'password',
  password_mismatch: 'confirm',
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const GOOGLE_PATHS = [
  ['#EA4335', 'M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z'],
  ['#4285F4', 'M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z'],
  ['#FBBC05', 'M3.88 10.78A5.54 5.54 0 0 1 3.58 9c0-.62.11-1.22.29-1.78L.96 4.96A9.008 9.008 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.92-2.26z'],
  ['#34A853', 'M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.4-1.57-5.12-3.74L.97 13.04C2.45 15.98 5.48 18 9 18z'],
];

/** La «G» de Google en SVG, construida con DOM (sin innerHTML). */
function googleMark() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ class: 'auth-google-mark', viewBox: '0 0 18 18', width: '20', height: '20', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
  for (const [fill, d] of GOOGLE_PATHS) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('fill', fill);
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

const PERKS = [
  ['coins', 'Saldo de demostración para empezar'],
  ['skins', 'Skins y nivel siempre guardados'],
  ['play', 'Juega desde cualquier dispositivo'],
];

function perks() {
  return el(
    'ul',
    { class: 'auth-perks', 'aria-label': 'Qué ganas con tu cuenta' },
    PERKS.map(([ico, text]) => el('li', { class: 'auth-perk' }, el('img', { class: 'auth-perk-ico', src: iconUrl(ico), alt: '', width: 22, height: 22 }), el('span', { text }))),
  );
}

/**
 * Fondo: póster por CSS (se ve al instante) y el vídeo del lobby encima cuando ya ha pintado la página.
 * Con movimiento reducido no se crea el vídeo. Si el vídeo falla, sigue invisible y se ve el póster.
 */
function background() {
  const media = el('div', { class: 'auth-media' });
  const bg = el('div', { class: 'auth-bg', 'aria-hidden': 'true' }, media, el('div', { class: 'auth-veil' }));
  if (mq('(prefers-reduced-motion: reduce)')) return bg;
  const v = mq('(orientation: portrait)') ? '9x16' : '16x9';
  const attach = () => {
    const video = el(
      'video',
      { class: 'auth-video', muted: true, loop: true, playsinline: true, autoplay: true, preload: 'metadata', disablepictureinpicture: true, 'aria-hidden': 'true', tabindex: '-1', poster: `/hub/lobby-poster-${v}.webp` },
      el('source', { src: `/hub/lobby-loop-${v}.webm`, type: 'video/webm' }),
      el('source', { src: `/hub/lobby-loop-${v}.mp4`, type: 'video/mp4' }),
    );
    video.muted = true; // el atributo solo no basta en algunos navegadores para permitir el autoplay
    video.addEventListener('playing', () => video.classList.add('is-on'), { once: true });
    media.append(video);
    video.play?.()?.catch?.(() => {});
  };
  const raf = globalThis.requestAnimationFrame ?? ((f) => setTimeout(f, 16));
  raf(() => raf(attach));
  return bg;
}
```

### 5.3 Montaje de la página dentro de `mountAuth`

Sustituye el bloque que va desde `const card = el('section', { class: 'auth-card' });` hasta `root.replaceChildren(page);`
(ambos incluidos) por — exacto:

```js
  const card = el('section', { class: 'auth-card' });
  const page = el(
    'main',
    { class: 'auth-screen' },
    background(),
    el(
      'div',
      { class: 'auth-stage' },
      el(
        'header',
        { class: 'auth-hero' },
        el('h1', { class: 'auth-logo' }, el('img', { class: 'auth-logo-img', src: '/auth/logo-hero.webp', alt: 'Golf Cash Battle', width: 320, height: 276, decoding: 'async', fetchpriority: 'high' })),
        el('p', { class: 'auth-tagline' }, 'Duelos de golf en directo. ', el('em', { text: 'Crea tu cuenta y juega ya.' })),
        guest
          ? el('p', { class: 'notice auth-notice', text: 'Tu cuenta de invitado sigue ahí. Crea tu cuenta con email para conservar saldo, nivel y skins.' })
          : null,
        perks(),
      ),
      card,
    ),
    el('p', { class: 'legal auth-legal', text: 'Créditos de demostración sin valor real. Para jugar mesas con entrada hay que ser mayor de 18 años y verificar la identidad.' }),
  );
  root.replaceChildren(page);
```

### 5.4 `show()` — exacto

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

### 5.5 Botón de Google — nueva función dentro de `mountAuth` (después de `show`) — exacto

```js
  /** «Continuar con Google»: Google no pasa por la verificación de email. */
  function googleBlock() {
    const error = el('p', { class: 'auth-error', role: 'alert' });
    const label = el('span', { text: 'Continuar con Google' });
    const btn = el('button', { class: 'auth-google', type: 'button' }, googleMark(), label);
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      error.textContent = '';
      btn.disabled = true;
      label.textContent = 'Abriendo Google…';
      try {
        const url = await auth.signInWithGoogle();
        if (url) {
          location.assign(url);
          return; // se va de la página: el botón se queda bloqueado
        }
      } catch (err) {
        error.textContent = authMessage(err.code ?? 'unknown');
      }
      btn.disabled = false;
      label.textContent = 'Continuar con Google';
    });
    return el('div', { class: 'auth-social' }, btn, error);
  }
```

### 5.6 `form()` — cambios

1. Firma: añade `social = false, cta = false` al objeto de opciones.
2. Botón: `const btn = el('button', { class: cta ? 'primary auth-cta' : 'primary', type: 'submit', text: submitText });`
3. Añade, después de crear `f`:

```js
    const markInvalid = (code) => {
      for (const i of f.querySelectorAll('input')) i.removeAttribute('aria-invalid');
      const name = code ? FIELD_OF_ERROR[code] : null;
      if (name) f.querySelector(`input[name="${name}"]`)?.setAttribute('aria-invalid', 'true');
    };
    f.addEventListener('input', (e) => e.target?.removeAttribute?.('aria-invalid'));
```

4. En el `submit`: justo después de `error.textContent = '';` llama `markInvalid(null);`. En el `catch`, sustituye
   `error.textContent = authMessage(err.code ?? 'unknown');` por:

```js
        const code = err.code ?? 'unknown';
        error.textContent = authMessage(code);
        markInvalid(code);
```

5. `return` final — exacto:

```js
    return [
      el('h2', { text: title }),
      intro ? el('p', { class: 'sub', text: intro }) : null,
      social ? googleBlock() : null,
      social ? el('p', { class: 'auth-sep' }, el('span', { text: 'o con email' })) : null,
      f,
    ];
```

### 5.7 Vistas `login` y `signup`

`login`: cambia `title: 'Entrar'` por `title: 'Hola de nuevo'` y añade `social: true`. El resto igual.

`signup` — sustitúyela entera por — exacto:

```js
    signup(email = lastEmail()) {
      const e = emailField(email);
      const p = passwordField('Contraseña', 'password', 'new-password');
      return form({
        title: 'Crea tu cuenta',
        intro: 'Gratis y en menos de un minuto.',
        submitText: 'Crear cuenta y jugar',
        social: true,
        cta: true,
        fields: [e.node, p.node, checklist(p.input)],
        onSubmit: async () => {
          const bad = validateEmail(e.input.value) ?? validatePassword(p.input.value);
          if (bad) throw local(bad);
          const result = await auth.signUp(e.input.value, p.input.value);
          if (result === 'signed_in') return done();
          show('check', e.input.value);
        },
        extra: [
          el('div', { class: 'auth-links auth-links--center' }, el('span', { class: 'auth-links-q', text: '¿Ya tienes cuenta?' }), link('Entrar', 'login', e.input.value)),
        ],
      });
    },
```

### 5.8 Arranque (final de `mountAuth`)

Sustituye `show(recovery ? 'reset' : 'login');` por:

```js
  const first = recovery ? 'reset' : !guest && lastEmail() ? 'login' : 'signup';
  // en móvil no se enfoca al abrir: el teclado taparía el logo y los beneficios
  show(first, undefined, { focus: mq('(min-width: 900px)') });
```

La línea de `linkError` que sigue no cambia.

## 6. CSS completo: reemplaza todo `src/ui/authScreen.css` por esto — exacto

```css
/* Pantallas de entrada. Concepto «Cumbre dorada» (02-DOCS/wiki/ftd/auth-rediseno-diseno.md).
   Reutiliza .form, .primary, .ghost, .link, .notice y .legal de style.css; aquí solo se ajustan. */

.auth-screen {
  --a-ink: #06080e;
  --a-card: rgba(10, 13, 21, 0.92);
  --a-gold: #ffd03b;
  --a-orange: #ff9500;
  --a-gold-deep: #d4af37;
  --a-text: #f8fafc;
  --a-dim: #cbd5e1;
  --a-muted: #94a3b8;
  --a-line: rgba(255, 255, 255, 0.12);
  --a-focus: #38bdf8;
  --a-ok: #34d399;
  --a-bad: #f87171;
  --a-ease: cubic-bezier(0.16, 1, 0.3, 1);
  position: relative; isolation: isolate;
  min-height: 100vh; min-height: 100dvh;
  display: flex; flex-direction: column; justify-content: center;
  padding: calc(env(safe-area-inset-top, 0px) + 20px) 16px calc(env(safe-area-inset-bottom, 0px) + 20px);
  color: var(--a-text); overflow-x: clip;
}

/* ---------- fondo: póster + vídeo + velo ---------- */
.auth-bg { position: fixed; inset: 0; z-index: -1; overflow: hidden; background: var(--a-ink); pointer-events: none; }
.auth-media {
  position: absolute; inset: -4%;
  background: #2a1830 url('/hub/lobby-poster-16x9.webp') center / cover no-repeat;
  animation: auth-drift 28s ease-in-out infinite alternate;
  will-change: transform;
}
@media (orientation: portrait) { .auth-media { background-image: url('/hub/lobby-poster-9x16.webp'); } }
.auth-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.9s ease; }
.auth-video.is-on { opacity: 1; }
.auth-veil {
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse at center, rgba(6, 8, 14, 0) 40%, rgba(6, 8, 14, 0.6) 100%),
    linear-gradient(180deg, rgba(6, 8, 14, 0.5) 0%, rgba(6, 8, 14, 0.7) 40%, rgba(6, 8, 14, 0.92) 100%);
}

/* ---------- escenario y héroe ---------- */
.auth-stage { width: 100%; max-width: 440px; margin: 0 auto; display: grid; gap: 18px; }
.auth-hero { display: grid; justify-items: center; gap: 10px; text-align: center; }
.auth-logo { position: relative; isolation: isolate; margin: 0; line-height: 0; animation: auth-float 4.5s ease-in-out 1.1s infinite alternate; }
.auth-logo::before {
  content: ''; position: absolute; inset: -18% -22%; z-index: -1; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 196, 64, 0.55), rgba(255, 149, 0, 0.18) 60%, transparent);
  animation: auth-halo 3.2s ease-in-out infinite alternate;
}
.auth-logo-img {
  display: block; width: 132px; height: auto;
  filter: drop-shadow(0 10px 24px rgba(0, 0, 0, 0.55));
  animation: auth-logo-in 0.9s var(--a-ease) 0.1s backwards;
}
.auth-tagline {
  margin: 0; max-width: 30ch;
  font: 800 22px/1.15 var(--display); letter-spacing: -0.01em; text-wrap: balance;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7);
  animation: auth-rise 0.6s var(--a-ease) 0.3s backwards;
}
.auth-tagline em { font-style: normal; color: var(--a-gold); }
.auth-notice { margin: 2px 0 0; max-width: 36ch; background: rgba(4, 30, 40, 0.8); }

.auth-perks { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.auth-perk {
  display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 6px 12px 6px 8px; border-radius: 999px;
  background: rgba(6, 8, 14, 0.66); box-shadow: 0 0 0 1px rgba(255, 208, 59, 0.3) inset;
  font-size: 13px; font-weight: 700; line-height: 1.2; color: var(--a-text);
  animation: auth-rise 0.5s var(--a-ease) backwards;
}
.auth-perk:nth-child(1) { animation-delay: 0.4s; }
.auth-perk:nth-child(2) { animation-delay: 0.48s; }
.auth-perk:nth-child(3) { animation-delay: 0.56s; }
.auth-perk-ico { width: 22px; height: 22px; flex: none; }

/* en móvil los beneficios solo en el registro; en las vistas de trámite el logo encoge */
.auth-screen:not([data-view="signup"]) .auth-perks { display: none; }
.auth-screen:not([data-view="signup"]):not([data-view="login"]) .auth-logo-img { width: 96px; }

/* ---------- tarjeta ---------- */
.auth-card {
  position: relative; isolation: isolate; overflow: hidden;
  padding: 20px 18px 18px; border-radius: 22px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), 0 0 40px rgba(255, 170, 40, 0.12);
  animation: auth-card-in 0.7s var(--a-ease) 0.2s backwards;
}
/* borde de luz: un cuadrado con degradado cónico que gira detrás; ::after tapa el centro y deja 2px de borde */
.auth-card::before {
  content: ''; position: absolute; z-index: -2; left: 50%; top: 50%; width: 260%; aspect-ratio: 1;
  background: conic-gradient(from 0deg, rgba(255, 255, 255, 0.1) 0deg 250deg, var(--a-orange) 300deg, var(--a-gold) 330deg, #fff3c4 345deg, rgba(255, 255, 255, 0.1) 360deg);
  transform: translate(-50%, -50%) rotate(0deg);
  animation: auth-spin 6s linear infinite;
}
.auth-card::after { content: ''; position: absolute; z-index: -1; inset: 2px; border-radius: 20px; background: var(--a-card); }
.auth-card > * { animation: auth-swap 0.35s var(--a-ease) backwards; }
.auth-card h2 { margin: 0 0 4px; font: 900 24px/1.1 var(--display); letter-spacing: -0.02em; color: #fff; }
.auth-card > .sub { margin: 0 0 14px; color: var(--a-dim); font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.auth-card > .link, .auth-card > .ghost { margin-top: 10px; }
.auth-card > .ghost { margin-bottom: 4px; }

/* ---------- Google + separador ---------- */
.auth-social { display: grid; gap: 8px; }
.auth-google {
  display: flex; align-items: center; justify-content: center; gap: 12px; width: 100%; min-height: 52px; padding: 12px 18px;
  border-radius: 12px; background: #fff; color: #1f1f1f;
  font: 700 16px/1.2 var(--body);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08) inset;
  transition: transform 0.18s var(--a-ease);
}
.auth-google:hover:not(:disabled) { transform: translateY(-2px); }
.auth-google:active:not(:disabled) { transform: translateY(1px) scale(0.99); }
.auth-google:disabled { opacity: 0.7; filter: none; cursor: progress; }
.auth-google-mark { width: 20px; height: 20px; flex: none; }
.auth-sep {
  display: flex; align-items: center; gap: 12px; margin: 14px 0 6px;
  color: var(--a-muted); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em;
}
.auth-sep::before, .auth-sep::after { content: ''; flex: 1; height: 1px; background: var(--a-line); }

/* ---------- formulario ---------- */
.auth-form { margin-top: 0; gap: 12px; }
.auth-form label { color: var(--a-dim); }
.auth-form input {
  min-height: 48px; font-size: 16px; color: var(--a-text);
  border-radius: 12px; background: rgba(255, 255, 255, 0.06); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.16) inset;
}
.auth-form input::placeholder { color: #8b96a8; }
.auth-screen .auth-form input:focus { outline: 2px solid var(--a-focus); outline-offset: 2px; box-shadow: 0 0 0 1px var(--a-focus) inset, 0 0 0 5px rgba(56, 189, 248, 0.22); }
.auth-form input[aria-invalid="true"] { box-shadow: 0 0 0 2px var(--a-bad) inset; }
.auth-screen .auth-form input[aria-invalid="true"]:focus { outline-color: var(--a-bad); }

.auth-pw { position: relative; display: grid; }
.auth-pw input { padding-right: 84px; }
.auth-eye {
  position: absolute; right: 4px; top: 50%; transform: translateY(-50%); min-width: 72px; min-height: 44px; padding: 0 10px;
  border-radius: 10px; background: transparent; color: var(--a-dim); font-size: 13px; font-weight: 800;
}
.auth-eye:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
.auth-eye[aria-pressed="true"] { color: var(--a-gold); }

.auth-checks { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: -4px 0 0; padding: 0; list-style: none; font-size: 12px; color: var(--a-muted); }
.auth-checks li::before {
  content: ''; display: inline-block; width: 1em; height: 1em; margin-right: 4px; vertical-align: -0.15em;
  background: var(--gi-dot) center / contain no-repeat;
}
.auth-checks li.ok { color: var(--a-ok); }
.auth-checks li.ok::before { background-image: var(--gi-check); animation: auth-pop 0.28s var(--a-ease); }

.auth-error { min-height: 1.2em; margin: 0; font-size: 13px; font-weight: 700; line-height: 1.4; color: var(--a-bad); }
.auth-error:not(:empty) { animation: auth-shake 0.36s ease; }
.auth-error.ok { color: var(--a-ok); animation: none; }
.auth-error:empty { min-height: 0; }

.auth-form .primary { width: 100%; margin-top: 4px; min-height: 54px; font-size: 16px; }
.auth-form .primary:disabled { opacity: 0.6; filter: none; }
/* el brillo de .primary se mueve con transform (el global anima «left») */
.auth-screen .primary::after { left: 0; width: 45%; transform: translateX(-130%); animation: auth-sweep 3.6s ease-in-out 1.2s infinite; }
.auth-cta:not(:disabled) { animation: auth-cta-pulse 2.4s ease-in-out 1.6s infinite; }
.auth-cta:hover, .auth-cta:active, .auth-cta:focus-visible { animation: none; }

/* ---------- enlaces y legal ---------- */
.auth-links { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0 16px; margin-top: 2px; }
.auth-links--center { justify-content: center; gap: 0 6px; }
.auth-links-q { color: var(--a-muted); font-size: 14px; }
.auth-screen .link { min-height: 44px; padding: 10px 0; color: var(--a-dim); font-size: 14px; text-underline-offset: 3px; }
.auth-screen .link:hover { color: #fff; }
.auth-links--center .link { color: var(--a-gold); font-weight: 800; }
.auth-legal {
  width: 100%; max-width: 440px; margin: 18px auto 0; text-align: center;
  font-size: 12px; line-height: 1.5; color: var(--a-dim); opacity: 1; text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8);
}

/* ---------- foco ---------- */
.auth-screen button:focus-visible, .auth-screen a:focus-visible {
  outline: 3px solid var(--a-focus); outline-offset: 3px; box-shadow: 0 0 0 6px rgba(56, 189, 248, 0.25);
}
.auth-screen .auth-eye:focus-visible { outline-offset: 0; box-shadow: none; }

/* ---------- móvil bajo (iPhone SE y similares) ---------- */
@media (max-width: 899px) and (max-height: 700px) {
  .auth-logo-img { width: 96px; }
  .auth-tagline { font-size: 19px; }
  .auth-stage { gap: 14px; }
}

/* ---------- escritorio ---------- */
@media (min-width: 900px) {
  .auth-screen { padding: 40px 48px; }
  .auth-stage { max-width: 1080px; grid-template-columns: minmax(0, 1fr) 420px; align-items: center; gap: 64px; }
  .auth-hero { justify-items: start; text-align: left; gap: 16px; }
  .auth-logo-img { width: 200px; }
  .auth-tagline { max-width: 14ch; font-size: 44px; line-height: 1.05; }
  .auth-perks { flex-direction: column; align-items: flex-start; gap: 10px; }
  .auth-screen[data-view="login"] .auth-perks { display: flex; }
  .auth-perk { min-height: 44px; padding: 8px 16px 8px 10px; font-size: 15px; }
  .auth-perk-ico { width: 26px; height: 26px; }
  .auth-card { padding: 28px 28px 24px; }
  .auth-veil {
    background:
      linear-gradient(90deg, rgba(6, 8, 14, 0.82) 0%, rgba(6, 8, 14, 0.55) 55%, rgba(6, 8, 14, 0.75) 100%),
      linear-gradient(180deg, rgba(6, 8, 14, 0.3) 0%, rgba(6, 8, 14, 0.75) 100%);
  }
  .auth-legal { max-width: 1080px; text-align: left; }
}

/* ---------- animaciones (solo transform y opacity) ---------- */
@keyframes auth-drift { from { transform: scale(1.04) translate3d(0, 0, 0); } to { transform: scale(1.1) translate3d(-1.5%, -1%, 0); } }
@keyframes auth-logo-in {
  0% { opacity: 0; transform: translateY(-28px) scale(0.6) rotate(-6deg); }
  60% { opacity: 1; transform: translateY(4px) scale(1.06) rotate(1deg); }
  100% { opacity: 1; transform: none; }
}
@keyframes auth-float { from { transform: translateY(0); } to { transform: translateY(-6px); } }
@keyframes auth-halo { from { opacity: 0.55; transform: scale(0.92); } to { opacity: 1; transform: scale(1.08); } }
@keyframes auth-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes auth-card-in { from { opacity: 0; transform: translateY(24px) scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes auth-swap { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes auth-spin { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }
@keyframes auth-sweep { 0% { transform: translateX(-130%); } 55%, 100% { transform: translateX(330%); } }
@keyframes auth-cta-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.03); } }
@keyframes auth-pop { 0% { transform: scale(0.4); } 70% { transform: scale(1.25); } 100% { transform: scale(1); } }
@keyframes auth-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(5px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(2px); }
}

/* ---------- movimiento reducido: todo quieto, solo el póster ---------- */
@media (prefers-reduced-motion: reduce) {
  .auth-screen *, .auth-screen *::before, .auth-screen *::after { animation: none !important; transition: none !important; }
  .auth-video { display: none; }
  .auth-card::before { transform: translate(-50%, -50%) rotate(200deg); }
}
```

## 7. Animaciones

| Nombre | Elemento | Duración | Easing | Disparador |
|---|---|---|---|---|
| `auth-drift` | `.auth-media` (póster + vídeo) | 28 s, alterna, infinita | ease-in-out | al montar |
| fundido del vídeo (transition opacity) | `.auth-video` → `.is-on` | 0.9 s | ease | evento `playing` |
| `auth-logo-in` | `.auth-logo-img` | 0.9 s, retardo 0.1 s | `--a-ease` (0.16,1,0.3,1) | al montar |
| `auth-float` | `.auth-logo` | 4.5 s, alterna, infinita, retardo 1.1 s | ease-in-out | tras la entrada del logo |
| `auth-halo` | `.auth-logo::before` | 3.2 s, alterna, infinita | ease-in-out | al montar |
| `auth-rise` | `.auth-tagline` (0.3 s), `.auth-perk` (0.4 / 0.48 / 0.56 s) | 0.6 s / 0.5 s | `--a-ease` | al montar |
| `auth-card-in` | `.auth-card` | 0.7 s, retardo 0.2 s | `--a-ease` | al montar |
| `auth-spin` | `.auth-card::before` (borde de luz) | 6 s, lineal, infinita | linear | al montar |
| `auth-swap` | hijos de `.auth-card` | 0.35 s | `--a-ease` | cada cambio de vista (`show`) |
| `auth-sweep` | brillo `.primary::after` | 3.6 s, infinita, retardo 1.2 s | ease-in-out | al montar |
| `auth-cta-pulse` | `.auth-cta` (submit del registro) | 2.4 s, infinita, retardo 1.6 s | ease-in-out | activo; se para en hover, active, foco y disabled |
| `auth-pop` | icono de `.auth-checks li.ok` | 0.28 s | `--a-ease` | requisito cumplido |
| `auth-shake` | `.auth-error` | 0.36 s | ease | aparece un error (pasa de vacío a texto) |
| hover Google (transition transform) | `.auth-google` | 0.18 s | `--a-ease` | hover / active |

Con `prefers-reduced-motion: reduce` no se crea el vídeo (JS) y el CSS para todas las animaciones y transiciones.

## 8. Lista de archivos

| Archivo | Acción |
|---|---|
| `public/auth/logo-hero.webp` | **Nuevo**, generado con el comando de la sección 4. |
| `src/ui/authScreen.js` | Import de `iconUrl`; nuevas `mq`, `FIELD_OF_ERROR`, `SVG_NS`, `GOOGLE_PATHS`, `googleMark`, `PERKS`, `perks`, `background` (módulo); dentro de `mountAuth`: montaje de página (5.3), `show` (5.4), nueva `googleBlock` (5.5), `form` (5.6), vistas `login` y `signup` (5.7), arranque (5.8). |
| `src/ui/authScreen.css` | Reemplazar entero por la sección 6. |

No tocar: `src/main.js`, `src/style.css`, `tests/`, `vercel.json`, `AuthService.js`, `authRules.js`.
No hace falta tocar la CSP: todo es `'self'`, los iconos son `data:` (permitido en `img-src`) y el vídeo es `'self'` (`media-src`).

## 9. Criterios de aceptación

Comprobables por el agente:

1. `pnpm run build` termina sin errores.
2. `node --test tests/auth-rules.test.js tests/auth-return.test.js` en verde.
3. `pnpm test` sigue en verde (nada de esta tarea debería romper otros tests).
4. `grep -n "innerHTML" src/ui/authScreen.js` no devuelve nada.
5. `public/auth/logo-hero.webp` existe y mide 320x276.
6. `grep -n "signInWithGoogle" src/ui/authScreen.js` aparece una vez, dentro de `googleBlock`, y le sigue `location.assign(url)`.
7. `src/ui/authScreen.css` no anima propiedades que no sean `transform` u `opacity` (revisar `@keyframes` y `transition`).

Checklist visual (lo recorre una persona, no el agente):

- [ ] **Móvil 375x812:** se ve el registro primero (sin `gcb.lastEmail` en localStorage). Logo con entrada y halo, titular,
      3 beneficios, tarjeta con borde dorado girando, Google arriba, «o con email», email, contraseña, checklist y
      «Crear cuenta y jugar» con pulso. Sin scroll horizontal. El teclado no se abre solo.
- [ ] **Móvil:** el vídeo 9x16 arranca tras el póster sin salto; en `login` no salen los beneficios.
- [ ] **Escritorio 1280x800:** dos columnas (héroe a la izquierda, tarjeta de 420 px a la derecha), vídeo 16x9, foco en el email.
- [ ] **Reduced motion** (DevTools > Rendering > prefers-reduced-motion): no hay vídeo, póster fijo, nada se mueve.
- [ ] **Sin vídeo** (bloquear `*.webm` y `*.mp4` en DevTools): se ve el póster y todo se lee.
- [ ] **Estados:** error con email mal (texto rojo, campo con borde rojo, sacudida); login fallido varias veces → botón
      «Espera N s»; ojo «Ver/Ocultar»; checklist se pone verde; «Confirma tu email» con «Reenviar en 30 s»;
      «Nueva contraseña» (enlace de recuperación) sigue pidiendo repetirla.
- [ ] **Google:** el botón dice «Abriendo Google…» y lleva a Google; si falla, el mensaje sale bajo el botón.
- [ ] **Teclado:** Tab recorre Google → email → contraseña → Ver → submit → enlaces con foco cian visible.
- [ ] **Consola** sin violaciones de CSP.

## 10. Decisiones tomadas en este diseño

- La vista inicial es `signup`; solo es `login` si el dispositivo ya tiene `lastEmail()` y no es invitado.
- El registro pierde «Repite la contraseña» (formulario corto). `reset` lo mantiene.
- El vídeo elige variante al montar (vertical/horizontal) y no cambia si se gira el móvil; el póster por CSS sí cambia.
- Logo nuevo `public/auth/logo-hero.webp` sacado del icono de 512 px, porque `logo-header.png` es de 139 px.
