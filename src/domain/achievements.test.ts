// Статистика по сотруднику (экран «Мои достижения» скрыт — цифры копятся).
import { describe, expect, it } from 'vitest';
import { keeperStats, staffStats } from './achievements';
import type { Note, RequestMark, Shift } from './types';

const shift = (id: string, date: string, extra: Partial<Shift> = {}): Shift =>
  ({ id, date, keeper_id: 'u1', keeper_name: 'Андрей', status: 'handed', safety: {}, state: {}, feeds: {}, quests: {}, hay_bales: 0, note: '', accepted_at: null, handed_at: null, updated_at: '', ...extra }) as Shift;
const note = (id: string, author_name: string, author_id?: string): Note =>
  ({ id, shift_id: 's1', elephant: 'none', kind: 'observation', metric: null, text: '', photo_path: null, author_name, author_id, created_at: '', updated_at: '' }) as Note;
const mark = (id: string, done_by: string, done_by_id?: string): RequestMark => ({ id, request_id: 'r', shift_id: 's1', done_by, done_by_id, done_at: '', note: '', photo_path: null, updated_at: '' });

describe('статистика сотрудника', () => {
  const shifts = [
    shift('s1', '2026-10-28', {
      accepted_at: '2026-10-28T08:00:00Z',
      handed_at: '2026-10-29T08:00:00Z',
      quests: { urine: { Претти: { ok: 2, miss: 1 } }, feces: { Марго: 3 }, cleaning: { bags: 4, out: 3 } },
    }),
    shift('s2', '2026-10-29', { accepted_at: '2026-10-29T08:00:00Z', handed_at: '2026-10-29T20:30:00Z', quests: { cleaning: { bags: 1, out: 1 } } }),
    // ещё открыта — смена считается, часы нет
    shift('s3', '2026-10-30', { status: 'open', accepted_at: '2026-10-30T08:00:00Z' }),
    shift('x', '2026-10-30', { keeper_id: 'u2', keeper_name: 'Орлов', quests: { cleaning: { bags: 9 } } }),
  ];

  it('смены, часы, туалет и мешки — только свои', () => {
    const k = staffStats({ id: 'u1', name: 'Андрей Алексеевич' }, { shifts, notes: [], marks: [] });
    expect(k).toMatchObject({ shifts: 3, hours: 36.5, urineOk: 2, urineMiss: 1, feces: 3, bagsTaken: 5, bagsOut: 4, since: '2026-10-28' });
  });

  it('записи и задачи: по id, старые без id — по имени; переименование не теряет новые', () => {
    const notes = [note('n1', 'Андрей'), note('n2', 'Андрей Алексеевич', 'u1'), note('n3', 'Андрей', 'u9')];
    const marks = [mark('m1', 'Андрей'), mark('m2', 'Андрей Алексеевич', 'u1'), mark('m3', 'Орлов', 'u2')];
    const k = staffStats({ id: 'u1', name: 'Андрей' }, { shifts, notes, marks });
    expect(k.notes).toBe(2); // n3 — тёзка с другим id, не наш
    expect(k.marks).toBe(2);
  });

  it('keeperStats — по одному на каждого, кто дежурил, имя по последней смене', () => {
    expect(keeperStats(shifts, [], []).map((k) => [k.id, k.name, k.shifts])).toEqual([
      ['u1', 'Андрей', 3],
      ['u2', 'Орлов', 1],
    ]);
  });
});
