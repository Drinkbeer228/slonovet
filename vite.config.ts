import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // дата сборки — видна в меню, чтобы понять, свежая ли версия на устройстве
  define: { __BUILD__: JSON.stringify(new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) },
  // поддержка публикации как в подпапке GitHub Pages (/slonovet/), так и в корне
  base: process.env.BASE_PATH ?? './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // регистрируем сами (src/main.tsx): новая версия подхватывается сразу, без второго перезапуска
      injectRegister: false,
      includeAssets: ['icon-64.png', 'apple-touch-icon.png', 'logo.webp'],
      workbox: {
        navigateFallback: null,
        runtimeCaching: [
          // файлы сборки (имя с хешем, не меняются): работа как в корне (/assets/), так и в /slonovet/assets/
          {
            urlPattern: ({ url }) => url.pathname.includes('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'assets', expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 } },
          },
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 4,
              matchOptions: { ignoreSearch: true },
            },
          },
        ],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/index.html'],
        importScripts: ['push-sw.js'],
        clientsClaim: true,
        skipWaiting: true,
      },
      manifest: {
        id: 'slonovet',
        name: 'СлоноВет — Полевой пост',
        short_name: 'СлоноВет',
        lang: 'ru',
        description: 'Полевой пост ежедневного мониторинга, сменных журналов и ветеринарного контроля слонов',
        theme_color: '#0b1217',
        background_color: '#0b1217',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    allowedHosts: ['.lhr.life', '.trycloudflare.com'],
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
  preview: {
    port: 4173,
    allowedHosts: ['.lhr.life', '.trycloudflare.com'],
  },
});
