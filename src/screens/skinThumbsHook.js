// Miniaturas de skins aisladas de la pantalla: el canvas y el observador de visibilidad no se pueden probar en Node.
// main.js construye la implementación real (ctx.thumbs) con las funciones de ui/skinThumbs.js; los tests pasan una nula.
//   warm()                    -> Promise: caché persistente cargada
//   cached(skin, inst)        -> URL ya disponible o null
//   preview(skin, size)       -> marcador 2D inmediato
//   bind(items) -> { release } -> mejora cada imagen cuando se acerca a la pantalla; release() desconecta el observador
export function createThumbs({ upgrade, cached, preview, warm, observe = globalThis.IntersectionObserver }) {
  return {
    warm: () => Promise.resolve(warm()),
    cached,
    preview,
    bind(items) {
      let off = false;
      const go = (it) => { if (!off) upgrade(it.img, it.skin, it.inst, { size: 76, priority: !!it.priority }); };
      if (!observe) {
        items.forEach(go);
        return { release() { off = true; } };
      }
      const byImg = new Map(items.map((it) => [it.img, it]));
      const io = new observe((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          const it = byImg.get(e.target);
          if (it) go(it);
        }
      }, { rootMargin: '200px' });
      items.forEach((it) => io.observe(it.img));
      return { release() { off = true; io.disconnect(); byImg.clear(); } };
    },
  };
}
