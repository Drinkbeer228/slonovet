// Наблюдение из смены в смену: перенос проблем, пропущенные назначения, история слона.
import { describe, expect, it } from 'vitest';
import { carryFlags, durationText, elephantHistory, feedStatus, gapBefore, missedTasks, noDutySince, previousShift } from './monitoring';
import type { RequestMark, Shift, VetRequest } from './types';

const shift = (id: string, date: string, extra: Partial<Shift> = {}): Shift =>
  ({ id, date, keeper_id: 'k', keeper_name: 'К', status: 'handed', safety: {}, state: {}, feeds: {}, quests: {}, hay_bales: 0, note: '', accepted_at: `${date}T08:00:00.000Z`, handed_at: null, updated_at: '', ...extra }) as Shift;
const req = (id: string, extra: Partial<VetRequest> = {}): VetRequest =>
  ({ id, elephant: 'Марго', text: id, frequency: 'once', due_date: null, needs_photo: false, urgent: false, options: null, photo_path: null, author_id: 'v', author_name: 'В', status: 'active', created_at: '2026-10-27T07:00:00.000Z', updated_at: '', ...extra }) as VetRequest;
const mark = (id: string, request_id: string, shift_id: string, done_at: string, note = ''): RequestMark => ({ id, request_id, shift_id, done_by: 'К', done_at, note, photo_path: null, updated_at: '' });

describe('перенос с прошлой смены', () => {
  const prev = shift('a', '2026-10-29', { state: { Марго: { water: { level: 1, symptoms: ['пьёт мало'] } } } });
  it('прошлая — принятая, иначе последняя раньше', () => {
    const cur = shift('b', '2026-10-30', { accepted_from: 'a' });
    expect(previousShift([prev, cur], cur)?.id).toBe('a');
    expect(previousShift([prev, shift('c', '2026-10-30')], shift('c', '2026-10-30'))?.id).toBe('a');
  });

  it('не в норме вчера и не тронуто сегодня — «проверь»; отметили — уже не переносится', () => {
    const cur = shift('b', '2026-10-30', { status: 'open' });
    expect(carryFlags([prev, cur], cur).map((f) => [f.elephant, f.metric, f.symptoms])).toEqual([['Марго', 'water', ['пьёт мало']]]);
    const checked = shift('b', '2026-10-30', { status: 'open', state: { Марго: { water: { level: 0 } } } });
    expect(carryFlags([prev, checked], checked)).toEqual([]);
  });
});

describe('пропущенные назначения', () => {
  const s = shift('s', '2026-10-29', { accepted_at: '2026-10-29T08:00:00.000Z', handed_at: '2026-10-30T08:00:00.000Z' });

  it('регулярное без отметки в смене — «не отмечено»; кормления — сколько из скольких', () => {
    const daily = req('daily', { frequency: 'shift', due_date: '2026-11-05' });
    const feed = req('feed', { frequency: 'feeding', due_date: '2026-11-05' });
    const marks = [mark('m1', 'feed', 's', '2026-10-29T10:00:00.000Z'), mark('m2', 'feed', 's', '2026-10-29T14:00:00.000Z')];
    expect(missedTasks([daily, feed], marks, s).map((m) => [m.req.id, m.why])).toEqual([
      ['daily', 'не отмечено'],
      ['feed', 'отмечено 2 из 4'],
    ]);
  });

  it('разовое: сделано раньше или в смене — не пропуск; «не получилось» — пропуск; со вчера — «просрочено»', () => {
    const early = req('early', { on_date: '2026-10-28' });
    const here = req('here', { on_date: '2026-10-29' });
    const failed = req('failed', { on_date: '2026-10-29', options: ['сделано', 'не получилось'] });
    const late = req('late', { on_date: '2026-10-28' });
    const marks = [
      mark('e', 'early', 'x', '2026-10-28T12:00:00.000Z'),
      mark('h', 'here', 's', '2026-10-29T12:00:00.000Z'),
      mark('f', 'failed', 's', '2026-10-29T12:00:00.000Z', 'не получилось'),
    ];
    expect(missedTasks([early, here, failed, late], marks, s).map((m) => [m.req.id, m.why])).toEqual([
      ['failed', 'не отмечено'],
      ['late', 'просрочено'],
    ]);
  });

  it('у идущей смены пропусков нет; поставленное позже конца смены и будущее — не в счёт', () => {
    expect(missedTasks([req('r')], [], { ...s, status: 'open' })).toEqual([]);
    expect(missedTasks([req('later', { created_at: '2026-10-30T09:00:00.000Z' }), req('future', { on_date: '2026-10-31' })], [], s)).toEqual([]);
  });
});

