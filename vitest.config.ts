import { defineConfig } from 'vitest/config';

// Тесты без браузера: логика и синхронизация против поддельного Supabase (src/test/).
export default defineConfig({
  test: {
    setupFiles: ['src/test/setup.ts'],
    env: { VITE_SUPABASE_URL: 'https://test.local', VITE_SUPABASE_ANON_KEY: 'test-anon' },
  },
});
