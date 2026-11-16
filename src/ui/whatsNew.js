// Modal de novedades: se abre una vez por versión nueva. Reutiliza las clases del diálogo de motivo (overlay, reason-card).
import { t } from '../screens/texts/index.js';
import '../screens/texts/whatsNew.js';
import { esc } from '../screens/shared.js';
import { RELEASE_NOTES, CURRENT_VERSION } from './releaseNotes.js';
import { notesFor, shouldShow, readSeen, writeSeen } from './whatsNewRules.js';

// Versiones mostradas en esta carga de página: solo cuenta si localStorage falla.
const shownThisLoad = new Set();

/**
 * Muestra el modal si toca. Devuelve { close } o null. Cerrar con «Entendido» o Esc no guarda nada;
 * «No volver a mostrar» guarda la versión.
 */
export function maybeShowWhatsNew({ scope, storage, notes = RELEASE_NOTES, current = CURRENT_VERSION, returnTo = null } = {}) {
  const doc = scope?.doc;
  if (!doc) return null;
  const { seen, ok } = readSeen(storage);
  if (!shouldShow({ seen, current, notes, storageOk: ok, shownNow: shownThisLoad.has(current) })) return null;
  shownThisLoad.add(current);
  const entry = notesFor(notes, current);
  const id = 'wn-' + current.replace(/\W/g, '');
  const sc = scope.child ? scope.child() : scope;

  const el = doc.createElement('div');
  el.className = 'overlay reason-overlay';
  el.innerHTML = `<div class="reason-card" role="dialog" aria-modal="true" aria-labelledby="${id}-t">`
    + `<div class="reason-head"><h2 class="reason-title" id="${id}-t">${esc(t('whatsNew.title'))} ${esc(current)}</h2></div>`
    + `<ul class="reason-body" style="text-align:left;padding-left:1.2em">${entry.items.map((k) => `<li>${esc(t(k))}</li>`).join('')}</ul>`
    + `<div class="reason-actions">`
    + `<button type="button" class="close reason-btn reason-btn-primary" data-wn="close">${esc(t('whatsNew.close'))}</button>`
    + `<button type="button" class="reason-btn reason-btn-ghost" data-wn="never">${esc(t('whatsNew.noShowAgain'))}</button>`
    + '</div></div>';

  let closed = false;
  const handle = {
    el,
    close({ restoreFocus = true } = {}) {
      if (closed) return;
      closed = true;
      el.remove();
      if (sc !== scope) sc.dispose();
      try { if (restoreFocus) returnTo?.focus?.(); } catch { /* el origen pudo desaparecer */ }
    },
  };
  const btnClose = el.querySelector('[data-wn="close"]');
  const btnNever = el.querySelector('[data-wn="never"]');
  sc.on(btnClose, 'click', () => handle.close());
  sc.on(btnNever, 'click', () => { writeSeen(storage, current); handle.close(); });
  sc.on(el, 'click', (e) => { if (e.target === el) handle.close(); });
  sc.on(el, 'keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault?.(); e.stopPropagation?.(); handle.close(); return; }
    if (e.key !== 'Tab') return;
    const first = btnClose, last = btnNever, on = doc.activeElement;
    if (e.shiftKey && on === first) { e.preventDefault?.(); last.focus?.(); } else if (!e.shiftKey && on === last) { e.preventDefault?.(); first.focus?.(); }
  });
  doc.body.append(el);
  btnClose.focus?.({ preventScroll: true });
  return handle;
}

/** ¿Toca mostrar novedades? Sin efectos: el hub solo programa el aviso cuando es cierto. */
export function whatsNewDue({ storage, notes = RELEASE_NOTES, current = CURRENT_VERSION } = {}) {
  const { seen, ok } = readSeen(storage);
  return shouldShow({ seen, current, notes, storageOk: ok, shownNow: shownThisLoad.has(current) });
}
