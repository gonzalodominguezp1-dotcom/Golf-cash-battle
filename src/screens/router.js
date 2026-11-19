// Router de pila puro: no toca el DOM. Recibe `win` (history, location, popstate).
// Historial = pila: entrada 0 es un centinela (state.gcb = -1), entrada k+1 es stack[k].

const segs = (hash) => String(hash ?? '').replace(/^#/, '').split('/').filter(Boolean)
const dec = (s) => { try { return decodeURIComponent(s) } catch { return s } }

export function parseHash(hash, routes) {
  if (typeof hash !== 'string') return null
  const parts = segs(hash)
  for (const r of routes || []) {
    const pat = segs(r.hash)
    const params = {}
    let ok = true
    for (let i = 0; i < pat.length && ok; i++) {
      const p = pat[i]
      if (p[0] === ':') {
        const optional = p.endsWith('?')
        const name = p.slice(1, optional ? -1 : undefined)
        if (parts[i] !== undefined) params[name] = dec(parts[i])
        else if (!optional) ok = false
      } else if (parts[i] !== p) ok = false
    }
    if (ok && parts.length <= pat.length) return { id: r.id, params }
  }
  return null
}

export function formatHash(id, params = {}, routes = []) {
  const r = routes.find((x) => x.id === id)
  if (!r) return '#/'
  const out = []
  for (const p of segs(r.hash)) {
    if (p[0] !== ':') { out.push(p); continue }
    const name = p.slice(1).replace(/\?$/, '')
    const v = params && params[name]
    if (v === undefined || v === null || v === '') {
      if (!p.endsWith('?')) return '#/' // falta un parámetro obligatorio: no inventa otra ruta
      break
    }
    out.push(encodeURIComponent(String(v)))
  }
  return '#/' + out.join('/')
}

export function parseTestHash(hash) {
  const m = /^#hoyo(\d+)(-empate)?$/.exec(String(hash ?? ''))
  if (!m) return null
  const hole = Number(m[1])
  return hole >= 1 ? { hole, tie: !!m[2] } : null
}

const sortKeys = (o) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, o[k]]))
const sameParams = (a, b) => sortKeys(a) === sortKeys(b)

export function createRouter({ routes = [], root = 'hub', win = window, isBusy = () => false } = {}) {
  const byId = new Map(routes.map((r) => [r.id, r]))
  const rootEntry = () => ({ id: root, params: {} })
  let stack = [rootEntry()]
  let guard = null
  let armed = false
  let expectBack = false
  let pendingReset = null
  let started = null
  const subs = new Set()
  let listening = false

  const hashOf = (e) => formatHash(e.id, e.params, routes)
  const topEntry = () => stack[stack.length - 1]
  const emit = (action, prev) => {
    const ev = { top: topEntry(), prev, action }
    for (const fn of [...subs]) fn(ev)
  }
  const setState = (kind, depth, hash) => win.history[kind]({ gcb: depth }, '', hash)
  const complete = (id, params) => {
    const r = byId.get(id)
    return !!r && formatHash(id, params, routes) !== '#/' || (!!r && segs(r.hash).length === 0)
  }

  // Pila a partir de un hash: entrada directa con padres; no restorable o desconocido -> raíz.
  function stackFromHash(hash) {
    let parsed = parseHash(hash, routes)
    const r = parsed && byId.get(parsed.id)
    if (!r || r.restorable === false || parsed.id === root) parsed = null
    const base = [rootEntry()]
    if (!parsed) return base
    const chain = [{ id: parsed.id, params: parsed.params }]
    let p = byId.get(parsed.id).parent
    const seen = new Set([parsed.id])
    while (p && p !== root && byId.has(p) && !seen.has(p)) {
      seen.add(p)
      chain.unshift({ id: p, params: {} })
      p = byId.get(p).parent
    }
    return [...base, ...chain]
  }

  // Escribe el historial desde la entrada actual: centinela + una entrada por nivel de la pila.
  function writeHistory() {
    win.history.replaceState({ gcb: -1, sentinel: true }, '', hashOf(stack[0]))
    stack.forEach((e, i) => setState('pushState', i, hashOf(e)))
  }
  function arm() {
    if (armed) return
    armed = true
    writeHistory()
  }
  const rearm = () => setState('pushState', 0, hashOf(stack[0]))

  function onPop(e) {
    const st = (e && e.state) || win.history.state
    const g = st && typeof st.gcb === 'number' ? st.gcb : null
    if (pendingReset) {
      const next = pendingReset
      pendingReset = null
      expectBack = false
      // Llegamos al centinela: pushState trunca el "adelante" y deja una sola entrada.
      win.history.replaceState({ gcb: -1, sentinel: true }, '', hashOf(next))
      setState('pushState', 0, hashOf(next))
      return
    }
    const viaButton = expectBack
    expectBack = false
    const prev = topEntry()
    const depth = stack.length - 1
    if (g === null) { // hash editado a mano o entrada ajena: reconstruye desde el hash
      stack = stackFromHash(win.location.hash)
      writeHistory()
      emit('reset', prev)
      return
    }
    if (g === depth) return // ya sincronizado (p. ej. tras corregir un Adelante)
    if (g > depth) { win.history.go(depth - g); return } // Adelante: vuelve a la entrada de la pila
    if (!viaButton && guard && guard()) { win.history.go(depth - g); return } // conserva los niveles
    const target = Math.max(g, 0)
    if (target < depth) {
      stack = stack.slice(0, target + 1)
      emit('pop', prev)
    }
    if (g < 0) rearm() // al llegar al centinela se re-arma siempre (C12)
  }

  const router = {
    start() {
      if (started) return { ...started, top: topEntry() }
      const hash = win.location.hash
      const testHole = parseTestHash(hash)
      stack = testHole ? [rootEntry()] : stackFromHash(hash)
      if (!listening) { win.addEventListener('popstate', onPop); listening = true }
      armed = false
      expectBack = false
      pendingReset = null
      if (!testHole) arm()
      started = { testHole }
      emit('start', null)
      return { top: topEntry(), testHole }
    },
    push(id, params = {}) {
      if (!byId.has(id) || !complete(id, params)) return false
      const t = topEntry()
      if (t.id === id && sameParams(t.params, params)) return false
      if (isBusy()) return false
      expectBack = false
      arm()
      stack = [...stack, { id, params }]
      setState('pushState', stack.length - 1, hashOf(topEntry()))
      emit('push', t)
      return true
    },
    replace(id, params = {}) {
      if (!byId.has(id) || !complete(id, params)) return
      expectBack = false
      arm()
      const prev = topEntry()
      stack = [...stack.slice(0, -1), { id, params }]
      setState('replaceState', stack.length - 1, hashOf(topEntry()))
      emit('replace', prev)
    },
    back() {
      if (guard && guard()) return 'guarded'
      if (stack.length <= 1) return 'root'
      expectBack = true
      win.history.back()
      return 'popped'
    },
    reset(id = root) {
      expectBack = false
      arm()
      const prev = topEntry()
      const depth = stack.length - 1
      const next = { id, params: {} }
      stack = [next]
      // Siempre vuelve al centinela: así se descartan también las entradas "adelante".
      pendingReset = next
      win.history.go(-(depth + 1))
      emit('reset', prev)
    },
    setBackGuard(fn) { guard = typeof fn === 'function' ? fn : null },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
    dispose() {
      if (listening) { win.removeEventListener('popstate', onPop); listening = false }
      subs.clear()
      started = null
    },
    get top() { return topEntry() },
    get stack() { return stack.slice() },
  }
  return router
}
