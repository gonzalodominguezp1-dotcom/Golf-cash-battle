import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeEnv } from './helpers/fakeEnv.js';
import { createScope } from '../src/screens/lifecycle.js';
import { mount as mountAccount, tabModules } from '../src/screens/account.js';
import { mount as mountProfile } from '../src/screens/account/profile.js';
import { openAvatarEditor } from '../src/screens/avatarEditor.js';
import { FRAMES } from '../src/progress/prestige.js';

// Nodo falso: reconoce [data-x] y [data-x="v"] sobre su HTML y devuelve elementos estables; las cajas son nodos hijos.
// Modela los atributos disabled/type/required/maxlength del HTML y registra en SINKS todo lo que se escribe en el DOM.
const BOXES = new Set(['data-acc-body', 'data-rename-box', 'data-pw-box', 'data-kyc-box']);
const SINKS = [];
const rec = (v) => { SINKS.push(String(v)); };
function fakeNode(env, parent = null) {
  const stubs = new Map(), kids = new Map();
  let html = '';
  const camel = (a) => a.replace(/^data-/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const tagOf = (attr, val) => {
    const h = node.hay();
    const i = h.indexOf(val === '' ? attr : `${attr}="${val}"`);
    return i < 0 ? '' : h.slice(h.lastIndexOf('<', i), h.indexOf('>', i) + 1);
  };
  const stub = (attr, val) => {
    const k = `${attr}=${val}`;
    if (!stubs.has(k)) {
      const e = env.el('button');
      const tag = tagOf(attr, val);
      let tc = '';
      Object.defineProperty(e, 'textContent', { get: () => tc, set(v) { tc = v; rec(v); }, configurable: true });
      e.setAttribute = (n, v) => rec(`${n}=${v}`);
      e.dataset = new Proxy({ [camel(attr)]: val }, { set(o, p, v) { rec(`${String(p)}=${v}`); o[p] = v; return true; } });
      e.disabled = /\sdisabled(?=[\s>=])/.test(tag);
      e.required = /\srequired(?=[\s>=])/.test(tag);
      e.type = tag.match(/\stype="([^"]*)"/)?.[1] ?? '';
      e.maxLength = Number(tag.match(/\smaxlength="(\d+)"/)?.[1] ?? -1);
      stubs.set(k, e);
    }
    return stubs.get(k);
  };
  const node = {
    isConnected: true,
    dataset: {},
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; rec(v); stubs.clear(); kids.clear(); },
    hay: () => html || parent?.hay() || '',
    querySelectorAll(sel) {
      const attr = sel.match(/^\[(data-[\w-]+)\]$/)?.[1];
      if (!attr) return [];
      return [...node.hay().matchAll(new RegExp(`${attr}="([^"]*)"`, 'g'))].map((m) => stub(attr, m[1]));
    },
    querySelector(sel) {
      const m = sel.match(/^\[(data-[\w-]+)(?:="([^"]+)")?\]$/);
      if (!m) return null;
      const has = m[2] === undefined ? node.hay().includes(m[1]) : node.hay().includes(`${m[1]}="${m[2]}"`);
      if (!has) return null;
      if (BOXES.has(m[1])) { if (!kids.has(m[1])) kids.set(m[1], fakeNode(env, node)); return kids.get(m[1]); }
      return stub(m[1], m[2] ?? '');
    },
    all: () => html + [...kids.values()].map((k) => k.all()).join(''),
  };
  return node;
}

const defer = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };
const settle = () => new Promise((r) => setImmediate(r));
const PASS = { cur: 'ClaveVieja123', next: 'ClaveNueva456', bad: 'corta' };

function makeCtx(env, over = {}, profileOver = {}) {
  const calls = { push: [], replace: [], back: 0, load: 0, change: [], rename: [], equip: [], kyc: 0, stub: [], signOut: 0, levelReads: 0 };
  const profile = { username: 'Ana_1', email: 'ana@x.com', email_confirmed: true, is_anonymous: false, kyc_status: 'none', ...profileOver };
  const account = {
    profile,
    load: async () => { calls.load++; return { ...profile }; },
    changePassword: async (a, b) => { calls.change.push([a, b]); },
    setUsername: async (n) => { calls.rename.push(n); },
    signOut: async () => { calls.signOut++; },
    startKyc: async () => { calls.kyc++; return { status: 'pending' }; },
    stubKyc: async (d, n) => { calls.stub.push([d, n]); },
  };
  const state = { frame: null };
  const ctx = {
    router: { push: (id) => { calls.push.push(id); }, replace: (id, p) => { calls.replace.push([id, p]); }, back: () => { calls.back++; } },
    scope: createScope({ win: env.win, doc: env.doc, timers: env.timers }),
    backend: { mode: 'remote', account },
    progress: {
      get level() { calls.levelReads++; return { level: 30, into: 10, need: 100 }; },
      get prestige() { return { frame: state.frame }; },
      state: { wins: 2, matches: 5 },
      isUnlocked: () => false, challenge: () => ({ done: false }),
      equipFrame: (id) => { calls.equip.push(id); state.frame = FRAMES.find((x) => x.id === id) ?? null; return true; },
    },
    avatar: { get: () => ({}), setIcon() {}, clear() {}, setImage() {} },
    icon: (n) => `<svg data-icon="${n}"></svg>`,
    sfx: { tap() {} },
    ...over,
  };
  return { ctx, calls, account, profile };
}

