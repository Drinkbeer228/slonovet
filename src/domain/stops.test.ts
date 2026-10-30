// Гастроли (этап C1): текущий город и лента «Привозили».
import { describe, expect, it } from 'vitest';
import { currentStop, ledger } from './stops';
import type { StockMove, TourStop } from './types';

const stop = (id: string, city: string, arrive_on: string, depart_on: string | null = null): TourStop => ({ id, city, arrive_on, depart_on, note: '', created_by: 'А', updated_at: '' });
const mv = (id: string, reason: StockMove['reason'], day: string, delta = 1): StockMove => ({ id, item_id: 'oats', delta, reason, shift_id: null, author_name: 'А', created_at: `${day}T10:00:00`, updated_at: '' });

describe('гастроли: город и лента фуража', () => {
  const stops = [stop('kzn', 'Казань', '2026-09-10', '2026-10-20'), stop('sam', 'Самара', '2026-10-20')];

  it('текущий город — последний по дате приезда', () => {
    expect(currentStop(stops, '2026-10-30')?.city).toBe('Самара');
    expect(currentStop(stops, '2026-10-01')?.city).toBe('Казань');
  });

  it('«Привозили»: только приходы и пересчёты за 30 дней, старше — по месяцам; город не влияет', () => {
    const moves = [mv('a', 'in', '2026-10-25'), mv('f', 'fix', '2026-10-26'), mv('b', 'extra', '2026-10-26', -1), mv('c', 'in', '2026-09-15'), mv('d', 'feed', '2026-10-26', -2), mv('e', 'in', '2026-08-01')];
    const r = ledger(moves, '2026-10-30');
    expect(r.current.map((m) => m.id)).toEqual(['f', 'a']);
    expect(r.archive.map((g) => [g.label, g.moves.map((m) => m.id)])).toEqual([['сентябрь 2026', ['c']], ['август 2026', ['e']]]);
  });
});
