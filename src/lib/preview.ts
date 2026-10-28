import { useSyncExternalStore } from 'react';
import type { Role, Shift } from '../domain/types';

/**
 * «Посмотреть как…»: системный админ видит приложение глазами другой роли на настоящих данных.
 * Только просмотр — запись в базу, фото и заведение людей в этом режиме не выполняются
 * (иначе, например, «Принять дежурство» записалось бы от имени админа).
 */

let role: Role | null = null;
/** пример открытого дежурства для просмотра (в памяти, не сохраняется) — живёт, пока смотрим этой ролью */
let sample: Shift | null = null;
const listeners = new Set<() => void>();

export function setPreviewRole(r: Role | null) {
  role = r;
  sample = null;
  listeners.forEach((l) => l());
}

export function setPreviewSample(s: Shift | null) {
  sample = s;
  listeners.forEach((l) => l());
}

export function usePreviewSample() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => sample,
  );
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
