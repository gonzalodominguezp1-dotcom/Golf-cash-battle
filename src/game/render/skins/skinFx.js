import * as THREE from 'three';
import { BALL_R } from '../../physics.js';
import { AdditiveParticles, GroundDecals, RibbonTrail, Shockwaves, Trail } from '../effects.js';
import { SKIN_SPRITES, releaseSkinSpriteAtlas, skinSpriteAtlas, softDotTexture } from '../textures.js';
import { REDUCED_SPEED, STILL_TIME, calmList, continuousOpen, echoRing, hitList, particleLimit, reducedCount, reducedMotion, ribbonNoise, ribbonWave, sinkBurstAllowed, sinkDecalAllowed, trailRate } from './fxRules.js';

// Runtime de efectos de skin (docs/skins-premium-plan.md, (d) y (f)).
// Solo dibuja: nunca toca la física y usa su propio RNG de render.
// `update` no asigna: todo son typed arrays y objetos reutilizados.

const TAU = Math.PI * 2;

/** Presupuesto por calidad (sección f). */
const LEVELS = [
  { name: 'low', particles: 40, segments: 0, aura: false, shell: false, decals: 0, light: false },
  { name: 'medium', particles: 120, segments: 32, aura: true, shell: false, decals: 6, light: false },
  { name: 'high', particles: 300, segments: 48, aura: true, shell: true, decals: 12, light: true },
];
const LEVEL_IDS = { low: 0, medium: 1, high: 2 };

// ---------------------------------------------------------------- emisores
// Un emisor declarativo es un objeto plano:
// cell (sprite), n, speed, spread (0 = recto, 1 = esfera), size, life (s), col,
// y opcionales: grav, drag, grow, spin, up, dir ('fwd'|'back'|'normal'|'up'|'in'), att.
const P = (cell, n, speed, spread, size, life, col, extra) => ({ cell, n, speed, spread, size, life, col, grav: 0, drag: 1.5, grow: 0, spin: 0, up: 0, dir: 'back', att: 0, ...extra });

function cellFor(skin) {
  if (skin.pattern === 'gem') return 'shard';
  if (skin.pattern === 'flame') return 'ember';
  return 'spark';
}

const HIT = {
  puff: () => [P('soft', 4, 1.2, 1, 0.3, 0.5, 'accent', { drag: 3, grow: 1.5, up: 0.6 })],
  tinted: (c) => [P(c, 6, 3.5, 0.6, 0.1, 0.4, 'accent', { grav: 5 })],
  burst: (c) => [P(c, 12, 4, 0.7, 0.11, 0.6, 'accent', { grav: 6 }), P('soft', 3, 1, 1, 0.35, 0.35, 'glow', { drag: 3, grow: 1.5 })],
};
const WALL = {
  tinted: (c) => [P(c, 5, 3, 0.5, 0.09, 0.35, 'accent', { dir: 'normal', grav: 4 })],
  burst: (c) => [P(c, 10, 3.5, 0.6, 0.1, 0.45, 'accent', { dir: 'normal', grav: 5 }), P('soft', 2, 0.8, 1, 0.3, 0.3, 'glow', { dir: 'normal', drag: 3, grow: 1.5 })],
};

