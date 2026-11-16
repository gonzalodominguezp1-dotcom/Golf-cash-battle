// Pantalla Mapas (T038): el selector de juego libre que pintaba showFreePlayCourseSelect en main.js, ahora como pantalla del router.
// Mismo catálogo, mismas tarjetas y mismo flujo: elegir hoyo y jugar (ctx.actions.playFreePlay). El resultado de la partida
// («Elegir otro mapa», «Lobby principal») sigue en main.js y vuelve a esta ruta. El CSS de las tarjetas sigue en style.css.
import { COURSES, TIEBREAK_COURSE } from '../game/courses.js';
import { getCourseDistance, staticCoursePreview } from '../game/render/coursePreviewStatic.js';
import { bindHeader, header, listState } from './components.js';
import { esc } from './shared.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/maps.js';

const NET_TIMEOUT_MS = 8000; // las vistas previas sin WebP se descargan (three.js): si la red no responde, error con Reintentar

const THEME_COLORS = {
  meadow: '#5cc24a', meadowDay: '#6fd24f', beach: '#2fe0ff', sunset: '#ff9a5c', snow: '#90d7ff', glacier: '#9fd6ee', canyon: '#e58f4a',
  autumn: '#e06b3a', night: '#7a8bff', gardenNight: '#da70d6', volcano: '#ff4d2e', beachNight: '#00d2be', neon: '#00e5ff', neonPink: '#ff2e93',
};

const defaultLoadPreviews = () => import('../game/render/coursePreview.js');

function themeInfo(theme, fallbackColor = '#00f076') {
  const name = THEME_COLORS[theme] ? t(`maps.theme.${theme}`) : theme;
  return { id: theme, name, color: THEME_COLORS[theme] || fallbackColor };
}

// claves de texto de las particularidades de un mapa, en el orden de siempre
export function courseFeatureKeys(c) {
  const f = [];
  if (c.loops?.length) f.push('loop');
  if (c.windmills?.length) f.push('windmill');
  if (c.portals?.length) f.push(c.portals.some((p) => p.tube) ? 'tubes' : 'portals');
  if (c.tunnels?.length) f.push('tunnel');
  if (c.boosts?.length) f.push('boost');
  if (c.mounds?.length) f.push('mound');
  if (c.slopes?.length) f.push('slope');
  if (c.movers?.length) f.push('movers');
  if (c.spinners?.length) f.push('spinners');
  if (c.bumpers?.length) f.push('bumpers');
  if (c.ice?.length) f.push('ice');
  if (c.sand?.length) f.push('sand');
  return f;
}

