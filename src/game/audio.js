// Efectos de sonido sintetizados con Web Audio (sin archivos).
let ctx = null;
let muted = false;

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

export function setMuted(m) {
  muted = m;
}

function tone({ freq = 440, to = freq, dur = 0.15, type = 'sine', vol = 0.3, delay = 0 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.1, vol = 0.2, freq = 2000, delay = 0 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = buf;
  f.type = 'bandpass';
  f.frequency.value = freq;
  g.gain.value = vol;
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
}

export const sfx = {
  hit(power) {
    tone({ freq: 1400, to: 500, dur: 0.07, type: 'triangle', vol: 0.25 + power * 0.35 });
    noise({ dur: 0.05, vol: 0.3 * power + 0.1, freq: 3500 });
  },
  wall(strength) {
    const v = Math.min(1, strength / 8);
    tone({ freq: 260, to: 120, dur: 0.09, type: 'square', vol: 0.08 + v * 0.15 });
    noise({ dur: 0.04, vol: 0.15 * v, freq: 900 });
  },
  bumper() {
    tone({ freq: 300, to: 900, dur: 0.18, type: 'sine', vol: 0.3 });
  },
  sand() {
    noise({ dur: 0.25, vol: 0.12, freq: 1200 });
  },
  cup() {
    tone({ freq: 220, to: 90, dur: 0.18, type: 'sine', vol: 0.4 });
    [660, 880, 1320].forEach((f, i) => tone({ freq: f, dur: 0.25, type: 'triangle', vol: 0.18, delay: 0.15 + i * 0.09 }));
    noise({ dur: 1.2, vol: 0.08, freq: 1800, delay: 0.3 });
  },
  tick() {
    tone({ freq: 900, dur: 0.03, type: 'square', vol: 0.03 });
  },
};
