import type { Diet, StockItem } from './types';

/** То же, что вставляет supabase/migrations/001_init.sql. Используется в демо-режиме. */

const t = '2026-01-01T00:00:00.000Z';

export const SEED_STOCK_ITEMS: StockItem[] = [
  { id: 'hay', name: 'Сено', kind: 'count', unit: 'тюк', sack_kg: null, kg_per_garets: null, low_days: 3, sort: 1, updated_at: t },
  { id: 'veg', name: 'Овощи', kind: 'kg', unit: 'кг', sack_kg: null, kg_per_garets: 15, low_days: 3, sort: 2, updated_at: t },
  { id: 'formamax', name: 'ФормаМакс', kind: 'sack', unit: 'кг', sack_kg: 20, kg_per_garets: null, low_days: 3, sort: 3, updated_at: t },
  { id: 'optiform', name: 'ОптиФорм Микс (Юниор)', kind: 'sack', unit: 'кг', sack_kg: 20, kg_per_garets: null, low_days: 3, sort: 4, updated_at: t },
  { id: 'monograss', name: 'Mono Grass', kind: 'sack', unit: 'кг', sack_kg: 20, kg_per_garets: null, low_days: 3, sort: 5, updated_at: t },
  { id: 'hercules', name: 'Геркулес', kind: 'sack', unit: 'кг', sack_kg: 30, kg_per_garets: 1.13, low_days: 3, sort: 6, updated_at: t },
  { id: 'bran', name: 'Отруби', kind: 'sack', unit: 'кг', sack_kg: 20, kg_per_garets: 0.83, low_days: 3, sort: 7, updated_at: t },
  { id: 'oats', name: 'Овёс', kind: 'sack', unit: 'кг', sack_kg: 40, kg_per_garets: 1.5, low_days: 3, sort: 8, updated_at: t },
  { id: 'corn', name: 'Кукуруза', kind: 'sack', unit: 'кг', sack_kg: 45, kg_per_garets: 2.4, low_days: 3, sort: 9, updated_at: t },
  { id: 'seeds', name: 'Семечки', kind: 'sack', unit: 'кг', sack_kg: 25, kg_per_garets: 1.4, low_days: 3, sort: 10, updated_at: t },
  { id: 'bags', name: 'Мешки для мусора 240 л', kind: 'count', unit: 'шт', sack_kg: null, kg_per_garets: null, low_days: 3, sort: 11, updated_at: t },
];

const porridge = (item: string, name: string, qty: number) => [
  { time: '13:00', title: 'Каша', prep: 'запарить за 20 мин · через 45–60 мин после манежа', items: [{ item, name, qty, unit: 'кг' as const }] },
  { time: '17:00', title: 'Каша', prep: 'запарить за 20 мин', items: [{ item, name, qty, unit: 'кг' as const }] },
];

const veg = () => ({
  time: '19:00',
  title: 'Овощи',
  prep: 'мыть, крупная нарезка · таз на каждую',
  items: [{ item: 'veg', name: 'Тыква, капуста, морковь, свёкла, картофель, сельдерей — по сезону', qty: null, unit: 'кг' as const }],
});

export const SEED_DIETS: Diet[] = [
  {
    id: 'Претти',
    hay_kg: 60,
    branches_kg: 10,
    updated_at: t,
    meals: [
      {
        time: '07:00',
        title: 'Зерносмесь',
        prep: '',
        items: [
          { item: 'hercules', name: 'Геркулес', qty: 2, unit: 'гарец' },
          { item: 'bran', name: 'Отруби', qty: 2, unit: 'гарец' },
          { item: 'oats', name: 'Овёс', qty: 1, unit: 'гарец' },
          { item: 'corn', name: 'Кукуруза', qty: 0.5, unit: 'гарец' },
          { item: 'seeds', name: 'Семечки', qty: 300, unit: 'г' },
        ],
      },
      ...porridge('formamax', 'ФормаМакс', 2),
      veg(),
    ],
  },
  {
    id: 'Марго',
    hay_kg: 55,
    branches_kg: 10,
    updated_at: t,
    meals: [
      {
        time: '07:00',
        title: 'Зерносмесь',
        prep: '',
        items: [
          { item: 'hercules', name: 'Геркулес', qty: 1, unit: 'гарец' },
          { item: 'bran', name: 'Отруби', qty: 1, unit: 'гарец' },
          { item: 'oats', name: 'Овёс', qty: 0.5, unit: 'гарец' },
          { item: 'corn', name: 'Кукуруза', qty: 300, unit: 'г' },
          { item: 'seeds', name: 'Семечки', qty: 200, unit: 'г' },
        ],
      },
      ...porridge('optiform', 'ОптиФорм Микс (Юниор)', 1.5),
      veg(),
    ],
  },
  {
    id: 'Одри',
    hay_kg: 50,
    branches_kg: 10,
    updated_at: t,
    meals: [
      {
        time: '07:00',
        title: 'Зерносмесь',
        prep: '',
        items: [
          { item: 'hercules', name: 'Геркулес', qty: 1, unit: 'гарец' },
          { item: 'bran', name: 'Отруби', qty: 1, unit: 'гарец' },
          { item: 'oats', name: 'Овёс', qty: 0.5, unit: 'гарец' },
          { item: 'seeds', name: 'Семечки', qty: 200, unit: 'г' },
        ],
      },
      ...porridge('monograss', 'Mono Grass', 1.5),
      veg(),
    ],
  },
];
