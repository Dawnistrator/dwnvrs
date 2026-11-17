// @ts-check
import { defineConfig } from 'astro/config';

import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Pages render on demand so projects edited in /admin show up without a rebuild.
  output: 'server',
  adapter: vercel(),
  security: {
    // Rejects cross-site form POSTs to pages and actions.
    checkOrigin: true,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
