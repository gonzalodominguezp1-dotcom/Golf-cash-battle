import * as THREE from 'three';

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

export function grassTexture([a, b]) {
  return canvasTexture(256, (g, n) => {
    // dos franjas de corte por tesela + motas de hierba
    g.fillStyle = a;
    g.fillRect(0, 0, n, n / 2);
    g.fillStyle = b;
    g.fillRect(0, n / 2, n, n / 2);
    const r = rand(7);
    for (let i = 0; i < 2600; i++) {
      const l = 0.82 + r() * 0.36;
      g.fillStyle = `rgba(${l > 1 ? 255 : 0},${l > 1 ? 255 : 40},0,${Math.abs(l - 1) * 0.35})`;
      g.fillRect(r() * n, r() * n, 1.5, 3);
    }
  });
}

export function woodTexture() {
  return canvasTexture(128, (g, n) => {
    g.fillStyle = '#c98a4b';
    g.fillRect(0, 0, n, n);
    const r = rand(3);
    for (let y = 0; y < n; y += 2) {
      g.fillStyle = `rgba(90,45,10,${0.05 + r() * 0.12})`;
      g.fillRect(0, y, n, 1);
    }
    g.fillStyle = 'rgba(70,35,10,0.55)';
    g.fillRect(0, 0, n, 3);
    g.fillRect(0, n / 2, n, 3);
    g.fillRect(n * 0.3, 0, 3, n / 2);
    g.fillRect(n * 0.8, n / 2, 3, n / 2);
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.fillStyle = 'rgba(80,40,10,0.35)';
      g.ellipse(r() * n, r() * n, 4, 2, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function sandTexture() {
  return canvasTexture(128, (g, n) => {
    g.fillStyle = '#efd28f';
    g.fillRect(0, 0, n, n);
    const r = rand(11);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(150,110,40,0.25)';
      g.fillRect(r() * n, r() * n, 1.2, 1.2);
    }
    g.strokeStyle = 'rgba(170,130,60,0.25)';
    for (let y = 6; y < n; y += 10) {
      g.beginPath();
      for (let x = 0; x <= n; x += 8) g.lineTo(x, y + Math.sin(x * 0.1) * 2);
      g.stroke();
    }
  }, false);
}

export function dirtTexture() {
  return canvasTexture(128, (g, n) => {
    g.fillStyle = '#8a5a34';
    g.fillRect(0, 0, n, n);
    const r = rand(5);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? '60,35,20' : '170,130,90'},0.5)`;
      g.beginPath();
      g.ellipse(r() * n, r() * n, 2 + r() * 6, 1.5 + r() * 3, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#4caf3f';
    g.fillRect(0, 0, n, 10);
    for (let x = 0; x < n; x += 4) g.fillRect(x, 10, 3, 3 + r() * 6);
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

export function chevronTexture() {
  return canvasTexture(128, (g, n) => {
    g.fillStyle = '#1d3b8f';
    g.fillRect(0, 0, n, n);
    g.fillStyle = '#5fd0ff';
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
