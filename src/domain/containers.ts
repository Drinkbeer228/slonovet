import type { Container, ContainerKind } from './types';

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е');

/** Типы контейнеров — чипами, без ввода. */
export const KINDS: { id: ContainerKind; label: string }[] = [
  { id: 'wheels', label: 'На колёсах' },
  { id: 'case', label: 'Кофр' },
  { id: 'light_sound', label: 'Свет/звук' },
  { id: 'props', label: 'Реквизит' },
  { id: 'luggage', label: 'Личный багаж' },
  { id: 'other', label: 'Другое' },
];
/** «№6» для номера, название как есть: «Кофр звук 2». */
export const containerName = (c: Pick<Container, 'number'>) => (/^\d/.test(c.number) ? `№${c.number}` : c.number || '№—');

export const kindLabel = (k: Container['kind']) => KINDS.find((x) => x.id === k)?.label ?? '';

/** «120×80×110» — что из габаритов известно. */
export function dims(c: Pick<Container, 'length_cm' | 'width_cm' | 'height_cm'>): string {
  const v = [c.length_cm, c.width_cm, c.height_cm];
  return v.some(Boolean) ? v.map((x) => x || '?').join('×') : '';
}

/** Номера по-человечески: «2» раньше «10», «6» раньше «6А». */
export const byNumber = (a: Container, b: Container) => a.number.localeCompare(b.number, 'ru', { numeric: true });

/**
 * Поиск реквизита: «синяя шляпа» → контейнер №6 и сама строка описи, где нашлось.
 * Ищем по номеру, типу, заметке и каждой строке описи; все слова запроса должны найтись. kind — фильтр по типу.
 */
export function findInContainers(list: Container[], query: string, kind: ContainerKind | null = null): { c: Container; lines: string[] }[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const live = list.filter((c) => !c.deleted && (!kind || c.kind === kind)).sort(byNumber);
  if (!words.length) return live.map((c) => ({ c, lines: [] }));
  const out: { c: Container; lines: string[] }[] = [];
  for (const c of live) {
    const lines = c.contents.split('\n').map((l) => l.trim()).filter(Boolean);
    const hit = lines.filter((l) => words.every((w) => norm(l).includes(w)));
    const head = norm([c.number, kindLabel(c.kind), c.note].join(' '));
    if (hit.length || words.every((w) => head.includes(w) || norm(c.contents).includes(w))) out.push({ c, lines: hit });
  }
  return out;
}
