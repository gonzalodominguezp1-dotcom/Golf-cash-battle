import './authScreen.css';
import { authMessage, passwordChecks, retryDelayMs, validateEmail, validatePassword, PASSWORD_MIN } from '../account/authRules.js';
import { lastEmail } from '../account/AuthService.js';

// Todo el texto del usuario entra por textContent / value: nada de innerHTML con datos de fuera.
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
 * Pantallas de entrada: login, registro, recuperar contraseña, "revisa tu email" y nueva contraseña.
 * @param {HTMLElement} root
 * @param {import('../account/AuthService.js').AuthService} auth
 * @param {{ recovery?: boolean, guest?: boolean, onDone: () => void }} opts onDone: ya hay sesión (o se cambió la contraseña)
 */
export function mountAuth(root, auth, { recovery = false, guest = false, onDone }) {
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    onDone();
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
    { class: 'screen auth-screen' },
    el('h1', { class: 'auth-brand', text: 'Golf Cash Battle' }),
    guest
      ? el('p', { class: 'notice', text: 'Tu cuenta de invitado sigue ahí. Crea tu cuenta con email para conservar saldo, nivel y skins.' })
      : null,
    card,
    el('p', { class: 'legal', text: 'Créditos de demostración sin valor real. Para jugar mesas con entrada hay que ser mayor de 18 años y verificar la identidad.' }),
  );
  root.replaceChildren(page);

  function show(view, arg) {
    card.replaceChildren(...views[view](arg));
    card.querySelector('input')?.focus({ preventScroll: true });
  }

  /** Cabecera + formulario con zona de error y botón que se bloquea mientras espera. */
  function form({ title, intro, submitText, fields, onSubmit, retryable = false, extra = [] }) {
    const error = el('p', { class: 'auth-error', role: 'alert' });
    const btn = el('button', { class: 'primary', type: 'submit', text: submitText });
    const f = el('form', { class: 'form auth-form', novalidate: true }, fields, error, btn, extra);
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
      clearTimeout(timer);
      btn.disabled = true;
      try {
        await onSubmit(f);
        failures = 0;
        // los que cambian de pantalla no necesitan reactivar el botón; los que se quedan sí
        if (f.isConnected) btn.disabled = false;
      } catch (err) {
        failures += 1;
        error.textContent = authMessage(err.code ?? 'unknown');
        if (retryable && retryDelayMs(failures) > 0) lock(retryDelayMs(failures));
        else btn.disabled = false;
      }
    });
    return [el('h2', { text: title }), intro ? el('p', { class: 'sub', text: intro }) : null, f];
  }

  const local = (code) => Object.assign(new Error(code), { code });
  const link = (text, view, arg) => el('button', { class: 'link', type: 'button', text, onclick: () => show(view, arg) });

  const views = {
    login(email = lastEmail()) {
      const e = emailField(email);
      const p = passwordField('Contraseña', 'password', 'current-password');
      return form({
        title: 'Entrar',
        intro: 'Tu sesión se queda guardada en este dispositivo.',
        submitText: 'Entrar',
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
        title: 'Crear cuenta',
        intro: 'Con tu cuenta guardas saldo, nivel y skins y puedes entrar desde cualquier dispositivo.',
        submitText: 'Crear cuenta',
        fields: [e.node, p.node, checklist(p.input), c.node],
        onSubmit: async () => {
          const bad = validateEmail(e.input.value) ?? validatePassword(p.input.value);
          if (bad) throw local(bad);
          if (p.input.value !== c.input.value) throw local('password_mismatch');
          const result = await auth.signUp(e.input.value, p.input.value);
          if (result === 'signed_in') return done();
          show('check', e.input.value);
        },
        extra: [el('div', { class: 'auth-links' }, link('Ya tengo cuenta', 'login', e.input.value))],
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
        link('Ya lo he confirmado, entrar', 'login', email),
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

  show(recovery ? 'reset' : 'login');
}
