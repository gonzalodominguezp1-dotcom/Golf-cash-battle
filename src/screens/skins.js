// Skins (T032): lo que showSkins hacía en main.js, ahora como pantalla del router.
// El CSS (skins.css) lo importa el arranque. Las miniaturas con canvas/observador viven en ctx.thumbs (skinThumbsHook.js).
// Pulsar una skin apila la pantalla del inspector (skinInspect.js, #/skins/:id).
import { SKINS, TIERS as SKIN_TIERS } from '../progress/skins.js';
import { rarePatternOf } from '../progress/inventory.js';
import { tierIcon } from '../ui/icons.js';
import { bindHeader, button, header, listState } from './components.js';
import { esc } from './shared.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/skins.js';

const tierOrder = (s) => SKIN_TIERS[s.tier]?.order ?? 0;
const FILTER_TIERS = Object.keys(SKIN_TIERS).reverse();
const cap = (c) => `${c[0].toUpperCase()}${c.slice(1)}`;

// El filtro y el scroll sobreviven a ir al inspector (Skins se destruye al apilarlo): memoria de módulo, sin storage.
const DEFAULT_FILTER = { tier: 'all', owned: false, collection: 'all' };
let lastFilter = { ...DEFAULT_FILTER };
let pendingScroll = null; // solo al volver del inspector; una visita nueva empieza arriba
export const __resetFilter = () => { lastFilter = { ...DEFAULT_FILTER }; pendingScroll = null; };

