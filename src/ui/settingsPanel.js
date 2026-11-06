// Panel de Ajustes: Controles, Calidad y Sonido. Lo usan la pantalla Ajustes del menú
// (menú lateral en el ordenador, barra inferior en el móvil) y el menú de pausa de la
// partida (pestañas arriba). Todo lo que se toca se guarda al momento en settings.js.

import './settingsPanel.css';
import { deviceKind, settings } from '../settings/settings.js';
import { QUALITY_LEVELS, QUALITY_NAMES, defaultQuality, getQuality, isAutoQuality, setQuality } from '../game/render/quality.js';
import { sfx, unlockAudio } from '../game/audio.js';

export const SECTIONS = [
  { id: 'controls', name: 'Controles', icon: '🎮', blurb: 'Cámara, apuntado y fuerza del tiro.' },
  { id: 'quality', name: 'Calidad', icon: '✨', blurb: 'Cómo se dibuja el juego. Nunca cambia la física.' },
  { id: 'sound', name: 'Sonido', icon: '🔊', blurb: 'Volumen del juego y del ambiente.' },
];

const QUALITY_HINTS = {
  auto: 'La que mejor va en este dispositivo.',
  low: 'Sin sombras ni brillos. Para móviles que se calientan o van lentos.',
  medium: 'Sombras y brillo con un coste moderado.',
  high: 'Todo el detalle: sombras suaves, hierba densa y efectos completos.',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const toggle = (key, label, hint, on) => `
  <div class="sp-row">
    <div class="sp-label"><strong id="sp-l-${key}">${label}</strong><small>${hint}</small></div>
    <button class="sp-switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-labelledby="sp-l-${key}" data-toggle="${key}"><i></i></button>
  </div>`;

const slider = (key, label, hint, value, { min, max, step, fmt }) => `
  <div class="sp-row sp-row-slider">
    <div class="sp-label"><strong id="sp-l-${key}">${label}</strong><small>${hint}</small></div>
    <div class="sp-slider">
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-slider="${key}" aria-labelledby="sp-l-${key}" style="--p:${((value - min) / (max - min)) * 100}%">
      <output data-out="${key}">${fmt(value)}</output>
    </div>
  </div>`;

const segmented = (key, label, hint, options, value) => `
  <div class="sp-row sp-row-seg">
    <div class="sp-label"><strong id="sp-l-${key}">${label}</strong><small>${hint}</small></div>
    <div class="sp-seg" role="radiogroup" aria-labelledby="sp-l-${key}">
      ${options.map((o) => `<button role="radio" aria-checked="${o.id === value}" class="${o.id === value ? 'on' : ''}" data-seg="${key}" data-v="${o.id}">${o.name}</button>`).join('')}
    </div>
  </div>`;

const times = (v) => `${Number(v).toFixed(2)}×`;
const pct = (v) => `${Math.round(v)} %`;

function controlsHtml(c, desktop) {
  return `
    <h4 class="sp-group">Cámara</h4>
    ${toggle('invertCameraX', 'Invertir cámara (horizontal)', 'Al arrastrar a un lado, la cámara gira hacia el otro.', c.invertCameraX)}
    ${toggle('invertCameraY', 'Invertir cámara (vertical)', desktop ? 'Arriba y abajo inclinan la vista del mapa al revés.' : 'Arriba y abajo acercan o alejan al revés, y la vista del mapa se inclina al revés.', c.invertCameraY)}
    ${slider('cameraSensitivity', 'Sensibilidad de la cámara', 'Cuánto gira la cámara por cada movimiento.', c.cameraSensitivity, { min: 0.4, max: 2.5, step: 0.05, fmt: times })}
    <h4 class="sp-group">Tiro</h4>
    ${toggle('invertAim', 'Invertir ángulo de tiro', 'Mover a la derecha apunta a la izquierda.', c.invertAim)}
    ${toggle('invertPower', 'Cargar empujando', desktop ? 'La fuerza sube al mover el ratón hacia delante en vez de hacia atrás.' : 'La fuerza sube al empujar el dedo hacia delante en vez de tirar hacia atrás.', c.invertPower)}
    ${slider('aimSensitivity', 'Sensibilidad del apuntado', 'Más bajo = apuntado más fino.', c.aimSensitivity, { min: 0.4, max: 2.5, step: 0.05, fmt: times })}
    ${desktop
      ? segmented('wheel', 'Rueda del ratón', 'Con la bola parada: ajustar la fuerza o hacer zoom.', [{ id: 'power', name: 'Fuerza' }, { id: 'zoom', name: 'Zoom' }], c.wheel)
      : toggle('vibration', 'Vibración', 'Pequeños toques al tocar la bola, cargar y embocar.', c.vibration)}
    ${desktop ? `
    <div class="sp-keys">
      <div class="sp-keys-title">Teclas</div>
      <div class="sp-keys-grid">
        <span><kbd>Ratón</kbd> Apuntar · clic izquierdo y soltar para tirar</span>
        <span><kbd>Clic der.</kbd> Girar la cámara</span>
        <span><kbd>Rueda</kbd> ${c.wheel === 'power' ? 'Fuerza (Ctrl + rueda: zoom)' : 'Zoom'}</span>
        <span><kbd>Espacio</kbd> Vista del mapa</span>
        <span><kbd>Esc</kbd> Pausa y ajustes</span>
        <span><kbd>M</kbd> Silenciar</span>
      </div>
    </div>` : ''}`;
}

function qualityHtml(device) {
  const auto = isAutoQuality();
  const current = auto ? 'auto' : getQuality();
  const opts = [{ id: 'auto', name: 'Auto' }, ...QUALITY_LEVELS.map((q) => ({ id: q, name: QUALITY_NAMES[q] }))];
  return `
    <div class="sp-quality" role="radiogroup" aria-label="Calidad gráfica">
      ${opts.map((o) => `
        <button class="sp-qcard ${o.id === current ? 'on' : ''}" role="radio" aria-checked="${o.id === current}" data-quality="${o.id}">
          <b>${o.name}${o.id === 'auto' ? ` <em>· ${QUALITY_NAMES[defaultQuality()]}</em>` : ''}</b>
          <small>${QUALITY_HINTS[o.id]}</small>
        </button>`).join('')}
    </div>
    <p class="sp-note">Se guarda aparte para el móvil y el ordenador. Este dispositivo: <b>${device === 'mobile' ? 'móvil' : 'ordenador'}</b>.</p>`;
}

function soundHtml(s) {
  return `
    ${toggle('muted', 'Silenciar', 'Quita todo el sonido. Atajo en el ordenador: M.', s.muted)}
    ${slider('master', 'Volumen general', 'Golpes, rebotes, música de victoria.', s.master, { min: 0, max: 100, step: 1, fmt: pct })}
    ${slider('ambient', 'Ambiente', 'Pájaros, olas, lluvia, grillos…', s.ambient, { min: 0, max: 100, step: 1, fmt: pct })}
    <div class="sp-row"><div class="sp-label"><strong>Probar</strong><small>Suena un golpe con el volumen elegido.</small></div><button class="sp-btn sp-test">Probar sonido</button></div>`;
}

// a qué sección del almacén pertenece cada control
const SECTION_OF = {
  invertCameraX: 'controls', invertCameraY: 'controls', invertAim: 'controls', invertPower: 'controls',
  cameraSensitivity: 'controls', aimSensitivity: 'controls', wheel: 'controls', vibration: 'controls',
  muted: 'sound', master: 'sound', ambient: 'sound',
};

/**
 * Monta el panel en root.
 * - layout: 'screen' (pantalla del menú) o 'modal' (pausa de la partida).
 * - section: sección inicial.
 * - synced: true si se guarda en la cuenta; false si solo en este dispositivo (invitado).
 * - onQuality(level): aviso tras cambiar la calidad (la partida la aplica en caliente).
 * - onBack: botón Volver (solo layout 'screen').
 * Devuelve { destroy, show(section) }.
 */
export function mountSettingsPanel(root, { layout = 'screen', section = 'controls', synced = false, onQuality = null, onBack = null } = {}) {
  const device = deviceKind();
  const desktop = device === 'desktop';
  let current = SECTIONS.some((s) => s.id === section) ? section : 'controls';

  root.innerHTML = `
    <div class="sp sp-${layout}">
      <nav class="sp-nav" aria-label="Secciones de ajustes">
        ${layout === 'screen' ? '<div class="sp-nav-title">Ajustes</div>' : ''}
        ${SECTIONS.map((s) => `<button data-sec="${s.id}" aria-label="${s.name}"><span class="sp-ico" aria-hidden="true">${s.icon}</span><span class="sp-name">${s.name}</span></button>`).join('')}
        ${layout === 'screen' ? `<p class="sp-sync ${synced ? 'on' : ''}">${synced ? '☁️ Se guarda en tu cuenta: vale en el móvil y en el ordenador.' : '📱 Se guarda en este dispositivo. Entra con tu cuenta para llevarlo a otros.'}</p>` : ''}
      </nav>
      <section class="sp-body" aria-live="polite"></section>
    </div>`;
  const body = root.querySelector('.sp-body');

  // focus: selector del control que tenía el foco, para devolvérselo tras repintar
  function render(focus = null) {
    const s = settings.get();
    const meta = SECTIONS.find((x) => x.id === current);
    root.querySelectorAll('[data-sec]').forEach((b) => {
      const on = b.dataset.sec === current;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    body.innerHTML = `
      ${layout === 'screen' ? `<p class="sp-sync sp-sync-m ${synced ? 'on' : ''}">${synced ? '☁️ Se guarda en tu cuenta: vale en el móvil y en el ordenador.' : '📱 Se guarda en este dispositivo. Entra con tu cuenta para llevarlo a otros.'}</p>` : ''}
      <header class="sp-head">
        ${layout === 'screen' && onBack ? '<button class="sp-back" aria-label="Volver">‹ Volver</button>' : ''}
        <div><h2>${meta.icon} ${meta.name}</h2><p>${esc(meta.blurb)}</p></div>
      </header>
      <div class="sp-rows">
        ${current === 'controls' ? controlsHtml(s.controls, desktop) : current === 'quality' ? qualityHtml(device) : soundHtml(s.sound)}
      </div>
      <footer class="sp-foot">
        <span class="sp-saved" hidden>✓ Guardado</span>
        <button class="sp-btn sp-reset">Restablecer ${meta.name.toLowerCase()}</button>
      </footer>`;
    bind();
    if (focus) body.querySelector(focus)?.focus();
  }

  let savedTimer = 0;
  function saved() {
    const el = body.querySelector('.sp-saved');
    if (!el) return;
    el.hidden = false;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => (el.hidden = true), 1600);
  }

  // los cambios hechos aquí no repintan el panel (se perdería el foco); los de fuera sí
  let own = false;
  const mine = (fn) => {
    own = true;
    try {
      fn();
    } finally {
      own = false;
    }
  };
  const put = (key, value) => {
    mine(() => settings.patch({ [SECTION_OF[key]]: { [key]: value } }));
    saved();
  };

  function bind() {
    body.querySelector('.sp-back')?.addEventListener('click', () => onBack?.());
    body.querySelectorAll('[data-toggle]').forEach((b) =>
      b.addEventListener('click', () => {
        const key = b.dataset.toggle;
        const on = !settings.peek()[SECTION_OF[key]][key];
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
        put(key, on);
      }),
    );
    body.querySelectorAll('[data-slider]').forEach((input) => {
      const key = input.dataset.slider;
      const out = body.querySelector(`[data-out="${key}"]`);
      const isSens = SECTION_OF[key] === 'controls';
      const paint = () => {
        const v = Number(input.value);
        input.style.setProperty('--p', `${((v - input.min) / (input.max - input.min)) * 100}%`);
        out.textContent = isSens ? times(v) : pct(v);
        return v;
      };
      input.addEventListener('input', () => put(key, paint()));
      if (!isSens) input.addEventListener('change', () => { unlockAudio(); sfx.hit?.(0.5); });
    });
    body.querySelectorAll('[data-seg]').forEach((b) =>
      b.addEventListener('click', () => {
        put(b.dataset.seg, b.dataset.v);
        render(`[data-seg="${b.dataset.seg}"][data-v="${b.dataset.v}"]`);
      }),
    );
    body.querySelectorAll('[data-quality]').forEach((b) =>
      b.addEventListener('click', () => {
        mine(() => setQuality(b.dataset.quality === 'auto' ? null : b.dataset.quality));
        onQuality?.(getQuality());
        render(`[data-quality="${b.dataset.quality}"]`);
        saved();
      }),
    );
    body.querySelector('.sp-test')?.addEventListener('click', () => {
      unlockAudio();
      sfx.hit?.(0.7);
    });
    body.querySelector('.sp-reset').addEventListener('click', () => {
      mine(() => settings.reset(current));
      if (current === 'quality') onQuality?.(getQuality());
      render('.sp-reset');
      saved();
    });
  }

  root.querySelectorAll('[data-sec]').forEach((b) => b.addEventListener('click', () => show(b.dataset.sec)));

  function show(sec) {
    if (!SECTIONS.some((s) => s.id === sec)) return;
    current = sec;
    try { sessionStorage.setItem('gcb.settings.section', sec); } catch {}
    render();
    if (layout === 'screen') window.scrollTo?.(0, 0);
  }

  // si cambian desde fuera (otra pestaña del menú, la cuenta al entrar) se repinta
  const off = settings.subscribe(() => {
    if (!root.isConnected) return off();
    if (!own) render();
  });

  render();
  return { show, destroy: off };
}

/** Última sección abierta en esta sesión del navegador. */
export function lastSection() {
  try {
    return sessionStorage.getItem('gcb.settings.section') ?? 'controls';
  } catch {
    return 'controls';
  }
}

