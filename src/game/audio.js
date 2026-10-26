// Sonidos generados en el navegador (sin archivos): síntesis modal de
// madera, plástico y campanas, con una reverb suave. Cada sonido se
// calcula una vez a un AudioBuffer y luego se reproduce con variaciones.

let ctx = null;
let master = null;
let reverb = null;
let muted = false;
const buffers = {};
let roll = null;
let ambient = null;
let finale = false; // fin de partida: solo suena la melodía final

const SR = 44100;

function render(seconds, fn) {
  const n = Math.ceil(seconds * SR);
  const data = new Float32Array(n);
  fn(data, n);
  // fundido final para que no haya clics
  const fade = Math.min(n, 256);
  for (let i = 0; i < fade; i++) data[n - 1 - i] *= i / fade;
  return data;
}

// suma de parciales senoidales con caída exponencial (cuerpos que resuenan)
function modal(data, partials, gain = 1, offset = 0) {
  for (const [freq, decay, amp] of partials) {
    const w = (2 * Math.PI * freq) / SR;
    const k = Math.exp(-1 / (decay * SR));
    let env = amp * gain;
    for (let i = offset; i < data.length; i++) {
      // ataque de 2 ms para que no restalle
      const att = Math.min(1, (i - offset) / (0.002 * SR));
      data[i] += Math.sin(w * (i - offset)) * env * att;
      env *= k;
      if (env < 1e-5) break;
    }
  }
}

function noise(data, { from = 0, dur, gain, cutoff = 0.2, attack = 0.001, shape = 'exp' }) {
  let lp = 0;
  const n = Math.floor(dur * SR);
  for (let i = 0; i < n && from + i < data.length; i++) {
    const t = i / n;
    const env = (shape === 'exp' ? Math.exp(-t * 6) : Math.sin(Math.PI * t)) * Math.min(1, i / (attack * SR));
    lp += cutoff * (Math.random() * 2 - 1 - lp);
    data[from + i] += lp * env * gain;
  }
}

const note = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// campana suave: parciales de vibráfono
const bell = (f, decay = 0.9, amp = 0.25) => [
  [f, decay, amp],
  [f * 4, decay * 0.35, amp * 0.25],
  [f * 10.2, decay * 0.12, amp * 0.06],
];

const DEFS = {
  // golpe de putter: "toc" de madera con cuerpo
  putt: () =>
    render(0.35, (d) => {
      modal(d, [
        [1120, 0.045, 0.5],
        [1870, 0.03, 0.25],
        [2960, 0.015, 0.12],
        [560, 0.06, 0.18],
      ]);
      noise(d, { dur: 0.012, gain: 0.35, cutoff: 0.5 });
    }),
  // bola contra la pared de madera: golpe sordo y cálido
  wall: () =>
    render(0.25, (d) => {
      modal(d, [
        [340, 0.05, 0.5],
        [720, 0.03, 0.25],
        [1290, 0.015, 0.1],
      ]);
      noise(d, { dur: 0.02, gain: 0.3, cutoff: 0.15 });
    }),
  // seta de goma: "boing" redondo
  bumper: () =>
    render(0.45, (d) => {
      const n = d.length;
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const f = 220 + 260 * (1 - Math.exp(-t * 18)) + Math.sin(t * 40) * 12 * Math.exp(-t * 6);
        ph += (2 * Math.PI * f) / SR;
        d[i] += Math.sin(ph) * 0.45 * Math.exp(-t * 7) * Math.min(1, t / 0.004);
      }
    }),
  // la bola cae en el hoyo: "clonc" de plástico, traqueteo y campanitas
  cup: () =>
    render(2.2, (d) => {
      modal(d, [
        [610, 0.09, 0.45],
        [1340, 0.05, 0.22],
        [2150, 0.03, 0.1],
      ]);
      [0.07, 0.12, 0.15].forEach((t, i) =>
        modal(d, [[900 + i * 140, 0.02, 0.18 / (i + 1)], [2100, 0.01, 0.06]], 1, Math.floor(t * SR)),
      );
      [72, 76, 79, 84].forEach((m, i) => modal(d, bell(note(m), 1.1, 0.16), 1, Math.floor((0.28 + i * 0.09) * SR)));
    }),
  // entrada en arena
  sand: () => render(0.4, (d) => noise(d, { dur: 0.38, gain: 0.35, cutoff: 0.08, attack: 0.03, shape: 'sin' })),
  // acelerador: barrido ascendente suave
  boost: () =>
    render(0.6, (d) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / SR;
        ph += (2 * Math.PI * (300 + 900 * t)) / SR;
        d[i] += (Math.sin(ph) + 0.3 * Math.sin(ph * 2)) * 0.18 * Math.sin(Math.PI * Math.min(1, t / 0.55));
      }
      noise(d, { dur: 0.55, gain: 0.12, cutoff: 0.3, attack: 0.1, shape: 'sin' });
    }),
  // portal: barrido descendente con brillo
  portal: () =>
    render(0.7, (d) => {
      let ph = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / SR;
        ph += (2 * Math.PI * (1400 * Math.exp(-t * 4) + 180)) / SR;
        d[i] += (Math.sin(ph) + 0.4 * Math.sin(ph * 1.5)) * 0.16 * Math.exp(-t * 4) * Math.min(1, t / 0.01);
      }
      [88, 95].forEach((m, i) => modal(d, bell(note(m), 0.3, 0.08), 1, Math.floor((0.05 + i * 0.08) * SR)));
    }),
  // la bola pasa por encima del hoyo sin caer: traqueteo contra el borde
  lip: () =>
    render(0.4, (d) => {
      [0, 0.04, 0.07].forEach((t, i) => modal(d, [[1300 - i * 150, 0.025, 0.3 / (i + 1)], [2600, 0.01, 0.08]], 1, Math.floor(t * SR)));
    }),
  // carga a tope: campanita aguda
  full: () => render(0.3, (d) => modal(d, bell(note(91), 0.25, 0.12))),
  // clic muy suave al apuntar
  tick: () => render(0.05, (d) => modal(d, [[2600, 0.006, 0.12]])),
  // botones de la interfaz
  tap: () => render(0.15, (d) => modal(d, [[880, 0.035, 0.3], [1760, 0.015, 0.08]])),
  // monedas / premio
  coins: () =>
    render(1.6, (d) => {
      [84, 88, 91, 96, 91, 96].forEach((m, i) => modal(d, bell(note(m), 0.6, 0.12), 1, Math.floor(i * 0.07 * SR)));
    }),
  // otro jugador emboca: campanita lejana
  rivalCup: () => render(0.8, (d) => modal(d, bell(note(79), 0.5, 0.1))),
};

