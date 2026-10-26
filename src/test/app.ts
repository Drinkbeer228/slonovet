/**
 * «Телефон» для тестов: свежая копия приложения со своей IndexedDB. Сервер общий (fakeServer).
 * phone() — новый телефон; phone({ sameStorage: true }) — вторая вкладка того же браузера (общая IndexedDB).
 */
import { vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { CurrentUser } from '../domain/types';

/** Сеть «телефона»: net.online = false — как в подвале слоновника */
export const net = (globalThis as unknown as { __net: { online: boolean } }).__net;

export const keeperA: CurrentUser = { id: 'user-a', login: 'a', full_name: 'Кипер А', role: 'keeper' };

export function signedIn(user: CurrentUser = keeperA) {
  localStorage.setItem('slonovet_session', JSON.stringify({ mode: 'cloud', user }));
}

export async function phone(opts: { sameStorage?: boolean; cloud?: boolean } = {}) {
  vi.resetModules();
  if (!opts.sameStorage) (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  const store = await import('../lib/store');
  const sync = await import('../lib/sync');
  const actions = await import('../domain/actions');
  const auth = await import('../lib/auth');
  const idb = await import('../lib/idb');
  await store.initStore();
  if (opts.cloud !== false) store.setCloudMode(true);
  return { store, sync, actions, auth, idb };
}
