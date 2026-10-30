// Доска «Задачи»: что в какую группу попадает.
import { describe, expect, it } from 'vitest';
import { CLOSED_LIMIT, boardGroups } from './board';
import type { Purchase, RequestMark, VetRequest } from './types';

const now = new Date(2026, 9, 26, 10, 0); // 26.10, 10:00
const req = (id: string, extra: Partial<VetRequest> = {}): VetRequest => ({
  id, elephant: 'Одри', text: id, frequency: 'once', due_date: null, needs_photo: false, urgent: false,
  author_id: 'vet', author_name: 'Врач', status: 'active', created_at: '2026-10-25T08:00:00Z', updated_at: '2026-10-25T08:00:00Z', ...extra,
});
const buy = (id: string, status: Purchase['status'], extra: Partial<Purchase> = {}): Purchase =>
  ({ id, item_id: null, title: id, amount: '', note: '', urgent: false, status, author_id: 'k', author_name: 'К', status_by: null, status_at: null, created_at: '2026-10-25T08:00:00Z', updated_at: '2026-10-25T08:00:00Z', ...extra }) as Purchase;
const mark = (request_id: string): RequestMark => ({ id: `m-${request_id}`, request_id, shift_id: 's', done_by: 'К', done_at: '', note: '', photo_path: null, updated_at: '' });
const ids = (g: { kind: string; req?: VetRequest; p?: Purchase }[]) => g.map((i) => (i.req ?? i.p)!.id);

describe('доска «Задачи»: группы', () => {
  const requests = [
    req('today-pills', { elephant: 'work', on_date: '2026-10-26', at_time: '16:00' }),
    req('late-yesterday', { on_date: '2026-10-25' }),
    req('hot', { urgent: true }),
    req('tomorrow', { on_date: '2026-10-27' }),
    req('course', { frequency: 'shift', due_date: '2026-11-03' }),
    req('course-ended', { frequency: 'shift', due_date: '2026-10-25' }),
    req('done-once'),
    req('closed', { status: 'closed', updated_at: '2026-10-26T07:00:00Z' }),
  ];
  const purchases = [buy('hay', 'new', { urgent: true }), buy('oats', 'ordered', { delivery_date: '2026-10-28' }), buy('bags', 'done')];
  const g = boardGroups(requests, purchases, [mark('done-once')], 'all', now);

  it('сегодня: срочное наверху, дальше по сроку (вчерашнее раньше сегодняшнего); закупки «нужно купить» — тоже сегодня', () => {
    expect(ids(g.today)).toEqual(['hot', 'hay', 'late-yesterday', 'today-pills']);
  });

  it('срочное — в «Сегодня» и наверху, даже курс и задача на будущий день', () => {
    const list = [
      req('plain-today', { on_date: '2026-10-26' }),
      req('urgent-course', { frequency: 'shift', due_date: '2026-11-03', urgent: true }),
      req('urgent-later', { on_date: '2026-10-28', urgent: true }),
      req('plain-later', { on_date: '2026-10-28' }),
    ];
    const u = boardGroups(list, [], [], 'all', now);
    expect(ids(u.today)).toEqual(['urgent-later', 'urgent-course', 'plain-today']);
    expect(ids(u.planned)).toEqual(['plain-later']);
    expect(u.courses).toHaveLength(0);
  });

  it('курсы — по сроку: раньше кончается — выше', () => {
    const c = boardGroups([req('long', { frequency: 'shift', due_date: '2026-11-20' }), req('short', { frequency: 'shift', due_date: '2026-10-29' })], [], [], 'all', now);
    expect(ids(c.courses)).toEqual(['short', 'long']);
  });

  it('курсы — идущие регулярные; закончившийся курс и выполненная разовая — в закрытых', () => {
    expect(ids(g.courses)).toEqual(['course']);
    expect(ids(g.closed)).toEqual(expect.arrayContaining(['course-ended', 'done-once', 'closed', 'bags']));
  });

  it('запланировано: разовые на будущие дни и заказанные закупки — по дате', () => {
    expect(ids(g.planned)).toEqual(['tomorrow', 'oats']);
  });

  it('фильтр: «Работа» — только хоздела, «Закупки» — только закупки', () => {
    const w = boardGroups(requests, purchases, [], 'work', now);
    expect([...w.today, ...w.courses, ...w.planned, ...w.closed].every((i) => i.type === 'work')).toBe(true);
    const p = boardGroups(requests, purchases, [], 'purchases', now);
    expect([...p.today, ...p.planned, ...p.closed].map((i) => i.type)).toEqual(['purchases', 'purchases', 'purchases']);
  });

  it(`закрытых — не больше ${CLOSED_LIMIT}, самые свежие`, () => {
    const many = Array.from({ length: 30 }, (_, i) => req(`c${i}`, { status: 'closed', updated_at: `2026-10-${String(i % 28 + 1).padStart(2, '0')}T00:00:00Z` }));
    const c = boardGroups(many, [], [], 'all', now).closed;
    expect(c).toHaveLength(CLOSED_LIMIT);
    const at = (i: (typeof c)[number]) => (i.kind === 'request' ? i.req.updated_at : '');
    expect(at(c[0]) >= at(c[CLOSED_LIMIT - 1])).toBe(true);
  });
});
