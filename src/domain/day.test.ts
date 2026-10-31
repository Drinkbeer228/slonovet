import { describe, expect, it } from 'vitest';
import { daySlots, nowItem, shiftFeedOrder } from './day';
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
const never = () => false;

describe('лента дня и «Сейчас»', () => {
  it('порядок смены: день, вечер, ночь, утро следующего дня', () => {
    expect(shiftFeedOrder(shift())).toEqual(['13:00', '17:00', '19:00', '07:00']);
  });

  it('каша сдвинулась из-за репетиции — в 13:40 она «сейчас», а не «пропущено»', () => {
    const slots = daySlots(shift(), never, local('2026-10-30', '13:40'));
    expect(slots.map((s) => s.status)).toEqual(['due', 'soon', 'soon', 'soon']);
    expect(nowItem(slots, [], { stale: false, now: local('2026-10-30', '13:40') })).toEqual({ kind: 'feed', time: '13:00', late: false });
  });

  it('прошлое кормление не отмечено — первым; срочное — раньше идущего кормления', () => {
    const now = local('2026-10-30', '17:10');
    const slots = daySlots(shift(), never, now);
    expect(nowItem(slots, [todo('u', { urgent: true })], { stale: false, now })).toEqual({ kind: 'feed', time: '13:00', late: true });
    const fed = daySlots(shift({ feeds: { '13:00': { done: true } } }), never, now);
    expect(nowItem(fed, [todo('u', { urgent: true })], { stale: false, now }).kind).toBe('task');
  });

  it('в дороге отменённое кормление не просит отметки', () => {
    const now = local('2026-10-30', '17:10');
    const slots = daySlots(shift(), (t) => t === '13:00', now);
    expect(slots[0].status).toBe('off');
    expect(nowItem(slots, [], { stale: false, now })).toEqual({ kind: 'feed', time: '17:00', late: false });
  });

  it('спокойно: что дальше и сколько назначений осталось; задача ко времени — за час', () => {
    const now = local('2026-10-30', '15:00');
    const slots = daySlots(shift({ feeds: { '13:00': { done: true } } }), never, now);
    expect(nowItem(slots, [todo('a'), todo('b', { at_time: '17:30' })], { stale: false, now })).toMatchObject({ kind: 'calm', left: 2, next: { time: '17:00' } });
    expect(nowItem(slots, [todo('b', { at_time: '16:00' })], { stale: false, now }).kind).toBe('task');
    expect(nowItem(slots, [], { stale: true, now }).kind).toBe('handover');
  });
});

describe('сводка «Сдаю»', async () => {
  const { shiftSummary } = await import('./summary');
  it('кто в норме, кто нет и почему; назначения; кормления', () => {
    const s = shift({ state: { Марго: { legs: { level: 1, symptoms: ['трещина'] } } }, feeds: { '13:00': { done: true } } });
    const slots = daySlots(s, never, local('2026-10-30', '18:00'));
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
