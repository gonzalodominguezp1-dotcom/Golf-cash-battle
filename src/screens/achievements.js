// Pantalla Logros (AC11, C4): todos los CHALLENGES; pendientes arriba con barra de progreso, completados abajo, 2 por fila.
// Al abrirla marca como vistos los completados: el hub repinta su punto en onUncover.
import { CHALLENGES, SKINS } from '../progress/skins.js';
import { esc } from './shared.js';
import { header, card, listState, bindHeader } from './components.js';
import { orderAchievements, markSeen } from './achievementsRules.js';
import { t } from './texts/index.js';
import './texts/common.js';
import './texts/achievements.js';

export async function mount(root, ctx) {
  // convención provisional: la pantalla espera a su css; el import estático en main.js lo unifica T039.
  // En Vite resuelve cuando el <link> carga; en Node rechaza al instante y se ignora.
  await (ctx.loadCss ?? (() => import('./achievements.css')))().catch(() => {});
  const scope = ctx.scope.child();
  const { progress } = ctx;
  const challenges = ctx.challenges ?? CHALLENGES;
  const userId = ctx.backend?.user?.id ?? 'local';
  const storage = ctx.storage ?? globalThis.localStorage;
  const icon = (n, o = {}) => ctx.icon(n, { size: 32, ...o });

  const reward = (id) => SKINS.find((s) => s.unlock?.challenge === id);

  const cardHtml = (c) => {
    const st = c.state;
    const value = Math.min(Math.max(st.value, 0), st.goal);
    const pct = st.goal > 0 ? Math.round((value / st.goal) * 100) : 0;
    const skin = reward(c.id);
    const bar = `<span class="ach-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${st.goal}" aria-valuenow="${value}" aria-label="${esc(t('achievements.progressLabel', { name: c.name, value, goal: st.goal }))}"><i style="width:${pct}%"></i></span>`;
    const status = st.done
      ? `<span class="ach-status">${ctx.icon('check', { size: 18 })}<span>${esc(t('achievements.completed'))}</span></span>`
      : `<span class="ach-num">${esc(t('achievements.progress', { value, goal: st.goal }))}</span>`;
    const rw = skin ? `<span class="ach-reward">${ctx.ball ? ctx.ball(skin, 34) : ctx.icon('skins', { size: 18 })}<span>${esc(t('achievements.reward', { skin: skin.name }))}</span></span>` : '';
    return `<li data-ach="${esc(c.id)}">${card({
      cls: `ach-card${st.done ? ' ach-done' : ''}`,
      body: `<span class="ach-top"><span class="ach-ico" aria-hidden="true">${icon('medal', st.done ? { tone: 'gold' } : {})}</span><h3 class="ach-name">${esc(c.name)}</h3></span>${bar}${status}${rw}`,
    })}</li>`;
  };
  const section = (key, rows) => (rows.length
    ? `<h2 class="ach-h">${esc(t(`achievements.${key}`))} (${rows.length})</h2><ul class="ach-grid">${rows.map(cardHtml).join('')}</ul>`
    : '');

  root.innerHTML = `<main class="screen ach" aria-label="${esc(t('achievements.title'))}">${header({ title: t('achievements.title') })}<div class="ach-body" data-ach-list></div></main>`;
  bindHeader(root, { ...ctx, scope });
  const el = root.querySelector('[data-ach-list]');

  const render = () => {
    let ordered;
    try {
      ordered = orderAchievements(challenges, (id) => progress.challenge(id));
    } catch {
      listState(el, { state: 'error', errorText: t('achievements.error'), onRetry: render, scope });
      return;
    }
    if (!ordered.pending.length && !ordered.done.length) {
      listState(el, { state: 'empty', emptyText: t('achievements.empty') });
      return;
    }
    listState(el, { state: 'ready' });
    el.innerHTML = section('pending', ordered.pending) + section('done', ordered.done);
    markSeen(storage, userId, ordered.done.map((c) => c.id));
  };
  render();

  return { destroy() { scope.dispose(); } };
}
