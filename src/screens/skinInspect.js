// Inspector de skin (T033): pantalla apilada #/skins/:id. Sustituye al modal heredado de main.js.
// El visor 3D (three.js) llega con ctx.loadViewer() -> import() dinámico; sin él (o sin WebGL) queda el marcador 2D.
import { SKINS, TIERS as SKIN_TIERS } from '../progress/skins.js';
import { tierIcon } from '../ui/icons.js';
import { bindHeader, button, header } from './components.js';
import { esc } from './shared.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/skins.js';

export async function mount(root, ctx, params = {}) {
  const { progress, thumbs } = ctx;
  const scope = ctx.scope.child();
  const skin = SKINS.find((s) => s.id === params?.id);
  if (!skin) {
    // id desconocido: aviso claro y atrás (a Skins, que es el padre de esta ruta, también en entrada directa)
    root.innerHTML = `<main class="screen">${header({ title: t('skins.title') })}<p class="scr-state" role="alert">${esc(t('skins.inspectUnknown'))}</p></main>`;
    bindHeader(root, { ...ctx, scope });
    ctx.notify?.({ kind: 'info', title: t('skins.inspectUnknown') });
    ctx.router.back();
    return { destroy() { scope.dispose(); } };
  }
  const icon = (n, o = {}) => ctx.icon(n, o);
  const inst = progress.instance(skin.id);
  const poster = `<img class="sk-view-poster" src="${esc(thumbs.cached(skin, inst) || thumbs.preview(skin, 288))}" alt="" draggable="false">`;
  const logro = !!skin.unlock?.challenge;
  root.innerHTML = `<main class="screen sk-inspect rarity-${esc(skin.tier)}" aria-label="${esc(t('skins.inspectLabel', { name: skin.name }))}">
    ${header({ title: skin.name })}
    <div class="sk-view-stage">
      <div class="sk-view-canvas" data-sk-canvas>${poster}</div>
      <div class="sk-view-lock" data-sk-lock hidden><span class="sk-lock sk-lock-big" aria-hidden="true">${icon('lock')}</span><span class="bar"><i data-sk-bar></i></span></div>
      <p class="sk-view-loading" role="status" data-sk-loading>${esc(t('skins.inspectViewer'))}</p>
    </div>
    <section class="sk-view-info">
      <p><small>${esc(t('skins.inspectState'))}</small><b data-sk-state></b><span class="sk-view-tier">${tierIcon(skin.tier)} ${esc(SKIN_TIERS[skin.tier]?.name ?? '')}</span></p>
      <p><small>${esc(t('skins.inspectHow'))}</small><span data-sk-how></span>${logro ? button({ label: t('skins.logrosLink'), attrs: 'data-go="achievements"' }) : ''}</p>
      <p class="sr-only" role="status" data-sk-live></p>
    </section>
    <div class="sk-view-actions"><button type="button" class="primary sk-equip" data-sk-equip></button></div>
  </main>`;
  bindHeader(root, { ...ctx, scope });
  const box = root.querySelector('[data-sk-canvas]');
  const lockBox = root.querySelector('[data-sk-lock]');
  const loading = root.querySelector('[data-sk-loading]');
  const equipBtn = root.querySelector('[data-sk-equip]');
  const stateEl = root.querySelector('[data-sk-state]');
  let gone = false, viewer = null;

  const sync = () => {
    const req = progress.requirement(skin);
    const open = req.ratio >= 1;
    const eq = progress.skin.id === skin.id;
    stateEl.textContent = t(eq ? 'skins.stateEquipped' : open ? 'skins.stateOwned' : 'skins.stateLocked');
    equipBtn.disabled = eq || !open;
    equipBtn.innerHTML = eq ? `${icon('check')}${esc(t('skins.stateEquipped'))}` : esc(t(open ? 'skins.inspectEquip' : 'skins.stateLocked'));
    lockBox.hidden = open;
    root.querySelector('[data-sk-how]').textContent = t(logro ? 'skins.inspectHowLogro' : 'skins.inspectHowReq', { text: req.text });
    root.querySelector('[data-sk-bar]').style.width = `${req.ratio * 100}%`;
  };
  sync();
  scope.on(equipBtn, 'click', () => {
    if (!progress.equip(skin.id)) return;
    sync();
    root.querySelector('[data-sk-live]').textContent = t('skins.inspectEquipped', { name: skin.name });
  });
  if (logro) scope.on(root.querySelector('[data-go="achievements"]'), 'click', () => ctx.router.push('achievements'));
  root.querySelector('[data-back]')?.focus?.({ preventScroll: true });

  // el visor 3D (three.js + materiales) se descarga solo ahora; mount no lo espera
  const stop = () => { if (loading) loading.hidden = true; };
  Promise.resolve().then(() => ctx.loadViewer()).then((create) => {
    if (gone) return;
    viewer = create(box, { skin, instance: inst ?? undefined, mode: 'fullscreen' });
    if (viewer?.stats?.().webgl === false) { // sin WebGL: se libera el visor y vuelve el marcador 2D
      try { viewer.destroy(); } catch { /* ya no se usa */ }
      viewer = null;
      box.innerHTML = poster;
    } else root.querySelector('.sk-stage')?.append(lockBox); // el candado va sobre la bola
    stop();
  }).catch(() => { viewer = null; if (!gone) stop(); }); // three/WebGL no disponibles: queda el marcador 2D

  return {
    title: skin.name,
    destroy() {
      gone = true;
      try { viewer?.destroy(); } catch { /* el renderer ya estaba liberado */ }
      viewer = null;
      scope.dispose();
    },
  };
}