function fakeOverlay(env) {
  const cache = new Map();
  const get = (sel) => { if (!cache.has(sel)) { const e = env.el(sel); e.files = []; e.click = () => {}; cache.set(sel, e); } return cache.get(sel); };
  const icons = ['golf', 'ball'].map((id) => { const e = env.el('button'); e.dataset = { icon: id }; return e; });
  const o = { className: '', innerHTML: '', removed: 0, remove() { o.removed++; }, querySelector: get, querySelectorAll: (q) => (q === '[data-icon]' ? icons : []), get, icons };
  return o;
}
const openPw = (root) => root.querySelector('[data-pw-open]').emit('click');
const pwField = (root, k) => root.querySelector('[data-pw-box]').querySelector(`[data-pw-${k}]`);
const fillPw = (root, cur, next, again = next) => {
  openPw(root);
  pwField(root, 'current').value = cur; pwField(root, 'next').value = next; pwField(root, 'again').value = again;
};
const submitPw = async (root) => { root.querySelector('[data-pw-box]').querySelector('[data-pw-form]').emit('submit', { preventDefault() {} }); await settle(); };
const pwError = (root) => root.querySelector('[data-pw-box]').querySelector('[data-pw-error]').textContent;

test('account/perfil: pinta perfil, estadísticas, marcos, email y acceso a Amigos y grupo con textos en español', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls } = makeCtx(env);
  const screen = await mountProfile(root, ctx);
  await settle();
  const html = root.innerHTML;
  assert.match(html, /Ana_1/);
  assert.match(html, /ana@x\.com/);
  assert.match(html, /Jugador Oficial/);
  assert.match(html, /Marco de prestigio/);
  assert.match(html, /Logros/);
  assert.doesNotMatch(html, new RegExp('des' + 'af', 'i'));
  assert.match(html, /La verificación de identidad está desactivada temporalmente\./);
  assert.match(html, /data-go="friends"/);
  assert.match(html, /Amigos y grupo/);
  assert.doesNotMatch(html, /data-friends-locked/);
  root.querySelector('[data-go="friends"]').emit('click');
  assert.deepEqual(calls.push, ['friends']);
  screen.destroy();
});

test('account/perfil: invitado y sin nombre dejan la tarjeta de amigos bloqueada con el motivo del hub', async () => {
  for (const [over, re] of [[{ is_anonymous: true, email: null, email_confirmed: false }, /Necesitas una cuenta para usar Amigos y grupo/], [{ username: null }, /Ponte primero un nombre de usuario/]]) {
    const env = fakeEnv();
    const root = fakeNode(env);
    const { ctx, calls } = makeCtx(env, {}, over);
    const screen = await mountProfile(root, ctx);
    await settle();
    assert.match(root.innerHTML, re);
    assert.match(root.innerHTML, /data-go="friends" disabled/);
    root.querySelector('[data-go="friends"]').emit('click');
    assert.deepEqual(calls.push, []);
    screen.destroy();
  }
});

test('account/perfil: sin cuenta (modo local) avisa y no pide nada', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls } = makeCtx(env);
  ctx.backend = { mode: 'local', account: null };
  const screen = await mountProfile(root, ctx);
  assert.match(root.innerHTML, /Sin conexión con el servidor: el perfil no está disponible en este modo\./);
  assert.equal(calls.load, 0);
  screen.destroy();
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
});

test('account/perfil: nombre y email se escapan (XSS)', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env, {}, { username: '<img src=x onerror=alert(1)>', email: '"><script>x</script>@a.com' });
  const screen = await mountProfile(root, ctx);
  await settle();
  assert.doesNotMatch(root.innerHTML, /<img src=x/);
  assert.doesNotMatch(root.innerHTML, /<script>/);
  assert.match(root.innerHTML, /&#60;img src=x onerror=alert\(1\)&#62;/);
  screen.destroy();
});

test('account/perfil: cambio de contraseña válido: manda la actual y la nueva, vacía los campos antes de esperar y avisa', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls, account } = makeCtx(env);
  const screen = await mountProfile(root, ctx);
  await settle();
  assert.match(root.innerHTML, /data-pw-open/);
  fillPw(root, PASS.cur, PASS.next);
  const html = root.querySelector('[data-pw-box]').innerHTML;
  assert.match(html, /name="current"[^>]*autocomplete="current-password"/);
  assert.match(html, /name="next"[^>]*autocomplete="new-password"/);
  assert.match(html, /name="again"[^>]*autocomplete="new-password"/);
  assert.equal((html.match(/type="password"/g) || []).length, 3);
  let seen = null;
  account.changePassword = async (a, b) => { seen = [a, b, pwField(root, 'current').value, pwField(root, 'next').value, pwField(root, 'again').value]; calls.change.push([a, b]); };
  await submitPw(root);
  assert.deepEqual(calls.change, [[PASS.cur, PASS.next]]);
  assert.deepEqual(seen.slice(2), ['', '', '']); // ya vacíos cuando la petición está en vuelo
  assert.match(root.innerHTML, /Contraseña cambiada/);
  assert.equal(calls.load, 2); // recarga el perfil tras guardar
  screen.destroy();
});

