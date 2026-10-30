import type { Container } from './types';

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е');

/** Номера по-человечески: «2» раньше «10», «6» раньше «6А». */
export const byNumber = (a: Container, b: Container) => a.number.localeCompare(b.number, 'ru', { numeric: true });

/**
 * Поиск реквизита: «синяя шляпа» → контейнер №6 и сама строка описи, где нашлось.
 * Ищем по номеру, фуре, заметке и каждой строке описи; все слова запроса должны найтись.
 */
export function findInContainers(list: Container[], query: string): { c: Container; lines: string[] }[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const live = list.filter((c) => !c.deleted).sort(byNumber);
  if (!words.length) return live.map((c) => ({ c, lines: [] }));
  const out: { c: Container; lines: string[] }[] = [];
  for (const c of live) {
    const lines = c.contents.split('\n').map((l) => l.trim()).filter(Boolean);
    const hit = lines.filter((l) => words.every((w) => norm(l).includes(w)));
    const head = norm([c.number, c.truck, c.note].join(' '));
    if (hit.length || words.every((w) => head.includes(w) || norm(c.contents).includes(w))) out.push({ c, lines: hit });
  }
  return out;
}
