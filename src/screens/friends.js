// Amigos y grupo (T030): el panel de amigos y el de grupo que vivían en main.js, ahora como pantalla del router.
// Los amigos se añaden por nombre de usuario y la otra persona acepta o rechaza. El CSS (friends.css) lo importa el arranque.
import { addedMessage, cleanFriendName, friendMessage } from '../account/friendRules.js';
import { frameById } from '../progress/prestige.js';
import { fromWire } from '../progress/avatar.js';
import { bindHeader, header, listState } from './components.js';
import { computeLocks } from './hubRules.js';
import { mountPartyPanel } from './partyPanel.js';
import { avatarHtml, esc } from './shared.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/hub.js';
import './texts/friends.js';

const NET_TIMEOUT_MS = 8000; // una red que no responde no deja la pantalla colgada: error con Reintentar

export async function mount(root, ctx) {
  const { router, backend } = ctx;
  const scope = ctx.scope.child(); // todo lo de la pantalla cuelga de aquí: destroy lo libera entero
  const icon = (n, o = {}) => ctx.icon(n, o);
  const account = backend?.account;
  let gone = false, run = 0, sc = null, party = null; // sc: scope de lo pintado; party: panel de grupo montado

  // mismos requisitos y mensajes que el hub (accesos bloqueados): invitado, sin nombre de usuario o sin conexión
  const locked = computeLocks({
    guest: !account || !!account.profile?.is_anonymous,
    hasBackend: !!account,
    hasName: !!account?.profile?.username,
  }).friends;

  const timed = (promise) => new Promise((resolve, reject) => {
    const cancel = scope.timeout(() => reject(new Error('timeout')), NET_TIMEOUT_MS);
    Promise.resolve(promise).then((v) => { cancel(); resolve(v); }, (e) => { cancel(); reject(e); });
  });

  function shell(innerHtml) {
    party?.destroy();
    party = null;
    sc?.dispose();
    sc = scope.child();
    root.innerHTML = `<main class="screen friends">${header({ title: t('friends.title') })}<div class="friends-body" data-friends-body="1">${innerHtml}</div></main>`;
    bindHeader(root, { ...ctx, scope: sc });
    return root.querySelector('[data-friends-body]');
  }

  function paintLocked() {
    const body = shell(`<div class="friends-locked"><p class="sub" role="status" data-friends-locked="1">${esc(t(locked.reasonKey))}</p>${locked.actionKey ? `<button type="button" class="chip-btn" data-go="${locked.go}">${icon('user')}${esc(t(locked.actionKey))}</button>` : ''}</div>`);
    for (const btn of body.querySelectorAll('[data-go]')) sc.on(btn, 'click', () => router.push(btn.dataset.go));
  }

  function paintState(state) {
    const body = shell('');
    listState(body, { state, errorText: t('friends.screenLoadError'), onRetry: load, scope: sc });
  }

  // amigos: se añaden por nombre de usuario y la otra persona acepta o rechaza
  function friendsPanel(box, badge, data0) {
    let psc = null, reads = 0; // reads: solo la última lectura pinta; una respuesta vieja tardía no pisa a la nueva
    const paint = (data, msg = '', isErr = false) => {
      psc?.dispose();
      psc = sc.child();
      badge.textContent = `${data.friends.length} ${t(data.friends.length === 1 ? 'friends.one' : 'friends.many')}`;
      const row = (f) => `<li class="friend">
        ${avatarHtml({ size: 'sm', frame: frameById(f.frame), av: fromWire(f.avatar), initial: f.name })}
        <span class="friend-name"><b>${esc(f.name)}</b><small>${esc(t('friends.level', { n: f.level }))}</small></span>
        <button class="chip-btn" data-remove="${esc(f.name)}">${icon('trash')}${esc(t('friends.remove'))}</button>
      </li>`;
      const asks = (list, buttons) => list.map((r) => `<li class="friend">
        <span class="friend-name"><b>${esc(r.name)}</b></span>${buttons(esc(r.name))}
      </li>`).join('');
      box.innerHTML = `
      <form class="friend-add form" data-friend-form="1">
        <div class="row"><input name="name" data-friend-input="1" maxlength="17" placeholder="${esc(t('friends.namePlaceholder'))}" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="primary" data-friend-submit="1">${icon('plus')}${esc(t('friends.add'))}</button></div>
        <p class="friend-msg ${isErr ? 'err' : 'ok'}" role="status" data-friend-msg="1">${esc(msg)}</p>
      </form>
      ${data.incoming.length ? `<h3 class="friends-sub">${esc(t('friends.incoming'))}</h3><ul class="friend-list">${asks(data.incoming, (n) => `<span class="friend-actions"><button class="chip-btn" data-accept="${n}">${icon('check')}${esc(t('friends.accept'))}</button><button class="chip-btn" data-decline="${n}">${icon('close')}${esc(t('friends.decline'))}</button></span>`)}</ul>` : ''}
      ${data.friends.length ? `<ul class="friend-list">${data.friends.map(row).join('')}</ul>` : `<p class="sub">${esc(t('friends.none'))}</p>`}
      ${data.outgoing.length ? `<h3 class="friends-sub">${esc(t('friends.outgoing'))}</h3><ul class="friend-list">${asks(data.outgoing, (n) => `<button class="chip-btn" data-remove="${n}">${icon('close')}${esc(t('friends.cancel'))}</button>`)}</ul>` : ''}`;
      const act = (name, job, ok) => async () => {
        try {
          await timed(job(name));
          refresh(ok);
        } catch (err) {
          refresh(friendMessage(err.code), true);
        }
      };
      for (const b of box.querySelectorAll('[data-accept]')) psc.on(b, 'click', act(b.dataset.accept, (n) => account.respondFriend(n, true), t('friends.becameFriend', { name: b.dataset.accept })));
      for (const b of box.querySelectorAll('[data-decline]')) psc.on(b, 'click', act(b.dataset.decline, (n) => account.respondFriend(n, false), t('friends.declined')));
      for (const b of box.querySelectorAll('[data-remove]')) psc.on(b, 'click', act(b.dataset.remove, (n) => account.removeFriend(n), t('friends.done')));
      const input = box.querySelector('[data-friend-input]');
      psc.on(box.querySelector('[data-friend-form]'), 'submit', async (e) => {
        e.preventDefault?.();
        const name = cleanFriendName(input.value);
        if (!name) return void refresh(friendMessage('invalid_username'), true, input.value);
        box.querySelector('[data-friend-submit]').disabled = true;
        try {
          refresh(addedMessage(await timed(account.addFriend(name)), name));
        } catch (err) {
          refresh(friendMessage(err.code), true, name);
        }
      });
    };
    async function refresh(msg = '', isErr = false, keep = '') {
      let data;
      const my = ++reads;
      try {
        data = await timed(account.friends());
      } catch {
        if (gone || my !== reads) return;
        psc?.dispose();
        psc = sc.child();
        listState(box, { state: 'error', errorText: t('friends.loadError'), onRetry: () => refresh(), scope: psc });
        return;
      }
      if (gone || my !== reads) return;
      paint(data, msg, isErr);
      party?.setFriends(data.friends); // el panel de grupo ofrece la lista nueva sin pedirla otra vez
      if (keep) box.querySelector('[data-friend-input]').value = keep;
    }
    paint(data0);
  }

  function paintReady(data) {
    const body = shell(`
      <section class="account-card-panel friends-panel">
        <div class="panel-head">
          <h2>${esc(t('friends.friendsTitle'))}</h2>
          <span class="panel-badge friends-count" data-friends-count="1"></span>
        </div>
        <div class="friends-box" data-friends-box="1"></div>
      </section>
      <section class="party-box" data-party-box="1"></section>`);
    friendsPanel(body.querySelector('[data-friends-box]'), body.querySelector('[data-friends-count]'), data);
    party = mountPartyPanel(body.querySelector('[data-party-box]'), null, 0, { ...ctx, scope: sc }, { friends: data.friends });
  }

  async function load() {
    const my = ++run;
    paintState('loading');
    let data;
    try {
      data = await timed(account.friends());
    } catch { if (my === run && !gone) paintState('error'); return; }
    if (my !== run || gone) return;
    paintReady(data);
  }

  if (locked) paintLocked();
  else load(); // sin esperar: el host serializa los montajes y una red lenta no debe bloquear «Atrás»
  return {
    title: t('friends.title'),
    destroy() {
      gone = true;
      run++;
      party?.destroy();
      party = null;
      scope.dispose();
    },
  };
}