test('account/perfil: contraseña inválida o distinta no llega al servidor y CONSERVA los campos (no se envió nada)', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls } = makeCtx(env);
  const screen = await mountProfile(root, ctx);
  await settle();
  fillPw(root, PASS.cur, PASS.bad);
  await submitPw(root);
  assert.equal(pwError(root), 'La contraseña debe tener al menos 8 caracteres.');
  assert.equal(pwField(root, 'current').value, PASS.cur);
  assert.equal(pwField(root, 'next').value, PASS.bad);
  fillPw(root, PASS.cur, PASS.next, `${PASS.next}x`);
  await submitPw(root);
  assert.equal(pwError(root), 'Las contraseñas no coinciden.');
  assert.equal(pwField(root, 'current').value, PASS.cur);
  fillPw(root, PASS.cur, 'a'.repeat(73) + '1');
  await submitPw(root);
  assert.equal(pwError(root), 'La contraseña es demasiado larga (máximo 72 caracteres).');
  fillPw(root, PASS.cur, 'sololetrasaqui');
  await submitPw(root);
  assert.equal(pwError(root), 'Usa al menos una letra y un número.');
  assert.deepEqual(calls.change, []);
  screen.destroy();
});

test('account/perfil: los campos de contraseña son de tipo password, obligatorios, con maxlength 72 y autocomplete correcto', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env);
  const screen = await mountProfile(root, ctx);
  await settle();
  openPw(root);
  for (const [k, ac] of [['current', 'current-password'], ['next', 'new-password'], ['again', 'new-password']]) {
    const e = pwField(root, k);
    assert.equal(e.type, 'password');
    assert.equal(e.required, true);
    assert.equal(e.maxLength, 72);
    assert.match(root.querySelector('[data-pw-box]').innerHTML, new RegExp(`name="${k}"[^>]*autocomplete="${ac}"`));
  }
  screen.destroy();
});

test('account/perfil: doble envío: el botón queda deshabilitado mientras la petición está en vuelo y el segundo envío no repite la petición', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls, account } = makeCtx(env);
  const screen = await mountProfile(root, ctx);
  await settle();
  const d = defer();
  account.changePassword = (a, b) => { calls.change.push([a, b]); return d.p; };
  fillPw(root, PASS.cur, PASS.next);
  await submitPw(root);
  assert.equal(root.querySelector('[data-pw-box]').querySelector('[data-pw-submit]').disabled, true);
  await submitPw(root); // campos ya vacíos: no pasa la validación y no manda nada más
  assert.equal(calls.change.length, 1);
  d.resolve();
  await settle();
  screen.destroy();
});

test('account/perfil: error del servidor muestra el mensaje fijo (sin detalles internos), reactiva el botón y vacía los campos', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, account } = makeCtx(env);
  const screen = await mountProfile(root, ctx);
  await settle();
  account.changePassword = async () => {
    pwField(root, 'next').value = 'TecleadoEnVuelo9'; // la persona sigue escribiendo mientras la petición está en vuelo
    throw Object.assign(new Error('pg: SECRETO-INTERNO tabla auth.users'), { code: 'invalid_credentials' });
  };
  fillPw(root, PASS.cur, PASS.next);
  await submitPw(root);
  assert.equal(pwError(root), 'Email o contraseña incorrectos.');
  assert.doesNotMatch(root.all(), /SECRETO-INTERNO/);
  assert.equal(root.querySelector('[data-pw-box]').querySelector('[data-pw-submit]').disabled, false);
  for (const k of ['current', 'next', 'again']) assert.equal(pwField(root, k).value, '');
  account.changePassword = async () => { throw new Error('boom'); };
  fillPw(root, PASS.cur, PASS.next);
  await submitPw(root);
  assert.equal(pwError(root), 'Algo ha fallado. Inténtalo otra vez.');
  screen.destroy();
});

