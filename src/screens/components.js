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
