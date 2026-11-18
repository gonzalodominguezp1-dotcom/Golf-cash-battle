// Sala de matchmaking compartida por la práctica y la sala en vivo de los torneos: radar con barrido y puntos de
// los rivales, anillo de cuenta atrás, bote, tarjetas de jugador, botones y salida animada. Solo pinta: la búsqueda
// (asientos, cuenta atrás, arranque, cancelar) vive en src/match/matchmakingController.js y la conecta
// src/screens/matchmaking.js. Colores: la lámina de la mesa (--foil/--edge/--glow/--ink de .tier--<id>, la misma de
// las tarjetas de Mesas) o, en Práctica, la de la rareza verde de las skins (tierFoilClass).
//
// Rendimiento: solo se anima transform y opacity. El anillo es UNA animación CSS lineal por mitad (rotación) con la
// duración real y retraso negativo; los efectos puntuales (tic, destello, temblor, bote) van con Web Animations
// (compositor, sin forzar reflow); las animaciones infinitas se pausan con la pestaña oculta (html.doc-hidden).
import { icon } from './icons.js';
import { sfx } from '../game/audio.js';
import { countdownState, hypeLines, ringTiming, seatBlip, tierFoilClass } from './matchmakingRules.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const HYPE_MS = 6000;
const PARTICLES = 10;
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** Pausa las animaciones infinitas mientras la pestaña está oculta (una sola escucha para toda la app). */
export function installDocHidden(doc = typeof document === 'object' ? document : null) {
  if (!doc?.documentElement || doc.__mmHidden) return;
  doc.__mmHidden = true;
  const sync = () => doc.documentElement.classList.toggle('doc-hidden', !!doc.hidden);
  doc.addEventListener('visibilitychange', sync);
  sync();
}

/** Efecto puntual con Web Animations: no hace falta quitar y volver a poner clases (ni forzar reflow). */
function fx(el, frames, opts) {
  if (!el?.animate || reduced()) return null;
  try { return el.animate(frames, opts); } catch { return null; }
}

/** Contenido de una tarjeta de asiento. p: { name, isBot?, me? } o null (vacío). */
export function seatHtml(p) {
  if (!p) return '<span class="avatar mm-avatar-empty"></span><span class="mm-seat-name">Buscando…</span>';
  const tag = p.me ? '<em class="me-tag">TÚ</em>' : p.isBot ? '<em class="bot-tag">BOT</em>' : '';
  return `<span class="avatar">${esc(String(p.name ?? '?')[0])}</span><span class="mm-seat-name">${esc(p.name)}</span>${tag}`;
}

/**
 * Crea la sala.
 * @param {object} o
 * @param {object} o.tier mesa (id, name, entryFee)
 * @param {'practice'|'local'|'live'} o.mode
 * @param {number} o.seats asientos de la mesa
 * @param {string} o.ballHtml <img> de la bola del jugador
 * @param {(n:number)=>string} o.coin pinta una cantidad con su moneda
 * @param {string} o.title título grande
 * @param {string} o.kicker etiqueta pequeña sobre el título
 * @param {string} o.potNote texto bajo el bote
 * @param {string} [o.infoHtml] información de la sala (ya escapada): se despliega con el botón «i» de arriba
 * @param {string} [o.infoLabel] nombre accesible del botón «i»
 * @param {string} o.cancelLabel botón «Cancelar emparejamiento»
 * @param {string} o.lobbyLabel botón «Volver al lobby» (la búsqueda sigue)
 * @param {boolean} [o.fresh=true] primera vez que se ve la sala: entradas animadas y escalonadas
 * @param {string} [o.extraClass]
 */
