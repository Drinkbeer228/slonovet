import { useSyncExternalStore } from 'react';
import { TABLES, type TableMap, type TableName } from '../domain/types';
import { idbAll, idbClear, idbDelete, idbPut, idbPutMany, EXTRA_STORES } from './idb';
import { applyPatches, diff, mergePatches, type Patch } from './patch';

/**
 * Все данные держим в памяти + IndexedDB. Каждое изменение пишется локально сразу,
 * а в облачном режиме ещё и кладётся в outbox — его отправит sync.ts, когда будет сеть.
 */

export interface OutboxEntry {
  key: string; // `${table}:${id}`
  table: TableName;
  row: TableMap[TableName];
  ts: number;
  /** смены отправляем патчами: только изменённые поля (см. lib/patch.ts) */
  patches?: Patch[];
  /** смена создана на этом телефоне и ещё не отправлена — на сервер уйдёт целиком */
  insert?: boolean;
}

/** Таблицы, где одну строку правят несколько телефонов, — их шлём патчами. */
const PATCHED: TableName[] = ['shifts'];

type AnyRow = TableMap[TableName];

const cache = {} as Record<TableName, Map<string, AnyRow>>;
const arrays = {} as Partial<Record<TableName, AnyRow[]>>;
const outbox = new Map<string, OutboxEntry>();
const listeners = new Set<() => void>();
let version = 0;
let cloud = false;
let onLocalChange: (() => void) | null = null;

for (const t of TABLES) cache[t] = new Map();