function impulse(seconds = 1.4) {
  const n = Math.floor(seconds * SR);
  const buf = ctx.createBuffer(2, n, SR);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += 0.25 * (Math.random() * 2 - 1 - lp);
      data[i] = lp * Math.pow(1 - i / n, 3);
    }
  }
  return buf;
}

export function unlockAudio() {
  try {
    if (!ctx) {
      // en iPhone, sin esto el interruptor de silencio apaga todo el audio web
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ sampleRate: SR });
      // reanudar dentro del gesto antes de calcular los sonidos
      ctx.resume?.();
      const comp = ctx.createDynamicsCompressor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(comp).connect(ctx.destination);
      reverb = ctx.createConvolver();
      reverb.buffer = impulse();
      const wet = ctx.createGain();
      wet.gain.value = 0.22;
      reverb.connect(wet).connect(master);
      for (const [k, make] of Object.entries(DEFS)) {
        const data = make();
        const b = ctx.createBuffer(1, data.length, SR);
        b.copyToChannel(data, 0);
        buffers[k] = b;
      }
    }
    // suspended o interrupted (iPhone al volver de otra app)
    if (ctx.state !== 'running') ctx.resume?.().catch(() => {});
  } catch {
    ctx = null;
  }
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.9;
}

export function isMuted() {
  return muted;
}

function play(name, { vol = 1, rate = 1, wet = true, pan = 0 } = {}) {
  if (!ctx || !buffers[name] || finale) return;
  const src = ctx.createBufferSource();
  src.buffer = buffers[name];
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vol;
  let node = src.connect(g);
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node = node.connect(p);
  }
  node.connect(master);
  if (wet) node.connect(reverb);
  src.start();
}

const vary = (a = 0.06) => 1 + (Math.random() - 0.5) * a;

// ---- sonido por skin (P7): síntesis en tiempo real, nada descargado ----
// Cada set es una capa encima del sonido base. Todo pasa por un bus con
// nivel máximo 0.6, un compresor (evita clipping al encadenar golpes) y un
// límite de llamadas simultáneas. Las voces devuelven su duración en segundos.

const SKIN_VOL = 0.6;
const SKIN_MAX_ACTIVE = 12;
let skinBus = null;
let skinNoise = null;
let skinActive = 0;

function skinOut() {
  if (!skinBus) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 6;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;
    skinBus = ctx.createGain();
    skinBus.gain.value = SKIN_VOL;
    skinBus.connect(comp).connect(master);
    const send = ctx.createGain();
    send.gain.value = 0.3;
    skinBus.connect(send).connect(reverb);
  }
  return skinBus;
}

// ruido blanco generado una vez en memoria (no es una descarga)
function noiseSrc() {
  if (!skinNoise) {
    skinNoise = ctx.createBuffer(1, SR * 2, SR);
    const d = skinNoise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return skinNoise;
}

// envolvente (ataque lineal, caída exponencial) y filtro opcional; devuelve la entrada
function strip(t, dur, vol, { filter, attack = 0.003 } = {}) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(skinOut());
  if (!filter) return g;
  const f = ctx.createBiquadFilter();
  f.type = filter.type;
  f.frequency.setValueAtTime(filter.f, t);
  if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, t + dur);
  f.Q.value = filter.q ?? 0.7;
  f.connect(g);
  return f;
}

