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
export function startTutorial(view) {
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
      card.remove();
    },
  };
}
