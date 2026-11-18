// Utilidades de pintado compartidas por las pantallas (movidas de main.js sin cambiar comportamiento).
import { icon } from '../ui/icons.js';
import { avatarIcon } from '../ui/icons.js';
import { thumbCached } from '../ui/skinThumbs.js';
import { ballPreview } from '../game/render/ballPaint.js';
import { iconById } from '../progress/avatar.js';
import { frameStyle } from '../progress/prestige.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
export const coin = (n) => `${icon('coin', { cls: 'coin' })}${fmt(n)}`;

export const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

/** Cara del avatar: imagen propia, icono elegido o la inicial del nombre. */
export const avatarFace = (av, initial) =>
  av?.image ? `<img src="${av.image}" alt="">`
    : av?.icon ? `<span class="pf-glyph">${avatarIcon(iconById(av.icon).id)}</span>`
      : `<b class="pf-initial">${esc(String(initial || '?')[0])}</b>`;

/** Avatar con marco de prestigio. size: xs | sm | lg. */
export const avatarHtml = ({ size = 'sm', frame = null, av = null, initial = '?' }) =>
  `<span class="pf pf-${size} ${frame ? `pf-framed pf-${frame.id}` : ''}" style="${frameStyle(frame)}"><i class="pf-halo"></i><i class="pf-wing l"></i><i class="pf-wing r"></i><i class="pf-ring"></i><span class="pf-face">${avatarFace(av, initial)}</span><i class="pf-gem"></i></span>`;

/**
 * Crea `ball` ligada a la instancia de Progress (necesita saber el skin equipado/instancia).
 * miniatura estática si ya está en caché; si no, marcador 2D que installThumbObserver cambia por ella (data-skin-id)
 */
export const createBall = (progress) => (skin, size = 96, cls = '') => {
  const cached = thumbCached(skin, progress.instance(skin.id));
  return `<img class="ball-img ${cls}" src="${cached ?? ballPreview(skin, size * 2)}" data-skin-id="${skin.id}"${cached ? ' data-hd="1"' : ''} width="${size}" height="${size}" alt="">`;
};
