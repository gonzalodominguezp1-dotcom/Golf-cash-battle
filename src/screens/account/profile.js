// Cuenta › Perfil (T034): lo que showAccount pintaba en main.js (perfil, marco, email, contraseña, identidad, sesión).
// Movido casi tal cual: la validación, los mensajes y las llamadas a la cuenta no cambian. Seguridad:
// los campos de contraseña son type="password", se vacían al enviar y al salir, y ni contraseñas ni datos
// personales van a consola, URL, storage ni a t(). Todo dato de usuario pasa por esc().
import { authMessage, validatePassword } from '../../account/authRules.js';
import { FRAMES, frameStyle } from '../../progress/prestige.js';
import { CHALLENGES, SKINS } from '../../progress/skins.js';
import { openAvatarEditor } from '../avatarEditor.js';
import { listState } from '../components.js';
import { computeLocks } from '../hubRules.js';
import { avatarHtml, coin, esc } from '../shared.js';
import { t } from '../texts/index.js';
import '../texts/common.js';
import '../texts/hub.js';
import '../texts/account.js';

const NET_TIMEOUT_MS = 8000; // una red que no responde no deja la pantalla colgada: error con Reintentar
// TEMPORAL: verificación de identidad desactivada (ver migración 20261106120000)
const KYC_DISABLED = true;
const KYC_KEYS = { none: 'account.kycNone', pending: 'account.kycPending', verified: 'account.kycVerified', rejected: 'account.kycRejected' };
const KYC_REASONS = { underage: 'account.kycUnderage', duplicate_identity: 'account.kycDuplicate', provider_declined: 'account.kycDeclined', missing_data: 'account.kycMissing' };