function tone(t, dur, vol, f, { type = 'sine', attack, filter, to, toT, detune = 0 } = {}) {
  const input = strip(t, dur, vol, { filter, attack });
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + (toT ?? dur));
  o.detune.value = detune;
  o.connect(input);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function air(t, dur, vol, filter, attack) {
  const input = strip(t, dur, vol, { filter, attack });
  const s = ctx.createBufferSource();
  s.buffer = noiseSrc();
  s.loop = true;
  s.connect(input);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
}

function crackle(t, n, span, vol, filter) {
  for (let i = 0; i < n; i++) {
    air(t + Math.random() * span, 0.008 + Math.random() * 0.012, vol * (0.4 + Math.random() * 0.6), filter, 0.001);
  }
}

// campanita de cristal: fundamental + parciales inarmónicos
function glass(t, f, dur, vol) {
  tone(t, dur, vol, f);
  tone(t, dur * 0.45, vol * 0.4, f * 2.4);
  tone(t, dur * 0.18, vol * 0.15, f * 5.1);
}

// clic metálico de moneda
function clink(t, f, vol) {
  tone(t, 0.09, vol, f);
  tone(t, 0.04, vol * 0.5, f * 2.1);
}

const sv = (p) => 0.4 + 0.6 * p; // volumen según potencia
const sk = (p) => 0.97 + 0.06 * p; // subida leve de tono con la potencia

