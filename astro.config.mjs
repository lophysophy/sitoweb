// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://lophysophy.com',
  trailingSlash: 'ignore',
  integrations: [
    sitemap({ filter: (page) => !page.includes('/html/') && !page.endsWith('/404/') }),
  ],
  build: { inlineStylesheets: 'auto' },
  vite: {
    // Video files are copied as-is; keep their URLs readable.
    build: { assetsInlineLimit: 0 },
  },
});
