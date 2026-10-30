import type { Diet, MealItem, StockCategory, StockItem, StockMove } from './types';
import { addDays, isoDate, localDay, plural } from '../lib/dates';

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

/** Движение a раньше b: по времени записи, при равном — по id (одинаково на всех телефонах). */
function before(a: StockMove, b: StockMove) {
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  return ta < tb || (ta === tb && a.id < b.id);
}

/** Последний пересчёт позиции — точка отсчёта её остатка; null, если позицию не пересчитывали. */
export function lastCountOf(moves: StockMove[], itemId: string): StockMove | null {
  let last: StockMove | null = null;
  for (const m of moves) if (m.item_id === itemId && m.counted != null && (!last || before(last, m))) last = m;
  return last;
}

/** Движение лежит до последнего пересчёта своей позиции: остаток его уже не учитывает (пересчёт включает его в себя). */
export function isBeforeCount(m: StockMove, moves: StockMove[]): boolean {
  const c = lastCountOf(moves, m.item_id);
  return Boolean(c && m.counted == null && before(m, c));
}

/**
 * Остатки. Последний пересчёт позиции (counted) — точка отсчёта: остаток = пересчитанное + движения после него.
 * Чужие списания, сделанные до пересчёта и пришедшие позже, итог не меняют. Без пересчёта — сумма всех движений.
 */
export function balances(moves: StockMove[]): Map<string, number> {
  const lastCount = new Map<string, StockMove>();
  for (const m of moves) {
    if (m.counted == null) continue;
    const c = lastCount.get(m.item_id);
    if (!c || before(c, m)) lastCount.set(m.item_id, m);
  }
  const out = new Map<string, number>();
  for (const [id, c] of lastCount) out.set(id, Number(c.counted));
  for (const m of moves) {
    const c = lastCount.get(m.item_id);
    if (c && (m === c || before(m, c))) continue;
    out.set(m.item_id, (out.get(m.item_id) ?? 0) + Number(m.delta));
  }
  return out;
}

