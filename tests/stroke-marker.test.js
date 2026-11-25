import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { strokeWord, strokeTone, isNextStrokeLast, strokeMarkerState, STROKE_TONE } from '../src/game/strokeMarker.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');

test('singular y plural de «golpe»', () => {
  assert.equal(strokeWord(0), 'golpes');
  assert.equal(strokeWord(1), 'golpe');
  assert.equal(strokeWord(2), 'golpes');
  assert.equal(strokeWord(7), 'golpes');
});

test('tono según el par: igual o menos verde, +1 amarillo, +2 o más rojo', () => {
  assert.equal(strokeTone(0, 3), STROKE_TONE.GOOD);
  assert.equal(strokeTone(3, 3), STROKE_TONE.GOOD);
  assert.equal(strokeTone(2, 3), STROKE_TONE.GOOD);
  assert.equal(strokeTone(4, 3), STROKE_TONE.WARN);
  assert.equal(strokeTone(5, 3), STROKE_TONE.BAD);
  assert.equal(strokeTone(9, 3), STROKE_TONE.BAD);
});

test('sin par conocido el tono es neutro', () => {
  assert.equal(strokeTone(2, undefined), STROKE_TONE.NEUTRAL);
});

test('«último golpe»: el siguiente golpe es el último permitido', () => {
  assert.equal(isNextStrokeLast(7, 8), true);
  assert.equal(isNextStrokeLast(6, 8), false);
  assert.equal(isNextStrokeLast(8, 8), false);
  assert.equal(isNextStrokeLast(0, undefined), false);
});

test('estado del marcador: número, palabra, Par N y aviso', () => {
  const s = strokeMarkerState({ strokes: 1, par: 4, max: 8 });
  assert.equal(s.hidden, false);
  assert.equal(s.number, 1);
  assert.equal(s.word, 'golpe');
  assert.equal(s.parLine, 'Par 4');
  assert.equal(s.tone, 'good');
  assert.equal(s.last, false);
  assert.equal(s.text, 'Golpes: 1. Par 4');
});

test('estado del marcador: aviso de último golpe junto al par', () => {
  const s = strokeMarkerState({ strokes: 7, par: 4, max: 8 });
  assert.equal(s.last, true);
  assert.equal(s.parLine, 'Par 4 · último golpe');
  assert.equal(s.tone, 'bad');
  assert.match(s.text, /Último golpe/);
});

test('en desempate el marcador se oculta', () => {
  assert.equal(strokeMarkerState({ strokes: 2, par: 3, max: 8, tiebreak: true }).hidden, true);
});

test('entradas raras no rompen el texto', () => {
  assert.equal(strokeMarkerState({ strokes: undefined, par: 3 }).number, 0);
  assert.equal(strokeMarkerState({ strokes: -2, par: 3 }).number, 0);
  assert.equal(strokeMarkerState({ strokes: 2.7, par: 3 }).number, 2);
});

test('el HUD de partida monta el marcador de golpes abajo a la derecha, sin toques', () => {
  const main = read('src/main.js');
  assert.match(main, /data-stroke-marker/, 'falta el marcador en el HUD de partida');
  assert.match(main, /aria-live="polite"/);
  const css = read('src/style.css');
  const block = css.slice(css.indexOf('.stroke-marker {'));
  const body = block.slice(0, block.indexOf('}'));
  assert.match(body, /pointer-events:\s*none/);
  assert.match(body, /right:\s*calc\(env\(safe-area-inset-right\)/);
  assert.match(body, /bottom:\s*calc\(env\(safe-area-inset-bottom\)/);
});

test('el marcador solo se actualiza con el golpe local y se pone a 0 al empezar hoyo', () => {
  const main = read('src/main.js');
  const onStroke = main.slice(main.indexOf('onStroke: (n) =>'), main.indexOf('onCup:'));
  assert.match(onStroke, /paintStrokes\(n\)/);
  assert.match(main, /game\.load\(course, \{[^]*?\}\);\s*\n\s*paintStrokes\(0\)/);
});
