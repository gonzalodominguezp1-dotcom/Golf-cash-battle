import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRouter } from '../src/screens/router.js'
import { createHost } from '../src/screens/host.js'
import { createRoutes } from '../src/screens/routes.js'
import { createContext } from '../src/screens/context.js'
import { fakeEnv } from './helpers/fakeEnv.js'

function fakeWin(hash = '') {
  const listeners = []
  const entries = [{ state: null, hash }]
  let idx = 0
  return {
    location: { get hash() { return entries[idx].hash } },
    history: {
      get state() { return entries[idx].state },
      pushState(state, _t, url) { entries.splice(idx + 1); entries.push({ state, hash: url ?? entries[idx].hash }); idx++ },
      replaceState(state, _t, url) { entries[idx] = { state, hash: url ?? entries[idx].hash } },
      go(n) {
        const t = Math.max(0, Math.min(entries.length - 1, idx + n))
        if (t === idx) return
        idx = t
        for (const l of [...listeners]) l({ state: entries[idx].state })
      },
      back() { this.go(-1) },
    },
    addEventListener(type, fn) { if (type === 'popstate') listeners.push(fn) },
    removeEventListener(type, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1) },
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0))
// deja que acabe la carga y la transición
const calm = async (env) => { await settle(); env.timers.advance(300) }

function setup({ root = 'hub', modules = {}, legacy = {}, reduced = false, hash = '' } = {}) {
  const env = fakeEnv()
  const win = fakeWin(hash)
  const routes = createRoutes({ root, modules })
  const notices = []
  let host
  const router = createRouter({ routes, root, win, isBusy: () => host.isBusy() })
  const ctx = createContext({ router, legacy, reducedMotion: () => reduced })
  const el = env.el('main')
  host = createHost({ router, routes, root: el, ctx, notify: (n) => notices.push(n), win: env.win, doc: env.doc, timers: env.timers })
  host.attach()
  return { env, router, host, notices, el, ctx }
}

test('createRoutes declara todas las rutas y la raíz lleva #/', () => {
  const rs = createRoutes({ root: 'hub', modules: {} })
  for (const id of ['hub', 'tables', 'achievements', 'friends', 'ranking', 'skins', 'skin', 'account', 'settings', 'maps', 'matchmaking']) {
    assert.ok(rs.find((r) => r.id === id), id)
  }
  assert.equal(rs.find((r) => r.id === 'hub').hash, '#/')
  // lobby y play ya no son rutas: el lobby es el hub (raíz) y la partida no tiene pantalla propia
  assert.equal(rs.find((r) => r.id === 'lobby'), undefined)
  assert.equal(rs.find((r) => r.id === 'play'), undefined)
  assert.equal(rs.find((r) => r.id === 'matchmaking').restorable, false)
})

test('un load() que rechaza avisa y vuelve a la raíz', async () => {
  const modules = { './ranking.js': () => Promise.reject(new Error('chunk roto')) }
  const { router, host, notices, env } = setup({ modules, legacy: { hub: () => {} } })
  router.start(); await calm(env)
  assert.equal(router.push('ranking'), true)
  await calm(env)
  assert.equal(notices.length, 1)
  assert.equal(notices[0].kind, 'info')
  assert.equal(router.top.id, 'hub')
  assert.equal(router.stack.length, 1)
  assert.equal(host.isBusy(), false)
})

test('una ruta sin archivo cae al legado; sin legado, al marcador', async () => {
  const calls = []
  const { router, el, env } = setup({ legacy: { hub: () => calls.push('hub'), ranking: (p) => calls.push(['ranking', p]) } })
  router.start(); await calm(env)
  router.push('ranking'); await calm(env)
  assert.deepEqual(calls, ['hub', ['ranking', {}]])
  router.back(); await calm(env)
  assert.equal(calls.at(-1), 'hub')
  router.push('friends'); await calm(env)
  assert.match(el.innerHTML, /En construcción/)
})

test('la transición dura 200 ms y 80 ms con reduced-motion; el doble toque se ignora', async () => {
  for (const [reduced, ms] of [[false, 200], [true, 80]]) {
    const { router, host, env } = setup({ reduced, legacy: { hub: () => {}, ranking: () => {} } })
    router.start(); await calm(env)
    assert.equal(host.isBusy(), false)
    assert.equal(router.push('ranking'), true)
    assert.equal(router.push('skins'), false) // ocupado
    await settle()
    assert.equal(host.isBusy(), true)
    env.timers.advance(ms - 1)
    assert.equal(host.isBusy(), true)
    env.timers.advance(1)
    assert.equal(host.isBusy(), false)
  }
})

test('al cambiar de pantalla se llama a destroy y el scope queda a 0', async () => {
  let destroyed = 0
  const modules = {
    './ranking.js': async () => ({
      mount(_root, ctx) { ctx.scope.timeout(() => {}, 1000); ctx.scope.on(ctx.scope.win, 'resize', () => {}); return { destroy() { destroyed++ } } },
    }),
  }
  const { router, env } = setup({ modules, legacy: { hub: () => {} } })
  router.start(); await calm(env)
  for (let i = 0; i < 5; i++) {
    router.push('ranking'); await settle()
    assert.ok(env.liveListeners() + env.liveTimers() > 0)
    env.timers.advance(300)
    router.back(); await calm(env)
  }
  assert.equal(destroyed, 5)
  assert.equal(env.liveListeners() + env.liveTimers(), 0)
})