/** Firmas por skin (conceptos estrella). Solo lo que se aparta del tier. */
const SIG = {
  kintsugi_neon: {
    hit: [P('shard', 9, 4, 0.6, 0.1, 0.7, '#E8B64A', { grav: 6 }), P('spark', 4, 2, 1, 0.14, 0.2, '#FFE6FF')],
    wall: [P('spark', 8, 3, 0.5, 0.1, 0.4, '#E205FF', { dir: 'normal', grav: 4 })],
    trail: P('ember', 1, 0.3, 1, 0.07, 0.8, '#E8B64A', { grav: 2.5 }),
    roll: P('spark', 1, 1.5, 1, 0.08, 0.3, '#E205FF', { up: 1.5, grav: 6 }),
    ring: 0xe205ff, c2: '#FFE6FF',
  },
  damascus_imperial: {
    hit: [P('spark', 16, 5, 0.6, 0.09, 0.8, '#FFB347', { grav: 8 })],
    wall: [P('spark', 10, 4, 0.35, 0.09, 0.5, '#FFB347', { dir: 'normal', grav: 8 })],
    trail: P('spark', 1, 0.5, 1, 0.06, 0.6, '#FF9A3C', { grav: 5 }),
    sinkDecal: { r: 0.55, col: '#FF6A1A', life: 1.2, add: true, op: 0.85 },
    c2: '#FF9A3C',
  },
  supernova_solar: {
    hit: [P('ember', 14, 4.5, 0.25, 0.14, 0.7, '#FFB703', { grav: 1, up: 1.5 }), P('soft', 3, 1, 1, 0.45, 0.4, '#ED450C', { drag: 3, grow: 1.5 })],
    wall: [P('soft', 5, 1.5, 0.8, 0.4, 0.5, '#ED450C', { dir: 'normal', drag: 2.5, grow: 1.4 })],
    trail: P('ember', 1, 0.6, 1, 0.1, 0.8, '#ED450C', { grav: -0.5 }),
    rollDecal: { r: 0.3, col: '#1a0500', life: 2, add: false, op: 0.55, every: 0.2 },
    sinkDecal: { r: 0.9, col: '#ED450C', life: 1.2, add: true, op: 0.8 },
    c2: '#ED450C',
  },
  crimson_dragon: {
    hit: [P('ember', 10, 4, 0.2, 0.16, 0.5, '#FF7A1A', { dir: 'fwd', grav: -0.5, drag: 2.5 }), P('soft', 3, 3, 0.3, 0.4, 0.4, '#E11D48', { dir: 'fwd', grow: 1.5, drag: 3 })],
    wall: [P('spark', 8, 3, 0.5, 0.09, 0.4, '#E11D48', { dir: 'normal', grav: 5 })],
    trail: P('ember', 1, 0.4, 1, 0.08, 0.9, '#FF7A1A', { grav: -0.6 }),
    sinkDecal: { r: 0.7, col: '#FF7A1A', life: 1.6, add: true, op: 0.8 },
    c2: '#FF7A1A', ring: 0xff7a1a,
  },
  ice: {
    hit: [P('shard', 10, 4, 0.7, 0.1, 0.6, '#7FD6FF', { grav: 6 })],
    trail: P('flake', 1, 0.3, 1, 0.09, 0.9, '#E8FBFF', { grav: 0.8, spin: 3 }),
    rollDecal: { r: 0.22, col: '#CFF3FF', life: 1.6, add: true, op: 0.45, every: 0.16 },
    sinkDecal: { r: 0.7, col: '#CFF3FF', life: 2, add: true, op: 0.7 },
    c2: '#7FD6FF',
  },
  holo: {
    hit: [P('streak', 6, 4, 0.9, 0.3, 0.35, 'rainbow', { dir: 'fwd', drag: 3, spin: 0 })],
    trail: P('spark', 1, 0.3, 1, 0.07, 0.6, 'rainbow', { grav: 0.5 }),
    c2: 'rainbow',
  },
  event_horizon: {
    hit: [P('soft', 14, 3, 0, 0.14, 0.45, 'secondary', { dir: 'in', att: 0 })],
    wall: [P('soft', 5, 1.5, 0.8, 0.3, 0.4, 'accent', { dir: 'normal', drag: 2.5 })],
    trail: P('streak', 1, 0.9, 0.4, 0.2, 0.7, '#FFFFFF', { dir: 'in', att: 6 }),
    roll: P('spark', 1, 1.2, 1, 0.07, 0.5, '#FFB25C', { att: 8 }),
    attractRoll: true, attractSink: true, c2: '#FF4D8D', ring: 0x7a5cff,
    sinkDecal: { r: 0.5, col: '#000000', life: 2, add: false, op: 0.9 },
  },
  midas_touch: {
    hit: [P('coin', 10, 4, 0.7, 0.13, 0.9, '#FFCF4A', { grav: 8, spin: 8 })],
    wall: [P('coin', 4, 3, 0.5, 0.1, 0.6, '#FFCF4A', { dir: 'normal', grav: 7, spin: 8 })],
    trail: P('spark', 1, 0.4, 1, 0.07, 0.8, '#FFCF4A', { grav: 2 }),
    rollDecal: { r: 0.18, col: '#FFCF4A', life: 2.5, add: false, op: 0.5, every: 0.18, grows: true },
    sinkDecal: { r: 1.5, col: '#FFCF4A', life: 6, add: false, op: 0.75 },
    sinkFountain: P('coin', 30, 3, 0.3, 0.12, 1.1, '#FFCF4A', { dir: 'up', up: 4, grav: 8, spin: 8 }),
    c2: '#B8860B',
  },
  // Skins de la colección nueva (docs: ideas_skins/_plan/spec-skins.md). Sprites del atlas actual (sin E4).
  // Campos extra (solo estas skins): `rot` del sprite ('fan' estrella, 'rand', 'vert' rayo vertical),
  // `flat` (ráfaga en el plano del suelo), `lift` (sube el punto de emisión), `flash` (se quita con la bandera), `drop` (altura de la
  // estela, en radios bajo el centro), `wave` (onda lateral de la cinta), `hitEcho`/`sinkEcho`
  // (segundo anillo retrasado) y `rmDropSink`. sinkFountain admite una lista de emisores.
  antimatter_void: {
    // implosión violeta con chispas cian que caen al centro (la «singularidad»)
    hit: [P('soft', 6, 2.5, 0, 0.13, 0.45, 'accent', { dir: 'in' }), P('spark', 5, 3, 0, 0.08, 0.4, 'secondary', { dir: 'in', spin: 4 })],
    wall: [P('shard', 5, 2.5, 0.5, 0.08, 0.4, 'accent', { dir: 'normal', grav: 4, rot: 'rand' }), P('spark', 3, 1.5, 0, 0.07, 0.35, 'secondary', { dir: 'in' })],
    // «particle decay trail»: motas que se quedan atrás, atraídas hacia la bola, y se apagan despacio
    trail: P('spark', 1, 0.6, 0.6, 0.09, 0.9, 'glow', { dir: 'in', att: 5 }),
    sinkFountain: P('soft', 10, 2, 0, 0.1, 0.6, 'accent', { dir: 'in', att: 6 }),
    sinkBurst: P('spark', 6, 2.5, 0.6, 0.08, 0.5, 'glow', { dir: 'up', up: 2, grav: 5 }),
    sinkDecal: { r: 0.5, col: '#000000', life: 2, add: false, op: 0.9 },
    wave: { amp: 0.09, freq: 1.5, speed: 0.8 }, // «lensing warp trail» trenzada
    attractRoll: true, attractSink: true, c2: '#38BDF8',
  },
  tormenta_voltaica: {
    // estrella blanca de rayos + chispas cian (golpe de la hoja)
    hit: [P('streak', 4, 0, 0, 1, 0.18, 'secondary', { rot: 'fan', grow: 0.5, flash: true }), P('spark', 8, 5, 0.9, 0.09, 0.3, 'glow'), P('soft', 1, 0, 0, 0.9, 0.15, 'secondary')],
    // arcos quebrados en el punto de choque
    wall: [P('streak', 3, 0.6, 1, 0.75, 0.18, 'secondary', { dir: 'normal', rot: 'rand', drag: 4 }), P('spark', 6, 3.5, 0.6, 0.08, 0.3, 'secondary', { dir: 'normal', grav: 3 })],
    trail: P('spark', 1, 1.4, 1, 0.07, 0.25, 'glow', { drag: 5 }), // chispas que «crepitan»
    // rayo vertical: trazos verticales que suben rápido + chispas cian
    sinkFountain: [P('streak', 5, 7, 0.03, 0.55, 0.35, 'secondary', { dir: 'up', rot: 'vert', drag: 0.5 }), P('spark', 6, 4, 0.12, 0.09, 0.5, 'glow', { dir: 'up', up: 3, grav: 3 })],
    sinkEcho: { at: 0.22, size: 1.5, speed: 2 }, // segundo anillo cian
    wallRing: { size: 0.6, speed: 3.5 },
    wave: { amp: 0.1, freq: 4, speed: 2, zig: true }, // zigzag eléctrico (2 Hz de forma, sin parpadeo)
    rmDropHit: ['soft'],
    c2: '#38BDF8', ring: 0x38bdf8,
  },
  anima_errante: {
    // anillo de niebla violeta a ras de suelo con alguna mota
    hit: [P('soft', 5, 2.2, 1, 0.32, 0.7, 'accent', { flat: true, drag: 3.5, grow: 1.4, up: 0.15 }), P('spark', 2, 1.5, 1, 0.06, 0.6, 'glow', { flat: true, up: 0.5 })],
    // estallido cian en estrella contra la pared
    wall: [P('streak', 4, 0, 0, 0.8, 0.2, 'secondary', { rot: 'fan', grow: 0.4, flash: true }), P('spark', 6, 3.5, 0.6, 0.09, 0.35, 'secondary', { dir: 'normal' }), P('soft', 1, 0, 0, 0.6, 0.2, 'secondary')],
    // «copias fantasma»: halos del tamaño de la bola que se quedan atrás y se apagan
    trail: P('soft', 1, 0.05, 1, 0.34, 0.5, '#A99CFF', { drag: 4, grow: 0.25, drop: 0 }),
    // almas que suben: 3 grandes cian pálido + 3 volutas lavanda
    sinkFountain: [P('soft', 3, 1.1, 0.25, 0.45, 1.6, '#9FF3FF', { dir: 'up', up: 1.2, grav: -0.5, drag: 1, spin: 2 }), P('soft', 3, 0.9, 0.5, 0.18, 1.3, 'glow', { dir: 'up', up: 1.6, grav: -0.6, drag: 1 })],
    sinkBurst: P('spark', 6, 2, 0.6, 0.07, 0.6, 'secondary', { dir: 'up', up: 2, grav: 2 }),
    wave: { amp: 0.07, freq: 1, speed: 0.5 }, // voluta ondulante
    rmNoSinkBurst: true,
    c2: '#0DE0F8',
  },
  cronometro_laton: {
    // esfera de reloj que crece y gira + engranajes + chispas crema
    hit: [P('glyph', 1, 0, 0, 0.8, 0.4, 'glow', { grow: 0.5, spin: 3, lift: 0.3 }), P('coin', 6, 3.5, 0.7, 0.09, 0.7, 'base', { grav: 7, spin: 7 }), P('spark', 4, 3, 0.9, 0.08, 0.35, 'glow', { grav: 4 })],
    // estallido dorado en estrella + chispas
    wall: [P('streak', 3, 0, 0, 0.7, 0.18, 'base', { rot: 'fan', grow: 0.4, flash: true }), P('spark', 8, 4, 0.5, 0.09, 0.35, 'glow', { dir: 'normal', grav: 6 })],
    trail: P('coin', 1, 0.7, 1, 0.08, 0.7, 'base', { grav: 3, spin: 6 }), // engranajes que saltan
    // el reloj de bolsillo que sale del hoyo + engranajes + chispas
    sinkFountain: [P('glyph', 1, 1.2, 0, 0.6, 1, 'glow', { dir: 'up', up: 1, grav: 1, spin: 2 }), P('coin', 9, 3.5, 0.4, 0.1, 0.9, 'base', { dir: 'up', up: 4, grav: 7, spin: 8 }), P('spark', 2, 3, 0.5, 0.07, 0.5, 'glow', { dir: 'up', up: 2, grav: 4 })],
    sinkEcho: { at: 0.25, size: 1.4, speed: 2 },
    wallRing: { size: 0.55, speed: 3.5 },
    rmDropHit: ['glyph'],
    rmDropSink: ['glyph'],
    c2: '#C46A2B', ring: 0xd4af37,
  },
  abyssal_tide: {
    hit: [P('soft', 6, 1.8, 0.9, 0.1, 0.8, 'glow', { up: 1.2, drag: 2, grav: -0.4 })],
    hitEcho: { at: 0.15, size: 1, speed: 2.4 }, // ondas concéntricas
    // salpicadura de gotas + estrella cian
    wall: [P('ember', 7, 4, 0.7, 0.07, 0.45, 'accent', { dir: 'normal', grav: 7 }), P('streak', 3, 0, 0, 0.6, 0.16, 'glow', { rot: 'fan', grow: 0.4, flash: true })],
    trail: P('soft', 1, 0.4, 1, 0.1, 0.9, 'glow', { grav: -0.7, drag: 2 }), // burbujas más grandes
    // géiser: columna de agua + trazos verticales
    sinkFountain: [P('soft', 8, 5, 0.12, 0.16, 0.9, 'accent', { dir: 'up', up: 4, grav: 6, grow: 0.5 }), P('streak', 4, 6, 0.04, 0.5, 0.4, 'glow', { dir: 'up', rot: 'vert', drag: 1 })],
    sinkBurst: P('spark', 5, 2.5, 0.7, 0.07, 0.5, 'glow', { dir: 'up', up: 2, grav: 5 }),
    sinkDecal: { r: 0.7, col: '#19E3D0', life: 1.6, add: true, op: 0.7 },
    wallRing: { size: 0.7, speed: 3 },
    rollRing: { every: 0.4, size: 0.5, speed: 2.5 },
    wave: { amp: 0.06, freq: 1.2, speed: 0.5 },
    rmNoSinkDecal: true,
    c2: '#4B6BFF',
  },
};

