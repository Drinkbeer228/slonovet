import type { Diet, MealItem, StockCategory, StockItem, StockMove } from './types';
import { addDays, isoDate } from '../lib/dates';

/** Перевод позиции рецепта в единицы склада (кг или штуки). null — если перевести нельзя. */
export function itemToStockUnits(mi: MealItem, item: StockItem | undefined): number | null {
  if (!item || mi.qty == null) return null;
  if (mi.unit === 'кг') return mi.qty;
  if (mi.unit === 'г') return mi.qty / 1000;
  if (mi.unit === 'гарец') return item.kg_per_garets ? mi.qty * item.kg_per_garets : null;
  return null;
}

/** Сколько каждой позиции уходит на одно кормление (сумма по всем слонихам). */
export function feedUsage(diets: Diet[], time: string, items: StockItem[]): Map<string, number> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = new Map<string, number>();
  for (const d of diets) {
    const meal = d.meals.find((m) => m.time === time);
    if (!meal) continue;
    for (const mi of meal.items) {
      if (!mi.item) continue;
      const v = itemToStockUnits(mi, byId.get(mi.item));
      if (v == null) continue;
      out.set(mi.item, (out.get(mi.item) ?? 0) + v);
    }
  }
  return out;
}

/** Расход в сутки по рациону. */
export function dailyUsage(diets: Diet[], items: StockItem[]): Map<string, number> {
  const times = new Set(diets.flatMap((d) => d.meals.map((m) => m.time)));
  const out = new Map<string, number>();
  for (const t of times) {
    for (const [k, v] of feedUsage(diets, t, items)) out.set(k, (out.get(k) ?? 0) + v);
  }
  return out;
}

/** Позиции, у которых в рационе не задано количество (например, овощи «по норме»). */
export function itemsWithoutQty(diets: Diet[]): Set<string> {
  const s = new Set<string>();
  for (const d of diets) for (const m of d.meals) for (const mi of m.items) if (mi.item && mi.qty == null) s.add(mi.item);
  return s;
}

export function balances(moves: StockMove[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of moves) out.set(m.item_id, (out.get(m.item_id) ?? 0) + Number(m.delta));
  return out;
}

/** Средний расход в сутки: делим на число дней, за которые есть выдачи (а не всегда на 7). */
function avgPerDay(moves: StockMove[]): number {
  const days = new Set(moves.map((m) => m.created_at.slice(0, 10))).size;
  if (!days) return 0;
  return moves.reduce((s, m) => s - Number(m.delta), 0) / days;
}

/** Позиции, которые кипер выдаёт «по весу»: в рационе есть строка без количества. */
export function weighedItem(diets: Diet[], time: string): string | null {
  for (const d of diets) {
    const meal = d.meals.find((m) => m.time === time);
    const it = meal?.items.find((mi) => mi.item && mi.qty == null);
    if (it?.item) return it.item;
  }
  return null;
}

/** Средний расход в сутки по фактическим выдачам «по весу» за 7 дней. */
export function weighedPerDay(moves: StockMove[], itemId: string, today = isoDate()): number {
  const from = addDays(today, -7);
  return avgPerDay(moves.filter((m) => m.item_id === itemId && m.id.startsWith('veg:') && m.created_at.slice(0, 10) >= from));
}

/** Штучные позиции (сено, мешки): среднее в сутки по выдачам за последние 7 дней. */
export function countPerDay(moves: StockMove[], itemId: string, today = isoDate()): number {
  const from = addDays(today, -7);
  return avgPerDay(moves.filter((m) => m.item_id === itemId && (m.reason === 'hay' || m.reason === 'feed') && m.created_at.slice(0, 10) >= from));
}

/** Как называть штуки на складе. */
const COUNT_WORDS: Record<string, [string, string, string]> = {
  hay: ['тюк', 'тюка', 'тюков'],
  bags: ['мешок', 'мешка', 'мешков'],
};
/** Как называть штуки: у сена и мешков — склонения, у остального — единица, которую вписали при добавлении. */
export function countWords(itemId: string, unit = 'шт.'): [string, string, string] {
  return COUNT_WORDS[itemId] ?? [unit, unit, unit];
}

