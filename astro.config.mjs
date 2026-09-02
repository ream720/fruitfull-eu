// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import mdx from '@astrojs/mdx';

import vercel from '@astrojs/vercel';

import sitemap from '@astrojs/sitemap';
import robotsTxt from 'astro-robots-txt';
import { readdirSync } from 'node:fs';

const site = process.env.SITE_URL || 'https://fruitfullseeds.com';
const base = '/eu';
const geneticsPages = readdirSync(new URL('./src/content/genetics', import.meta.url))
  .filter((file) => file.endsWith('.mdx'))
  .map((file) => new URL(`${base}/genetics/${file.replace(/\.mdx$/, '')}`, site).href);

// https://astro.build/config
export default defineConfig({
  output: 'server',
  site,
  base,

  vite: {
    plugins: [tailwindcss()],
    build: {
      sourcemap: false,
    },
  },

  integrations: [
    mdx(),
    sitemap({
      customPages: geneticsPages,
      filter: (page) => !page.includes(`${base}/admin/`) && !page.includes(`${base}/auth/`),
    }),
    robotsTxt(),
  ],
  adapter: vercel({
    imageService: true,
    imagesConfig: {
      sizes: [320, 640, 960, 1280, 1920],
    },
  })
});
