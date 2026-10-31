import type { StockMove, TourStop } from './types';
import { addDays, isoDate, localDay } from '../lib/dates';

/** Города по порядку приезда, свежий — первым. */
export const sortStops = (stops: TourStop[]) => stops.filter((s) => !s.deleted).sort((a, b) => (a.arrive_on < b.arrive_on ? 1 : a.arrive_on > b.arrive_on ? -1 : 0));

/** Где труппа сейчас: последний город по дате приезда (не позже сегодня). */
export function currentStop(stops: TourStop[], today = isoDate()): TourStop | undefined {
  return sortStops(stops).find((s) => s.arrive_on <= today);
}

/** «Привозили» показывает последние 30 дней — от города не зависит. */
export const LEDGER_DAYS = 30;

/**
 * Лента «Привозили»: приходы и пересчёты — чтобы помнить, когда и что привозили, и вовремя заказать снова.
 * Выдачи и брак не считаем: «Фураж» — не бухгалтерия, в цирке продукты всё равно раздают друг другу.
 */
const IN_LEDGER: StockMove['reason'][] = ['in', 'fix'];

/** Название месяца для архива: «сентябрь 2026». */
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const monthLabel = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;

/** Лента «Привозили»: последние 30 дней отдельно, всё старше — архивом по месяцам (свежие сверху). */
export function ledger(moves: StockMove[], today = isoDate()) {
  const start = addDays(today, -LEDGER_DAYS + 1);
  const list = moves.filter((m) => !m.deleted && IN_LEDGER.includes(m.reason)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const current = list.filter((m) => localDay(m.created_at) >= start);
  const groups = new Map<string, { label: string; moves: StockMove[] }>();
  for (const m of list) {
    const day = localDay(m.created_at);
    if (day >= start) continue;
    const key = day.slice(0, 7);
    if (!groups.has(key)) groups.set(key, { label: monthLabel(day), moves: [] });
    groups.get(key)!.moves.push(m);
  }
  return { start, current, archive: [...groups.values()] };
}

/** Города со стационарными цирками — для выбора одним тапом; другой город можно вписать. */
export const CIRCUS_CITIES = [
  'Астрахань', 'Брянск', 'Владивосток', 'Волгоград', 'Воронеж', 'Екатеринбург', 'Иваново', 'Ижевск', 'Иркутск', 'Казань',
  'Кемерово', 'Киров', 'Кисловодск', 'Кострома', 'Краснодар', 'Красноярск', 'Курск', 'Магнитогорск', 'Москва', 'Нижний Новгород',
  'Нижний Тагил', 'Новокузнецк', 'Новосибирск', 'Омск', 'Оренбург', 'Пенза', 'Пермь', 'Ростов-на-Дону', 'Рязань', 'Самара',
  'Санкт-Петербург', 'Саратов', 'Севастополь', 'Симферополь', 'Сочи', 'Ставрополь', 'Тверь', 'Тула', 'Тюмень', 'Уфа',
  'Хабаровск', 'Челябинск', 'Ярославль',
];
