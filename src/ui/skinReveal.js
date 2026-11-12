import './skinReveal.css';
import { sfx } from '../game/audio.js';
import { icon, tierIcon } from './icons.js';
import { ballPreview } from '../game/render/ballPaint.js';
import { TIERS } from '../progress/skins.js';
import { rarePatternOf } from '../progress/inventory.js';
import { upgradeImg } from './skinThumbs.js';

const loadInspector = () => import('./skinInspector.js');

// Animación de reveal/desbloqueo de skins (P10).
//   await showSkinReveal(skins, { progress })
// Una secuencia por skin, de menor a mayor tier (la mejor al final). Un toque (o Esc) salta al final
// de la skin actual; después, «Siguiente»/«Continuar» avanza. La promesa se resuelve al cerrar la cola.
// La bola es una imagen estática (skinThumbs).
//
// Fases (ms): 1 oscurece · 2 el pack se rasga y sus dos mitades salen despedidas · 3 la bola aparece al 20 % y crece al 100 % en 2 s, girando · 4 estallido + sello · 5 datos y botones.
// La bola empieza justo al acabar la apertura; el resto de fases es igual para todas las rarezas.
const TIMELINE = {
  common: [150, 380, 2000, 300, 200],
  uncommon: [150, 380, 2000, 350, 250],
  rare: [150, 380, 2000, 400, 250],
  epic: [150, 380, 2000, 500, 300],
  legendary: [150, 380, 2000, 600, 400],
  mythic: [150, 380, 2000, 800, 600],
};
const REDUCED_MS = 600;
const PARTICLES = { common: 14, uncommon: 22, rare: 36, epic: 56, legendary: 84, mythic: 120 };

const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const tierKey = (s) => s.tier ?? s.rarity ?? 'common';

/** Sonido por tier: tensión creciente (riser) y estallido épico, más la capa propia de cada skin. */
function sound(skin, step) {
  const k = tierKey(skin);
  const order = TIERS[k].order;
  try {
    if (step === 'charge') {
      // legendaria y mítica: el riser corta un instante antes del golpe (silencio dramático)
      sfx.reward.riser((TIMELINE[k][0] + TIMELINE[k][1] + TIMELINE[k][2]) / 1000 - (order >= 4 ? 0.22 : 0), order);
    }
    if (step === 'hit') {
      sfx.reward.reveal(order);
      if (order >= 2) sfx.skin(skin.sfx?.set ?? skin.id, 'sink', { power: 0.6 + order * 0.08 });
      setTimeout(() => sfx.coins(), 350);
    }
  } catch { }
  return [];
}

// Mantener pulsado: tiempo para llenar el anillo y vibración por tier
const HOLD_MS = 1500;
const buzz = (p) => { try { navigator.vibrate?.(p); } catch { } };

