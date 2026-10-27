import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerConfig } from './config';

/**
 * Замок для входа — внутри этой страницы, без navigator.locks. На iPhone замок браузера иногда «зависает»
 * (после сбоя приложения с экрана «Домой» или очистки данных сайта), и тогда вход и проверка входа ждут вечно.
 * Операции входа по-прежнему идут по одной.
 */
let authQueue: Promise<unknown> = Promise.resolve();
function pageLock<R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const run = authQueue.then(fn, fn);
  authQueue = run.catch(() => undefined);
  return run;
}

/**
 * Ни один запрос к серверу не висит вечно. Повисший запрос (связь оборвалась на полпути) держал замок входа,
 * и всё за ним — вход, проверка, синхронизация — ждало до перезапуска приложения. Фото грузятся дольше.
 */
function timedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const ms = url.includes('/storage/') ? 120_000 : 20_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('Сервер не ответил вовремя', 'TimeoutError')), ms);
  init.signal?.addEventListener('abort', () => ctrl.abort(init.signal?.reason), { once: true });
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

let client: SupabaseClient | null = null;
let clientUrl = '';

export function getClient(): SupabaseClient | null {
  const cfg = getServerConfig();
  if (!cfg) return null;
  if (!client || clientUrl !== cfg.url) {
    client = createClient(cfg.url, cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'slonovet-auth', lock: pageLock },
      global: { fetch: timedFetch },
    });
    clientUrl = cfg.url;
  }
  return client;
}

export function resetClient() {
  client = null;
  clientUrl = '';
}
