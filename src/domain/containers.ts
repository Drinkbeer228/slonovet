import type { Container, ContainerKind, ContainerPurpose } from './types';

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е');

/** Тара — чем ящик является, чипами, без ввода. */
export const KINDS: { id: ContainerKind; label: string }[] = [
  { id: 'wheels', label: 'На колёсах' },
  { id: 'case', label: 'Кофр' },
  { id: 'box', label: 'Ящик' },
  { id: 'pallet', label: 'Паллет' },
  { id: 'bag', label: 'Баул, мешок' },
  { id: 'other', label: 'Другое' },
];

/** Что внутри — для кого или для чего. */
export const PURPOSES: { id: ContainerPurpose; label: string }[] = [
  { id: 'elephants', label: 'Слоны' },
  { id: 'props', label: 'Реквизит' },
  { id: 'light_sound', label: 'Свет/звук' },
  { id: 'costumes', label: 'Костюмы' },
  { id: 'household', label: 'Хозяйство' },
  { id: 'personal', label: 'Личное' },
];

/** Где лежит: в туре (едет, идёт в погрузку) или на базе. */
export type Place = 'tour' | 'base';
export const placeOf = (c: Pick<Container, 'in_tour'>): Place => (c.in_tour === false ? 'base' : 'tour');

/** Старые виды «Свет/звук», «Реквизит», «Личный багаж» были «что внутри», а не тарой. */
const LEGACY: Partial<Record<ContainerKind, ContainerPurpose>> = { light_sound: 'light_sound', props: 'props', luggage: 'personal' };

/** Тара и «что внутри» с учётом старых записей (до миграции 029 и у ещё не обновлённых телефонов). */
export function tags(c: Pick<Container, 'kind' | 'purpose'>): { kind: ContainerKind | ''; purpose: ContainerPurpose | '' } {
  const legacy = c.kind ? LEGACY[c.kind] : undefined;
  if (legacy) return { kind: '', purpose: c.purpose || legacy };
  return { kind: c.kind ?? '', purpose: c.purpose ?? '' };
}

/** «№6» для номера, название как есть: «Кофр звук 2». */
export const containerName = (c: Pick<Container, 'number'>) => (/^\d/.test(c.number) ? `№${c.number}` : c.number || '№—');

export const kindLabel = (k: Container['kind']) => KINDS.find((x) => x.id === k)?.label ?? '';
export const purposeLabel = (p: Container['purpose']) => PURPOSES.find((x) => x.id === p)?.label ?? '';
/** «Кофр · Свет/звук» — что известно. */
export function tagsLabel(c: Pick<Container, 'kind' | 'purpose'>): string {
  const t = tags(c);
  return [kindLabel(t.kind), purposeLabel(t.purpose)].filter(Boolean).join(' · ');
}

/** «120×80×110» — что из габаритов известно. */
export function dims(c: Pick<Container, 'length_cm' | 'width_cm' | 'height_cm'>): string {
  const v = [c.length_cm, c.width_cm, c.height_cm];
  return v.some(Boolean) ? v.map((x) => x || '?').join('×') : '';
}

/** Номера по-человечески: «2» раньше «10», «6» раньше «6А». */
export const byNumber = (a: Container, b: Container) => a.number.localeCompare(b.number, 'ru', { numeric: true });

export interface ContainerFilter {
  kind?: ContainerKind | null;
  purpose?: ContainerPurpose | null;
  place?: Place | null;
}

/**
 * Поиск реквизита: «синяя шляпа» → контейнер №6 и сама строка описи, где нашлось.
 * Ищем по номеру, таре, «что внутри», заметке и каждой строке описи; все слова запроса должны найтись.
 * Фильтр — по таре, по «что внутри» и по месту (в туре / на базе).
 */
export function findInContainers(list: Container[], query: string, f: ContainerFilter = {}): { c: Container; lines: string[] }[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const live = list
    .filter((c) => {
      if (c.deleted) return false;
      const t = tags(c);
      return (!f.kind || t.kind === f.kind) && (!f.purpose || t.purpose === f.purpose) && (!f.place || placeOf(c) === f.place);
    })
    .sort(byNumber);
  if (!words.length) return live.map((c) => ({ c, lines: [] }));
  const out: { c: Container; lines: string[] }[] = [];
  for (const c of live) {
    const lines = c.contents.split('\n').map((l) => l.trim()).filter(Boolean);
    const hit = lines.filter((l) => words.every((w) => norm(l).includes(w)));
    const head = norm([c.number, tagsLabel(c), c.note].join(' '));
    if (hit.length || words.every((w) => head.includes(w) || norm(c.contents).includes(w))) out.push({ c, lines: hit });
  }
  return out;
}
