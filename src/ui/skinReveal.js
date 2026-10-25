import './skinReveal.css';
import { sfx } from '../game/audio.js';
import { ballPreview } from '../game/render/ballPaint.js';
import { TIERS } from '../progress/skins.js';
import { rarePatternOf } from '../progress/inventory.js';
import { upgradeImg } from './skinThumbs.js';

// Animación de reveal/desbloqueo de skins (docs/skins-premium-plan.md, (d) y P10).
//   await showSkinReveal(skins, { progress })
// Una secuencia por skin, de menor a mayor tier (la mejor al final). Un toque (o Esc) salta al final
// de la skin actual; después, «Siguiente»/«Continuar» avanza. La promesa se resuelve al cerrar la cola.
// La bola es una imagen estática (skinThumbs); el inspector 3D solo se carga (import()) al pulsar «Inspeccionar».
//
// Fases (ms): 1 oscurece · 2 haz de luz · 3 la bola se materializa · 4 estallido + sello · 5 datos y botones.
// Los totales salen de (d): Común 1,5 s · Legendaria 3,2 s · Mítica 4,2 s; el resto, interpolados.
const TIMELINE = {
  common: [250, 350, 400, 300, 200],
  uncommon: [300, 450, 500, 400, 250],
  rare: [400, 550, 650, 450, 250],
  epic: [450, 700, 800, 500, 300],
  legendary: [500, 800, 900, 600, 400],
  mythic: [500, 1100, 1200, 800, 600],
};
const REDUCED_MS = 600;
const PARTICLES = { common: 14, uncommon: 22, rare: 36, epic: 56, legendary: 84, mythic: 120 };

const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const tierKey = (s) => s.tier ?? s.rarity ?? 'common';

/** Sonido por tier con lo que ya hay en audio.js: «carga» (ticks), golpe y sello. */
function sound(skin, step) {
  const k = tierKey(skin);
  const order = TIERS[k].order;
  try {
    if (step === 'charge') {
      const n = 3 + order * 2;
      const gap = Math.max(60, (TIMELINE[k][0] + TIMELINE[k][1] + TIMELINE[k][2] - 200) / n);
      return Array.from({ length: n }, (_, i) => setTimeout(() => sfx.tick(), 60 + i * gap));
    }
    if (step === 'hit') {
      sfx.cup();
      if (order >= 2) sfx.skin(skin.sfx?.set ?? skin.id, 'sink', { power: 0.6 + order * 0.08 });
      if (order >= 3) sfx.boost();
      if (order >= 4) setTimeout(() => sfx.portal(), 120);
      setTimeout(() => sfx.coins(), 200);
    }
  } catch { }
  return [];
}

function burst(canvas, color, count) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => { };
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w;
  canvas.height = h;
  const cx = canvas.dataset.cx ? Number(canvas.dataset.cx) : w / 2;
  const cy = canvas.dataset.cy ? Number(canvas.dataset.cy) : h / 2;
  const ps = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2;
    const v = 90 + Math.random() * 300;
    return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, r: 1.5 + Math.random() * 3, life: 0.7 + Math.random() * 0.6, white: Math.random() < 0.3 };
  });
  let last = performance.now();
  let t = 0;
  let raf = 0;
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    let alive = false;
    for (const p of ps) {
      if (t > p.life) continue;
      alive = true;
      p.vy += 260 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      ctx.globalAlpha = Math.max(0, 1 - t / p.life);
      ctx.fillStyle = p.white ? '#fff' : color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, 6.2832);
      ctx.fill();
    }
    if (alive) raf = requestAnimationFrame(step);
    else ctx.clearRect(0, 0, w, h);
  };
  raf = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, w, h);
  };
}

