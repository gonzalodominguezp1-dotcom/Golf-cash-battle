// Cuenta › Monedero (T035): saldo, historial y recarga demo que vivían en main.js (walletPane / bindWallet).
// Movido casi tal cual; la economía no cambia (el servidor cobra, premia y recarga). Seguridad (tier 2):
// - el saldo sale solo de wallet.getBalance(), sin caché entre sesiones (S5.7); el aviso de saldo solo repinta el DOM;
// - el importe de la recarga se valida como número positivo finito antes de enviar;
// - las descripciones del historial pasan por esc() (XSS);
// - la redirección de pago en cripto solo acepta https;
// - nada de esto va a consola, URL ni storage.
import { listState } from '../components.js';
import { coin, esc, fmt } from '../shared.js';
import { t } from '../texts/index.js';
import '../texts/common.js';
import '../texts/account.js';

const NET_TIMEOUT_MS = 8000; // una red que no responde no deja la pestaña colgada: error con Reintentar
const DEPOSIT_AMOUNTS = [50, 200];
const CRYPTO_AMOUNTS = [10, 25, 50];
const TX_KEYS = {
  bonus: 'account.walletTxBonus', withdrawal: 'account.walletTxWithdrawal', deposit: 'account.walletTxDeposit',
  entry: 'account.walletTxEntry', prize: 'account.walletTxPrize', refund: 'account.walletTxRefund',
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
            <small>${esc(t('account.walletBalance'))}</small>
            <strong data-wallet-balance="1">${coin(balance)}</strong>
          </div>
          <div class="card-footer">
            <div class="card-number">•••• •••• •••• ${String(Math.abs(Math.round(balance * 100)) % 9000 + 1000)}</div>
            <div class="card-holder"><small>${esc(t('account.walletHolder'))}</small><span>${esc(t('account.walletHolderName'))}</span></div>
          </div>
        </div>
        <div class="wallet-metrics">
          <div class="metric-card">
            <small>${esc(t('account.walletPrizes'))}</small>
            <b>${coin(prizeTotal)}</b>
          </div>
          <div class="metric-card">
            <small>${esc(t('account.walletMatches'))}</small>
            <b>${esc(matchesPlayed)}</b>
          </div>
        </div>
        <div class="deposit-section">
          <h3>${esc(t('account.walletDepositTitle'))}</h3>
          <div class="row deposit-row">
            ${DEPOSIT_AMOUNTS.map((n) => `<button type="button" class="primary deposit-btn" data-add="${n}">${icon('coins')}<span>${esc(t('account.walletAdd', { n }))}</span> ${esc(t('account.walletCredits'))}</button>`).join('')}
          </div>
          <p class="sub" role="alert" data-wallet-error="1"></p>
        </div>
        ${crypto
      ? `<div class="crypto-section">
          <h3>${esc(t('account.walletCryptoTitle'))} <small class="tag">${esc(t('account.walletCryptoTag'))}</small></h3>
          <div class="row">
            ${CRYPTO_AMOUNTS.map((n) => `<button type="button" class="secondary" data-crypto="${n}">${icon('coins')}${esc(t('account.walletCryptoAmount', { n }))}</button>`).join('')}
          </div>
          <p class="legal">${esc(t('account.walletCryptoLegal'))}</p>
        </div>`
      : ''
    }
      </div>
      <div class="txs-container">
        <h3>${esc(t('account.walletHistory'))}</h3>
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
      : `<li class="empty"><p>${esc(t('account.walletEmpty'))}</p></li>`
    }
        </ul>
      </div>
    </div>`;
}

export function mount(el, ctx) {
  const { wallet } = ctx;
  const scope = ctx.scope.child(); // todo lo del monedero cuelga de aquí
  const icon = (n, o = {}) => ctx.icon(n, o);
  let gone = false, run = 0, sc = null;

  const timed = (promise) => new Promise((resolve, reject) => {
    const cancel = scope.timeout(() => reject(new Error('timeout')), NET_TIMEOUT_MS);
    Promise.resolve(promise).then((v) => { cancel(); resolve(v); }, (e) => { cancel(); reject(e); });
  });

  const showError = (msg) => {
    const box = el.querySelector('[data-wallet-error]');
    if (box) box.textContent = msg;
  };

  function paintState(state) {
    sc?.dispose();
    sc = scope.child();
    listState(el, { state, errorText: t('account.walletLoadError'), onRetry: () => load(), scope: sc });
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
    sc?.dispose();
    sc = scope.child();
    listState(el, { state: 'ready' });
    el.innerHTML = `<div class="wallet-pane">${walletHtml({ balance, txs, crypto: Boolean(wallet.depositCrypto), icon })}</div>`;
    for (const b of el.querySelectorAll('[data-add]')) sc.on(b, 'click', () => deposit(b));
    for (const b of el.querySelectorAll('[data-crypto]')) sc.on(b, 'click', () => crypto(b));
  }

  async function deposit(b) {
    const amount = Number(b.dataset.add); // se lee al pulsar: el importe se valida justo antes de enviarlo
    showError('');
    if (!isValidAmount(amount)) return showError(t('account.walletBadAmount'));
    b.disabled = true;
    try {
      await wallet.deposit(amount, t('account.walletDepositNote'));
    } catch (e) {
      if (gone) return;
      b.disabled = false;
      return showError(e?.code === 'daily_cap' ? t('account.walletDailyCap') : t('account.walletDepositError'));
    }
    if (gone) return;
    ctx.sfx?.coins?.();
    load();
  }

  async function crypto(b) {
    const amount = Number(b.dataset.crypto);
    showError('');
    if (!isValidAmount(amount)) return showError(t('account.walletBadAmount'));
    b.disabled = true;
    try {
      const { invoiceUrl } = await wallet.depositCrypto(amount);
      if (!isSafeInvoiceUrl(invoiceUrl)) throw new Error('bad_invoice');
      if (!gone) scope.win.location.href = invoiceUrl;
    } catch (e) {
      if (gone) return;
      b.disabled = false;
      showError(e?.code === 'not_configured' ? t('account.walletCryptoOff') : t('account.walletCryptoError'));
    }
  }

  // saldo en vivo: solo repinta el número que ya está en pantalla (no se guarda en ninguna variable)
  scope.sub(wallet?.subscribe?.((n) => {
    if (gone) return;
    const box = el.querySelector('[data-wallet-balance]');
    if (box) box.innerHTML = coin(n);
  }));

  listState(el, { state: 'loading' });
  load(); // sin esperar: el host serializa los montajes y una red lenta no debe bloquear «Atrás»
  return {
    destroy() {
      gone = true;
      run++;
      scope.dispose();
    },
  };
}
