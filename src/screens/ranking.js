// Ranking de victorias (T031): lo que showRanking hacía en main.js, ahora como pantalla del router.
// El CSS (ranking.css) lo importa el arranque, no este módulo, para poder probarlo en Node.
import { frameById } from '../progress/prestige.js';
import { bindHeader, header, listState } from './components.js';
import { avatarHtml, esc } from './shared.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/ranking.js';

const TABS = ['weekly', 'monthly', 'historic'];
const NET_TIMEOUT_MS = 8000; // una red que no responde no deja la pantalla colgada: error con Reintentar
const MEDALS = ['gold', 'silver', 'bronze'];

let lastTab = 'weekly'; // pestaña elegida: en memoria del módulo, como hacía rankingTab; sin storage
/** Solo para tests: el estado de módulo se reinicia (o se fuerza un valor) entre pruebas. */
export const __setLastTab = (v = 'weekly') => { lastTab = v; };

const day = (ms) => new Date(ms).toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const winsText = (n) => `${n} ${t(n === 1 ? 'ranking.win' : 'ranking.wins')}`;

export async function mount(root, ctx) {
  const { backend } = ctx;
  const scope = ctx.scope.child(); // todo lo de la pantalla cuelga de aquí: destroy lo libera entero
  const account = backend?.account;
  const icon = (n, o = {}) => ctx.icon(n, o);
  let gone = false, reads = 0, sc = null, cancelRead = () => {};

  if (!account) { // sin servidor: el hub ya lo avisa; aquí el mismo mensaje y volver
    root.innerHTML = `<main class="screen ranking">${header({ title: t('ranking.title') })}<div class="ranking-body"><p class="offline" role="status">${esc(t('ranking.offline'))}</p></div></main>`;
    bindHeader(root, { ...ctx, scope });
    return { title: t('ranking.title'), destroy() { gone = true; scope.dispose(); } };
  }

  root.innerHTML = `<main class="screen ranking">
    ${header({ title: t('ranking.title') })}
    <div class="ranking-body">
      <p class="ranking-sub">${esc(t('ranking.sub'))}</p>
      <div class="rank-tabs" role="group" aria-label="${esc(t('ranking.periodLabel'))}">${TABS.map((k) => `<button type="button" data-ranking-tab="${k}">${esc(t(`ranking.${k}`))}</button>`).join('')}</div>
      <p class="rank-period" data-ranking-period="1"></p>
      <div class="ranking-list" data-ranking-list="1"></div>
      <div class="rank-me" data-ranking-me="1"></div>
      <p class="legal">${esc(t('ranking.legal'))}</p>
    </div>
  </main>`;
  bindHeader(root, { ...ctx, scope });
  const list = root.querySelector('[data-ranking-list]');
  const me = root.querySelector('[data-ranking-me]');
  const period = root.querySelector('[data-ranking-period]');
  const tabs = [...root.querySelectorAll('[data-ranking-tab]')];

  const row = (r) => {
    const f = frameById(r.frame);
    const medal = r.pos <= 3 ? icon('medal', { tone: MEDALS[r.pos - 1], arg: r.pos, label: t('ranking.place', { n: r.pos }) }) : r.pos;
    return `<li class="rank-row ${r.me ? 'me' : ''} ${r.pos <= 3 ? `podium p${r.pos}` : ''}"${r.me ? ' aria-current="true"' : ''}>
      <b class="rank-pos">${medal}</b>
      ${avatarHtml({ size: 'sm', frame: f, av: r.me ? ctx.avatar?.get?.() ?? null : null, initial: (r.name ?? '?')[0] })}
      <span class="rank-name">${esc(r.name)}<small>${esc(t('ranking.level', { n: r.level }))}${f ? ` · ${esc(f.name)}` : ''}</small></span>
      <span class="rank-wins"><b>${r.wins}</b><small>${esc(t(r.wins === 1 ? 'ranking.win' : 'ranking.wins'))}</small></span>
    </li>`;
  };

  // solo la última lectura pinta: una respuesta vieja tardía no pisa a la nueva, y destroy cancela las que queden
  async function load(tab) {
    lastTab = tab;
    const my = ++reads;
    cancelRead();
    sc?.dispose();
    sc = scope.child();
    for (const b of tabs) {
      const on = b.dataset.rankingTab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    me.innerHTML = '';
    period.textContent = '';
    listState(list, { state: 'loading' });
    let r;
    try {
      const timed = new Promise((_, rej) => { cancelRead = sc.timeout(() => rej(new Error('timeout')), NET_TIMEOUT_MS); });
      r = await Promise.race([Promise.resolve(account.ranking(tab)), timed]);
    } catch {
      if (gone || my !== reads) return;
      listState(list, { state: 'error', errorText: t('ranking.loadError'), onRetry: () => load(tab), scope: sc });
      return;
    }
    if (gone || my !== reads) return;
    cancelRead();
    period.textContent = tab === 'historic' ? t('ranking.fromStart') : `${day(r.from)} – ${day(new Date(r.to) - 1)}`;
    if (r.top.length) {
      list.dataset.state = 'ready';
      list.innerHTML = `<ol class="rank-list" aria-label="${esc(t('ranking.title'))}">${r.top.map(row).join('')}</ol>`;
    } else listState(list, { state: 'empty', emptyText: t('ranking.empty') });
    const inTop = r.top.some((x) => x.me);
    me.innerHTML = inTop ? '' : r.me
      ? `<p class="rank-mine">${esc(t('ranking.minePos'))} <b>#${r.me.pos}</b> · ${esc(winsText(r.me.wins))}</p>`
      : `<p class="rank-mine">${esc(t('ranking.mineNone'))}</p>`;
  }

  for (const b of tabs) scope.on(b, 'click', () => load(b.dataset.rankingTab));
  load(TABS.includes(lastTab) ? lastTab : TABS[0]); // sin esperar: el host serializa los montajes y una red lenta no debe bloquear «Atrás»
  return {
    title: t('ranking.title'),
    destroy() {
      gone = true;
      reads++;
      scope.dispose();
    },
  };
}