test('una carga lenta superada por otra navegación se destruye sin pintarse', async () => {
  let release
  let destroyed = 0
  const modules = { './ranking.js': () => new Promise((r) => { release = () => r({ mount() { return { destroy() { destroyed++ } } } }) }) }
  const { router, env } = setup({ modules, legacy: { hub: () => {} } })
  router.start(); await calm(env)
  router.push('ranking'); await settle()
  router.reset('hub'); await calm(env)
  release(); await calm(env)
  assert.equal(destroyed, 0) // el mount nunca llegó a ejecutarse: la carga caducó
  assert.equal(router.top.id, 'hub')
})

test('un montaje legado lento que caduca no pinta encima de la pantalla vigente', async () => {
  const paints = []
  let release
  const legacy = {
    hub: () => paints.push('hub'),
    ranking: () => new Promise((r) => { release = () => { paints.push('ranking'); r() } }),
    skins: () => paints.push('skins'),
  }
  const { router, env } = setup({ legacy })
  router.start(); await calm(env)
  router.push('ranking'); await settle()
  router.replace('skins'); await settle()
  assert.deepEqual(paints, ['hub']) // skins espera a que acabe ranking
  release(); await calm(env)
  assert.deepEqual(paints, ['hub', 'ranking', 'skins']) // lo último en pintar es la pantalla vigente
  assert.equal(router.top.id, 'skins')
})

test('un montaje caducado que aún no había empezado no pinta nada', async () => {
  const paints = []
  let release
  const legacy = {
    hub: () => paints.push('hub'),
    ranking: () => new Promise((r) => { release = () => { paints.push('ranking'); r() } }),
    skins: () => paints.push('skins'),
    maps: () => paints.push('maps'),
  }
  const { router, env } = setup({ legacy })
  router.start(); await calm(env)
  router.push('ranking'); await settle()
  router.replace('skins'); await settle()
  router.replace('maps'); await settle()
  release(); await calm(env)
  assert.deepEqual(paints, ['hub', 'ranking', 'maps'])
})

test('si falla la raíz queda un aviso con «Reintentar» y whenIdle avisa al acabar', async () => {
  const modules = { './hub.js': () => Promise.reject(new Error('roto')) }
  const { router, host, notices, el, env } = setup({ modules })
  let idle = 0
  router.start(); await settle()
  host.whenIdle(() => idle++)
  assert.equal(notices.length, 1)
  assert.match(el.innerHTML, /data-root-error/)
  assert.equal(host.isBusy(), false)
  assert.equal(idle, 1)
  env.timers.advance(300)
})

// ---- keepAlive (hub): no se destruye al taparse; onCover/onUncover; el DOM sobrevive a quien repinta la raíz ----
test('keepAlive: el hub no se remonta al navegar; onCover/onUncover con el origen y su DOM intacto', async () => {
  const log = []
  let mounts = 0
  const hubNodes = ['<hub>']
  const modules = {
    './hub.js': async () => ({
      mount(root) {
        mounts++
        root.append?.(...hubNodes)
        return { destroy() { log.push('destroy') }, onCover() { log.push('cover') }, onUncover(from) { log.push(`uncover:${from}`) } }
      },
    }),
    './ranking.js': async () => ({ mount(root) { root.innerHTML = ''; log.push('ranking'); return { destroy() { log.push('rk-destroy') } } } }),
  }
  const s = setup({ modules })
  // raíz con DOM mínimo: childNodes, replaceChildren y append
  const kids = []
  Object.defineProperty(s.el, 'childNodes', { get: () => kids })
  s.el.replaceChildren = () => { kids.length = 0 }
  s.el.append = (...n) => { kids.push(...n) }
  Object.defineProperty(s.el, 'innerHTML', { get: () => kids.join(''), set: () => { kids.length = 0 } })
  s.router.start(); await calm(s.env)
  assert.deepEqual(kids, hubNodes)
  s.router.push('ranking'); await calm(s.env)
  assert.deepEqual(log, ['cover', 'ranking'])
  assert.deepEqual(kids, []) // lo repintado por la pantalla de encima no pisa el hub
  s.router.back(); await calm(s.env)
  assert.deepEqual(log, ['cover', 'ranking', 'rk-destroy', 'uncover:ranking'])
  assert.equal(mounts, 1)
  assert.deepEqual(kids, hubNodes)
  s.host.dispose()
  assert.equal(log.at(-1), 'destroy')
})

test('keepAlive: si la pantalla de encima falla, el hub se destapa y se avisa', async () => {
  const log = []
  const modules = {
    './hub.js': async () => ({ mount() { return { destroy() { log.push('destroy') }, onCover() { log.push('cover') }, onUncover() { log.push('uncover') } } } }),
    './ranking.js': () => Promise.reject(new Error('roto')),
  }
  const { router, env, notices, host } = setup({ modules })
  router.start(); await calm(env)
  router.push('ranking'); await calm(env)
  assert.equal(notices.length, 1)
  assert.equal(router.top.id, 'hub')
  assert.ok(!log.includes('destroy'))
  host.dispose()
})

test('keepAlive: 20 ciclos taparse/destapar no remontan ni dejan fugas', async () => {
  let mounts = 0, destroyed = 0
  const modules = {
    './hub.js': async () => ({ mount(_r, ctx) { mounts++; ctx.scope.timeout(() => {}, 99999); return { destroy() { destroyed++ }, onCover() {}, onUncover() {} } } }),
    './ranking.js': async () => ({ mount(_r, ctx) { ctx.scope.on(ctx.scope.win, 'resize', () => {}); return { destroy() {} } } }),
  }
  const { router, env, host } = setup({ modules })
  router.start(); await calm(env)
  for (let i = 0; i < 20; i++) { router.push('ranking'); await calm(env); router.back(); await calm(env) }
  assert.equal(mounts, 1)
  assert.equal(destroyed, 0)
  host.dispose()
  assert.equal(destroyed, 1)
  assert.equal(env.liveListeners() + env.liveTimers(), 0)
})
