// Primer hoyo guiado de la build de portal: en la primera partida de un jugador
// nuevo sale una tarjeta que explica cómo se tira; tras el primer golpe, otra
// con el objetivo. Se guarda en el navegador para no repetirlo.

import { IS_PORTAL } from './portal.js';

const KEY = 'gb.tutorial.v1';

export function tutorialPending() {
  if (!IS_PORTAL) return false;
  try {
    return localStorage.getItem(KEY) !== '1';
  } catch {
    return false;
  }
}

function markDone() {
  try { localStorage.setItem(KEY, '1'); } catch { }
}

const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/**
 * Muestra el tutorial sobre la pantalla de juego. Devuelve { stroke(n), dispose() }:
 * stroke se llama con cada golpe para pasar de paso.
 */
export function startTutorial(view, game = null) {
  const hand = game ? ballHand(view, game) : null;
  const card = document.createElement('div');
  card.className = 'tutorial-card';
  card.innerHTML = `
    <div class="tut-gesture" aria-hidden="true"><i class="tut-ball"></i><i class="tut-finger"></i><i class="tut-trail"></i></div>
    <div class="tut-text">
      <b class="tut-title">Cómo se juega</b>
      <p class="tut-line"><span>Arrastra hacia atrás desde la bola y suelta para tirar</span></p>
      <p class="tut-sub"><span>Cuanto más lejos arrastres, más fuerte</span></p>
      ${touch ? '<p class="tut-sub"><span>Desliza en otro sitio para girar la cámara</span></p>' : ''}
    </div>`;
  view.append(card);
  let step = 0;
  let timer = null;
  const close = () => {
    clearTimeout(timer);
    card.classList.add('gone');
    setTimeout(() => card.remove(), 400);
  };
  return {
    stroke(n) {
      if (n < 1 || step > 0) return;
      step = 1;
      hand?.dispose();
      markDone();
      card.classList.add('step2');
      card.innerHTML = `
        <div class="tut-text">
          <p class="tut-line"><span>¡Bien! Mete la bola en el hoyo con los menos golpes posibles</span></p>
          <p class="tut-sub"><span>Usa «Ver mapa» para ver el hoyo entero</span></p>
        </div>
        <button class="chip-btn tut-ok"><span>Entendido</span></button>`;
      card.querySelector('.tut-ok').addEventListener('click', close);
      timer = setTimeout(close, 6000);
    },
    dispose() {
      clearTimeout(timer);
      hand?.dispose();
      card.remove();
    },
  };
}

/**
 * Mano animada encima de la bola del jugador (primer tiro): enseña el gesto de arrastrar
 * hacia atrás justo donde hay que hacerlo. Se oculta mientras se apunta, con la bola en
 * movimiento, en la vista de mapa o durante la intro de cámara.
 */
function ballHand(view, game) {
  const el = document.createElement('div');
  el.className = 'tut-hand';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<i class="tut-hand-ring"></i><i class="tut-hand-line"></i><svg class="tut-hand-ico" viewBox="0 0 48 48" width="48" height="48"><path d="M18 22V9.5a3.5 3.5 0 0 1 7 0V20l.2-3.3a3.3 3.3 0 0 1 6.6.3v3.6a3.2 3.2 0 0 1 6.2.9v2.4a3 3 0 0 1 5.8 1v7.6C43.8 39.6 38 45 31 45h-3.4c-4.6 0-8.4-2.2-11-5.9l-6.7-9.7a3.4 3.4 0 0 1 5.3-4.2z" fill="#fff" stroke="#1b2230" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
  // en el contenedor del juego (como la marca del hoyo): mismas coordenadas que el canvas
  (game.container ?? view).append(el);
  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const m = game.ballRoot, cam = game.camera;
    const box = game.container ?? view;
    const rect = { width: box.clientWidth, height: box.clientHeight };
    const busy = !m || !cam || game.charging || game.overview || game.paused || game.locked || (game.intro ?? 1) < 1
      || (game.ball && (Math.abs(game.ball.vx) + Math.abs(game.ball.vz)) > 0.01);
    if (busy) { el.classList.remove('on'); return; }
    const v = m.position.clone().project(cam);
    if (v.z > 1) { el.classList.remove('on'); return; }
    el.style.transform = `translate(${((v.x * 0.5 + 0.5) * rect.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * rect.height).toFixed(1)}px)`;
    el.classList.add('on');
  };
  raf = requestAnimationFrame(tick);
  return {
    dispose() {
      cancelAnimationFrame(raf);
      el.classList.remove('on');
      setTimeout(() => el.remove(), 300);
    },
  };
}
