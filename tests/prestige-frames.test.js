// Los 18 marcos ilustrados: catálogo, assets generados, desbloqueo por nivel y por reto, equipamiento, HTML, CSS y migración.
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { Progress, xpToReach } from '../src/progress/Progress.js';
import { FRAMES, LEVEL_FRAMES, frameArtSrc, frameById, frameFor, frameStyle, framesUnlocked } from '../src/progress/prestige.js';
import { CHALLENGES } from '../src/progress/skins.js';
import { avatarHtml } from '../src/screens/shared.js';

const IDS = ['f_rustic', 'f_scifi', 'f_emperor', 'f_arcane', 'f_void', 'f_phoenix', 'f_thunder', 'f_vortex', 'f_astral', 'f_cyber', 'f_magma', 'f_sakura', 'f_frost', 'f_toxic', 'f_oni', 'f_roulette', 'f_pharaoh', 'f_kraken'];
const CHALLENGE_FRAMES = FRAMES.filter((f) => f.challenge);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pub = (src) => fileURLToPath(new URL(`../public${src}`, import.meta.url));

test('catálogo: los 18 ids estables, nombres en español, por nivel (ascendente, sin repetir) y por reto', () => {
  assert.deepEqual(FRAMES.map((f) => f.id).sort(), [...IDS].sort());
  assert.equal(LEVEL_FRAMES.length + CHALLENGE_FRAMES.length, 18);
  assert.ok(LEVEL_FRAMES.length >= 5 && CHALLENGE_FRAMES.length >= 5, 'hay de los dos tipos');
  const levels = LEVEL_FRAMES.map((f) => f.level);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
  assert.equal(new Set(levels).size, levels.length);
  assert.deepEqual(FRAMES.slice(0, LEVEL_FRAMES.length), LEVEL_FRAMES, 'primero los de nivel');
  for (const f of FRAMES) {
    assert.ok(f.name.length > 2, f.id);
    assert.match(f.color, /^#[0-9a-f]{6}$/i);
    assert.match(f.glow, /^#[0-9a-f]{6}$/i);
    assert.equal(frameById(f.id), f);
    assert.ok((f.level != null) !== Boolean(f.challenge), `${f.id}: o nivel o reto`);
  }
  for (const f of CHALLENGE_FRAMES) assert.ok(CHALLENGES.some((c) => c.id === f.challenge), `${f.id}: reto inexistente`);
  assert.equal(new Set(CHALLENGE_FRAMES.map((f) => f.challenge)).size, CHALLENGE_FRAMES.length, 'un reto por marco');
});

test('ya no existen los marcos antiguos de CSS', () => {
  for (const id of ['p25', 'p50', 'p75', 'p100', 'p125', 'p150']) assert.equal(frameById(id), null);
  assert.doesNotMatch(read('src/style.css'), /pf-halo|pf-wing|pf-gem|pf-ring|\.pf-p\d/);
});

test('assets: HD 512 y Thumb 128 existen, pesan menos de 40 KB y el manifest coincide con el catálogo', async () => {
  const sharp = (await import('sharp')).default;
  const manifest = JSON.parse(read('public/assets/frames/manifest.json'));
  assert.deepEqual(Object.keys(manifest).sort(), [...IDS].sort());
  for (const f of FRAMES) {
    for (const [src, side] of [[f.art.hd, 512], [f.art.thumb, 128]]) {
      assert.ok(existsSync(pub(src)), src);
      assert.ok(statSync(pub(src)).size < 40 * 1024, `${src} pesa ${statSync(pub(src)).size}`);
      const meta = await sharp(pub(src)).metadata();
      assert.deepEqual([meta.width, meta.height, meta.format, meta.hasAlpha], [side, side, 'webp', true], src);
    }
    assert.equal(f.art.hole, manifest[f.id].hole, `${f.id}: hueco distinto al del manifest (¿regenerar assets?)`);
  }
});

test('assets: el hueco central y el exterior son transparentes y el aro es opaco', async () => {
  const sharp = (await import('sharp')).default;
  for (const f of FRAMES) {
    const { data, info } = await sharp(pub(f.art.hd)).raw().toBuffer({ resolveWithObject: true });
    const alpha = (x, y) => data[(y * info.width + x) * info.channels + 3];
    assert.equal(alpha(256, 256), 0, `${f.id}: centro opaco`);
    assert.equal(alpha(0, 0), 0, `${f.id}: esquina opaca`);
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 200) opaque++;
    assert.ok(opaque > 512 * 512 * 0.05, `${f.id}: sin aro`);
  }
});

test('desbloqueo por nivel: cada marco se abre exactamente en su nivel', () => {
  for (const f of LEVEL_FRAMES) {
    assert.equal(framesUnlocked(f.level - 1).some((x) => x.id === f.id), false, f.id);
    assert.equal(framesUnlocked(f.level).some((x) => x.id === f.id), true, f.id);
  }
  assert.equal(framesUnlocked(1000).length, LEVEL_FRAMES.length, 'el nivel solo no abre los de reto');
  assert.equal(frameFor(1000).id, 'f_emperor');
});

test('desbloqueo por reto: cada marco se abre al completar su reto y no antes', () => {
  const stats = { bigwin: { bigWins: 1 }, matches50: { matches: 50 }, wins50: { wins: 50 }, streak5: { bestStreak: 5 }, birdies50: { birdies: 50 }, aces3: { aces: 3 } };
  for (const f of CHALLENGE_FRAMES) {
    const p = new Progress(null);
    assert.equal(p.prestige.unlocked.some((x) => x.id === f.id), false, `${f.id} abierto de entrada`);
    assert.equal(p.equipFrame(f.id), false);
    if (stats[f.challenge]) Object.assign(p.state, stats[f.challenge]);
    else p.setServerStats({ [CHALLENGES.find((c) => c.id === f.challenge).stat]: 1 });
    assert.equal(p.challenge(f.challenge).done, true, f.challenge);
    assert.equal(p.prestige.unlocked.some((x) => x.id === f.id), true, `${f.id} sigue cerrado`);
    assert.equal(p.equipFrame(f.id), true);
    assert.equal(p.prestige.frame.id, f.id);
  }
});

test('equipar: un marco conseguido se elige y se guarda; uno sin conseguir, no', () => {
  const p = new Progress(null);
  p.state.xp = xpToReach(100);
  const saved = [];
  p.frameSaver = (id) => (saved.push(id), Promise.resolve());
  assert.equal(p.equipFrame('f_magma'), true);
  assert.equal(p.prestige.frame.id, 'f_magma');
  assert.equal(p.equipFrame('f_vortex'), false, 'nivel 110 > 100');
  assert.equal(p.equipFrame('f_oni'), false, 'reto sin hacer');
  assert.equal(p.equipFrame('p75'), false, 'marco antiguo');
  assert.deepEqual(saved, ['f_magma']);
  p.state.xp = xpToReach(150);
  assert.equal(p.equipFrame('f_emperor'), true);
  assert.equal(p.prestige.frame.id, 'f_emperor');
});

test('frameStyle y frameArtSrc: variables CSS con --hole; HD o Thumb', () => {
  const f = frameById('f_kraken');
  assert.match(frameStyle(f), /--frame:#[0-9a-f]{6};--frame-glow:#[0-9a-f]{6};--hole:0\.\d+/i);
  assert.equal(frameStyle(null), '');
  assert.equal(frameArtSrc(f), '/assets/frames/f_kraken.thumb.webp');
  assert.equal(frameArtSrc(f, true), '/assets/frames/f_kraken.webp');
  assert.equal(frameArtSrc(null), null);
});

test('avatarHtml: marco = capa <img class="pf-art"> sobre la cara, sin capas CSS antiguas', () => {
  const h = avatarHtml({ size: 'sm', frame: frameById('f_sakura'), initial: 'Ana' });
  assert.match(h, /class="pf pf-sm pf-framed pf-f_sakura pf-illustrated"/);
  assert.match(h, /<img class="pf-art" src="\/assets\/frames\/f_sakura\.thumb\.webp" alt="" pointer-events="none"/);
  assert.ok(h.indexOf('class="pf-face"') < h.indexOf('class="pf-art"'), 'la capa va sobre la cara');
  assert.doesNotMatch(h, /pf-halo|pf-wing|pf-ring|pf-gem/);
  assert.match(h, /--hole:/);
  assert.match(avatarHtml({ size: 'lg', frame: frameById('f_sakura') }), /f_sakura\.webp"/, 'lg usa HD');
  assert.match(avatarHtml({ size: 'xs', frame: frameById('f_sakura'), hd: true }), /f_sakura\.webp"/);
});

test('avatarHtml: sin marco solo hay cara', () => {
  const none = avatarHtml({ size: 'xs', initial: 'Ana' });
  assert.doesNotMatch(none, /pf-art|pf-framed|pf-illustrated/);
  assert.match(none, /pf-initial">A</);
});

test('CSS: el marco cabe en su caja (ocupa su sitio, sin sobresalir) y la cara se ajusta al hueco', () => {
  const css = read('src/style.css');
  const box = css.match(/\.pf-illustrated \{[^}]*\}/)?.[0] ?? '';
  assert.match(box, /--k: min\(calc\(0\.97 \/ var\(--hole/, 'proporción imagen/hueco con tope');
  assert.match(box, /width: var\(--box\); height: var\(--box\)/);
  assert.match(css.match(/\.pf-art \{[^}]*\}/)?.[0] ?? '', /inset: 0; width: 100%; height: 100%;[^}]*pointer-events: none/);
  assert.match(css.match(/\.pf-illustrated \.pf-face \{[^}]*\}/)?.[0] ?? '', /width: var\(--face\)/);
  assert.match(box, /--face: calc\(var\(--box\) \* var\(--hole/);
});

test('migración: el servidor valida los mismos marcos, niveles y retos que el cliente', () => {
  const sql = read('supabase/migrations/20261118130000_frames_catalog.sql');
  const rows = [...sql.matchAll(/\('(f_[a-z]+)', '(level|stat|award)', (null|'[A-Za-z_0-9]+'), (\d+)\)/g)]
    .map((m) => ({ id: m[1], kind: m[2], key: m[3] === 'null' ? null : m[3].slice(1, -1), goal: Number(m[4]) }));
  assert.deepEqual(rows.map((r) => r.id).sort(), [...IDS].sort());
  const awards = { rankWeekTop10: 'weekly_top10', rankHistTop100: 'hist_top100' };
  for (const f of FRAMES) {
    const r = rows.find((x) => x.id === f.id);
    if (f.level != null) assert.deepEqual([r.kind, r.key, r.goal], ['level', null, f.level], f.id);
    else {
      const c = CHALLENGES.find((x) => x.id === f.challenge);
      const expected = awards[c.id] ? ['award', awards[c.id], c.goal] : ['stat', c.stat, c.goal];
      assert.deepEqual([r.kind, r.key, r.goal], expected, f.id);
    }
  }
  assert.match(sql, /create or replace function public\._frame_for/);
  assert.match(sql, /create or replace function public\.set_frame/);
  assert.match(sql, /frame ~ '\^p\[0-9\]\+\$'/, 'limpia los marcos antiguos');
});

test('ningún marco deja la cara por debajo del 40 % de su imagen y no queda CSS de los marcos antiguos', () => {
  for (const f of FRAMES) assert.ok(f.art.hole >= 0.399, `${f.id}: hueco ${f.art.hole}`);
  const css = read('src/style.css');
  assert.doesNotMatch(css, /frame-ring|rank-avatar|avatar-wrap\.framed/);
});
