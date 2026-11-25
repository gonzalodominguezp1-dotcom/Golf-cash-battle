// Búsqueda de partida (emparejamiento) que vive FUERA de la vista: asientos, cuenta atrás, lanzamiento al
// llegar a 0 y cancelación. La sala (src/screens/matchmaking.js) y el aviso flotante (src/ui/matchmakingBanner.js)
// solo se suscriben y pintan; si se desmontan, la búsqueda sigue. main.js crea la búsqueda (práctica o en vivo)
// y le da los pasos que dependen del servidor (onCancel, onLaunch, show).
//
// Solo hay una búsqueda activa a la vez (activeSearch). Al acabar (partida empezada, cancelada o abortada) deja de
// estar activa y avisa a quien escuche onActiveSearch (el aviso flotante).
import { countdownState, nextTickDelay } from '../ui/matchmakingRules.js';

let active = null;
const activeSubs = new Set();
const announce = () => { for (const fn of [...activeSubs]) fn(active); };

/** La búsqueda en curso (o null). */
export const activeSearch = () => active;

/** Escucha cuándo empieza o acaba una búsqueda. Devuelve la baja. */
export function onActiveSearch(fn) {
  activeSubs.add(fn);
  return () => activeSubs.delete(fn);
}

/** Solo para pruebas: olvida la búsqueda activa sin llamar a nada. */
export function resetSearches() {
  active?.abort();
  active = null;
}

/**
 * Crea la búsqueda activa (sustituye a otra que hubiera, abortándola sin cancelar en servidor: main.js no deja
 * empezar otra con una activa).
 * @param {object} o
 * @param {object} o.tier mesa
 * @param {'practice'|'local'|'live'} o.mode
 * @param {number} o.seats asientos
 * @param {object} [o.info] textos ya escapados para la sala: { kicker, title, potNote, infoHtml }
 * @param {() => number} [o.now] reloj de la cuenta atrás (en vivo: hora del servidor)
 * @param {object} [o.timers] setTimeout/clearTimeout (inyectable en pruebas)
 * @param {() => any} [o.onCancel] sale de la mesa y recupera la entrada (se llama UNA sola vez)
 * @param {(s) => any} [o.onLaunch] arranque al llegar la cuenta atrás a 0 (se llama UNA sola vez)
 * @param {() => any} [o.show] lleva al usuario a la sala (router)
 * @param {number} [o.presentMs] cuánto se espera a que la sala se monte tras show()
 */