test('account/perfil: ninguna contraseña llega a un sumidero del DOM, a consola, storage, ruta ni a t()', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls, account } = makeCtx(env);
  SINKS.length = 0;
  const logged = [], storageWrites = [];
  const saved = {};
  const ser = (a) => { try { return JSON.stringify(a, (k, v) => (v instanceof Error ? v.message : v)); } catch { return String(a); } };
  for (const k of ['log', 'info', 'warn', 'error', 'debug', 'table', 'dir', 'trace']) { saved[k] = console[k]; console[k] = (...a) => logged.push(ser(a)); }
  const fakeStorage = { setItem: (k, v) => storageWrites.push(`${k}=${v}`), getItem: () => null, removeItem() {} };
  const prevLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), prevSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: fakeStorage, configurable: true });
  try {
    const screen = await mountProfile(root, ctx);
    await settle();
    for (const outcome of ['ok', 'weak', 'server']) {
      account.changePassword = async () => { if (outcome === 'server') throw Object.assign(new Error(PASS.next + PASS.cur), { code: 'rate_limited' }); };
      fillPw(root, PASS.cur, outcome === 'weak' ? PASS.bad : PASS.next);
      await submitPw(root);
      await settle();
    }
    screen.destroy();
  } finally {
    Object.assign(console, saved);
    for (const [k, d] of [['localStorage', prevLocal], ['sessionStorage', prevSession]]) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
  }
  const secret = new RegExp(`${PASS.cur}|${PASS.next}|${PASS.bad}`);
  assert.ok(SINKS.length > 10, 'los sumideros registran lo que se escribe en el DOM');
  assert.deepEqual(SINKS.filter((x) => secret.test(x)), []);
  assert.doesNotMatch(root.all(), secret);
  assert.deepEqual(logged.filter((x) => secret.test(x)), []);
  assert.deepEqual(storageWrites, []);
  assert.doesNotMatch(JSON.stringify([calls.push, calls.replace]), secret);
  // las llamadas a t() del perfil no reciben campos de contraseña (se leen los argumentos de cada t( ... ) del fuente)
  const src = readFileSync(new URL('../src/screens/account/profile.js', import.meta.url), 'utf8');
  let seen = 0;
  for (let i = src.indexOf('t('); i >= 0; i = src.indexOf('t(', i + 2)) {
    if (/\w/.test(src[i - 1] ?? ' ')) continue;
    let depth = 0, j = i + 1;
    for (; j < src.length; j++) { if (src[j] === '(') depth++; else if (src[j] === ')' && --depth === 0) break; }
    seen++;
    assert.doesNotMatch(src.slice(i, j + 1), /\.value|\bcur\b|\bagain\b|password/i, `t() con un valor sensible: ${src.slice(i, j + 1)}`);
  }
  assert.ok(seen > 20);
  assert.doesNotMatch(src, /\bconsole\b|localStorage|sessionStorage|location\.hash|location\.search/);
});

test('account/perfil: al destruir con el formulario abierto, los campos quedan vacíos', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env);
  const screen = await mountProfile(root, ctx);
  await settle();
  fillPw(root, PASS.cur, PASS.next);
  const f = pwField(root, 'next');
  screen.destroy();
  assert.equal(f.value, '');
  assert.equal(pwField(root, 'current').value, '');
});

test('account/perfil: nombre de usuario válido, ocupado e inválido con los mensajes de siempre', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls, account } = makeCtx(env);
  const screen = await mountProfile(root, ctx);
  await settle();
  const form = () => root.querySelector('[data-rename-box]');
  root.querySelector('[data-rename]').emit('click');
  assert.match(form().innerHTML, /value="Ana_1"/);
  form().querySelector('[data-rename-input]').value = '  Nuevo_1 ';
  account.setUsername = async (n) => { calls.rename.push(n); throw Object.assign(new Error('x'), { code: 'username_taken' }); };
  form().querySelector('[data-rename-form]').emit('submit', { preventDefault() {} }); await settle();
  assert.deepEqual(calls.rename, ['Nuevo_1']);
  assert.equal(form().querySelector('[data-rename-error]').textContent, 'Ese nombre ya está cogido.');
  account.setUsername = async () => { throw Object.assign(new Error('x'), { code: 'invalid_username' }); };
  form().querySelector('[data-rename-form]').emit('submit', { preventDefault() {} }); await settle();
  assert.equal(form().querySelector('[data-rename-error]').textContent, 'Usa de 3 a 16 letras, números o _.');
  account.setUsername = async (n) => { calls.rename.push(n); };
  form().querySelector('[data-rename-form]').emit('submit', { preventDefault() {} }); await settle();
  assert.match(root.innerHTML, /Nombre guardado/);
  screen.destroy();
});

test('account/perfil: equipar un marco lo aplica y REPINTA; un marco bloqueado por nivel está disabled y no hace nada', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls } = makeCtx(env);
  const screen = await mountProfile(root, ctx);
  await settle();
  assert.match(root.innerHTML, /panel-badge pending">Sin marco/);
  assert.equal(root.querySelector('[data-frame="p50"]').disabled, true);
  assert.equal(root.querySelector('[data-frame="p25"]').disabled, false);
  root.querySelector('[data-frame="p50"]').emit('click');
  assert.deepEqual(calls.equip, []);
  const before = calls.levelReads;
  root.querySelector('[data-frame="p25"]').emit('click');
  assert.deepEqual(calls.equip, ['p25']);
  assert.ok(calls.levelReads > before, 'repintó');
  assert.match(root.innerHTML, /panel-badge verified">Bronce/);
  screen.destroy();
});

test('account/perfil: tras muchos repintados no se acumulan listeners (el scope del pintado anterior se libera)', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env);
  const screen = await mountProfile(root, ctx);
  await settle();
  root.querySelector('[data-frame="p25"]').emit('click');
  const base = ctx.scope.live();
  assert.ok(base.listeners > 0, 'había algo vivo');
  for (let i = 0; i < 6; i++) root.querySelector('[data-frame="p25"]').emit('click');
  assert.deepEqual(ctx.scope.live(), base);
  screen.destroy();
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
});

test('account/perfil: cerrar sesión llama a la cuenta', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls } = makeCtx(env);
  const screen = await mountProfile(root, ctx);
  await settle();
  root.querySelector('[data-logout]').emit('click'); await settle();
  assert.equal(calls.signOut, 1);
  screen.destroy();
});

