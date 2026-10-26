// Синхронизация: настоящие store / sync / actions приложения против поддельного сервера (src/test/fakeServer.ts).
// «Известные проблемы» — находки аудита 26.10.2026 (коды как на странице аудита). Они записаны так, как должно
// работать, и помечены it.fails: пока проблема есть, тест «ожидаемо падает». Исправили — тест начнёт проходить,
// it.fails это заметит и уронит проверку: тогда it.fails меняем на it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server, sleep, waitCycles } from '../test/fakeServer';
import { keeperA, net, phone, signedIn } from '../test/app';
import type { Diet, Note, Shift, StockItem, StockMove, VetRequest } from '../domain/types';

type New<T> = Omit<T, 'updated_at'>;
const at = '2026-10-26T08:00:00.000Z';
const note = (id: string, author = 'Кипер А'): New<Note> => ({ id, shift_id: 's1', elephant: 'Марго', kind: 'observation', metric: null, text: 'хромает', photo_path: null, author_name: author, created_at: at });
const request = (id: string): New<VetRequest> => ({ id, elephant: 'Марго', text: 'смотреть ногу', frequency: 'shift', due_date: null, needs_photo: false, urgent: false, author_id: 'vet', author_name: 'Врач', status: 'active', created_at: at });
const oats = (name = 'Овёс'): New<StockItem> => ({ id: 'oats', name, category: 'grain', kind: 'sack', unit: 'мешок', sack_kg: 40, kg_per_garets: null, low_days: 3, sort: 1 });
const move = (id: string): New<StockMove> => ({ id, item_id: 'hay', delta: -1, reason: 'hay', shift_id: null, author_name: 'А', created_at: at });
const shift = (id: string, extra: Partial<Shift> = {}): New<Shift> => ({
  id, date: '2026-10-26', keeper_id: 'user-a', keeper_name: 'Кипер А', status: 'open', safety: {}, state: {}, feeds: {}, quests: {},
  hay_bales: 0, note: '', accepted_at: at, handed_at: null, accept_remarks: '', ...extra,
});
const formamaxDiet = (id: string): New<Diet> => ({ id, hay_kg: 50, branches_kg: 10, meals: [{ time: '13:00', title: 'Каша', prep: '', items: [{ item: 'formamax', name: 'ФормаМакс', qty: 2, unit: 'кг' }] }] });
/** строка с сервера в виде типа приложения */
const serverRow = <T,>(table: string, id: string) => server.get(table, id) as unknown as T | undefined;

type Phone = Awaited<ReturnType<typeof phone>>;
/** один полный цикл синхронизации телефона */
async function syncOnce(p: Phone) {
  p.sync.startSync();
  await waitCycles(1);
  p.sync.stopSync(false);
}

