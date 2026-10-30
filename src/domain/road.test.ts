// «В дороге» (этап C2): каши отменены, овощи и сено по плану, запас на новое место.
import { describe, expect, it } from 'vitest';
import { effectiveDiets, mealCancelled, roadMode } from './road';
import { moveNeeds } from './move';
import type { Diet, MoveItem, StockItem } from './types';

const item = (id: string, category: StockItem['category']): StockItem => ({ id, name: id, category, kind: 'sack', unit: 'мешок', sack_kg: 20, kg_per_garets: null, low_days: 3, sort: 1, updated_at: '' });
const items = [item('formamax', 'porridge'), item('carrot', 'veg'), item('oats', 'grain')];
const diet: Diet = {
  id: 'Претти', hay_kg: 60, branches_kg: 10, updated_at: '',
  meals: [
    { time: '13:00', title: 'Каша', prep: '', items: [{ item: 'formamax', name: 'ФормаМакс', qty: 2, unit: 'кг' }] },
    { time: '19:00', title: 'Овощи', prep: '', items: [{ item: 'carrot', name: 'Морковь', qty: 5, unit: 'кг' }, { item: 'oats', name: 'Овёс', qty: 1, unit: 'кг' }] },
  ],
};

describe('в дороге', () => {
  it('режим — строка _road в переезде', () => {
    expect(roadMode([]).on).toBe(false);
    expect(roadMode([{ id: '_road', qty: 1, done_at: '2026-10-30T08:00:00Z', done_by: 'Андрей' } as MoveItem]).on).toBe(true);
  });

  it('каши и зерносмесь убраны из рациона, остальное — как было; кормление только из каши отменено', () => {
    const road = effectiveDiets([diet], items, true);
    expect(road[0].meals.map((m) => m.items.map((i) => i.item))).toEqual([[], ['carrot']]); // каша и овёс убраны
    expect(mealCancelled([diet], road, '13:00')).toBe(true);
    expect(mealCancelled([diet], road, '19:00')).toBe(false);
    expect(effectiveDiets([diet], items, false)).toEqual([diet]);
  });

  it('с собой: овощи и мешки на дорогу и запас, сено на запас — только если на месте его нет; каш и зерносмеси нет', () => {
    const val = (n: ReturnType<typeof moveNeeds>, label: string) => n.find((x) => x.label === label)?.value;
    const noHay = moveNeeds(2, [], { reserve: 3, hayThere: false });
    expect(noHay.map((n) => n.label)).toEqual(['Коробок овощей', 'Сена, тюков', 'Мешков 240 л']);
    expect(val(noHay, 'Коробок овощей')).toBe('15'); // (2 + 3) дня × 3 головы
    expect(val(noHay, 'Сена, тюков')).toBe('≈ 45'); // 9 в день × (2 + 3)
    expect(val(moveNeeds(2, [], { reserve: 3, hayThere: true }), 'Сена, тюков')).toBe('≈ 18');
  });
});