const SKIN_SETS = {
  // Kintsugi Neón: zumbido de alta frecuencia y cristal + campana
  neon: {
    hit: (t, p) => {
      const v = sv(p);
      const k = sk(p);
      tone(t, 0.22, 0.28 * v, 2400 * k, { type: 'square', filter: { type: 'lowpass', f: 5200 } });
      tone(t, 0.22, 0.28 * v, 2412 * k, { type: 'square', filter: { type: 'lowpass', f: 5200 } });
      air(t, 0.05, 0.25 * v, { type: 'bandpass', f: 6000, q: 3 });
      return 0.25;
    },
    wall: (t, p) => {
      const v = sv(p);
      tone(t, 0.12, 0.5 * v, 3200 * sk(p));
      air(t, 0.03, 0.4 * v, { type: 'bandpass', f: 4000, q: 6 });
      return 0.15;
    },
    sink: (t, p) => {
      const v = sv(p);
      const f0 = 1568 * sk(p);
      tone(t, 1.1, 0.55 * v, f0);
      tone(t, 0.5, 0.25 * v, f0 * 2.756);
      tone(t, 0.25, 0.12 * v, f0 * 5.4);
      tone(t + 0.09, 0.9, 0.4 * v, 2352 * sk(p));
      air(t, 0.03, 0.3 * v, { type: 'bandpass', f: 7000, q: 2 });
      return 1.2;
    },
    roll: (t, p) => {
      crackle(t, 6, 0.3, 0.25 * sv(p), { type: 'highpass', f: 5000 });
      return 0.35;
    },
  },
  // Damasco Imperial: ting de acero templado, yunque y vapor
  steel: {
    hit: (t, p) => {
      const v = sv(p);
      const f = 2093 * sk(p);
      tone(t, 0.9, 0.6 * v, f);
      tone(t, 0.35, 0.3 * v, f * 2.76);
      tone(t, 0.15, 0.18 * v, f * 5.4);
      air(t, 0.008, 0.5 * v, { type: 'bandpass', f: 3500, q: 1 });
      return 0.9;
    },
    wall: (t, p) => {
      const v = sv(p);
      const f = 1174 * sk(p);
      tone(t, 0.2, 0.4 * v, f);
      tone(t, 0.1, 0.25 * v, f * 2.76);
      air(t, 0.06, 0.6 * v, { type: 'bandpass', f: 1400, q: 4 });
      return 0.2;
    },
    sink: (t, p) => {
      const v = sv(p);
      const k = sk(p);
      // martillo sobre yunque, campana corta y vapor que sube
      tone(t, 0.12, 0.8 * v, 180 * k, { to: 90, toT: 0.1 });
      air(t, 0.03, 0.6 * v, { type: 'lowpass', f: 900 });
      tone(t + 0.03, 1.2, 0.4 * v, 523 * k);
      tone(t + 0.03, 0.5, 0.15 * v, 523 * k * 2.76);
      air(t + 0.1, 0.9, 0.3 * v, { type: 'highpass', f: 2500 }, 0.25);
      return 1.2;
    },
    roll: (t, p) => {
      air(t, 0.5, 0.3 * sv(p), { type: 'bandpass', f: 6000, q: 2, to: 4000 }, 0.12);
      return 0.5;
    },
  },
  // Supernova Solar: whoomp grave y crepitar
  solar: {
    hit: (t, p) => {
      const v = sv(p);
      const k = sk(p);
      tone(t, 0.25, 0.9 * v, 110 * k, { to: 50, toT: 0.22 });
      air(t, 0.2, 0.4 * v, { type: 'lowpass', f: 900, to: 300, q: 0.8 }, 0.01);
      crackle(t + 0.03, 6, 0.2, 0.3 * v, { type: 'bandpass', f: 2500, q: 1.5 });
      return 0.3;
    },
    wall: (t, p) => {
      const v = sv(p);
      air(t, 0.25, 0.6 * v, { type: 'bandpass', f: 900, to: 2200, q: 1 }, 0.01);
      tone(t, 0.25, 0.3 * v, 300 * sk(p), { to: 180, toT: 0.25 });
      return 0.3;
    },
    sink: (t, p) => {
      const v = sv(p);
      const k = sk(p);
      tone(t, 0.9, 1.0 * v, 90 * k, { to: 35, toT: 0.8 });
      air(t, 0.9, 0.5 * v, { type: 'lowpass', f: 1200, to: 200 }, 0.01);
      crackle(t + 0.1, 10, 0.7, 0.3 * v, { type: 'bandpass', f: 3000, q: 1.2 });
      air(t + 0.02, 0.5, 0.25 * v, { type: 'highpass', f: 3000 });
      return 1.0;
    },
    roll: (t, p) => {
      crackle(t, 6, 0.4, 0.2 * sv(p), { type: 'lowpass', f: 2000 });
      return 0.45;
    },
  },
  // Dragón Carmesí: gruñido grave filtrado y rugido corto
  dragon: {
    hit: (t, p) => {
      const v = sv(p);
      const k = sk(p);
      tone(t, 0.42, 0.8 * v, 72 * k, {
        type: 'sawtooth',
        to: 58,
        toT: 0.4,
        attack: 0.02,
        filter: { type: 'lowpass', f: 320, to: 180, q: 4 },
      });
      air(t, 0.3, 0.25 * v, { type: 'lowpass', f: 400, q: 1 }, 0.03);
      return 0.45;
    },
    wall: (t, p) => {
      const v = sv(p);
      air(t, 0.04, 0.4 * v, { type: 'bandpass', f: 2600, q: 4 });
      tone(t, 0.08, 0.25 * v, 900 * sk(p), { to: 620, toT: 0.07 });
      return 0.12;
    },
    sink: (t, p) => {
      const v = sv(p);
      const k = sk(p);
      tone(t, 0.9, 0.9 * v, 110 * k, {
        type: 'sawtooth',
        to: 78,
        toT: 0.85,
        attack: 0.08,
        filter: { type: 'lowpass', f: 800, to: 260, q: 3 },
      });
      tone(t, 0.9, 0.3 * v, 55 * k);
      air(t, 0.9, 0.4 * v, { type: 'bandpass', f: 500, to: 250, q: 1.2 }, 0.06);
      return 1.0;
    },
    roll: (t, p) => {
      air(t, 0.5, 0.2 * sv(p), { type: 'lowpass', f: 180 }, 0.2);
      return 0.5;
    },
  },
  // Criónova: campanilla cristalina y crujido de hielo
  ice: {
    hit: (t, p) => {
      const v = sv(p);
      glass(t, 1760 * sk(p), 0.7, 0.5 * v);
      air(t, 0.02, 0.3 * v, { type: 'highpass', f: 6000 });
      return 0.7;
    },
    wall: (t, p) => {
      const v = sv(p);
      air(t, 0.018, 0.5 * v, { type: 'highpass', f: 5000 });
      tone(t, 0.06, 0.25 * v, 3000 * sk(p));
      return 0.1;
    },
    sink: (t, p) => {
      const v = sv(p);
      crackle(t, 8, 0.25, 0.35 * v, { type: 'bandpass', f: 3000, q: 3 });
      glass(t + 0.15, 1046 * sk(p), 1.4, 0.4 * v);
      return 1.5;
    },
    roll: (t, p) => {
      air(t, 0.35, 0.12 * sv(p), { type: 'highpass', f: 8000 }, 0.1);
      return 0.4;
    },
  },
  // Horizonte de Sucesos: implosión y sub-bajo descendente con whoosh invertido
  void: {
    hit: (t, p) => {
      const v = sv(p);
      tone(t, 0.3, 0.9 * v, 90 * sk(p), { to: 40, toT: 0.28 });
      air(t, 0.3, 0.45 * v, { type: 'bandpass', f: 2800, to: 200, q: 0.8 });
      return 0.3;
    },
    wall: (t, p) => {
      const v = sv(p);
      tone(t, 0.35, 0.55 * v, 220 * sk(p), { type: 'triangle', to: 110, toT: 0.3 });
      air(t, 0.25, 0.3 * v, { type: 'bandpass', f: 600, q: 0.7 });
      return 0.35;
    },
    sink: (t, p) => {
      const v = sv(p);
      tone(t, 1.3, 1.0 * v, 60 * sk(p), { to: 30, toT: 1.2, attack: 0.02 });
      // whoosh invertido: sube durante 0.75 s y corta de golpe
      air(t, 0.8, 0.5 * v, { type: 'bandpass', f: 200, to: 2500, q: 0.8 }, 0.75);
      return 1.3;
    },
    roll: (t, p) => {
      const v = sv(p);
      tone(t, 0.5, 0.15 * v, 55 * sk(p), { attack: 0.15 });
      air(t, 0.5, 0.06 * v, { type: 'lowpass', f: 300 }, 0.15);
      return 0.5;
    },
  },
  // Prisma Holo: prisma de rayos, ting brillante y arpegio corto
  holo: {
    hit: (t, p) => {
      const v = sv(p);
      const k = sk(p);
      for (let i = 0; i < 6; i++) tone(t + i * 0.018, 0.07, 0.35 * v, (2000 + i * 420) * k);
      air(t, 0.2, 0.15 * v, { type: 'highpass', f: 5000 });
      return 0.2;
    },
    wall: (t, p) => {
      const v = sv(p);
      const k = sk(p);
      tone(t, 0.25, 0.4 * v, 2349 * k);
      tone(t + 0.03, 0.25, 0.25 * v, 3136 * k);
      return 0.3;
    },
    sink: (t, p) => {
      const v = sv(p);
      const k = sk(p);
      [1047, 1319, 1568, 2093].forEach((f, i) =>
        tone(t + i * 0.07, 0.5, 0.35 * v, f * k, { type: 'triangle', filter: { type: 'lowpass', f: 6000 } }),
      );
      air(t + 0.28, 0.4, 0.12 * v, { type: 'highpass', f: 7000 });
      return 0.9;
    },
    roll: (t, p) => {
      const v = sv(p);
      for (let i = 0; i < 4; i++) tone(t + Math.random() * 0.4, 0.08, 0.12 * v, 3000 + Math.random() * 3000);
      return 0.45;
    },
  },
  // Toque de Midas: pepitas, clink de monedas y coro corto
  gold: {
    hit: (t, p) => {
      const v = sv(p);
      for (let i = 0; i < 5; i++) {
        clink(t + i * 0.025 + Math.random() * 0.01, 3200 + Math.random() * 1000, (0.4 + Math.random() * 0.3) * v);
      }
      return 0.25;
    },
    wall: (t, p) => {
      clink(t, 2600 * sk(p), 0.6 * sv(p));
      return 0.12;
    },
    sink: (t, p) => {
      const v = sv(p);
      const k = sk(p);
      for (let i = 0; i < 6; i++) clink(t + i * 0.06, 2900 + Math.random() * 900, 0.5 * v);
      [261.6, 329.6, 392].forEach((f) => {
        for (const detune of [-7, 7]) {
          tone(t + 0.2, 1.2, 0.25 * v, f * k, {
            type: 'sawtooth',
            detune,
            attack: 0.35,
            filter: { type: 'lowpass', f: 1400, to: 900, q: 0.5 },
          });
        }
      });
      return 1.5;
    },
    roll: (t, p) => {
      for (let i = 0; i < 4; i++) clink(t + i * 0.14, 2200 * sk(p), 0.25 * sv(p));
      return 0.5;
    },
  },
};