test('account/perfil: si cerrar sesión falla (sin red) avisa en línea, reactiva el botón y no deja rechazos sin gestionar', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, account } = makeCtx(env);
  const screen = await mountProfile(root, ctx);
  await settle();
  account.signOut = async () => { throw new Error('detalle-interno'); };
  const out = root.querySelector('[data-logout]');
  out.emit('click'); await settle();
  assert.equal(out.disabled, false);
  assert.equal(root.querySelector('[data-logout-error]').textContent, 'No se ha podido cerrar la sesión. Inténtalo de nuevo.');
  assert.doesNotMatch(root.all(), /detalle-interno/);
  screen.destroy();
});

test('account/perfil: XSS: con el formulario de renombrar abierto el nombre no rompe el atributo value ni los demás atributos', async () => {
  for (const name of ['" autofocus onfocus=alert(1) x="', '<img src=x onerror=alert(1)>', "' onmouseover='x", '"><img onerror=1>']) {
    const env = fakeEnv();
    const root = fakeNode(env);
    const { ctx } = makeCtx(env, {}, { username: name });
    const screen = await mountProfile(root, ctx);
    await settle();
    root.querySelector('[data-rename]').emit('click');
    const all = root.all();
    assert.doesNotMatch(all, /<img/);
    assert.doesNotMatch(all, /value="[^"]*"\s+autofocus/);
    for (const [tag] of all.matchAll(/<[^>]*>/g)) assert.doesNotMatch(tag.replace(/="[^"]*"/g, '=""'), /\son(focus|error|mouseover)=|\sautofocus[\s>=]/); // como atributo nunca; dentro de un value va escapado
    const value = root.querySelector('[data-rename-box]').innerHTML.match(/value="([^"]*)"/)[1];
    assert.doesNotMatch(value, /["'<>]/);
    screen.destroy();
  }
});

test('account/perfil: identidad (si se activa): empezar, formulario de pruebas y el documento se vacía', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls } = makeCtx(env, { kycDisabled: false });
  const screen = await mountProfile(root, ctx);
  await settle();
  root.querySelector('[data-kyc-start]').emit('click'); await settle();
  assert.equal(calls.kyc, 1);
  const box = root.querySelector('[data-kyc-box]');
  assert.match(box.innerHTML, /Verificación simulada/);
  box.querySelector('[data-kyc-birth]').value = '1990-01-01';
  const doc = box.querySelector('[data-kyc-doc]');
  doc.value = '12345678Z';
  box.querySelector('[data-kyc-form]').emit('submit', { preventDefault() {} }); await settle();
  assert.deepEqual(calls.stub, [['1990-01-01', '12345678Z']]);
  assert.equal(doc.value, '');
  screen.destroy();
});

test('account/perfil: identidad: fallo y destroy vacían el documento; verificada recarga; sin email confirmado avisa', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls, account } = makeCtx(env, { kycDisabled: false });
  const screen = await mountProfile(root, ctx);
  await settle();
  root.querySelector('[data-kyc-start]').emit('click'); await settle();
  const box = () => root.querySelector('[data-kyc-box]');
  const doc = box().querySelector('[data-kyc-doc]');
  box().querySelector('[data-kyc-birth]').value = '1990-01-01';
  doc.value = '12345678Z';
  account.stubKyc = async () => { throw new Error('x'); };
  box().querySelector('[data-kyc-form]').emit('submit', { preventDefault() {} }); await settle();
  assert.equal(doc.value, '');
  assert.equal(box().querySelector('[data-kyc-error]').textContent, 'Revisa la fecha y el número de documento.');
  assert.equal(box().querySelector('[data-kyc-submit]').disabled, false);
  doc.value = '99999999R';
  screen.destroy();
  assert.equal(doc.value, '');
  const root2 = fakeNode(env);
  const c2 = makeCtx(env, { kycDisabled: false });
  c2.account.startKyc = async () => ({ status: 'verified' });
  const s2 = await mountProfile(root2, c2.ctx);
  await settle();
  root2.querySelector('[data-kyc-start]').emit('click'); await settle();
  assert.equal(c2.calls.load, 2);
  s2.destroy();
  const root3 = fakeNode(env);
  const c3 = makeCtx(env, { kycDisabled: false });
  c3.account.startKyc = async () => { throw Object.assign(new Error('x'), { code: 'account_required' }); };
  const s3 = await mountProfile(root3, c3.ctx);
  await settle();
  root3.querySelector('[data-kyc-start]').emit('click'); await settle();
  assert.equal(root3.querySelector('[data-kyc-error]').textContent, 'Primero confirma tu email.');
  assert.equal(root3.querySelector('[data-kyc-start]').disabled, false);
  s3.destroy();
  assert.equal(calls.kyc, 1);
});

test('account/perfil: identidad: solo se navega a una URL https del servidor; javascript:, data: y http: caen al formulario de pruebas', async () => {
  for (const [url, navega] of [['javascript:alert(1)', false], ['data:text/html,x', false], ['http://x.test/v', false], ['//x.test/v', false], [42, false], ['https://id.example/v?s=1', true]]) {
    const env = fakeEnv();
    env.win.location = { href: 'inicio' };
    const root = fakeNode(env);
    const { ctx, account } = makeCtx(env, { kycDisabled: false });
    account.startKyc = async () => ({ url });
    const screen = await mountProfile(root, ctx);
    await settle();
    root.querySelector('[data-kyc-start]').emit('click'); await settle();
    assert.equal(env.win.location.href, navega ? url : 'inicio', String(url));
    assert.equal(/Verificación simulada/.test(root.querySelector('[data-kyc-box]').innerHTML), !navega, String(url));
    screen.destroy();
  }
});

