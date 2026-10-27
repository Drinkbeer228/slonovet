// Синхронизация: настоящие store / sync / actions приложения против поддельного сервера (src/test/fakeServer.ts).
// Коды (С1, Д2…) — находки аудита 26.10.2026, как на странице аудита. Ещё не исправленные записаны так, как должно
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
/** один полный цикл синхронизации телефона; возвращает, чем он закончился */
async function syncOnce(p: Phone) {
  p.sync.startSync();
  await waitCycles(1);
  for (let i = 0; i < 100 && p.sync.getSyncStatus().state === 'syncing'; i++) await sleep(5);
  const result = p.sync.getSyncStatus();
  p.sync.stopSync(false);
  return result;
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

  it('комментарий к заявке уходит на сервер, ответ врача приходит на телефон', async () => {
    server.write('requests', request('r1'));
    server.write('request_comments', { id: 'c-vet', request_id: 'r1', author_id: 'vet', author_name: 'Врач', text: 'по миске', created_at: at });
    const p = await phone();
    const { addComment } = await import('../domain/actions');
    await syncOnce(p);
    await addComment('r1', keeperA, '  как считать?  ');
    await syncOnce(p);
    const mine = [...(server.tables.get('request_comments')?.values() ?? [])].find((r) => r.author_id === keeperA.id);
    expect(mine?.text).toBe('как считать?');
    expect(p.store.getRow('request_comments', 'c-vet')?.text).toBe('по миске');
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

describe('синхронизация — находки аудита, исправлены на этапе 1', () => {
  it('С1: фото, которое сервер не принял, не останавливает отправку и приём остального; потом уходит само', async () => {
    const p = await phone();
    await p.store.put('notes', note('n1'));
    await p.idb.idbPut('blobs', { path: 's1/p1.jpg', blob: new Blob(['x']), uploaded: false });
    server.storageFail = () => 'Payload too large';
    server.write('requests', request('r1'));
    const first = await syncOnce(p);
    expect(server.get('notes', 'n1')).toBeDefined();
    expect(p.store.getRow('requests', 'r1')).toBeDefined();
    expect(first.error).toMatch(/Фото не отправлено/);
    server.storageFail = () => null; // сервер снова принимает
    const second = await syncOnce(p);
    const blob = await p.idb.idbGet<{ uploaded: boolean }>('blobs', 's1/p1.jpg');
    expect(blob?.uploaded).toBe(true);
    expect(second.state).toBe('idle');
  });

  it('С2: правку, которую сервер отклонил, телефон убирает из очереди, возвращает версию с сервера и говорит об этом', async () => {
    server.write('stock_items', oats());
    const p = await phone();
    await syncOnce(p);
    server.rls = (table) => (table === 'stock_items' ? 'new row violates row-level security policy' : null);
    await p.store.put('stock_items', { ...p.store.getRow('stock_items', 'oats')!, name: 'Овёс шелушёный' });
    for (let i = 0; i < 3; i++) await syncOnce(p);
    expect(server.log.filter((l) => l.kind === 'upsert' && l.table === 'stock_items').length).toBe(1); // одна попытка, не вечно
    expect(p.store.pendingCount()).toBe(0);
    expect(p.store.getRow('stock_items', 'oats')!.name).toBe('Овёс');
    expect(p.sync.getSyncStatus().rejected.map((r) => [r.what, r.reason])).toEqual([['Позиция фуража «Овёс шелушёный»', 'нет прав']]);
    p.sync.clearRejected();
    expect(p.sync.getSyncStatus().rejected).toEqual([]);
  });

  it('С2: отклонённая новая запись (на сервере её нет) убирается с телефона', async () => {
    const p = await phone();
    server.rls = (table) => (table === 'notes' ? 'нет прав' : null);
    await p.store.put('notes', note('n-bad'));
    await syncOnce(p);
    expect(p.store.getRow('notes', 'n-bad')).toBeUndefined();
    expect(p.store.pendingCount()).toBe(0);
  });

  it('С2: временная ошибка (сеть, сервер перегружен, на сервере ещё нет колонки) — правка ждёт и уходит потом', async () => {
    const p = await phone();
    await p.store.put('notes', note('n1'));
    for (const f of [
      { status: 0, message: 'TypeError: fetch failed' },
      { status: 503, message: 'Service Unavailable' },
      { status: 400, code: 'PGRST204', message: "Could not find the 'x' column of 'notes' in the schema cache" },
    ]) {
      server.fail = () => f;
      await syncOnce(p);
      expect(p.store.pendingCount()).toBe(1);
      expect(p.sync.getSyncStatus().rejected).toEqual([]);
    }
    server.fail = () => null;
    await syncOnce(p);
    expect(server.get('notes', 'n1')).toBeDefined();
    expect(p.store.pendingCount()).toBe(0);
  });

  it('С3: неотправленное кипера не уходит под входом другого человека и уходит, когда кипер вернётся', async () => {
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
    const sent = () => server.log.filter((l) => l.kind === 'upsert' && l.table === 'notes' && l.id === 'n-a');
    expect(sent()).toEqual([]);
    expect(p.store.pendingCount()).toBe(0); // у врача своего неотправленного нет
    await p.auth.logout();
    await p.auth.loginCloud('a', 'пароль-кипера');
    await sleep(100);
    p.sync.stopSync(false);
    expect(sent().map((l) => l.user)).toEqual(['user-a']);
  });

  it('С4: вторая вкладка не затирает более новую правку старой', async () => {
    server.write('stock_items', oats());
    const tab1 = await phone();
    await tab1.store.put('stock_items', oats('Овёс v1'));
    const tab2 = await phone({ sameStorage: true }); // открыта рядом: загрузила тот же outbox
    await syncOnce(tab1);
    server.write('stock_items', { ...server.get('stock_items', 'oats')!, name: 'Овёс v2' }); // правка с другого телефона
    await syncOnce(tab2);
    expect(server.get('stock_items', 'oats')!.name).toBe('Овёс v2');
  });

  it('С5: строки с одинаковым временем на границе пачки в 500 доходят все', async () => {
    server.frozenTime = '2026-10-26T07:00:01.000Z';
    for (let i = 0; i < 501; i++) server.write('stock_moves', move(`m${String(i).padStart(3, '0')}`));
    server.frozenTime = null;
    const p = await phone();
    await syncOnce(p);
    expect(p.store.getRows('stock_moves')).toHaveLength(501);
  });

  it('С5: строка, чья запись закрылась позже, доходит до телефона', async () => {
    server.write('stock_moves', move('m1'), '2026-10-26T08:00:01.000Z');
    server.write('stock_moves', move('m3'), '2026-10-26T08:00:03.000Z');
    const p = await phone();
    await syncOnce(p);
    // транзакция другого телефона началась в 08:00:02 (now() в триггере), а закрылась только сейчас
    server.write('stock_moves', move('m2'), '2026-10-26T08:00:02.000Z');
    await syncOnce(p);
    expect(p.store.getRows('stock_moves').map((m) => m.id).sort()).toEqual(['m1', 'm2', 'm3']);
  });

  it('С5: телефон со старой меткой (только время) продолжает с неё, ничего не теряя', async () => {
    server.write('stock_moves', move('m1'), '2026-10-26T08:00:01.000Z');
    server.write('stock_moves', move('m2'), '2026-10-26T08:00:05.000Z');
    const p = await phone();
    await p.idb.idbPut('meta', { key: 'server', value: 'https://test.local#1' });
    await p.idb.idbPut('meta', { key: 'cursor:stock_moves', value: '2026-10-26T08:00:03.000Z' });
    await syncOnce(p);
    // m1 — в пределах перекрытия, m2 — новее метки: пришли обе
    expect(p.store.getRows('stock_moves').map((m) => m.id).sort()).toEqual(['m1', 'm2']);
    const cursor = await p.idb.idbGet<{ value: unknown }>('meta', 'cursor:stock_moves');
    expect(cursor?.value).toEqual({ ts: '2026-10-26T08:00:05.000Z', id: 'm2' });
  });

  it('люди (id — uuid) синхронизируются и при повторной синхронизации: без ошибки и с переименованием', async () => {
    const katya = { id: '2fcbc11b-0000-4000-8000-000000000001', login: 'katya', full_name: 'Катя', role: 'vet', active: true };
    server.write('profiles', katya);
    const p = await phone();
    expect((await syncOnce(p)).state).toBe('idle');
    server.write('profiles', { ...katya, full_name: 'Екатерина' }); // переименовали в «Персонале»
    const second = await syncOnce(p); // теперь с сохранённой меткой и перекрытием
    expect(second.error).toBeNull();
    expect(p.store.getRow('profiles', katya.id)?.full_name).toBe('Екатерина');
  });

  it('С6: при начале работы приложение просит у браузера постоянное хранилище — один раз', async () => {
    const persist = vi.fn(async () => true);
    (navigator as unknown as { storage?: unknown }).storage = { persist };
    try {
      const p = await phone();
      await syncOnce(p);
      await syncOnce(p);
      expect(persist).toHaveBeenCalledTimes(1);
    } finally {
      delete (navigator as unknown as { storage?: unknown }).storage;
    }
  });

  it('С7: отправленные фото старше 30 дней удаляются с телефона, свежие и неотправленные остаются', async () => {
    const p = await phone();
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await p.idb.idbPut('blobs', { path: 'old.jpg', blob: new Blob(['o']), uploaded: true, uploaded_at: old });
    await p.idb.idbPut('blobs', { path: 'fresh.jpg', blob: new Blob(['f']), uploaded: true, uploaded_at: new Date().toISOString() });
    await p.idb.idbPut('blobs', { path: 'legacy.jpg', blob: new Blob(['l']), uploaded: true });
    await p.idb.idbPut('blobs', { path: 'waiting.jpg', blob: new Blob(['w']), uploaded: false });
    server.storageFail = () => 'нет связи с хранилищем'; // неотправленное должно остаться
    await syncOnce(p);
    const left = (await p.idb.idbAll<{ path: string; uploaded_at?: string }>('blobs')).map((b) => b.path).sort();
    expect(left).toEqual(['fresh.jpg', 'legacy.jpg', 'waiting.jpg']);
    const legacy = await p.idb.idbGet<{ uploaded_at?: string }>('blobs', 'legacy.jpg');
    expect(legacy?.uploaded_at).toBeTruthy(); // старым записям отсчёт пошёл с сегодня
  });

  it('С8: при возвращении в приложение синхронизация не чаще раза в 15 секунд', async () => {
    const p = await phone();
    await syncOnce(p);
    p.sync.startSync();
    await waitCycles(1);
    const before = server.cycles();
    p.sync.syncOnFocus(); // сразу после — пропускаем
    await sleep(100);
    expect(server.cycles()).toBe(before);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 16_000);
    p.sync.syncOnFocus(); // прошло 16 с — синхронизируемся
    vi.useRealTimers();
    await waitCycles(1);
    p.sync.stopSync(false);
    expect(server.cycles()).toBe(before + 1);
  });
});

describe('смены без связи — находки аудита, исправлены на этапе 3', () => {
  it('Д2: смена, принятая без связи в тот же день, не стирает отметки другого кипера', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T12:00:00+03:00'));
    server.write('shifts', shift('2026-10-26', { state: { Марго: { water: { level: 1, symptoms: ['пьёт мало'] } } }, feeds: { '07:00': { done: true } } }));
    const b = await phone(); // этой смены телефон кипера Б не видел
    await b.actions.acceptShift({ id: 'user-b', login: 'b', full_name: 'Кипер Б', role: 'keeper' }, { elephants: true });
    server.user = { id: 'user-b', name: 'Кипер Б', role: 'keeper' };
    await syncOnce(b);
    const s = serverRow<Shift>('shifts', '2026-10-26')!;
    expect(s.state.Марго?.water?.level).toBe(1);
    const mine = server.rows('shifts').filter((r) => r.keeper_name === 'Кипер Б');
    expect(mine).toHaveLength(1);
    expect(String(mine[0].id)).toMatch(/^2026-10-26-[0-9a-z]{8}$/);
  });

  it('Д1: у сдающего нет связи — сменщик принимает без кода, потом записи сдающего доходят и сливаются', async () => {
    server.write('shifts', shift('sA', { keeper_id: 'user-a', keeper_name: 'Кипер А' }));
    const a = await phone(); // телефон кипера А
    await syncOnce(a);
    const b = await phone(); // телефон кипера Б
    await syncOnce(b);
    // А нажал «Сдать» без связи — до сервера не дошло
    net.online = false;
    await a.actions.handOver(a.store.getRow('shifts', 'sA')!, 'Одри не доела вечером');
    net.online = true;
    // Б не дождался кода и принял без него
    const userB = { id: 'user-b', login: 'b', full_name: 'Кипер Б', role: 'keeper' as const };
    signedIn(userB);
    server.user = { id: 'user-b', name: 'Кипер Б', role: 'keeper' };
    await b.actions.takeOverShift(b.store.getRow('shifts', 'sA')!, userB, { elephants: true }, '');
    await syncOnce(b);
    const taken = serverRow<Shift>('shifts', 'sA')!;
    expect(taken.status).toBe('handed');
    const fresh = server.rows('shifts').find((r) => r.keeper_name === 'Кипер Б') as unknown as Shift;
    expect(fresh.status).toBe('open');
    expect(fresh.accepted_from).toBe('sA');
    expect(fresh.accept_remarks).toMatch(/без кода/);
    // связь у А появилась: его заметка доходит, смена Б не тронута
    server.user = { id: 'user-a', name: 'Кипер А', role: 'keeper' };
    await syncOnce(a);
    expect(serverRow<Shift>('shifts', 'sA')!.note).toBe('Одри не доела вечером');
    expect((server.get('shifts', fresh.id) as unknown as Shift).status).toBe('open');
  });
});
