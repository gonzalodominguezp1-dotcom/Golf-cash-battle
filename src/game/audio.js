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
  // la bola cae en la lava: chisporroteo y un "fsss" que se apaga
  lava: () =>
    render(0.9, (d) => {
      noise(d, { dur: 0.85, gain: 0.5, cutoff: 0.5, attack: 0.01 });
      noise(d, { dur: 0.6, gain: 0.3, cutoff: 0.05, attack: 0.02, shape: 'sin' });
      for (let i = 0; i < 14; i++) modal(d, [[1800 + Math.random() * 2400, 0.004, 0.12]], 1, Math.floor(Math.random() * 0.6 * SR));
    }),
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
  if (!ctx || !buffers[name]) return;
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

export const sfx = {
  hit: (power) => play('putt', { vol: 0.35 + power * 0.65, rate: vary() * (0.94 + power * 0.12) }),
  wall: (strength) => play('wall', { vol: Math.min(1, 0.15 + strength / 9), rate: vary(0.1) }),
  bumper: () => play('bumper', { vol: 0.7, rate: vary(0.08) }),
  cup: () => play('cup', { vol: 0.9 }),
  sand: () => play('sand', { vol: 0.8, rate: vary(0.1) }),
  boost: () => play('boost', { vol: 0.7 }),
  lava: () => play('lava', { vol: 0.8, rate: vary(0.08) }),
  tick: () => play('tick', { vol: 0.5, rate: vary(0.1), wet: false }),
  portal: () => play('portal', { vol: 0.8 }),
  lip: () => play('lip', { vol: 0.8, rate: vary(0.08) }),
  full: () => play('full', { vol: 0.6, wet: false }),
  tap: () => play('tap', { vol: 0.6, wet: false }),
  coins: () => play('coins', { vol: 0.8 }),
  rivalCup: (pan) => play('rivalCup', { vol: 0.5, pan }),
  rivalHit: (dist, pan) => play('putt', { vol: Math.max(0.05, 0.25 - dist * 0.02), rate: vary(0.1), pan }),
};

/** Rodar de la bola: ruido grave cuyo volumen sigue a la velocidad. */
export function setRolling(speed, onSand) {
  if (!ctx) return;
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
  if (!ctx) return;
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
  if (!ctx || !kind) return;
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
