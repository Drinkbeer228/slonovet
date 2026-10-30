import { isoDate, localDay } from '../lib/dates';
import { byPriority, closingMarks, deadlineKey, overdue } from './shift';
import type { Purchase, RequestMark, VetRequest } from './types';

/*
 * Доска «Задачи»: задачи по слонам, хоздела и закупки — одним списком, по группам во времени.
 * У задачи есть день или курс, у закупки — только состояние, поэтому правила для них свои.
 */

export type BoardType = 'elephants' | 'work' | 'purchases';
export type BoardFilter = 'all' | BoardType;
export type BoardGroup = 'today' | 'courses' | 'planned' | 'closed';

export type BoardItem = { kind: 'request'; type: 'elephants' | 'work'; req: VetRequest } | { kind: 'purchase'; type: 'purchases'; p: Purchase };

export const GROUP_TITLE: Record<BoardGroup, string> = { today: 'Сегодня', courses: 'Курсы', planned: 'Запланировано', closed: 'Закрытые' };
export const GROUPS: BoardGroup[] = ['today', 'courses', 'planned', 'closed'];
/** Закрытых показываем последние — чтобы доска не росла бесконечно */
export const CLOSED_LIMIT = 20;

const requestType = (r: VetRequest): 'elephants' | 'work' => (r.elephant === 'work' ? 'work' : 'elephants');

function requestGroup(r: VetRequest, marks: RequestMark[], today: string): BoardGroup {
  if (r.status === 'closed') return 'closed';
  if (r.frequency !== 'once') return r.due_date && r.due_date < today ? 'closed' : r.urgent ? 'today' : 'courses';
  // «не получилось» задачу не закрывает — закрывает отметка выполнения
  if (closingMarks(marks, r).length) return 'closed';
  // срочное — всегда в «Сегодня», даже если поставлено на будущий день
  return r.on_date && r.on_date > today && !r.urgent ? 'planned' : 'today';
}

function purchaseGroup(p: Purchase): BoardGroup {
  if (p.status === 'done' || p.status === 'cancelled') return 'closed';
  return p.status === 'new' || p.urgent ? 'today' : 'planned';
}

/** Срок: у задачи — день и час (или «до какого числа»), у закупки — когда привезут; без срока — в конец */
const deadline = (i: BoardItem) => (i.kind === 'request' ? deadlineKey(i.req) : i.p.delivery_date ? `${i.p.delivery_date} 99:99` : '9999');
const touched = (i: BoardItem) => (i.kind === 'request' ? i.req.updated_at : i.p.updated_at);
const urgent = (i: BoardItem) => (i.kind === 'request' ? i.req.urgent : i.p.urgent);
const created = (i: BoardItem) => (i.kind === 'request' ? i.req.created_at : i.p.created_at);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Тот же порядок, что в смене (byPriority): срочное наверху, потом по сроку, потом кто раньше поставлен */
const byItemPriority = (a: BoardItem, b: BoardItem) =>
  a.kind === 'request' && b.kind === 'request'
    ? byPriority(a.req, b.req)
    : Number(urgent(b)) - Number(urgent(a)) || cmp(deadline(a), deadline(b)) || cmp(created(a), created(b));

export function boardGroups(
  requests: VetRequest[],
  purchases: Purchase[],
  marks: RequestMark[],
  filter: BoardFilter,
  now = new Date(),
): Record<BoardGroup, BoardItem[]> {
  const today = isoDate(now);
  const out: Record<BoardGroup, BoardItem[]> = { today: [], courses: [], planned: [], closed: [] };
  for (const r of requests) {
    if (r.deleted) continue;
    const type = requestType(r);
    if (filter !== 'all' && filter !== type) continue;
    out[requestGroup(r, marks, today)].push({ kind: 'request', type, req: r });
  }
  if (filter === 'all' || filter === 'purchases') {
    for (const p of purchases) if (!p.deleted) out[purchaseGroup(p)].push({ kind: 'purchase', type: 'purchases', p });
  }
  out.today.sort(byItemPriority);
  out.courses.sort(byItemPriority);
  out.planned.sort(byItemPriority);
  out.closed = out.closed.sort((a, b) => cmp(touched(b), touched(a))).slice(0, CLOSED_LIMIT);
  return out;
}

/** Что требует внимания на доске: просроченное и срочное без отметки; у закупок — новые срочные. По типам — для точек фильтра. */
export function boardAttention(requests: VetRequest[], purchases: Purchase[], marks: RequestMark[], now = new Date()): Record<BoardType, number> {
  const out: Record<BoardType, number> = { elephants: 0, work: 0, purchases: 0 };
  const today = isoDate(now);
  for (const r of requests) {
    if (r.deleted || requestGroup(r, marks, today) === 'closed') continue;
    const done = closingMarks(marks, r).length > 0;
    if (overdue(r, done, now) || (r.urgent && r.frequency === 'once' && !done)) out[requestType(r)]++;
  }
  for (const p of purchases) if (!p.deleted && p.status === 'new' && p.urgent) out.purchases++;
  return out;
}

/** День создания — для подписи «от 26.10» у закупок */
export const createdDay = (i: BoardItem) => localDay(i.kind === 'request' ? i.req.created_at : i.p.created_at);
