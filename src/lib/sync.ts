import { useSyncExternalStore } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TABLES, type TableMap, type TableName } from '../domain/types';
import { idbGet, idbPut } from './idb';
import {
  acceptServerRow,
  applyRemote,
  checkServer,
  dropOutbox,
  forgetMissing,
  getOutbox,
  pendingCount,
  rejectOutbox,
  reloadOutbox,
  setLocalChangeHandler,
  subscribe as subscribeStore,
  type OutboxEntry,
} from './store';
import { diff } from './patch';
import { flushEvents, logEvent } from './log';
import { getClient } from './supabase';
import { getServerConfig } from './config';
import { uploadPendingPhotos } from './photos';

/** Поднять — и все телефоны заберут данные с сервера заново (например, после переноса базы). */
const SYNC_EPOCH = 1;
/** Сколько строк забирать за раз. */
const PAGE = 500;
/** Каждый раз берём ещё раз последние 30 с: строка, чья запись на сервере закрылась позже своего времени, не проскочит. */
const OVERLAP_MS = 30_000;
/** При возвращении в приложение — не чаще раза в 15 с: вкладки переключают часто. */
const FOCUS_GAP_MS = 15_000;

/** То, что сервер окончательно не принял (нет прав, неверные данные), — показываем в меню. */
export interface Rejected {
  what: string;
  reason: string;
  at: string;
}

export interface SyncStatus {
  state: 'demo' | 'idle' | 'syncing' | 'offline' | 'error';
  pending: number;
  lastSync: string | null;
  error: string | null;
  rejected: Rejected[];
}

// время последней удачной связи помним и после перезапуска — для плашки «не отправлено»
const LAST_SYNC_KEY = 'slonovet_last_sync';
const REJECTED_KEY = 'slonovet_rejected';
function readLastSync(): string | null {
  try {
    return localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}
function readRejected(): Rejected[] {
  try {
    return JSON.parse(localStorage.getItem(REJECTED_KEY) ?? '[]') as Rejected[];
  } catch {
    return [];
  }
}

let status: SyncStatus = { state: 'idle', pending: 0, lastSync: readLastSync(), error: null, rejected: readRejected() };
const listeners = new Set<() => void>();
let enabled = false;
let running = false;
let again = false;
let lastStart = 0;
let askedPersist = false;
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

export function getSyncStatus() {
  return status;
}

/** «Понятно» в меню: убрать список непринятого. */
export function clearRejected() {
  try {
    localStorage.removeItem(REJECTED_KEY);
  } catch {
    /* не запомнится — не беда */
  }
  setStatus({ rejected: [] });
}

function addRejected(item: Rejected) {
  const list = [item, ...status.rejected].slice(0, 20);
  try {
    localStorage.setItem(REJECTED_KEY, JSON.stringify(list));
  } catch {
    /* покажем до перезапуска */
  }
  setStatus({ rejected: list });
}

const onOnline = () => {
  backoffUntil = 0; // связь вернулась — ждать нечего
  syncNow();
};
/** Автоматические попытки (таймер, возвращение в приложение) не бьют по недоступному серверу. */
const autoSync = () => {
  if (Date.now() < backoffUntil) return;
  syncNow();
};
const onOffline = () => setStatus({ state: 'offline' });

/** Вернулись в приложение — подтянуть новое, но не чаще раза в FOCUS_GAP_MS. */
export function syncOnFocus() {
  if (document.visibilityState !== 'visible') return;
  if (Date.now() - lastStart < FOCUS_GAP_MS) return;
  autoSync();
}

/** Попросить браузер не стирать наши данные сам (Safari чистит сайты, которые давно не открывали). */
function askPersistentStorage() {
  if (askedPersist) return;
  askedPersist = true;
  try {
    navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    /* браузер не умеет — живём как есть */
  }
}

export function startSync() {
  if (!enabled) {
    enabled = true;
    setLocalChangeHandler(() => scheduleSync());
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', syncOnFocus);
    interval = setInterval(autoSync, 60_000);
    askPersistentStorage();
  }
  syncNow();
}

export function stopSync(demo: boolean) {
  enabled = false;
  if (interval) clearInterval(interval);
  interval = null;
  if (timer) clearTimeout(timer);
  timer = null;
  window.removeEventListener('online', onOnline);
  window.removeEventListener('offline', onOffline);
  document.removeEventListener('visibilitychange', syncOnFocus);
  setStatus({ state: demo ? 'demo' : 'idle', error: null });
}

export function scheduleSync(delay = 1500) {
  if (!enabled) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(autoSync, delay);
}

function describe(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: string }).message);
  return String(e);
}

