import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The path the app is served from: root for a local preview and for Cloudflare Pages, a repository
// subpath for GitHub Pages. Taken from the environment rather than inferred from CI, because more
// than one target can build from Actions and inference gets the second one wrong.
const base = process.env.PUBLIC_BASE_PATH ?? '/';

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@match/core': new URL('../../packages/core/src', import.meta.url).pathname,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Match — days together',
        short_name: 'Match',
        description: 'Reads two crew rosters and finds the days you can actually be together.',
        display: 'standalone',
        start_url: base,
        scope: base,
        theme_color: '#2b1a2f',
        background_color: '#fdf7f7',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,mjs}'],
        // Must be the precached entry for this base, or Workbox throws non-precached-url while the
        // service worker is evaluating and offline never starts.
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  test: {
    name: 'web',
    environment: 'jsdom',
    globals: true,
    setupFiles: new URL('./src/test/setup.ts', import.meta.url).pathname,
  },
});
