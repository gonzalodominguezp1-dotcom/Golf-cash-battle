// Aviso flotante de emparejamiento: fijo arriba, sobre cualquier pantalla, mientras hay una búsqueda activa y su
// sala no está a la vista (p. ej. tras «Volver al lobby»). Enseña «buscando», la cuenta atrás en vivo (o los
// jugadores, en práctica) y un botón para cancelar. Tocar el cuerpo vuelve a la sala.
// Se monta una vez en document.body (como los avisos de notifyPopup.js, que se apartan hacia abajo con
// html.has-mmb). Solo escucha eventos de la búsqueda (src/match/matchmakingController.js): sin sondeos.
// Se construye con createElement (no innerHTML para lo que cambia) para poder probarlo sin DOM real.
import { icon } from './icons.js';
import { bannerState, ringTiming, tierFoilClass } from './matchmakingRules.js';
import { activeSearch, onActiveSearch } from '../match/matchmakingController.js';
import { t } from '../screens/texts/index.js';
import '../screens/texts/matchmaking.js';

const OUT_MS = 260;

/**
 * @param {object} [o]
 * @param {Document} [o.doc]
 * @param {object} [o.timers] setTimeout/clearTimeout
 * @param {{ active: () => any, onActive: (fn) => () => void }} [o.source] de dónde sale la búsqueda activa
 * @param {(search) => void} [o.onOpen] volver a la sala (router)
 * @param {(search) => any} [o.onCancel] cancelar (por defecto search.cancel())
 * @param {() => void} [o.sound] tic de los últimos segundos
 */
export function mountMatchmakingBanner(o = {}) {
  const doc = o.doc ?? document;
  const timers = o.timers ?? globalThis;
  const source = o.source ?? { active: activeSearch, onActive: onActiveSearch };
  const mk = (tag, cls, attrs = {}) => {
    const el = doc.createElement(tag);
    if (cls) el.className = cls;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  const root = mk('div', 'mmb', { role: 'region', 'aria-label': t('matchmaking.bannerRegion') });
  root.hidden = true;
  const open = mk('button', 'mmb-open', { type: 'button', 'aria-label': t('matchmaking.bannerOpen') });
  const radar = mk('span', 'mmb-radar', { 'aria-hidden': 'true' });
  radar.appendChild(mk('i', 'mmb-sweep'));
  radar.appendChild(mk('i', 'mmb-ping'));
  const text = mk('span', 'mmb-text');
  const title = mk('b', 'mmb-title', { role: 'status', 'aria-live': 'polite' });
  const sub = mk('small', 'mmb-sub', { role: 'timer', 'aria-live': 'off' });
  text.appendChild(title);
  text.appendChild(sub);
  open.appendChild(radar);
  open.appendChild(text);
  const cancel = mk('button', 'mmb-cancel', { type: 'button', 'aria-label': t('matchmaking.bannerCancel'), title: t('matchmaking.bannerCancel') });
  cancel.innerHTML = icon('close');
  const bar = mk('i', 'mmb-bar', { 'aria-hidden': 'true' });
  const fill = mk('i', 'mmb-bar-fill mm-clock');
  bar.appendChild(fill);
  root.appendChild(open);
  root.appendChild(cancel);
  root.appendChild(bar);
  doc.body.appendChild(root);

  let search = null;
  let off = null;
  let shown = false;
  let outTimer = null;
  let barEnd = null;
  let barFlip = 0;
  let titleTxt = '';

  const setShown = (on) => {
    if (on === shown) return;
    shown = on;
    doc.documentElement?.classList.toggle('has-mmb', on);
    if (outTimer != null) { timers.clearTimeout(outTimer); outTimer = null; }
    if (on) {
      root.hidden = false;
      root.classList.remove('is-out');
      root.classList.add('is-in');
    } else {
      root.classList.remove('is-in');
      root.classList.add('is-out');
      outTimer = timers.setTimeout(() => {
        outTimer = null;
        root.hidden = true;
        root.classList.remove('is-out');
      }, OUT_MS);
    }
  };

  // barra de tiempo: una animación lineal (scaleX) con la duración real; solo se reinicia si cambia la llegada
  const syncBar = (c) => {
    if (!c) {
      barEnd = null;
      fill.style.animation = 'none';
      fill.style.transform = `scaleX(${search ? search.filled() / search.seats : 0})`;
      return;
    }
    const end = Date.now() + c.msLeft;
    if (barEnd != null && Math.abs(end - barEnd) < 200) return;
    barEnd = end;
    const { duration, delay } = ringTiming(c.msLeft, c.total);
    barFlip ^= 1;
    fill.style.transform = '';
    fill.style.animation = `mmbBar${barFlip} ${duration}ms linear ${delay}ms both`;
  };

  const render = () => {
    const st = bannerState(search);
    if (!st.visible) return setShown(false);
    root.className = `mmb tier--${search.tier.id} ${tierFoilClass(search.tier.id)}${st.urgent ? ' is-urgent' : ''}${st.launching ? ' is-launching' : ''}${st.error ? ' is-error' : ''}${shown ? ' is-in' : ''}`;
    const nextTitle = st.error
      ? (search.status || t('matchmaking.bannerError'))
      : st.launching
        ? t('matchmaking.bannerLaunching')
        : `${t('matchmaking.bannerTitle')} · ${search.tier.name}`;
    if (nextTitle !== titleTxt) title.textContent = titleTxt = nextTitle; // el lector solo oye los cambios de fase
    const players = t('matchmaking.bannerPlayers', { n: st.filled, m: st.seats });
    sub.textContent = st.error
      ? (search.status ? t('matchmaking.bannerErrorHint') : players)
      : st.secs != null && !st.launching ? `${t('matchmaking.bannerSecs', { n: st.secs })} · ${players}` : players;
    cancel.disabled = !st.canCancel;
    syncBar(search.countdown());
    setShown(true);
  };

  const onEvent = (ev) => {
    if (ev.type === 'second' && ev.urgent && shown) o.sound?.();
    render();
  };

  const follow = (s) => {
    off?.();
    off = null;
    search = s && !s.ended ? s : null;
    barEnd = null;
    titleTxt = '';
    if (search) off = search.subscribe(onEvent);
    render();
  };

  const offActive = source.onActive(follow);
  const onOpen = () => { if (search) o.onOpen?.(search); };
  const onCancel = async () => {
    const s = search;
    if (!s || cancel.disabled) return;
    cancel.disabled = true;
    await (o.onCancel ? o.onCancel(s) : s.cancel());
  };
  open.addEventListener('click', onOpen);
  cancel.addEventListener('click', onCancel);
  follow(source.active());

  return {
    el: root,
    /** Para pruebas y depuración: ¿se ve ahora? */
    get shown() { return shown; },
    destroy() {
      offActive?.();
      off?.();
      if (outTimer != null) timers.clearTimeout(outTimer);
      open.removeEventListener('click', onOpen);
      cancel.removeEventListener('click', onCancel);
      doc.documentElement?.classList.toggle('has-mmb', false);
      root.remove();
    },
  };
}