/** Sonido de skin: sfx.skin('neon', 'hit', { power: 0.8 }). Eventos: hit, wall, sink, roll. */
function playSkin(set, event, { power = 0.5 } = {}) {
  if (!ctx || isMuted() || finale) return;
  const voice = SKIN_SETS[set]?.[event];
  if (typeof voice !== 'function' || skinActive >= SKIN_MAX_ACTIVE) return;
  const p = Number.isFinite(power) ? Math.min(1, Math.max(0, power)) : 0.5;
  let dur;
  try {
    dur = voice(ctx.currentTime + 0.005, p);
  } catch {
    return;
  }
  skinActive++;
  setTimeout(() => {
    skinActive--;
  }, (dur + 0.3) * 1000);
}

// ---- apertura de recompensas: síntesis en tiempo real, pensada para impactar ----
// order: 0 común … 5 mítica. Todo pasa por el bus de skins (compresor + reverb).

const R_NOTES = [0, 4, 7, 12, 16, 19, 24]; // acorde mayor en capas

/** Zumbido que crece mientras mantienes pulsado (p de 0 a 1; null = apagar). */
let holdVoice = null;
function holdCharge(p) {
  if (!ctx || isMuted() || finale) return;
  if (p == null || p <= 0) {
    if (holdVoice) {
      const t = ctx.currentTime;
      holdVoice.g.gain.cancelScheduledValues(t);
      holdVoice.g.gain.setTargetAtTime(0, t, 0.06);
      const v = holdVoice;
      holdVoice = null;
      setTimeout(() => v.stop(), 400);
    }
    return;
  }
  if (!holdVoice) {
    const g = ctx.createGain();
    g.gain.value = 0;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2.5;
    f.connect(g).connect(skinOut());
    const oscs = [-9, 0, 9].map((detune) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = detune;
      o.connect(f);
      o.start();
      return o;
    });
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    const sg = ctx.createGain();
    sg.gain.value = 0.9;
    sub.connect(sg).connect(f);
    sub.start();
    const n = ctx.createBufferSource();
    n.buffer = noiseSrc();
    n.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.value = 0;
    n.connect(nf).connect(ng).connect(skinOut());
    n.start();
    holdVoice = {
      g, f, oscs, sub, nf, ng,
      stop() {
        [...oscs, sub].forEach((o) => { try { o.stop(); } catch { } });
        try { n.stop(); } catch { }
      },
    };
  }
  const t = ctx.currentTime;
  const base = 70 * Math.pow(2, p * 2.2); // sube más de dos octavas
  holdVoice.oscs.forEach((o) => o.frequency.setTargetAtTime(base, t, 0.05));
  holdVoice.sub.frequency.setTargetAtTime(base / 2, t, 0.05);
  holdVoice.f.frequency.setTargetAtTime(250 + p * p * 5200, t, 0.05);
  holdVoice.g.gain.setTargetAtTime(0.1 + p * 0.5, t, 0.04);
  holdVoice.nf.frequency.setTargetAtTime(800 + p * 6000, t, 0.05);
  holdVoice.ng.gain.setTargetAtTime(p * p * 0.35, t, 0.05);
}

