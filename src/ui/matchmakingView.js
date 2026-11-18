// Sala de matchmaking compartida por la práctica (startMatch) y la sala en vivo
// de los torneos (showLiveRoom): radar con barrido y puntos de los rivales,
// cuenta atrás con anillo, bote que sube, tarjetas de jugador y salida animada.
// Solo pinta: la lógica (cancelar, temporizador, arrancar) sigue en main.js.
import { icon } from './icons.js';
import { sfx } from '../game/audio.js';
import { countdownState, hypeLines, seatBlip } from './matchmakingRules.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const HYPE_MS = 2800;

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
 * @param {string} [o.legalHtml] párrafos legales (ya escapados)
 * @param {string} o.cancelLabel texto del botón de salir
 * @param {string} [o.extraClass]
 * @param {string} [o.footHtml] HTML extra al final (p. ej. el botón Lobby flotante)
 */
export function createMatchmakingView(o) {
  const t = document.createElement('template');
  const particles = Array.from({ length: 18 }, (_, i) =>
    `<i style="--x:${((i * 53) % 100).toFixed(0)}%;--d:${(5 + ((i * 7) % 9)).toFixed(1)}s;--dl:${(-(i * 0.73) % 9).toFixed(2)}s;--s:${2 + (i % 3)}px"></i>`).join('');
  const showPot = o.tier.entryFee > 0;
  t.innerHTML = `
    <main class="screen matchmaking mm is-scan mode-${o.mode} tier--${o.tier.id} ${o.extraClass ?? ''}" style="--beat:1.2s">
      <div class="mm-bg" aria-hidden="true"><div class="mm-glow"></div><div class="mm-grid"></div><div class="mm-particles">${particles}</div></div>
      <div class="mm-flash" aria-hidden="true"></div>
      <header class="mm-head">
        <span class="mm-kicker"><i class="mm-live-dot"></i>${o.kicker}</span>
        <h1 class="mm-title">${o.title}</h1>
        <p class="mm-hype" aria-live="polite"></p>
      </header>
      <section class="mm-core">
        <div class="mm-radar">
          <div class="mm-rings"><span></span><span></span><span></span></div>
          <div class="mm-sweep"></div>
          <div class="mm-blips"></div>
          <svg class="mm-ring" viewBox="0 0 200 200" aria-hidden="true">
            <circle class="mm-ring-track" cx="100" cy="100" r="94" pathLength="100"></circle>
            <circle class="mm-ring-fill" cx="100" cy="100" r="94" pathLength="100"></circle>
          </svg>
          <div class="mm-center">
            <div class="mm-ball">${o.ballHtml}</div>
            <div class="mm-count" role="timer" aria-live="off"><b class="mm-secs">0</b><small>seg</small></div>
            <div class="mm-go">¡YA!</div>
          </div>
        </div>
        ${showPot ? `
        <div class="mm-pot">
          <small>${icon('trophy')} Bote en juego</small>
          <strong class="mm-pot-val">${o.coin(0)}</strong>
          <span class="mm-pot-note">${o.potNote ?? ''}</span>
        </div>` : `
        <div class="mm-pot is-free">
          <small>${icon('flag')} Entrenamiento</small>
          <strong class="mm-pot-val">Sin apuesta</strong>
          <span class="mm-pot-note">${o.potNote ?? ''}</span>
        </div>`}
      </section>
      <div class="mm-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${o.seats}" aria-valuenow="0">
        <div class="mm-bar-fill"></div>
        <span class="mm-bar-label"><b class="mm-bar-n">0</b>/${o.seats} jugadores</span>
      </div>
      <div class="seats mm-seats">${Array.from({ length: o.seats }, (_, i) => `<div class="seat" style="--i:${i}">${seatHtml(null)}</div>`).join('')}</div>
      ${o.legalHtml ?? ''}
      <button class="ghost cancel">${icon('close')}${o.cancelLabel}</button>
      ${o.footHtml ?? ''}
    </main>`;
  const view = t.content.firstElementChild;
  const $ = (s) => view.querySelector(s);
  const seatEls = [...$('.mm-seats').children];
  const keys = new Array(o.seats).fill('');
  const blips = new Map();
  const hypeEl = $('.mm-hype');
  const secsEl = $('.mm-secs');
  const ringFill = $('.mm-ring-fill');
  const potEl = $('.mm-pot-val');
  let total = 0;
  let lastSecs = null;
  let pot = 0;
  let potShown = 0;
  let potRaf = 0;
  let status = null;

  // frases de ánimo que rotan; se paran solas al salir de la pantalla
  const lines = hypeLines(o.mode);
  let hypeIdx = 0;
  let wasConnected = false;
  const showHype = () => {
    if (status) return;
    hypeEl.classList.remove('mm-swap');
    void hypeEl.offsetWidth;
    hypeEl.textContent = lines[hypeIdx++ % lines.length];
    hypeEl.classList.add('mm-swap');
  };
  showHype();
  const hypeTimer = setInterval(() => {
    if (view.isConnected) wasConnected = true;
    else if (wasConnected) return clearInterval(hypeTimer);
    showHype();
  }, HYPE_MS);

  const retrigger = (el, cls) => {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  };

  const filledCount = () => keys.filter(Boolean).length;
  const updateBar = () => {
    const n = filledCount();
    $('.mm-bar-fill').style.width = `${(n / o.seats) * 100}%`;
    $('.mm-bar-n').textContent = n;
    $('.mm-bar').setAttribute('aria-valuenow', n);
    view.classList.toggle('is-full', n >= o.seats);
  };

  const coinBurst = () => {
    if (reduced()) return;
    const box = $('.mm-pot');
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('i');
      c.className = 'mm-coinfx';
      c.innerHTML = icon('coin');
      c.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 120)}px`);
      c.style.setProperty('--dy', `${-40 - Math.round(Math.random() * 50)}px`);
      c.style.animationDelay = `${i * 40}ms`;
      box.append(c);
      setTimeout(() => c.remove(), 1100);
    }
  };

  const api = {
    view,
    cancelButton: $('.cancel'),

    /**
     * Pinta un asiento. Solo toca el DOM si cambia, así la entrada animada sale
     * una vez por jugador aunque se llame cada 250 ms.
     * p: { name, color, isBot?, me? } o null.
     */
    setSeat(i, p, { sound = true } = {}) {
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
        if (wasEmpty) retrigger(el, 'mm-enter');
        const { x, y } = seatBlip(i, o.seats);
        const b = document.createElement('i');
        b.className = `mm-blip${p.me ? ' me' : ''}${p.isBot ? ' bot' : ''}`;
        b.style.cssText = `left:${x}%;top:${y}%;--c:${p.color}`;
        $('.mm-blips').append(b);
        blips.set(i, b);
        if (sound && wasEmpty) sfx.tick();
      } else {
        el.style.removeProperty('--c');
      }
      updateBar();
    },

    /** Bote: sube con un contador animado y un chorro de monedas. */
    setPot(value) {
      if (!o.tier.entryFee || value === pot) return;
      const up = value > pot;
      const from = potShown;
      pot = value;
      if (up) {
        coinBurst();
        retrigger($('.mm-pot'), 'mm-bump');
      }
      cancelAnimationFrame(potRaf);
      if (reduced() || typeof requestAnimationFrame !== 'function') {
        potShown = value;
        potEl.innerHTML = o.coin(value);
        return;
      }
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / 650);
        const e = 1 - (1 - k) ** 3;
        potShown = k >= 1 ? value : Math.round((from + (value - from) * e) * 100) / 100;
        potEl.innerHTML = o.coin(potShown);
        if (k < 1) potRaf = requestAnimationFrame(step);
      };
      potRaf = requestAnimationFrame(step);
    },

    /** Cuenta atrás hasta el arranque (ms que faltan). La duración total se deduce sola. */
    setCountdown(msLeft) {
      const s = countdownState(msLeft, total);
      total = s.total;
      view.classList.remove('is-scan');
      view.classList.add('is-count');
      view.classList.toggle('is-urgent', s.urgent);
      view.style.setProperty('--beat', `${s.beat}s`);
      ringFill.style.strokeDashoffset = String(100 - s.frac * 100);
      if (s.secs !== lastSecs) {
        secsEl.textContent = s.secs;
        $('.mm-count').setAttribute('aria-label', `Empieza en ${s.secs} segundos`);
        if (lastSecs != null) retrigger(secsEl, 'mm-tick');
        if (s.urgent && lastSecs != null) {
          sfx.tick();
          retrigger($('.mm-flash'), 'mm-flash-on');
          if (!reduced()) retrigger($('.mm-core'), 'mm-shake');
        }
        lastSecs = s.secs;
      }
    },

    /** Texto fijo en lugar de las frases rotatorias (p. ej. "Rellenando los huecos con bots…"). */
    setStatus(text) {
      status = text;
      hypeEl.textContent = text;
      retrigger(hypeEl, 'mm-swap');
    },

    /** Mesa llena: el centro pasa a "¡YA!". */
    go() {
      view.classList.remove('is-scan', 'is-count', 'is-urgent');
      view.classList.add('is-go');
      ringFill.style.strokeDashoffset = '0';
      $('.mm-title').textContent = '¡Partida encontrada!';
      sfx.full();
    },

    /** Salida hacia la partida: zoom y destello. Resuelve cuando ha terminado. */
    async leave(ms = 520) {
      clearInterval(hypeTimer);
      cancelAnimationFrame(potRaf);
      view.classList.add('is-leaving');
      await wait(reduced() ? 150 : ms);
    },

    stop() {
      clearInterval(hypeTimer);
      cancelAnimationFrame(potRaf);
    },
  };
  return api;
}
