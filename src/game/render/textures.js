import * as THREE from 'three';
import { quality } from './quality.js';

// Texturas procedurales en canvas: no hay que descargar imágenes.
function canvasTexture(size, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function rand(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// tamaño de las texturas con detalle según la calidad (256 / 512 / 1024)
const detailSize = (base) => Math.max(128, Math.round(base * quality().texScale));

/**
 * Mapa de normales a partir del brillo de una textura (lo claro sobresale).
 * Da relieve a las briznas de césped, las vetas de la madera y los granos de
 * arena sin añadir polígonos.
 */
function normalMapFrom(tex, strength = 2) {
  const src = tex.image;
  const n = src.width;
  const data = src.getContext('2d').getImageData(0, 0, n, n).data;
  const h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) h[i] = (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11) / 255;
  const t = normalMapFromHeight(h, n, strength);
  t.wrapS = tex.wrapS;
  t.wrapT = tex.wrapT;
  return t;
}

/** Textura de color y su mapa de normales, que comparten repetición y desplazamiento. */
function withNormals(map, strength) {
  const normalMap = normalMapFrom(map, strength);
  // repeat/offset de la normal siguen siempre a los del color
  normalMap.repeat = map.repeat;
  normalMap.offset = map.offset;
  return { map, normalMap };
}

export function grassMaps([a, b]) {
  return withNormals(grassTexture([a, b]), 1.6);
}

/** Tono del antegreen: el césped del green más oscuro y apagado, tirando al del prado. */
export function roughTone(theme) {
  return new THREE.Color(theme.grass[1]).lerp(new THREE.Color(theme.groundHigh), 0.55).offsetHSL(0, -0.12, -0.02);
}

export function grassTexture([a, b]) {
  return canvasTexture(detailSize(256), (g, n) => {
    // dos franjas de corte por tesela con el borde difuminado
    const grd = g.createLinearGradient(0, 0, 0, n);
    grd.addColorStop(0, a);
    grd.addColorStop(0.46, a);
    grd.addColorStop(0.54, b);
    grd.addColorStop(0.96, b);
    grd.addColorStop(1, a);
    g.fillStyle = grd;
    g.fillRect(0, 0, n, n);
    const r = rand(7);
    // manchas suaves de color: el césped nunca es de un verde plano
    for (let i = 0; i < 26; i++) {
      const x = r() * n, y = r() * n, rad = n * (0.08 + r() * 0.16);
      const spot = g.createRadialGradient(x, y, 0, x, y, rad);
      const light = r() > 0.5;
      spot.addColorStop(0, light ? 'rgba(255,255,170,0.07)' : 'rgba(0,40,0,0.07)');
      spot.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = spot;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // briznas: trazos cortos inclinados, unos más claros (puntas) y otros oscuros
    const k = n / 256;
    for (let i = 0; i < 5200 * k * k; i++) {
      const x = r() * n, y = r() * n, l = (2 + r() * 3.5) * k, ang = -1.2 - r() * 0.7;
      const light = r() > 0.45;
      g.strokeStyle = light ? `rgba(225,255,170,${0.1 + r() * 0.16})` : `rgba(10,50,10,${0.1 + r() * 0.16})`;
      g.lineWidth = (0.6 + r() * 0.6) * k;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l);
      g.stroke();
    }
  });
}

/** Suelo de la cámara de magma: basalto con losas, grietas y alguna veta encendida. */
export function rockFloorMaps([a, b]) {
  return withNormals(rockFloorTexture([a, b]), 2.6);
}

export function rockFloorTexture([a, b]) {
  return canvasTexture(detailSize(256), (g, n) => {
    const k = n / 256;
    const r = rand(11);
    g.fillStyle = a;
    g.fillRect(0, 0, n, n);
    // manchas grandes: el basalto nunca es de un color plano
    for (let i = 0; i < 40; i++) {
      const x = r() * n, y = r() * n, rad = n * (0.06 + r() * 0.16);
      const spot = g.createRadialGradient(x, y, 0, x, y, rad);
      spot.addColorStop(0, r() > 0.5 ? b : 'rgba(20,12,12,0.5)');
      spot.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = spot;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // grano fino
    for (let i = 0; i < 3000 * k * k; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(255,230,210,0.06)' : 'rgba(0,0,0,0.12)';
      g.fillRect(r() * n, r() * n, (1 + r() * 2) * k, (1 + r() * 2) * k);
    }
    // grietas entre losas (alguna con el brillo de la lava de debajo)
    const crack = (x, y, len, glow) => {
      g.beginPath();
      g.moveTo(x, y);
      let ang = r() * Math.PI * 2;
      for (let s = 0; s < len; s++) {
        ang += (r() - 0.5) * 0.9;
        x += Math.cos(ang) * 6 * k;
        y += Math.sin(ang) * 6 * k;
        g.lineTo(x, y);
      }
      g.strokeStyle = glow ? 'rgba(255,110,30,0.55)' : 'rgba(10,6,6,0.6)';
      g.lineWidth = (glow ? 1.4 : 1.8) * k;
      g.stroke();
    };
    for (let i = 0; i < 26; i++) crack(r() * n, r() * n, 6 + Math.floor(r() * 10), i % 7 === 0);
  });
}

export function woodMaps() {
  return withNormals(woodTexture(), 2.4);
}

export function woodTexture() {
  return canvasTexture(detailSize(128), (g, n) => {
    const k = n / 128;
    g.fillStyle = '#c98a4b';
    g.fillRect(0, 0, n, n);
    const r = rand(3);
    // vetas onduladas a lo largo de la tabla
    for (let y = 0; y < n; y += 1.5 * k) {
      g.strokeStyle = `rgba(${r() > 0.5 ? '90,45,10' : '235,180,120'},${0.05 + r() * 0.12})`;
      g.lineWidth = k;
      g.beginPath();
      const ph = r() * 6, amp = (0.5 + r()) * k;
      for (let x = 0; x <= n; x += 4 * k) g.lineTo(x, y + Math.sin(x * 0.05 / k + ph) * amp);
      g.stroke();
    }
    // juntas entre tablas, con un filo claro encima
    g.fillStyle = 'rgba(60,30,8,0.6)';
    g.fillRect(0, 0, n, 3 * k);
    g.fillRect(0, n / 2, n, 3 * k);
    g.fillRect(n * 0.3, 0, 3 * k, n / 2);
    g.fillRect(n * 0.8, n / 2, 3 * k, n / 2);
    g.fillStyle = 'rgba(255,220,170,0.25)';
    g.fillRect(0, 3 * k, n, k);
    g.fillRect(0, n / 2 + 3 * k, n, k);
    // nudos
    for (let i = 0; i < 4; i++) {
      const x = r() * n, y = r() * n;
      for (let ring = 3; ring > 0; ring--) {
        g.beginPath();
        g.fillStyle = `rgba(80,40,10,${0.15 + (3 - ring) * 0.12})`;
        g.ellipse(x, y, ring * 2.2 * k, ring * k, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

/**
 * Ruido de valor periódico (se repite cada `period` celdas): permite texturas
 * sin costuras al repetirse por la arena.
 */
function periodicNoise(seed) {
  const r = rand(seed);
  const lattice = new Float32Array(256 * 256).map(() => r());
  return (x, y, period) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const at = (i, j) => lattice[(((j % period) + period) % period) * 256 + (((i % period) + period) % period)];
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
}

/** Suma de octavas de ruido periódico en [0, 1]. */
function fbm(noise, x, y, period, octaves) {
  let v = 0, amp = 0.5, total = 0;
  for (let o = 0; o < octaves; o++) {
    v += noise(x, y, period) * amp;
    total += amp;
    x *= 2;
    y *= 2;
    period *= 2;
    amp *= 0.5;
  }
  return v / total;
}

/** Normales a partir de un mapa de alturas en [0, 1], con borde periódico. */
function normalMapFromHeight(h, n, strength) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const out = g.createImageData(n, n);
  const at = (x, y) => h[((y + n) % n) * n + ((x + n) % n)];
  const k = strength * (n / 256);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * n + x) * 4;
      out.data[o] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * Arena de búnker: dunas suaves, surcos de rastrillo que serpentean, granos
 * de varios minerales (cuarzo claro, feldespato rosado, granos oscuros) y
 * pequeñas piedras. Color, normales y rugosidad salen del mismo relieve, así
 * que la luz rasante marca los surcos y los granos de verdad.
 */
export function sandMaps() {
  const n = detailSize(256);
  const k = n / 256;
  const r = rand(11);
  const noise = periodicNoise(23);
  const h = new Float32Array(n * n);
  const col = new Float32Array(n * n * 3);
  const rough = new Uint8ClampedArray(n * n);
  // tono base y variaciones (arena dorada de campo de golf)
  const base = [236, 208, 150], warm = [222, 178, 112], pale = [246, 230, 190];
  const RAKE = 9; // surcos por tesela
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n;
      const i = y * n + x;
      // manchas grandes de humedad/tono y dunas medianas
      const big = fbm(noise, u * 3, v * 3, 3, 3);
      const mid = fbm(noise, u * 8 + 17, v * 8 + 5, 8, 3);
      // surcos del rastrillo: ondulan y se interrumpen con el ruido
      const wob = (fbm(noise, u * 4 + 40, v * 4, 4, 2) - 0.5) * 0.9 + Math.sin(u * Math.PI * 2 * 2) * 0.12;
      const ph = (v * RAKE + wob) * Math.PI * 2;
      const fade = Math.min(1, Math.max(0, (fbm(noise, u * 2 + 9, v * 2 + 31, 2, 2) - 0.25) * 2.5));
      // perfil del surco: cresta redondeada y valle más estrecho
      const rake = (1 - Math.abs(Math.sin(ph))) ** 0.7 * fade;
      // grano fino: ruido de alta frecuencia (unos 2-3 píxeles por grano)
      const grain = noise(u * 96 * k, v * 96 * k, 96 * k);
      const fine = noise(u * 40 + 3, v * 40 + 7, 40);
      h[i] = big * 0.2 + mid * 0.15 + rake * 0.5 + grain * 0.05 + fine * 0.06;
      // color: mezcla de tonos según las manchas, sombra en el fondo del surco
      const tw = Math.min(1, Math.max(0, (big - 0.35) * 2.2));
      const tp = Math.min(1, Math.max(0, (mid - 0.55) * 3));
      const shade = 0.84 + rake * 0.2 + (grain - 0.5) * 0.06 + (fine - 0.5) * 0.08;
      for (let c = 0; c < 3; c++) {
        const tone = base[c] + (warm[c] - base[c]) * tw + (pale[c] - base[c]) * tp * 0.6;
        col[i * 3 + c] = tone * shade;
      }
      // el fondo del surco (más compacto) es algo más liso
      rough[i] = 235 - rake * 30 + grain * 20;
    }
  }
  // granos sueltos de distintos minerales y alguna piedrecita, con borde periódico
  const grains = [
    { c: [255, 250, 236], a: 0.75, w: 0.55 }, // cuarzo
    { c: [214, 160, 128], a: 0.55, w: 0.2 }, // feldespato rosado
    { c: [120, 96, 70], a: 0.55, w: 0.15 }, // grano oscuro
    { c: [70, 62, 56], a: 0.6, w: 0.1 }, // mineral negro
  ];
  const put = (x, y, c, a, lift) => {
    const xi = ((Math.round(x) % n) + n) % n, yi = ((Math.round(y) % n) + n) % n;
    const i = yi * n + xi;
    for (let j = 0; j < 3; j++) col[i * 3 + j] += (c[j] - col[i * 3 + j]) * a;
    h[i] += lift;
    rough[i] = 200;
  };
  for (let i = 0; i < 2400 * k * k; i++) {
    let pick = r(), g = grains[0];
    for (const gr of grains) if ((pick -= gr.w) <= 0) { g = gr; break; }
    const x = r() * n, y = r() * n, a = g.a * (0.3 + r() * 0.4);
    put(x, y, g.c, a, 0.04);
    if (k >= 2 && r() > 0.5) put(x + 1, y, g.c, a * 0.6, 0.05);
  }
  // piedrecitas: óvalos con sombra abajo y brillo arriba
  for (let i = 0; i < 8 * k; i++) {
    const cx = r() * n, cy = r() * n, rx = (1.2 + r() * 1.8) * k, ry = rx * (0.6 + r() * 0.35);
    const tint = 175 + r() * 50;
    for (let dy = -Math.ceil(ry) - 1; dy <= Math.ceil(ry) + 1; dy++) {
      for (let dx = -Math.ceil(rx) - 1; dx <= Math.ceil(rx) + 1; dx++) {
        const d = (dx / rx) ** 2 + (dy / ry) ** 2;
        if (d > 1.6) continue;
        if (d > 1) {
          // sombra de contacto
          if (dy > 0) put(cx + dx, cy + dy, [120, 95, 60], 0.3 * (1.6 - d), 0);
          continue;
        }
        const light = 1 - dy / ry * 0.35;
        put(cx + dx, cy + dy, [tint * light, tint * 0.93 * light, tint * 0.85 * light], 0.9, 0.25 * (1 - d));
      }
    }
  }
  // volcado a canvas
  const mk = (fill) => {
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    fill(img.data);
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  const map = mk((d) => {
    for (let i = 0; i < n * n; i++) {
      d[i * 4] = col[i * 3];
      d[i * 4 + 1] = col[i * 3 + 1];
      d[i * 4 + 2] = col[i * 3 + 2];
      d[i * 4 + 3] = 255;
    }
  });
  map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = mk((d) => {
    for (let i = 0; i < n * n; i++) {
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = rough[i];
      d[i * 4 + 3] = 255;
    }
  });
  const normalMap = normalMapFromHeight(h, n, 3);
  // las tres texturas comparten repetición y desplazamiento
  normalMap.repeat = roughnessMap.repeat = map.repeat;
  normalMap.offset = roughnessMap.offset = map.offset;
  return { map, normalMap, roughnessMap };
}

export function dirtMaps(neon = false, rock = false) {
  return withNormals(dirtTexture(neon, rock), 3);
}

/**
 * Lateral de la maqueta: labio de césped arriba y capas de tierra, grava y
 * roca debajo, como un corte de terreno.
 */
export function dirtTexture(neon = false, rock = false) {
  return canvasTexture(detailSize(128), (g, n) => {
    const k = n / 128;
    const layers = neon
      ? ['#2a1d48', '#22173d', '#1b1232', '#140d27']
      : rock
        ? ['#3a2c2a', '#2a2022', '#4a2a1e', '#1e1618']
        : ['#8a5a34', '#74492a', '#9a7a5a', '#6a6460'];
    const r = rand(5);
    // capas con el borde ondulado
    let y0 = 0;
    layers.forEach((col, li) => {
      const h = li === 0 ? n * 0.3 : n * 0.24;
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, n);
      for (let x = 0; x <= n; x += 4 * k) g.lineTo(x, y0 + Math.sin(x * 0.07 / k + li * 2) * 3 * k);
      g.lineTo(n, n);
      g.fill();
      y0 += h;
    });
    // piedras y grumos
    for (let i = 0; i < 140 * k; i++) {
      const y = r() * n;
      const deep = y / n;
      g.fillStyle = neon ? `rgba(${r() > 0.5 ? '120,80,200' : '10,5,20'},0.35)` : `rgba(${r() > 0.5 ? '50,30,18' : deep > 0.5 ? '190,180,170' : '175,135,95'},0.5)`;
      g.beginPath();
      g.ellipse(r() * n, y, (1.5 + r() * (2 + deep * 6)) * k, (1.2 + r() * 2.5) * k, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // roca volcánica: sin césped, con vetas de magma
    if (rock) {
      for (let i = 0; i < 10; i++) {
        g.strokeStyle = 'rgba(255,100,25,0.5)';
        g.lineWidth = k;
        g.beginPath();
        let x = r() * n, y = n * (0.2 + r() * 0.8);
        g.moveTo(x, y);
        for (let s = 0; s < 5; s++) g.lineTo((x += (r() - 0.5) * 14 * k), (y += (r() - 0.3) * 10 * k));
        g.stroke();
      }
      return;
    }
    // labio de césped con flecos
    g.fillStyle = neon ? '#ff3df0' : '#4caf3f';
    g.fillRect(0, 0, n, 8 * k);
    for (let x = 0; x < n; x += 3 * k) g.fillRect(x, 8 * k, 2 * k, (2 + r() * 6) * k);
    g.fillStyle = neon ? 'rgba(255,255,255,0.4)' : 'rgba(200,255,150,0.45)';
    g.fillRect(0, 0, n, 2 * k);
  });
}

export function ballTexture(color = '#ff4d4d') {
  return canvasTexture(
    256,
    (g, n) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, n, n);
      g.fillStyle = color;
      g.fillRect(0, n * 0.44, n, n * 0.12);
      g.fillStyle = 'rgba(0,0,0,0.06)';
      for (let y = 8; y < n; y += 14) for (let x = (y / 14) % 2 ? 7 : 0; x < n; x += 14) g.fillRect(x, y, 3, 3);
    },
    false,
  );
}

/** Oscuridad del fondo de un agujero: casi transparente arriba y negra abajo. */
export function abyssTexture() {
  return canvasTexture(64, (g, n) => {
    const grd = g.createLinearGradient(0, 0, 0, n);
    grd.addColorStop(0, 'rgba(0,0,0,0.35)');
    grd.addColorStop(0.25, 'rgba(0,0,0,0.9)');
    grd.addColorStop(0.5, 'rgba(0,0,0,1)');
    g.fillStyle = grd;
    g.fillRect(0, 0, n, n);
  }, false);
}

export function stripeTexture(a, b) {
  return canvasTexture(64, (g, n) => {
    g.fillStyle = a;
    g.fillRect(0, 0, n, n);
    g.fillStyle = b;
    for (let x = -n; x < n * 2; x += 16) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 8, 0);
      g.lineTo(x + 8 + n, n);
      g.lineTo(x + n, n);
      g.fill();
    }
  });
}

export function softDotTexture() {
  return canvasTexture(
    64,
    (g, n) => {
      const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, n, n);
    },
    false,
  );
}

export function chevronTexture(bg = '#1d3b8f', fg = '#5fd0ff') {
  return canvasTexture(128, (g, n) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, n, n);
    g.fillStyle = fg;
    g.lineJoin = 'round';
    for (let y = -n / 2; y < n * 1.5; y += n / 2) {
      g.beginPath();
      g.moveTo(n * 0.15, y + n * 0.35);
      g.lineTo(n * 0.5, y + n * 0.08);
      g.lineTo(n * 0.85, y + n * 0.35);
      g.lineTo(n * 0.85, y + n * 0.5);
      g.lineTo(n * 0.5, y + n * 0.23);
      g.lineTo(n * 0.15, y + n * 0.5);
      g.closePath();
      g.fill();
    }
  });
}

