import { useSyncExternalStore } from 'react';
import { TABLES, type TableMap, type TableName } from '../domain/types';
import { idbGet, idbPut } from './idb';
import { acceptServerRow, applyRemote, checkServer, dropOutbox, forgetMissing, getOutbox, pendingCount, setLocalChangeHandler, subscribe as subscribeStore } from './store';
import { diff } from './patch';
import { flushEvents } from './log';
import { getClient } from './supabase';
import { getServerConfig } from './config';
import { uploadPendingPhotos } from './photos';

/** Поднять — и все телефоны заберут данные с сервера заново (например, после переноса базы). */
const SYNC_EPOCH = 1;

export interface SyncStatus {
  state: 'demo' | 'idle' | 'syncing' | 'offline' | 'error';
  pending: number;
  lastSync: string | null;
  error: string | null;
}

// время последней удачной связи помним и после перезапуска — для плашки «не отправлено»
const LAST_SYNC_KEY = 'slonovet_last_sync';
function readLastSync(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

let status: SyncStatus = { state: 'idle', pending: 0, lastSync: readLastSync(), error: null };
const listeners = new Set<() => void>();
let enabled = false;
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let interval: ReturnType<typeof setInterval> | null = null;

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch, pending: pendingCount() };
  listeners.forEach((l) => l());
}

subscribeStore(() => {
  if (status.pending !== pendingCount()) setStatus({});
});

export function useSyncStatus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

const onOnline = () => syncNow();
const onFocus = () => {
  if (document.visibilityState === 'visible') syncNow();
};

export function startSync() {
  enabled = true;
  setLocalChangeHandler(() => scheduleSync());
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', () => setStatus({ state: 'offline' }));
  document.addEventListener('visibilitychange', onFocus);
  if (interval) clearInterval(interval);
  interval = setInterval(() => syncNow(), 60_000);
  syncNow();
}

export function stopSync(demo: boolean) {
  enabled = false;
  if (interval) clearInterval(interval);
  interval = null;
  window.removeEventListener('online', onOnline);
  document.removeEventListener('visibilitychange', onFocus);
  setStatus({ state: demo ? 'demo' : 'idle', error: null });
}

export function scheduleSync(delay = 1500) {
  if (!enabled) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => syncNow(), delay);
}

function describe(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: string }).message);
  return String(e);
}

export async function syncNow(): Promise<void> {
  if (!enabled) return;
  if (running) {
    again = true;
    return;
  }
  const client = getClient();
  if (!client) return;
  if (!navigator.onLine) {
    setStatus({ state: 'offline' });
    return;
  }
  running = true;
  setStatus({ state: 'syncing' });
  try {
    await checkServer(`${getServerConfig()?.url}#${SYNC_EPOCH}`);
    await uploadPendingPhotos();
    await flushEvents();

    let failed: string | null = null;
    for (const entry of getOutbox()) {
      const { deleted, ...row } = entry.row as TableMap[TableName] & { deleted?: boolean };
      if (entry.patches || entry.insert) {
        // смена: сервер вклеивает только изменённые поля в свою версию (apply_shift_patch)
        const full = { ...row, deleted: Boolean(deleted) };
        const { data, error } = await client.rpc('apply_shift_patch', {
          p_id: row.id,
          p_row: full,
          p_patches: entry.insert ? diff({}, full) : entry.patches,
        });
        if (error) {
          failed = error.message;
          if (!navigator.onLine) break;
          continue;
        }
        if (data) await acceptServerRow(entry.table, data as TableMap[TableName], entry.ts);
        await dropOutbox(entry.key, entry.ts);
        continue;
      }
      const { error } = await client.from(entry.table).upsert({ ...row, deleted: Boolean(deleted) });
      if (error) {
        failed = error.message;
        // сеть пропала — дальше не пытаемся
        if (!navigator.onLine) break;
        continue;
      }
      await dropOutbox(entry.key, entry.ts);
    }

    for (const t of TABLES) {
      const cursorKey = `cursor:${t}`;
      const cur = (await idbGet<{ key: string; value: string }>('meta', cursorKey))?.value ?? '1970-01-01T00:00:00Z';
      let cursor = cur;
      for (;;) {
        const { data, error } = await client.from(t).select('*').gt('updated_at', cursor).order('updated_at').limit(500);
        if (error) {
          // одной таблицы может не быть на сервере (новая, миграцию ещё не применили) — остальные синхронизируем
          failed = `${t}: ${error.message}`;
          break;
        }
        if (!data?.length) break;
        await applyRemote(t, data as TableMap[typeof t][]);
        cursor = (data[data.length - 1] as { updated_at: string }).updated_at;
        if (data.length < 500) break;
      }
      if (cursor !== cur) await idbPut('meta', { key: cursorKey, value: cursor });
    }

    // людей удаляют насовсем — сверяем список целиком (их единицы)
    const { data: ids } = await client.from('profiles').select('id');
    if (ids) await forgetMissing('profiles', new Set(ids.map((r: { id: string }) => r.id)));

    const lastSync = new Date().toISOString();
    try {
      localStorage.setItem(LAST_SYNC_KEY, lastSync);
    } catch {
      /* без хранилища время просто не запомнится */
    }
    setStatus({ state: failed ? 'error' : 'idle', error: failed, lastSync });
  } catch (e) {
    setStatus({ state: navigator.onLine ? 'error' : 'offline', error: describe(e) });
  } finally {
    running = false;
    if (again) {
      again = false;
      scheduleSync(500);
    }
  }
}