export function mount(el, ctx) {
  const { backend, progress, avatar, router } = ctx;
  const scope = ctx.scope.child(); // todo lo del perfil cuelga de aquí
  const icon = (n, o = {}) => ctx.icon(n, o);
  const account = backend?.account;
  const kycOff = ctx.kycDisabled ?? KYC_DISABLED;
  let gone = false, run = 0, sc = null, editor = null;

  const timed = (promise) => new Promise((resolve, reject) => {
    const cancel = scope.timeout(() => reject(new Error('timeout')), NET_TIMEOUT_MS);
    Promise.resolve(promise).then((v) => { cancel(); resolve(v); }, (e) => { cancel(); reject(e); });
  });

  // vacía los tres campos de contraseña (al enviar, al fallar y al salir)
  const clearPw = () => {
    for (const k of ['current', 'next', 'again']) {
      const f = el.querySelector('[data-pw-box]')?.querySelector(`[data-pw-${k}]`);
      if (f) f.value = '';
    }
  };

  function paintState(state) {
    sc?.dispose();
    sc = scope.child();
    listState(el, { state, errorText: t('account.loadError'), onRetry: () => load(), scope: sc });
  }

  async function load(note = '') {
    const my = ++run;
    paintState('loading');
    let p;
    try {
      p = await timed(account.load().catch(() => account.profile));
      if (!p) throw new Error('no_profile');
    } catch { if (my === run && !gone) paintState('error'); return; }
    if (my !== run || gone) return;
    paint(p, note);
  }

  function passwordForm(box) {
    const pw = (label, key, ac) => `<label>${esc(label)}<input type="password" name="${key}" data-pw-${key}="1" required autocomplete="${ac}" maxlength="72" autocapitalize="off" spellcheck="false"></label>`;
    box.innerHTML = `
    <form class="form" data-pw-form="1">
      ${pw(t('account.pwCurrent'), 'current', 'current-password')}
      ${pw(t('account.pwNext'), 'next', 'new-password')}
      ${pw(t('account.pwAgain'), 'again', 'new-password')}
      <p class="sub">${esc(t('account.pwHint'))}</p>
      <p class="auth-error" role="alert" data-pw-error="1"></p>
      <button class="primary" data-pw-submit="1">${esc(t('account.pwSave'))}</button>
    </form>`;
    const q = (s) => box.querySelector(s);
    const error = q('[data-pw-error]');
    sc.on(q('[data-pw-form]'), 'submit', async (e) => {
      e.preventDefault?.();
      const btn = q('[data-pw-submit]');
      error.textContent = '';
      const cur = q('[data-pw-current]').value, next = q('[data-pw-next]').value, again = q('[data-pw-again]').value;
      const bad = validatePassword(next) ?? (next !== again ? 'password_mismatch' : null);
      if (bad) return void (error.textContent = authMessage(bad)); // no se envió nada: los campos se conservan
      clearPw(); // enviada: los valores solo quedan en estas variables locales
      btn.disabled = true;
      try {
        await account.changePassword(cur, next);
        if (!gone) load(t('account.pwDone'));
      } catch (err) {
        clearPw();
        if (gone) return;
        btn.disabled = false;
        error.textContent = authMessage(err?.code);
      }
    });
  }

  function renameForm(box, current) {
    box.innerHTML = `
    <form class="form" data-rename-form="1">
      <input name="name" data-rename-input="1" maxlength="16" autocomplete="nickname" value="${esc(current)}" placeholder="${esc(t('account.renamePlaceholder'))}">
      <p class="auth-error" role="alert" data-rename-error="1"></p>
      <button class="primary">${esc(t('account.renameSave'))}</button>
    </form>`;
    const input = box.querySelector('[data-rename-input]');
    sc.on(box.querySelector('[data-rename-form]'), 'submit', async (e) => {
      e.preventDefault?.();
      try {
        await account.setUsername(input.value.trim());
        if (!gone) load(t('account.renamed'));
      } catch (err) {
        if (gone) return;
        box.querySelector('[data-rename-error]').textContent = err?.code === 'username_taken' ? t('account.nameTaken') : t('account.nameInvalid');
      }
    });
    input.focus?.();
  }

  // modo pruebas: sin proveedor configurado, se pide fecha y documento a mano
  function kycStubForm(box) {
    box.innerHTML = `
    <form class="form" data-kyc-form="1">
      <p class="sub"><small class="tag">${esc(t('account.kycStubTag'))}</small> ${esc(t('account.kycStubText'))}</p>
      <label>${esc(t('account.kycBirth'))}<input type="date" name="birthdate" data-kyc-birth="1" required></label>
      <label>${esc(t('account.kycDocument'))}<input name="document" data-kyc-doc="1" required minlength="5" maxlength="32" autocomplete="off"></label>
      <p class="auth-error" role="alert" data-kyc-error="1"></p>
      <button class="primary" data-kyc-submit="1">${esc(t('account.kycVerify'))}</button>
    </form>`;
    sc.on(box.querySelector('[data-kyc-form]'), 'submit', async (e) => {
      e.preventDefault?.();
      const btn = box.querySelector('[data-kyc-submit]');
      const birth = box.querySelector('[data-kyc-birth]'), doc = box.querySelector('[data-kyc-doc]');
      btn.disabled = true;
      try {
        await account.stubKyc(birth.value, doc.value);
        doc.value = '';
        if (!gone) load();
      } catch {
        doc.value = '';
        if (gone) return;
        btn.disabled = false;
        box.querySelector('[data-kyc-error]').textContent = t('account.kycStubError');
      }
    });
  }

  function kycHtml(p, confirmed, kyc) {
    if (kycOff) return `<p class="sub">${esc(t('account.kycOff'))}</p>`;
    if (!confirmed) return `<p class="sub">${esc(t('account.kycConfirmFirst'))}</p>`;
    if (kyc === 'verified') return `<p class="field-ok">${esc(t('account.kycDone'))}${p.adult ? esc(t('account.kycAdult')) : ''}</p>`;
    return `
      ${kyc === 'rejected' ? `<p class="sub">${esc(t(KYC_REASONS[p.kyc_reason] ?? KYC_REASONS.provider_declined))}</p>` : ''}
      ${kyc === 'pending' ? `<p class="sub">${esc(t('account.kycWaiting'))}</p>` : ''}
      <p class="auth-error" role="alert" data-kyc-error="1"></p>
      <button class="primary" data-kyc-start="1">${icon('shield')}${esc(t(kyc === 'none' ? 'account.kycStart' : 'account.kycRestart'))}</button>
      <p class="legal">${esc(t('account.kycLegal'))}</p>`;
  }

  function paint(p, note = '') {
    sc?.dispose();
    sc = scope.child();
    const confirmed = Boolean(p.email) && p.email_confirmed && !p.is_anonymous;
    const kyc = KYC_KEYS[p.kyc_status] ? p.kyc_status : 'none';
    const name = p.username ?? t('account.noName');
    const lvl = progress.level;
    const prestige = progress.prestige;
    const unlockedSkins = SKINS.filter((s) => progress.isUnlocked(s)).length;
    const done = CHALLENGES.filter((c) => progress.challenge(c.id).done).length;
    const next = FRAMES.find((f) => f.level > lvl.level);
    const locked = computeLocks({ guest: !!p.is_anonymous, hasBackend: true, hasName: !!p.username }).friends;
    const initial = p.username ? name : '?';
    const frameBtn = (f) => {
      const open = lvl.level >= f.level;
      return `<button type="button" class="frame-opt ${open ? '' : 'locked'} ${prestige.frame?.id === f.id ? 'on' : ''}" data-frame="${esc(f.id)}" ${open ? '' : 'disabled'} style="${frameStyle(f)}" title="${esc(open ? f.name : t('account.frameLevel', { n: f.level }))}">
              ${avatarHtml({ size: 'xs', frame: f, av: avatar.get(), initial: name })}<b>${esc(f.name)}</b><small>${open ? esc(t('account.levelShort', { n: f.level })) : `${icon('lock')} ${esc(t('account.levelShort', { n: f.level }))}`}</small>
            </button>`;
    };
    const framesHtml = FRAMES.map(frameBtn).join('');
    listState(el, { state: 'ready' });
    el.innerHTML = `
      <div class="profile-card passport-card holo">
        <div class="shine"></div>
        <div class="passport-header">
          <button type="button" class="avatar-wrap edit-avatar" data-edit-avatar="1" title="${esc(t('account.avatarChange'))}" aria-label="${esc(t('account.avatarChange'))}">
            ${avatarHtml({ size: 'lg', frame: prestige.frame, av: avatar.get(), initial })}
            <span class="avatar-lvl-badge">${esc(t('account.levelBadge', { n: lvl.level }))}</span>
            <span class="avatar-edit-tag">${esc(t('account.avatarEditTag'))}</span>
          </button>
          <div class="passport-info">
            <div class="passport-tag-row">
              <span class="passport-status ${confirmed ? 'vip' : 'guest'}">${esc(t(confirmed ? 'account.official' : 'account.unconfirmed'))}</span>
              <span class="kyc-mini-pill ${kyc === 'verified' ? 'verified' : ''}">${esc(t(KYC_KEYS[kyc]))}</span>
            </div>
            <strong class="passport-name">${esc(name)}</strong>
            <div class="chip-row"><button type="button" class="chip-btn rename" data-rename="1">${icon('pencil')}${esc(t('account.rename'))}</button><button type="button" class="chip-btn edit-avatar" data-edit-avatar="1">${icon('upload')}${esc(t('account.avatarChange'))}</button></div>
          </div>
        </div>
        <div data-rename-box="1"></div>
        <div class="career-stats-row">
          <div class="stat-pill"><span class="stat-pill-label">${esc(t('account.statLevel'))}</span><span class="stat-pill-val">${esc(t('account.levelShort', { n: lvl.level }))}</span><small class="stat-pill-sub">${esc(t('account.statXp', { into: lvl.into, need: lvl.need }))}</small></div>
          <div class="stat-pill"><span class="stat-pill-label">${esc(t('account.statWins'))}</span><span class="stat-pill-val">${progress.state.wins}</span><small class="stat-pill-sub">${esc(t('account.statMatches', { n: progress.state.matches }))}</small></div>
          <div class="stat-pill"><span class="stat-pill-label">${esc(t('account.statSkins'))}</span><span class="stat-pill-val">${unlockedSkins}/${SKINS.length}</span><small class="stat-pill-sub">${esc(t('account.statCollection'))}</small></div>
          <div class="stat-pill"><span class="stat-pill-label">${esc(t('account.statAchievements'))}</span><span class="stat-pill-val">${done}/${CHALLENGES.length}</span><small class="stat-pill-sub">${esc(t('account.statCompleted'))}</small></div>
        </div>
      </div>
      <div class="account-card-panel frames-panel">
        <div class="panel-head">
          <h2>${esc(t('account.framesTitle'))}</h2>
          <span class="panel-badge ${prestige.frame ? 'verified' : 'pending'}">${prestige.frame ? esc(prestige.frame.name) : esc(t('account.noFrame'))}</span>
        </div>
        <div class="frames">
          ${framesHtml}
        </div>
        <p class="sub">${esc(t('account.framesSub', { next: next ? t('account.nextFrame', { name: next.name, n: next.level }) : t('account.allFrames') }))}</p>
      </div>
      <div class="account-card-panel friends-panel">
        <div class="panel-head"><h2>${esc(t('account.friendsTitle'))}</h2></div>
        ${locked ? `<p class="sub" role="status" data-friends-locked="1">${esc(t(locked.reasonKey))}</p>` : ''}
        <button type="button" class="chip-btn friends-open" data-go="friends"${locked ? ' disabled aria-disabled="true"' : ''}>${icon('users')}${esc(t('account.friendsOpen'))}</button>
      </div>
      ${note ? `<p class="notice" role="status" data-note="1">${esc(note)}</p>` : ''}
      ${p.in_review ? `<p class="offline">${esc(t('account.inReview'))}${p.held > 0 ? t('account.held', { amount: coin(Number(p.held)) }) : ''}</p>` : ''}
      <div class="account-card-panel">
        <div class="panel-head">
          <h2>${esc(t('account.emailTitle'))}</h2>
          <span class="panel-badge ${confirmed ? 'verified' : 'pending'}">${esc(t(confirmed ? 'account.emailConfirmed' : 'account.emailPending'))}</span>
        </div>
        <div class="email-box"><p class="field-ok" data-email="1">${esc(p.email ?? '')}</p>${confirmed ? '' : `<p class="sub">${esc(t('account.emailHint'))}</p>`}<div data-pw-box="1"><button type="button" class="link" data-pw-open="1">${esc(t('account.pwOpen'))}</button></div></div>
      </div>
      <div class="account-card-panel">
        <div class="panel-head">
          <h2>${esc(t('account.kycTitle'))}</h2>
          <span class="panel-badge ${kyc === 'verified' ? 'verified' : ''}">${esc(t(KYC_KEYS[kyc]))}</span>
        </div>
        <div class="kyc-box" data-kyc-box="1">${kycHtml(p, confirmed, kyc)}</div>
      </div>
      <p class="legal">${esc(t('account.legal'))}</p>
      <p class="auth-error" role="alert" data-logout-error="1"></p>
      <button type="button" class="ghost logout" data-logout="1">${icon('logout')}${esc(t('account.logout'))}</button>`;
    bind(p, name, note, !!locked);
  }

  function bind(p, name, note, friendsLocked) {
    for (const b of el.querySelectorAll('[data-edit-avatar]')) {
      sc.on(b, 'click', () => {
        editor?.close();
        editor = openAvatarEditor(ctx, { scope, frame: progress.prestige.frame, initial: p.username ? name : '?', done: () => { if (!gone) paint(p, note); } });
      });
    }
    sc.on(el.querySelector('[data-rename]'), 'click', () => renameForm(el.querySelector('[data-rename-box]'), p.username ?? ''));
    for (const b of el.querySelectorAll('[data-frame]')) {
      if (b.disabled) continue;
      sc.on(b, 'click', () => { if (progress.equipFrame(b.dataset.frame)) paint(p, note); });
    }
    const friends = el.querySelector('[data-go="friends"]');
    if (friends && !friendsLocked) sc.on(friends, 'click', () => router.push('friends'));
    const pwBox = el.querySelector('[data-pw-box]');
    sc.on(el.querySelector('[data-pw-open]'), 'click', () => passwordForm(pwBox));
    const start = el.querySelector('[data-kyc-start]');
    if (start) {
      sc.on(start, 'click', async () => {
        start.disabled = true;
        try {
          const r = await account.startKyc();
          if (typeof r.url === 'string' && r.url.startsWith('https://')) return void (scope.win.location.href = r.url);
          if (r.status === 'verified') return void (gone || load());
          kycStubForm(el.querySelector('[data-kyc-box]'));
        } catch (err) {
          start.disabled = false;
          const box = el.querySelector('[data-kyc-error]');
          if (box) box.textContent = err?.code === 'account_required' ? t('account.kycConfirmFirst') : t('account.kycOpenError');
        }
      });
    }
    const out = el.querySelector('[data-logout]');
    sc.on(out, 'click', async () => {
      out.disabled = true;
      el.querySelector('[data-logout-error]').textContent = '';
      try { await account.signOut(); } catch {
        out.disabled = false;
        if (!gone) el.querySelector('[data-logout-error]').textContent = t('account.logoutError');
      }
    });
  }

  if (!account) {
    listState(el, { state: 'ready' });
    el.innerHTML = `<p class="offline" role="status" data-offline="1">${esc(t('account.offline'))}</p>`;
  } else load();
  return {
    destroy() {
      gone = true;
      run++;
      clearPw();
      const doc = el.querySelector('[data-kyc-box]')?.querySelector('[data-kyc-doc]');
      if (doc) doc.value = ''; // el número de documento tampoco queda en el campo
      editor?.close();
      scope.dispose();
    },
  };
}
