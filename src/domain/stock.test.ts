// Фураж: списания по кормлению и остатки (локально, без сервера).
// Коды (Ф1, Д3…) — находки аудита 26.10.2026; ещё не исправленные помечены it.fails, как в src/lib/sync.test.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import { keeperA, phone } from '../test/app';
import { balances, countPerDay, stockPerDay, stockView, toStockUnits } from './stock';
import { localDay, relDate } from '../lib/dates';
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

  it('«Привезли» по закупке: мешки переводятся в кг, приход один, закупка закрыта', async () => {
    const oats = { ...item('oats', 'Овёс', 'grain'), sack_kg: 40 };
    const purchase = { id: 'p1', item_id: 'oats', title: 'Овёс', amount: '5 мешков', note: '', urgent: false, status: 'ordered' as const, author_id: 'user-a', author_name: 'Кипер А', status_by: null, status_at: null, created_at: now, updated_at: now };
    expect(toStockUnits(oats, 5)).toBe(200);
    expect(await p.actions.arrivePurchase(purchase, oats, 5, keeperA, null)).toBe(200);
    await p.actions.arrivePurchase(purchase, oats, 5, keeperA, null); // второе нажатие
    expect(balances(p.store.getRows('stock_moves')).get('oats')).toBe(200);
    expect(p.store.getRow('purchases', 'p1')?.status).toBe('done');
  });

  it('остаток — сумма движений, минус в сумме сохраняется', () => {
    const b = balances([mv('in', 'oats', 40, 'in'), mv('f1', 'oats', -30, 'feed'), mv('f2', 'oats', -22, 'feed')]);
    expect(b.get('oats')).toBe(-12);
  });
});

describe('Фураж — находки аудита, исправлены на этапе 2', () => {
  it('Ф1: минус на складе виден, а не прячется за «закончилось»', () => {
    const v = stockView(item('oats', 'Овёс', 'grain'), balances([mv('f1', 'oats', -12, 'feed')]).get('oats')!, 4);
    expect(v.balance).toBe(-12);
    expect(v.low).toBe(true);
  });

  it('Ф1, Ф6: пересчёт при минусе даёт ровно пересчитанное', async () => {
    await p.store.put('stock_moves', mv('f1', 'oats', -12, 'feed'));
    await p.actions.countStock('oats', 50, keeperA, null);
    expect(balances(p.store.getRows('stock_moves')).get('oats')).toBe(50);
  });

  it('Ф2: рацион поменяли между галочкой и её снятием — списание по старому рациону тоже снимается', async () => {
    await p.actions.setFeedDone(s1(), '13:00', true, keeperA); // −2 кг ФормаМакс
    await p.store.put('diets', diet('optiform', 1.5)); // врач перевёл на ОптиФорм
    await p.actions.setFeedDone(s1(), '13:00', false, keeperA); // «не кормил»
    expect(activeFeed()).toEqual([]);
  });

  it('Ф3: яблоки (их нет в рационе) попадают в «Заканчивается» по фактическим выдачам', () => {
    const apple = item('apple', 'Яблоки', 'veg');
    const day = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
    const moves = [mv('in', 'apple', 20, 'in', day(4)), mv('x1', 'apple', -5, 'extra', day(3)), mv('x2', 'apple', -5, 'extra', day(2)), mv('x3', 'apple', -5, 'waste', day(1))];
    const perDay = stockPerDay([apple], [], moves).get('apple')!;
    expect(perDay).toBeCloseTo(15 / 7);
    expect(stockView(apple, balances(moves).get('apple')!, perDay).low).toBe(true); // 5 кг — на 2 с лишним дня
  });

  it('Ф4: «вне рациона» входит в расход вместе с рационом', () => {
    const potato = item('potato', 'Картофель', 'veg');
    const diets = ['Претти', 'Марго', 'Одри'].map((id) => ({ ...diet('potato', 20, id), meals: [{ time: '19:00', title: 'Овощи', prep: '', items: [{ item: 'potato', name: 'Картофель', qty: 20, unit: 'кг' as const }] }] }));
    const day = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
    const moves = [1, 2, 3, 4, 5].map((d) => mv(`x${d}`, 'potato', -30, 'extra', day(d)));
    expect(stockPerDay([potato], diets, moves).get('potato')).toBeCloseTo(60 + 150 / 7);
  });

  it('Ф5: приход по закупке с одним id — повтор не задваивает', async () => {
    await p.actions.addStockMove('hay', 30, 'in', keeperA, null, 'in:purchase:p1');
    await p.actions.addStockMove('hay', 30, 'in', keeperA, null, 'in:purchase:p1');
    expect(balances(p.store.getRows('stock_moves')).get('hay')).toBe(30);
  });

  it('Ф6: чужое списание, сделанное до пересчёта и пришедшее позже, итог не меняет; сделанное после — меняет', () => {
    const t = (min: number) => new Date(Date.parse('2026-10-26T10:00:00Z') + min * 60_000).toISOString();
    const count = { ...mv('c', 'oats', -10, 'fix', t(10)), counted: 90 }; // телефон видел 100, пересчитали 90
    const moves = [mv('in', 'oats', 100, 'in', t(0)), count, mv('other', 'oats', -10, 'feed', t(5))]; // чужое — в 10:05, до пересчёта
    expect(balances(moves).get('oats')).toBe(90);
    expect(balances([...moves, mv('later', 'oats', -10, 'feed', t(20))]).get('oats')).toBe(80);
  });

  it('Ф7: строка рациона «по весу» списывается по вписанным кг, без «тазов»', async () => {
    await p.store.seedRows('stock_items', [item('pumpkin', 'Тыква', 'veg')]);
    await p.store.put('diets', { ...diet('formamax', 2), meals: [{ time: '19:00', title: 'Овощи', prep: '', items: [{ item: 'pumpkin', name: 'Тыква', qty: null, unit: 'кг' }] }] });
    await p.actions.setFeedDone(s1(), '19:00', true, keeperA);
    expect(p.store.getRows('stock_moves').filter((m) => m.item_id === 'pumpkin')).toEqual([]); // сама не списывает
    await p.actions.setFeedKg(s1(), '19:00', 'pumpkin', 12, keeperA);
    expect(balances(p.store.getRows('stock_moves')).get('pumpkin')).toBe(-12);
    await p.actions.setFeedDone(s1(), '19:00', false, keeperA);
    expect(balances(p.store.getRows('stock_moves')).get('pumpkin') ?? 0).toBe(0);
  });
});

