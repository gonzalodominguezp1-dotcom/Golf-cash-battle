// Cuenta › Progreso (T036): nivel y XP, marco actual y siguiente, y estadísticas reales de progress.state.
// Solo lee: no cambia economía ni guarda nada. mount no bloquea: pinta «Cargando» y devuelve { destroy } al momento.
import './progress.css';
import { FRAMES, frameStyle } from '../../progress/prestige.js';
import { listState } from '../components.js';
import { nextFrame } from '../hubRules.js';
import { avatarHtml, esc } from '../shared.js';
import { t } from '../texts/index.js';
import '../texts/common.js';
import '../texts/progress.js';

const NET_TIMEOUT_MS = 8000; // una red que no responde no deja la pantalla colgada: error con Reintentar
const STATS = [['matches', 'progress.matches'], ['wins', 'progress.wins'], ['streak', 'progress.streak'], ['bestStreak', 'progress.bestStreak'], ['birdies', 'progress.birdies'], ['aces', 'progress.aces']];
const whole = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
const clampPct = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0); // XP corrupto no deja NaN en la barra
const bar = (v, label) => `<div class="pg-bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}"><i style="width:${v}%"></i></div>`;

export function mount(el, ctx) {
  const { backend, progress } = ctx;
  const scope = ctx.scope.child(); // todo lo de Progreso cuelga de aquí
  let gone = false, run = 0, sc = null;

  const timed = (promise) => new Promise((resolve, reject) => {
    const cancel = scope.timeout(() => reject(new Error('timeout')), NET_TIMEOUT_MS);
    Promise.resolve(promise).then((v) => { cancel(); resolve(v); }, (e) => { cancel(); reject(e); });
  });

  function paintState(state, extra = {}) {
    sc?.dispose();
    sc = scope.child();
    listState(el, { state, errorText: t('progress.loadError'), onRetry: () => load(), scope: sc, ...extra });
  }

  async function load() {
    const my = ++run; // las respuestas de una lectura anterior se descartan
    paintState('loading');
    try {
      // con cuenta se refresca desde el servidor (puede tardar); sin ella, solo se lee lo local
      if (backend?.account?.load) await timed(backend.account.load());
    } catch { if (my === run && !gone) paintState('error'); return; }
    if (my !== run || gone) return;
    paint();
  }

  function paint() {
    const lvl = progress?.level;
    const st = progress?.state;
    if (!lvl || !st) return paintState('empty', { emptyText: t('progress.emptyStats') });
    sc?.dispose(); // sin controles que enlazar: el scope hijo se libera igual en cada repintado
    sc = scope.child();
    const cur = progress.prestige?.frame ?? null;
    const nxt = nextFrame(lvl.level);
    const pct = lvl.need > 0 ? clampPct((lvl.into / lvl.need) * 100) : 0;
    const frameName = cur ? cur.name : t('progress.noFrame');
    // progreso hacia el siguiente marco: desde el nivel del marco actual (0 si no hay) hasta el nivel del siguiente
    const prevLevel = cur?.level ?? 0;
    const nextPct = nxt && nxt.frame.level > prevLevel ? clampPct(((lvl.level - prevLevel) / (nxt.frame.level - prevLevel)) * 100) : 0;
    const cards = STATS.map(([k, label]) => ({ key: k, label: t(label), val: whole(st[k]) })).filter((c) => c.val !== null);
    const nextBlock = nxt
      ? `<p class="pg-next-name" data-progress-next-name="1">${esc(nxt.frame.name)}</p>
         <p class="pg-sub" data-progress-next="1">${esc(t('progress.nextUnlocks', { level: nxt.frame.level }))} · ${esc(nxt.missing === 1 ? t('progress.nextMissingOne') : t('progress.nextMissing', { missing: nxt.missing }))}</p>
         ${bar(nextPct, t('progress.nextBarLabel'))}`
      : `<p class="pg-sub" data-progress-next="1">${esc(t('progress.allFrames'))}</p>`;
    const av = ctx.avatar?.get?.() ?? null;
    const have = new Set((progress.prestige?.unlocked ?? []).map((f) => f.id));
    const owned = have.size;
    const gallery = FRAMES.map((f) => {
      const open = have.has(f.id);
      const req = f.level != null ? t('progress.frameLevel', { level: f.level }) : t('progress.frameChallenge', { name: progress.challenge?.(f.challenge)?.name ?? f.challenge });
      const status = open ? t('progress.frameOwned') : (f.level != null ? t('progress.frameLocked', { level: f.level }) : req);
      return `<li class="pg-frame-item ${open ? 'open' : 'locked'} ${cur?.id === f.id ? 'on' : ''}" data-frame-item="${esc(f.id)}" style="${frameStyle(f)}" aria-label="${esc(f.name)}: ${esc(status)}">
            ${avatarHtml({ size: 'xs', frame: f, av, initial: '?' })}<b>${esc(f.name)}</b><small>${esc(req)}${open ? '' : ' · 🔒'}</small>
          </li>`;
    }).join('');
    listState(el, { state: 'ready' });
    el.innerHTML = `
      <section class="pg" data-progress="1">
        <header class="pg-hero" style="${cur ? frameStyle(cur) : ''}">
          <div class="pg-badge" data-progress-level="1"><span class="pg-badge-num">${lvl.level}</span><span class="pg-badge-lbl">${esc(t('progress.levelWord'))}</span></div>
          <div class="pg-hero-body">
            <p class="pg-kicker">${esc(t('progress.currentFrame'))}</p>
            <h2 class="pg-frame" data-progress-frame="1">${esc(frameName)}</h2>
            <p class="pg-level">${esc(t('progress.levelLabel', { level: lvl.level }))}</p>
          </div>
        </header>
        <div class="pg-xp">
          <div class="pg-xp-top">
            <span class="pg-xp-label">${esc(t('progress.xpLabel'))}</span>
            <span class="pg-xp-val" data-progress-xp="1">${esc(t('progress.xpValue', { into: lvl.into, need: lvl.need }))} · ${pct}%</span>
          </div>
          ${bar(pct, t('progress.xpBarLabel'))}
        </div>
        <div class="pg-next">
          <p class="pg-kicker">${esc(t('progress.nextFrameTitle'))}</p>
          ${nextBlock}
        </div>
        <div class="pg-gallery" data-progress-gallery="1">
          <h2 class="pg-stats-title">${esc(t('progress.galleryTitle'))} <span class="pg-gallery-count" data-progress-owned="1">${owned}/${FRAMES.length}</span></h2>
          <ul class="pg-frames">${gallery}</ul>
        </div>
        <div class="pg-stats-wrap">
          <h2 class="pg-stats-title">${esc(t('progress.statsTitle'))}</h2>
          ${cards.length
    ? `<div class="pg-stats" data-progress-stats="1">${cards.map((c) => `<div class="pg-stat" data-stat="${c.key}"><span class="pg-stat-val">${c.val}</span><span class="pg-stat-lbl">${esc(c.label)}</span></div>`).join('')}</div>${st.matches === 0 ? `<p class="pg-empty">${esc(t('progress.noMatches'))}</p>` : ''}`
    : `<p class="pg-empty" data-progress-empty="1">${esc(t('progress.emptyStats'))}</p>`}
        </div>
      </section>`;
  }

  load(); // sin esperar: el host serializa los montajes
  return {
    destroy() {
      gone = true;
      run++;
      scope.dispose();
    },
  };
}

