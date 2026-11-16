// Pantalla Monedero (ruta #/monedero; antes Cuenta › Monedero, T035): saldo, historial y recarga demo que vivían en main.js.
// Movido casi tal cual; la economía no cambia (el servidor cobra, premia y recarga). Seguridad (tier 2):
// - el saldo sale solo de wallet.getBalance(), sin caché entre sesiones (S5.7); el aviso de saldo solo repinta el DOM;
// - el importe de la recarga se valida como número positivo finito antes de enviar;
// - las descripciones del historial pasan por esc() (XSS);
// - la redirección de pago en cripto solo acepta https;
// - nada de esto va a consola, URL ni storage.
import { bindHeader, bindLobby, button, header, lobbyButton } from './components.js';
import { coin, esc, fmt } from './shared.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/monedero.js';

const NET_TIMEOUT_MS = 8000; // una red que no responde no deja la pantalla colgada: error con Reintentar
const DEPOSIT_AMOUNTS = [50, 200];
const CRYPTO_AMOUNTS = [10, 25, 50];
const TX_KEYS = {
  bonus: 'wallet.walletTxBonus', withdrawal: 'wallet.walletTxWithdrawal', deposit: 'wallet.walletTxDeposit',
  entry: 'wallet.walletTxEntry', prize: 'wallet.walletTxPrize', refund: 'wallet.walletTxRefund',
};

/** Importe válido para una recarga: número finito y mayor que cero. */
export const isValidAmount = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
/** Solo se redirige a una factura https; cualquier otra cosa se rechaza. */
export const isSafeInvoiceUrl = (u) => typeof u === 'string' && /^https:\/\//.test(u);

