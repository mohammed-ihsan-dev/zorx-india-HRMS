import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Build identity, different for every deploy: package version + commit
// (Vercel's VERCEL_GIT_COMMIT_SHA, else local git, else the build time).
// APP_BUILD_ID overrides it (used by the update integration test).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const builtAt = new Date().toISOString();
function commitId() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return builtAt.replace(/\D/g, '').slice(0, 12);
  }
}
const APP_BUILD = { version: pkg.version, build: process.env.APP_BUILD_ID || commitId(), builtAt };

/** Publishes /version.json — what "is there a newer deploy?" is checked against. */
function versionManifest() {
  return {
    name: 'zorx-version-manifest',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(APP_BUILD));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify(APP_BUILD)}\n` });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_BUILD.version),
    __APP_BUILD__: JSON.stringify(APP_BUILD.build),
  },
  plugins: [
    react(),
    versionManifest(),
    VitePWA({
      // 'prompt' (not 'autoUpdate') so a new deploy never force-refreshes a user
      // mid check-in — the app decides when to apply the update (see main.jsx).
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.ico', 'favicon.png', 'favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'ZORX INDIA HRMS',
        short_name: 'ZORX HRMS',
        description: 'ZORX INDIA HRMS — attendance, leave, tasks and office management.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        theme_color: '#1f5138',
        // Launch splash: the dark phone app's background, so it doesn't flash white.
        background_color: '#101418',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the built app-shell assets (JS/CSS/HTML/icons/fonts) are precached.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // Belt-and-suspenders: even if something matched at runtime, never let
        // API calls be served from — or written into — the cache.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
});
