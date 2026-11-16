import test from 'node:test';
import assert from 'node:assert/strict';
import { header, card, button, badge, listState, bindHeader } from '../src/screens/components.js';
import { createScope } from '../src/screens/lifecycle.js';

function fakeEl() {
  const btn = { listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, removeEventListener() {} };
  return {
    btn, dataset: {}, innerHTML: '',
    querySelector(sel) { return sel === '[data-retry]' && this.innerHTML.includes('data-retry') ? btn : null; },
  };
}

test('badge: punto + texto sr-only; vacío con 0', () => {
  const html = badge({ count: 3, label: '3 novedades' });
  assert.match(html, /class="[^"]*sr-only[^"]*"[^>]*>3 novedades</);
  assert.match(html, /scr-badge/);
  assert.equal(badge({ count: 0, label: '' }), '');
});

test('badge: sin label usa texto por defecto accesible', () => {
  assert.match(badge({ count: 2 }), /sr-only[^>]*>2 novedades</);
});

test('header: sin botón volver por defecto, h1 y saldo', () => {
  const html = header({ title: 'Mesas', balanceHtml: '<b>5</b>' });
  assert.doesNotMatch(html, /data-back|scr-back/); // por defecto no hay volver: lo hace el lobby flotante
  assert.match(html, /<h1[^>]*>Mesas<\/h1>/);
  assert.match(html, /<b>5<\/b>/);
  assert.match(header({ title: 'X', back: true }), /<button[^>]*data-back[^>]*aria-label="Volver"/);
  assert.doesNotMatch(header({ title: 'X', back: false }), /data-back/);
});

test('header escapa el título', () => {
  assert.match(header({ title: '<i>' }), /&#60;i&#62;/);
});

test('card y button', () => {
  assert.match(card({ cls: 'x', body: '<p>a</p>' }), /scr-card x[^>]*><p>a<\/p>/);
  const b = button({ label: 'Jugar', kind: 'primary', attrs: 'data-go' });
  assert.match(b, /scr-btn scr-btn-primary/);
  assert.match(b, /data-go/);
  assert.match(b, />Jugar</);
});

test('listState pinta los 4 estados y Reintentar llama a onRetry', () => {
  const scope = createScope({ win: {}, doc: {} });
  const el = fakeEl();
  listState(el, { state: 'loading', scope });
  assert.equal(el.dataset.state, 'loading');
  assert.match(el.innerHTML, /Cargando/);
  listState(el, { state: 'empty', emptyText: 'Sin amigos', scope });
  assert.match(el.innerHTML, /Sin amigos/);
  let n = 0;
  listState(el, { state: 'error', errorText: 'Fallo', onRetry: () => n++, scope });
  assert.match(el.innerHTML, /Fallo/);
  assert.match(el.innerHTML, /Reintentar/);
  el.btn.listeners.click();
  assert.equal(n, 1);
  el.innerHTML = '<ul>datos</ul>';
  listState(el, { state: 'ready', scope });
  assert.equal(el.dataset.state, 'ready');
  assert.equal(el.innerHTML, '<ul>datos</ul>');
  scope.dispose();
});

test('bindHeader conecta volver con ctx.router.back()', () => {
  const back = { listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, removeEventListener() {} };
  const root = { querySelector: (s) => (s === '[data-back]' ? back : null) };
  let n = 0;
  bindHeader(root, { router: { back: () => n++ } });
  back.listeners.click();
  assert.equal(n, 1);
});
