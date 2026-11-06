// Estados de un portal: entrada, estable y salida. Puro (sin three): solo calcula cuánto está abierto
// (open, de 0 a 1) y avisa de cada cambio de estado; quien lo usa pinta y dispara los efectos.
//
//   stable --exit()--> exit --(exitTime)--> closed --enter()--> enter --(enterTime)--> stable
//
// Los portales de hoy nacen abiertos y estables, así que sin llamar a nada se comportan como siempre.
// Si se interrumpe una transición a medias, la apertura continúa desde donde estaba (sin saltos).

const easeOut = (u) => 1 - (1 - u) ** 3;
const easeIn = (u) => u * u;

/**
 * @param portal  Objeto con setOpen(k), como el que devuelve buildPortal.
 * @param opts.enterTime Segundos de apertura completa (0 → 1).
 * @param opts.exitTime  Segundos de cierre completo (1 → 0).
 * @param opts.onState   Se llama con 'enter' | 'stable' | 'exit' | 'closed' en cada cambio de estado.
 */
export function portalState(portal, opts = {}) {
  // un tiempo roto (NaN, negativo, texto) cae al valor por defecto: no debe dejar el portal atascado en NaN
  const time = (v, d) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);
  const enterTime = time(opts.enterTime, 0.6), exitTime = time(opts.exitTime, 0.5), onState = opts.onState;
  let state = 'stable', open = 1;
  let from = 1, to = 1, dur = 1, t = 0;

  const set = (next) => {
    state = next;
    onState?.(next);
  };
  const apply = () => portal.setOpen(open);
  const start = (nextState, target, time) => {
    from = open; to = target; t = 0;
    dur = Math.max(1e-6, time * Math.abs(target - open)); // desde la mitad, solo lo que falta
    set(nextState);
  };

  return {
    get state() { return state; },
    get open() { return open; },
    enter() {
      if (state === 'stable' || state === 'enter') return;
      start('enter', 1, enterTime);
    },
    exit() {
      if (state === 'closed' || state === 'exit') return;
      start('exit', 0, exitTime);
    },
    /** Lo deja abierto de golpe. */
    stable() {
      if (state === 'stable') return;
      open = 1;
      apply();
      set('stable');
    },
    update(dt) {
      if (!Number.isFinite(dt) || dt < 0) return; // un dt roto no debe dejar el portal a medias
      if (state !== 'enter' && state !== 'exit') return;
      t += dt;
      const u = Math.min(1, t / dur);
      open = from + (to - from) * (state === 'enter' ? easeOut(u) : easeIn(u));
      if (u >= 1) open = to;
      apply();
      if (u >= 1) set(state === 'enter' ? 'stable' : 'closed');
    },
  };
}
