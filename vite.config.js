import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// URL pública para las etiquetas Open Graph (WhatsApp, Telegram, X... necesitan
// la imagen con URL absoluta). En Vercel se toma del dominio de producción;
// SITE_URL permite forzarla (p. ej. con un dominio propio).
const siteUrl = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  'https://golf-cash-battle.vercel.app'
).replace(/\/$/, '');

const siteUrlPlugin = {
  name: 'site-url',
  // 'pre': antes de que Vite procese el HTML (si no, '%SI' en un href da "URI malformed").
  transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%SITE_URL%', siteUrl) },
};

// Id de build: el commit de Vercel si existe; si no, una marca de tiempo (cada build cambia).
const buildId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || Date.now().toString(36);
const pkgVersion = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')).version;

// Publica dist/version.json para que la página detecte una build nueva (ver src/ui/versionCheck.js).
const versionJsonPlugin = {
  name: 'version-json',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: `${JSON.stringify({ version: pkgVersion, build: buildId })}\n`,
    });
  },
};

// Builds para portales de juegos (CrazyGames, Poki...): `vite build --mode crazygames`
// lee .env.crazygames (VITE_PORTAL, VITE_BACKEND=local). Rutas relativas (el portal
// sirve el juego desde su CDN dentro de un iframe) y sin panel de administración.
const PORTAL_MODES = ['crazygames', 'poki'];

// Dos páginas: el juego (index.html) y el panel de administración (admin.html).
export default defineConfig(({ mode }) => {
  const define = { __APP_BUILD__: JSON.stringify(buildId) };
  if (PORTAL_MODES.includes(mode)) {
    return {
      base: './',
      // en portales el juego se llama GolfitoBattle (sin dinero, "Cash" confundiría)
      plugins: [siteUrlPlugin, versionJsonPlugin, {
        name: 'portal-brand',
        // nombre y logo de portal (GolfitoBattle, sin billetes) y sin el enlace canónico a la web propia
        transformIndexHtml: (html) => html
          .replaceAll('Golf Cash Battle', 'GolfitoBattle')
          .replaceAll('/logo-header.png', '/logo-golfito-header.png')
          .replace(/\s*<link rel="canonical"[^>]*>/, ''),
      }],
      define,
      build: {
        outDir: `dist-${mode}`,
        emptyOutDir: true,
        rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html') } },
      },
    };
  }
  return {
    plugins: [siteUrlPlugin, versionJsonPlugin],
    define,
    build: {
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          admin: resolve(import.meta.dirname, 'admin.html'),
        },
      },
    },
  };
});
