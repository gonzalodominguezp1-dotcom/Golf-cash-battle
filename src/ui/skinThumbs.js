import { ballPreview } from '../game/render/ballPaint.js';
import { getQuality } from '../game/render/quality.js';
import { skinById } from '../progress/skins.js';

// Miniaturas estáticas de skins (tarjetas, lobby, desafíos, resultados y reveal), como las vistas
// previas WebP del selector de mapas: la interfaz solo pinta <img>. Este módulo NO importa three.js.
//   warmThumbs()                        -> carga la caché persistente (IndexedDB) en memoria, una vez
//   thumbCached(skin, instance, o)      -> URL ya disponible (síncrono) o null
//   thumbUrl(skin, instance, o)         -> Promise<URL|null>
//   upgradeImg(img, skin, instance, o)  -> pone el marcador 2D `ballPreview` y lo cambia por la miniatura
//   installThumbObserver(root, instOf)  -> mejora cualquier <img data-skin-id> de una skin desbloqueada
// Si falta una miniatura, se renderiza UNA vez en 3D fuera de pantalla (skinThumbRender.js, importado con
// import() solo entonces), en cola de una en una, y se guarda como WebP (PNG si no hay WebP) en memoria y en
// IndexedDB. Al vaciarse la cola se libera el renderer y su contexto WebGL. Desde la segunda visita no se
// renderiza nada ni se carga three.js. Opción `hi: true` (solo el reveal): HI_SIZE px en vez de SIZE.

const VERSION = 1; // súbelo si cambian materiales, shaders o luces de las miniaturas
const SIZE = 144;
const HI_SIZE = 384;
const DB_NAME = 'gcb-skin-thumbs';
const STORE = 'thumbs';
const PREFIX = `v${VERSION}|`;

const mem = new Map(); // clave -> object URL
const inflight = new Map(); // clave -> Promise<URL|null>
const queue = [];
let pumping = false;
let failed = false;
let renderMod = null;

const thumbQuality = () => {
  const q = getQuality();
  return q === 'high' ? 'medium' : q;
};

// Firma de los datos de la skin: si cambian colores, patrón o acabado, la clave cambia sola.
const sigs = new Map();
function sigOf(skin) {
  let s = sigs.get(skin.id);
  if (s) return s;
  const str = JSON.stringify([skin.pattern, skin.shader, skin.base, skin.accent, skin.palette, skin.finish]);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  s = (h >>> 0).toString(36);
  sigs.set(skin.id, s);
  return s;
}
const keyOf = (skin, inst, hi) => `${PREFIX}${skin.id}.${sigOf(skin)}|s${inst?.seed ?? 0}|${thumbQuality()}|${hi ? HI_SIZE : SIZE}`;

// ---------------------------------------------------------------- caché persistente (IndexedDB)
let dbP = null;
function openDb() {
  if (dbP) return dbP;
  dbP = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbP;
}

let warmP = null;
/** Lee las miniaturas guardadas (y borra las de versiones antiguas). Se llama al arrancar. */
export function warmThumbs() {
  if (warmP) return warmP;
  warmP = openDb().then((db) => new Promise((resolve) => {
    if (!db) return resolve();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        const k = String(c.key);
        if (!k.startsWith(PREFIX)) c.delete();
        else if (!mem.has(k) && c.value instanceof Blob) mem.set(k, URL.createObjectURL(c.value));
        c.continue();
      };
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  })).catch(() => { });
  return warmP;
}

function persist(key, blob) {
  openDb().then((db) => {
    if (!db) return;
    try {
      db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, key);
    } catch { }
  });
}

// ---------------------------------------------------------------- cola de render (de una en una)
const yieldFrame = () => new Promise((r) => setTimeout(r, 16));

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      let url = null;
      if (!failed) {
        try {
          renderMod ??= await import('./skinThumbRender.js');
          const blob = await renderMod.renderThumb(job.skin, { seed: job.seed, quality: job.quality, px: job.px });
          if (blob) {
            url = URL.createObjectURL(blob);
            mem.set(job.key, url);
            persist(job.key, blob);
          }
        } catch (err) {
          // sin WebGL (o contexto perdido): nos quedamos con el marcador 2D
          if (!renderMod || /webgl|context/i.test(String(err?.message))) failed = true;
        }
      }
      job.resolve(url);
      await yieldFrame();
    }
  } finally {
    renderMod?.releaseThumbRenderer();
    pumping = false;
  }
  if (queue.length) pump();
}

function enqueue(skin, inst, { priority = false, hi = false } = {}) {
  const key = keyOf(skin, inst, hi);
  if (mem.has(key)) return Promise.resolve(mem.get(key));
  if (inflight.has(key)) {
    if (priority) {
      const i = queue.findIndex((j) => j.key === key);
      if (i > 0) queue.unshift(...queue.splice(i, 1));
    }
    return inflight.get(key);
  }
  const p = warmThumbs()
    .then(() => mem.get(key) ?? (failed ? null : new Promise((resolve) => {
      const job = { key, skin, seed: inst?.seed ?? 0, quality: thumbQuality(), px: hi ? HI_SIZE : SIZE, resolve };
      if (priority) queue.unshift(job);
      else queue.push(job);
      pump();
    })))
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export const thumbUrl = (skin, instance, o) => enqueue(skin, instance, o);
/** Miniatura ya disponible (sin esperar) o null. */
export const thumbCached = (skin, instance, { hi = false } = {}) => mem.get(keyOf(skin, instance, hi)) ?? null;

/** Muestra `ballPreview` al instante y la cambia por la miniatura cuando está lista. `hi` pide HI_SIZE px. */
export function upgradeImg(img, skin, instance, { size = 76, priority = false, hi = false } = {}) {
  const hit = thumbCached(skin, instance, { hi });
  if (hit) {
    if (img.getAttribute('src') !== hit) img.src = hit;
    img.dataset.hd = '1';
    return Promise.resolve(true);
  }
  if (!img.getAttribute('src')) img.src = ballPreview(skin, size * 2);
  return enqueue(skin, instance, { priority, hi }).then((url) => {
    if (url) {
      img.src = url;
      img.dataset.hd = '1';
    }
    return !!url;
  });
}

/**
 * Mejora cualquier `<img data-skin-id>` que se añada bajo `root` (lobby, desafíos, resultados...).
 * Solo las skins con instancia (desbloqueadas): las bloqueadas se quedan con el marcador 2D.
 */
export function installThumbObserver(root, instOf = () => null) {
  const up = (img) => {
    if (img.dataset.hd || img.dataset.thumb) return;
    img.dataset.thumb = '1';
    const inst = instOf(img.dataset.skinId);
    if (!inst) return;
    upgradeImg(img, skinById(img.dataset.skinId), inst, { size: Number(img.width) || 76 });
  };
  const scan = (node) => {
    if (node.nodeType !== 1) return;
    if (node.matches?.('img[data-skin-id]')) up(node);
    node.querySelectorAll?.('img[data-skin-id]').forEach(up);
  };
  const mo = new MutationObserver((list) => {
    for (const m of list) m.addedNodes.forEach(scan);
  });
  mo.observe(root, { childList: true, subtree: true });
  scan(root);
  return () => mo.disconnect();
}
