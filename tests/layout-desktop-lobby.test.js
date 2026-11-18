import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Devuelve el cuerpo del primer bloque @media cuyo encabezado contiene `head` (balanceo de llaves).
function mediaBody(css, head) {
  const start = css.indexOf(head);
  if (start < 0) return null;
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) return css.slice(open + 1, i); }
  }
  return null;
}

// Reglas { selectores, cuerpo } de nivel superior o dentro de @media (aplanadas, sin anidar).
function rules(css) {
  const out = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) out.push({ selectors: m[1].trim(), body: m[2] });
  return out;
}

const HUD_SCREENS = [
  'main.screen.tables', 'main.screen.skins', 'main.screen.settings-screen', 'main.screen.ach',
  'main.screen.friends', 'main.screen.ranking', 'main.screen.account', 'main.screen.wallet-screen',
  'main.screen.freeplay-select', 'main.screen.matchmaking',
];

test('(a) escritorio: las pantallas del HUD ocupan todo el ancho en min-width 900 px', () => {
  const css = stripComments(read('src/screens/screens.css'));
  const body = mediaBody(css, '@media (min-width: 900px)');
  assert.ok(body, 'falta un bloque @media (min-width: 900px) en screens.css');
  for (const sel of HUD_SCREENS) assert.ok(body.includes(sel), `falta ${sel} en la regla de ancho completo`);
  assert.match(body, /max-width:\s*none/);
  assert.match(body, /width:\s*100%/);
  assert.match(body, /padding:\s*24px\s+32px/);
  assert.ok(!/sk-inspect/.test(body), 'el visor de skins no debe entrar en la regla de ancho completo');
});

test('(a) el ancho completo no se aplica en móvil (fuera de un @media max-width)', () => {
  const css = stripComments(read('src/screens/screens.css'));
  const mobile = css.match(/@media \(max-width[^)]*\)[^{]*\{/g) || [];
  for (const head of mobile) {
    const body = mediaBody(css, head) || '';
    assert.ok(!body.includes('max-width: none'), `la regla de ancho no debe estar en ${head}`);
  }
});

test('(b) ninguna animación de entrada de .screen, sus hijos ni las transiciones usa fill-mode both', () => {
  const entrance = /^(\.screen(\.[\w-]+)*( > \*)?|\.scr-t-(slide|fade) > \*)$/;
  const files = ['src/style.css', 'src/screens/screens.css', 'src/ui/settingsPanel.css'];
  let checked = 0;
  for (const f of files) {
    for (const r of rules(stripComments(read(f)))) {
      const selectors = r.selectors.split(',').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
      if (!selectors.some((s) => entrance.test(s))) continue;
      const anim = r.body.match(/animation(?:-fill-mode)?\s*:[^;]*/g) || [];
      for (const a of anim) {
        checked++;
        assert.ok(!/\bboth\b/.test(a), `${f}: "${r.selectors}" usa fill-mode both: ${a.trim()}`);
      }
    }
  }
  assert.ok(checked >= 4, 'no se encontraron las animaciones de entrada que se quieren comprobar');
});

test('(b) el botón Lobby sigue fijo respecto a la ventana', () => {
  const css = stripComments(read('src/screens/screens.css'));
  const lobby = rules(css).find((r) => r.selectors === '.scr-lobby');
  assert.ok(lobby, 'falta la regla .scr-lobby');
  assert.match(lobby.body, /position:\s*fixed/);
});

test('(b) el aviso de emparejamiento es fijo arriba (safe-area) y la sala no usa el botón Lobby flotante', () => {
  const css = stripComments(read('src/style.css'));
  const banner = rules(css).find((r) => r.selectors === '.mmb');
  assert.ok(banner, 'falta la regla .mmb');
  assert.match(banner.body, /position:\s*fixed/);
  assert.match(banner.body, /top:\s*calc\(env\(safe-area-inset-top/);
  assert.doesNotMatch(banner.body, /backdrop-filter/);
  // la sala (.screen.mm) no deja transform/filter propio: su fondo y destello son position: fixed
  const room = rules(css).find((r) => r.selectors === '.screen.mm');
  assert.ok(room, 'falta la regla .screen.mm');
  assert.doesNotMatch(room.body, /(^|[\s;])(transform|filter)\s*:/);
  const screen = read('src/screens/matchmaking.js') + read('src/ui/matchmakingView.js');
  assert.doesNotMatch(screen, /lobbyButton\(|scr-lobby/);
});