/** Средний расход в сутки: делим на число дней, за которые есть выдачи (а не всегда на 7). */
function avgPerDay(moves: StockMove[]): number {
  const days = new Set(moves.map((m) => localDay(m.created_at))).size;
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Расход в сутки по каждой позиции — для «хватит на N дней» и «Заканчивается»:
 * рацион (или выдачи «по весу», или тюки и мешки по счётчикам) плюс фактические «вне рациона» и брак за 7 дней.
 * Так у яблок и бананов, которых нет в рационе, тоже есть расход.
 */
export function stockPerDay(items: StockItem[], diets: Diet[], moves: StockMove[], now = Date.now()): Map<string, number | null> {
  const usage = dailyUsage(diets, items);
  const noQty = itemsWithoutQty(diets);
  const since = now - WEEK_MS;
  const outside = new Map<string, number>();
  for (const m of moves) {
    if ((m.reason === 'extra' || m.reason === 'waste') && Date.parse(m.created_at) >= since) outside.set(m.item_id, (outside.get(m.item_id) ?? 0) - Number(m.delta));
  }
  const out = new Map<string, number | null>();
  for (const it of items) {
    if (it.kind === 'count') {
      out.set(it.id, countPerDay(moves, it.id) || null);
      continue;
    }
    const base = noQty.has(it.id) ? weighedPerDay(moves, it.id) : (usage.get(it.id) ?? 0);
    const total = base + (outside.get(it.id) ?? 0) / 7;
    out.set(it.id, total > 0 ? total : null);
  }
  return out;
}

/** Средний расход в сутки по фактическим выдачам «по весу» за 7 дней. */
export function weighedPerDay(moves: StockMove[], itemId: string, today = isoDate()): number {
  const from = addDays(today, -7);
  return avgPerDay(moves.filter((m) => m.item_id === itemId && m.id.startsWith('veg:') && localDay(m.created_at) >= from));
}

/** Штучные позиции (сено, мешки): среднее в сутки по выдачам за последние 7 дней. */
export function countPerDay(moves: StockMove[], itemId: string, today = isoDate()): number {
  const from = addDays(today, -7);
  return avgPerDay(moves.filter((m) => m.item_id === itemId && (m.reason === 'hay' || m.reason === 'feed') && localDay(m.created_at) >= from));
}

/** Сколько это в единицах склада: мешки (ящики) — в кг по весу мешка, кг и штуки — как есть. */
export function toStockUnits(item: StockItem, n: number): number {
  return item.kind === 'sack' ? n * (item.sack_kg ?? 0) : n;
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
  /** может быть меньше нуля — значит, не внесли приход или пересчёт */
  balance: number;
  perDay: number | null;
  daysLeft: number | null;
  full: number; // полных мешков
  openFrac: number; // заполненность открытого мешка 0..1
  low: boolean;
}

export function stockView(item: StockItem, balance: number, perDay: number | null): StockView {
  // минус не прячем: он значит, что приход или пересчёт не внесли
  const b = Math.max(0, balance);
  const daysLeft = perDay && perDay > 0 ? b / perDay : null;
  let full = 0;
  let openFrac = 0;
  if (item.kind === 'sack' && item.sack_kg) {
    full = Math.floor(b / item.sack_kg + 1e-6);
    openFrac = (b - full * item.sack_kg) / item.sack_kg;
    if (openFrac < 0.01) openFrac = 0;
  }
  return { item, balance, perDay, daysLeft, full, openFrac, low: daysLeft != null && daysLeft < lowDays(item) };
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

/**
 * За сколько дней предупреждать «Заканчивается». Сено и корма на гастролях ищут и везут дольше, чем овощи.
 * 3 — старое значение «по умолчанию» у всех позиций: его считаем «не задано» и берём по группе (в выборе 3 нет).
 */
export const LOW_DAYS: Record<StockCategory, number> = { feed: 7, porridge: 7, grain: 7, veg: 3, supplements: 7, household: 5, other: 3 };
export const LOW_DAYS_OPTIONS = [2, 4, 5, 7, 10, 14];
export function lowDays(item: StockItem): number {
  return item.low_days && item.low_days !== 3 ? item.low_days : LOW_DAYS[categoryOf(item)];
}

/** На сколько дней подсказывать заказ. */
export const ORDER_DAYS = 14;

export interface OrderHint {
  /** сколько заказать в единицах закупки: мешков (крупы), кг (овощи и развес), штук/тюков */
  n: number;
  /** «7 мешков», «280 кг», «60 тюков» — для поля «Сколько» в закупке */
  text: string;
}

/** Сколько заказать, чтобы хватило на days дней по рациону с учётом того, что есть. null — расход неизвестен или хватает. */
export function orderHint(v: StockView, days = ORDER_DAYS): OrderHint | null {
  if (!v.perDay || v.perDay <= 0) return null;
  const need = v.perDay * days - Math.max(0, v.balance);
  if (need <= 0) return null;
  const it = v.item;
  if (it.kind === 'count') {
    const n = Math.ceil(need);
    return { n, text: `${n} ${plural(n, ...countWords(it.id, it.unit))}` };
  }
  if (it.kind === 'sack' && it.sack_kg && categoryOf(it) !== 'veg') {
    const n = Math.ceil(need / it.sack_kg);
    return { n, text: `${n} ${plural(n, ...packWords(it))}` };
  }
  // овощи и развес — в кг, круглым счётом до 10
  const n = Math.ceil(need / 10) * 10;
  return { n, text: `${n} кг` };
}

/** Последний пересчёт склада (по любой позиции): когда и кто. */
export function lastCount(moves: StockMove[]): StockMove | undefined {
  return moves.filter((m) => !m.deleted && m.counted != null).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
}

/** Поставки: приходы одного человека в пределах 2 часов — одна машина. Новые сверху. */
export function deliveries(moves: StockMove[]): { at: string; author: string; moves: StockMove[] }[] {
  const list = moves.filter((m) => !m.deleted).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const out: { at: string; author: string; moves: StockMove[] }[] = [];
  for (const m of list) {
    const last = out[out.length - 1];
    const tail = last?.moves[last.moves.length - 1];
    if (last && last.author === m.author_name && tail && Date.parse(tail.created_at) - Date.parse(m.created_at) <= 2 * 3_600_000) last.moves.push(m);
    else out.push({ at: m.created_at, author: m.author_name, moves: [m] });
  }
  return out;
}
