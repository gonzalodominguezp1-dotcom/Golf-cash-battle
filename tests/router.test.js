import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRouter, parseHash, formatHash, parseTestHash } from '../src/screens/router.js'

const routes = [
  { id: 'lobby', hash: '#/', restorable: true, load: async () => ({}) },
  { id: 'tables', hash: '#/mesas', parent: 'lobby', restorable: true, load: async () => ({}) },
  { id: 'ranking', hash: '#/ranking', parent: 'lobby', restorable: true, load: async () => ({}) },
  { id: 'skins', hash: '#/skins', parent: 'lobby', restorable: true, load: async () => ({}) },
  { id: 'skin', hash: '#/skins/:id', parent: 'skins', restorable: true, load: async () => ({}) },
  { id: 'account', hash: '#/cuenta/:tab?', parent: 'lobby', restorable: true, load: async () => ({}) },
  { id: 'play', hash: '#/jugar', parent: 'lobby', restorable: false, load: async () => ({}) },
]

// Ventana falsa: historial lineal con popstate síncrono.
function fakeWin(hash = '', { async = false } = {}) {
  const listeners = []
  const entries = [{ state: null, hash }]
  let idx = 0
  const win = {
    location: { get hash() { return entries[idx].hash } },
    history: {
      get state() { return entries[idx].state },
      pushState(state, _t, url) { entries.splice(idx + 1); entries.push({ state, hash: url ?? entries[idx].hash }); idx++ },
      replaceState(state, _t, url) { entries[idx] = { state, hash: url ?? entries[idx].hash } },
      go(n) {
        const t = Math.max(0, Math.min(entries.length - 1, idx + n))
        if (t === idx) return
        idx = t
        const fire = () => { for (const l of [...listeners]) l({ state: entries[idx].state }) }
        if (async) queueMicrotask(fire); else fire()
      },
      back() { this.go(-1) },
    },
    addEventListener(type, fn) { if (type === 'popstate') listeners.push(fn) },
    removeEventListener(type, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1) },
    _listeners: listeners,
    _entries: entries,
    _idx: () => idx,
  }
  return win
}

const mk = (hash = '', extra = {}, winOpts = {}) => {
  const win = fakeWin(hash, winOpts)
  const router = createRouter({ routes, root: 'lobby', win, ...extra })
  return { win, router }
}
const ids = (r) => r.stack.map((s) => s.id)

test('parseHash / formatHash son inversos y no lanzan', () => {
  assert.deepEqual(parseHash('#/', routes), { id: 'lobby', params: {} })
  assert.deepEqual(parseHash('#/skins/oro', routes), { id: 'skin', params: { id: 'oro' } })
  assert.deepEqual(parseHash('#/cuenta', routes), { id: 'account', params: {} })
  assert.deepEqual(parseHash('#/cuenta/monedero', routes), { id: 'account', params: { tab: 'monedero' } })
  assert.equal(parseHash('#/nada', routes), null)
  assert.equal(parseHash(undefined, routes), null)
  assert.equal(formatHash('skin', { id: 'oro' }, routes), '#/skins/oro')
  assert.equal(formatHash('account', {}, routes), '#/cuenta')
  assert.equal(formatHash('account', { tab: 'perfil' }, routes), '#/cuenta/perfil')
  assert.equal(formatHash('zzz', {}, routes), '#/')
})

test("parseTestHash('#hoyo3-empate')", () => {
  assert.deepEqual(parseTestHash('#hoyo3-empate'), { hole: 3, tie: true })
  assert.deepEqual(parseTestHash('#hoyo3'), { hole: 3, tie: false })
  assert.equal(parseTestHash('#/mesas'), null)
  assert.equal(parseTestHash(''), null)
  assert.equal(parseTestHash(undefined), null)
})

test('start en raíz: stack [lobby], testHole null', () => {
  const { router } = mk('')
  const r = router.start()
  assert.deepEqual(ids(router), ['lobby'])
  assert.equal(r.top.id, 'lobby')
  assert.equal(r.testHole, null)
})

test('push / pop / replace / reset', () => {
  const { win, router } = mk('')
  router.start()
  assert.equal(router.push('tables'), true)
  assert.equal(win.location.hash, '#/mesas')
  assert.equal(router.push('skins'), true)
  assert.equal(router.push('skin', { id: 'oro' }), true)
  assert.equal(win.location.hash, '#/skins/oro')
  assert.deepEqual(ids(router), ['lobby', 'tables', 'skins', 'skin'])
  assert.equal(router.back(), 'popped')
  assert.deepEqual(ids(router), ['lobby', 'tables', 'skins'])
  assert.equal(win.location.hash, '#/skins')
  router.replace('ranking')
  assert.deepEqual(ids(router), ['lobby', 'tables', 'ranking'])
  assert.equal(win.location.hash, '#/ranking')
  router.reset()
  assert.deepEqual(ids(router), ['lobby'])
  assert.equal(win.location.hash, '#/')
  assert.equal(win._entries[win._idx()].state.gcb, 0)
})

