import { describe, expect, it } from 'vitest';
import { daySlots, shiftFeedOrder } from './day';
import type { RequestTodo } from './shift';
import type { Shift, VetRequest } from './types';

const local = (d: string, t: string) => new Date(`${d}T${t}:00`);
const shift = (extra: Partial<Shift> = {}): Shift => ({
  id: 's', date: '2026-10-30', keeper_id: 'a', keeper_name: 'А', status: 'open', safety: {}, state: {}, feeds: {}, quests: {},
  hay_bales: 0, note: '', accepted_at: local('2026-10-30', '08:00').toISOString(), handed_at: null, accept_remarks: '', updated_at: '', ...extra,
});
const todo = (id: string, extra: Partial<VetRequest> = {}): RequestTodo => ({
  req: { id, elephant: 'Марго', text: id, frequency: 'shift', due_date: null, needs_photo: false, urgent: false, author_id: null, author_name: 'Врач', status: 'active', created_at: '', updated_at: '', ...extra },
  marks: [], allMarks: [], needed: 1, done: false,
});

describe('кормления смены', () => {
  it('порядок смены: день, вечер, ночь, утро следующего дня', () => {
    expect(shiftFeedOrder(shift())).toEqual(['13:00', '17:00', '19:00', '07:00']);
  });

  it('каша сдвинулась из-за репетиции — в 13:40 она ещё «идёт», а не «не отмечено»', () => {
    expect(daySlots(shift(), local('2026-10-30', '13:40')).map((s) => s.status)).toEqual(['due', 'soon', 'soon', 'soon']);
  });
});

describe('сводка «Сдаю»', async () => {
  const { shiftSummary } = await import('./summary');
  it('кто в норме, кто нет и почему; назначения; кормления', () => {
    const s = shift({ state: { Марго: { legs: { level: 1, symptoms: ['трещина'] } } }, feeds: { '13:00': { done: true } } });
    const slots = daySlots(s, local('2026-10-30', '18:00'));
    const done = { ...todo('a'), done: true };
    const lines = shiftSummary(s, [done, todo('мазь')], slots).map((l) => [l.tone, l.text]);
    expect(lines).toEqual([
      ['ok', 'Претти, Одри — норма'],
      ['warn', 'Марго — внимание: ноги (трещина)'],
      ['warn', 'Назначения: 1 из 2, не сделано — Марго: мазь'],
      ['warn', 'Кормления: не отмечено — вечер'],
    ]);
  });
});