describe('история слона', () => {
  it('по дням: худшее за день, сумма кала и мочи, худший аппетит; без смены — пусто', () => {
    const shifts = [
      shift('1', '2026-10-28', { checked_at: 'x', quests: { feces: { Марго: 5 }, urine: { Марго: { ok: 4, miss: 0 } } }, feeds: { '13:00': { done: true, eaten: { Марго: 'half' } }, '17:00': { done: true } } }),
      shift('2', '2026-10-29', { state: { Марго: { water: { level: 1 } } }, quests: { feces: { Марго: 2 } } }),
      shift('3', '2026-10-29', { state: { Марго: { water: { level: 2 } } }, quests: { feces: { Марго: 3 } } }),
    ];
    const h = elephantHistory(shifts, 'Марго', 3, '2026-10-30');
    expect(h.map((d) => d.date)).toEqual(['2026-10-28', '2026-10-29', '2026-10-30']);
    expect(h[0]).toMatchObject({ eaten: 'half', feces: 5, urine: 4 });
    expect(h[0].levels.water).toBe(0); // осмотрел всех при сдаче — нетронутое норма
    expect(h[1].levels.water).toBe(2);
    expect(h[1].levels.food).toBeNull(); // не отмечали и не подтверждали
    expect(h[1].feces).toBe(5);
    expect(h[2]).toMatchObject({ eaten: null, feces: null, urine: null });
  });
});

describe('кормления по времени', () => {
  const local = (d: string, t: string) => new Date(`${d}T${t}:00`).toISOString();
  const s = shift('s', '2026-10-30', { status: 'open', accepted_at: local('2026-10-30', '19:28'), feeds: { '19:00': { done: true } } });

  it('до приёма смены — не этого дежурного; отмечено — done; 07:00 — следующее утро', () => {
    expect(feedStatus(s, '13:00', new Date(local('2026-10-30', '20:00')))).toBe('outside');
    expect(feedStatus(s, '19:00', new Date(local('2026-10-30', '20:00')))).toBe('done');
    expect(feedStatus(s, '07:00', new Date(local('2026-10-30', '23:00')))).toBe('soon');
    expect(feedStatus(s, '07:00', new Date(local('2026-10-31', '08:30')))).toBe('late');
  });

  it('смена с утра: прошло больше часа — late, в пределах часа — ещё soon; сдана — late', () => {
    const day = shift('d', '2026-10-30', { status: 'open', accepted_at: local('2026-10-30', '08:00') });
    expect(feedStatus(day, '13:00', new Date(local('2026-10-30', '13:30')))).toBe('soon');
    expect(feedStatus(day, '13:00', new Date(local('2026-10-30', '14:10')))).toBe('late');
    expect(feedStatus({ ...day, status: 'handed', handed_at: local('2026-10-31', '08:00') }, '17:00')).toBe('late');
  });
});

describe('дыры между сменами', () => {
  const local = (d: string, t: string) => new Date(`${d}T${t}:00`).toISOString();
  const a = shift('a', '2026-10-29', { accepted_at: local('2026-10-29', '08:00'), handed_at: local('2026-10-30', '08:00') });
  const b = shift('b', '2026-10-30', { status: 'open', accepted_at: local('2026-10-30', '19:28') });

  it('08:00–19:28 — 11 ч 28 мин без дежурного; пересменка меньше получаса — не дыра', () => {
    expect(gapBefore([a, b], b)).toMatchObject({ minutes: 688 });
    expect(durationText(688)).toBe('11 ч 28 мин');
    const quick = { ...b, accepted_at: local('2026-10-30', '08:10') };
    expect(gapBefore([a, quick], quick)).toBeNull();
  });

  it('сейчас никто не дежурит — с момента последней сдачи; кто-то на смене — null', () => {
    expect(noDutySince([a], new Date(local('2026-10-30', '10:00')))?.minutes).toBe(120);
    expect(noDutySince([a, b])).toBeNull();
    expect(durationText(1440 + 180)).toBe('1 сут 3 ч');
  });
});
