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
  t.wrapS = tex.wrapS;
  t.wrapT = tex.wrapT;
  t.anisotropy = 4;
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

export function sandMaps() {
  return withNormals(sandTexture(), 2);
}

export function sandTexture() {
  return canvasTexture(detailSize(128), (g, n) => {
    const k = n / 128;
    g.fillStyle = '#efd28f';
    g.fillRect(0, 0, n, n);
    const r = rand(11);
    // ondas de rastrillo
    for (let y = 4 * k; y < n; y += 9 * k) {
      g.strokeStyle = 'rgba(170,130,60,0.28)';
      g.lineWidth = 2 * k;
      g.beginPath();
      for (let x = 0; x <= n; x += 4 * k) g.lineTo(x, y + Math.sin(x * 0.09 / k) * 2 * k);
      g.stroke();
      g.strokeStyle = 'rgba(255,245,215,0.35)';
      g.lineWidth = k;
      g.beginPath();
      for (let x = 0; x <= n; x += 4 * k) g.lineTo(x, y - 2 * k + Math.sin(x * 0.09 / k) * 2 * k);
      g.stroke();
    }
    // granos
    for (let i = 0; i < 2600 * k * k; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.4)' : 'rgba(150,110,40,0.3)';
      g.fillRect(r() * n, r() * n, 1.2 * k, 1.2 * k);
    }
  }, false);
}

export function dirtMaps(neon = false) {
  return withNormals(dirtTexture(neon), 3);
}

/**
 * Lateral de la maqueta: labio de césped arriba y capas de tierra, grava y
 * roca debajo, como un corte de terreno.
 */
export function dirtTexture(neon = false) {
  return canvasTexture(detailSize(128), (g, n) => {
    const k = n / 128;
    const layers = neon
      ? ['#2a1d48', '#22173d', '#1b1232', '#140d27']
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

/** Oscuridad del fondo de un agujero: transparente arriba y negra abajo (v = 0). */
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

/** Remolino del portal. */
export function swirlTexture(color) {
  return canvasTexture(128, (g, n) => {
    const c = n / 2;
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 5;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const t = i / 40, a = k * (Math.PI / 2) + t * 4, r = t * c * 0.95;
        const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
  }, false);
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
