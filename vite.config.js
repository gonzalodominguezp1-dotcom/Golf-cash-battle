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

// Dos páginas: el juego (index.html) y el panel de administración (admin.html).
export default defineConfig({
  plugins: [siteUrlPlugin],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
      },
    },
  },
});
