// Cuenta › Progreso (T036): nivel y XP, marco actual y siguiente, y estadísticas reales de progress.state.
// Solo lee: no cambia economía ni guarda nada. mount no bloquea: pinta «Cargando» y devuelve { destroy } al momento.
import { frameStyle } from '../../progress/prestige.js';
import { listState } from '../components.js';
import { nextFrame } from '../hubRules.js';
import { esc } from '../shared.js';
import { t } from '../texts/index.js';
import '../texts/common.js';
import '../texts/progress.js';

const NET_TIMEOUT_MS = 8000; // una red que no responde no deja la pantalla colgada: error con Reintentar
const STATS = [['matches', 'progress.matches'], ['wins', 'progress.wins'], ['streak', 'progress.streak'], ['bestStreak', 'progress.bestStreak'], ['birdies', 'progress.birdies'], ['aces', 'progress.aces']];
const whole = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

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
    const pct = lvl.need > 0 ? Math.max(0, Math.min(100, Math.round((lvl.into / lvl.need) * 100))) : 0;
    const frameName = cur ? cur.name : t('progress.noFrame');
    const nextText = nxt
      ? t(nxt.missing === 1 ? 'progress.nextFrameLineOne' : 'progress.nextFrameLine', { name: nxt.frame.name, missing: nxt.missing, level: nxt.frame.level })
      : t('progress.allFrames');
    const cards = STATS.map(([k, label]) => ({ label: t(label), val: whole(st[k]) })).filter((c) => c.val !== null);
    listState(el, { state: 'ready' });
    el.innerHTML = `
      <div class="account-card-panel progress-card" data-progress="1">
        <div class="panel-head"><h2 data-progress-level="1">${esc(t('progress.levelLine', { level: lvl.level, frame: frameName }))}</h2></div>
        <div class="bar" role="progressbar" aria-label="${esc(t('progress.xpBarLabel'))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
        <p class="sub" data-progress-xp="1">${esc(t('progress.xpLabel'))}: ${esc(t('progress.xpValue', { into: lvl.into, need: lvl.need }))}</p>
      </div>
      <div class="account-card-panel frames-panel">
        <div class="panel-head"><h2>${esc(t('progress.currentFrame'))}</h2><span class="panel-badge ${cur ? 'verified' : 'pending'}" ${cur ? `style="${frameStyle(cur)}"` : ''}>${esc(frameName)}</span></div>
        <div class="panel-head"><h2>${esc(t('progress.nextFrameTitle'))}</h2></div>
        <p class="sub" data-progress-next="1">${esc(nextText)}</p>
      </div>
      <div class="account-card-panel">
        <div class="panel-head"><h2>${esc(t('progress.statsTitle'))}</h2></div>
        ${cards.length
    ? `<div class="career-stats-row" data-progress-stats="1">${cards.map((c) => `<div class="stat-pill"><span class="stat-pill-label">${esc(c.label)}</span><span class="stat-pill-val">${c.val}</span></div>`).join('')}</div>${st.matches === 0 ? `<p class="sub">${esc(t('progress.noMatches'))}</p>` : ''}`
    : `<p class="sub" data-progress-empty="1">${esc(t('progress.emptyStats'))}</p>`}
      </div>`;
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

