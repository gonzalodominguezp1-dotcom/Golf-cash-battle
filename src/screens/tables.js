// Mesas (T028): la lista de mesas del lobby de siempre, ahora como pantalla del router. Saldo en la cabecera, última mesa
// destacada y acceso al grupo. El panel de grupo vive en partyPanel.js (T030).
// El CSS (tables.css) lo importa el arranque, no este módulo, para poder probarlo en Node.
import { PLATFORM_COMMISSION, TIERS, potFor, prizeFor } from '../config.js';
import { bindHeader, header, listState } from './components.js';
import { lastTier, rememberTier } from './hubRules.js';
import { mountPartyPanel } from './partyPanel.js';
import { coin, esc, fmt } from './shared.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/tables.js';

const BALANCE_TIMEOUT_MS = 8000; // un monedero que no responde no deja la pantalla colgada: error con Reintentar

export async function mount(root, ctx) {
  const { router, backend } = ctx;
  const scope = ctx.scope.child(); // todo lo de la pantalla cuelga de aquí: destroy lo libera entero
  const legacy = ctx.legacy ?? {};
  const icon = (n, o = {}) => ctx.icon(n, o);
  const storage = ctx.storage ?? globalThis.localStorage;
  const device = t(scope.win?.matchMedia?.('(pointer: coarse)')?.matches ? 'tables.deviceMobile' : 'tables.deviceComputer');
  let gone = false, run = 0, sc = null, party = null; // sc: scope hijo de lo pintado; party: panel de grupo montado

  legacy.enterTables?.(); // lo que showLobby hacía al entrar: cerrar final y sala en vivo, liberar la partida

  const paidBlock = backend?.account?.profile?.paid_block;
  const tierCard = (tier, balance, last) => {
    const free = tier.entryFee === 0;
    const enough = balance >= tier.entryFee;
    const label = free ? t('tables.practice') : t('tables.play');
    return `
      <div class="tier holo tier--${tier.id}"${last === tier.id ? ' data-last="1"' : ''}>
        <div class="shine"></div>
        <div class="tier-ambient"></div>
        <div class="tier-top">
          <div class="gem-wrapper"><span class="gem gem--${tier.id}"></span></div>
          <div class="tier-identity">
            <span class="tier-name">${esc(tier.name)}</span>
            <span class="tier-tagline">${esc(t(free ? 'tables.training' : 'tables.esports'))}</span>
            ${last === tier.id ? `<span class="tier-last">${esc(t('tables.last'))}</span>` : ''}
          </div>
          <span class="tier-fee">${free ? esc(t('tables.free')) : `${esc(t('tables.entry'))} ${coin(tier.entryFee)}`}</span>
        </div>
        <div class="tier-mid">
          ${free ? `<span class="tier-prize small">${esc(t('tables.practiceNote'))}</span>` : `<span class="tier-label">${esc(t('tables.guaranteed'))}</span><span class="tier-prize">${coin(prizeFor(tier))}</span><span class="tier-pot">${esc(t('tables.pot'))} ${fmt(potFor(tier))}</span>`}
        </div>
        <button type="button" class="play" data-tier="${tier.id}" data-label="${esc(label)}" ${enough ? '' : 'disabled'}>${esc(enough ? label : t('tables.noFunds'))}</button>
      </div>`;
  };

  function paint(state, balance = 0) {
    party?.destroy(); // para el sondeo del grupo; el panel nuevo lo vuelve a arrancar
    party = null;
    sc?.dispose();
    sc = scope.child();
    const last = lastTier(storage, TIERS);
    const ready = state === 'ready';
    const balanceHtml = ready ? `<span class="sr-only">${esc(t('tables.balance'))}</span><b data-tables-balance="1">${coin(balance)}</b>` : null;
    root.innerHTML = `<main class="screen lobby tables">
      ${header({ title: t('tables.title'), balanceHtml })}
      <div class="tables-body" data-tables-body="1">${ready ? `
      ${backend?.mode === 'local' ? `<p class="offline">${esc(t('tables.offline', { device }))}</p>` : ''}
      ${paidBlock ? `<button type="button" class="notice account-hint" data-go="account">${esc(t(`tables.paid_block_${paidBlock}`))} ${icon('next')}</button>` : ''}
      ${backend?.parties ? '<section class="party-box" data-party-box="1"></section>' : ''}
      <div class="tiers" data-tier-list="1">${TIERS.map((tier) => tierCard(tier, balance, last)).join('')}</div>
      <p class="legal">${backend?.tournaments ? esc(t('tables.legalLive')) : ''}${esc(t('tables.legalRules', { pct: Math.round(PLATFORM_COMMISSION * 100) }))}</p>` : ''}</div>
    </main>`;
    bindHeader(root, { ...ctx, scope: sc });
    const body = root.querySelector('[data-tables-body]');
    if (!ready) {
      listState(body, { state, errorText: t('tables.loadError'), onRetry: load, scope: sc });
      return;
    }
    for (const btn of root.querySelectorAll('[data-tier]')) {
      const tier = TIERS.find((x) => x.id === btn.dataset.tier);
      sc.on(btn, 'click', () => {
        const watch = ctx.partyWatch;
        const entering = tier.entryFee > 0 && watch?.state?.party ? watch.pickTier(tier) : ctx.actions.startMatch(tier);
        // «última mesa» = la última cuya entrada se inició sin error
        Promise.resolve(entering).then(() => rememberTier(storage, tier.id), () => {});
      });
    }
    for (const btn of root.querySelectorAll('[data-go]')) sc.on(btn, 'click', () => router.push(btn.dataset.go));
    const box = root.querySelector('[data-party-box]');
    if (box) party = mountPartyPanel(box, root.querySelector('[data-tier-list]'), balance, { ...ctx, scope: sc });
  }

  async function load() {
    const my = ++run;
    paint('loading');
    let balance;
    let cancel = () => {};
    try {
      const timed = new Promise((_, rej) => { cancel = scope.timeout(() => rej(new Error('timeout')), BALANCE_TIMEOUT_MS); });
      balance = await Promise.race([Promise.resolve(ctx.wallet.getBalance()), timed]);
    } catch { if (my === run && !gone) paint('error'); return; } finally { cancel(); }
    if (my !== run || gone) return;
    paint('ready', balance);
    ctx.actions.claimRewards();
  }

  // el saldo de la cabecera sigue al monedero; las mesas se calculan con el saldo al entrar, como siempre
  try {
    scope.sub(ctx.wallet.subscribe((n) => {
      const el = root.querySelector('[data-tables-balance]');
      if (!gone && el && Number.isFinite(n)) el.innerHTML = coin(n);
    }));
  } catch { /* un monedero sin suscripción no tumba la pantalla */ }

  load(); // sin esperar: el host serializa los montajes y un monedero lento no debe bloquear «Atrás»
  return {
    title: t('tables.title'),
    destroy() {
      gone = true;
      run++;
      party?.destroy(); // para el sondeo del grupo, como hacía releasePlay al salir del lobby
      party = null;
      scope.dispose();
    },
  };
}
