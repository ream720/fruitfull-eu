// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import mdx from '@astrojs/mdx';

import vercel from '@astrojs/vercel';

import sitemap from '@astrojs/sitemap';
import robotsTxt from 'astro-robots-txt';

const site = process.env.SITE_URL || 'https://fruitfullseeds.eu.com';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  site,

  vite: {
    plugins: [tailwindcss()],
    build: {
      sourcemap: false,
    },
  },

  integrations: [
    mdx(),
    sitemap(),
    robotsTxt(),
  ],
  adapter: vercel({
    imageService: true,
    imagesConfig: {
      sizes: [320, 640, 960, 1280, 1920],
    },
  })
});
