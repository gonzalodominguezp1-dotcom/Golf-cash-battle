// Pantalla Novedades (ruta #/novedades): cambios de cada versión, de la más reciente a la más antigua.
// Sustituye al aviso emergente de novedades; los datos salen de ui/releaseNotes.js.
// El CSS (novedades.css) lo importa el arranque, no este módulo, para poder probarlo en Node.
import { bindHeader, bindLobby, header, lobbyButton } from './components.js';
import { esc } from './shared.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/novedades.js';
import './texts/whatsNew.js';
import { RELEASE_NOTES } from '../ui/releaseNotes.js';

/** HTML de las versiones con puntos; sin ninguna, un mensaje vacío. */
export function versionsHtml(notes = RELEASE_NOTES) {
  const list = (notes ?? []).filter((n) => n?.version && Array.isArray(n.items) && n.items.length);
  if (!list.length) return `<p class="novedades-empty">${esc(t('novedades.empty'))}</p>`;
  return list.map((n) => `<section class="novedades-ver" data-novedades-ver="${esc(n.version)}">`
    + `<h2>${esc(t('novedades.version'))} ${esc(n.version)}</h2>`
    + `<ul>${n.items.map((k) => `<li>${esc(t(k))}</li>`).join('')}</ul></section>`).join('');
}

export function mount(root, ctx) {
  const scope = ctx.scope.child();
  root.innerHTML = `<main class="screen novedades">
    ${header({ title: t('novedades.title') })}
    <div class="novedades-body">
      <p class="novedades-sub">${esc(t('novedades.sub'))}</p>
      ${versionsHtml()}
    </div>
    ${lobbyButton()}
  </main>`;
  bindHeader(root, { ...ctx, scope });
  bindLobby(root, { ...ctx, scope });
  return { title: t('novedades.title'), destroy() { scope.dispose(); } };
}