/** Tic de carga que sube de tono con el progreso. */
function rewardTick(p = 0) {
  if (!ctx || isMuted()) return;
  const t = ctx.currentTime;
  tone(t, 0.12, 0.25 + p * 0.25, 900 * Math.pow(2, p * 2), { type: 'triangle' });
  glass(t, 1800 * Math.pow(2, p * 1.5), 0.25, 0.08 + p * 0.1);
}

/** Riser de tensión (secs) previo al estallido. */
function rewardRiser(secs, order = 0) {
  if (!ctx || isMuted()) return 0;
  const t = ctx.currentTime + 0.01;
  const k = 1 + order * 0.15;
  tone(t, secs, 0.28 * k, 110, { type: 'sawtooth', to: 880, toT: secs, attack: secs * 0.9, filter: { type: 'lowpass', f: 300, to: 7000, q: 3 } });
  tone(t, secs, 0.22 * k, 112.5, { type: 'sawtooth', to: 887, toT: secs, attack: secs * 0.9, filter: { type: 'lowpass', f: 300, to: 7000, q: 3 } });
  air(t, secs, 0.5 * k, { type: 'bandpass', f: 500, to: 9000, q: 1.5 }, secs * 0.95);
  for (let i = 0; i < 8 + order * 2; i++) {
    const at = t + secs * (1 - Math.pow(1 - i / (8 + order * 2), 1.6)); // pulsos que se aceleran
    clink(at, 1800 + i * 160, 0.1 + i * 0.012);
  }
  return secs;
}

/** El estallido: impacto, coro de acorde, arpegio de cristal y chispas. */
function rewardReveal(order = 0) {
  if (!ctx || isMuted()) return 0;
  const t = ctx.currentTime + 0.005;
  const k = 0.7 + order * 0.1;
  // golpe: sub que cae + crujido de ruido
  tone(t, 1.8, 0.95 * k, 90, { type: 'sine', to: 28, toT: 1.2, attack: 0.002 });
  tone(t, 0.5, 0.5 * k, 160, { type: 'triangle', to: 50, toT: 0.3, attack: 0.001 });
  air(t, 1.0, 0.9 * k, { type: 'lowpass', f: 9000, to: 250, q: 0.7 }, 0.002);
  air(t, 0.35, 0.6 * k, { type: 'highpass', f: 3000, q: 0.5 }, 0.001);
  // coro de acorde con swell (más capas cuanto más rara)
  const root = 48 + (order >= 4 ? 0 : 3);
  const layers = Math.min(R_NOTES.length, 3 + order);
  for (let n = 0; n < layers; n++) {
    const f = note(root + R_NOTES[n]);
    for (const detune of [-11, 0, 11]) {
      tone(t + 0.05, 2.6 + order * 0.35, 0.16 * k, f, {
        type: 'sawtooth', detune, attack: 0.5,
        filter: { type: 'lowpass', f: 700, to: 3800, q: 0.8 },
      });
    }
    tone(t + 0.05, 3.2, 0.1 * k, f * 2, { type: 'sine', attack: 0.4 });
  }
  // arpegio de cristal subiendo
  const arp = [72, 76, 79, 84, 88, 91, 96, 100];
  const count = 5 + order;
  for (let i = 0; i < count; i++) glass(t + 0.12 + i * 0.075, note(arp[i % arp.length]), 1.4, 0.2 * k);
  // lluvia de chispas
  crackle(t + 0.15, 14 + order * 10, 1.2 + order * 0.2, 0.4 * k, { type: 'highpass', f: 5000, q: 0.6 });
  if (order >= 3) {
    // barrido ascendente final para legendarias y míticas
    tone(t + 0.3, 1.4, 0.3, 300, { type: 'sawtooth', to: 2400, toT: 1.2, attack: 0.5, filter: { type: 'lowpass', f: 1200, to: 6000, q: 1 } });
  }
  if (order >= 5) {
    for (const f of [note(36), note(43)]) tone(t, 3.4, 0.5, f, { type: 'sine', attack: 0.01 });
  }
  return 3.5;
}

/**
 * Melodía de final de partida (~5 s). Victoria: fanfarria con metales, redoble y acorde final;
 * resto de puestos: motivo más suave y esperanzador que invita a la revancha.
 */
