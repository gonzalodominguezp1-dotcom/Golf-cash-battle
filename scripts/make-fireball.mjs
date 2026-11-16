// Genera la bola de fuego de la pantalla de carga (2 fotogramas con alfa) y su boceto de vista previa.
//
// Uso (desde la raíz del proyecto):  pnpm fireball:make
// Requiere Node >=22 y Chrome/Edge (o CHROME_PATH).
//
// Escribe public/splash/fireball-a.webp y fireball-b.webp (360x200, alfa, <=22 KB cada uno)
// y 02-DOCS/attachments/ui-pantallas/bola-fuego-boceto.png.
// Los dos fotogramas de la bola se alternan en la carga con un fundido lento (ciclo >= 0,5 s, sin parpadeo).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasAlpha, withChrome } from './lib/headless-chrome.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const splashDir = resolve(root, 'public/splash');
const docsDir = resolve(root, '02-DOCS/attachments/ui-pantallas');
const W = 360, H = 200;
const BALL = { cx: 276, cy: 100, r: 44 }; // 44 px de radio a 2x = 44 px de diámetro en CSS (el doble que la bola anterior de 22 px)
const MAX_FIRE = 22 * 1024;

// ---------- Bola de fuego (SVG) ----------
// frame 0/1: misma forma con otra semilla de turbulencia, lenguas y brasas distintas.
function fireballSvg(frame) {
  const seed = frame === 0 ? 7 : 19;
  const flip = frame === 0 ? 1 : -1;
  const tongues = (frame === 0
    ? [[212, 62, -28, 1.0], [168, 74, -22, 0.8], [226, 138, 24, 0.9], [150, 126, 20, 0.7]]
    : [[198, 58, -24, 0.9], [150, 80, -18, 0.75], [214, 142, 28, 1.0], [160, 120, 16, 0.8]])
    .map(([x, y, rot, s]) => `<g transform="translate(${x} ${y}) rotate(${rot + 180}) scale(${s * 1.2})"><path d="M0 0 C 14 -10, 36 -9, 60 0 C 36 9, 14 10, 0 0 Z" fill="url(#tongue)"/></g>`).join('');
  const embers = (frame === 0
    ? [[120, 52, 3.4], [84, 140, 2.6], [176, 36, 2.2], [58, 100, 2.8], [150, 160, 3], [32, 70, 1.8], [96, 70, 2]]
    : [[132, 40, 3], [70, 128, 3.2], [188, 164, 2.4], [44, 90, 2.4], [160, 46, 2], [24, 118, 1.8], [110, 150, 2.2]])
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffd36b" filter="url(#glow)"/>`).join('');
  // hoyuelos de la bola (rejilla escalonada)
  const dimples = [];
  for (let row = -4; row <= 4; row++) {
    for (let col = -4; col <= 4; col++) {
      const x = BALL.cx + col * 11 + (row % 2 ? 5.5 : 0), y = BALL.cy + row * 10;
      if ((x - BALL.cx) ** 2 + (y - BALL.cy) ** 2 < (BALL.r - 4) ** 2) dimples.push(`<circle cx="${x}" cy="${y}" r="3.1"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="aura" cx="${BALL.cx}" cy="${BALL.cy}" r="105" gradientUnits="userSpaceOnUse">
      <stop offset="0.35" stop-color="#ff8a1f" stop-opacity="0.6"/>
      <stop offset="0.7" stop-color="#ff4d00" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#ff4d00" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fOuter" x1="10" y1="0" x2="${BALL.cx}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#b3120a" stop-opacity="0"/>
      <stop offset="0.35" stop-color="#e8260a" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#ff5a0a"/>
    </linearGradient>
    <linearGradient id="fMid" x1="40" y1="0" x2="${BALL.cx}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ff7a10" stop-opacity="0"/>
      <stop offset="0.4" stop-color="#ff8a1a" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#ffb02e"/>
    </linearGradient>
    <linearGradient id="fInner" x1="110" y1="0" x2="${BALL.cx}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffd35a" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#ffd86a" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#fff2b8"/>
    </linearGradient>
    <linearGradient id="tongue" x1="0" y1="0" x2="60" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffb02e"/>
      <stop offset="1" stop-color="#e8260a" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="ballBody" cx="0.36" cy="0.3" r="0.85">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.45" stop-color="#fbf4e8"/>
      <stop offset="0.85" stop-color="#d6cdbf"/>
      <stop offset="1" stop-color="#a69a8a"/>
    </radialGradient>
    <radialGradient id="ballHot" cx="0" cy="0.58" r="0.95">
      <stop offset="0" stop-color="#ff7a10" stop-opacity="0.9"/>
      <stop offset="0.5" stop-color="#ff9a2e" stop-opacity="0.3"/>
      <stop offset="1" stop-color="#ff9a2e" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="ballClip"><circle cx="${BALL.cx}" cy="${BALL.cy}" r="${BALL.r}"/></clipPath>
    <filter id="rough" x="-10%" y="-30%" width="120%" height="160%">
      <feTurbulence type="fractalNoise" baseFrequency="0.018 0.045" numOctaves="2" seed="${seed}" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G"/>
      <feGaussianBlur stdDeviation="1.1"/>
    </filter>
    <filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="1.6"/></filter>
    <filter id="soft"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>

  <circle cx="${BALL.cx}" cy="${BALL.cy}" r="105" fill="url(#aura)"/>

  <!-- Estela: tres capas de llama con el borde irregular -->
  <g filter="url(#rough)">
    <path d="M ${BALL.cx - 6} ${BALL.cy - 42} C 214 ${BALL.cy - 56}, 150 ${BALL.cy - 42}, 84 ${BALL.cy - 20} C 52 ${BALL.cy - 9}, 26 ${BALL.cy - 2}, 6 ${BALL.cy + flip * 2} C 28 ${BALL.cy + 8}, 54 ${BALL.cy + 14}, 84 ${BALL.cy + 24} C 150 ${BALL.cy + 46}, 214 ${BALL.cy + 58}, ${BALL.cx - 6} ${BALL.cy + 42} Z" fill="url(#fOuter)"/>
    <path d="M ${BALL.cx - 6} ${BALL.cy - 32} C 220 ${BALL.cy - 42}, 170 ${BALL.cy - 30}, 112 ${BALL.cy - 13} C 80 ${BALL.cy - 5}, 56 ${BALL.cy}, 40 ${BALL.cy + flip} C 58 ${BALL.cy + 5}, 82 ${BALL.cy + 10}, 112 ${BALL.cy + 17} C 170 ${BALL.cy + 34}, 220 ${BALL.cy + 42}, ${BALL.cx - 6} ${BALL.cy + 32} Z" fill="url(#fMid)"/>
    <path d="M ${BALL.cx - 6} ${BALL.cy - 20} C 236 ${BALL.cy - 26}, 196 ${BALL.cy - 18}, 150 ${BALL.cy - 7} C 130 ${BALL.cy - 3}, 116 ${BALL.cy}, 106 ${BALL.cy} C 118 ${BALL.cy + 2}, 134 ${BALL.cy + 5}, 150 ${BALL.cy + 9} C 196 ${BALL.cy + 20}, 236 ${BALL.cy + 26}, ${BALL.cx - 6} ${BALL.cy + 20} Z" fill="url(#fInner)"/>
  </g>
  <g filter="url(#rough)" opacity="0.95">${tongues}</g>
  ${embers}

  <!-- Bola -->
  <circle cx="${BALL.cx}" cy="${BALL.cy + 3}" r="${BALL.r + 1}" fill="#5a1d00" opacity="0.35" filter="url(#soft)"/>
  <circle cx="${BALL.cx}" cy="${BALL.cy}" r="${BALL.r}" fill="url(#ballBody)"/>
  <g clip-path="url(#ballClip)">
    <g fill="#8a7a66" opacity="0.2">${dimples.join('')}</g>
    <g fill="#fff" opacity="0.55" transform="translate(-1.4 -1.4)">${dimples.join('')}</g>
    <circle cx="${BALL.cx}" cy="${BALL.cy}" r="${BALL.r}" fill="url(#ballHot)" opacity="0.5"/>
    <ellipse cx="${BALL.cx - 12}" cy="${BALL.cy - 16}" rx="13" ry="8" fill="#fff" opacity="0.8" transform="rotate(-28 ${BALL.cx - 12} ${BALL.cy - 16})" filter="url(#soft)"/>
  </g>
  <circle cx="${BALL.cx}" cy="${BALL.cy}" r="${BALL.r - 0.75}" fill="none" stroke="#7a3300" stroke-opacity="0.55" stroke-width="1.5"/>
</svg>`;
}

async function main() {
  await mkdir(splashDir, { recursive: true });
  await mkdir(docsDir, { recursive: true });

  await withChrome(async ({ render }) => {
    const out = {};
    // 1) Bola de fuego: dos fotogramas, la mejor calidad que quepa en el límite.
    for (const [i, name] of ['fireball-a.webp', 'fireball-b.webp'].entries()) {
      const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:transparent;overflow:hidden"><div style="display:block;width:${W}px;height:${H}px;overflow:hidden">${fireballSvg(i)}</div></body></html>`;
      let done = null;
      for (const q of [90, 85, 80, 75, 70, 62, 55, 48]) {
        const buf = await render(html, { width: W, height: H, transparent: true, format: 'webp', quality: q });
        if (buf.length <= MAX_FIRE) { done = { buf, q }; break; }
      }
      if (!done) throw new Error(`${name} no cabe en ${MAX_FIRE} B`);
      if (!hasAlpha(done.buf)) throw new Error(`${name} sin canal alfa`);
      await writeFile(resolve(splashDir, name), done.buf);
      out[i] = done.buf;
      console.log(`${name}  ${(done.buf.length / 1024).toFixed(1)} KB (calidad ${done.q})`);
    }

    // 2) Boceto de la bola: ambos fotogramas sobre verde y sobre oscuro, a tamaño real (180x100) y ampliado.
    const fa = `data:image/webp;base64,${out[0].toString('base64')}`;
    const fb = `data:image/webp;base64,${out[1].toString('base64')}`;
    const cell = (bg, label, big) => `<div style="background:${bg};padding:16px;border-radius:10px;display:flex;flex-direction:column;gap:10px;align-items:flex-start;overflow:hidden">
      <div style="font:12px sans-serif;color:#fff;opacity:.85">${label}</div>
      <div style="display:flex;gap:${big ? 10 : 24}px"><img src="${fa}" style="width:${big ? 360 : 180}px"><img src="${fb}" style="width:${big ? 360 : 180}px"></div></div>`;
    const ballPage = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#0b0f15;padding:20px;width:max-content;overflow:hidden">
      <div style="font:600 16px sans-serif;color:#f5c542;margin-bottom:12px">Bola de fuego · fotograma A (izq.) y B (der.) — se alternan con un fundido lento</div>
      <div style="display:grid;grid-template-columns:auto auto;gap:14px">
        ${cell('#8fcf63', 'tamaño real (CSS 180×100, bola de 44 px) sobre el green', false)}
        ${cell('#1b2a3a', 'tamaño real sobre fondo oscuro', false)}
        ${cell('#8fcf63', 'ampliada ×2', true)}
        ${cell('#1b2a3a', 'ampliada ×2 sobre fondo oscuro', true)}
      </div></body></html>`;
    const ballShot = await render(ballPage, { width: 1620, height: 700, format: 'png' });
    await writeFile(resolve(docsDir, 'bola-fuego-boceto.png'), ballShot);
    console.log(`bola-fuego-boceto.png  ${(ballShot.length / 1024).toFixed(1)} KB`);

  });
}

main().then(() => process.exit(0), (err) => { console.error(err.message ?? err); process.exit(1); });
