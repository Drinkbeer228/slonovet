import type { StockCategory, Supplier } from './types';

/** Что возят — чипами, без ввода. */
export const SUPPLIES = ['Сено', 'Овощи', 'Зерно и каши', 'Опилки', 'Вода', 'Ветки', 'Другое'];

/** Оценка словами и цветом (классы целиком — чтобы Tailwind их увидел). */
export const QUALITY: Record<1 | 2 | 3, { label: string; cls: string }> = {
  3: { label: 'хорошо', cls: 'text-teal-fg' },
  2: { label: 'так себе', cls: 'text-amber-fg' },
  1: { label: 'плохо', cls: 'text-coral-fg' },
};

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е');

/**
 * Поиск по имени, городу, телефону, адресу, заметке и тому, что возят.
 * Порядок: текущий город наверху, внутри — лучшие по оценке, потом по имени.
 */
export function findSuppliers(list: Supplier[], query: string, city: string | null, here: string | null): Supplier[] {
  const q = norm(query);
  return list
    .filter((s) => !s.deleted && (!city || norm(s.city) === norm(city)))
    .filter((s) => !q || norm([s.name, s.city, s.phone, s.address, s.note, ...s.supplies].join(' ')).includes(q))
    .sort(
      (a, b) =>
        Number(here != null && norm(b.city) === norm(here)) - Number(here != null && norm(a.city) === norm(here)) ||
        (b.quality ?? 0) - (a.quality ?? 0) ||
        a.name.localeCompare(b.name, 'ru'),
    );
}

/** Города из справочника — для фильтра; текущий первым. */
export function supplierCities(list: Supplier[], here: string | null): string[] {
  const set = new Map<string, string>();
  for (const s of list) if (!s.deleted && s.city.trim()) set.set(norm(s.city), s.city.trim());
  return [...set.entries()].sort(([a], [b]) => Number(here != null && b === norm(here)) - Number(here != null && a === norm(here)) || a.localeCompare(b, 'ru')).map(([, v]) => v);
}

/** Что из справочника «возят» подходит к группе позиции склада. */
const SUPPLY_FOR: Partial<Record<StockCategory, string[]>> = {
  feed: ['Сено', 'Ветки'],
  porridge: ['Зерно и каши'],
  grain: ['Зерно и каши'],
  veg: ['Овощи'],
  household: ['Опилки'],
};

/**
 * Кого предложить в «Заказано»: если город известен — только его поставщики, иначе все.
 * Сначала те, кто возит нужное, внутри — лучшие по оценке; «плохо» — в конце.
 */
export function suppliersFor(list: Supplier[], category: StockCategory | null, here: string | null): Supplier[] {
  const want = (category && SUPPLY_FOR[category]) || [];
  const fits = (s: Supplier) => Number(s.supplies.some((x) => want.includes(x)));
  return findSuppliers(list, '', here, here).sort((a, b) => Number(a.quality === 1) - Number(b.quality === 1) || fits(b) - fits(a));
}
