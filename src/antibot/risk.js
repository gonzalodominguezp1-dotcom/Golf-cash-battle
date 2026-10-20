// Detección de bots. Con la física determinista, un programa puede calcular
// el tiro perfecto y mandarlo sin tocar la pantalla. Aquí se miran las
// señales que deja eso en los golpes que repite el servidor:
//
// - cuánto tarda en tirar desde que la bola se para (un bot no necesita apuntar)
// - si esos tiempos son casi siempre iguales (un humano varía mucho)
// - si llega el gesto de arrastrar el dedo y cuánto dura
// - si juega mucho mejor que el resto de jugadores en los mismos hoyos
//
// Nada de esto es prueba por sí solo: una cuenta marcada no puede entrar en
// mesas de pago y sus premios quedan retenidos hasta que una persona la revise.
// Se comparte con la función submit-hole (pnpm run sync:functions).

export const DEFAULT_RULES = {
  window: 60, // últimos hoyos que se miran
  minWaitTicks: 24, // 0,2 s: menos que eso no da tiempo a arrastrar el dedo
  instantShare: 0.3,
  minTimingShots: 12,
  timingCv: 0.12,
  minDragTicks: 4,
  noGestureShare: 0.5,
  minGestureShots: 6,
  dragCv: 0.08,
  minAccuracyHoles: 9,
  baselineMin: 30, // partidas en un hoyo para fiarse de su media
  strokesGained: -1.2, // golpes por hoyo mejor que la media
  aceShare: 0.6,
};

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const cv = (a) => {
  const m = mean(a);
  if (m <= 0) return 0;
  return Math.sqrt(mean(a.map((x) => (x - m) * (x - m)))) / m;
};
const round = (n) => Math.round(n * 1000) / 1000;

/**
 * Señales de un hoyo a partir de lo que devuelve replayHole y del gesto que
 * manda el cliente ({ d: pasos con el dedo en la pantalla, t: giros }).
 */
export function holeSignals(replay, aim) {
  const n = replay.waits?.length ?? 0;
  const list = Array.isArray(aim) ? aim : [];
  const int = (v) => (Number.isInteger(v) && v >= 0 && v < 1e6 ? v : null);
  return {
    waits: replay.waits ?? [],
    drags: Array.from({ length: n }, (_, i) => int(list[i]?.d)),
    turns: Array.from({ length: n }, (_, i) => int(list[i]?.t)),
  };
}

/**
 * holes: [{ course (-1 = desempate), par, strokes, waits, drags }], más
 * recientes primero. baseline: { [course]: { avg, n } } de todos los jugadores.
 * Devuelve { flags, score, stats }.
 */
export function assessRisk(holes, baseline = {}, rules = {}) {
  const r = { ...DEFAULT_RULES, ...rules };
  const recent = holes.slice(0, r.window);
  // el primer golpe de cada hoyo incluye la animación de entrada: no cuenta
  const waits = recent.flatMap((h) => (h.waits ?? []).slice(1));
  const drags = recent.flatMap((h) => h.drags ?? []);
  const played = recent.filter((h) => h.course >= 0);
  const flags = [];
  const stats = { holes: played.length, shots: drags.length };

  if (waits.length >= r.minTimingShots) {
    stats.instant = round(waits.filter((w) => w < r.minWaitTicks).length / waits.length);
    stats.waitCv = round(cv(waits));
    if (stats.instant >= r.instantShare) flags.push('instant_shots');
    if (stats.waitCv < r.timingCv) flags.push('robotic_timing');
  }

  if (drags.length >= r.minGestureShots) {
    const real = drags.filter((d) => d != null && d >= r.minDragTicks);
    stats.noGesture = round(1 - real.length / drags.length);
    if (stats.noGesture >= r.noGestureShare) flags.push('no_gesture');
    if (real.length >= r.minTimingShots) {
      stats.dragCv = round(cv(real));
      if (stats.dragCv < r.dragCv) flags.push('robotic_gesture');
    }
  }

  if (played.length >= r.minAccuracyHoles) {
    const expected = (h) => {
      const b = baseline[h.course];
      return b && b.n >= r.baselineMin ? b.avg : h.par;
    };
    stats.gained = round(mean(played.map((h) => h.strokes - expected(h))));
    const long = played.filter((h) => h.par >= 3);
    stats.aces = long.length ? round(long.filter((h) => h.strokes === 1).length / long.length) : 0;
    if (stats.gained <= r.strokesGained) flags.push('too_accurate');
    if (long.length >= r.minAccuracyHoles / 3 && stats.aces >= r.aceShare) flags.push('too_many_aces');
  }

  const weights = { instant_shots: 2, robotic_timing: 2, no_gesture: 2, robotic_gesture: 1, too_accurate: 3, too_many_aces: 3 };
  return { flags, score: flags.reduce((s, f) => s + weights[f], 0), stats };
}