beforeEach(() => {
  server.reset();
  localStorage.clear();
  signedIn();
  net.online = true;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('синхронизация — работает', () => {
  it('запись с телефона уходит на сервер, заявка врача приходит на телефон', async () => {
    server.write('requests', request('r1'));
    const p = await phone();
    await p.store.put('notes', note('n1'));
    await syncOnce(p);
    expect(server.get('notes', 'n1')?.text).toBe('хромает');
    expect(p.store.getRow('requests', 'r1')?.text).toBe('смотреть ногу');
    expect(p.store.pendingCount()).toBe(0);
  });

  it('без сети всё сохраняется на телефоне и уходит при появлении связи', async () => {
    const p = await phone();
    net.online = false;
    await p.store.put('notes', note('n1'));
    await p.sync.syncNow();
    expect(server.get('notes', 'n1')).toBeUndefined();
    expect(p.store.getRow('notes', 'n1')?.text).toBe('хромает');
    net.online = true;
    await syncOnce(p);
    expect(server.get('notes', 'n1')?.text).toBe('хромает');
  });

  it('два телефона правят разные поля одной смены — на сервере обе правки', async () => {
    server.write('shifts', shift('s1'));
    const a = await phone();
    await syncOnce(a);
    const b = await phone();
    await syncOnce(b);
    await a.actions.setCell(a.store.getRow('shifts', 's1')!, 'Марго', 'water', 1);
    await b.actions.updateShift(b.store.getRow('shifts', 's1')!, (s) => {
      s.note = 'Одри не доела';
    });
    await syncOnce(a);
    await syncOnce(b);
    const s = serverRow<Shift>('shifts', 's1')!;
    expect(s.state.Марго?.water?.level).toBe(1);
    expect(s.note).toBe('Одри не доела');
  });

  it('галочка одного кормления с двух телефонов — одно списание, а не два', async () => {
    server.write('stock_items', { ...oats(), id: 'formamax', name: 'ФормаМакс', category: 'porridge' });
    for (const el of ['Претти', 'Марго', 'Одри']) server.write('diets', formamaxDiet(el));
    server.write('shifts', shift('s1'));
    const a = await phone();
    await syncOnce(a);
    const b = await phone();
    await syncOnce(b);
    await a.actions.setFeedDone(a.store.getRow('shifts', 's1')!, '13:00', true, keeperA);
    await b.actions.setFeedDone(b.store.getRow('shifts', 's1')!, '13:00', true, keeperA);
    await syncOnce(a);
    await syncOnce(b);
    const feed = server.rows('stock_moves').filter((m) => m.reason === 'feed');
    expect(feed.map((m) => [m.item_id, m.delta])).toEqual([['formamax', -6]]);
  });

  it('сменился сервер — телефон забывает старые данные и забирает всё заново', async () => {
    const p = await phone();
    // телефон работал с другим сервером и «уже скачал» всё до 2099 года
    await p.idb.idbPut('meta', { key: 'server', value: 'https://old.example#1' });
    await p.idb.idbPut('meta', { key: 'cursor:stock_items', value: '2099-01-01T00:00:00Z' });
    await p.store.seedRows('stock_items', [{ ...oats('С прошлого сервера'), id: 'ghost', updated_at: at }]);
    server.write('stock_items', oats());
    await syncOnce(p);
    expect(p.store.getRows('stock_items').map((i) => i.id)).toEqual(['oats']);
  });
});

describe('синхронизация — известные проблемы (аудит)', () => {
  it.fails('С1: фото, которое сервер не принял, не останавливает отправку и приём остального', async () => {
    const p = await phone();
    await p.store.put('notes', note('n1'));
    await p.idb.idbPut('blobs', { path: 's1/p1.jpg', blob: new Blob(['x']), uploaded: false });
    server.storageFail = () => 'Payload too large';
    server.write('requests', request('r1'));
    p.sync.startSync();
    await sleep(200);
    await p.sync.syncNow();
    await sleep(200);
    p.sync.stopSync(false);
    expect(server.get('notes', 'n1')).toBeDefined();
    expect(p.store.getRow('requests', 'r1')).toBeDefined();
  });

  it.fails('С2: правку, которую сервер отклонил, телефон не шлёт вечно и показывает версию с сервера', async () => {
    server.write('stock_items', oats());
    const p = await phone();
    await syncOnce(p);
    server.rls = (table) => (table === 'stock_items' ? 'new row violates row-level security policy' : null);
    await p.store.put('stock_items', { ...p.store.getRow('stock_items', 'oats')!, name: 'Овёс шелушёный' });
    for (let i = 0; i < 3; i++) await syncOnce(p);
    expect(p.store.pendingCount()).toBe(0);
    expect(p.store.getRow('stock_items', 'oats')!.name).toBe('Овёс');
  });

  it.fails('С3: неотправленное кипера не уходит на сервер под входом другого человека', async () => {
    server.write('profiles', { id: 'user-a', login: 'a', full_name: 'Кипер А', role: 'keeper', active: true });
    server.write('profiles', { id: 'user-b', login: 'b', full_name: 'Врач Б', role: 'vet', active: true });
    const p = await phone();
    await p.auth.resumeSession();
    await waitCycles(1);
    net.online = false;
    await p.store.put('notes', note('n-a'));
    await p.auth.logout();
    net.online = true;
    await p.auth.loginCloud('b', 'пароль-врача');
    await sleep(100);
    p.sync.stopSync(false);
    const sentAsB = server.log.some((l) => l.kind === 'upsert' && l.table === 'notes' && l.id === 'n-a' && l.user === 'user-b');
    expect(sentAsB).toBe(false);
  });

  it.fails('С4: вторая вкладка не затирает более новую правку старой', async () => {
    server.write('stock_items', oats());
    const tab1 = await phone();
    await tab1.store.put('stock_items', oats('Овёс v1'));
    const tab2 = await phone({ sameStorage: true }); // открыта рядом: загрузила тот же outbox
    await syncOnce(tab1);
    server.write('stock_items', { ...server.get('stock_items', 'oats')!, name: 'Овёс v2' }); // правка с другого телефона
    await syncOnce(tab2);
    expect(server.get('stock_items', 'oats')!.name).toBe('Овёс v2');
  });

  it.fails('С5: строки с одинаковым временем на границе пачки в 500 доходят все', async () => {
    server.frozenTime = '2026-10-26T07:00:01.000Z';
    for (let i = 0; i < 501; i++) server.write('stock_moves', move(`m${String(i).padStart(3, '0')}`));
    server.frozenTime = null;
    const p = await phone();
    await syncOnce(p);
    await syncOnce(p);
    expect(p.store.getRows('stock_moves')).toHaveLength(501);
  });

  it.fails('С5: строка, чья запись закрылась позже, доходит до телефона', async () => {
    server.write('stock_moves', move('m1'), '2026-10-26T08:00:01.000Z');
    server.write('stock_moves', move('m3'), '2026-10-26T08:00:03.000Z');
    const p = await phone();
    await syncOnce(p);
    // транзакция другого телефона началась в 08:00:02 (now() в триггере), а закрылась только сейчас
    server.write('stock_moves', move('m2'), '2026-10-26T08:00:02.000Z');
    await syncOnce(p);
    expect(p.store.getRows('stock_moves').map((m) => m.id).sort()).toEqual(['m1', 'm2', 'm3']);
  });

  it.fails('Д2: смена, принятая без связи в ту же дату, не стирает отметки другого кипера', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T12:00:00+03:00'));
    server.write('shifts', shift('2026-10-26', { state: { Марго: { water: { level: 1, symptoms: ['пьёт мало'] } } }, feeds: { '07:00': { done: true } } }));
    const b = await phone(); // этой смены телефон кипера Б не видел
    await b.actions.acceptShift({ id: 'user-b', login: 'b', full_name: 'Кипер Б', role: 'keeper' }, { elephants: true });
    server.user = { id: 'user-b', name: 'Кипер Б', role: 'keeper' };
    await syncOnce(b);
    const s = serverRow<Shift>('shifts', '2026-10-26')!;
    expect(s.state.Марго?.water?.level).toBe(1);
  });

  it.todo('С6: просить у браузера постоянное хранилище; предупреждать, если что-то не отправлено дольше суток');
  it.todo('С7: удалять с телефона отправленные фото старше 30 дней');
  it.todo('С8: при переключении вкладок синхронизироваться не чаще раза в 15 секунд');
  it.todo('Д1: принять смену без кода, если у сдающего нет связи');
});