/** Solo lectura, para tests de presupuesto. */
export const SKIN_SIG = SIG;

// ---------------------------------------------------------------- clase
export class SkinFX {
  /**
   * @param {THREE.Scene} scene
   * @param {object} skin  entrada de SKINS (con `fx`, `palette`)
   * @param {{quality?: 'low'|'medium'|'high'|number}} opts
   */
  constructor(scene, skin, { quality = 'medium' } = {}) {
    this.scene = scene;
    this.skin = skin;
    this.fx = skin.fx ?? {};
    this.sig = SIG[skin.id] ?? {};
    this.level = -1;
    this.t = 0;
    this.impact = 0; // 0..1, decae en 0.3 s (para uImpact del shader)
    this.speedN = 0; // 0..1 (para uSpeed)
    this.state = 0; // estado de skins míticas (racha 0..5, oros...)
    this.seed = 0x9e3779b9 ^ (skin.id.length * 2654435761);
    this.disposed = false;

    this.atlas = skinSpriteAtlas();
    this.particles = new AdditiveParticles(scene, this.atlas, LEVELS[2].particles);
    this.decals = new GroundDecals(scene, LEVELS[2].decals);
    this.shock = new Shockwaves(scene, 4);

    this.tmpC = new THREE.Color();
    this.cols = new Map();
    this.hexOf = new Map();
    this.accTrail = this.accRoll = this.accDecal = this.accRing = 0;
    this.sinkT = -1;
    this.sinkFlags = 0;
    this.sinkPos = new THREE.Vector3();
    this.echoT = 0; // anillo de eco pendiente (hitEcho/sinkEcho)
    this.echo = null;
    this.echoX = this.echoZ = 0;
    this.lastPos = new THREE.Vector3();

    this.ribbon = null;
    this.ribbonSegments = 0;
    this.pointTrail = null;
    this.aura = null;
    this.shell = null;
    this.disc = null;
    this.light = null;

    this.#buildSpecs();
    if (skin.id === 'event_horizon') this.#buildDisc();
    this.setLevel(quality);
  }

