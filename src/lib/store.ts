import { useSyncExternalStore } from 'react';
import { TABLES, type TableMap, type TableName } from '../domain/types';
import { idbAll, idbClear, idbDelete, idbGet, idbPut, idbPutMany, idbPutPair, EXTRA_STORES } from './idb';
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
  /** кто внёс: на общем телефоне неотправленное одного не уходит под входом другого */
  user?: string;
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
/** кто сейчас вошёл (ставит auth.ts) — хозяин новых записей в outbox */
let owner: string | null = null;
/** записи outbox, которые сейчас пишутся в IndexedDB, — при перечитывании очереди их не теряем */
const writing = new Set<string>();

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

export function setOwner(id: string | null) {
  owner = id;
}

/** Своё неотправленное: записи этого человека и старые записи без хозяина. */
const mine = (e: OutboxEntry) => !e.user || e.user === owner;

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
  if (cloud && table !== 'profiles') {
    const key = `${table}:${full.id}`;
    const entry: OutboxEntry = { key, table, row: full, ts: Date.now() };
    if (owner) entry.user = owner;
    if (PATCHED.includes(table)) {
      const pending = outbox.get(key);
      if (!prev || pending?.insert) entry.insert = true;
      // старая запись целиком (до патчей) так и уйдёт целиком; иначе копим изменения
      else if (!pending || pending.patches) entry.patches = mergePatches(pending?.patches ?? [], diff(prev, full));
    }
    outbox.set(entry.key, entry);
    writing.add(key);
    try {
      // строка и запись в очереди — одной транзакцией: либо обе, либо ни одной
      await idbPutPair(table, full, 'outbox', entry);
    } finally {
      writing.delete(key);
    }
    onLocalChange?.();
  } else {
    await idbPut(table, full);
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
    if (!pending) {
      // курсор берёт последние секунды с перекрытием — то, что уже есть, второй раз не пишем
      const have = cache[table].get(r.id);
      if (have && have.updated_at === r.updated_at) continue;
      accepted.push(r);
    } else if (pending.patches) accepted.push(applyPatches(r, pending.patches));
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

/** Что отправлять сейчас: своё, по порядку внесения. */
export function getOutbox(): OutboxEntry[] {
  return [...outbox.values()].filter(mine).sort((a, b) => a.ts - b.ts);
}

/**
 * Перечитать очередь из IndexedDB перед отправкой. Её делят все вкладки этого браузера: то, что отправила
 * другая вкладка, отсюда пропадает, и старая правка не уйдёт второй раз поверх новой.
 */
export async function reloadOutbox() {
  const stored = new Map((await idbAll<OutboxEntry>('outbox')).map((e) => [e.key, e]));
  for (const [key, e] of outbox) {
    const s = stored.get(key);
    // пишется прямо сейчас или здесь новее — оставляем своё
    if ((!s && writing.has(key)) || (s && s.ts < e.ts)) stored.set(key, e);
  }
  outbox.clear();
  for (const [key, e] of stored) outbox.set(key, e);
}

/**
 * Сервер окончательно отказал (нет прав, неверные данные): убираем правку из очереди и возвращаем строку,
 * как она есть на сервере (serverRow), или убираем её совсем, если на сервере её нет.
 */
export async function rejectOutbox(entry: OutboxEntry, serverRow: AnyRow | null) {
  const cur = outbox.get(entry.key);
  // за время отправки строку успели поправить ещё раз — новая правка попробует сама
  if (cur && cur.ts !== entry.ts) return;
  // не стираем бесследно: правка уходит в карантин (её можно отправить ещё раз или сохранить в файл)
  await idbPut('meta', { key: `${QUARANTINE}${entry.key}:${entry.ts}`, value: { entry, at: new Date().toISOString() } });
  outbox.delete(entry.key);
  await idbDelete('outbox', entry.key);
  if (serverRow) {
    cache[entry.table].set(serverRow.id, serverRow);
    await idbPut(entry.table, serverRow);
  } else {
    cache[entry.table].delete(entry.row.id);
    await idbDelete(entry.table, entry.row.id);
  }
  emit([entry.table]);
}

/** Карантин: правки, которые сервер не принял. Лежат в meta, чтобы не менять схему IndexedDB. */
const QUARANTINE = 'quarantine:';

interface Quarantined {
  key: string;
  entry: OutboxEntry;
  at: string;
}

export async function getQuarantine(): Promise<Quarantined[]> {
  const all = await idbAll<{ key: string; value: { entry: OutboxEntry; at: string } }>('meta');
  return all.filter((m) => m.key.startsWith(QUARANTINE)).map((m) => ({ key: m.key, entry: m.value.entry, at: m.value.at }));
}

export async function clearQuarantine() {
  for (const q of await getQuarantine()) await idbDelete('meta', q.key);
}

/** Вернуть всё из карантина в очередь (например, когда человеку вернули права): правка уйдёт как новая. */
export async function requeueQuarantine(): Promise<number> {
  const list = await getQuarantine();
  for (const q of list) {
    const { updated_at: _skip, ...row } = q.entry.row as AnyRow & { updated_at?: string };
    void _skip;
    await put(q.entry.table, row as never);
    await idbDelete('meta', q.key);
  }
  return list.length;
}

/** Всё неотправленное и непринятое — текстом, чтобы сохранить в файл и не потерять работу. */
export async function exportUnsent(): Promise<string> {
  const quarantined = await getQuarantine();
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      outbox: getOutbox().map((e) => ({ table: e.table, row: e.row, patches: e.patches ?? null })),
      quarantine: quarantined.map((q) => ({ at: q.at, table: q.entry.table, row: q.entry.row, patches: q.entry.patches ?? null })),
    },
    null,
    2,
  );
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
  return [...outbox.values()].filter(mine).length;
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
  await resetLocal((e) => !JSON.stringify(e.row).includes('"demo-'));
  return true;
}

/**
 * Данные на телефоне — от этого ли сервера? После переезда на свой сервер старые телефоны
 * помнили, докуда уже скачали, и не забирали перенесённое (у тебя в «Персонале» — одна Ольга).
 * Сменился сервер или SYNC_EPOCH — забираем всё заново; неотправленное остаётся и уйдёт.
 */
export async function checkServer(tag: string) {
  const cur = await idbGet<{ key: string; value: string }>('meta', 'server');
  if (cur?.value === tag) return;
  await resetLocal(() => true);
  await idbPut('meta', { key: 'server', value: tag });
}

async function resetLocal(keepEntry: (e: OutboxEntry) => boolean) {
  const keep = [...outbox.values()].filter(keepEntry);
  const quarantined = await getQuarantine();
  for (const t of TABLES) {
    cache[t] = new Map();
    await idbClear(t);
  }
  await idbClear('outbox');
  await idbClear('meta'); // курсоры синхронизации — чтобы забрать с сервера всё заново
  for (const q of quarantined) await idbPut('meta', { key: q.key, value: { entry: q.entry, at: q.at } }); // карантин не трогаем
  outbox.clear();
  for (const e of keep) {
    cache[e.table].set(e.row.id, e.row);
    await idbPut(e.table, e.row);
    outbox.set(e.key, e);
    await idbPut('outbox', e);
  }
  emit([...TABLES]);
}

export function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
