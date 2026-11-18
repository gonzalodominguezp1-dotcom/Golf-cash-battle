// Panel de grupo (movido de main.js, T030): lo montan Mesas y Amigos y grupo. Hasta 4 amigos: el líder elige la mesa, cada
// uno pulsa «Listo» y el servidor los mete juntos en el mismo torneo. Se consulta cada pocos segundos mientras se ve.
import { TIERS } from '../config.js';
import { partyErrorText, readyLabel } from '../match/partyRules.js';
import { sortOnlineFirst } from '../account/friendRules.js';
import { frameById } from '../progress/prestige.js';
import { fromWire } from '../progress/avatar.js';
import { avatarHtml, coin, esc } from './shared.js';
import { t } from './texts/index.js';
import './texts/friends.js';

/**
 * mountPartyPanel(box, tierList, balance, ctx) -> { destroy }
 * `tierList` (opcional) son los botones de mesa que cambian de texto según el grupo; sin lista, solo se pinta el panel.
 * `given`: lista de amigos ya leída (evita pedirla otra vez); setFriends(lista) la refresca tras cambiar los amigos.
 * ctx: { backend, partyWatch, router, scope, icon }. destroy() baja la suscripción, los clics y para el sondeo.
 */
export function mountPartyPanel(box, tierList, balance, ctx, { friends: given } = {}) {
  const { backend, partyWatch, router } = ctx;
  const svc = backend.parties;
  const hasName = Boolean(backend.account?.profile?.username);
  const scope = ctx.scope.child();
  const icon = (n, o = {}) => ctx.icon(n, o);
  let friends = Array.isArray(given) ? given : null;
  let msg = '';
  let sc = null; // scope de lo pintado: se libera en cada repintado
  let gone = false;
  const apply = (job, okMsg = '') => partyWatch.apply(job, okMsg);
  const alive = () => !gone && box.isConnected !== false;

  // los botones de las mesas dicen qué pasa al pulsarlos estando en grupo
  function paintTiers(p) {
    for (const b of tierList?.querySelectorAll('.play') ?? []) {
      const tier = TIERS.find((x) => x.id === b.dataset.tier);
      if (!tier || tier.entryFee === 0 || balance < tier.entryFee) continue;
      b.classList.toggle('party-pick', Boolean(p) && p.tier_id === tier.id);
      if (!p) {
        b.textContent = b.dataset.label;
        b.disabled = false;
      } else if (p.leader) {
        b.textContent = t(p.tier_id === tier.id ? 'friends.partyTable' : 'friends.partyPlayWith');
        b.disabled = false;
      } else {
        b.textContent = t(p.tier_id === tier.id ? 'friends.partyTableReady' : 'friends.leaderPicks');
        b.disabled = p.tier_id !== tier.id;
      }
    }
  }

  function paint(state) {
    if (!alive()) return;
    sc?.dispose();
    sc = scope.child();
    const p = state?.party ?? null;
    const invites = state?.invites ?? [];
    paintTiers(p);
    const inviteRows = invites.map((i) => `<li class="friend">
        <span class="friend-name"><b>${esc(i.from)}</b><small>${esc(t('friends.invitesYou'))}</small></span>
        <span class="friend-actions"><button class="chip-btn" data-join="${esc(i.party)}">${icon('check')}${esc(t('friends.join'))}</button><button class="chip-btn" data-no="${esc(i.party)}">${icon('close')}${esc(t('friends.no'))}</button></span>
      </li>`).join('');
    const inParty = new Set([...(p?.members ?? []).map((m) => m.name.toLowerCase()), ...(p?.invited ?? []).map((n) => n.toLowerCase())]);
    const room = p ? p.size - p.members.length - p.invited.length : 3;
    // solo los amigos conectados ahora (latido de presencia): sin conexión no se invita ni se forma grupo
    const candidates = sortOnlineFirst((friends ?? []).filter((f) => f.online === true && !inParty.has(f.name.toLowerCase()))).slice(0, 6);
    const friendRows = room > 0 && candidates.length
      ? `<ul class="friend-list">${candidates.map((f) => `<li class="friend">
          ${avatarHtml({ size: 'sm', frame: frameById(f.frame), av: fromWire(f.avatar), initial: f.name })}
          <span class="friend-name"><span class="friend-who">${f.online === true ? `<i class="online-dot" role="img" aria-label="${esc(t('friends.online'))}" title="${esc(t('friends.online'))}"></i>` : ''}<b>${esc(f.name)}</b></span><small>${esc(t('friends.level', { n: f.level }))}</small></span>
          <button class="chip-btn" data-invite="${esc(f.name)}">${icon('user-plus')}${esc(t('friends.invite'))}</button>
        </li>`).join('')}</ul>`
      : '';
    const tier = p?.tier_id ? TIERS.find((x) => x.id === p.tier_id) : null;
    let body;
    if (!hasName) {
      body = `<p class="sub">${esc(t('friends.needNameParty'))}</p><button class="chip-btn" data-go="account">${icon('user')}${esc(t('friends.goAccount'))}</button>`;
    } else if (!p) {
      body = `
        ${inviteRows ? `<ul class="friend-list">${inviteRows}</ul>` : ''}
        <p class="sub">${esc(t('friends.partyInvite'))}</p>
        ${friends === null ? `<p class="sub">${esc(t('friends.loadingFriends'))}</p>` : friendRows || (tierList
          ? (friends.length
            ? `<p class="sub" data-no-online="1">${esc(t('friends.noOnlineFriends'))}</p>`
            : `<p class="sub">${esc(t('friends.noFriendsParty'))}</p><button class="chip-btn" data-go="account">${icon('user-plus')}${esc(t('friends.addFriends'))}</button>`)
          : `<p class="sub">${esc(t('friends.noFriendsHere'))}</p>`)}`;
    } else {
      const members = p.members.map((m) => `<li class="party-member ${m.ready ? 'ready' : ''}">
          <span class="avatar">${esc(m.name[0] ?? '?')}</span>
          <span><b>${m.me ? esc(t('friends.me')) : esc(m.name)}</b><small>${m.leader ? esc(t('friends.leader')) : ''}${esc(t(m.ready ? 'friends.ready' : 'friends.waiting'))}</small></span>
        </li>`).join('');
      const invited = p.invited.map((n) => `<li class="party-member invited"><span class="avatar">${esc(n[0] ?? '?')}</span><span><b>${esc(n)}</b><small>${esc(t('friends.invited'))}</small></span></li>`).join('');
      const me = p.members.find((m) => m.me);
      const alone = p.members.length < 2;
      body = `
        <ul class="party-members">${members}${invited}</ul>
        <p class="sub">${tier ? t('friends.tableOf', { name: tier.name, fee: coin(tier.entryFee) }) : esc(t(p.leader ? 'friends.leaderChoose' : 'friends.leaderChoosing'))}</p>
        ${p.last_error ? `<p class="party-err">${esc(partyErrorText(p.last_error))}</p>` : ''}
        ${tier ? `<button class="primary party-ready" data-party-ready="1" ${alone && !me?.ready ? 'disabled' : ''}>${alone ? esc(t('friends.waitFriend')) : icon('check') + esc(readyLabel(p))}</button>` : ''}
        <p class="legal">${esc(t('friends.legal', { action: t(p.leader ? 'friends.actionLeader' : 'friends.actionMember') }))}</p>
        ${inviteRows ? `<ul class="friend-list">${inviteRows}</ul>` : ''}
        ${friendRows ? `<h3 class="friends-sub">${esc(t('friends.inviteMore'))}</h3>${friendRows}` : ''}`;
    }
    box.innerHTML = `
      <div class="party-card">
        <div class="section-head party-head">
          <h2>${esc(p ? t('friends.yourParty', { n: p.members.length, size: p.size }) : t('friends.playWithFriends'))}</h2>
          ${p ? `<button class="chip-btn party-leave" data-party-leave="1">${icon('logout')}${esc(t('friends.leave'))}</button>` : ''}
        </div>
        ${msg ? `<p class="party-msg" role="status">${esc(msg)}</p>` : ''}
        ${body}
      </div>`;
    box.querySelectorAll('[data-go]').forEach((b) => sc.on(b, 'click', () => router.push(b.dataset.go)));
    box.querySelectorAll('[data-invite]').forEach((b) => sc.on(b, 'click', () => apply(() => svc.invite(b.dataset.invite), t('friends.inviteSent', { name: b.dataset.invite }))));
    box.querySelectorAll('[data-join]').forEach((b) => sc.on(b, 'click', () => apply(() => svc.respond(b.dataset.join, true))));
    box.querySelectorAll('[data-no]').forEach((b) => sc.on(b, 'click', () => apply(() => svc.respond(b.dataset.no, false))));
    const leave = box.querySelector('[data-party-leave]');
    if (leave) sc.on(leave, 'click', () => apply(() => svc.leave()));
    const ready = box.querySelector('[data-party-ready]');
    if (ready) sc.on(ready, 'click', () => apply(() => svc.ready(!p.members.find((m) => m.me)?.ready)));
  }

  if (hasName && friends === null) {
    backend.account.friends().then((d) => {
      if (gone) return;
      friends = d.friends;
      paint(partyWatch.state);
    }).catch(() => { friends = []; });
  }
  // en Mesas, quién está conectado cambia mientras se mira: la lista de amigos se relee cada 30 s
  if (hasName && tierList) {
    scope.interval(() => {
      backend.account.friends().then((d) => {
        if (gone) return;
        friends = d.friends;
        paint(partyWatch.state);
      }).catch(() => {});
    }, 30000);
  }

  partyWatch.state = null;
  paint(null);
  if (hasName) {
    scope.sub(partyWatch.subscribe((state, info) => {
      if (!alive()) return;
      msg = info.msg;
      paint(state);
    }));
    partyWatch.start();
  }
  return {
    setFriends(list) {
      if (gone || !Array.isArray(list)) return;
      friends = list;
      paint(partyWatch.state);
    },
    destroy() {
      if (gone) return;
      gone = true;
      scope.dispose(); // baja la suscripción y los clics pintados
      partyWatch.stop?.();
    },
  };
}
