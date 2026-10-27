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

let client: SupabaseClient | null = null;
let clientUrl = '';

export function getClient(): SupabaseClient | null {
  const cfg = getServerConfig();
  if (!cfg) return null;
  if (!client || clientUrl !== cfg.url) {
    client = createClient(cfg.url, cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'slonovet-auth', lock: pageLock },
    });
    clientUrl = cfg.url;
  }
  return client;
}

export function resetClient() {
  client = null;
  clientUrl = '';
}