export async function mount(root, ctx) {
  const { progress, thumbs } = ctx;
  const scope = ctx.scope.child(); // todo lo de la pantalla cuelga de aquí: destroy lo libera entero
  const icon = (n, o = {}) => ctx.icon(n, o);
  const collections = [...new Set(SKINS.map((s) => s.collection))];
  const filter = {
    tier: lastFilter.tier === 'all' || SKIN_TIERS[lastFilter.tier] ? lastFilter.tier : 'all',
    owned: lastFilter.owned === true,
    collection: lastFilter.collection === 'all' || collections.includes(lastFilter.collection) ? lastFilter.collection : 'all',
  };
  const win = ctx.scope.win;
  const restoreY = pendingScroll;
  pendingScroll = null;
  let gone = false, sc = null, binding = null, items = [];

  const { level, into, need } = progress.level;
  const unlocked = SKINS.filter((s) => progress.isUnlocked(s)).length;
  root.innerHTML = `<main class="screen skins" aria-label="${esc(t('skins.title'))}">
    ${header({ title: t('skins.title') })}
    <div class="skins-body">
      <p class="sub">${esc(t('skins.sub', { unlocked, total: SKINS.length }))}</p>
      <div class="level-card">
        <div><small>${esc(t('skins.level'))}</small><strong>${level}</strong></div>
        <div class="level-progress"><span><i style="width:${(into / need) * 100}%"></i></span><small>${esc(t('skins.xp', { into, need }))}</small></div>
      </div>
      <div class="sk-filters" role="group" aria-label="${esc(t('skins.filtersLabel'))}">
        <div class="sk-filter-row">
          <button type="button" class="sk-fchip${filter.tier === 'all' ? ' on' : ''}" data-tier="all" aria-pressed="${filter.tier === 'all'}">${esc(t('skins.all'))}</button>
          ${FILTER_TIERS.map((id) => `<button type="button" class="sk-fchip rarity-${id}${filter.tier === id ? ' on' : ''}" data-tier="${id}" aria-pressed="${filter.tier === id}"><i aria-hidden="true">${tierIcon(id)}</i>${esc(SKIN_TIERS[id].name)}</button>`).join('')}
        </div>
        <div class="sk-filter-row">
          <button type="button" class="sk-fchip sk-fowned${filter.owned ? ' on' : ''}" data-sk-owned="1" aria-pressed="${filter.owned}">${esc(t('skins.owned'))}</button>
          ${collections.length > 1 ? `<select class="sk-fcoll" data-sk-coll="1" aria-label="${esc(t('skins.collection'))}"><option value="all">${esc(t('skins.allCollections'))}</option>${collections.map((c) => `<option value="${esc(c)}"${filter.collection === c ? ' selected' : ''}>${esc(cap(c))}</option>`).join('')}</select>` : ''}
        </div>
      </div>
      <div class="sk-list" data-sk-list="1"></div>
      <p class="sk-logros">${esc(t('skins.logrosText'))} ${button({ label: t('skins.logrosLink'), attrs: 'data-go="achievements"' })}</p>
    </div>
  </main>`;
  bindHeader(root, { ...ctx, scope });
  const list = root.querySelector('[data-sk-list]');
  const tierBtns = [...root.querySelectorAll('[data-tier]')];
  const ownedBtn = root.querySelector('[data-sk-owned="1"]');

  const stateText = (skin) => (progress.skin.id === skin.id ? 'stateEquipped' : progress.isUnlocked(skin) ? 'stateOwned' : 'stateLocked');

  const cardHtml = (skin) => {
    const tier = SKIN_TIERS[skin.tier];
    const open = progress.isUnlocked(skin);
    const inst = progress.instance(skin.id);
    const rare = open && inst ? rarePatternOf(skin, inst.seed) : null;
    const eq = progress.skin.id === skin.id;
    return `<li><button type="button" class="sk-card rarity-${skin.tier}${open ? '' : ' locked'}${eq ? ' equipped' : ''}" data-skin-id="${esc(skin.id)}" data-focus-key="skin-${esc(skin.id)}" style="--sk-a:${skin.palette.base};--sk-b:${skin.palette.accent}">
        <div class="shine"></div>
        <div class="sk-scene">
          <span class="sk-ico" aria-hidden="true">${tierIcon(skin.tier)}</span>
          <span class="sk-eq" aria-hidden="true">${esc(t('skins.stateEquipped'))}</span>
          <img class="sk-thumb" data-sk-thumb="${esc(skin.id)}" src="${(open && thumbs.cached(skin, inst)) || thumbs.preview(skin, 152)}" width="76" height="76" alt="" draggable="false">
          ${open ? '' : `<span class="sk-lock" aria-hidden="true">${icon('lock')}</span>`}
          ${open && inst?.counter?.enabled ? `<span class="sk-chip">${esc(t('skins.marker'))}</span>` : ''}
          ${rare ? `<span class="sk-chip sk-chip-rare">${icon('sparkle')} ${esc(t('skins.rare'))}</span>` : ''}
        </div>
        <div class="sk-strip">
          <b>${esc(skin.name)}</b>
          <small>${esc(tier.name)}</small>
          <small class="sk-state">${esc(t(`skins.${stateText(skin)}`))}</small>
        </div>
      </button></li>`;
  };

  // pinta la rejilla según filtros y estado actual; las miniaturas de la rejilla anterior se sueltan antes
  const render = () => {
    binding?.release();
    binding = null;
    const open = (s) => progress.isUnlocked(s);
    const shown = [...SKINS]
      .sort((a, b) => tierOrder(b) - tierOrder(a) || open(b) - open(a) || a.name.localeCompare(b.name, 'es'))
      .filter((s) => (filter.tier === 'all' || s.tier === filter.tier) && (filter.collection === 'all' || s.collection === filter.collection) && (!filter.owned || open(s)));
    if (!shown.length) {
      listState(list, { state: 'empty', emptyText: t('skins.empty') });
      return;
    }
    list.dataset.state = 'ready';
    list.innerHTML = `<ul class="sk-grid" aria-label="${esc(t('skins.listLabel'))}">${shown.map(cardHtml).join('')}</ul>`;
    // bloqueadas: silueta con el marcador 2D (no se renderiza nada en 3D); la equipada se mejora primero
    const byId = new Map(shown.map((s) => [s.id, s]));
    items = [...list.querySelectorAll('[data-sk-thumb]')]
      .map((img) => ({ img, skin: byId.get(img.dataset.skThumb) }))
      .filter((it) => it.skin && open(it.skin))
      .map((it) => ({ ...it, inst: progress.instance(it.skin.id), priority: it.skin.id === progress.skin.id }));
    binding = thumbs.bind(items);
  };

  // la caché de miniaturas es una mejora, no un requisito: la rejilla se pinta ya con los marcadores 2D y, si la caché
  // llega (puede no llegar nunca: IndexedDB colgada), solo se cambian los src de las imágenes, sin repintar la lista
  const applyCache = () => {
    if (gone) return;
    for (const { img, skin, inst } of items) {
      const url = thumbs.cached(skin, inst);
      if (url && img.src !== url) img.src = url;
    }
  };
  // solo falla de verdad si no se puede leer el progreso: error con Reintentar
  function load() {
    sc?.dispose();
    sc = scope.child();
    try {
      render();
    } catch {
      listState(list, { state: 'error', errorText: t('skins.loadError'), onRetry: load, scope: sc });
    }
  }

  for (const b of tierBtns) {
    scope.on(b, 'click', () => {
      filter.tier = lastFilter.tier = b.dataset.tier;
      for (const x of tierBtns) {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      }
      if (list.dataset.state === 'ready' || list.dataset.state === 'empty') render();
    });
  }
  scope.on(ownedBtn, 'click', () => {
    filter.owned = lastFilter.owned = !filter.owned;
    ownedBtn.classList.toggle('on', filter.owned);
    ownedBtn.setAttribute('aria-pressed', String(filter.owned));
    if (list.dataset.state === 'ready' || list.dataset.state === 'empty') render();
  });
  const coll = root.querySelector('[data-sk-coll="1"]');
  if (coll) {
    scope.on(coll, 'change', (e) => {
      filter.collection = lastFilter.collection = e.target.value;
      if (list.dataset.state === 'ready' || list.dataset.state === 'empty') render();
    });
  }
  for (const b of root.querySelectorAll('[data-go]')) scope.on(b, 'click', () => ctx.router.push(b.dataset.go));

  // pulsar una skin abre el inspector (#/skins/:id); al volver, el host remonta Skins y devuelve el foco a la tarjeta (data-focus-key)
  scope.on(list, 'click', (e) => {
    const btn = e.target?.closest?.('[data-skin-id]');
    const skin = btn && SKINS.find((s) => s.id === btn.dataset.skinId);
    if (!skin) return;
    btn.focus?.({ preventScroll: true }); // Safari no enfoca los botones al pulsar: el host necesita el foco para devolverlo
    pendingScroll = win?.scrollY ?? 0; // al volver se restaura antes de que el host devuelva el foco
    ctx.router.push('skin', { id: skin.id });
  });

  load();
  if (restoreY != null) win?.scrollTo?.(0, restoreY);
  Promise.resolve().then(() => thumbs.warm()).then(applyCache, () => {});
  return {
    title: t('skins.title'),
    destroy() {
      gone = true;
      items = [];
      binding?.release();
      binding = null;
      scope.dispose();
    },
  };
}
