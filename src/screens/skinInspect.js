// Inspector de skin (T033): pantalla apilada #/skins/:id. Sustituye al modal heredado de main.js.
// El visor 3D (three.js) llega con ctx.loadViewer() -> import() dinámico; sin él (o sin WebGL) queda el marcador 2D.
// Las flechas pasan a la skin anterior/siguiente en el orden de SKINS (da la vuelta al final) con router.replace.
import { SKINS, TIERS as SKIN_TIERS } from '../progress/skins.js';
import { backFloatButton, bindBackFloat, bindHeader, header } from './components.js';
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
  const tierColor = SKIN_TIERS[skin.tier]?.color ?? '#ffffff';
  const poster = `<img class="sk-view-poster" src="${esc(thumbs.cached(skin, inst) || thumbs.preview(skin, 288))}" alt="" draggable="false">`;
  const logro = !!skin.unlock?.challenge;
  const porCodigo = !!skin.unlock?.code;
  const multi = SKINS.length > 1;
  // canje por código (solo skins con unlock.code): mismo patrón que la rejilla de Skins
  const codigoHtml = porCodigo ? `<form class="sk-code" data-sk-code autocomplete="off">
          <label class="sr-only" for="sk-code-${esc(skin.id)}">${esc(t('skins.codeLabel'))}</label>
          <input class="sk-code-input" id="sk-code-${esc(skin.id)}" name="code" type="text" maxlength="32" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="${esc(t('skins.codePlaceholder'))}" data-sk-code-input>
          <button type="submit" class="primary sk-code-btn">${esc(t('skins.codeRedeem'))}</button>
        </form>
        <p class="sk-code-msg" role="status" data-sk-code-msg></p>` : '';
  root.innerHTML = `<main class="screen sk-inspect rarity-${esc(skin.tier)}" style="--tier:${esc(tierColor)}" aria-label="${esc(t('skins.inspectLabel', { name: skin.name }))}">
    <div class="sk-view-stage">
      <div class="sk-view-title"><b>${esc(skin.name)}</b><small>${esc(SKIN_TIERS[skin.tier]?.name ?? '')}</small></div>
      <button type="button" class="sk-view-nav prev" aria-label="${esc(t('skins.navPrev'))}"${multi ? '' : ' hidden'}>${icon('back')}</button>
      <button type="button" class="sk-view-nav next" aria-label="${esc(t('skins.navNext'))}"${multi ? '' : ' hidden'}>${icon('next')}</button>
      <div class="sk-view-canvas" data-sk-canvas>${poster}</div>
      <div class="sk-view-lock" data-sk-lock hidden><span class="sk-lock sk-lock-big" aria-hidden="true">${icon('lock')}</span><div class="sk-view-req"><small data-sk-req></small><span class="bar"><i data-sk-bar></i></span></div>${codigoHtml}</div>
      <p class="sk-view-loading" role="status" data-sk-loading>${esc(t('skins.inspectViewer'))}</p>
      <div class="sk-view-actions"><button type="button" class="primary sk-equip" data-sk-equip></button></div>
    </div>
    <p class="sr-only" data-sk-state></p>
    <p class="sr-only" data-sk-how></p>
    <p class="sr-only" role="status" data-sk-live></p>
    ${backFloatButton()}
  </main>`;
  bindBackFloat(root, { ...ctx, scope });
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
    root.querySelector('[data-sk-req]').textContent = req.text;
    root.querySelector('[data-sk-how]').textContent = t(logro ? 'skins.inspectHowLogro' : 'skins.inspectHowReq', { text: req.text });
    root.querySelector('[data-sk-bar]').style.width = `${req.ratio * 100}%`;
  };
  sync();
  scope.on(equipBtn, 'click', () => {
    if (!progress.equip(skin.id)) return;
    sync();
    root.querySelector('[data-sk-live]').textContent = t('skins.inspectEquipped', { name: skin.name });
  });
  // canje: al acertar, la skin pasa a desbloqueada (sync oculta el bloqueo y activa Equipar) y se reclama la recompensa
  const codeForm = porCodigo ? root.querySelector('[data-sk-code]') : null;
  if (codeForm) scope.on(codeForm, 'submit', (e) => {
    e.preventDefault();
    const input = root.querySelector('[data-sk-code-input]');
    const msg = root.querySelector('[data-sk-code-msg]');
    if (!input.value.trim()) return;
    const res = progress.redeemCode(input.value);
    msg.textContent = t(`skins.code_${res.status}`, { name: res.skin?.name ?? skin.name });
    msg.dataset.kind = res.status === 'ok' ? 'info' : 'error';
    if (res.status === 'invalid') return;
    input.value = '';
    if (res.status !== 'ok') return;
    ctx.notify?.({ kind: 'info', title: t('skins.code_ok', { name: res.skin.name }) });
    sync();
    equipBtn.focus?.({ preventScroll: true }); // el campo desaparece con el bloqueo: el foco pasa a Equipar
    try { ctx.actions?.claimRewards?.(); } catch { /* reclamar la recompensa es una mejora, no bloquea el canje */ }
  });
  root.querySelector('[data-lobby]')?.focus?.({ preventScroll: true });

  // navegación: la skin anterior/siguiente en el orden de SKINS, dando la vuelta al final; cambia la ruta (replace)
  // «target» avanza con cada pulsación aunque la pantalla nueva aún esté montando: dos flechas seguidas = dos skins
  let target = SKINS.findIndex((s) => s.id === skin.id);
  const go = (delta) => {
    if (!multi) return;
    target = (target + delta + SKINS.length) % SKINS.length;
    const next = SKINS[target];
    if (next && next.id !== skin.id) ctx.router.replace('skin', { id: next.id });
  };
  scope.on(root.querySelector('.sk-view-nav.prev'), 'click', () => go(-1));
  scope.on(root.querySelector('.sk-view-nav.next'), 'click', () => go(1));
  if (multi && scope.doc) scope.on(scope.doc, 'keydown', (e) => {
    // Alt+flechas es atrás/adelante del navegador; con modificadores o tecla mantenida no se navega
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) return;
    if (e.target?.matches?.('input, textarea, select, [contenteditable]')) return; // escribir el código no navega
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  });

  // el visor 3D (three.js + materiales) se descarga solo ahora; mount no lo espera
  const stop = () => { if (loading) loading.hidden = true; };
  Promise.resolve().then(() => ctx.loadViewer()).then((create) => {
    if (gone) return;
    viewer = create(box, { skin, instance: inst ?? undefined, mode: 'fullscreen', autoSpin: true, noEnv: true });
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