export function showSkinReveal(skins, { progress = null } = {}) {
  const list = [...(skins ?? [])].sort((a, b) => TIERS[tierKey(a)].order - TIERS[tierKey(b)].order);
  if (!list.length) return Promise.resolve();

  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'sr-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Skin desbloqueada');
    document.body.append(root);
    document.body.classList.add('sk-noscroll');
    const opener = document.activeElement;

    let idx = 0;
    let timers = [];
    let stopBurst = () => { };
    let inspector = null;
    let skipFn = null;
    let done = false;

    const clearAll = () => {
      timers.forEach(clearTimeout);
      timers = [];
      stopBurst();
      stopBurst = () => { };
    };
    const closeInspector = () => {
      if (!inspector) return;
      try { inspector.api?.destroy(); } catch { }
      inspector.el.remove();
      inspector = null;
    };
    const finish = () => {
      clearAll();
      closeInspector();
      document.removeEventListener('keydown', onKey, true);
      document.body.classList.remove('sk-noscroll');
      root.classList.add('sr-out');
      setTimeout(() => root.remove(), 220);
      if (opener?.isConnected) opener.focus?.({ preventScroll: true });
      resolve();
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (inspector) closeInspector();
      else if (!done) skipFn?.();
    };
    document.addEventListener('keydown', onKey, true);

    function play(i) {
      clearAll();
      closeInspector();
      done = false;
      const skin = list[i];
      const k = tierKey(skin);
      const tier = TIERS[k];
      const inst = progress?.instance(skin.id) ?? null;
      const rare = inst ? rarePatternOf(skin, inst.seed) : null;
      const mythic = k === 'mythic';
      const calm = reduced();
      const dur = calm ? [0, 0, 0, REDUCED_MS, 0] : TIMELINE[k];
      const start = dur.map((_, n) => dur.slice(0, n).reduce((a, b) => a + b, 0));
      const total = calm ? REDUCED_MS : dur.reduce((a, b) => a + b, 0);
      const last = i === list.length - 1;
      const css = dur.map((d, n) => `--s${n + 1}:${start[n]}ms;--d${n + 1}:${d}ms`).join(';');

      root.className = `sr-root sr-${k}${calm ? ' sr-calm' : ''}`;
      root.style.cssText = `${css};--c:${tier.color};--sk-a:${skin.palette?.base ?? tier.color};--sk-b:${skin.palette?.accent ?? tier.color}`;
      root.innerHTML = `
        <div class="sr-vignette"></div>
        ${mythic ? '<div class="sr-beam sr-beam-gold"></div><div class="sr-beam sr-beam-crimson"></div>' : '<div class="sr-beam"></div>'}
        <canvas class="sr-fx" aria-hidden="true"></canvas>
        <div class="sr-stage">
          ${list.length > 1 ? `<span class="sr-count">${i + 1} / ${list.length}</span>` : ''}
          <p class="sr-kicker">¡Skin desbloqueada!</p>
          <div class="sr-seal"><span class="sr-seal-ico">${tier.icon}</span>${esc(tier.name)}</div>
          <div class="sr-ball">
            <img src="${ballPreview(skin, 288)}" width="384" height="384" alt="" draggable="false">
            <span class="sr-scan"></span>
          </div>
          <div class="sr-info">
            <h2 class="sr-name">${esc(skin.name)}</h2>
            ${inst ? `<p class="sr-meta"><span>Patrón #${String(inst.seed).padStart(3, '0')}</span>${rare ? '<span class="sr-rare">✦ Patrón raro</span>' : ''}${inst.counter?.enabled ? '<span class="sr-rare">Marcador</span>' : ''}</p>` : ''}
            <div class="sr-actions">
              <button type="button" class="ghost sr-inspect">Inspeccionar</button>
              ${progress ? '<button type="button" class="primary sr-equip">Equipar</button>' : ''}
              <button type="button" class="ghost sr-next">${last ? 'Continuar' : 'Siguiente'}</button>
            </div>
          </div>
        </div>`;

      const stage = root.querySelector('.sr-stage');
      const img = root.querySelector('.sr-ball img');
      const canvas = root.querySelector('.sr-fx');
      const equipBtn = root.querySelector('.sr-equip');
      const nextBtn = root.querySelector('.sr-next');

      upgradeImg(img, skin, inst, { size: 144, priority: true, hi: true });

      const syncEquip = () => {
        if (!equipBtn) return;
        const isEq = progress.skin.id === skin.id;
        equipBtn.disabled = isEq;
        equipBtn.textContent = isEq ? '✓ Equipada' : 'Equipar';
      };
      syncEquip();
      equipBtn?.addEventListener('click', () => {
        if (progress.equip(skin.id)) {
          try { sfx.tap(); } catch { }
          syncEquip();
        }
      });
      nextBtn.addEventListener('click', () => (last ? finish() : play(i + 1)));
      root.querySelector('.sr-inspect').addEventListener('click', () => {
        if (inspector) return;
        const el = document.createElement('div');
        el.className = 'sr-insp';
        el.innerHTML = `<div class="sr-insp-bar"><button type="button" class="ghost sr-insp-back" aria-label="Volver">‹ Volver</button><span>${esc(tier.icon)} ${esc(skin.name)}</span></div><div class="sr-insp-stage"></div>`;
        root.append(el);
        const mine = { el, api: null };
        inspector = mine;
        import('./skinInspector.js').then(({ createSkinInspector }) => {
          if (inspector !== mine) return; // cerrado mientras cargaba
          mine.api = createSkinInspector(el.querySelector('.sr-insp-stage'), { skin, instance: inst ?? undefined, mode: 'fullscreen' });
        }).catch((err) => console.warn('inspector no disponible', err));
        const back = el.querySelector('.sr-insp-back');
        back.addEventListener('click', () => {
          closeInspector();
          root.querySelector('.sr-inspect')?.focus({ preventScroll: true });
        });
        back.focus({ preventScroll: true });
      });

      const settle = () => {
        done = true;
        stage.classList.add('sr-done');
        (list.length > 1 && !last ? nextBtn : equipBtn && !equipBtn.disabled ? equipBtn : nextBtn).focus({ preventScroll: true });
      };

      skipFn = () => {
        if (done) return;
        timers.forEach(clearTimeout);
        timers = [];
        stopBurst();
        stopBurst = () => { };
        root.classList.add('sr-skipped');
        settle();
      };
      root.onclick = (e) => {
        if (!done && !e.target.closest('button')) skipFn();
      };

      if (!calm) {
        timers.push(...sound(skin, 'charge'));
        timers.push(setTimeout(() => {
          const b = img.getBoundingClientRect();
          const c = canvas.getBoundingClientRect();
          canvas.dataset.cx = b.left + b.width / 2 - c.left;
          canvas.dataset.cy = b.top + b.height / 2 - c.top;
          stopBurst = burst(canvas, tier.color, PARTICLES[k]);
        }, start[3]));
      }
      timers.push(setTimeout(() => sound(skin, 'hit'), calm ? 0 : start[3]));
      timers.push(setTimeout(settle, total));
    }

    play(0);
  });
}