describe('даты — находка аудита Д3, исправлена на этапе 3', () => {
  const inMoscow = (fn: () => void) => {
    const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
    const tz = env.TZ;
    env.TZ = 'Europe/Moscow';
    try {
      fn();
    } finally {
      env.TZ = tz;
    }
  };

  it('Д3: две выдачи сена в одни местные сутки — один день расхода', () =>
    inMoscow(() => {
      const at = (local: string) => new Date(local).toISOString();
      const moves = [mv('h1', 'hay', -5, 'hay', at('2026-10-26T01:00:00+03:00')), mv('h2', 'hay', -5, 'hay', at('2026-10-26T23:00:00+03:00'))];
      expect(countPerDay(moves, 'hay', '2026-10-27')).toBe(10);
    }));

  it('Д3: запись в 00:30 по Москве — сегодняшняя', () =>
    inMoscow(() => {
      const created = new Date('2026-10-26T00:30:00+03:00').toISOString(); // так её пишет приложение: 2026-10-25T21:30Z
      expect(localDay(created)).toBe('2026-10-26');
      expect(relDate(localDay(created), '2026-10-26')).toBe('сегодня');
    }));
});

describe('Фураж — правка после пересчёта склада (этап 1C аудита 30.10)', () => {
  const pause = () => new Promise((r) => setTimeout(r, 5));
  const bal = (id: string) => balances(p.store.getRows('stock_moves')).get(id) ?? 0;

  it('сено исправили уже после пересчёта: остаток уменьшается ровно на разницу, а не теряет правку', async () => {
    await p.actions.setHay(s1(), 8, keeperA);
    await pause();
    await p.actions.countStock('hay', 20, keeperA, null); // посчитали уже после выдачи 8 тюков
    await pause();
    await p.actions.setHay(s1(), 9, keeperA); // «нет, выдали 9»
    expect(bal('hay')).toBe(19);
    await pause();
    await p.actions.setHay(s1(), 10, keeperA); // и ещё раз — разницы не должны накапливаться дважды
    expect(bal('hay')).toBe(18);
  });

  it('галочку кормления сняли после пересчёта: списанное возвращается на склад', async () => {
    await p.actions.setFeedDone(s1(), '13:00', true, keeperA);
    await pause();
    await p.actions.countStock('formamax', 10, keeperA, null);
    await pause();
    await p.actions.setFeedDone(s1(), '13:00', false, keeperA);
    expect(bal('formamax')).toBe(12); // 10 по пересчёту + 2 возвращённые
    await pause();
    await p.actions.setFeedDone(s1(), '13:00', true, keeperA); // поставили снова
    expect(bal('formamax')).toBe(10);
  });

  it('снятие и повтор галочки не стирают «½ / отказ» и вес', async () => {
    await p.actions.setFeedDone(s1(), '13:00', true, keeperA);
    await p.actions.cycleEaten(s1(), '13:00', 'Марго'); // all → half
    await p.actions.setFeedDone(s1(), '13:00', false, keeperA);
    await p.actions.setFeedDone(s1(), '13:00', true, keeperA);
    expect(s1().feeds['13:00']?.eaten?.['Марго']).toBe('half');
  });
});

describe('Фураж — приём смены без сдачи и приходы (этап 1C аудита 30.10)', () => {
  it('кормление отмечено в двух сменах одного дня (приём без сдачи офлайн) — списывается один раз', async () => {
    const s2: Shift = { ...shift, id: 's2', keeper_id: 'user-b', keeper_name: 'Кипер Б', accepted_from: 's1' };
    await p.store.seedRows('shifts', [s2]);
    await p.actions.setFeedDone(s1(), '13:00', true, keeperA);
    await p.actions.setFeedDone(p.store.getRow('shifts', 's2')!, '13:00', true, keeperA);
    expect(activeFeed()).toEqual([['formamax', -2]]);
    await p.actions.setFeedDone(p.store.getRow('shifts', 's2')!, '13:00', false, keeperA); // снял второй — вернулось всё
    expect(activeFeed()).toEqual([]);
  });

  it('вторая часть поставки — отдельный приход, а то же количество дважды — один', async () => {
    const oats = { ...item('oats', 'Овёс', 'grain'), sack_kg: 40 };
    const purchase = { id: 'p2', item_id: 'oats', title: 'Овёс', amount: '5 мешков', note: '', urgent: false, status: 'ordered' as const, author_id: 'user-a', author_name: 'Кипер А', status_by: null, status_at: null, created_at: now, updated_at: now };
    await p.actions.arrivePurchase(purchase, oats, 3, keeperA, null);
    await p.actions.arrivePurchase(purchase, oats, 3, keeperA, null);
    await p.actions.arrivePurchase(purchase, oats, 2, keeperA, null);
    const total = p.store.getRows('stock_moves').filter((m) => m.item_id === 'oats').reduce((s, m) => s + Number(m.delta), 0);
    expect(total).toBe(200); // 3 мешка (120 кг) + 2 мешка (80 кг), повтор не задвоил
  });
});