  // ------------------------------------------------------------ specs
  #buildSpecs() {
    const fx = this.fx, sig = this.sig, c = cellFor(this.skin);
    const pick = (table, kind) => (kind && table[kind] ? table[kind](c) : []);
    const sigOr = (key, kindSpecs) => sig[key] ?? kindSpecs;
    this.hitSpecs = sigOr('hit', pick(HIT, fx.hit === 'signature' ? 'burst' : fx.hit));
    this.hitSpecsCalm = calmList(this.hitSpecs, sig.rmDropHit);
    this.wallSpecs = sigOr('wall', pick(WALL, fx.wall === 'signature' ? 'burst' : fx.wall));
    this.wallSpecsCalm = calmList(this.wallSpecs, null);
    this.bumperSpecs = this.wallSpecs;
    this.lipSpecs = fx.lip ? [P('soft', 1, 0, 0, 0.8, 0.25, 'glow'), P('spark', 6, 2.5, 0.8, 0.09, 0.3, 'white', { grav: 3 })] : [];
    const style = fx.trail?.style ?? 'default';
    this.trailSpec = style === 'ribbon_particles' || style === 'shaped' ? (sig.trail ?? P(c, 1, 0.4, 1, 0.07, 0.7, 'accent', { grav: 0.8, drag: 1.2 })) : null;
    this.rollSpec = null;
    if (fx.roll === 'glints') this.rollSpec = P('spark', 1, 0.1, 1, 0.09, 0.3, 'white', { dir: 'up' });
    else if (fx.roll === 'sparks' || fx.roll === 'signature') this.rollSpec = sig.roll ?? P(c, 1, 1.5, 0.9, 0.07, 0.35, 'accent', { up: 1.5, grav: 6 });
    this.rollRate = fx.roll === 'glints' ? 5 : 14;
    this.sinkKind = fx.sink ?? 'generic';
    const sf = this.sinkKind === 'generic' || this.sinkKind === 'tinted' ? null : (sig.sinkFountain ?? P(c, this.sinkKind === 'burst' ? 22 : 40, 3, 0.35, 0.1, 0.9, 'accent', { dir: 'up', up: 4, grav: 7 }));
    this.sinkFountain = sf ? (Array.isArray(sf) ? sf : [sf]) : null;
    this.sinkFountainCalm = sf ? calmList(this.sinkFountain, sig.rmDropSink) : null;
    this.flashSpec = P('soft', 1, 0, 0, 1.6, 0.35, 'white');
    this.flashBigSpec = P('soft', 1, 0, 0, 2.6, 0.3, 'white');
    this.sinkBurst2 = sig.sinkBurst ?? P(c, 12, 3, 0.6, 0.1, 0.7, 'accent', { dir: 'up', up: 3, grav: 6 });
    // resolver colores de antemano: `update` no debe crear Color ni arrays
    const all = [this.flashSpec, this.flashBigSpec, this.sinkBurst2, ...this.hitSpecs, ...this.wallSpecs, ...this.lipSpecs, this.trailSpec, this.rollSpec, ...(this.sinkFountain ?? [])];
    for (const s of all) if (s) this.#color(s.col);
    for (const k of ['rollDecal', 'sinkDecal']) if (sig[k]) this.#color(sig[k].col);
    this.#color('accent');
    this.#color('glow');
    this.ringHex = sig.ring ?? new THREE.Color(this.skin.palette.accent).getHex();
  }

  /** Color lineal [r,g,b] de la paleta, de un '#hex' o 'white'; memoizado. */
  #color(name) {
    let c = this.cols.get(name);
    if (c) return c;
    const p = this.skin.palette;
    const src = name === 'white' ? '#ffffff' : p[name] ?? (name === 'rainbow' ? '#ffffff' : name);
    this.tmpC.set(src);
    c = [this.tmpC.r, this.tmpC.g, this.tmpC.b];
    this.cols.set(name, c);
    return c;
  }

  // ------------------------------------------------------------ objetos por nivel
  setLevel(level) {
    const lv = typeof level === 'string' ? LEVEL_IDS[level] ?? 1 : Math.max(0, Math.min(2, level | 0));
    if (lv === this.level) return;
    this.level = lv;
    const L = (this.L = LEVELS[lv]);
    this.particles.setLimit(particleLimit(L.particles, L.name, this.fx.maxParticles));
    this.decals.setLimit(L.decals);

    // estela: puntos en Baja y para la estela por defecto; cinta en Media/Alta
    const style = this.fx.trail?.style ?? 'default';
    const wantRibbon = L.segments > 0 && style !== 'default';
    if (wantRibbon && this.ribbonSegments !== L.segments) {
      this.ribbon?.dispose();
      const tr = this.fx.trail;
      this.ribbon = new RibbonTrail(this.scene, {
        segments: L.segments,
        color: tr.color ?? '#ffffff',
        color2: this.sig.c2 === 'rainbow' ? null : this.sig.c2 ?? null,
        width: tr.width ?? 0.7,
        taper: tr.taper ?? 0.5,
        noise: ribbonNoise(style, reducedMotion()),
        wave: this.sig.wave ?? null,
      });
      this.ribbon.waveAmp = ribbonWave(this.sig.wave, reducedMotion());
      this.ribbonSegments = L.segments;
      this.ribbonStyle = style;
    } else if (!wantRibbon && this.ribbon) {
      this.ribbon.dispose();
      this.ribbon = null;
      this.ribbonSegments = 0;
    }
    if (!wantRibbon && !this.pointTrail) this.pointTrail = new Trail(this.scene, 28, this.fx.trail?.color ?? '#ffffff');
    else if (wantRibbon && this.pointTrail) {
      this.pointTrail.dispose();
      this.pointTrail = null;
    }

    // aura (Legendaria+)
    const wantAura = L.aura && !!this.fx.aura;
    if (wantAura && !this.aura) {
      const tex = softDotTexture();
      this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: this.skin.palette.glow === '#000000' ? this.skin.palette.accent : this.skin.palette.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.35 }));
      this.aura.renderOrder = 2;
      this.scene.add(this.aura);
    } else if (!wantAura && this.aura) this.#disposeAura();
    const wantShell = wantAura && L.shell;
    if (wantShell && !this.shell) {
      const col = this.#color('accent');
      this.shell = new THREE.Mesh(
        new THREE.SphereGeometry(BALL_R * 1.3, 20, 14),
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(col[0], col[1], col[2]) }, uK: { value: 0.5 } },
          vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: 'uniform vec3 uColor; uniform float uK; varying vec3 vN; void main(){ float f = pow(1.0 - abs(vN.z), 3.0); gl_FragColor = vec4(uColor * f * uK * 2.0, f * uK); }',
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        }),
      );
      this.shell.frustumCulled = false;
      this.scene.add(this.shell);
    } else if (!wantShell && this.shell) this.#disposeShell();

    // luz puntual de embocada: solo Alta
    if (L.light && !this.light) {
      const col = this.#color('accent');
      this.light = new THREE.PointLight(new THREE.Color(col[0], col[1], col[2]), 0, 5, 2);
      this.scene.add(this.light);
    } else if (!L.light && this.light) {
      this.light.removeFromParent();
      this.light.dispose?.();
      this.light = null;
    }
    if (this.disc) this.disc.visible = lv >= 1;
  }

  #disposeAura() {
    this.aura.removeFromParent();
    this.aura.material.map?.dispose();
    this.aura.material.dispose();
    this.aura = null;
  }

  #disposeShell() {
    this.shell.removeFromParent();
    this.shell.geometry.dispose();
    this.shell.material.dispose();
    this.shell = null;
  }

  #buildDisc() {
    const p = this.skin.palette;
    const c = (h) => new THREE.Color(h);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uGrow: { value: 0 }, c0: { value: c(p.glow) }, c1: { value: c(p.accent) }, c2: { value: c(p.secondary) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime, uGrow; uniform vec3 c0, c1, c2; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 q = vUv - 0.5; float r = length(q) * 2.0; float a = atan(q.y, q.x);
          float n = vn(vec2(a * 3.0 + uTime * 2.5, r * 9.0 - uTime));
          float band = smoothstep(0.3, 0.45, r) * (1.0 - smoothstep(0.75, 1.0, r));
          vec3 col = mix(c0, c1, smoothstep(0.35, 0.6, r)); col = mix(col, c2, smoothstep(0.6, 1.0, r));
          float k = band * (0.45 + 0.8 * n);
          gl_FragColor = vec4(col * k * 2.0, k * (0.5 + 0.5 * uGrow));
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.disc = new THREE.Mesh(new THREE.RingGeometry(BALL_R * 1.2, BALL_R * 3.4, 48, 1), mat);
    this.disc.rotation.x = -Math.PI / 2 + 0.26; // inclinado 15°
    this.disc.frustumCulled = false;
    this.scene.add(this.disc);
  }

  // ------------------------------------------------------------ RNG de render
  #rnd() {
    let s = this.seed;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this.seed = s;
    return (s >>> 0) / 4294967296;
  }

  // ------------------------------------------------------------ emisión
  /** Emite un emisor declarativo en (x,y,z) con dirección unitaria (dx,dy,dz). */
  #emit(spec, x, y, z, dx, dy, dz, power = 1) {
    const rm = reducedMotion();
    let n = Math.max(1, Math.round(spec.n * (0.5 + 0.5 * power)));
    if (rm) n = reducedCount(n);
    const speedK = rm ? REDUCED_SPEED : 1;
    const rainbow = spec.col === 'rainbow';
    const col = rainbow ? null : this.#color(spec.col);
    const cell = SKIN_SPRITES[spec.cell] ?? 0;
    const dir = spec.dir;
    const sx = dir === 'back' ? -dx : dir === 'up' ? 0 : dx;
    const sy = dir === 'back' ? -dy : dir === 'up' ? 1 : dy;
    const sz = dir === 'back' ? -dz : dir === 'up' ? 0 : dz;
    const spread = spec.spread;
    if (spec.lift) y += spec.lift; // sprites grandes: que no se corten con el suelo
    const flatK = spec.flat ? 0.15 : 1; // ráfaga casi horizontal (anillo de niebla)
    const rotMode = spec.rot;
    for (let i = 0; i < n; i++) {
      const u = this.#rnd() * 2 - 1, a = this.#rnd() * TAU, s = Math.sqrt(1 - u * u);
      const rx = s * Math.cos(a), ry = u * flatK, rz = s * Math.sin(a);
      // giro inicial del sprite en pantalla: estrella repartida, al azar o vertical (rayo/chorro)
      const rot0 = rotMode === 'fan' ? (i / n) * Math.PI + (this.#rnd() - 0.5) * 0.3
        : rotMode === 'rand' ? this.#rnd() * TAU
          : rotMode === 'vert' ? Math.PI / 2 + (this.#rnd() - 0.5) * 0.5 : 0;
      const sp = spec.speed * speedK * (0.6 + 0.4 * this.#rnd());
      let r, g, b;
      if (rainbow) {
        this.tmpC.setHSL(i / n, 1, 0.6);
        r = this.tmpC.r; g = this.tmpC.g; b = this.tmpC.b;
      } else {
        r = col[0]; g = col[1]; b = col[2];
      }
      const size = spec.size * (0.7 + 0.6 * this.#rnd());
      const life = spec.life * (0.7 + 0.6 * this.#rnd());
      const spin = spec.spin * (this.#rnd() * 2 - 1);
      if (dir === 'in') {
        // nace en un anillo alrededor del punto y cae hacia él
        const rad = 0.5 + 0.5 * this.#rnd();
        this.particles.emit(cell, x + rx * rad, y + ry * rad * 0.6, z + rz * rad, -rx * sp, -ry * sp * 0.6, -rz * sp, size, life, r, g, b, spec.grav, spec.drag, spec.grow, spin, spec.att, rot0);
      } else {
        const vx = (sx * (1 - spread) + rx * spread) * sp;
        const vy = (sy * (1 - spread) + ry * spread) * sp + spec.up;
        const vz = (sz * (1 - spread) + rz * spread) * sp;
        this.particles.emit(cell, x, y, z, vx, vy, vz, size, life, r, g, b, spec.grav, spec.drag, spec.grow, spin, spec.att, rot0);
      }
    }
  }

  #emitAll(list, x, y, z, dx, dy, dz, power) {
    for (let i = 0; i < list.length; i++) this.#emit(list[i], x, y, z, dx, dy, dz, power);
  }

  #ring(x, z, size = 0.8, speed = 2.5) {
    this.shock.emit(x, z, this.ringHex, size, speed);
  }

  /** Programa un segundo anillo (eco) `e.at` segundos después; sustituye al pendiente. */
  #queueEcho(e, x, z) {
    if (!e) return;
    this.echo = e;
    this.echoT = e.at;
    this.echoX = x;
    this.echoZ = z;
  }

  #decal(x, y, z, d, scale = 1) {
    const c = this.#color(d.col);
    this.decals.emit(x, y, z, d.r * scale, c[0], c[1], c[2], d.life, d.add, d.op);
  }

  // ------------------------------------------------------------ eventos
  /** `power` 0..1; `dir` unitario en el sentido del tiro. */
  onHit(power, pos, dir) {
    this.impact = 1;
    const p = Math.max(0, Math.min(1, power));
    const rm = reducedMotion();
    if (this.fx.hit && this.fx.hit !== 'generic') this.#ring(pos.x, pos.z, 0.5 + p * 0.8, 3);
    this.#queueEcho(echoRing(this.sig.hitEcho, rm), pos.x, pos.z);
    this.#emitAll(hitList(this.hitSpecs, this.hitSpecsCalm, rm), pos.x, pos.y, pos.z, dir.x, dir.y, dir.z, p);
  }

  /** `normal` unitaria de la pared contra la que choca. */
  onWall(strength, pos, normal) {
    this.impact = Math.max(this.impact, Math.min(1, strength));
    const wr = this.sig.wallRing;
    const rm = reducedMotion();
    if (wr && strength > 0.3 && !rm) this.#ring(pos.x, pos.z, wr.size, wr.speed);
    this.#emitAll(hitList(this.wallSpecs, this.wallSpecsCalm, rm), pos.x, pos.y, pos.z, normal.x, normal.y, normal.z, Math.min(1, strength));
  }

  onBumper(pos) {
    this.impact = 1;
    if (this.fx.wall && this.fx.wall !== 'generic') this.#ring(pos.x, pos.z, 0.7, 3.2);
    this.#emitAll(this.bumperSpecs, pos.x, pos.y, pos.z, 0, 1, 0, 1);
  }

  /** Bola en el labio del hoyo sin entrar. */
  onLip(pos) {
    if (!this.lipSpecs.length) return;
    this.#emitAll(this.lipSpecs, pos.x, pos.y + 0.1, pos.z, 0, 1, 0, 1);
    this.#ring(pos.x, pos.z, 0.5, 4);
  }

  /** Embocada: secuencia cinemática de ~1.2 s en `update`. */
  onSink(cup) {
    const k = this.sinkKind;
    this.sinkPos.copy(cup);
    this.sinkT = 0;
    this.sinkFlags = 0;
    if (k === 'generic') return;
    const rm = reducedMotion();
    this.#ring(cup.x, cup.z, 1.1, 2);
    this.#queueEcho(echoRing(this.sig.sinkEcho, rm), cup.x, cup.z);
    if (this.sinkFountain) this.#emitAll(hitList(this.sinkFountain, this.sinkFountainCalm, rm), cup.x, cup.y + 0.1, cup.z, 0, 1, 0, 1);
    if (k === 'cinematic' || k === 'transform') {
      if (!rm) this.#emit(this.flashSpec, cup.x, cup.y + 0.3, cup.z, 0, 1, 0, 1);
      if (this.sig.sinkDecal && sinkDecalAllowed(this.sig, rm)) this.#decal(cup.x, 0, cup.z, this.sig.sinkDecal);
    }
    if (this.sig.attractSink && !rm) {
      this.particles.attract.copy(cup);
      this.particles.attractOn = true;
    }
    if (this.light && !rm) {
      this.light.position.set(cup.x, cup.y + 0.6, cup.z);
    }
  }

  setState(n) {
    this.state = n;
  }

  // ------------------------------------------------------------ frame
  /** `ctx` = { pos: Vector3, speed: number, moving: boolean, camera }; el llamador lo reutiliza. */
  update(t, dt, ctx) {
    const { pos, speed, moving, camera } = ctx;
    const rm = reducedMotion();
    this.t = t;
    this.impact = Math.max(0, this.impact - dt / 0.3);
    const sN = (this.speedN = Math.min(1, speed / 12));

    if (this.ribbon) {
      this.ribbon.mat.uniforms.uNoise.value = ribbonNoise(this.ribbonStyle, rm); // sigue la bandera si cambia en caliente
      this.ribbon.waveAmp = ribbonWave(this.sig.wave, rm);
      this.ribbon.update(t, dt, pos, moving, camera.position);
    }
    if (this.pointTrail) this.pointTrail.update(pos, moving);

    // aura: escala con la velocidad; las míticas «laten»
    if (this.aura) {
      const pulse = this.fx.aura === 'pulse' && !rm ? 0.15 * Math.sin(t * 3) : 0;
      this.aura.position.copy(pos);
      this.aura.scale.setScalar(BALL_R * (4 + sN * 2 + pulse * 4));
      this.aura.material.opacity = 0.3 + sN * 0.25 + this.impact * 0.3 + pulse;
    }
    if (this.shell) {
      this.shell.position.copy(pos);
      this.shell.material.uniforms.uK.value = 0.45 + sN * 0.4 + this.impact * 0.4;
    }
    if (this.disc) {
      this.disc.position.copy(pos);
      if (!rm) this.disc.rotation.z += dt * 1.2;
      this.disc.material.uniforms.uTime.value = rm ? STILL_TIME : t;
      this.disc.material.uniforms.uGrow.value = Math.min(1, this.state / 5);
      this.disc.scale.setScalar(1 + this.state * 0.08);
    }
    this.particles.attract.copy(this.sinkT >= 0 && this.sinkT < 0.8 && this.sig.attractSink ? this.sinkPos : pos);
    this.particles.attractOn = !rm && (this.sig.attractRoll === true || (this.sinkT >= 0 && this.sinkT < 0.8));

    // emisores continuos
    if (moving && speed > 0.5 && !rm) {
      // E1: en skins con maxParticles, los continuos dejan libre la mitad del pool para los eventos
      const open = continuousOpen(this.particles.n, this.particles.limit, this.fx.maxParticles);
      if (this.trailSpec && open) {
        this.accTrail += dt * trailRate(this.fx.trailRate, speed);
        while (this.accTrail >= 1) {
          this.accTrail -= 1;
          this.#emit(this.trailSpec, pos.x, pos.y - BALL_R * (this.trailSpec.drop ?? 0.4), pos.z, 0, 0, 0, 0.6);
        }
      }
      if (this.rollSpec && open && speed > (this.fx.roll === 'glints' ? 1 : 3)) {
        this.accRoll += dt * this.rollRate * (0.5 + sN);
        while (this.accRoll >= 1) {
          this.accRoll -= 1;
          const rx = (this.#rnd() - 0.5) * BALL_R, rz = (this.#rnd() - 0.5) * BALL_R;
          const up = this.fx.roll === 'glints';
          this.#emit(this.rollSpec, pos.x + rx, pos.y + (up ? BALL_R * 0.9 : -BALL_R * 0.8), pos.z + rz, 0, 1, 0, 1);
        }
      }
      const rr = this.sig.rollRing;
      if (rr && speed > 1.5) {
        this.accRing += dt;
        if (this.accRing >= rr.every) {
          this.accRing = 0;
          // E3: como mucho 2 anillos vivos (el pool de 4 es compartido con los eventos)
          if (this.shock.activeCount() < 2) this.#ring(pos.x, pos.z, rr.size, rr.speed);
        }
      }
      const rd = this.sig.rollDecal;
      if (rd && speed > 1.5) {
        this.accDecal += dt;
        if (this.accDecal >= rd.every) {
          this.accDecal = 0;
          this.#decal(pos.x, 0, pos.z, rd, rd.grows ? 1 + this.state * 0.4 : 1);
        }
      }
    }

    // anillo de eco pendiente (golpe/embocada); con la bandera nunca se programa
    if (this.echo) {
      this.echoT -= dt;
      if (this.echoT <= 0) {
        if (!rm) this.#ring(this.echoX, this.echoZ, this.echo.size, this.echo.speed);
        this.echo = null;
      }
    }

    // secuencia de embocada
    if (this.sinkT >= 0) {
      this.sinkT += dt;
      const st = this.sinkT, k = this.sinkKind, sp = this.sinkPos;
      if ((k === 'cinematic' || k === 'transform') && !(this.sinkFlags & 1) && st > 0.35) {
        this.sinkFlags |= 1;
        if (!rm) this.#ring(sp.x, sp.z, 1.6, 1.8);
        if (sinkBurstAllowed(this.sig, rm)) this.#emit(this.sinkBurst2, sp.x, sp.y + 0.1, sp.z, 0, 1, 0, 1);
      }
      if (k === 'transform' && !(this.sinkFlags & 2) && st > 0.8) {
        this.sinkFlags |= 2;
        if (!rm) this.#emit(this.flashBigSpec, sp.x, sp.y + 0.3, sp.z, 0, 1, 0, 1);
      }
      if (this.light) this.light.intensity = !rm && st < 0.4 ? 6 * (1 - st / 0.4) : 0;
      if (st > 1.2) {
        this.sinkT = -1;
        if (this.light) this.light.intensity = 0;
      }
    }

    this.particles.update(dt);
    this.decals.update(dt);
    this.shock.update(dt);
  }

  // ------------------------------------------------------------ utilidades
  /** Límite de partículas del nivel actual y activas ahora. */
  stats() {
    let dc = 0;
    if (this.ribbon?.obj.visible) dc++;
    if (this.pointTrail) dc++;
    if (this.particles.mesh.visible) dc++;
    if (this.aura) dc++;
    if (this.shell) dc++;
    if (this.disc?.visible) dc++;
    return { level: this.level, particles: this.particles.n, particleLimit: this.particles.limit, persistentDrawCalls: dc, decalLimit: this.decals.limit };
  }

  /** Vacía partículas, decals y estela (cambio de hoyo, respawn). */
  reset() {
    this.particles.clear();
    this.decals.clear();
    this.ribbon?.clear();
    this.sinkT = -1;
    this.echo = null;
    this.impact = 0;
    this.particles.attractOn = false;
    if (this.light) this.light.intensity = 0;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ribbon?.dispose();
    this.pointTrail?.dispose();
    if (this.aura) this.#disposeAura();
    if (this.shell) this.#disposeShell();
    if (this.disc) {
      this.disc.removeFromParent();
      this.disc.geometry.dispose();
      this.disc.material.dispose();
    }
    if (this.light) {
      this.light.removeFromParent();
      this.light.dispose?.();
    }
    this.particles.dispose();
    this.decals.dispose();
    this.shock.dispose();
    releaseSkinSpriteAtlas();
  }
}
