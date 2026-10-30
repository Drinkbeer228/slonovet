import { TABLES } from '../domain/types';

/** Минимальная обёртка над IndexedDB — без сторонних библиотек. */

const DB_NAME = 'slonovet';
const DB_VERSION = 9; // 2 — move_items (переезд); 3 — была доска задач, номер не откатываем; 4 — purchases (закупки); 5 — request_comments; 6 — tour_stops (города); 7 — suppliers (поставщики); 8 — containers; 9 — trucks, load_plans (погрузка)
export const EXTRA_STORES = ['outbox', 'blobs', 'meta'] as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const t of TABLES) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'path' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(timer);
      dbPromise = null;
      reject(req.error);
    };
    // бывает, что браузер не отвечает вовсе (iPhone после переустановки) — не висим, следующий вызов попробует снова
    const timer = setTimeout(() => {
      dbPromise = null;
      reject(new Error('IndexedDB не открылась за 5 с'));
    }, 5000);
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbAll<T>(store: string): Promise<T[]> {
  const db = await open();
  return wrap(db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>);
}

export async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const db = await open();
  return wrap(db.transaction(store).objectStore(store).get(key) as IDBRequest<T | undefined>);
}

export async function idbPut(store: string, value: unknown): Promise<void> {
  const db = await open();
  await wrap(db.transaction(store, 'readwrite').objectStore(store).put(value));
}

/** Две записи в разные хранилища одной транзакцией: обрыв посередине не оставит правку без записи в очереди. */
export async function idbPutPair(storeA: string, a: unknown, storeB: string, b: unknown): Promise<void> {
  const db = await open();
  const tx = db.transaction([storeA, storeB], 'readwrite');
  tx.objectStore(storeA).put(a);
  tx.objectStore(storeB).put(b);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB: запись отменена'));
  });
}

export async function idbPutMany(store: string, values: unknown[]): Promise<void> {
  if (!values.length) return;
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(store: string, key: string): Promise<void> {
  const db = await open();
  await wrap(db.transaction(store, 'readwrite').objectStore(store).delete(key));
}

export async function idbClear(store: string): Promise<void> {
  const db = await open();
  await wrap(db.transaction(store, 'readwrite').objectStore(store).clear());
}