function endJingle(won = false, position = 2) {
  if (!ctx || isMuted()) return 0;
  const t = ctx.currentTime + 0.05;
  const brass = (at, dur, midi, vol = 0.22) => {
    const f = note(midi);
    for (const detune of [-8, 0, 8]) tone(at, dur, vol, f, { type: 'sawtooth', detune, attack: 0.02, filter: { type: 'lowpass', f: 900, to: 3200, q: 0.9 } });
    tone(at, dur, vol * 0.6, f / 2, { type: 'triangle', attack: 0.02 });
  };
  const bass = (at, dur, midi) => tone(at, dur, 0.4, note(midi - 12), { type: 'sine', attack: 0.01 });
  if (won) {
    // redoble de caja que sube
    for (let i = 0; i < 12; i++) air(t + i * 0.05, 0.05, 0.1 + i * 0.03, { type: 'bandpass', f: 3500, q: 0.8 }, 0.002);
    // C4 C4 C4 · E4 G4 · C5 (ta-ta-ta-TAAA)
    const m = [[0.6, 0.14, 60], [0.78, 0.14, 60], [0.96, 0.14, 60], [1.14, 0.3, 64], [1.5, 0.3, 67], [1.9, 1.7, 72]];
    for (const [d, dur, midi] of m) { brass(t + d, dur, midi); bass(t + d, dur, midi); }
    // acorde final grande + golpe + chispas
    const end = t + 1.9;
    for (const n of [76, 79, 84]) brass(end, 2.6, n, 0.14);
    tone(end, 1.6, 0.9, 85, { type: 'sine', to: 32, toT: 1.2, attack: 0.002 });
    air(end, 0.7, 0.6, { type: 'lowpass', f: 8000, to: 300, q: 0.7 }, 0.002);
    [84, 88, 91, 96, 100, 103, 108].forEach((m2, i) => glass(end + 0.1 + i * 0.09, note(m2), 1.5, 0.16));
    crackle(end + 0.1, 30, 1.8, 0.4, { type: 'highpass', f: 5500, q: 0.6 });
    return 4.5;
  }
  // sin victoria: motivo cálido (La menor → Do mayor) con campanas
  const mel = position <= 3 ? [69, 72, 76, 74, 72, 79] : [64, 67, 71, 69, 67, 72];
  mel.forEach((midi, i) => {
    glass(t + 0.3 + i * 0.28, note(midi + 12), 1.4, 0.22);
    tone(t + 0.3 + i * 0.28, 0.9, 0.12, note(midi), { type: 'triangle', attack: 0.02, filter: { type: 'lowpass', f: 1800, q: 0.6 } });
  });
  for (const n of [57, 60, 64]) tone(t + 0.3, 2.2, 0.1, note(n), { type: 'sine', attack: 0.4 });
  for (const n of [60, 64, 67, 72]) tone(t + 2.1, 2.6, 0.11, note(n), { type: 'sine', attack: 0.3 });
  glass(t + 2.1, note(96), 2, 0.12);
  return 4.5;
}

export const sfx = {
  hit: (power) => play('putt', { vol: 0.35 + power * 0.65, rate: vary() * (0.94 + power * 0.12) }),
  wall: (strength) => play('wall', { vol: Math.min(1, 0.15 + strength / 9), rate: vary(0.1) }),
  bumper: () => play('bumper', { vol: 0.7, rate: vary(0.08) }),
  cup: () => play('cup', { vol: 0.9 }),
  sand: () => play('sand', { vol: 0.8, rate: vary(0.1) }),
  boost: () => play('boost', { vol: 0.7 }),
  tick: () => play('tick', { vol: 0.5, rate: vary(0.1), wet: false }),
  portal: () => play('portal', { vol: 0.8 }),
  lip: () => play('lip', { vol: 0.8, rate: vary(0.08) }),
  full: () => play('full', { vol: 0.6, wet: false }),
  tap: () => play('tap', { vol: 0.6, wet: false }),
  coins: () => play('coins', { vol: 0.8 }),
  rivalCup: (pan) => play('rivalCup', { vol: 0.5, pan }),
  rivalHit: (dist, pan) => play('putt', { vol: Math.max(0.05, 0.25 - dist * 0.02), rate: vary(0.1), pan }),
  skin: playSkin,
  reward: {
    hold: holdCharge,
    riser: rewardRiser,
    reveal: rewardReveal,
    tick: rewardTick,
  },
  endJingle,
};

/** Rodar de la bola: ruido grave cuyo volumen sigue a la velocidad. */
export function setRolling(speed, onSand) {
  if (!ctx || finale) return;
  if (!roll) {
    const n = SR * 2;
    const b = ctx.createBuffer(1, n, SR);
    const d = b.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += 0.04 * (Math.random() * 2 - 1 - lp);
      d[i] = lp * 3;
    }
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(master);
    src.start();
    roll = { g, f };
  }
  const target = Math.min(0.35, speed * 0.04);
  roll.g.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
  roll.f.frequency.setTargetAtTime(onSand ? 1400 : 300 + speed * 60, ctx.currentTime, 0.05);
}

