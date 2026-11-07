import './notifyPopup.css';
import { NOTIFY_MAX, NOTIFY_MS } from './notifyRules.js';
import { icon } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

let stack = null;
function getStack() {
  if (stack?.isConnected) return stack;
  stack = document.createElement('div');
  stack.className = 'notifs';
  stack.setAttribute('aria-live', 'polite');
  document.body.append(stack);
  return stack;
}

/**
 * Aviso emergente. Dura como mucho 5 s y lleva una barra de tiempo que ocupa todo el ancho
 * de la parte inferior. Un toque lo cierra (y ejecuta onClick, si lo hay).
 *   notify({ title, text, kind: 'friend'|'invite'|'info', icon: 'user-plus', onClick })
 */
export function notify({ title = '', text = '', kind = 'info', icon: ic = 'sparkle', onClick, duration = NOTIFY_MS } = {}) {
  const ms = Math.min(Math.max(duration, 500), NOTIFY_MS);
  const root = getStack();
  while (root.children.length >= NOTIFY_MAX) root.firstElementChild.remove();

  const el = document.createElement('div');
  el.className = `notif notif-${esc(kind)}`;
  el.setAttribute('role', 'status');
  el.style.setProperty('--ms', `${ms}ms`);
  el.innerHTML = `
    <span class="notif-icon">${icon(ic)}</span>
    <span class="notif-body"><b>${esc(title)}</b>${text ? `<small>${esc(text)}</small>` : ''}</span>
    <i class="notif-bar"></i>`;
  root.append(el);

  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  };
  const timer = setTimeout(close, ms);
  el.addEventListener('click', () => {
    close();
    onClick?.();
  });
  return close;
}
