import * as THREE from 'three';

// Dibuja la textura de una skin (proyección esférica: x = longitud, y = latitud).
export function paintBall(g, n, skin) {
  const { base, accent, pattern } = skin;
  const w = n * 2, h = n;
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  g.fillStyle = accent;
  switch (pattern) {
    case 'stripe':
      g.fillRect(0, h * 0.42, w, h * 0.16);
      break;
    case 'dual':
      g.fillRect(0, h / 2, w, h / 2);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillRect(0, h * 0.48, w, h * 0.04);
      break;
    case 'dots':
      for (let y = h * 0.12; y < h; y += h / 6)
        for (let x = (y / (h / 6)) % 2 ? w / 24 : 0; x < w; x += w / 12) circle(g, x, y, h * 0.045);
      break;
    case 'stars':
      for (let i = 0; i < 18; i++) star(g, ((i * 0.37) % 1) * w, (0.15 + ((i * 0.61) % 0.7)) * h, h * 0.07);
      break;
    case 'gradient': {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, base);
      gr.addColorStop(1, accent);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      break;
    }
    case 'rainbow':
      for (let i = 0; i < 12; i++) {
        g.fillStyle = `hsl(${i * 30}, 95%, 62%)`;
        g.fillRect(0, (i * h) / 12, w, h / 12 + 1);
      }
      break;
    case 'flame':
      for (let k = 0; k < 3; k++) {
        g.fillStyle = k === 0 ? accent : k === 1 ? mix(accent, '#ffd000', 0.5) : '#fff1a0';
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w; x += 4) g.lineTo(x, h * (0.55 + k * 0.12) - Math.abs(Math.sin((x / w) * Math.PI * 10 + k)) * h * 0.22);
        g.lineTo(w, h);
        g.fill();
      }
      break;
    case 'galaxy':
      for (let i = 0; i < 6; i++) {
        const x = ((i * 0.29 + 0.1) % 1) * w, y = (0.25 + ((i * 0.43) % 0.5)) * h;
        const gr = g.createRadialGradient(x, y, 0, x, y, h * 0.35);
        gr.addColorStop(0, i % 2 ? accent + 'cc' : '#3fd0ffaa');
        gr.addColorStop(1, 'transparent');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }
      g.fillStyle = '#fff';
      for (let i = 0; i < 90; i++) g.fillRect(((i * 0.618) % 1) * w, ((i * 0.377) % 1) * h, 2, 2);
      break;
    case 'gem':
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 12; x++) {
          g.fillStyle = (x + y) % 2 ? accent : mix(base, accent, 0.35);
          g.globalAlpha = 0.55 + ((x * 7 + y * 3) % 5) * 0.09;
          g.beginPath();
          g.moveTo((x * w) / 12, (y * h) / 4);
          g.lineTo(((x + 1) * w) / 12, (y * h) / 4);
          g.lineTo(((x + 0.5) * w) / 12, ((y + 1) * h) / 4);
          g.fill();
        }
      g.globalAlpha = 1;
      break;
    default:
      break;
  }
  // hoyuelos
  g.fillStyle = 'rgba(0,0,0,0.07)';
  for (let y = 6; y < h; y += 12) for (let x = (y / 12) % 2 ? 6 : 0; x < w; x += 12) g.fillRect(x, y, 3, 3);
}

function circle(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.fill();
}

function mix(a, b, t) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

const cache = new Map();
function skinCanvas(skin) {
  if (!cache.has(skin.id)) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    paintBall(c.getContext('2d'), 256, skin);
    cache.set(skin.id, c);
  }
  return cache.get(skin.id);
}

/** Material 3D: cuanto más rara la skin, más brillo (metal, iridiscencia). */
export function skinMaterial(skin) {
  const map = new THREE.CanvasTexture(skinCanvas(skin));
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const r = skin.rarity;
  return new THREE.MeshPhysicalMaterial({
    map,
    roughness: r === 'bronze' ? 0.35 : r === 'silver' ? 0.25 : 0.15,
    metalness: r === 'gold' ? 0.45 : 0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    iridescence: r === 'diamond' || r === 'emerald' ? 1 : 0,
    iridescenceIOR: 1.6,
    emissive: r === 'emerald' ? new THREE.Color(skin.accent) : new THREE.Color(0),
    emissiveIntensity: r === 'emerald' ? 0.25 : 0,
  });
}

/** Imagen de la bola para la interfaz (esfera sombreada con la textura). */
export function ballPreview(skin, size = 160) {
  const key = `${skin.id}@${size}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  g.save();
  g.beginPath();
  g.arc(r, r, r * 0.96, 0, Math.PI * 2);
  g.clip();
  g.drawImage(skinCanvas(skin), 128, 0, 256, 256, 0, 0, size, size);
  const shade = g.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
  shade.addColorStop(0, 'rgba(255,255,255,0.55)');
  shade.addColorStop(0.35, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = shade;
  g.fillRect(0, 0, size, size);
  g.restore();
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