export function createMatchmakingView(o) {
  installDocHidden();
  const fresh = o.fresh !== false;
  const t = document.createElement('template');
  const particles = Array.from({ length: PARTICLES }, (_, i) =>
    `<i style="--x:${((i * 61) % 100).toFixed(0)}%;--d:${(6 + ((i * 7) % 8)).toFixed(1)}s;--dl:${(-(i * 0.91) % 9).toFixed(2)}s;--s:${2 + (i % 3)}px"></i>`).join('');
  const showPot = o.tier.entryFee > 0;
  const info = o.infoHtml
    ? `<details class="mm-info"><summary aria-label="${o.infoLabel ?? ''}" title="${o.infoLabel ?? ''}">i</summary><div class="mm-info-body">${o.infoHtml}</div></details>`
    : '';
  t.innerHTML = `
    <main class="screen matchmaking mm is-scan ${fresh ? 'is-fresh' : 'is-resume'} mode-${o.mode} tier--${o.tier.id} ${tierFoilClass(o.tier.id)} ${o.extraClass ?? ''}" style="--beat:1.2s">
      <div class="mm-bg" aria-hidden="true"><div class="mm-foil"></div><div class="mm-glow"></div><div class="mm-grid"></div><div class="mm-particles">${particles}</div><div class="mm-vignette"></div></div>
      <div class="mm-flash" aria-hidden="true"></div>
      <header class="mm-head">
        <div class="mm-head-top"><span class="mm-kicker"><i class="mm-live-dot"></i>${o.kicker}</span>${info}</div>
        <h1 class="mm-title">${o.title}</h1>
        <p class="mm-hype" aria-live="polite"></p>
      </header>
      <section class="mm-core">
        <div class="mm-radar">
          <div class="mm-rings"><span></span><span></span><span></span></div>
          <div class="mm-sweep"></div>
          <div class="mm-blips"></div>
          <div class="mm-ring" aria-hidden="true">
            <i class="mm-ring-foil"></i><i class="mm-ring-hot"></i>
            <span class="mm-ring-half is-r"><i class="mm-ring-cov mm-clock"></i></span>
            <span class="mm-ring-half is-l"><i class="mm-ring-cov mm-clock"></i></span>
          </div>
          <div class="mm-center">
            <div class="mm-ball">${o.ballHtml}</div>
            <div class="mm-count" role="timer" aria-live="off"><b class="mm-secs">0</b><small>seg</small></div>
            <div class="mm-go">¡YA!</div>
          </div>
        </div>
        ${showPot ? `
        <div class="mm-pot">
          <i class="mm-pot-glow" aria-hidden="true"></i>
          <small class="mm-pot-label">${icon('trophy')} Bote en juego</small>
          <div class="mm-pot-panel"><strong class="mm-pot-val">${o.coin(0)}</strong></div>
          ${o.potNote ? `<span class="mm-pot-note">${o.potNote}</span>` : ''}
        </div>` : `
        <div class="mm-pot is-free">
          <i class="mm-pot-glow" aria-hidden="true"></i>
          <small class="mm-pot-label">${icon('flag')} Entrenamiento</small>
          <div class="mm-pot-panel"><strong class="mm-pot-val">Sin apuesta</strong></div>
          ${o.potNote ? `<span class="mm-pot-note">${o.potNote}</span>` : ''}
        </div>`}
      </section>
      <div class="mm-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${o.seats}" aria-valuenow="0">
        <div class="mm-bar-fill"></div>
        <span class="mm-bar-label"><b class="mm-bar-n">0</b>/${o.seats} jugadores</span>
      </div>
      <div class="seats mm-seats">${Array.from({ length: o.seats }, (_, i) => `<div class="seat" style="--i:${i}">${seatHtml(null)}</div>`).join('')}</div>
      <div class="mm-actions">
        <button type="button" class="mm-btn mm-btn-cancel cancel" data-mm-cancel>${icon('close')}${o.cancelLabel}</button>
        <button type="button" class="mm-btn mm-btn-lobby" data-mm-lobby>${icon('back')}${o.lobbyLabel ?? ''}</button>
      </div>
    </main>`;
  const view = t.content.firstElementChild;
  const $ = (s) => view.querySelector(s);
  const seatEls = [...$('.mm-seats').children];
  const keys = new Array(o.seats).fill('');
  const blips = new Map();
  const hypeEl = $('.mm-hype');
  const secsEl = $('.mm-secs');
  const countEl = $('.mm-count');
  const covers = [...view.querySelectorAll('.mm-ring-cov')];
  const potEl = $('.mm-pot-val');
  const barFill = $('.mm-bar-fill');
  let total = 0;
  let lastSecs = null;
  let ringEnd = null; // Date.now() al que el anillo llega a 0 (para no reiniciarlo si no cambia)
  let ringFlip = 0;
  let pot = 0;
  let potShown = 0;
  let potRaf = 0;
  let status = null;
  let stopped = false;
  let entering = 0; // asientos que entran a la vez al montar (escalonado)

  // frases de ánimo que rotan (sin forzar reflow: la entrada va con Web Animations); quietas con la pestaña oculta
  const lines = hypeLines(o.mode);
  let hypeIdx = 0;
  let hypeTimer = 0;
  const swapIn = (el) => fx(el, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: OUT });
  const showHype = () => {
    if (status) return;
    hypeEl.textContent = lines[hypeIdx++ % lines.length];
    swapIn(hypeEl);
  };
  const loopHype = () => {
    hypeTimer = setTimeout(() => {
      if (stopped) return;
      if (!document.hidden) showHype();
      loopHype();
    }, HYPE_MS);
  };
  showHype();
  loopHype();

  const updateBar = () => {
    const n = keys.filter(Boolean).length;
    barFill.style.transform = `scaleX(${n / o.seats})`;
    $('.mm-bar-n').textContent = n;
    $('.mm-bar').setAttribute('aria-valuenow', n);
    view.classList.toggle('is-full', n >= o.seats);
  };

  const coinBurst = () => {
    if (reduced() || !view.isConnected) return;
    const box = $('.mm-pot');
    for (let i = 0; i < 5; i++) {
      const c = document.createElement('i');
      c.className = 'mm-coinfx';
      c.innerHTML = icon('coin');
      box.append(c);
      const dx = Math.round((Math.random() - 0.5) * 120);
      const dy = -40 - Math.round(Math.random() * 50);
      const a = fx(c, [
        { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(200deg)`, opacity: 0 },
      ], { duration: 900, delay: i * 40, easing: OUT, fill: 'both' });
      if (a) a.onfinish = () => c.remove(); else c.remove();
    }
  };

  // anillo: dos mitades que giran (transform). Una sola animación lineal por mitad con la duración real;
  // solo se reinicia si cambia la hora de llegada (servidor que retrasa) o al volver a la pestaña.
  const syncRing = (msLeft, force = false) => {
    const end = Date.now() + msLeft;
    if (!force && ringEnd != null && Math.abs(end - ringEnd) < 200) return;
    ringEnd = end;
    const { duration, delay } = ringTiming(msLeft, total);
    ringFlip ^= 1;
    covers[0].style.animation = `mmCovR${ringFlip} ${duration}ms linear ${delay}ms both`;
    covers[1].style.animation = `mmCovL${ringFlip} ${duration}ms linear ${delay}ms both`;
  };
  const onVisible = () => {
    if (!document.hidden && ringEnd != null && view.classList.contains('is-count')) syncRing(Math.max(0, ringEnd - Date.now()), true);
  };
  document.addEventListener('visibilitychange', onVisible);

  const api = {
    view,
    cancelButton: $('[data-mm-cancel]'),
    lobbyButton: $('[data-mm-lobby]'),

    /**
     * Pinta un asiento. Solo toca el DOM si cambia, así la entrada animada sale una vez por jugador.
     * p: { name, color, isBot?, me? } o null. animate=false al volver a una sala ya vista.
     */
    setSeat(i, p, { sound = true, animate = true } = {}) {
      const el = seatEls[i];
      if (!el) return;
      const key = p ? `${p.name}|${p.color}|${!!p.isBot}|${!!p.me}` : '';
      if (key === keys[i]) return;
      const wasEmpty = !keys[i];
      keys[i] = key;
      el.className = 'seat';
      el.innerHTML = seatHtml(p);
      blips.get(i)?.remove();
      blips.delete(i);
      if (p) {
        el.classList.add('filled', ...(p.me ? ['me'] : []), ...(p.isBot ? ['bot'] : []));
        el.style.setProperty('--c', p.color);
        // la clase nueva arranca la entrada sin reflow (el className se acaba de reponer)
        if (wasEmpty && animate) {
          el.style.setProperty('--enter-dl', `${(entering++) * 70}ms`);
          el.classList.add('mm-enter');
        }
        const { x, y } = seatBlip(i, o.seats);
        const b = document.createElement('i');
        b.className = `mm-blip${p.me ? ' me' : ''}${p.isBot ? ' bot' : ''}${animate ? '' : ' is-still'}`;
        b.style.cssText = `left:${x}%;top:${y}%;--c:${p.color}`;
        $('.mm-blips').append(b);
        blips.set(i, b);
        if (sound && wasEmpty && animate) sfx.tick();
      } else {
        el.style.removeProperty('--c');
      }
      updateBar();
    },

    /** Al acabar el primer pintado: los asientos que lleguen después ya no esperan turno. */
    settle() { entering = 0; },

    /** Bote: sube con un contador corto y un chorro de monedas. instant=true al volver a la sala. */
    setPot(value, { instant = false } = {}) {
      if (!o.tier.entryFee || value === pot) return;
      const up = value > pot;
      const from = potShown;
      pot = value;
      cancelAnimationFrame(potRaf);
      if (instant || reduced() || typeof requestAnimationFrame !== 'function') {
        potShown = value;
        potEl.innerHTML = o.coin(value);
        return;
      }
      if (up) {
        coinBurst();
        fx($('.mm-pot'), [{ transform: 'scale(1)' }, { transform: 'scale(1.05)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 450, easing: OUT });
        fx($('.mm-pot-glow'), [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 600, easing: 'ease-out' });
      }
      // el texto solo cambia cuando cambia la cifra que se ve (no en cada frame)
      const t0 = performance.now();
      let shownTxt = '';
      const step = (nowT) => {
        const k = Math.min(1, (nowT - t0) / 500);
        const e = 1 - (1 - k) ** 3;
        potShown = k >= 1 ? value : Math.round(from + (value - from) * e);
        const txt = o.coin(potShown);
        if (txt !== shownTxt) potEl.innerHTML = shownTxt = txt;
        if (k < 1) potRaf = requestAnimationFrame(step);
      };
      potRaf = requestAnimationFrame(step);
    },

    /**
     * Cuenta atrás: ms que faltan y duración total (la lleva la búsqueda). Se llama al cambiar el segundo o la hora
     * de arranque, no por frame: el anillo corre solo.
     */
    setCountdown(msLeft, totalMs = 0) {
      const s = countdownState(msLeft, Math.max(total, totalMs));
      total = s.total;
      if (!view.classList.contains('is-count')) {
        view.classList.remove('is-scan');
        view.classList.add('is-count');
      }
      view.classList.toggle('is-urgent', s.urgent);
      view.style.setProperty('--beat', `${s.beat}s`);
      syncRing(Math.max(0, Number(msLeft) || 0));
      if (s.secs !== lastSecs) {
        secsEl.textContent = s.secs;
        countEl.setAttribute('aria-label', `Empieza en ${s.secs} segundos`);
        if (lastSecs != null && view.isConnected) {
          fx(secsEl, [{ transform: 'scale(1.45)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: SPRING });
          if (s.urgent) {
            sfx.tick();
            fx($('.mm-flash'), [{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
            fx($('.mm-core'), [
              { transform: 'translate(0, 0)' }, { transform: 'translate(-4px, 1px) rotate(-0.6deg)' },
              { transform: 'translate(4px, -1px) rotate(0.6deg)' }, { transform: 'translate(-2px, 0)' }, { transform: 'translate(0, 0)' },
            ], { duration: 340, easing: 'ease-out' });
          }
        }
        lastSecs = s.secs;
      }
    },

    /** Texto fijo en lugar de las frases rotatorias (p. ej. "Rellenando los huecos con bots…"). */
    setStatus(text) {
      if (status === text) return;
      status = text;
      hypeEl.textContent = text ?? '';
      if (text) swapIn(hypeEl);
    },

    /** Mesa llena: el centro pasa a "¡YA!". quiet=true al volver a una sala que ya estaba así. */
    go({ quiet = false } = {}) {
      if (view.classList.contains('is-go')) return;
      view.classList.remove('is-scan', 'is-count', 'is-urgent');
      view.classList.add('is-go');
      $('.mm-title').textContent = '¡Partida encontrada!';
      if (!quiet) sfx.full();
    },

    /** Botones: deshabilitados en cuanto la partida se está lanzando. */
    lock(on = true) {
      api.cancelButton.disabled = on;
      api.lobbyButton.disabled = on;
    },

    /** Salida hacia la partida: zoom y destello. Resuelve cuando ha terminado. */
    async leave(ms = 520) {
      api.stop();
      view.classList.add('is-leaving');
      await wait(reduced() ? 150 : ms);
    },

    stop() {
      stopped = true;
      clearTimeout(hypeTimer);
      cancelAnimationFrame(potRaf);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
  return api;
}