let charge = null;
/** Tono que sube mientras cargas el golpe (0 = apagado). */
export function setCharge(power) {
  if (!ctx || finale) return;
  if (!charge) {
    // tono suave: senos (fundamental y octava) por un filtro paso bajo, sin
    // los armónicos ásperos de la triangular; agudo justo para oírse en el
    // altavoz del móvil, que no reproduce graves
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    f.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const o5 = ctx.createOscillator();
    o5.type = 'sine';
    const g5 = ctx.createGain();
    g5.gain.value = 0.18;
    o.connect(f);
    o5.connect(g5).connect(f);
    f.connect(g).connect(master);
    o.start();
    o5.start();
    charge = { o, o5, f, g, last: 0 };
  }
  const t = ctx.currentTime;
  const moving = Math.abs(power - charge.last) > 0.004;
  charge.last = power;
  const pitch = 330 + power * 330;
  charge.o.frequency.setTargetAtTime(pitch, t, 0.06);
  charge.o5.frequency.setTargetAtTime(pitch * 2, t, 0.06);
  charge.f.frequency.setTargetAtTime(1200 + power * 800, t, 0.08);
  if (power <= 0.02) {
    charge.g.gain.cancelScheduledValues(t);
    charge.g.gain.setTargetAtTime(0, t, 0.05);
  } else if (moving) {
    // suena mientras cambias la potencia y baja a la mitad si te quedas quieto apuntando
    const level = 0.035 + power * 0.03;
    charge.g.gain.cancelScheduledValues(t);
    charge.g.gain.setTargetAtTime(level, t, 0.05);
    charge.g.gain.setTargetAtTime(level * 0.5, t + 0.4, 0.6);
  }
}

/** Sonido ambiente según el hoyo: pájaros, olas o grillos. */
export function setAmbient(kind) {
  stopAmbient();
  if (!ctx || !kind || finale) return;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setTargetAtTime(0.12, ctx.currentTime, 1);
  g.connect(master);
  const timers = [];
  const chirp = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), e = ctx.createGain();
    const base = 2800 + Math.random() * 1600;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      o.frequency.setValueAtTime(base, t + i * 0.09);
      o.frequency.exponentialRampToValueAtTime(base * 1.35, t + i * 0.09 + 0.06);
      e.gain.setValueAtTime(0, t + i * 0.09);
      e.gain.linearRampToValueAtTime(0.25, t + i * 0.09 + 0.01);
      e.gain.linearRampToValueAtTime(0, t + i * 0.09 + 0.07);
    }
    o.connect(e).connect(g);
    o.start(t);
    o.stop(t + notes * 0.09 + 0.1);
  };
  let src = null;
  if (kind === 'birds') {
    const loop = () => {
      chirp();
      timers.push(setTimeout(loop, 1800 + Math.random() * 4000));
    };
    timers.push(setTimeout(loop, 800));
  } else {
    // olas o viento: ruido filtrado con un vaivén lento
    const n = SR * 8;
    const b = ctx.createBuffer(1, n, SR);
    const d = b.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += 0.05 * (Math.random() * 2 - 1 - lp);
      const swell = kind === 'waves' ? 0.35 + 0.65 * Math.pow(Math.sin((Math.PI * i) / n), 2) : 0.6;
      d[i] = lp * 2.5 * swell;
    }
    src = ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = kind === 'waves' ? 900 : 500;
    src.connect(f).connect(g);
    src.start();
    if (kind === 'waves') {
      const loop = () => {
        chirp();
        timers.push(setTimeout(loop, 5000 + Math.random() * 6000));
      };
      timers.push(setTimeout(loop, 3000));
    }
  }
  if (kind === 'crickets') {
    const loop = () => {
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), e = ctx.createGain();
      o.frequency.value = 4300 + Math.random() * 300;
      for (let i = 0; i < 6; i++) {
        e.gain.setValueAtTime(0, t + i * 0.05);
        e.gain.linearRampToValueAtTime(0.06, t + i * 0.05 + 0.01);
        e.gain.linearRampToValueAtTime(0, t + i * 0.05 + 0.035);
      }
      o.connect(e).connect(g);
      o.start(t);
      o.stop(t + 0.35);
      timers.push(setTimeout(loop, 700 + Math.random() * 1500));
    };
    timers.push(setTimeout(loop, 500));
  }
  ambient = { g, src, timers };
}

export function stopAmbient() {
  if (!ambient) return;
  ambient.timers.forEach(clearTimeout);
  try {
    ambient.src?.stop();
  } catch {}
  ambient.g.disconnect();
  ambient = null;
}

export function stopRolling() {
  if (roll && ctx) roll.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
}

/** Fin de partida: corta lo que sigue sonando y no deja entrar nada más salvo endJingle. */
export function enterFinale() {
  holdCharge(null);
  stopAmbient();
  stopRolling();
  if (charge && ctx) {
    charge.g.gain.cancelScheduledValues(ctx.currentTime);
    charge.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }
  finale = true;
}

/** Vuelve al sonido normal (nueva partida o lobby). */
export function leaveFinale() {
  finale = false;
}