function burst(canvas, color, count, lifeMul = 1) {
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
    return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, r: 1.5 + Math.random() * 3, life: (0.7 + Math.random() * 0.6) * lifeMul, white: Math.random() < 0.3 };
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

    // Puerta: la recompensa llega sellada y hay que mantenerla pulsada para abrirla.
    function play(i) {
      clearAll();
      closeInspector();
      done = false;
      const skin = list[i];
      const calm = reduced();
      root.className = `sr-root sr-gate-on${calm ? ' sr-calm' : ''}`;
      root.style.cssText = '--c:#9db4ff;--p:0';
      root.onclick = null;
      root.innerHTML = `
        <div class="sr-vignette sr-vignette-gate"></div>
        <canvas class="sr-fx" aria-hidden="true"></canvas>
        <div class="sr-stage sr-gate">
          ${list.length > 1 ? `<span class="sr-count">${i + 1} / ${list.length}</span>` : ''}
          <p class="sr-kicker sr-kicker-gate">Recompensa</p>
          <button type="button" class="sr-orb" aria-label="${calm ? 'Pulsa para abrir' : 'Mantén pulsado para abrir'}">
            <span class="sr-pack" aria-hidden="true">
              <span class="sr-pack-fill"></span>
              <span class="sr-pack-foil"></span>
              <span class="sr-pack-seam"></span>
              <span class="sr-pack-mark">?</span>
              <span class="sr-pack-bar"><i></i></span>
            </span>
          </button>
          <p class="sr-hint">${calm ? 'Pulsa para abrir' : 'Mantén pulsado para abrir'}</p>
        </div>`;
      const orb = root.querySelector('.sr-orb');
      let p = 0;
      let holding = false;
      let raf = 0;
      let last = 0;
      let tickAt = 0;
      let opened = false;
      const stopGate = () => {
        cancelAnimationFrame(raf);
        sfx.reward.hold(null);
        document.removeEventListener('keyup', onKeyUp, true);
      };
      const openNow = () => {
        if (opened) return;
        opened = true;
        stopGate();
        buzz([30, 40, 80]);
        reveal(i);
      };
      const frame = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        p = holding ? Math.min(1, p + (dt * 1000) / HOLD_MS) : Math.max(0, p - dt * 2.2 * (1000 / HOLD_MS));
        root.style.setProperty('--p', p.toFixed(3));
        sfx.reward.hold(p > 0.01 ? p : null);
        if (holding && p >= tickAt + 0.08) { tickAt = p; sfx.reward.tick(p); buzz(8 + p * 20); }
        if (!holding && p < tickAt) tickAt = p;
        if (p >= 1) return openNow();
        raf = requestAnimationFrame(frame);
      };
      const press = () => {
        if (opened) return;
        if (calm) return openNow();
        if (holding) return;
        holding = true;
        last = performance.now();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
      };
      const release = () => { holding = false; };
      const onKeyUp = (e) => { if (e.key === ' ' || e.key === 'Enter') release(); };
      orb.addEventListener('pointerdown', (e) => { e.preventDefault(); orb.setPointerCapture?.(e.pointerId); press(); });
      orb.addEventListener('pointerup', release);
      orb.addEventListener('pointercancel', release);
      orb.addEventListener('keydown', (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        if (!e.repeat) { press(); document.addEventListener('keyup', onKeyUp, true); }
      });
      orb.addEventListener('contextmenu', (e) => e.preventDefault());
      skipFn = () => openNow();
      orb.focus({ preventScroll: true });
    }

    function reveal(i) {
      clearAll();
      closeInspector();
      done = false;
      const skin = list[i];
      const k = tierKey(skin);
      const tier = TIERS[k];
      const inst = progress?.instance(skin.id) ?? null;
      const rare = inst ? rarePatternOf(skin, inst.seed) : null;
      const calm = reduced();
      const dur = calm ? [0, 0, 0, REDUCED_MS, 0] : TIMELINE[k];
      const start = dur.map((_, n) => dur.slice(0, n).reduce((a, b) => a + b, 0));
      const total = calm ? REDUCED_MS : dur.reduce((a, b) => a + b, 0);
      const last = i === list.length - 1;
      const css = dur.map((d, n) => `--s${n + 1}:${start[n]}ms;--d${n + 1}:${d}ms`).join(';');

      root.className = `sr-root sr-${k}${calm ? ' sr-calm' : ''}`;
      root.style.cssText = `${css};--c:${tier.color};--sk-a:${skin.palette?.base ?? tier.color};--sk-b:${skin.palette?.accent ?? tier.color};--k:${tier.order}`;
      root.innerHTML = `
        <div class="sr-vignette"></div>
        <div class="sr-rays" aria-hidden="true"></div>
        <div class="sr-tear" aria-hidden="true"><span class="sr-tear-a"></span><span class="sr-tear-b"></span></div>
        <canvas class="sr-fx" aria-hidden="true"></canvas>
        <div class="sr-stage">
          ${list.length > 1 ? `<span class="sr-count">${i + 1} / ${list.length}</span>` : ''}
          <p class="sr-kicker">${tier.order >= 3 ? `¡${esc(tier.name)}!` : tier.order >= 2 ? '¡Skin rara!' : '¡Skin desbloqueada!'}</p>
          <div class="sr-seal"><span class="sr-seal-ico">${tierIcon(k)}</span>${esc(tier.name)}</div>
          <div class="sr-ball">
            <img src="${ballPreview(skin, 288)}" width="384" height="384" alt="" draggable="false">
          </div>
          <div class="sr-info">
            <h2 class="sr-name">${esc(skin.name)}</h2>
            ${inst ? `<p class="sr-meta"><span>Patrón #${String(inst.seed).padStart(3, '0')}</span>${rare ? `<span class="sr-rare">${icon('sparkle')} Patrón raro</span>` : ''}${inst.counter?.enabled ? '<span class="sr-rare">Marcador</span>' : ''}</p>` : ''}
            <div class="sr-actions">
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
        equipBtn.innerHTML = isEq ? `${icon('check')}Equipada` : 'Equipar';
      };
      syncEquip();
      equipBtn?.addEventListener('click', () => {
        if (progress.equip(skin.id)) {
          try { sfx.tap(); } catch { }
          syncEquip();
        }
      });
      nextBtn.addEventListener('click', () => (last ? finish() : play(i + 1)));

      // Bola 3D en vivo, sin suelo ni reflejo: arranca con la escala de .sr-ball (20 % → 100 %) y gira sobre sí misma.
      let mounting = false;
      const mountLive = () => {
        if (inspector || mounting || calm) return;
        mounting = true;
        const holder = document.createElement('div');
        holder.className = 'sr-live';
        root.querySelector('.sr-ball').append(holder);
        loadInspector().then(({ createSkinInspector }) => {
          if (!holder.isConnected) return;
          const api = createSkinInspector(holder, { skin, instance: inst ?? undefined, mode: 'panel', bare: true, autoSpin: true, noFloor: true, noEnv: true, quality: 'high' });
          inspector = { api, el: holder };
          root.classList.add('sr-live-on');
        }).catch(() => holder.remove());
      };

      const settle = () => {
        done = true;
        stage.classList.add('sr-done');
        mountLive();
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
        mountLive(); // arranca ya: la bola gira desde que aparece (CSS la muestra en start[2])
        timers.push(setTimeout(() => {
          const b = img.getBoundingClientRect();
          const c = canvas.getBoundingClientRect();
          canvas.dataset.cx = b.left + b.width / 2 - c.left;
          canvas.dataset.cy = b.top + b.height / 2 - c.top;
          stopBurst = burst(canvas, tier.color, PARTICLES[k], 1 + tier.order * 0.35);
          root.classList.add('sr-shake');
          buzz(tier.order >= 3 ? [60, 30, 60, 30, 120] : [50, 30, 50]);
        }, start[3]));
      }
      timers.push(setTimeout(() => sound(skin, 'hit'), calm ? 0 : start[3]));
      timers.push(setTimeout(settle, total));
    }

    play(0);
  });
}
