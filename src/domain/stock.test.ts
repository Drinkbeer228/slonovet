// Фураж: списания по кормлению и остатки (локально, без сервера).
// «Известные проблемы» — находки аудита 26.10.2026; как и в src/lib/sync.test.ts, записаны так, как должно работать.
import { beforeEach, describe, expect, it } from 'vitest';
import { keeperA, phone } from '../test/app';
import { balances, countPerDay } from './stock';
import type { Diet, Shift, StockItem, StockMove } from './types';

const now = '2026-10-26T10:00:00.000Z';
const item = (id: string, name: string, category: StockItem['category'] = 'porridge'): StockItem => ({
  id, name, category, kind: 'sack', unit: 'мешок', sack_kg: 20, kg_per_garets: null, low_days: 3, sort: 1, updated_at: now,
});
const diet = (itemId: string, qty: number, id = 'Претти'): Diet => ({
  id, hay_kg: 60, branches_kg: 10, updated_at: now, meals: [{ time: '13:00', title: 'Каша', prep: '', items: [{ item: itemId, name: itemId, qty, unit: 'кг' }] }],
});
const shift: Shift = {
  id: 's1', date: '2026-10-26', keeper_id: 'user-a', keeper_name: 'Кипер А', status: 'open', safety: {}, state: {}, feeds: {}, quests: {},
  hay_bales: 0, note: '', accepted_at: now, handed_at: null, updated_at: now,
};
const mv = (id: string, item_id: string, delta: number, reason: StockMove['reason'], created_at = now): StockMove => ({
  id, item_id, delta, reason, shift_id: null, author_name: 'А', created_at, updated_at: now,
});

let p: Awaited<ReturnType<typeof phone>>;
beforeEach(async () => {
  p = await phone({ cloud: false });
  await p.store.seedRows('stock_items', [item('formamax', 'ФормаМакс'), item('optiform', 'ОптиФорм'), { ...item('hay', 'Сено', 'feed'), kind: 'count', unit: 'тюк', sack_kg: null }]);
  await p.store.seedRows('diets', [diet('formamax', 2)]);
  await p.store.seedRows('shifts', [shift]);
});
const s1 = () => p.store.getRow('shifts', 's1')!;
const activeFeed = () => p.store.getRows('stock_moves').filter((m) => m.reason === 'feed').map((m) => [m.item_id, m.delta]);

describe('Фураж — работает', () => {
  it('галочка кормления списывает по рациону, снятие галочки возвращает', async () => {
    await p.actions.setFeedDone(s1(), '13:00', true, keeperA);
    expect(activeFeed()).toEqual([['formamax', -2]]);
    await p.actions.setFeedDone(s1(), '13:00', false, keeperA);
    expect(activeFeed()).toEqual([]);
  });

  it('повторная галочка не задваивает списание', async () => {
    await p.actions.setFeedDone(s1(), '13:00', true, keeperA);
    await p.actions.setFeedDone(s1(), '13:00', true, keeperA);
    expect(activeFeed()).toEqual([['formamax', -2]]);
  });

  it('сено: тюки за смену — одно движение, правка его заменяет', async () => {
    await p.actions.setHay(s1(), 8, keeperA);
    await p.actions.setHay(s1(), 9, keeperA);
    const hay = p.store.getRows('stock_moves').filter((m) => m.item_id === 'hay');
    expect(hay.map((m) => m.delta)).toEqual([-9]);
  });

  it('остаток — сумма движений, минус в сумме сохраняется', () => {
    const b = balances([mv('in', 'oats', 40, 'in'), mv('f1', 'oats', -30, 'feed'), mv('f2', 'oats', -22, 'feed')]);
    expect(b.get('oats')).toBe(-12);
  });
});

describe('Фураж — известные проблемы (аудит)', () => {
  it.fails('Ф2: рацион поменяли между галочкой и её снятием — списание по старому рациону тоже снимается', async () => {
    await p.actions.setFeedDone(s1(), '13:00', true, keeperA); // −2 кг ФормаМакс
    await p.store.put('diets', diet('optiform', 1.5)); // врач перевёл на ОптиФорм
    await p.actions.setFeedDone(s1(), '13:00', false, keeperA); // «не кормил»
    expect(activeFeed()).toEqual([]);
  });

  it.fails('Д3: две выдачи сена в одни местные сутки — один день расхода', () => {
    const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
    const tz = env.TZ;
    env.TZ = 'Europe/Moscow';
    try {
      const at = (local: string) => new Date(local).toISOString();
      const moves = [mv('h1', 'hay', -5, 'hay', at('2026-10-26T01:00:00+03:00')), mv('h2', 'hay', -5, 'hay', at('2026-10-26T23:00:00+03:00'))];
      expect(countPerDay(moves, 'hay', '2026-10-27')).toBe(10);
    } finally {
      env.TZ = tz;
    }
  });

  it.todo('Ф1: показывать минус на складе; «Поправить остаток» считать от настоящего остатка, а не от показанного нуля');
  it.todo('Ф3: расход позиций вне рациона (яблоки, бананы) — по фактическим выдачам, чтобы работало «Заканчивается»');
  it.todo('Ф4: «вне рациона» входит в «хватит на N дней»');
  it.todo('Ф5: двойное «Привезли» и двойное «Выдали вне рациона» не задваивают движение');
  it.todo('Ф6: пересчёт склада — факт «на складе N на такое-то время», а не разница с тем, что видит телефон');
  it.todo('Д3: запись в 00:30 по Москве показывается сегодняшней');
});