const WORDS: Record<string, [string, string, string]> = {
  мешок: ['мешок', 'мешка', 'мешков'],
  ящик: ['ящик', 'ящика', 'ящиков'],
  сетка: ['сетка', 'сетки', 'сеток'],
  ведро: ['ведро', 'ведра', 'вёдер'],
  гроздь: ['гроздь', 'грозди', 'гроздей'],
};

/** Как хранится: мешок, ящик, сетка (у старых круп в unit записано «кг» — значит мешок). */
export function packWords(item: StockItem): [string, string, string] {
  return WORDS[item.unit] ?? WORDS['мешок'];
}

/** «3 мешка», «4,5 мешка», «5 мешков»: дробное — всегда «мешка». */
export function countText(n: number, words: [string, string, string]): string {
  const r = Math.round(n * 10) / 10;
  if (!Number.isInteger(r)) return `${fmtNum(r, 1)} ${words[1]}`;
  const [one, few, many] = words;
  const m10 = r % 10;
  const m100 = r % 100;
  const w = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return `${r} ${w}`;
}

/** Группы фуража по порядку на экране. */
export const STOCK_CATEGORIES: { id: StockCategory; title: string }[] = [
  { id: 'feed', title: 'Корма' },
  { id: 'porridge', title: 'Каши' },
  { id: 'grain', title: 'Зерно и крупы' },
  { id: 'veg', title: 'Овощи и фрукты' },
  { id: 'supplements', title: 'Добавки и витамины' },
  { id: 'household', title: 'Хозяйство' },
  { id: 'other', title: 'Прочее' },
];

/** Группа позиции; у старых записей (до групп) — по известным позициям. */
const KNOWN_CATEGORY: Record<string, StockCategory> = {
  hay: 'feed',
  veg: 'veg',
  formamax: 'porridge',
  optiform: 'porridge',
  monograss: 'porridge',
  hercules: 'grain',
  bran: 'grain',
  oats: 'grain',
  corn: 'grain',
  seeds: 'grain',
  bags: 'household',
};
export function categoryOf(item: StockItem): StockCategory {
  return item.category ?? KNOWN_CATEGORY[item.id] ?? 'other';
}

/** Сено, овощи и мешки списываются по счётчикам дежурства — их не удалить. */
const BUILT_IN = new Set(['hay', 'veg', 'bags']);

/** Почему позицию нельзя удалить (или null — можно). */
export function deleteBlocker(item: StockItem, diets: Diet[]): string | null {
  if (BUILT_IN.has(item.id)) return 'Списывается по счётчикам дежурства — удалить нельзя, можно переименовать.';
  if (diets.some((d) => d.meals.some((m) => m.items.some((mi) => mi.item === item.id))))
    return 'Есть в рационе и списывается при кормлении. Сначала уберите её из рациона у врача.';
  return null;
}


export interface StockView {
  item: StockItem;
  balance: number;
  perDay: number | null;
  daysLeft: number | null;
  full: number; // полных мешков
  openFrac: number; // заполненность открытого мешка 0..1
  low: boolean;
}

export function stockView(item: StockItem, balance: number, perDay: number | null): StockView {
  const b = Math.max(0, balance);
  const daysLeft = perDay && perDay > 0 ? b / perDay : null;
  let full = 0;
  let openFrac = 0;
  if (item.kind === 'sack' && item.sack_kg) {
    full = Math.floor(b / item.sack_kg + 1e-6);
    openFrac = (b - full * item.sack_kg) / item.sack_kg;
    if (openFrac < 0.01) openFrac = 0;
  }
  return { item, balance: b, perDay, daysLeft, full, openFrac, low: daysLeft != null && daysLeft < item.low_days };
}

export function fmtNum(n: number, digits = 1) {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return r.toLocaleString('ru-RU', { maximumFractionDigits: digits });
}

/** Насыпная плотность относительно овса — для калибровки мерного совка (примерно).
 *  Совок (гарец) у слоноводов — 2 кг овса; остальное зерно пересчитано по плотности. */
export const GRAIN_RATIO: Record<string, number> = {
  oats: 1,
  hercules: 0.75,
  bran: 0.55,
  corn: 1.6,
  seeds: 0.93,
};
