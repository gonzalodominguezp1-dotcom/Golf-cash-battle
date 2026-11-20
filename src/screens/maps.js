// Pantalla Mapas (T038): selector de juego libre. Solo el título y la rejilla de mapas: cada tarjeta lleva
// nombre arriba, la vista previa y un botón «Practicar hoyo». Mismo flujo que siempre: ctx.actions.playFreePlay(índice | 'tiebreak').
// El botón flotante «Lobby» (components.js) vuelve al hub. El resultado de la partida sigue en main.js y vuelve a esta ruta.
import { COURSES, TIEBREAK_COURSE } from '../game/courses.js';
import { staticCoursePreview } from '../game/render/coursePreviewStatic.js';
import { bindLobby, header, listState, lobbyButton } from './components.js';
import { esc } from './shared.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/maps.js';

const NET_TIMEOUT_MS = 8000; // las vistas previas sin WebP se descargan (three.js): si la red no responde, error con Reintentar

const defaultLoadPreviews = () => import('../game/render/coursePreview.js');

export function mount(root, ctx) {
  const scope = ctx.scope.child();
  const courses = ctx.courses ?? COURSES;
  const tiebreak = ctx.tiebreak ?? TIEBREAK_COURSE;
  let gone = false, run = 0, sc = null;

  ctx.leavePlay?.(); // al entrar: cerrar final y sala en vivo, liberar la partida
  root.innerHTML = `<main class="screen freeplay-select" aria-label="${esc(t('maps.title'))}">${header({ title: t('maps.title'), back: false })}<div class="maps-host" data-maps-host></div>${lobbyButton()}</main>`;
  bindLobby(root, { ...ctx, scope });
  const host = root.querySelector('[data-maps-host]');

  const timed = (promise) => new Promise((resolve, reject) => {
    const cancel = scope.timeout(() => reject(new Error('timeout')), NET_TIMEOUT_MS);
    Promise.resolve(promise).then((v) => { cancel(); resolve(v); }, (e) => { cancel(); reject(e); });
  });

  // cada repintado suelta lo del anterior (el listener de la cuadrícula o el del botón Reintentar)
  function fresh() {
    sc?.dispose();
    sc = scope.child();
  }

  function paintState(state) {
    fresh();
    listState(host, { state, errorText: t('maps.loadError'), onRetry: () => load(), scope: sc });
  }

  function card({ name, previewSrc, alt, play }) {
    return `<article class="map-card">
        <h2 class="map-name">${esc(name)}</h2>
        <div class="map-preview"><img class="map-img" src="${esc(previewSrc)}" alt="${esc(alt)}" loading="lazy" /></div>
        <button type="button" class="primary map-play" data-play="${esc(play)}">${esc(t('maps.practice'))}</button>
      </article>`;
  }

  // previews: lo que cada mapa muestra (WebP estático o, si no hay, la imagen que dibuja three.js)
  const cards = (previews) => {
    const list = courses.map((course, idx) => card({
      name: course.name, previewSrc: previews.get(course) ?? '', alt: t('maps.previewAlt', { name: course.name }), play: String(idx),
    }));
    list.push(card({ name: t('maps.tbName'), previewSrc: previews.get(tiebreak) ?? '', alt: t('maps.tbAlt'), play: 'tiebreak' }));
    return list.join('');
  };

  function paintReady(previews) {
    fresh();
    listState(host, { state: 'ready' });
    host.innerHTML = `<div class="maps-grid">${cards(previews)}</div>`;
    sc.on(host, 'click', (ev) => {
      const el = ev.target?.closest?.('[data-play]');
      if (!el || gone) return;
      const v = el.dataset.play;
      ctx.actions.playFreePlay(v === 'tiebreak' ? 'tiebreak' : Number(v));
    });
  }

  // los mapas sin WebP pre-renderizado se dibujan con three.js (import() solo si hace falta)
  async function buildPreviews() {
    const previews = new Map();
    const all = [...courses, tiebreak];
    const missing = all.filter((c) => !staticCoursePreview(c));
    for (const c of all) previews.set(c, staticCoursePreview(c) ?? '');
    if (missing.length) {
      const mod = await timed((ctx.loadPreviews ?? defaultLoadPreviews)());
      for (const c of missing) previews.set(c, mod.getCoursePreview(c));
    }
    return previews;
  }

  function load() {
    const my = ++run;
    paintState('loading');
    buildPreviews().then(
      (previews) => { if (my === run && !gone) paintReady(previews); },
      () => { if (my === run && !gone) paintState('error'); },
    );
  }

  load();
  return { destroy() { gone = true; run++; scope.dispose(); } };
}