/** Flechas blancas semitransparentes que marcan hacia dónde cae una pendiente. */
export function slopeArrowTexture() {
  const tex = canvasTexture(128, (g, n) => {
    g.clearRect(0, 0, n, n);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.moveTo(n * 0.3, n * 0.62);
    g.lineTo(n * 0.5, n * 0.42);
    g.lineTo(n * 0.7, n * 0.62);
    g.lineTo(n * 0.7, n * 0.72);
    g.lineTo(n * 0.5, n * 0.52);
    g.lineTo(n * 0.3, n * 0.72);
    g.closePath();
    g.fill();
  });
  return tex;
}

/** Degradado de luz a sombra para que la pendiente parezca una cuesta. */
export function slopeShadeTexture() {
  const tex = canvasTexture(64, (g, n) => {
    const grad = g.createLinearGradient(0, 0, 0, n);
    grad.addColorStop(0, 'rgba(0,0,0,0.4)');
    grad.addColorStop(1, 'rgba(255,255,230,0.3)');
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
  }, false);
  return tex;
}

export function crateTexture() {
  return canvasTexture(128, (g, n) => {
    g.fillStyle = '#ffcc33';
    g.fillRect(0, 0, n, n);
    g.fillStyle = '#2b2b2b';
    for (let x = -n; x < n * 2; x += 32) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 16, 0);
      g.lineTo(x + 16 + n, n);
      g.lineTo(x + n, n);
      g.fill();
    }
    g.strokeStyle = '#2b2b2b';
    g.lineWidth = 8;
    g.strokeRect(4, 4, n - 8, n - 8);
  });
}