test('subscribe recibe acciones y se puede cancelar', () => {
  const { router } = mk('')
  const seen = []
  const un = router.subscribe((e) => seen.push([e.action, e.top.id, e.prev && e.prev.id]))
  router.start()
  router.push('tables')
  router.back()
  router.replace('ranking')
  router.reset()
  assert.deepEqual(seen.map((s) => s[0]), ['start', 'push', 'pop', 'replace', 'reset'])
  assert.deepEqual(seen[1], ['push', 'tables', 'lobby'])
  un()
  router.push('tables')
  assert.equal(seen.length, 5)
})

test('entrada directa construye la pila con padres y atrás lleva a la raíz', () => {
  const { win, router } = mk('#/skins/oro')
  router.start()
  assert.deepEqual(ids(router), ['lobby', 'skins', 'skin'])
  assert.deepEqual(router.top, { id: 'skin', params: { id: 'oro' } })
  assert.equal(router.back(), 'popped')
  assert.deepEqual(ids(router), ['lobby', 'skins'])
  assert.equal(win.location.hash, '#/skins')
  assert.equal(router.back(), 'popped')
  assert.deepEqual(ids(router), ['lobby'])
  assert.equal(win.location.hash, '#/')
})

test('ruta no restorable o desconocida cae en la raíz', () => {
  for (const h of ['#/jugar', '#/inventada']) {
    const { router } = mk(h)
    router.start()
    assert.deepEqual(ids(router), ['lobby'])
  }
  const { router } = mk('#/skins/')
  router.start()
  assert.deepEqual(ids(router), ['lobby', 'skins'])
})

test('centinela en la raíz: atrás del sistema no cambia de pantalla y se re-arma', () => {
  const { win, router } = mk('')
  router.start()
  win.history.back() // atrás del sistema en la raíz
  assert.deepEqual(ids(router), ['lobby'])
  assert.equal(win._entries[win._idx()].state.gcb, 0)
  // sigue pudiendo recibir otro atrás sin salir
  win.history.back()
  assert.deepEqual(ids(router), ['lobby'])
  assert.equal(win._entries.length, 2) // sentinel + raíz, sin crecer
  assert.equal(router.back(), 'root')
})

test('atrás del sistema con pila > 1 hace pop', () => {
  const { win, router } = mk('')
  router.start()
  router.push('tables')
  win.history.back()
  assert.deepEqual(ids(router), ['lobby'])
})

test('back guard consume el atrás (botón y sistema) y re-arma el historial', () => {
  const { win, router } = mk('')
  router.start()
  router.push('tables')
  let calls = 0
  router.setBackGuard(() => { calls++; return true })
  assert.equal(router.back(), 'guarded')
  assert.equal(calls, 1)
  assert.deepEqual(ids(router), ['lobby', 'tables'])
  win.history.back() // sistema
  assert.equal(calls, 2)
  assert.deepEqual(ids(router), ['lobby', 'tables'])
  assert.equal(win._entries[win._idx()].state.gcb, 1)
  assert.equal(win.location.hash, '#/mesas')
  router.setBackGuard(null)
  assert.equal(router.back(), 'popped')
  assert.deepEqual(ids(router), ['lobby'])
})

test('guard que devuelve false deja pasar el atrás una sola vez consultado', () => {
  const { router } = mk('')
  router.start()
  router.push('tables')
  let calls = 0
  router.setBackGuard(() => { calls++; return false })
  assert.equal(router.back(), 'popped')
  assert.equal(calls, 1)
})

test('doble push ignorado: misma cima o transición en curso', () => {
  let busy = false
  const { router } = mk('', { isBusy: () => busy })
  router.start()
  assert.equal(router.push('tables'), true)
  assert.equal(router.push('tables'), false)
  assert.equal(router.push('inexistente'), false)
  busy = true
  assert.equal(router.push('ranking'), false)
  busy = false
  assert.equal(router.push('skin', { id: 'a' }), true)
  assert.equal(router.push('skin', { id: 'a' }), false)
  assert.equal(router.push('skin', { id: 'b' }), true)
  assert.deepEqual(ids(router), ['lobby', 'tables', 'skin', 'skin'])
})

test('#hoyoN: testHole capturado y el hash no se reescribe hasta el primer push', () => {
  const { win, router } = mk('#hoyo3-empate')
  const r = router.start()
  assert.deepEqual(r.testHole, { hole: 3, tie: true })
  assert.deepEqual(ids(router), ['lobby'])
  assert.equal(win.location.hash, '#hoyo3-empate')
  router.push('tables')
  assert.equal(win.location.hash, '#/mesas')
})

test('dispose quita el popstate', () => {
  const { win, router } = mk('')
  router.start()
  assert.equal(win._listeners.length, 1)
  router.dispose()
  assert.equal(win._listeners.length, 0)
})

const settle = () => new Promise((r) => setImmediate(r))

