// Здоровье для врача (этап B1): «Тревога» и «В процедурах», серии через границы смен.
import { describe, expect, it } from 'vitest';
import { healthAlerts } from './health';
import type { Shift } from './types';

const sh = (id: string, date: string, state: Shift['state'] = {}, extra: Partial<Shift> = {}): Shift =>
  ({ id, date, keeper_id: 'k', keeper_name: 'К', status: 'handed', safety: {}, state, feeds: {}, quests: {}, hay_bales: 0, note: '', accepted_at: `${date}T08:00:00Z`, handed_at: null, accept_remarks: '', updated_at: '', ...extra }) as Shift;
const legs = (level: 0 | 1 | 2, symptoms: string[] = []) => ({ Марго: { legs: { level, symptoms } } });

describe('здоровье: тревога и процедуры', () => {
  it('«внимание» несколько дней — спокойный список «в процедурах» с днём по счёту, не тревога', () => {
    const r = healthAlerts([sh('a', '2026-10-25', legs(1, ['ванночка'])), sh('b', '2026-10-26', legs(1)), sh('c', '2026-10-27', legs(1, ['ванночка']))], '2026-10-27');
    expect(r.alarms).toEqual([]);
    expect(r.procedures.map((p) => [p.el, p.text, p.day, p.since])).toEqual([['Марго', 'ноги — внимание', 3, '2026-10-25']]);
  });

  it('новая пустая смена ничего не сбрасывает: «плохо» остаётся тревогой, пока не отметят норму', () => {
    const shifts = [sh('a', '2026-10-26', legs(2)), sh('b', '2026-10-27', {}, { status: 'open' })];
    expect(healthAlerts(shifts, '2026-10-27').alarms.map((a) => a.text)).toEqual(['ноги — плохо']);
    expect(healthAlerts([...shifts, sh('c', '2026-10-27', legs(0), { accepted_at: '2026-10-27T20:00:00Z' })], '2026-10-27').alarms).toEqual([]);
  });

  it('серия считается через смены: неотмеченная смена посередине её не рвёт', () => {
    const r = healthAlerts([sh('a', '2026-10-24', legs(1)), sh('b', '2026-10-25'), sh('c', '2026-10-26', legs(1))], '2026-10-26');
    expect(r.procedures[0].since).toBe('2026-10-24');
  });

  it('отказ от еды — тревога, «половину» — под наблюдением', () => {
    const feeds = (eaten: 'none' | 'half') => ({ '13:00': { done: true, eaten: { Претти: 'all', Марго: 'all', Одри: eaten } } }) as Shift['feeds'];
    expect(healthAlerts([sh('a', '2026-10-27', {}, { feeds: feeds('none') })], '2026-10-27').alarms.map((a) => [a.el, a.text])).toEqual([['Одри', 'отказ от еды: 13:00']]);
    expect(healthAlerts([sh('a', '2026-10-27', {}, { feeds: feeds('half') })], '2026-10-27').procedures.map((a) => a.text)).toEqual(['не доела: 13:00']);
  });
});
