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
      includeAssets: ['icon-64.png', 'apple-touch-icon.png', 'logo.webp'],
      workbox: {
        // запросы к Supabase не кэшируем — данные и так хранятся в IndexedDB.
        // Сама страница — сначала из сети: онлайн всегда свежая версия, сразу при открытии.
        // Из памяти телефона — только если сети нет или она молчит дольше 4 с (манеж, «белые списки»).
        navigateFallback: null,
        runtimeCaching: [
          // файлы сборки (имя с хешем, не меняются): страница из памяти найдёт свои, даже если сборка уже новая
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'assets', expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 } },
          },
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 4,
              // /?tab=… из уведомления — та же страница
              matchOptions: { ignoreSearch: true },
            },
          },
        ],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // страница не лежит в предзагрузке: иначе «/» отдаётся из неё раньше, чем дойдёт до «сначала из сети».
        // Для работы без связи её сохраняет кэш pages при каждом открытии онлайн
        globIgnores: ['**/index.html'],
        // push-уведомления: показ и открытие нужного раздела (public/push-sw.js)
        importScripts: ['push-sw.js'],
        // новая версия сразу берёт открытые страницы и приложение перезагружается само; без этого телефон
        // днями показывал старое (на iPhone с экрана «Домой» — пока не закроешь полностью)
        clientsClaim: true,
        skipWaiting: true,
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
