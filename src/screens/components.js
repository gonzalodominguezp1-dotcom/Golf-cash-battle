// Componentes comunes de las pantallas: HTML en cadena + enlazadores mínimos. Sin estado global.
// El CSS (screens.css) lo importa el arranque, no este módulo, para poder probarlo en Node.
import { esc } from './shared.js';
import { t } from './texts/index.js';
import './texts/common.js';

const BACK_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Cabecera con botón volver (≥44 px), título y saldo opcional. */
export function header({ title, back = true, balanceHtml = null, actionsHtml = '' }) {
  const backBtn = back
    ? `<button type="button" class="scr-back" data-back aria-label="${esc(t('common.back'))}">${BACK_ICON}</button>`
    : '';
  const balance = balanceHtml ? `<span class="scr-balance">${balanceHtml}</span>` : '';
  return `<header class="scr-head">${backBtn}<h1 class="scr-title">${esc(title)}</h1>${balance}${actionsHtml}</header>`;
}

export function card({ cls = '', body = '' }) {
  return `<section class="scr-card ${cls}">${body}</section>`;
}

export function button({ label, kind = 'secondary', attrs = '' }) {
  return `<button type="button" class="scr-btn scr-btn-${kind}" ${attrs}>${esc(label)}</button>`;
}

/** Punto de novedades con texto accesible. '' si no hay nada. */
export function badge({ count, label }) {
  if (!(count > 0)) return '';
  const text = label || t('common.news', { n: count });
  return `<span class="scr-badge"><i class="scr-badge-dot" aria-hidden="true"></i><span class="sr-only">${esc(text)}</span></span>`;
}

/** Pinta el estado de una lista dentro de `el`. En `ready` no toca el contenido: lo pone quien llama. */
export function listState(el, { state, emptyText, errorText, onRetry, scope } = {}) {
  el.dataset.state = state;
  if (state === 'ready') return;
  if (state === 'loading') {
    el.innerHTML = `<p class="scr-state" role="status">${esc(t('common.loading'))}</p>`;
  } else if (state === 'empty') {
    el.innerHTML = `<p class="scr-state">${esc(emptyText ?? t('common.empty'))}</p>`;
  } else {
    el.innerHTML = `<div class="scr-state scr-state-error" role="alert"><p>${esc(errorText ?? t('common.error'))}</p>${button({ label: t('common.retry'), kind: 'secondary', attrs: 'data-retry' })}</div>`;
    const btn = el.querySelector('[data-retry]');
    if (btn && onRetry) {
      if (scope) scope.on(btn, 'click', onRetry);
      else btn.addEventListener('click', onRetry);
    }
  }
}

/** Conecta el botón volver de la cabecera con el router. */
export function bindHeader(root, ctx) {
  const btn = root.querySelector('[data-back]');
  if (!btn) return;
  const go = () => ctx.router.back();
  if (ctx.scope) ctx.scope.on(btn, 'click', go);
  else btn.addEventListener('click', go);
}

/** Botón «Lobby» fijo abajo a la izquierda (screens.css): lleva a la raíz (hub) con router.reset(). */
export function lobbyButton() {
  return `<button type="button" class="scr-lobby" data-lobby aria-label="${esc(t('common.lobbyLabel'))}">${esc(t('common.lobby'))}</button>`;
}

/** Conecta el botón «Lobby» con el router: vuelve a la raíz (hub). */
export function bindLobby(root, ctx) {
  const btn = root.querySelector('[data-lobby]');
  if (!btn) return;
  const go = () => ctx.router.reset();
  if (ctx.scope) ctx.scope.on(btn, 'click', go);
  else btn.addEventListener('click', go);
}

// ---------- diálogo de motivo (accesos bloqueados y requisitos) ----------
const openDialogs = new WeakMap(); // doc -> manejador del diálogo abierto (solo uno a la vez)
let dialogSeq = 0;

/**
 * Diálogo modal accesible con un título, un motivo y botones. Se monta en doc.body con la clase `.overlay`, que es el mecanismo
 * con el que el manejador global de teclado de main.js ya trata los overlays (Esc pulsa el primer `.close`; Intro, el primer botón
 * que no sea `.close`). El botón de cierre va primero en el DOM por eso.
 *   reasonDialog({ title, body, closeLabel, actions: [{ label, onClick }], iconHtml, returnTo, onClose, scope, doc })
 * close({ restoreFocus: false }) cierra sin devolver el foco (hub tapado por otra pantalla). `actions` son acciones primarias: cierran el diálogo y luego llaman a onClick. Devuelve { close(), el }; cerrar dos veces no hace nada.
 * Sus listeners cuelgan de un scope hijo: al cerrar (o al liberar el scope padre) no queda nada vivo.
 */
export function reasonDialog({ title, body, closeLabel, actions = [], iconHtml = '', returnTo = null, onClose, scope, doc = scope?.doc } = {}) {
  openDialogs.get(doc)?.close();
  const sc = scope.child ? scope.child() : scope;
  const id = `rd${++dialogSeq}`;
  const el = doc.createElement('div');
  el.className = 'overlay reason-overlay';
  el.innerHTML = `<div class="reason-card" role="dialog" aria-modal="true" aria-labelledby="${id}-t" aria-describedby="${id}-d">`
    + `<div class="reason-head"><span class="reason-ico" aria-hidden="true">${iconHtml}</span><h2 class="reason-title" id="${id}-t">${esc(title)}</h2></div>`
    + `<p class="reason-body" id="${id}-d">${esc(body)}</p>`
    + `<div class="reason-actions"><button type="button" class="close reason-btn reason-btn-ghost" data-rd="close">${esc(closeLabel)}</button>`
    + actions.map((a, i) => `<button type="button" class="reason-btn reason-btn-primary" data-rd="a${i}">${esc(a.label)}</button>`).join('')
    + '</div></div>';
  const buttons = [...el.querySelectorAll('[data-rd]')];
  let closed = false;
  const handle = {
    el,
    close({ restoreFocus = true } = {}) {
      if (closed) return;
      closed = true;
      if (openDialogs.get(doc) === handle) openDialogs.delete(doc);
      el.remove();
      if (sc !== scope) sc.dispose();
      try { if (restoreFocus) returnTo?.focus?.(); } catch { /* el botón de origen pudo desaparecer */ }
      onClose?.();
    },
  };
  openDialogs.set(doc, handle);
  buttons.forEach((b) => {
    const a = actions[Number(b.dataset.rd.slice(1))];
    sc.on(b, 'click', () => { handle.close(); if (b.dataset.rd !== 'close') a?.onClick?.(); });
  });
  sc.on(el, 'click', (e) => { if (e.target === el) handle.close(); }); // clic en el fondo
  sc.on(el, 'keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault?.(); e.stopPropagation?.(); handle.close(); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation?.(); return; } // Intro/espacio pulsan el botón con foco, no el «primario» del manejador global
    if (e.key !== 'Tab' || !buttons.length) return;
    const first = buttons[0], last = buttons[buttons.length - 1], on = doc.activeElement;
    if (e.shiftKey && on === first) { e.preventDefault?.(); last.focus?.(); } else if (!e.shiftKey && on === last) { e.preventDefault?.(); first.focus?.(); }
    else if (!buttons.includes(on)) { e.preventDefault?.(); first.focus?.(); }
  });
  doc.body.append(el);
  buttons[0]?.focus?.({ preventScroll: true }); // foco inicial en «Entendido»: una Intro mantenida no pulsa la acción nada más abrirse; la acción útil queda a un Tab
  return handle;
}