interface ServerError {
  message: string;
  code?: string;
}

/**
 * Отказ, который повтор не исправит: нет прав, неверные данные. Нет сети, сервер перегружен или упал,
 * истёк вход, на сервере ещё нет новой таблицы или колонки (PGRST2xx, миграцию не применили) —
 * временное: правка остаётся в очереди и уйдёт со следующей попыткой.
 */
function isPermanent(error: ServerError, httpStatus: number | undefined): boolean {
  if (!httpStatus || httpStatus >= 500 || httpStatus === 401 || httpStatus === 408 || httpStatus === 429) return false;
  if (error.code?.startsWith('PGRST2')) return false;
  // нарушение внешнего ключа: родитель (например, задача) ещё в дороге — отметка дождётся его
  if (error.code === '23503') return false;
  return httpStatus >= 400;
}

/** Родители раньше детей: отметка не уйдёт раньше своей задачи, движение — раньше своей позиции. */
const RANK: Record<TableName, number> = {
  profiles: 0,
  stock_items: 1,
  diets: 1,
  requests: 1,
  shifts: 2,
  notes: 3,
  move_items: 3,
  tour_stops: 1,
  suppliers: 1,
  containers: 1,
  stock_moves: 4,
  purchases: 4,
  request_marks: 5,
  request_comments: 5,
};

/** Сервер недоступен или перегружен: 5xx, 429, нет связи. Дальше очередь не молотим — ждём. */
const isServerDown = (httpStatus: number | undefined) => !httpStatus || httpStatus >= 500 || httpStatus === 429;
const BACKOFF_MIN_MS = 60_000;
const BACKOFF_MAX_MS = 15 * 60_000;
/** До какого момента автоматические попытки (таймер, возвращение в приложение) не бьют по серверу. */
let backoffUntil = 0;
let failStreak = 0;
/** Сколько секунд на фото за один цикл: связь «есть, но мёртвая» не должна держать текст смены. */
const PHOTO_BUDGET_MS = 45_000;

const WHAT: Record<TableName, string> = {
  profiles: 'Человек',
  shifts: 'Дежурство',
  requests: 'Задача',
  request_marks: 'Отметка задачи',
  request_comments: 'Комментарий',
  notes: 'Запись',
  stock_items: 'Позиция фуража',
  stock_moves: 'Движение фуража',
  diets: 'Рацион',
  move_items: 'Пункт переезда',
  tour_stops: 'Город гастролей',
  suppliers: 'Поставщик',
  containers: 'Контейнер',
  purchases: 'Закупка',
};

function describeEntry(e: OutboxEntry): string {
  const r = e.row as unknown as Record<string, unknown>;
  const name = [r.name, r.title, r.text, r.keeper_name].find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  return name ? `${WHAT[e.table]} «${name.length > 40 ? `${name.slice(0, 40)}…` : name}»` : WHAT[e.table];
}

/** Окончательный отказ: правку из очереди убрать, строку вернуть как на сервере, человеку — сказать. */
async function reject(client: SupabaseClient, entry: OutboxEntry, error: ServerError, httpStatus?: number): Promise<boolean> {
  const { data, error: readError } = await client.from(entry.table).select('*').eq('id', entry.row.id).limit(1);
  if (readError) return false; // версию с сервера не получили — попробуем в следующий раз
  await rejectOutbox(entry, ((data ?? [])[0] as TableMap[TableName] | undefined) ?? null);
  addRejected({
    what: describeEntry(entry),
    reason: httpStatus === 403 || error.code === '42501' ? 'нет прав' : 'сервер не принял данные',
    at: new Date().toISOString(),
  });
  logEvent('sync.rejected', { table: entry.table, id: entry.row.id, code: error.code ?? '', status: httpStatus ?? 0, message: error.message.slice(0, 200) });
  return true;
}

/** Метка «докуда скачали»: время изменения и id последней строки (у старых телефонов — только время). */
interface Cursor {
  ts: string;
  id: string;
}
async function readCursor(t: TableName): Promise<Cursor | null> {
  const v = (await idbGet<{ key: string; value: unknown }>('meta', `cursor:${t}`))?.value;
  if (typeof v === 'string') return { ts: v, id: '' };
  if (v && typeof v === 'object' && typeof (v as Cursor).ts === 'string') return v as Cursor;
  return null;
}
const quote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const after = (a: Cursor, b: Cursor) => a.ts > b.ts || (a.ts === b.ts && a.id > b.id);