test('account/perfil: dos lecturas en vuelo: la primera que resuelve la ÚLTIMA no pisa a la nueva', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, account, profile } = makeCtx(env);
  const loads = [];
  account.load = () => { const d = defer(); loads.push(d); return d.p; };
  const screen = await mountProfile(root, ctx);
  loads[0].resolve({ ...profile }); await settle();
  const pw = defer(), nm = defer();
  account.changePassword = () => pw.p;
  account.setUsername = () => nm.p;
  fillPw(root, PASS.cur, PASS.next);
  await submitPw(root); // contraseña en vuelo
  root.querySelector('[data-rename]').emit('click');
  root.querySelector('[data-rename-box]').querySelector('[data-rename-input]').value = 'Otro_2';
  root.querySelector('[data-rename-box]').querySelector('[data-rename-form]').emit('submit', { preventDefault() {} }); await settle(); // nombre en vuelo
  nm.resolve(); await settle(); // arranca la lectura 1
  pw.resolve(); await settle(); // arranca la lectura 2 (la que manda)
  assert.equal(loads.length, 3);
  loads[2].resolve({ ...profile, username: 'Segunda' }); await settle();
  assert.match(root.innerHTML, /Segunda/);
  loads[1].resolve({ ...profile, username: 'Primera' }); await settle();
  assert.match(root.innerHTML, /Segunda/);
  assert.doesNotMatch(root.innerHTML, /Primera/);
  screen.destroy();
});

test('account/perfil: account.load() que rechaza cae al perfil en caché; sin perfil sale el error con Reintentar', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, account } = makeCtx(env);
  account.load = async () => { throw new Error('red'); };
  const screen = await mountProfile(root, ctx);
  await settle();
  assert.match(root.innerHTML, /Ana_1/);
  screen.destroy();
  const root2 = fakeNode(env);
  const c2 = makeCtx(env);
  c2.account.load = async () => { throw new Error('red'); };
  c2.account.profile = null;
  const s2 = await mountProfile(root2, c2.ctx);
  await settle();
  assert.match(root2.innerHTML, /No se pudo cargar tu cuenta/);
  assert.match(root2.innerHTML, /data-retry/);
  s2.destroy();
});

test('account/avatar: icono, quitar, archivos rechazados, imagen válida, lectura fallida, cerrar y Listo', async () => {
  const env = fakeEnv();
  const ov = fakeOverlay(env);
  const log = { icon: [], clear: 0, image: [], done: 0 };
  const doc = { createElement: () => ov, body: { append() {} } };
  const scope = createScope({ win: env.win, doc, timers: env.timers });
  const img = defer();
  const ctx = {
    icon: (n) => `<i data-i="${n}"></i>`,
    avatar: { get: () => ({ icon: 'golf' }), setIcon: (i) => log.icon.push(i), clear: () => { log.clear++; }, setImage: (v) => log.image.push(v) },
    imageToAvatar: (f) => reader(f),
  };
  let reader = () => img.p;
  openAvatarEditor(ctx, { scope, frame: null, initial: 'A', done: () => { log.done++; } });
  ov.icons[1].emit('click');
  assert.deepEqual(log.icon, ['ball']);
  ov.get('.ae-clear').emit('click');
  assert.equal(log.clear, 1);
  const file = ov.get('.ae-file'), msg = ov.get('.ae-msg');
  const pick = async (f) => { file.files = [f]; file.emit('change'); await settle(); };
  await pick({ type: 'image/gif', size: 10 });
  assert.equal(msg.textContent, 'Usa una imagen PNG, JPG o WebP.');
  assert.equal(msg.classList.contains('err'), true);
  await pick({ type: 'image/png', size: 3 * 1024 * 1024 });
  assert.equal(msg.textContent, 'La imagen pesa más de 2,5 MB.');
  assert.deepEqual(log.image, []);
  const p = pick({ type: 'image/png', size: 100 });
  img.resolve({ image: 'data:image/png;base64,AA' });
  await p;
  assert.deepEqual(log.image, [{ image: 'data:image/png;base64,AA' }]);
  assert.equal(msg.classList.contains('err'), false);
  reader = () => Promise.reject(new Error('x'));
  await pick({ type: 'image/webp', size: 5 });
  assert.equal(msg.textContent, 'No se ha podido leer esa imagen.');
  ov.get('.ae-done').emit('click');
  assert.equal(log.done, 1);
  assert.equal(ov.removed, 1);
  scope.dispose();
  assert.deepEqual(scope.live(), { listeners: 0, timers: 0, subs: 0 });
});

