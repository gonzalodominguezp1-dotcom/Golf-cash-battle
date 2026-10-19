import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../backend/supabase.js';
import './admin.css';

/**
 * Panel de administración. Se entra con la misma cuenta de email del juego;
 * quién es admin lo decide el servidor (tabla admins), así que esta página
 * solo enseña lo que devuelven las funciones admin_*.
 */

const db = createClient(SUPABASE_URL, SUPABASE_KEY);
const root = document.getElementById('admin');
const here = () => location.href.split('#')[0].split('?')[0];

const TABS = [
  ['overview', 'Resumen'],
  ['players', 'Cuentas'],
  ['held', 'Premios'],
  ['tournaments', 'Torneos'],
  ['log', 'Registro'],
];
const FLAGS = {
  duplicate_identity: 'Identidad repetida',
  instant_shots: 'Tira al instante',
  robotic_timing: 'Ritmo de robot',
  no_gesture: 'Sin gesto del dedo',
  robotic_gesture: 'Gesto siempre igual',
  too_accurate: 'Demasiado preciso',
  too_many_aces: 'Demasiados hoyos en uno',
};
const RISK = { ok: 'Normal', review: 'En revisión', cleared: 'Limpia', blocked: 'Bloqueada' };
const T_STATUS = { open: 'Abierto', settled: 'Repartido', cancelled: 'Cancelado' };

