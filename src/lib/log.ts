import { getSession } from './auth';
import { getClient } from './supabase';

/**
 * Журнал действий: что люди делают в приложении и где оно падает — чтобы улучшать.
 * События копятся в localStorage и уходят в таблицу events при синхронизации (только в рабочем режиме).
 */

interface LogEvent {
  id: string;
  user_id: string;
  user_name: string;
  role: string;
  action: string;
  meta: Record<string, unknown>;
  created_at: string;
}

const KEY = 'slonovet_events';
const MAX = 500; // без сети дольше — старые события выбрасываем, а не забиваем телефон

function read(): LogEvent[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as LogEvent[];
  } catch {
    return [];
  }
}

function write(list: LogEvent[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* без хранилища — просто не пишем */
  }
}

export function logEvent(action: string, meta: Record<string, unknown> = {}) {
  const s = getSession();
  if (!s || s.mode !== 'cloud') return;
  write([
    ...read(),
    {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      user_id: s.user.id,
      user_name: s.user.full_name,
      role: s.user.role,
      action,
      meta,
      created_at: new Date().toISOString(),
    },
  ]);
}

/** Отправить накопленное. Ошибка — не беда, попробуем при следующей синхронизации. */
export async function flushEvents() {
  const list = read();
  const client = getClient();
  if (!list.length || !client) return;
  const { error } = await client.from('events').upsert(list, { onConflict: 'id', ignoreDuplicates: true });
  if (!error) {
    const sent = new Set(list.map((e) => e.id));
    write(read().filter((e) => !sent.has(e.id)));
  }
}

/** Ловим ошибки приложения — по ним видно, где оно ломается у людей. */
export function captureErrors() {
  window.addEventListener('error', (e) => logEvent('error', { message: String(e.message).slice(0, 300), source: e.filename, line: e.lineno }));
  window.addEventListener('unhandledrejection', (e) => logEvent('error', { message: String(e.reason?.message ?? e.reason).slice(0, 300) }));
}
