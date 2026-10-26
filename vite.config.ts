import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // дата сборки — видна в меню, чтобы понять, свежая ли версия на телефоне
  define: { __BUILD__: JSON.stringify(new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) },
  // сайт в корне домена slonovet.ru; BASE_PATH — если когда-нибудь снова понадобится подпапка
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // регистрируем сами (src/main.tsx): новая версия подхватывается сразу, без второго перезапуска
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        // запросы к Supabase не кэшируем — данные и так хранятся в IndexedDB
        navigateFallbackDenylist: [/^\/auth/, /^\/rest/, /^\/storage/, /^\/functions/],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      manifest: {
        id: 'slonovet',
        name: 'СлоноВет',
        short_name: 'СлоноВет',
        lang: 'ru',
        description: 'Суточное дежурство киперов и заявки ветврача',
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
    // временная ссылка для телефона: ssh -R 80:127.0.0.1:3000 nokey@localhost.run
    // (cloudflared tunnel --url http://localhost:3000 — запасной вариант, из России работает с перебоями)
    allowedHosts: ['.lhr.life', '.trycloudflare.com'],
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
  // готовая сборка для телефона через туннель: npm run build && npm run preview
  preview: {
    port: 4173,
    allowedHosts: ['.lhr.life', '.trycloudflare.com'],
  },
});