test('Adelante tras back() resincroniza URL y pila', () => {
  const { win, router } = mk('')
  router.start()
  router.push('tables')
  router.back()
  assert.deepEqual(ids(router), ['lobby'])
  win.history.go(1) // botón Adelante
  assert.deepEqual(ids(router), ['lobby'])
  assert.equal(win.location.hash, '#/')
  assert.equal(win._entries[win._idx()].state.gcb, 0)
})

test('reset deja una sola entrada de historial y Adelante no la rompe (asíncrono)', async () => {
  const { win, router } = mk('', {}, { async: true })
  router.start()
  router.push('tables'); router.push('skins'); router.push('skin', { id: 'a' })
  router.reset()
  assert.deepEqual(ids(router), ['lobby'])
  await settle()
  assert.equal(win._entries.length, 2) // centinela + raíz
  assert.equal(win.location.hash, '#/')
  assert.equal(win._entries[win._idx()].state.gcb, 0)
  win.history.go(1)
  await settle()
  assert.deepEqual(ids(router), ['lobby'])
  assert.equal(win.location.hash, '#/')
})

test('back() asíncrono hace pop y el guard no se salta tras reset (expectBack)', async () => {
  const { win, router } = mk('', {}, { async: true })
  router.start()
  router.push('tables')
  router.push('skins')
  router.reset()
  await settle()
  router.push('tables')
  let calls = 0
  router.setBackGuard(() => { calls++; return true })
  win.history.back() // atrás del sistema justo después de reset
  await settle()
  assert.equal(calls, 1)
  assert.deepEqual(ids(router), ['lobby', 'tables'])
  assert.equal(win.location.hash, '#/mesas')
})

test('popstate con state nulo (hash editado) reconstruye la pila desde el hash', () => {
  const { win, router } = mk('')
  router.start()
  router.push('tables')
  router.push('skins')
  win._entries[win._idx()] = { state: null, hash: '#/skins/oro' }
  win.history.go(0)
  for (const l of win._listeners) l({ state: null })
  assert.deepEqual(ids(router), ['lobby', 'skins', 'skin'])
  assert.equal(router.back(), 'popped')
  assert.deepEqual(ids(router), ['lobby', 'skins'])
  assert.equal(router.back(), 'popped')
  assert.deepEqual(ids(router), ['lobby'])
  assert.equal(router.back(), 'root')
})

test('state nulo con hash desconocido cae en la raíz y queda armado', () => {
  const { win, router } = mk('')
  router.start()
  router.push('tables')
  win._entries[win._idx()] = { state: null, hash: '#/inventada' }
  for (const l of win._listeners) l({ state: null })
  assert.deepEqual(ids(router), ['lobby'])
  win.history.back() // centinela
  assert.deepEqual(ids(router), ['lobby'])
  assert.equal(win._entries[win._idx()].state.gcb, 0)
})

test('salto multi-paso al centinela re-arma (C12) y atrás sigue sin salir', () => {
  const { win, router } = mk('')
  router.start()
  router.push('tables'); router.push('skins')
  win.history.go(-3)
  assert.deepEqual(ids(router), ['lobby'])
  assert.equal(win._entries[win._idx()].state.gcb, 0)
  win.history.back()
  assert.deepEqual(ids(router), ['lobby'])
  assert.equal(win._entries[win._idx()].state.gcb, 0)
})

test('salto multi-paso con guard conserva los niveles intermedios', () => {
  const { win, router } = mk('')
  router.start()
  router.push('tables'); router.push('skins')
  router.setBackGuard(() => true)
  win.history.go(-3)
  assert.deepEqual(ids(router), ['lobby', 'tables', 'skins'])
  assert.equal(win._entries[win._idx()].state.gcb, 2)
  assert.equal(win.location.hash, '#/skins')
})

test('guard en la raíz: botón y sistema lo consultan igual', () => {
  const { win, router } = mk('')
  router.start()
  let calls = 0
  router.setBackGuard(() => { calls++; return true })
  assert.equal(router.back(), 'guarded')
  win.history.back()
  assert.equal(calls, 2)
  assert.equal(win._entries[win._idx()].state.gcb, 0)
})

test('start doble es idempotente', () => {
  const { win, router } = mk('#/skins/oro')
  const a = router.start()
  const n = win._entries.length
  const b = router.start()
  assert.equal(win._entries.length, n)
  assert.equal(win._listeners.length, 1)
  assert.deepEqual(ids(router), ['lobby', 'skins', 'skin'])
  assert.deepEqual(a.top, b.top)
})

test('params en otro orden de claves son la misma cima; faltar un obligatorio rechaza', () => {
  const rs = [...routes, { id: 'x', hash: '#/x/:a', parent: 'lobby', restorable: true, load: async () => ({}) }]
  const win = fakeWin('')
  const router = createRouter({ routes: rs, root: 'lobby', win })
  router.start()
  assert.equal(router.push('x', { a: '1', b: '2' }), true)
  assert.equal(router.push('x', { b: '2', a: '1' }), false)
  assert.equal(router.push('skin', {}), false)
  assert.equal(formatHash('skin', {}, routes), '#/')
  assert.deepEqual(ids(router), ['lobby', 'x'])
})
