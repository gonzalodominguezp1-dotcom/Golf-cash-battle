import './authScreen.css';
import { authMessage, passwordChecks, retryDelayMs, validateEmail, validatePassword, PASSWORD_MIN } from '../account/authRules.js';
import { lastEmail } from '../account/AuthService.js';
import { onVerified } from '../account/verifiedChannel.js';

// Todo el texto del usuario entra por textContent / value: nunca markup con datos de fuera.
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid);
  return n;
}

function field({ label, name, type = 'text', autocomplete, value = '', toggle = false, ...rest }) {
  const input = el('input', { name, type, autocomplete, required: true, value, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', ...rest });
  input.value = value;
  let row = input;
  if (toggle) {
    const eye = el('button', { type: 'button', class: 'auth-eye', 'aria-label': 'Mostrar contraseña', 'aria-pressed': 'false', text: 'Ver' });
    eye.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      eye.textContent = show ? 'Ocultar' : 'Ver';
      eye.setAttribute('aria-pressed', String(show));
      eye.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
    row = el('div', { class: 'auth-pw' }, input, eye);
  }
  return { input, node: el('label', {}, label, row) };
}

const emailField = (value = '') =>
  field({ label: 'Email', name: 'email', type: 'email', autocomplete: 'email', value, inputmode: 'email', maxlength: 254, placeholder: 'tu@email.com' });
const passwordField = (label, name, autocomplete, extra = {}) =>
  field({ label, name, type: 'password', autocomplete, toggle: true, maxlength: 72, ...extra });

function checklist(input) {
  const items = [
    ['length', `Mínimo ${PASSWORD_MIN} caracteres`],
    ['letter', 'Una letra'],
    ['digit', 'Un número'],
  ].map(([key, text]) => [key, el('li', { text })]);
  const list = el('ul', { class: 'auth-checks', 'aria-label': 'Requisitos de la contraseña' }, items.map(([, li]) => li));
  const paint = () => {
    const c = passwordChecks(input.value);
    for (const [key, li] of items) li.classList.toggle('ok', c[key]);
  };
  input.addEventListener('input', paint);
  paint();
  return list;
}

/**
 * Texto legal en una banda fija abajo que se desplaza en bucle. El texto se lee una vez:
 * la copia de relleno va aria-hidden. Con movimiento reducido se oculta la copia y el texto queda fijo.
 */
function legalTicker(text) {
  const seg = (hidden) => {
    const s = el('span', { class: 'auth-ticker-seg' }, text, el('span', { class: 'auth-ticker-sep', text: '•' }), text, el('span', { class: 'auth-ticker-sep', text: '•' }));
    if (hidden) s.setAttribute('aria-hidden', 'true');
    return s;
  };
  return el('footer', { class: 'auth-ticker' }, el('div', { class: 'auth-ticker-track' }, seg(false), seg(true)));
}

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

/** La «G» de Google en SVG, construida con DOM (sin asignar markup). */
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

/**
 * Pantallas de entrada: login, registro, recuperar contraseña, "revisa tu email" y nueva contraseña.
 * @param {HTMLElement} root
 * @param {import('../account/AuthService.js').AuthService} auth
 * @param {{ recovery?: boolean, guest?: boolean, linkError?: string, onDone: () => void }} opts
 *   onDone: ya hay sesión (o se cambió la contraseña). linkError: código de authRules si la vuelta del correo falló.
 */
export function mountAuth(root, auth, { recovery = false, guest = false, linkError = null, onDone }) {
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    onDone();
  };
  // en «Confirma tu email»: si otra pestaña confirma, esta entra sola
  let stopListening = null;
  const tryEnter = async () => {
    if (finished) return;
    const {
      data: { session },
    } = await auth.db.auth.getSession();
    if (session && !session.user.is_anonymous) done();
  };
  // la sesión puede llegar desde otra pestaña (enlace de confirmación abierto allí)
  if (!recovery) {
    auth.db.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_IN' && s && !s.user.is_anonymous) setTimeout(done, 0);
    });
  }

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
        el('h1', { class: 'auth-logo' }, el('img', { class: 'auth-logo-img', src: '/android-chrome-512x512.png', alt: 'Golf Cash Battle', width: 120, height: 120, decoding: 'async', fetchpriority: 'high' })),
        el('p', { class: 'auth-tagline' }, 'Duelos de golf en directo. ', el('em', { text: 'Crea tu cuenta y juega ya.' })),
        guest
          ? el('p', { class: 'notice auth-notice', text: 'Tu cuenta de invitado sigue ahí. Crea tu cuenta con email para conservar saldo, nivel y skins.' })
          : null,
      ),
      card,
    ),
    legalTicker('Créditos de demostración sin valor real. Para jugar mesas con entrada hay que ser mayor de 18 años y verificar la identidad.'),
  );
  root.replaceChildren(page);

  function show(view, arg, { focus = true } = {}) {
    stopListening?.();
    stopListening = null;
    page.dataset.view = view;
    // filter: las vistas devuelven null en los nodos opcionales y replaceChildren(null) pintaría el texto «null»
    card.replaceChildren(...views[view](arg).filter(Boolean));
    if (focus) card.querySelector('input')?.focus({ preventScroll: true });
  }

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

  /** Cabecera + formulario con zona de error y botón que se bloquea mientras espera. */
  function form({ title, intro, submitText, fields, onSubmit, retryable = false, extra = [], social = false, cta = false }) {
    const error = el('p', { class: 'auth-error', role: 'alert' });
    const btn = el('button', { class: cta ? 'primary auth-cta' : 'primary', type: 'submit', text: submitText });
    const f = el('form', { class: 'form auth-form', novalidate: true }, fields, error, btn, extra);
    const markInvalid = (code) => {
      for (const i of f.querySelectorAll('input')) i.removeAttribute('aria-invalid');
      const name = code ? FIELD_OF_ERROR[code] : null;
      if (name) f.querySelector(`input[name="${name}"]`)?.setAttribute('aria-invalid', 'true');
    };
    f.addEventListener('input', (e) => e.target?.removeAttribute?.('aria-invalid'));
    let failures = 0;
    let timer = null;

    const lock = (ms) => {
      const until = Date.now() + ms;
      btn.disabled = true;
      const tick = () => {
        const left = Math.ceil((until - Date.now()) / 1000);
        if (left <= 0) {
          btn.disabled = false;
          btn.textContent = submitText;
          return;
        }
        btn.textContent = `Espera ${left} s`;
        timer = setTimeout(tick, 250);
      };
      tick();
    };

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      error.textContent = '';
      markInvalid(null);
      clearTimeout(timer);
      btn.disabled = true;
      try {
        await onSubmit(f);
        failures = 0;
        // los que cambian de pantalla no necesitan reactivar el botón; los que se quedan sí
        if (f.isConnected) btn.disabled = false;
      } catch (err) {
        failures += 1;
        const code = err.code ?? 'unknown';
        error.textContent = authMessage(code);
        markInvalid(code);
        if (retryable && retryDelayMs(failures) > 0) lock(retryDelayMs(failures));
        else btn.disabled = false;
      }
    });
    return [
      el('h2', { text: title }),
      intro ? el('p', { class: 'sub', text: intro }) : null,
      social ? googleBlock() : null,
      social ? el('p', { class: 'auth-sep' }, el('span', { text: 'o con email' })) : null,
      f,
    ];
  }

  const local = (code) => Object.assign(new Error(code), { code });
  const link = (text, view, arg) => el('button', { class: 'link', type: 'button', text, onclick: () => show(view, arg) });

  const views = {
    login(email = lastEmail()) {
      const e = emailField(email);
      const p = passwordField('Contraseña', 'password', 'current-password');
      return form({
        title: 'Hola de nuevo',
        intro: 'Tu sesión se queda guardada en este dispositivo.',
        submitText: 'Entrar',
        social: true,
        fields: [e.node, p.node],
        retryable: true,
        onSubmit: async () => {
          if (validateEmail(e.input.value)) throw local('invalid_credentials');
          try {
            await auth.signIn(e.input.value, p.input.value);
          } catch (err) {
            if (err.code === 'email_not_confirmed') return show('check', e.input.value);
            throw err;
          }
          done();
        },
        extra: [
          el('div', { class: 'auth-links' }, link('He olvidado mi contraseña', 'forgot', e.input.value), link('Crear una cuenta', 'signup', e.input.value)),
        ],
      });
    },

    signup(email = lastEmail()) {
      const e = emailField(email);
      const p = passwordField('Contraseña', 'password', 'new-password');
      const c = passwordField('Repite la contraseña', 'confirm', 'new-password');
      return form({
        title: 'Crea tu cuenta',
        intro: 'Gratis y en menos de un minuto.',
        submitText: 'Crear cuenta y jugar',
        social: true,
        cta: true,
        fields: [e.node, p.node, checklist(p.input), c.node],
        onSubmit: async () => {
          const bad = validateEmail(e.input.value) ?? validatePassword(p.input.value);
          if (bad) throw local(bad);
          if (p.input.value !== c.input.value) throw local('password_mismatch');
          const result = await auth.signUp(e.input.value, p.input.value);
          if (result === 'signed_in') return done();
          show('check', e.input.value);
        },
        extra: [
          el('div', { class: 'auth-links auth-links--center' }, el('span', { class: 'auth-links-q', text: '¿Ya tienes cuenta?' }), link('Entrar', 'login', e.input.value)),
        ],
      });
    },

    forgot(email = lastEmail()) {
      const e = emailField(email);
      return form({
        title: 'Recuperar contraseña',
        intro: 'Escribe tu email y te enviamos un enlace para elegir una contraseña nueva. Ábrelo en este mismo navegador.',
        submitText: 'Enviar enlace',
        fields: [e.node],
        onSubmit: async () => {
          const bad = validateEmail(e.input.value);
          if (bad) throw local(bad);
          await auth.requestPasswordReset(e.input.value);
          show('resetSent', e.input.value);
        },
        extra: [el('div', { class: 'auth-links' }, link('Volver a entrar', 'login', e.input.value))],
      });
    },

    resetSent(email) {
      return [
        el('h2', { text: 'Revisa tu email' }),
        el('p', { class: 'sub', text: 'Si hay una cuenta con ese email, te hemos enviado un enlace para cambiar la contraseña. Puede tardar un minuto; mira también en spam.' }),
        link('Volver a entrar', 'login', email),
      ];
    },

    check(email) {
      const status = el('p', { class: 'auth-error', role: 'status' });
      const again = el('button', { class: 'ghost', type: 'button', text: 'Reenviar el email' });
      let timer = null;
      const cooldown = (secs) => {
        again.disabled = true;
        const tick = () => {
          if (secs <= 0) {
            again.disabled = false;
            again.textContent = 'Reenviar el email';
            return;
          }
          again.textContent = `Reenviar en ${secs} s`;
          secs -= 1;
          timer = setTimeout(tick, 1000);
        };
        tick();
      };
      cooldown(30);
      // otra pestaña (o el propio canje) confirma → esta entra sin recargar a mano
      stopListening = onVerified(tryEnter);
      const enter = el('button', {
        class: 'link',
        type: 'button',
        text: 'Ya lo he confirmado, entrar',
        onclick: async () => {
          await tryEnter();
          if (!finished) show('login', email);
        },
      });
      again.addEventListener('click', async () => {
        clearTimeout(timer);
        again.disabled = true;
        status.classList.remove('ok');
        status.textContent = '';
        try {
          await auth.resendConfirmation(email);
          status.classList.add('ok');
          status.textContent = 'Enviado otra vez.';
        } catch (err) {
          status.textContent = authMessage(err.code);
        }
        cooldown(30);
      });
      return [
        el('h2', { text: 'Confirma tu email' }),
        el('p', { class: 'sub' }, 'Te hemos enviado un enlace a ', el('b', { text: email }), '. Ábrelo y vuelve aquí para entrar. Puede tardar un minuto; mira también en spam.'),
        again,
        status,
        enter,
      ];
    },

    reset() {
      const p = passwordField('Contraseña nueva', 'password', 'new-password');
      const c = passwordField('Repite la contraseña', 'confirm', 'new-password');
      return form({
        title: 'Nueva contraseña',
        intro: 'Elige una contraseña nueva para tu cuenta.',
        submitText: 'Guardar contraseña',
        fields: [p.node, checklist(p.input), c.node],
        onSubmit: async () => {
          const bad = validatePassword(p.input.value);
          if (bad) throw local(bad);
          if (p.input.value !== c.input.value) throw local('password_mismatch');
          await auth.updatePassword(p.input.value);
          done();
        },
      });
    },
  };

  const first = recovery ? 'reset' : !guest && lastEmail() ? 'login' : 'signup';
  // en móvil no se enfoca al abrir: el teclado taparía el logo y los beneficios
  show(first, undefined, { focus: mq('(min-width: 900px)') });
  // error de la vuelta del correo: se enseña encima del formulario, con el mensaje en español de authRules
  if (linkError && !recovery) card.prepend(el('p', { class: 'auth-error', role: 'alert', text: authMessage(linkError) }));
}