function walletHtml({ balance, txs, crypto, icon }) {
  const prizeTotal = txs.filter((x) => x.type === 'prize' && x.amount > 0).reduce((sum, x) => sum + x.amount, 0);
  const matchesPlayed = txs.filter((x) => x.type === 'entry').length;
  const label = (type) => (TX_KEYS[type] ? t(TX_KEYS[type]) : String(type ?? ''));
  const when = (at) => new Date(at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  return `
    <div class="wallet-pane-inner">
      <div class="wallet-dashboard-col">
        <div class="wallet-card holo">
          <div class="shine"></div>
          <div class="card-ambient"></div>
          <div class="card-header">
            <div class="card-chip-badge"><span class="card-chip"></span><span class="card-contactless">)))</span></div>
          </div>
          <div class="card-balance">
            <small>${esc(t('wallet.walletBalance'))}</small>
            <strong data-wallet-balance="1">${coin(balance)}</strong>
          </div>
          <div class="card-footer">
            <div class="card-number">•••• •••• •••• ${String(Math.abs(Math.round(balance * 100)) % 9000 + 1000)}</div>
            <div class="card-holder"><small>${esc(t('wallet.walletHolder'))}</small><span>${esc(t('wallet.walletHolderName'))}</span></div>
          </div>
        </div>
        <div class="wallet-metrics">
          <div class="metric-card">
            <small>${esc(t('wallet.walletPrizes'))}</small>
            <b>${coin(prizeTotal)}</b>
          </div>
          <div class="metric-card">
            <small>${esc(t('wallet.walletMatches'))}</small>
            <b>${esc(matchesPlayed)}</b>
          </div>
        </div>
        <div class="deposit-section">
          <h3>${esc(t('wallet.walletDepositTitle'))}</h3>
          <div class="row deposit-row">
            ${DEPOSIT_AMOUNTS.map((n) => `<button type="button" class="primary deposit-btn" data-add="${n}">${icon('coins')}<span>${esc(t('wallet.walletAdd', { n }))}</span> ${esc(t('wallet.walletCredits'))}</button>`).join('')}
          </div>
          <p class="sub" role="alert" data-wallet-error="1"></p>
        </div>
        ${crypto
      ? `<div class="crypto-section">
          <h3>${esc(t('wallet.walletCryptoTitle'))} <small class="tag">${esc(t('wallet.walletCryptoTag'))}</small></h3>
          <div class="row">
            ${CRYPTO_AMOUNTS.map((n) => `<button type="button" class="secondary" data-crypto="${n}">${icon('coins')}${esc(t('wallet.walletCryptoAmount', { n }))}</button>`).join('')}
          </div>
          <p class="legal">${esc(t('wallet.walletCryptoLegal'))}</p>
        </div>`
      : ''
    }
      </div>
      <div class="txs-container">
        <h3>${esc(t('wallet.walletHistory'))}</h3>
        <ul class="txs">
          ${txs.length
      ? txs.map((x) => `<li>
                        <div class="tx-info">
                          <div class="tx-text">
                            <b>${esc(label(x.type))}</b>
                            <small>${esc(x.note)} · ${esc(when(x.at))}</small>
                          </div>
                        </div>
                        <span class="${x.amount >= 0 ? 'pos' : 'neg'}">${x.amount >= 0 ? '+' : ''}${esc(fmt(x.amount))}</span>
                      </li>`).join('')
      : `<li class="empty"><p>${esc(t('wallet.walletEmpty'))}</p></li>`
    }
        </ul>
      </div>
    </div>`;
}

// Forma de pantalla: mount(root, ctx) no bloquea, devuelve { title, destroy }.
export function mount(root, ctx) {
  const { wallet } = ctx;
  const scope = ctx.scope.child(); // todo lo del monedero cuelga de aquí
  const icon = (n, o = {}) => ctx.icon(n, o);
  let gone = false, run = 0, sc = null;

  const timed = (promise) => new Promise((resolve, reject) => {
    const cancel = scope.timeout(() => reject(new Error('timeout')), NET_TIMEOUT_MS);
    Promise.resolve(promise).then((v) => { cancel(); resolve(v); }, (e) => { cancel(); reject(e); });
  });

  const showError = (msg) => {
    const box = root.querySelector('[data-wallet-error]');
    if (box) box.textContent = msg;
  };

  // Cada repintado suelta lo del anterior (listeners e hijos) y escribe la pantalla entera: cabecera, cuerpo y Lobby.
  function render(state, inner) {
    sc?.dispose();
    sc = scope.child();
    root.dataset.state = state;
    root.innerHTML = `<main class="screen wallet-screen" aria-label="${esc(t('wallet.title'))}">
      ${header({ title: t('wallet.title') })}
      <div class="wallet-body">${inner}</div>
      ${lobbyButton()}
    </main>`;
    bindHeader(root, { ...ctx, scope: sc });
    bindLobby(root, { ...ctx, scope: sc });
  }

  function paintState(state) {
    if (state === 'loading') {
      render('loading', `<p class="scr-state" role="status">${esc(t('common.loading'))}</p>`);
      return;
    }
    render('error', `<div class="scr-state scr-state-error" role="alert"><p>${esc(t('wallet.walletLoadError'))}</p>${button({ label: t('common.retry'), kind: 'secondary', attrs: 'data-retry' })}</div>`);
    const retry = root.querySelector('[data-retry]');
    if (retry) sc.on(retry, 'click', () => load());
  }

  // Cada lectura tiene su número: una respuesta vieja (red lenta) nunca pisa a la última pedida.
  async function load() {
    const my = ++run;
    paintState('loading');
    let balance, txs;
    try {
      [balance, txs] = await timed(Promise.all([wallet.getBalance(), wallet.getTransactions()]));
    } catch {
      if (my === run && !gone) paintState('error');
      return;
    }
    if (my !== run || gone) return;
    paint(balance, txs);
  }

  function paint(balance, txs) {
    render('ready', `<div class="wallet-pane">${walletHtml({ balance, txs, crypto: Boolean(wallet.depositCrypto), icon })}</div>`);
    for (const b of root.querySelectorAll('[data-add]')) sc.on(b, 'click', () => deposit(b));
    for (const b of root.querySelectorAll('[data-crypto]')) sc.on(b, 'click', () => crypto(b));
  }

  async function deposit(b) {
    const amount = Number(b.dataset.add); // se lee al pulsar: el importe se valida justo antes de enviarlo
    showError('');
    if (!isValidAmount(amount)) return showError(t('wallet.walletBadAmount'));
    b.disabled = true;
    try {
      await wallet.deposit(amount, t('wallet.walletDepositNote'));
    } catch (e) {
      if (gone) return;
      b.disabled = false;
      return showError(e?.code === 'daily_cap' ? t('wallet.walletDailyCap') : t('wallet.walletDepositError'));
    }
    if (gone) return;
    ctx.sfx?.coins?.();
    load();
  }

  async function crypto(b) {
    const amount = Number(b.dataset.crypto);
    showError('');
    if (!isValidAmount(amount)) return showError(t('wallet.walletBadAmount'));
    b.disabled = true;
    try {
      const { invoiceUrl } = await wallet.depositCrypto(amount);
      if (!isSafeInvoiceUrl(invoiceUrl)) throw new Error('bad_invoice');
      if (!gone) scope.win.location.href = invoiceUrl;
    } catch (e) {
      if (gone) return;
      b.disabled = false;
      showError(e?.code === 'not_configured' ? t('wallet.walletCryptoOff') : t('wallet.walletCryptoError'));
    }
  }

  // saldo en vivo: solo repinta el número que ya está en pantalla (no se guarda en ninguna variable)
  scope.sub(wallet?.subscribe?.((n) => {
    if (gone) return;
    const box = root.querySelector('[data-wallet-balance]');
    if (box) box.innerHTML = coin(n);
  }));

  render('loading', `<p class="scr-state" role="status">${esc(t('common.loading'))}</p>`);
  load(); // sin esperar: el host serializa los montajes y una red lenta no debe bloquear «Atrás»
  return {
    title: t('wallet.title'),
    destroy() {
      gone = true;
      run++;
      scope.dispose();
    },
  };
}
