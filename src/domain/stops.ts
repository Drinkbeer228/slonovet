import type { StockMove, TourStop } from './types';
import { addDays, isoDate, localDay } from '../lib/dates';

/** Города по порядку приезда, свежий — первым. */
export const sortStops = (stops: TourStop[]) => stops.filter((s) => !s.deleted).sort((a, b) => (a.arrive_on < b.arrive_on ? 1 : a.arrive_on > b.arrive_on ? -1 : 0));

/** Где труппа сейчас: последний город по дате приезда (не позже сегодня). */
export function currentStop(stops: TourStop[], today = isoDate()): TourStop | undefined {
  return sortStops(stops).find((s) => s.arrive_on <= today);
}

/** Пока ни одного города не отмечено, «текущий период» — последние 30 дней. */
export const NO_STOP_DAYS = 30;

/** С какого дня считается текущий период ленты: дата приезда в текущий город или 30 дней назад. */
export function periodStart(stops: TourStop[], today = isoDate()): string {
  return currentStop(stops, today)?.arrive_on ?? addDays(today, -NO_STOP_DAYS + 1);
}

/** В каком городе было движение: последний город, куда приехали не позже дня движения. */
export function stopOfDay(stops: TourStop[], day: string): TourStop | undefined {
  return sortStops(stops).find((s) => s.arrive_on <= day);
}

/**
 * Лента «Привозили»: приходы и пересчёты — чтобы помнить, когда и что привозили, и вовремя заказать снова.
 * Выдачи и брак не считаем: «Фураж» — не бухгалтерия, в цирке продукты всё равно раздают друг другу.
 */
const IN_LEDGER: StockMove['reason'][] = ['in', 'fix'];

/**
 * Лента фуража: текущий город отдельно, прошлые — архивом по городам (свежие сверху).
 * Без отмеченных городов архив — всё старше 30 дней одним блоком «Раньше».
 */
export function ledger(moves: StockMove[], stops: TourStop[], today = isoDate()) {
  const start = periodStart(stops, today);
  const list = moves.filter((m) => !m.deleted && IN_LEDGER.includes(m.reason)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const current = list.filter((m) => localDay(m.created_at) >= start);
  const groups = new Map<string, { stop: TourStop | undefined; moves: StockMove[] }>();
  for (const m of list) {
    const day = localDay(m.created_at);
    if (day >= start) continue;
    const stop = stopOfDay(stops, day);
    const key = stop?.id ?? '_before';
    if (!groups.has(key)) groups.set(key, { stop, moves: [] });
    groups.get(key)!.moves.push(m);
  }
  return { start, current, archive: [...groups.values()] };
}
