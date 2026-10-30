// Фураж для кипера и закупщика: когда предупреждать, сколько заказать, поставки одной машиной.
import { describe, expect, it } from 'vitest';
import { deliveries, lastCount, lowDays, orderHint, stockView } from './stock';
import type { StockItem, StockMove } from './types';

const item = (id: string, category: StockItem['category'], kind: StockItem['kind'] = 'sack', extra: Partial<StockItem> = {}): StockItem => ({
  id, name: id, category, kind, unit: kind === 'count' ? 'тюк' : 'мешок', sack_kg: kind === 'sack' ? 20 : null, kg_per_garets: null, low_days: 3, sort: 1, updated_at: '', ...extra,
});
const mv = (id: string, created_at: string, author_name = 'Соколов', extra: Partial<StockMove> = {}): StockMove => ({ id, item_id: 'x', delta: 1, reason: 'in', shift_id: null, author_name, created_at, updated_at: '', ...extra });

describe('когда предупреждать', () => {
  it('сено, каши, зерно — за неделю; овощи — за 3 дня; своё значение у позиции — главнее', () => {
    expect(lowDays(item('hay', 'feed', 'count'))).toBe(7);
    expect(lowDays(item('oats', 'grain'))).toBe(7);
    expect(lowDays(item('carrot', 'veg'))).toBe(3);
    expect(lowDays(item('hay', 'feed', 'count', { low_days: 10 }))).toBe(10);
  });

  it('34 тюка при 10 в день — уже «заканчивается» (раньше молчало до 3 дней)', () => {
    expect(stockView(item('hay', 'feed', 'count'), 34, 10).low).toBe(true);
  });
});

describe('сколько заказать на 2 недели', () => {
  it('мешки — целыми, с учётом остатка', () => {
    // 4 кг в день × 14 = 56, есть 10 → 46 кг → 3 мешка по 20
    expect(orderHint(stockView(item('oats', 'grain'), 10, 4))).toEqual({ n: 3, text: '3 мешка' });
  });
  it('тюки — штуками, овощи — кг до десятков', () => {
    expect(orderHint(stockView(item('hay', 'feed', 'count'), 34, 10))?.text).toBe('106 тюков');
    expect(orderHint(stockView(item('carrot', 'veg'), 120, 60))?.text).toBe('720 кг');
  });
  it('хватает или расход неизвестен — не подсказываем', () => {
    expect(orderHint(stockView(item('oats', 'grain'), 100, 1))).toBeNull();
    expect(orderHint(stockView(item('oats', 'grain'), 10, null))).toBeNull();
  });
});

describe('поставки и пересчёт', () => {
  it('приходы одного человека в пределах 2 часов — одна машина', () => {
    const list = [mv('a', '2026-10-15T10:00:00Z'), mv('b', '2026-10-15T10:05:00Z'), mv('c', '2026-10-15T11:30:00Z'), mv('d', '2026-10-20T09:00:00Z'), mv('e', '2026-10-20T09:10:00Z', 'Орлов')];
    expect(deliveries(list).map((d) => [d.author, d.moves.length])).toEqual([
      ['Орлов', 1],
      ['Соколов', 1],
      ['Соколов', 3],
    ]);
  });
  it('последний пересчёт — по любой позиции', () => {
    const list = [mv('a', '2026-10-15T10:00:00Z', 'А', { counted: 5, reason: 'fix' }), mv('b', '2026-10-20T10:00:00Z', 'Б', { counted: 3, reason: 'fix' }), mv('c', '2026-10-25T10:00:00Z')];
    expect(lastCount(list)?.author_name).toBe('Б');
  });
});