function emit(tables: TableName[]) {
  for (const t of tables) delete arrays[t];
  version++;
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function setCloudMode(on: boolean) {
  cloud = on;
}

export function setLocalChangeHandler(fn: () => void) {
  onLocalChange = fn;
}

export async function initStore() {
  for (const t of TABLES) {
    const rows = await idbAll<AnyRow>(t);
    cache[t] = new Map(rows.map((r) => [r.id, r]));
  }
  const pending = await idbAll<OutboxEntry>('outbox');
  outbox.clear();
  for (const p of pending) outbox.set(p.key, p);
  emit([...TABLES]);
}

export function getRows<K extends TableName>(table: K): TableMap[K][] {
  let arr = arrays[table];
  if (!arr) {
    arr = [...cache[table].values()].filter((r) => !r.deleted);
    arrays[table] = arr;
  }
  return arr as TableMap[K][];
}

export function getRow<K extends TableName>(table: K, id: string): TableMap[K] | undefined {
  const r = cache[table].get(id);
  return r && !r.deleted ? (r as TableMap[K]) : undefined;
}

export function useRows<K extends TableName>(table: K): TableMap[K][] {
  return useSyncExternalStore(subscribe, () => getRows(table));
}

export function useVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

/** Запрет записи (режим «Посмотреть как…»): вернуть true — и put ничего не сохранит. */
let blockWrites: (() => boolean) | null = null;
export function setWriteBlock(fn: () => boolean) {
  blockWrites = fn;
}

export async function put<K extends TableName>(table: K, row: Omit<TableMap[K], 'updated_at'> & { updated_at?: string }) {
  const full = { ...row, updated_at: new Date().toISOString() } as TableMap[K];
  if (blockWrites?.()) return full;
  const prev = cache[table].get(full.id);
  cache[table].set(full.id, full);
  emit([table]);
  await idbPut(table, full);
  if (cloud && table !== 'profiles') {
    const key = `${table}:${full.id}`;
    const entry: OutboxEntry = { key, table, row: full, ts: Date.now() };
    if (PATCHED.includes(table)) {
      const pending = outbox.get(key);
      if (!prev || pending?.insert) entry.insert = true;
      // старая запись целиком (до патчей) так и уйдёт целиком; иначе копим изменения
      else if (!pending || pending.patches) entry.patches = mergePatches(pending?.patches ?? [], diff(prev, full));
    }
    outbox.set(entry.key, entry);
    await idbPut('outbox', entry);
    onLocalChange?.();
  }
  return full;
}

export async function remove<K extends TableName>(table: K, id: string) {
  const r = cache[table].get(id);
  if (!r) return;
  await put(table, { ...(r as TableMap[K]), deleted: true });
}

/**
 * Данные с сервера. Если у строки есть неотправленные патчи — берём серверную версию
 * и накладываем их сверху: видно и чужие отметки, и свои. Остальные неотправленные строки не трогаем.
 */
export async function applyRemote<K extends TableName>(table: K, rows: TableMap[K][]) {
  const accepted: TableMap[K][] = [];
  for (const r of rows) {
    const pending = outbox.get(`${table}:${r.id}`);
    if (!pending) accepted.push(r);
    else if (pending.patches) accepted.push(applyPatches(r, pending.patches));
  }
  for (const r of accepted) cache[table].set(r.id, r);
  await idbPutMany(table, accepted);
  if (accepted.length) emit([table]);
}

/** Ответ сервера после отправки патчей: итоговая строка, если пока нет новых правок поверх. */
export async function acceptServerRow<K extends TableName>(table: K, row: TableMap[K], ts: number) {
  const pending = outbox.get(`${table}:${row.id}`);
  const merged = pending && pending.ts !== ts && pending.patches ? applyPatches(row, pending.patches) : pending && pending.ts !== ts ? null : row;
  if (!merged) return;
  cache[table].set(row.id, merged);
  await idbPut(table, merged);
  emit([table]);
}

/** Строки, которых больше нет на сервере (удалённые люди), — убрать и с телефона. */
export async function forgetMissing<K extends TableName>(table: K, ids: Set<string>) {
  const gone = [...cache[table].keys()].filter((id) => !ids.has(id) && !outbox.has(`${table}:${id}`));
  for (const id of gone) {
    cache[table].delete(id);
    await idbDelete(table, id);
  }
  if (gone.length) emit([table]);
}

/** Для демо-данных: пишем без outbox. */
export async function seedRows<K extends TableName>(table: K, rows: TableMap[K][]) {
  for (const r of rows) cache[table].set(r.id, r);
  await idbPutMany(table, rows);
  emit([table]);
}

export function getOutbox(): OutboxEntry[] {
  return [...outbox.values()].sort((a, b) => a.ts - b.ts);
}

export async function dropOutbox(key: string, ts: number) {
  const cur = outbox.get(key);
  // если строку успели изменить ещё раз во время отправки — оставляем новую версию
  if (cur && cur.ts === ts) {
    outbox.delete(key);
    await idbDelete('outbox', key);
  }
}

export function pendingCount() {
  return outbox.size;
}

export async function wipeAll() {
  for (const t of TABLES) {
    cache[t] = new Map();
    await idbClear(t);
  }
  for (const s of EXTRA_STORES) await idbClear(s);
  outbox.clear();
  emit([...TABLES]);
}

/**
 * В облачные данные затесался пример (демо-люди, смены «Соколова»): так бывает, если выйти из примера
 * и войти по логину. Стираем всё локальное и тянем с сервера заново; свои неотправленные правки сохраняем,
 * а правки поверх примера (их сервер всё равно не примет) выбрасываем.
 */
export async function purgeDemo(): Promise<boolean> {
  if (![...cache.profiles.keys()].some((id) => id.startsWith('demo-'))) return false;
  const keep = [...outbox.values()].filter((e) => !JSON.stringify(e.row).includes('"demo-'));
  for (const t of TABLES) {
    cache[t] = new Map();
    await idbClear(t);
  }
  await idbClear('outbox');
  await idbClear('meta'); // курсоры синхронизации — чтобы забрать с сервера всё заново
  outbox.clear();
  for (const e of keep) {
    cache[e.table].set(e.row.id, e.row);
    await idbPut(e.table, e.row);
    outbox.set(e.key, e);
    await idbPut('outbox', e);
  }
  emit([...TABLES]);
  return true;
}

export function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
