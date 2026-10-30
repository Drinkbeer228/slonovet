import { categoryOf } from './stock';
import type { Diet, MoveItem, StockItem } from './types';

/*
 * «В дороге»: на время переезда каши отменяются полностью (запаривать негде и некогда);
 * овощи — вечером по расписанию, сено и вода — вволю. Режим — одна строка в move_items, без новой таблицы:
 * qty = 1 — в дороге, done_at — с какого момента, done_by — кто включил.
 */
export const ROAD_ID = '_road';
/** Сколько дней запаса нужно на новом месте, пока не наладятся поставки (qty). */
export const RESERVE_ID = '_reserve';
/** Есть ли сено на новой точке (qty: 1 — есть, 0 — нет). */
export const HAY_THERE_ID = '_hay_there';

export interface RoadMode {
  on: boolean;
  since: string | null;
  by: string | null;
}

export function roadMode(rows: MoveItem[]): RoadMode {
  const r = rows.find((x) => x.id === ROAD_ID && !x.deleted);
  return { on: r?.qty === 1, since: r?.done_at ?? null, by: r?.done_by ?? null };
}

/** Рацион с учётом режима: в дороге из кормлений убраны каши. */
export function effectiveDiets(diets: Diet[], items: StockItem[], road: boolean): Diet[] {
  if (!road) return diets;
  const porridge = new Set(items.filter((i) => categoryOf(i) === 'porridge').map((i) => i.id));
  return diets.map((d) => ({ ...d, meals: d.meals.map((m) => ({ ...m, items: m.items.filter((mi) => !mi.item || !porridge.has(mi.item)) })) }));
}

/** Кормление отменено в дороге: в обычном рационе в нём что-то было, а в дорожном не осталось ничего. */
export function mealCancelled(diets: Diet[], road: Diet[], time: string): boolean {
  const had = diets.some((d) => d.meals.some((m) => m.time === time && m.items.length > 0));
  const left = road.some((d) => d.meals.some((m) => m.time === time && m.items.length > 0));
  return had && !left;
}
