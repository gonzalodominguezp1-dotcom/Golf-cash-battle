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

// Builds para portales de juegos (CrazyGames, Poki...): `vite build --mode crazygames`
// lee .env.crazygames (VITE_PORTAL, VITE_BACKEND=local). Rutas relativas (el portal
// sirve el juego desde su CDN dentro de un iframe) y sin panel de administración.
const PORTAL_MODES = ['crazygames', 'poki'];

// Dos páginas: el juego (index.html) y el panel de administración (admin.html).
export default defineConfig(({ mode }) => {
  if (PORTAL_MODES.includes(mode)) {
    return {
      base: './',
      plugins: [siteUrlPlugin],
      build: {
        outDir: `dist-${mode}`,
        emptyOutDir: true,
        rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html') } },
      },
    };
  }
  return {
    plugins: [siteUrlPlugin],
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