/**
 * Только одна вкладка этого браузера синхронизирует в один момент. Замок занят три раза подряд —
 * значит, он «завис» (так бывает на iPhone), и синхронизируемся без него, а не молчим вечно.
 */
let lockBusy = 0;
async function exclusive(fn: () => Promise<void>) {
  const locks = navigator.locks;
  if (!locks?.request || lockBusy >= 3) return fn();
  await locks.request('slonovet-sync', { ifAvailable: true }, async (lock) => {
    if (!lock) {
      lockBusy++;
      return;
    }
    lockBusy = 0;
    await fn();
  });
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
  lastStart = Date.now();
  try {
    await exclusive(() => cycle(client));
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

async function cycle(client: SupabaseClient) {
  setStatus({ state: 'syncing' });
  await checkServer(`${getServerConfig()?.url}#${SYNC_EPOCH}`);
  let failed: string | null = null;

  await flushEvents();

  // очередь — общая для вкладок; перечитываем, чтобы не отправить то, что уже ушло из другой вкладки
  await reloadOutbox();
  let down = false;
  const queue = getOutbox()
    .map((e, i) => ({ e, i }))
    .sort((a, b) => RANK[a.e.table] - RANK[b.e.table] || a.i - b.i) // внутри таблицы — по порядку внесения
    .map((x) => x.e);
  for (const entry of queue) {
    const { deleted, ...row } = entry.row as TableMap[TableName] & { deleted?: boolean };
    const full = { ...row, deleted: Boolean(deleted) };
    const patched = Boolean(entry.patches || entry.insert);
    // смена: сервер вклеивает только изменённые поля в свою версию (apply_shift_patch)
    const res = patched
      ? await client.rpc('apply_shift_patch', { p_id: row.id, p_row: full, p_patches: entry.insert ? diff({}, full) : entry.patches })
      : await client.from(entry.table).upsert(full as Record<string, unknown>);
    if (res.error) {
      if (isPermanent(res.error, res.status) && (await reject(client, entry, res.error, res.status))) continue;
      failed = res.error.message;
      // сервер лёг, перегружен или сети нет — остальное только добавит нагрузки
      if (!navigator.onLine || isServerDown(res.status)) {
        down = true;
        break;
      }
      continue;
    }
    if (patched && res.data) await acceptServerRow(entry.table, res.data as TableMap[TableName], entry.ts);
    await dropOutbox(entry.key, entry.ts);
  }

  if (down) {
    failStreak++;
    backoffUntil = Date.now() + Math.min(BACKOFF_MIN_MS * 2 ** (failStreak - 1), BACKOFF_MAX_MS);
  } else {
    failStreak = 0;
    backoffUntil = 0;
  }

  // фото — после текста и в пределах времени: тяжёлые файлы не задерживают смену, а недоступный сервер их не ждёт
  if (!down) {
    const photos = await uploadPendingPhotos(Date.now() + PHOTO_BUDGET_MS);
    if (photos.failed) failed = `Фото не отправлено (${photos.failed}): ${photos.error}`;
  }

  for (const t of TABLES) {
    const saved = await readCursor(t);
    let from: Cursor = saved ? { ts: new Date(Date.parse(saved.ts) - OVERLAP_MS).toISOString(), id: '' } : { ts: '1970-01-01T00:00:00Z', id: '' };
    let last = saved;
    for (;;) {
      // по паре «время, id»: строки с одинаковым временем на границе пачки не теряются.
      // id ещё не знаем (начало или перекрытие) — просто «не раньше этого времени»: пустую строку
      // с id сравнивать нельзя, у людей id — uuid, и база отвечает ошибкой
      const query = client.from(t).select('*');
      const page = from.id
        ? query.or(`updated_at.gt.${quote(from.ts)},and(updated_at.eq.${quote(from.ts)},id.gt.${quote(from.id)})`)
        : query.gte('updated_at', from.ts);
      const { data, error } = await page.order('updated_at').order('id').limit(PAGE);
      if (error) {
        // одной таблицы может не быть на сервере (новая, миграцию ещё не применили) — остальные синхронизируем
        failed = `${t}: ${error.message}`;
        break;
      }
      if (!data?.length) break;
      await applyRemote(t, data as TableMap[typeof t][]);
      const tail = data[data.length - 1] as { updated_at: string; id: string };
      from = { ts: tail.updated_at, id: tail.id };
      if (!last || after(from, last)) last = from;
      if (data.length < PAGE) break;
    }
    if (last && (!saved || last.ts !== saved.ts || last.id !== saved.id)) await idbPut('meta', { key: `cursor:${t}`, value: last });
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
}
