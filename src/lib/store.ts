import { useSyncExternalStore } from 'react';
import { TABLES, type TableMap, type TableName } from '../domain/types';
import { idbAll, idbClear, idbDelete, idbPut, idbPutMany, EXTRA_STORES } from './idb';

/**
 * Все данные держим в памяти + IndexedDB. Каждое изменение пишется локально сразу,
 * а в облачном режиме ещё и кладётся в outbox — его отправит sync.ts, когда будет сеть.
 */

export interface OutboxEntry {
  key: string; // `${table}:${id}`
  table: TableName;
  row: TableMap[TableName];
  ts: number;
}

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

export async function put<K extends TableName>(table: K, row: Omit<TableMap[K], 'updated_at'> & { updated_at?: string }) {
  const full = { ...row, updated_at: new Date().toISOString() } as TableMap[K];
  cache[table].set(full.id, full);
  emit([table]);
  await idbPut(table, full);
  if (cloud && table !== 'profiles') {
    const entry: OutboxEntry = { key: `${table}:${full.id}`, table, row: full, ts: Date.now() };
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

/** Данные с сервера. Строки, которые ещё не отправлены, не перетираем. */
export async function applyRemote<K extends TableName>(table: K, rows: TableMap[K][]) {
  const accepted = rows.filter((r) => !outbox.has(`${table}:${r.id}`));
  for (const r of accepted) cache[table].set(r.id, r);
  await idbPutMany(table, accepted);
  if (accepted.length) emit([table]);
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

export function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
