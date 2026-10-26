/**
 * Общая подготовка тестов: IndexedDB в памяти, минимальный «браузер» (localStorage, window, document,
 * navigator.onLine) и поддельный Supabase вместо настоящего. Подключается в vitest.config.ts.
 */
import 'fake-indexeddb/auto';
import { vi } from 'vitest';

const G = globalThis as unknown as Record<string, unknown>;
const ls = new Map<string, string>();
G.localStorage = {
  getItem: (k: string) => (ls.has(k) ? ls.get(k)! : null),
  setItem: (k: string, v: string) => void ls.set(k, String(v)),
  removeItem: (k: string) => void ls.delete(k),
  clear: () => ls.clear(),
  key: (i: number) => [...ls.keys()][i] ?? null,
  get length() {
    return ls.size;
  },
};
// события сети и видимости тестам не нужны: синхронизацию они вызывают сами
const quiet = { addEventListener() {}, removeEventListener() {} };
G.window ??= { ...quiet };
G.document ??= { ...quiet, visibilityState: 'visible' };

// сеть есть, пока тест не выключит (net из src/test/app.ts); объект один на весь файл тестов
const net = ((G.__net as { online: boolean } | undefined) ??= { online: true });
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    get onLine() {
      return net.online;
    },
  },
});

vi.mock('../lib/supabase', async () => {
  const m = await import('./fakeServer');
  return { getClient: () => m.fakeClient, resetClient: () => undefined };
});