export function labelTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px system-ui, sans-serif';
  const w = Math.min(240, g.measureText(text).width + 36);
  g.fillStyle = 'rgba(10,30,22,0.75)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 8, w, 48, 24);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc((256 - w) / 2 + 22, 32, 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128 + 8, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Atlas de sprites para los efectos de skin: 4x2 celdas de 64 px en un lienzo
// de 256x128. Una única textura compartida con cuenta de referencias, para que
// `dispose()` de cada SkinFX deje la memoria como estaba.
export const SKIN_SPRITES = { spark: 0, ember: 1, shard: 2, flake: 3, coin: 4, glyph: 5, soft: 6, streak: 7 };
export const SKIN_ATLAS_COLS = 4;
export const SKIN_ATLAS_ROWS = 2;

function drawSprite(g, cell, ox, oy) {
  const c = 32;
  g.save();
  g.translate(ox + c, oy + c);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  const glow = (r, a = 1) => {
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grd.addColorStop(0, `rgba(255,255,255,${a})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(-r, -r, r * 2, r * 2);
  };
  if (cell === SKIN_SPRITES.spark) {
    glow(14, 0.9);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(0, -30); g.lineTo(3, -3); g.lineTo(30, 0); g.lineTo(3, 3);
    g.lineTo(0, 30); g.lineTo(-3, 3); g.lineTo(-30, 0); g.lineTo(-3, -3);
    g.closePath();
    g.fill();
  } else if (cell === SKIN_SPRITES.ember) {
    glow(24, 0.75);
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(0, 0, 7, 0, Math.PI * 2);
    g.fill();
  } else if (cell === SKIN_SPRITES.shard) {
    g.beginPath();
    g.moveTo(0, -28); g.lineTo(10, 4); g.lineTo(2, 26); g.lineTo(-9, 6);
    g.closePath();
    g.fill();
    g.globalAlpha = 0.5;
    g.fillStyle = '#000';
    g.beginPath();
    g.moveTo(0, -28); g.lineTo(2, 26); g.lineTo(-9, 6);
    g.closePath();
    g.fill();
  } else if (cell === SKIN_SPRITES.flake) {
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      g.rotate(Math.PI / 3);
      g.beginPath();
      g.moveTo(0, -26); g.lineTo(0, 26);
      g.moveTo(-7, -17); g.lineTo(0, -10); g.lineTo(7, -17);
      g.moveTo(-7, 17); g.lineTo(0, 10); g.lineTo(7, 17);
      g.stroke();
    }
  } else if (cell === SKIN_SPRITES.coin) {
    g.beginPath();
    g.ellipse(0, 0, 22, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 14, 0, Math.PI * 2);
    g.stroke();
    g.fillRect(-2, -8, 4, 16);
  } else if (cell === SKIN_SPRITES.glyph) {
    g.lineWidth = 5;
    g.beginPath();
    g.arc(0, 0, 22, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-10, 0); g.lineTo(10, 0); g.moveTo(0, -10); g.lineTo(0, 10);
    g.stroke();
  } else if (cell === SKIN_SPRITES.soft) {
    glow(30, 1);
  } else {
    const grd = g.createLinearGradient(-30, 0, 30, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(0, 0, 30, 5, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

let atlas = null;
let atlasRefs = 0;

/** Adquiere el atlas compartido; devuélvelo con `releaseSkinSpriteAtlas()`. */
export function skinSpriteAtlas() {
  if (!atlas) {
    const c = document.createElement('canvas');
    c.width = 64 * SKIN_ATLAS_COLS;
    c.height = 64 * SKIN_ATLAS_ROWS;
    const g = c.getContext('2d');
    for (let i = 0; i < SKIN_ATLAS_COLS * SKIN_ATLAS_ROWS; i++) drawSprite(g, i, (i % SKIN_ATLAS_COLS) * 64, Math.floor(i / SKIN_ATLAS_COLS) * 64);
    atlas = new THREE.CanvasTexture(c);
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.generateMipmaps = false;
    atlas.minFilter = THREE.LinearFilter;
  }
  atlasRefs++;
  return atlas;
}

export function releaseSkinSpriteAtlas() {
  if (!atlas || --atlasRefs > 0) return;
  atlas.dispose();
  atlas = null;
  atlasRefs = 0;
}