test('account/avatar: una imagen que termina de leerse DESPUÉS de cerrar no cambia el avatar', async () => {
  const env = fakeEnv();
  const ov = fakeOverlay(env);
  const doc = { createElement: () => ov, body: { append() {} } };
  const scope = createScope({ win: env.win, doc, timers: env.timers });
  const img = defer();
  const setImage = [];
  const ctx = { icon: () => '', avatar: { get: () => ({}), setIcon() {}, clear() {}, setImage: (v) => setImage.push(v) }, imageToAvatar: () => img.p };
  openAvatarEditor(ctx, { scope, frame: null, initial: 'A', done() {} });
  const file = ov.get('.ae-file');
  file.files = [{ type: 'image/png', size: 5 }];
  file.emit('change');
  ov.get('.ae-done').emit('click');
  img.resolve({ image: 'x' });
  await settle();
  assert.deepEqual(setImage, []);
  scope.dispose();
});

test('account/perfil: Listo en el editor de avatar repinta el perfil', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const ov = fakeOverlay(env);
  const { ctx, calls } = makeCtx(env);
  ctx.scope = createScope({ win: env.win, doc: { createElement: () => ov, body: { append() {} } }, timers: env.timers });
  const screen = await mountProfile(root, ctx);
  await settle();
  root.querySelector('[data-edit-avatar="1"]').emit('click');
  const before = calls.levelReads;
  ov.get('.ae-done').emit('click');
  assert.ok(calls.levelReads > before, 'repintó el perfil');
  assert.match(root.innerHTML, /Ana_1/);
  screen.destroy();
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
});

test('account/perfil: la carga no bloquea; tras el tope sale Reintentar y se recupera; la lectura vieja no pisa a la nueva', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, account, profile } = makeCtx(env);
  const pending = [];
  let hang = true;
  account.load = () => (hang ? new Promise((r) => pending.push(r)) : Promise.resolve({ ...profile, username: 'Nueva' }));
  const screen = await mountProfile(root, ctx); // no espera a la red
  assert.match(root.innerHTML, /Cargando/);
  env.timers.advance(8000); await settle();
  assert.match(root.innerHTML, /No se pudo cargar tu cuenta/);
  assert.match(root.innerHTML, /Reintentar/);
  hang = false;
  root.querySelector('[data-retry]').emit('click'); await settle();
  assert.match(root.innerHTML, /Nueva/);
  pending[0]({ ...profile, username: 'Vieja' }); await settle(); // respuesta tardía de la primera lectura
  assert.match(root.innerHTML, /Nueva/);
  assert.doesNotMatch(root.innerHTML, /Vieja/);
  screen.destroy();
});

test('account/perfil: destroy durante la carga no pinta después y no deja nada vivo', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, account, profile } = makeCtx(env);
  let resolve;
  account.load = () => new Promise((r) => { resolve = r; });
  const screen = await mountProfile(root, ctx);
  const alive = ctx.scope.live();
  assert.ok(alive.timers > 0, 'había un temporizador de red vivo');
  screen.destroy();
  resolve({ ...profile });
  await settle();
  assert.doesNotMatch(root.innerHTML, /Ana_1/);
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
});

test('account/perfil: el editor de avatar se retira al salir y no deja nada vivo', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const overlay = env.el('div');
  let removed = 0, appended = 0;
  overlay.remove = () => { removed++; };
  const doc = { createElement: () => overlay, body: { append: () => { appended++; } } };
  const { ctx } = makeCtx(env);
  ctx.scope = createScope({ win: env.win, doc, timers: env.timers });
  const screen = await mountProfile(root, ctx);
  await settle();
  root.querySelector('[data-edit-avatar="1"]').emit('click');
  assert.ok(appended >= 1); // el nodo falso une los dos botones de avatar en uno
  const alive = ctx.scope.live();
  assert.ok(alive.listeners > 0, 'había listeners vivos');
  screen.destroy();
  assert.ok(removed >= 1);
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
});

test('account/perfil: 20 montajes y destroy no dejan listeners, temporizadores ni suscripciones', async () => {
  const env = fakeEnv();
  const { ctx } = makeCtx(env);
  for (let i = 0; i < 20; i++) {
    const root = fakeNode(env);
    const screen = await mountProfile(root, ctx);
    await settle();
    fillPw(root, PASS.cur, PASS.next);
    if (i === 0) assert.ok(ctx.scope.live().listeners > 0, 'había algo vivo antes de destruir');
    screen.destroy();
    assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  }
  assert.equal(env.liveListeners(), 0);
  assert.equal(env.liveTimers(), 0);
});

// ---------- la pantalla Cuenta y sus pestañas ----------
const MODS = {
  './account/profile.js': () => import('../src/screens/account/profile.js'),
};

test('account: cabecera con Volver, pestañas y Perfil por defecto; las claves raras caen en Perfil', async () => {
  for (const params of [{}, undefined, { tab: 'perfil' }, { tab: 'raro' }, { tab: '__proto__' }]) {
    const env = fakeEnv();
    const root = fakeNode(env);
    const { ctx, calls } = makeCtx(env);
    const screen = await mountAccount(root, ctx, params, { modules: MODS });
    await settle();
    assert.match(root.innerHTML, /Cuenta/);
    assert.match(root.innerHTML, /data-back/);
    assert.match(root.innerHTML, /data-acc-tab="perfil" class="on"/);
    assert.doesNotMatch(root.innerHTML, /Monedero/);
    assert.match(root.innerHTML, /Progreso/);
    assert.match(root.querySelector('[data-acc-body]').innerHTML, /Ana_1/);
    root.querySelector('[data-back]').emit('click');
    assert.equal(calls.back, 1);
    screen.destroy();
    assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  }
});

