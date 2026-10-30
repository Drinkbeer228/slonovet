// Гастроли (этап C1): текущий город и лента фуража по городам.
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

  it('лента: текущий город отдельно, прошлое — архивом по городам; фильтр по типу', () => {
    const moves = [mv('a', 'in', '2026-10-25'), mv('b', 'waste', '2026-10-26', -1), mv('c', 'in', '2026-09-15'), mv('d', 'feed', '2026-10-26', -2), mv('e', 'extra', '2026-08-01', -1)];
    const all = ledger(moves, stops, 'all', '2026-10-30');
    expect(all.current.map((m) => m.id)).toEqual(['b', 'a']); // кормление по рациону в ленту не входит
    expect(all.archive.map((g) => [g.stop?.city ?? 'Раньше', g.moves.map((m) => m.id)])).toEqual([['Казань', ['c']], ['Раньше', ['e']]]);
    expect(ledger(moves, stops, 'in', '2026-10-30').current.map((m) => m.id)).toEqual(['a']);
    expect(ledger(moves, stops, 'waste', '2026-10-30').current.map((m) => m.id)).toEqual(['b']);
  });

  it('без отмеченных городов — последние 30 дней, остальное «Раньше»', () => {
    const r = ledger([mv('new', 'in', '2026-10-25'), mv('old', 'in', '2026-09-01')], [], 'all', '2026-10-30');
    expect(r.current.map((m) => m.id)).toEqual(['new']);
    expect(r.archive[0].moves.map((m) => m.id)).toEqual(['old']);
  });
});
