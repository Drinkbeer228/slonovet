import { useSyncExternalStore } from 'react';
import type { Role } from '../domain/types';

/**
 * «Посмотреть как…»: системный админ видит приложение глазами другой роли на настоящих данных.
 * Только просмотр — запись в базу, фото и заведение людей в этом режиме не выполняются
 * (иначе, например, «Принять дежурство» записалось бы от имени админа).
 */

let role: Role | null = null;
const listeners = new Set<() => void>();

export function setPreviewRole(r: Role | null) {
  role = r;
  listeners.forEach((l) => l());
}

export function getPreviewRole() {
  return role;
}

export function usePreviewRole() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => role,
  );
}

/** Ошибка для мест, где в просмотре ничего нельзя менять. */
export class PreviewError extends Error {
  constructor() {
    super('Режим просмотра — изменения не сохраняются');
  }
}
