import { useSyncExternalStore } from 'react';
import type { RequestComment } from '../domain/types';

/**
 * Что человек уже прочитал в обсуждениях — на этом телефоне: заявка → время последнего просмотра.
 * Отсюда точки и цифры «новое в обсуждении». На другом телефоне прочитанное начнётся заново — это не страшно.
 */
const key = (userId: string) => `slonovet_read_${userId}`;

function load(userId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key(userId)) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

let version = 0;
const listeners = new Set<() => void>();

export function markRead(requestId: string, userId: string, at = new Date().toISOString()) {
  const all = load(userId);
  if ((all[requestId] ?? '') >= at) return;
  all[requestId] = at;
  try {
    localStorage.setItem(key(userId), JSON.stringify(all));
  } catch {
    /* не запомним — точка останется, не беда */
  }
  version++;
  listeners.forEach((l) => l());
}

/** Перерисовать, когда что-то отметили прочитанным; вернёт, что прочитано. */
export function useReadMarks(userId: string): Record<string, string> {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return load(userId);
}

/** Чужие комментарии к заявке, написанные после последнего просмотра. */
export function unreadCount(comments: RequestComment[], requestId: string, userId: string, lastRead: string | undefined): number {
  return comments.filter((c) => c.request_id === requestId && !c.deleted && c.author_id !== userId && (!lastRead || c.created_at > lastRead)).length;
}

/** Сколько заявок с непрочитанным — для цифры на разделе. */
export function unreadRequests(comments: RequestComment[], userId: string, read: Record<string, string>, requestIds?: Set<string>): number {
  const ids = new Set(comments.filter((c) => !c.deleted && c.author_id !== userId).map((c) => c.request_id));
  let n = 0;
  for (const id of ids) if ((!requestIds || requestIds.has(id)) && unreadCount(comments, id, userId, read[id]) > 0) n++;
  return n;
}