let state = { tab: 'overview', filter: 'review', heldFilter: 'held', tFilter: 'all', search: '', email: '' };

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => `${Number(n ?? 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (d) => (d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const who = (p) => esc(p.username || p.email || p.email_target || `${String(p.id ?? p.user_id).slice(0, 8)}…`);

async function rpc(fn, args) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

function toast(msg, bad = false) {
  const el = document.createElement('div');
  el.className = `a-toast${bad ? ' bad' : ''}`;
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
}

// ---------- entrada ----------

async function start() {
  const {
    data: { session },
  } = await db.auth.getSession();
  if (!session || session.user.is_anonymous) return renderLogin();
  let ok = false;
  try {
    ok = await rpc('admin_check');
  } catch (e) {
    return renderMessage(`No se pudo conectar con el servidor (${esc(e.message)}).`, true);
  }
  if (!ok) {
    return renderMessage(
      `La cuenta <b>${esc(session.user.email)}</b> no tiene acceso de administrador.`,
      true,
    );
  }
  renderShell(session.user.email);
}

function renderMessage(html, withSignOut) {
  root.innerHTML = `
    <div class="a-center">
      <h1>Admin</h1>
      <p>${html}</p>
      ${withSignOut ? '<button class="a-btn" data-signout>Entrar con otra cuenta</button>' : ''}
      <a class="a-link" href="./">Volver al juego</a>
    </div>`;
  root.querySelector('[data-signout]')?.addEventListener('click', signOut);
}

function renderLogin(step = 'email', error = '') {
  root.innerHTML = `
    <form class="a-center" id="login">
      <h1>Admin</h1>
      ${
        step === 'email'
          ? `<p>Entra con el email de tu cuenta del juego. Te llegará un código o un enlace.</p>
             <input class="a-input" type="email" name="email" placeholder="tu@email.com" autocomplete="email" required value="${esc(state.email)}" />
             <button class="a-btn" type="submit">Enviar código</button>`
          : `<p>Mira tu correo (<b>${esc(state.email)}</b>). Pulsa el enlace o escribe el código.</p>
             <input class="a-input" name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" required />
             <button class="a-btn" type="submit">Entrar</button>
             <button class="a-link" type="button" data-back>Cambiar email</button>`
      }
      ${error ? `<p class="a-error">${esc(error)}</p>` : ''}
      <a class="a-link" href="./">Volver al juego</a>
    </form>`;
  const form = root.querySelector('#login');
  root.querySelector('[data-back]')?.addEventListener('click', () => renderLogin('email'));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    if (step === 'email') {
      state.email = form.email.value.trim().toLowerCase();
      const { error } = await db.auth.signInWithOtp({
        email: state.email,
        options: { shouldCreateUser: false, emailRedirectTo: here() },
      });
      if (error) {
        const msg = /signups not allowed|not found/i.test(error.message)
          ? 'No hay ninguna cuenta con ese email. Créala primero en el juego (pestaña Cuenta).'
          : /rate|seconds/i.test(error.message)
            ? 'Espera un momento antes de pedir otro código.'
            : error.message;
        return renderLogin('email', msg);
      }
      renderLogin('code');
    } else {
      const { error } = await db.auth.verifyOtp({ email: state.email, token: form.code.value.trim(), type: 'email' });
      if (error) return renderLogin('code', 'Código incorrecto o caducado.');
      start();
    }
  });
}

async function signOut() {
  await db.auth.signOut();
  renderLogin();
}

db.auth.onAuthStateChange((event) => {
  // al volver del enlace del email
  if (event === 'SIGNED_IN' && root.querySelector('#login')) start();
});

// ---------- panel ----------

function renderShell(email) {
  root.innerHTML = `
    <header class="a-top">
      <div><b>Admin</b><small>${esc(email)}</small></div>
      <div class="a-top-actions">
        <button class="a-chip" data-refresh title="Recargar">↻</button>
        <button class="a-chip" data-signout>Salir</button>
      </div>
    </header>
    <nav class="a-tabs">${TABS.map(([id, label]) => `<button data-tab="${id}">${label}</button>`).join('')}</nav>
    <main id="view"></main>`;
  root.querySelector('[data-signout]').addEventListener('click', signOut);
  root.querySelector('[data-refresh]').addEventListener('click', () => show());
  root.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      state.tab = b.dataset.tab;
      show();
    }),
  );
  show();
}

async function show() {
  root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.tab));
  const view = root.querySelector('#view');
  view.innerHTML = '<p class="a-muted">Cargando…</p>';
  try {
    await VIEWS[state.tab](view);
  } catch (e) {
    view.innerHTML = `<p class="a-error">Error: ${esc(e.message)}</p>`;
  }
}

const VIEWS = {
  async overview(view) {
    const o = await rpc('admin_overview');
    const tile = (label, value, tab) =>
      `<button class="a-tile" ${tab ? `data-go="${tab}"` : 'disabled'}><span>${label}</span><b>${value}</b></button>`;
    view.innerHTML = `
      <h2>Comisión</h2>
      <div class="a-grid">
        ${tile('Hoy', money(o.commission_today))}
        ${tile('7 días', money(o.commission_7d))}
        ${tile('Total', money(o.commission_total), 'tournaments')}
      </div>
      <h2>Pendiente de revisar</h2>
      <div class="a-grid">
        ${tile('Cuentas en revisión', o.in_review, 'players')}
        ${tile('Premios retenidos', `${o.held_count} · ${money(o.held_amount)}`, 'held')}
        ${tile('Bloqueadas', o.blocked, 'players')}
      </div>
      <h2>Juego</h2>
      <div class="a-grid">
        ${tile('Torneos abiertos', o.tournaments_open, 'tournaments')}
        ${tile('Jugando ahora', o.players_playing)}
        ${tile('Torneos repartidos', o.tournaments_settled, 'tournaments')}
        ${tile('Usuarios', o.users)}
        ${tile('Con email', o.accounts)}
        ${tile('Identidad verificada', o.verified)}
        ${tile('Saldo de jugadores', money(o.balances))}
        ${tile('Depósitos', money(o.deposits))}
      </div>`;
    view.querySelectorAll('[data-go]').forEach((b) =>
      b.addEventListener('click', () => {
        state.tab = b.dataset.go;
        if (b.dataset.go === 'players') state.filter = /Bloq/.test(b.textContent) ? 'blocked' : 'review';
        show();
      }),
    );
  },

  async players(view) {
    const list = await rpc('admin_players', { p_status: state.filter, p_search: state.search || null });
    view.innerHTML = `
      ${filters('filter', [['review', 'En revisión'], ['blocked', 'Bloqueadas'], ['cleared', 'Limpias'], ['all', 'Todas']])}
      <form class="a-search" id="search"><input class="a-input" name="q" placeholder="Buscar email, nombre o id" value="${esc(state.search)}" /></form>
      ${list.length ? '' : '<p class="a-muted">No hay cuentas aquí.</p>'}
      <div class="a-list">${list.map(playerCard).join('')}</div>`;
    bindFilters(view);
    view.querySelector('#search').addEventListener('submit', (ev) => {
      ev.preventDefault();
      state.search = ev.target.q.value.trim();
      show();
    });
    view.querySelectorAll('[data-review]').forEach((b) =>
      b.addEventListener('click', async () => {
        const [id, status] = b.dataset.review.split(':');
        const labels = { cleared: 'marcar como LIMPIA y liberar sus premios', blocked: 'BLOQUEAR y anular sus premios retenidos', review: 'devolver a revisión' };
        const note = prompt(`¿Seguro que quieres ${labels[status]}?\nNota (opcional):`, '');
        if (note === null) return;
        b.disabled = true;
        try {
          await rpc('admin_review', { p_user: id, p_status: status, p_note: note || null });
          toast('Hecho');
          show();
        } catch (e) {
          b.disabled = false;
          toast(e.message, true);
        }
      }),
    );
    view.querySelectorAll('[data-detail]').forEach((b) =>
      b.addEventListener('click', async () => {
        const box = view.querySelector(`[data-detail-box="${b.dataset.detail}"]`);
        if (box.innerHTML) return (box.innerHTML = '');
        box.innerHTML = '<p class="a-muted">Cargando…</p>';
        try {
          box.innerHTML = playerDetail(await rpc('admin_player', { p_user: b.dataset.detail }));
        } catch (e) {
          box.innerHTML = `<p class="a-error">${esc(e.message)}</p>`;
        }
      }),
    );
  },

  async held(view) {
    const list = await rpc('admin_held', { p_status: state.heldFilter });
    view.innerHTML = `
      ${filters('heldFilter', [['held', 'Retenidos'], ['released', 'Liberados'], ['void', 'Anulados'], ['all', 'Todos']])}
      ${list.length ? '' : '<p class="a-muted">No hay premios aquí.</p>'}
      <div class="a-list">${list
        .map(
          (h) => `
        <div class="a-card">
          <div class="a-row"><b>${money(h.amount)}</b><span class="a-badge s-${esc(h.status)}">${{ held: 'Retenido', released: 'Liberado', void: 'Anulado' }[h.status] ?? esc(h.status)}</span></div>
          <div>${who(h)} <span class="a-badge s-${esc(h.risk)}">${RISK[h.risk] ?? esc(h.risk)}</span></div>
          <small class="a-muted">${esc(h.note)} · ${when(h.created_at)}${h.resolved_at ? ` → ${when(h.resolved_at)}` : ''}</small>
          ${
            h.status === 'held'
              ? `<div class="a-actions">
                  <button class="a-btn ok" data-payout="${h.id}:release">Liberar</button>
                  <button class="a-btn bad" data-payout="${h.id}:void">Anular</button>
                 </div>`
              : ''
          }
        </div>`,
        )
        .join('')}</div>`;
    bindFilters(view);
    view.querySelectorAll('[data-payout]').forEach((b) =>
      b.addEventListener('click', async () => {
        const [id, action] = b.dataset.payout.split(':');
        if (!confirm(action === 'release' ? '¿Pasar este premio al saldo del jugador?' : '¿Anular este premio? No se puede deshacer.')) return;
        b.disabled = true;
        try {
          await rpc('admin_resolve_payout', { p_id: id, p_action: action });
          toast(action === 'release' ? 'Premio liberado' : 'Premio anulado');
          show();
        } catch (e) {
          b.disabled = false;
          toast(e.message, true);
        }
      }),
    );
  },

  async tournaments(view) {
    const list = await rpc('admin_tournaments', { p_status: state.tFilter, p_limit: 100 });
    const total = list.reduce((s, t) => s + Number(t.commission || 0), 0);
    view.innerHTML = `
      ${filters('tFilter', [['all', 'Todos'], ['open', 'Abiertos'], ['settled', 'Repartidos'], ['cancelled', 'Cancelados']])}
      <p class="a-muted">${list.length} torneos · comisión de estos: <b>${money(total)}</b></p>
      ${list.length ? '' : '<p class="a-muted">Todavía no hay torneos.</p>'}
      <div class="a-list">${list
        .map(
          (t) => `
        <div class="a-card">
          <div class="a-row"><b>${esc(t.tier_id)} · ${money(t.entry_fee)}</b><span class="a-badge t-${esc(t.status)}">${T_STATUS[t.status] ?? esc(t.status)}</span></div>
          <div class="a-kv">
            <span>Jugadores</span><b>${t.players}/${t.seats} (${t.finished} terminados)</b>
            <span>Bote</span><b>${money(t.pot)}</b>
            <span>Comisión</span><b>${money(t.commission)}</b>
            <span>Premio</span><b>${money(t.prize)}</b>
            ${t.winners ? `<span>Ganador</span><b>${esc(t.winners)}</b>` : ''}
          </div>
          <small class="a-muted">Creado ${when(t.created_at)} · ${t.settled_at ? `repartido ${when(t.settled_at)}` : `cierra ${when(t.closes_at)}`}</small>
        </div>`,
        )
        .join('')}</div>`;
    bindFilters(view);
  },

  async log(view) {
    const list = await rpc('admin_log', { p_limit: 100 });
    const ACTIONS = {
      'review:cleared': 'Marcó limpia',
      'review:blocked': 'Bloqueó',
      'review:review': 'Devolvió a revisión',
      'payout:release': 'Liberó premio',
      'payout:void': 'Anuló premio',
    };
    view.innerHTML = list.length
      ? `<div class="a-list">${list
          .map(
            (a) => `
          <div class="a-card">
            <div class="a-row"><b>${ACTIONS[a.action] ?? esc(a.action)}</b><small class="a-muted">${when(a.created_at)}</small></div>
            <div>${esc(a.target_name || a.target_email || a.target)}${a.note ? ` · ${esc(a.note)}` : ''}</div>
            <small class="a-muted">por ${esc(a.admin)}</small>
          </div>`,
          )
          .join('')}</div>`
      : '<p class="a-muted">Aún no se ha hecho nada desde el panel.</p>';
  },
};

function filters(key, options) {
  return `<div class="a-filters">${options
    .map(([v, l]) => `<button class="a-chip${state[key] === v ? ' on' : ''}" data-filter="${key}:${v}">${l}</button>`)
    .join('')}</div>`;
}

function bindFilters(view) {
  view.querySelectorAll('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      const [key, v] = b.dataset.filter.split(':');
      state[key] = v;
      show();
    }),
  );
}

function playerCard(p) {
  const flags = (p.flags ?? []).map((f) => `<span class="a-flag">${esc(FLAGS[f] ?? f)}</span>`).join('');
  const actions = [
    p.status !== 'cleared' && `<button class="a-btn ok" data-review="${p.id}:cleared">Es real · liberar</button>`,
    p.status !== 'blocked' && `<button class="a-btn bad" data-review="${p.id}:blocked">Bloquear</button>`,
    p.status !== 'review' && `<button class="a-btn" data-review="${p.id}:review">A revisión</button>`,
  ]
    .filter(Boolean)
    .join('');
  return `
    <div class="a-card">
      <div class="a-row"><b>${who(p)}</b><span class="a-badge s-${esc(p.status)}">${RISK[p.status] ?? esc(p.status)}</span></div>
      ${p.username && p.email ? `<small class="a-muted">${esc(p.email)}</small>` : ''}
      <div class="a-flags">${flags || '<span class="a-muted">Sin motivos</span>'}</div>
      <div class="a-kv">
        <span>Nota de riesgo</span><b>${Number(p.score ?? 0).toFixed(2)}</b>
        <span>Retenido</span><b>${money(p.held)}</b>
        <span>Saldo</span><b>${money(p.balance)}</b>
        <span>Torneos / ganados</span><b>${p.tournaments} / ${p.wins}</b>
        <span>Identidad</span><b>${esc({ none: 'Sin verificar', pending: 'Pendiente', verified: 'Verificada', rejected: 'Rechazada' }[p.kyc_status] ?? p.kyc_status ?? '—')}</b>
      </div>
      ${p.note ? `<small class="a-muted">Nota: ${esc(p.note)}</small>` : ''}
      <small class="a-muted">Marcada ${when(p.updated_at)}${p.reviewed_at ? ` · revisada ${when(p.reviewed_at)}` : ''}</small>
      <div class="a-actions">${actions}<button class="a-btn ghost" data-detail="${p.id}">Ver jugadas</button></div>
      <div data-detail-box="${p.id}"></div>
    </div>`;
}

function playerDetail(d) {
  const arr = (a) => (a ?? []).join(' ');
  return `
    <div class="a-detail">
      <h3>Últimos torneos</h3>
      ${
        d.entries.length
          ? d.entries
              .map(
                (e) =>
                  `<div class="a-row"><span>${esc(e.tier_id)} · ${when(e.joined_at)}</span><b>${e.position ? `${e.position}º` : '—'} · ${e.total} golpes${Number(e.payout) ? ` · ${money(e.payout)}` : ''}</b></div>`,
              )
              .join('')
          : '<p class="a-muted">Ninguno.</p>'
      }
      <h3>Señales por hoyo</h3>
      <p class="a-muted">Espera = pasos parado antes de cada golpe; dedo = pasos arrastrando; giros = correcciones al apuntar.</p>
      ${
        d.signals.length
          ? d.signals
              .map(
                (s) =>
                  `<div class="a-sig"><b>Hoyo ${s.course < 0 ? 'desempate' : s.course + 1} · ${s.strokes} golpes</b>
                   <small>espera ${esc(arr(s.waits))} · dedo ${esc(arr(s.drags))} · giros ${esc(arr(s.turns))}</small></div>`,
              )
              .join('')
          : '<p class="a-muted">Sin datos.</p>'
      }
    </div>`;
}

start();