test('account: las pestañas cambian la ruta con replace; la actual no hace nada', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx, calls } = makeCtx(env);
  const screen = await mountAccount(root, ctx, {}, { modules: MODS });
  await settle();
  root.querySelector('[data-acc-tab="perfil"]').emit('click');
  root.querySelector('[data-acc-tab="progreso"]').emit('click');
  assert.deepEqual(calls.replace, [['account', { tab: 'progreso' }]]);
  screen.destroy();
});

test('account: Progreso sin archivo muestra «En construcción»; #/cuenta/monedero antiguo muestra Perfil (sin pestaña Monedero)', async () => {
  {
    const env = fakeEnv();
    const root = fakeNode(env);
    const { ctx } = makeCtx(env);
    const screen = await mountAccount(root, ctx, { tab: 'progreso' }, { modules: MODS });
    await settle();
    assert.match(root.innerHTML, /data-acc-tab="progreso" class="on"/);
    assert.match(root.querySelector('[data-acc-body]').innerHTML, /Esta pantalla llegará pronto\./);
    screen.destroy();
  }
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env);
  const screen = await mountAccount(root, ctx, { tab: 'monedero' }, { modules: MODS });
  await settle();
  assert.doesNotMatch(root.innerHTML, /data-acc-tab="monedero"/);
  assert.match(root.innerHTML, /data-acc-tab="perfil" class="on"/);
  screen.destroy();
});

test('account: una pestaña que existe se carga por convención y recibe un scope que se libera', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env);
  let destroyed = 0, got = null;
  const modules = { './account/progress.js': async () => ({ mount: (el, c, p) => { got = { el, c, p }; c.scope.on(env.win, 'resize', () => {}); return { destroy() { destroyed++; } }; } }) };
  const screen = await mountAccount(root, ctx, { tab: 'progreso' }, { modules });
  await settle();
  assert.equal(got.p.tab, 'progreso');
  assert.ok(ctx.scope.live().listeners > 0, 'había algo vivo antes de destruir');
  screen.destroy();
  assert.equal(destroyed, 1);
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
});

test('account: el montaje no espera a la red; sin respuesta sale Reintentar y destroy durante la carga no pinta', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env);
  let release;
  const modules = { './account/profile.js': () => new Promise((r) => { release = r; }) };
  const screen = await mountAccount(root, ctx, {}, { modules }); // vuelve enseguida
  assert.match(root.querySelector('[data-acc-body]').innerHTML, /Cargando/);
  env.timers.advance(8000); await settle();
  assert.match(root.querySelector('[data-acc-body]').innerHTML, /Reintentar/);
  screen.destroy();
  release(await import('../src/screens/account/profile.js'));
  await settle();
  assert.doesNotMatch(root.querySelector('[data-acc-body]').innerHTML, /Ana_1/);
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
});

test('account: 20 montajes y destroy sin fugas', async () => {
  const env = fakeEnv();
  const { ctx } = makeCtx(env);
  for (let i = 0; i < 20; i++) {
    const root = fakeNode(env);
    const screen = await mountAccount(root, ctx, { tab: i % 2 ? 'perfil' : 'progreso' }, { modules: MODS });
    await settle();
    if (i === 1) assert.ok(ctx.scope.live().listeners > 0, 'había algo vivo antes de destruir');
    screen.destroy();
    assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  }
  assert.equal(env.liveListeners(), 0);
  assert.equal(env.liveTimers(), 0);
});

test('account: sin Vite el glob no existe; en el build lo resuelve con nombres literales', () => {
  assert.throws(() => tabModules());
  const src = readFileSync(new URL('../src/screens/account.js', import.meta.url), 'utf8');
  assert.match(src, /import\.meta\.glob\(\['\.\/account\/profile\.js', '\.\/account\/progress\.js'\]\)/);
});

test('account: Reintentar de la pestaña tras un fallo de carga, y un mount que lanza deja error sin fugas', async () => {
  const env = fakeEnv();
  const root = fakeNode(env);
  const { ctx } = makeCtx(env);
  let n = 0;
  const modules = { './account/profile.js': async () => { if (n++ === 0) throw new Error('chunk'); return import('../src/screens/account/profile.js'); } };
  const screen = await mountAccount(root, ctx, {}, { modules });
  await settle();
  const body = () => root.querySelector('[data-acc-body]');
  assert.match(body().innerHTML, /No se pudo cargar tu cuenta/);
  body().querySelector('[data-retry]').emit('click'); await settle();
  assert.match(body().innerHTML, /Ana_1/);
  screen.destroy();
  assert.deepEqual(ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
  const root2 = fakeNode(env);
  const c2 = makeCtx(env);
  const s2 = await mountAccount(root2, c2.ctx, {}, { modules: { './account/profile.js': async () => ({ mount() { throw new Error('boom'); } }) } });
  await settle();
  assert.match(root2.querySelector('[data-acc-body]').innerHTML, /Reintentar/);
  s2.destroy();
  assert.deepEqual(c2.ctx.scope.live(), { listeners: 0, timers: 0, subs: 0 });
});
