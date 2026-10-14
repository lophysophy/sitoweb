// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import fs from 'node:fs';
import path from 'node:path';

// Checks the artwork folders before the build starts, so a problem name stops
// the build with a clear message instead of a cryptic import error.
function checkWorkFolder() {
  return {
    name: 'check-work-folder',
    hooks: {
      'astro:config:setup': () => {
        const root = path.resolve('src/work');
        const problems = [];
        const walk = (dir) => {
          const seen = new Map();
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const rel = path.relative(root, path.join(dir, e.name));
            // "?" would be read as part of a web address by the bundler.
            if (e.name.includes('?')) problems.push(`"${rel}" contains "?": remove it from the name`);
            // The same name typed on a Mac and elsewhere can differ invisibly
            // (accents stored two ways); two such entries would collide.
            const key = e.name.normalize('NFC').toLowerCase();
            if (seen.has(key)) problems.push(`"${rel}" and "${seen.get(key)}" have the same name`);
            seen.set(key, rel);
            if (e.isDirectory()) walk(path.join(dir, e.name));
          }
        };
        if (fs.existsSync(root)) walk(root);
        if (problems.length) {
          throw new Error('Problems in src/work:\n  ' + problems.join('\n  '));
        }
      },
    },
  };
}

export default defineConfig({
  site: 'https://lophysophy.com',
  trailingSlash: 'ignore',
  integrations: [
    checkWorkFolder(),
    sitemap({ filter: (page) => !page.includes('/html/') && !page.endsWith('/404/') }),
  ],
  // Film stills are fetched from YouTube at build time and served locally.
  image: { domains: ['i.ytimg.com'] },
  build: { inlineStylesheets: 'auto' },
  vite: {
    // Video files are copied as-is; keep their URLs readable.
    build: { assetsInlineLimit: 0 },
  },
});
