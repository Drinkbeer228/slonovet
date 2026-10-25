import { describe, expect, it } from 'vitest';
import { SEED_DIETS, SEED_STOCK_ITEMS } from './seed';
import { countPerDay, feedUsage, itemToStockUnits } from './stock';
import { acceptedBy, currentShift, newHandoverCode, sortShifts } from './shift';
import type { Shift, StockMove } from './types';

describe('списание корма по рациону', () => {
  it('утренняя зерносмесь на трёх слоних: гарцы переводятся в кг', () => {
    const u = feedUsage(SEED_DIETS, '07:00', SEED_STOCK_ITEMS);
    const per = (id: string) => SEED_STOCK_ITEMS.find((i) => i.id === id)!.kg_per_garets!;
    expect(u.get('hercules')).toBeCloseTo(4 * per('hercules')); // 2 + 1 + 1 гарца
    expect(u.get('corn')).toBeCloseTo(0.5 * per('corn') + 0.3); // Претти в гарцах, Марго в граммах
    expect(u.get('seeds')).toBeCloseTo(0.7);
  });

  it('каша в 13:00 — у каждой своя', () => {
    const u = feedUsage(SEED_DIETS, '13:00', SEED_STOCK_ITEMS);
    expect(u.get('formamax')).toBe(2);
    expect(u.get('optiform')).toBe(1.5);
    expect(u.get('monograss')).toBe(1.5);
  });

  it('овощи «по образцу» по рецепту не списываются (их считает наполнение тазов)', () => {
    expect(feedUsage(SEED_DIETS, '19:00', SEED_STOCK_ITEMS).has('veg')).toBe(false);
  });

  it('гарец без заданного веса не превращается в ноль — просто не считается', () => {
    expect(itemToStockUnits({ item: 'x', name: 'x', qty: 1, unit: 'гарец' }, { ...SEED_STOCK_ITEMS[0], kg_per_garets: null })).toBeNull();
  });
});

describe('расход в сутки', () => {
  const move = (id: string, item: string, delta: number, day: string, reason: StockMove['reason'] = 'hay'): StockMove => ({
    id,
    item_id: item,
    delta,
    reason,
    shift_id: null,
    author_name: 'тест',
    created_at: `${day}T20:00:00.000Z`,
    updated_at: '',
  });

  it('сено: среднее по дням с выдачей, приход не считается', () => {
    const moves = [move('a', 'hay', -9, '2026-10-23'), move('b', 'hay', -11, '2026-10-24'), move('in', 'hay', 160, '2026-10-24', 'in')];
    expect(countPerDay(moves, 'hay', '2026-10-25')).toBe(10);
  });

  it('мешки считаются отдельно от сена', () => {
    const moves = [move('h', 'hay', -9, '2026-10-24'), move('g', 'bags', -2, '2026-10-24', 'feed')];
    expect(countPerDay(moves, 'bags', '2026-10-25')).toBe(2);
  });
});

describe('передача смены', () => {
  const s = (id: string, date: string, status: Shift['status'], extra: Partial<Shift> = {}): Shift => ({
    id,
    date,
    keeper_id: 'k',
    keeper_name: 'Соколов',
    status,
    safety: {},
    state: {},
    feeds: {},
    quests: {},
    hay_bales: 0,
    note: '',
    accepted_at: `${date}T08:00:00.000Z`,
    handed_at: null,
    updated_at: '',
    ...extra,
  });

  it('код — 4 цифры, не из одинаковых', () => {
    for (let i = 0; i < 200; i++) {
      const c = newHandoverCode();
      expect(c).toMatch(/^\d{4}$/);
      expect(new Set(c).size).toBeGreaterThan(1);
    }
  });

  it('кто принял сданную смену', () => {
    const old = s('2026-10-24', '2026-10-24', 'handed');
    const next = s('2026-10-25', '2026-10-25', 'open', { accepted_from: old.id });
    expect(acceptedBy([old, next], old)?.id).toBe(next.id);
  });

  it('две смены за день: текущая — свежая открытая', () => {
    const morning = s('d', '2026-10-25', 'handed');
    const day = s('d-2', '2026-10-25', 'open', { accepted_at: '2026-10-25T13:00:00.000Z' });
    expect(sortShifts([morning, day])[0].id).toBe('d-2');
    expect(currentShift([morning, day])?.id).toBe('d-2');
  });
});
