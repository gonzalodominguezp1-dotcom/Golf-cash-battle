import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACCOUNT_TABS, GO_ROUTES, createNavigator } from '../src/screens/navigate.js'

function fake(rootId = 'lobby') {
  const log = []
  let busy = false
  let idle = []
  const router = {
    top: { id: rootId, params: {} },
    push(id, params = {}) { log.push(['push', id, params]); router.top = { id, params }; return true },
    replace(id, params = {}) { log.push(['replace', id, params]); router.top = { id, params } },
    reset(id) { log.push(['reset', id]); router.top = { id, params: {} } },
  }
  const host = {
    isBusy: () => busy,
    refresh() { log.push(['refresh']) },
    whenIdle(fn) { idle.push(fn) },
  }
  const go = createNavigator({ router, host, rootId })
  return { go, log, router, setBusy: (b) => { busy = b }, flush: () => { busy = false; const c = idle; idle = []; c.forEach((f) => f()) } }
}

test('wallet -> pantalla propia #/monedero (ya no es pestaña de cuenta)', () => {
  assert.deepEqual(GO_ROUTES.wallet, ['wallet'])
  assert.equal(ACCOUNT_TABS.monedero, undefined)
  assert.equal(ACCOUNT_TABS.perfil, 'profile')
  const { go, log } = fake()
  go('wallet')
  assert.deepEqual(log, [['push', 'wallet', {}]])
})

test('desde la raíz apila; entre secciones reemplaza; a la raíz hace reset; mismo sitio repinta', () => {
  const { go, log } = fake()
  go('ranking'); go('skins'); go('freeplay'); go('lobby'); go('lobby')
  assert.deepEqual(log.map((l) => l.slice(0, 2)), [['push', 'ranking'], ['replace', 'skins'], ['replace', 'maps'], ['reset', 'lobby'], ['refresh']])
})

test('ocupado: solo se aplica el último destino al quedar libre; el doble toque se ignora', () => {
  const { go, log, setBusy, flush } = fake()
  setBusy(true)
  go('ranking'); go('ranking'); go('skins'); go('settings')
  assert.deepEqual(log, [])
  flush()
  assert.deepEqual(log, [['push', 'settings', {}]])
})

test('ocupado: tocar la pantalla en la que ya estás no hace nada', () => {
  const { go, log, setBusy, flush } = fake()
  setBusy(true)
  go('lobby')
  flush()
  assert.deepEqual(log, [])
})