export function createSearch(o) {
  const timers = o.timers ?? globalThis;
  const now = o.now ?? (() => Date.now());
  const subs = new Set();
  let tickTimer = null;
  let cancelP = null;
  let launchP = null;
  let viewers = 0;
  let lastSecs = null;
  const waiters = new Set(); // present() esperando a que se monte una sala

  const emit = (type, extra = {}) => {
    const ev = { type, ...extra };
    for (const fn of [...subs]) {
      try { fn(ev, s); } catch (e) { console.error('matchmaking', e); }
    }
  };

  const stopTick = () => {
    if (tickTimer != null) timers.clearTimeout(tickTimer);
    tickTimer = null;
  };

  const end = (phase) => {
    if (s.ended) return false;
    s.phase = phase;
    s.ended = true;
    stopTick();
    for (const w of [...waiters]) w();
    if (active === s) { active = null; announce(); }
    emit('end', { phase });
    return true;
  };

  // un tic por segundo, alineado al cambio de segundo; a 0 lanza la partida
  const tick = () => {
    tickTimer = null;
    if (s.ended || s.startsAt == null) return;
    const left = s.msLeft();
    const c = countdownState(left, s.total);
    s.total = c.total;
    if (c.secs !== lastSecs) {
      lastSecs = c.secs;
      emit('second', { secs: c.secs, urgent: c.urgent });
    }
    if (left <= 0) {
      if (s.phase === 'search' && o.onLaunch) s.launch().catch(() => {});
      return;
    }
    tickTimer = timers.setTimeout(tick, nextTickDelay(left));
  };

  const s = {
    tier: o.tier,
    mode: o.mode,
    seats: o.seats,
    info: o.info ?? {},
    players: new Array(o.seats).fill(null),
    /** 'search' → 'launching' → 'go' → 'leaving' → 'done'; o 'cancelled' / 'aborted' / 'error' */
    phase: 'search',
    ended: false,
    startsAt: null,
    total: 0, // duración total de la cuenta atrás (lo máximo que ha faltado): el anillo se adapta
    status: null,
    /** la sala ya se ha visto alguna vez (al volver a ella no se repiten las entradas animadas) */
    seen: false,
    /** la sala registra aquí su salida animada */
    leaving: null,

    get visible() { return viewers > 0; },

    msLeft() {
      return s.startsAt == null ? null : Math.max(0, s.startsAt - now());
    },

    /** Estado de la cuenta atrás (o null si aún no hay hora de arranque). */
    countdown() {
      if (s.startsAt == null) return null;
      return { ...countdownState(s.msLeft(), s.total), msLeft: s.msLeft() };
    },

    filled() { return s.players.filter(Boolean).length; },

    setSeat(i, p) {
      if (s.ended || i < 0 || i >= s.seats) return;
      // avatar y marco viajan con el asiento (la vista los pinta); sin ellos el jugador se ve como inicial
      const next = p ? { name: p.name, color: p.color, me: !!p.me, isBot: !!p.isBot, avatar: p.avatar ?? null, frame: p.frame ?? null } : null;
      const prev = s.players[i];
      if (JSON.stringify(prev) === JSON.stringify(next)) return;
      s.players[i] = next;
      emit('seat', { i, joined: !prev && !!next });
    },

    /** Hora de arranque en el reloj `now`. Si el servidor la mueve, la cuenta atrás se reajusta. */
    setStartsAt(ms) {
      if (s.ended) return;
      const v = ms == null ? null : Number(ms);
      if (v === s.startsAt) return;
      s.startsAt = v;
      if (v != null) s.total = countdownState(s.msLeft(), s.total).total;
      emit('count');
      stopTick();
      if (v != null) tick();
    },

    setStatus(text) {
      if (s.ended) return;
      s.status = text;
      emit('status');
    },

    setPhase(phase) {
      if (s.ended || s.phase === phase) return;
      s.phase = phase;
      emit('phase');
    },

    /** Mesa llena: «¡YA!». */
    go() { s.setPhase('go'); },

    /** Salida animada de la sala (si está a la vista). Resuelve al acabar. */
    async leave() {
      if (s.ended) return;
      s.setPhase('leaving');
      await s.leaving?.();
    },

    /** Lanza la partida. Si falla, pasa a error y se puede cancelar o reintentar. */
    launch() {
      if (launchP) return launchP;
      if (s.ended || !o.onLaunch) return Promise.resolve();
      stopTick();
      s.setPhase('launching');
      launchP = (async () => {
        try {
          return await o.onLaunch(s);
        } catch (err) {
          launchP = null;
          if (!s.ended) s.setPhase('error');
          throw err;
        }
      })();
      return launchP;
    },

    /** Cancela la búsqueda y recupera la entrada. Idempotente: onCancel se llama una sola vez. */
    cancel() {
      if (cancelP) return cancelP;
      if (s.ended || !['search', 'error'].includes(s.phase)) return Promise.resolve(false);
      end('cancelled');
      cancelP = Promise.resolve()
        .then(() => o.onCancel?.())
        .then(() => true, (e) => { console.error('matchmaking cancel', e); return true; });
      return cancelP;
    },

    /** La partida empezó: la búsqueda deja de estar activa. */
    finish() { end('done'); },

    /** Se deja la búsqueda sin tocar el servidor (otra cosa ya la cerró). */
    abort() { end('aborted'); },

    /** La sala se monta (o desmonta): el aviso flotante se esconde mientras haya una a la vista. */
    attachView() {
      viewers++;
      s.seen = true;
      for (const w of [...waiters]) w();
      emit('view');
      let on = true;
      return () => {
        if (!on) return;
        on = false;
        viewers--;
        emit('view');
      };
    },

    /** Lleva al usuario a la sala si no la está viendo. Resuelve al montarse (o tras presentMs). */
    present() {
      if (s.ended || viewers > 0) return Promise.resolve();
      return new Promise((resolve) => {
        let timer = null;
        const done = () => {
          waiters.delete(done);
          if (timer != null) timers.clearTimeout(timer);
          resolve();
        };
        waiters.add(done);
        timer = timers.setTimeout(done, o.presentMs ?? 1500);
        try { o.show?.(); } catch (e) { console.error('matchmaking show', e); done(); }
      });
    },

    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };

  if (active && !active.ended) active.abort();
  active = s;
  announce();
  return s;
}
