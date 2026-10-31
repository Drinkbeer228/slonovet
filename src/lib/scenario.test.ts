// Сценарий «двое суток в слоновнике»: настоящие store / sync / actions приложения против поддельного сервера (src/test/fakeServer.ts).
// Пять телефонов — кипер А, кипер Б, врач, директор, администратор. Проверяем, что роли видят и делают то, что должны,
// а сервер не даёт лишнего. Каждый шаг — как в жизни: отметил на телефоне → синхронизация → другой увидел.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server, sleep, waitCycles } from '../test/fakeServer';
import { net, phone, signedIn } from '../test/app';
import type { CurrentUser, Diet, Shift, StockItem, VetRequest } from '../domain/types';

const keeperA: CurrentUser = { id: 'user-a', login: 'a', full_name: 'Кипер А', role: 'keeper' };
const keeperB: CurrentUser = { id: 'user-b', login: 'b', full_name: 'Кипер Б', role: 'keeper' };
const vet: CurrentUser = { id: 'user-vet', login: 'vet', full_name: 'Врач', role: 'vet' };
const director: CurrentUser = { id: 'user-dir', login: 'dir', full_name: 'Директор', role: 'director' };
const manager: CurrentUser = { id: 'user-man', login: 'man', full_name: 'Администратор', role: 'manager' };

type Phone = Awaited<ReturnType<typeof phone>>;

/** Войти этим человеком и прогнать один цикл синхронизации его телефона. */
async function syncAs(p: Phone, u: CurrentUser) {
  signedIn(u);
  server.user = { id: u.id, name: u.full_name, role: u.role };
  p.sync.startSync();
  await waitCycles(1);
  for (let i = 0; i < 100 && p.sync.getSyncStatus().state === 'syncing'; i++) await sleep(5);
  const res = p.sync.getSyncStatus();
  p.sync.stopSync(false);
  return res;
}

/** Новый телефон этого человека, уже с данными с сервера. */
async function phoneOf(u: CurrentUser) {
  signedIn(u);
  const p = await phone();
  await syncAs(p, u);
  return p;
}

const at = '2026-10-25T08:00:00.000Z';
const kasha: StockItem = { id: 'kasha', name: 'Каша', category: 'porridge', kind: 'kg', unit: 'кг', sack_kg: null, kg_per_garets: null, low_days: 3, sort: 1, updated_at: at } as StockItem;
const diet = (id: string): Omit<Diet, 'updated_at'> => ({ id, hay_kg: 50, branches_kg: 10, meals: [{ time: '13:00', title: 'Каша', prep: '', items: [{ item: 'kasha', name: 'Каша', qty: 3, unit: 'кг' }] }] });
const stockOf = (p: Phone, id: string) => p.store.getRows('stock_moves').filter((m) => m.item_id === id && !m.deleted).reduce((n, m) => n + m.delta, 0);
const shiftOn = (id: string) => server.get('shifts', id) as unknown as Shift;

beforeEach(() => {
  server.reset();
  localStorage.clear();
  net.online = true;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T08:00:00+03:00'));
  // люди, склад, рацион — как после настройки
  for (const u of [keeperA, keeperB, vet, director, manager]) server.write('profiles', { id: u.id, login: u.login, full_name: u.full_name, role: u.role, active: true, phone: u.role === 'vet' ? '+79990000000' : '' });
  server.write('stock_items', kasha);
  server.write('stock_moves', { id: 'start', item_id: 'kasha', delta: 100, reason: 'fix', shift_id: null, author_name: 'Директор', created_at: at });
  for (const el of ['Претти', 'Марго', 'Одри']) server.write('diets', diet(el));
  // права сервера: город — администратор и директор (033); назначения ставят врач, директор, админ (001)
  server.rls = (table, row, u) => {
    if (table === 'tour_stops' && !['director', 'manager', 'admin'].includes(u.role)) return 'нет прав';
    if (table === 'requests' && row.author_id !== u.id && !['vet', 'director', 'manager', 'admin'].includes(u.role)) return 'нет прав';
    return null;
  };
});
afterEach(() => {
  vi.useRealTimers();
});

