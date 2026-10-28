import { isoDate, localDay } from '../lib/dates';
import { overdue } from './shift';
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
  if (r.frequency !== 'once') return r.due_date && r.due_date < today ? 'closed' : 'courses';
  if (marks.some((m) => m.request_id === r.id && !m.deleted)) return 'closed';
  return r.on_date && r.on_date > today ? 'planned' : 'today';
}

function purchaseGroup(p: Purchase): BoardGroup {
  return p.status === 'new' ? 'today' : p.status === 'ordered' ? 'planned' : 'closed';
}

/** Когда это было или будет — для порядка внутри группы */
const dayOf = (i: BoardItem) =>
  i.kind === 'request' ? `${i.req.on_date ?? ''} ${i.req.at_time?.slice(0, 5) ?? '99:99'}` : (i.p.delivery_date ?? '9999');
const touched = (i: BoardItem) => (i.kind === 'request' ? i.req.updated_at : i.p.updated_at);
const urgent = (i: BoardItem) => (i.kind === 'request' ? i.req.urgent : i.p.urgent);
const late = (i: BoardItem, now: Date) => i.kind === 'request' && overdue(i.req, false, now);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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
  // сегодня: просроченное, срочное, потом по часу
  out.today.sort((a, b) => Number(late(b, now)) - Number(late(a, now)) || Number(urgent(b)) - Number(urgent(a)) || cmp(dayOf(a), dayOf(b)));
  out.courses.sort((a, b) => cmp(touched(b), touched(a)));
  out.planned.sort((a, b) => cmp(dayOf(a), dayOf(b)));
  out.closed = out.closed.sort((a, b) => cmp(touched(b), touched(a))).slice(0, CLOSED_LIMIT);
  return out;
}

/** День создания — для подписи «от 26.10» у закупок */
export const createdDay = (i: BoardItem) => localDay(i.kind === 'request' ? i.req.created_at : i.p.created_at);
