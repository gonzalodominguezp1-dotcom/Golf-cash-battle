// Versión para portales de juegos web (CrazyGames, Poki...): gratis, con anuncios
// del portal y sin dinero. Se activa al compilar con VITE_PORTAL (p. ej.
// `pnpm build:crazygames`). Fuera de esa build todo esto no hace nada.
//
// En la build de portal: sin mesas de pago, sin wallet, sin cuenta ni ranking
// online (todo es local en el navegador). El SDK del portal se usa para
// avisar de carga/juego y para los anuncios entre partidas.

export const PORTAL = import.meta.env.VITE_PORTAL || '';
export const IS_PORTAL = Boolean(PORTAL);

const SDK_URL = {
  crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
  poki: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
};

let sdk = null; // adaptador listo, o null si no hay SDK (local, adblock, dominio no permitido)
let playing = false;
let adHooks = { mute: () => {}, unmute: () => {} };

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`No carga ${src}`));
    document.head.append(s);
  });
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

function crazyAdapter() {
  const C = window.CrazyGames.SDK;
  // fuera de CrazyGames (o de localhost) el SDK está "disabled" y cada llamada lanza
  if (C.environment === 'disabled') return null;
  return {
    loadingStart: () => C.game.loadingStart(),
    loadingStop: () => C.game.loadingStop(),
    gameplayStart: () => C.game.gameplayStart(),
    gameplayStop: () => C.game.gameplayStop(),
    happytime: () => C.game.happytime(),
    midgame: () => new Promise((resolve) => {
      C.ad.requestAd('midgame', {
        adStarted: () => adHooks.mute(),
        adFinished: () => { adHooks.unmute(); resolve(); },
        adError: () => { adHooks.unmute(); resolve(); },
      });
    }),
    // 'ok' visto entero; 'unavailable' sin anuncios ahora (Basic Launch, sin relleno); 'adblock'
    rewarded: () => new Promise((resolve) => {
      C.ad.requestAd('rewarded', {
        adStarted: () => adHooks.mute(),
        adFinished: () => { adHooks.unmute(); resolve('ok'); },
        adError: (err) => {
          adHooks.unmute();
          const code = err?.code ?? err;
          resolve(code === 'adblock' ? 'adblock' : code === 'adsDisabled' ? 'disabled' : 'unavailable');
        },
      });
    }),
    // el jugador puede silenciar desde el propio portal
    onMuteSetting: (cb) => {
      const read = () => cb(Boolean(C.game.settings?.muteAudio));
      C.game.addSettingsChangeListener?.(read);
      read();
    },
  };
}

function pokiAdapter() {
  const P = window.PokiSDK;
  return {
    loadingStart: () => {},
    loadingStop: () => P.gameLoadingFinished(),
    gameplayStart: () => P.gameplayStart(),
    gameplayStop: () => P.gameplayStop(),
    happytime: () => {},
    midgame: () => P.commercialBreak(() => adHooks.mute()).finally(() => adHooks.unmute()),
    rewarded: () => P.rewardedBreak(() => adHooks.mute()).then((ok) => (ok ? 'ok' : 'unavailable')).finally(() => adHooks.unmute()),
    onMuteSetting: () => {},
  };
}

/** Carga e inicia el SDK del portal. Nunca falla: sin SDK el juego va igual, sin anuncios. */
export async function initPortal(hooks = {}) {
  adHooks = { ...adHooks, ...hooks };
  if (!IS_PORTAL || !SDK_URL[PORTAL]) return;
  try {
    await withTimeout(loadScript(SDK_URL[PORTAL]), 8000);
    if (PORTAL === 'crazygames') {
      await withTimeout(window.CrazyGames.SDK.init(), 8000);
      sdk = crazyAdapter();
    } else if (PORTAL === 'poki') {
      await withTimeout(window.PokiSDK.init(), 8000).catch(() => {});
      sdk = pokiAdapter();
    }
    if (sdk && hooks.setMuted) sdk.onMuteSetting(hooks.setMuted);
  } catch (e) {
    console.warn('SDK del portal no disponible:', e);
    sdk = null;
  }
}

const call = (name) => {
  try { sdk?.[name](); } catch (e) { console.warn(`portal.${name}`, e); }
};

export const loadingStart = () => call('loadingStart');
export const loadingStop = () => call('loadingStop');
export const happytime = () => call('happytime');

/** Empieza el juego activo (un hoyo en marcha). Se puede llamar de más: solo avisa al cambiar. */
export function gameplayStart() {
  if (playing) return;
  playing = true;
  call('gameplayStart');
}

/** Menús, resultados, pausa. */
export function gameplayStop() {
  if (!playing) return;
  playing = false;
  call('gameplayStop');
}

/** Anuncio entre partidas. El portal decide si sale (hay un mínimo de minutos entre anuncios). */
export async function midgameAd() {
  if (!sdk) return;
  gameplayStop();
  try {
    await withTimeout(sdk.midgame(), 60000);
  } catch (e) {
    adHooks.unmute();
    console.warn('portal.midgame', e);
  }
}

/**
 * Anuncio recompensado (cofre). Devuelve 'ok' si hay que dar el premio, 'adblock' o
 * 'unavailable' si no. Sin SDK, con los anuncios desactivados o sin anuncio que dar
 * (Basic Launch de CrazyGames) se da el premio igualmente: es solo cosmético y así el cofre funciona.
 */
export async function rewardedAd() {
  if (!sdk) return 'ok';
  gameplayStop();
  try {
    const r = await withTimeout(sdk.rewarded(), 90000);
    // si no hay anuncio que dar (Basic Launch, sin relleno), el cofre se abre igual
    return r === 'adblock' ? 'adblock' : 'ok';
  } catch (e) {
    adHooks.unmute();
    console.warn('portal.rewarded', e);
    return 'ok';
  }
}
