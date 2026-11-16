// Navegación de las secciones heredadas: traduce los destinos de main.js (`data-go`, atajos 1-6) a rutas.
// Si el host está ocupado (carga + transición), recuerda solo el último destino y lo aplica al quedar libre.
export const GO_ROUTES = {
  wallet: ['account', { tab: 'monedero' }], skins: ['skins'], account: ['account'],
  tables: ['tables'], ranking: ['ranking'], freeplay: ['maps'], settings: ['settings'],
};
// pestañas de la ruta de cuenta -> nombres que usaba la Cuenta heredada (solo lo usa su test; T039 lo limpia)
export const ACCOUNT_TABS = { perfil: 'profile', progreso: 'profile', monedero: 'wallet' };

const same = (a, b) => a.id === b.id && JSON.stringify(a.params) === JSON.stringify(b.params);

export function createNavigator({ router, host, rootId }) {
  let pending = null;

  const resolve = (to) => {
    const [id, params = {}] = GO_ROUTES[to] ?? [rootId];
    return { id, params };
  };

  function apply({ id, params }) {
    if (same(router.top, { id, params })) return host.refresh(); // mismo sitio: repinta, como hoy
    if (id === rootId) return router.reset(rootId);
    if (router.top.id === rootId) return router.push(id, params);
    return router.replace(id, params); // entre secciones no se apila: atrás vuelve a la raíz
  }

  return function go(to) {
    const dest = resolve(to);
    if (!host.isBusy()) return apply(dest);
    // ocupado: el doble toque a la misma pantalla se ignora; otro destino sustituye al pendiente
    if (pending ? same(pending, dest) : same(router.top, dest)) return;
    const first = !pending;
    pending = dest;
    if (first) {
      host.whenIdle(() => {
        const d = pending;
        pending = null;
        if (d && !same(router.top, d)) apply(d);
      });
    }
  };
}