describe('двое суток в слоновнике', () => {
  it('приём → наблюдение и кормление → ЧП → врач назначает удалённо → лечение → передача → привоз → город → дополнение задним числом', async () => {
    // ---------- сутки 1: кипер А принимает и работает ----------
    const a = await phoneOf(keeperA);
    await a.actions.acceptShift(keeperA, { elephants: true, bedding: false }, null);
    let shiftA = a.store.getRows('shifts').find((s) => s.keeper_id === keeperA.id)!;
    expect(shiftA.status).toBe('open');

    // Марго мало пьёт — «внимание» с признаком; кормление 13:00 списывает 3 кг × 3 слонихи
    await a.actions.setCell(shiftA, 'Марго', 'water', 1);
    await a.actions.toggleSymptom(a.store.getRow('shifts', shiftA.id)!, 'Марго', 'water', 'пьёт мало');
    vi.setSystemTime(new Date('2026-10-26T13:20:00+03:00'));
    await a.actions.setFeedDone(a.store.getRow('shifts', shiftA.id)!, '13:00', true, keeperA);
    expect(stockOf(a, 'kasha')).toBe(100 - 9);

    // ЧП по Марго — хромает после репетиции, врачу показывается всегда
    await a.actions.addNote({ shift_id: shiftA.id, elephant: 'Марго', kind: 'incident', metric: null, text: 'хромает после репетиции', user: keeperA });
    await syncAs(a, keeperA);
    expect(shiftOn(shiftA.id).state.Марго?.water).toEqual({ level: 1, symptoms: ['пьёт мало'] });

    // ---------- врач смотрит удалённо ----------
    const v = await phoneOf(vet);
    const { vetInbox } = await import('../domain/inbox');
    const inbox = vetInbox({ notes: v.store.getRows('notes'), shifts: v.store.getRows('shifts'), marks: v.store.getRows('request_marks'), requests: v.store.getRows('requests') }, '2026-10-25T00:00:00Z');
    expect(inbox.map((i) => i.text)).toContain('ЧП · Марго: хромает после репетиции');
    const note = v.store.getRows('notes').find((n) => n.kind === 'incident')!;

    // ответ «Назначу» и ванночки утром и вечером на 5 дней — с ответами «сделано / частично / не вышло»
    await v.actions.addNoteComment(note.id, vet, 'assign');
    await v.store.put('requests', {
      id: 'bath', elephant: 'Марго', text: 'Ванночки с марганцовкой — задняя нога', route: 'ванночка', dose: 'по 15–20 мин', history: [],
      frequency: 'twice', due_date: '2026-10-30', on_date: null, at_time: null, needs_photo: false, urgent: false,
      options: ['сделано', 'частично', 'не вышло'], author_id: vet.id, author_name: vet.full_name, status: 'active', created_at: new Date().toISOString(),
    } as Omit<VetRequest, 'updated_at'>);
    expect((await syncAs(v, vet)).rejected).toHaveLength(0);

    // ---------- кипер А видит назначение, отвечает, передаёт Б ----------
    await syncAs(a, keeperA);
    expect(a.store.getRows('note_comments').map((c) => c.kind)).toEqual(['assign']);
    const { dutyTodos } = await import('../domain/shift');
    shiftA = a.store.getRow('shifts', shiftA.id)!;
    let todo = dutyTodos(a.store.getRows('requests'), a.store.getRows('request_marks'), shiftA, '2026-10-26').find((t) => t.req.id === 'bath')!;
    expect(todo.needed).toBe(2); // утро и вечер
    await a.actions.addMark('bath', shiftA, keeperA, 'сделано');
    await a.actions.addMark('bath', shiftA, keeperA, 'частично — выдернула ногу');
    todo = dutyTodos(a.store.getRows('requests'), a.store.getRows('request_marks'), shiftA, '2026-10-26').find((t) => t.req.id === 'bath')!;
    expect(todo.done).toBe(true);

    vi.setSystemTime(new Date('2026-10-27T08:00:00+03:00'));
    await a.actions.offerHandover(a.store.getRow('shifts', shiftA.id)!, 'Марго — ванночки, проверь бак', keeperB.id);
    await syncAs(a, keeperA);
    expect(shiftOn(shiftA.id)).toMatchObject({ status: 'open', handover_to: keeperB.id });

    // врач видит «частично» в «Новом»
    await syncAs(v, vet);
    const inbox2 = vetInbox({ notes: v.store.getRows('notes'), shifts: v.store.getRows('shifts'), marks: v.store.getRows('request_marks'), requests: v.store.getRows('requests') }, '2026-10-25T00:00:00Z');
    expect(inbox2.some((i) => i.text.includes('частично — выдернула ногу'))).toBe(true);

    // ---------- сутки 2: кипер Б принимает ----------
    const b = await phoneOf(keeperB);
    await b.actions.acceptShift(keeperB, { elephants: true }, { id: shiftA.id, remarks: 'Не так: инвентарь — Багры покусаны' });
    await syncAs(b, keeperB);
    expect(shiftOn(shiftA.id)).toMatchObject({ status: 'handed', close_reason: 'handover', closed_by: keeperB.id });
    const shiftB = server.rows('shifts').find((s) => s.keeper_id === keeperB.id) as unknown as Shift;
    expect(shiftB.status).toBe('open');
    expect(shiftB.accept_remarks).toContain('Багры покусаны');

    // Б не может править чужую (сданную) смену А — сервер откатывает
    const old = b.store.getRow('shifts', shiftA.id)!;
    await b.actions.updateShift(old, (s) => void (s.note = 'чужое'));
    const denied = await syncAs(b, keeperB);
    expect(denied.rejected.map((r) => [r.what, r.reason])).toEqual([['Дежурство «Кипер А»', 'нет прав']]);
    expect(shiftOn(shiftA.id).note).toBe('Марго — ванночки, проверь бак');
    expect(b.store.getRow('shifts', shiftA.id)!.note).toBe('Марго — ванночки, проверь бак'); // телефон вернул как на сервере
    b.sync.clearRejected();

    // ---------- закупки: кипер просит, администратор заказывает и отмечает «Привезли» ----------
    const { requestPurchase } = await import('../screens/PurchasesView');
    await requestPurchase(keeperB, { item_id: 'kasha', title: 'Каша', amount: '50 кг' });
    await syncAs(b, keeperB);
    const m = await phoneOf(manager);
    const purchase = m.store.getRows('purchases').find((p) => p.item_id === 'kasha')!;
    await m.actions.setPurchaseStatus(purchase, 'ordered', manager, '2026-10-28');
    const got = await m.actions.arrivePurchase(m.store.getRow('purchases', purchase.id)!, m.store.getRow('stock_items', 'kasha'), 50, manager, null);
    expect(got).toBe(50);
    await syncAs(m, manager);
    await syncAs(b, keeperB);
    expect(stockOf(b, 'kasha')).toBe(100 - 9 + 50);
    expect(b.store.getRow('purchases', purchase.id)!.status).toBe('done');

    // ---------- город: кипер не может, директор может ----------
    const tourStop = (id: string, city: string) => ({ id, city, arrive_on: '2026-10-27', depart_on: null, note: '', created_by: 'x' });
    await b.store.put('tour_stops', tourStop('t-keeper', 'Тула'));
    const refused = await syncAs(b, keeperB);
    expect(refused.rejected.map((r) => r.reason)).toEqual(['нет прав']);
    const d = await phoneOf(director);
    await d.store.put('tour_stops', tourStop('t-dir', 'Брянск'));
    await syncAs(d, director);
    const { currentStop } = await import('../domain/stops');
    await syncAs(b, keeperB);
    expect(currentStop(b.store.getRows('tour_stops'), '2026-10-27')?.city).toBe('Брянск');

    // ---------- кипер А дополняет свою сданную смену задним числом ----------
    await syncAs(a, keeperA);
    await a.actions.setCell(a.store.getRow('shifts', shiftA.id)!, 'Одри', 'feces', 1);
    await syncAs(a, keeperA);
    expect(shiftOn(shiftA.id).state.Одри?.feces?.level).toBe(1);

    // ---------- итог дня в журнале по смене А ----------
    const { shiftSummary } = await import('../domain/summary');
    const { daySlots } = await import('../domain/day');
    const final = a.store.getRow('shifts', shiftA.id)!;
    const todos = dutyTodos(a.store.getRows('requests'), a.store.getRows('request_marks'), final, final.date);
    const lines = shiftSummary(final, todos, daySlots(final), a.store.getRows('notes')).map((l) => l.text);
    expect(lines).toContain('Претти — норма');
    expect(lines).toContain('Марго — внимание: вода (пьёт мало)');
    expect(lines).toContain('Одри — внимание: кал');
    expect(lines.find((l) => l.startsWith('Назначения'))).toBe('Назначения: 1 из 1');
    expect(lines).toContain('ЧП · Марго: хромает после репетиции');
  });
});