export function mount(root, ctx) {
  const scope = ctx.scope.child();
  const icon = (n, o = {}) => ctx.icon(n, o);
  const courses = ctx.courses ?? COURSES;
  const tiebreak = ctx.tiebreak ?? TIEBREAK_COURSE;
  let gone = false, run = 0, sc = null;

  ctx.legacy?.enterMaps?.(); // lo que el shell hacía al entrar: cerrar final y sala en vivo, liberar la partida
  root.innerHTML = `<main class="screen freeplay-select" aria-label="${esc(t('maps.title'))}">${header({ title: t('maps.title') })}<div class="maps-host" data-maps-host></div></main>`;
  bindHeader(root, { ...ctx, scope });
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

  function card({ cls = '', theme, extra = false, badge, par, previewSrc, alt, title, dist, feat, train, name, tip, feats, playLabel, play }) {
    return `
      <div class="course-card holo ${cls} theme--${esc(theme.id)}">
        <div class="course-card-top">
          <span class="course-num-badge${extra ? ' extra' : ''}">${esc(badge)}</span>
          <span class="course-theme-tag" style="--accent:${theme.color}">${esc(theme.name)}</span>
          <span class="course-par-badge">${esc(par)}</span>
        </div>
        <div class="course-card-preview-wrap" style="--accent:${theme.color}" title="${esc(title)}" data-play="${esc(play)}">
          <div class="course-preview-media">
            <img class="course-preview-img" src="${esc(previewSrc)}" alt="${esc(alt)}" loading="lazy" />
            <div class="course-preview-glow"></div>
            <div class="course-preview-badges">
              <span class="preview-badge dist-badge">~${dist}m</span>
              ${feat ? `<span class="preview-badge feat-badge">${esc(feat)}</span>` : ''}
            </div>
            <div class="course-preview-action-overlay">
              <span class="preview-play-icon">${icon('play')}</span>
              <span class="preview-play-text">${esc(train)}</span>
            </div>
          </div>
        </div>
        <div class="course-card-body">
          <h3 class="course-name">${esc(name)}</h3>
          ${tip ? `<p class="course-tip">${esc(tip)}</p>` : ''}
          ${feats.length ? `<div class="course-feats">${feats.map((f) => `<span class="feat-tag">${esc(f)}</span>`).join('')}</div>` : ''}
        </div>
        <button type="button" class="primary play-course-btn" data-play="${esc(play)}">${icon('play')}${esc(playLabel)}</button>
      </div>`;
  }

  // previews: lo que cada mapa muestra (WebP estático o, si no hay, la imagen que dibuja three.js)
  const cards = (previews) => {
    const list = courses.map((course, idx) => {
      const n = idx + 1;
      const feats = courseFeatureKeys(course).map((k) => t(`maps.feat.${k}`));
      return card({
        theme: themeInfo(course.theme), badge: t('maps.hole', { n }), par: t('maps.par', { n: course.par }),
        previewSrc: previews.get(course) ?? '', alt: t('maps.previewAlt', { name: course.name }), title: t('maps.playTitle', { n }),
        dist: getCourseDistance(course), feat: feats[0], train: t('maps.train', { n }), name: course.name, tip: course.tip, feats,
        playLabel: t('maps.playHole', { n }), play: String(idx),
      });
    });
    list.push(card({
      cls: 'course-card-extra', extra: true, theme: themeInfo(tiebreak.theme, '#ff9a5c'), badge: t('maps.extra'), par: t('maps.target'),
      previewSrc: previews.get(tiebreak) ?? '', alt: t('maps.tbAlt'), title: t('maps.tbPlayTitle'), dist: getCourseDistance(tiebreak),
      feat: t('maps.target'), train: t('maps.tbTrain'), name: t('maps.tbName'), tip: t('maps.tbTip'),
      feats: [t('maps.tbFeatTarget'), t('maps.tbFeatSudden')], playLabel: t('maps.tbPlay'), play: 'tiebreak',
    }));
    return list.join('');
  };

  function paintReady(previews) {
    fresh();
    listState(host, { state: 'ready' });
    host.innerHTML = `
      <div class="freeplay-select-hero">
        <div class="freeplay-select-badge-row">
          <span class="rarity-pill rarity-epic">${esc(t('maps.mode'))}</span>
          <span class="hero-level-tag">${esc(t('maps.holes', { n: courses.length }))}</span>
        </div>
        <div class="section-title-row">
          <h2>${esc(t('maps.title'))}</h2>
          <span class="live-pill solo-live-pill"><i class="pulse-dot"></i> ${esc(t('maps.solo'))}</span>
        </div>
        <p class="freeplay-desc">${esc(t('maps.desc'))}</p>
        <div class="freeplay-features-bar">
          <span class="spec-chip">${esc(t('maps.chipNoTime'))}</span>
          <span class="spec-chip">${esc(t('maps.chipNoRivals'))}</span>
          <span class="spec-chip">${esc(t('maps.chipUnlimited'))}</span>
          <span class="spec-chip">${esc(t('maps.chipRestart'))}</span>
        </div>
      </div>
      <div class="courses-grid">${cards(previews)}</div>
      <div class="freeplay-footer-actions">
        <button type="button" class="ghost back-to-lobby" data-home>${icon('back')}${esc(t('maps.backToMenu'))}</button>
      </div>`;
    sc.on(host, 'click', (ev) => {
      const el = ev.target?.closest?.('[data-play],[data-home]');
      if (!el || gone) return;
      if (el.dataset.home !== undefined) { ctx.router.back(); return; }
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
