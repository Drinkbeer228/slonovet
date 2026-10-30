import { getRow, getRows, newId, put } from '../lib/store';
import { ELEPHANTS, METRICS } from './elephants';
import { savePhoto } from '../lib/photos';
import { logEvent } from '../lib/log';
import { reportLowStock } from '../lib/push';
import { isoDate } from '../lib/dates';
import { newShift } from './shift';
import { canTakeShift } from './access';
import { balances, feedUsage, isBeforeCount, toStockUnits, weighedItem } from './stock';
import type { CurrentUser, ElephantName, Level, MetricKey, Note, NoteKind, Purchase, PurchaseStatus, Shift, StockItem, StockMove } from './types';

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export async function updateShift(shift: Shift, fn: (s: Shift) => void) {
  const latest = getRow('shifts', shift.id) ?? shift;
  const next = clone(latest);
  fn(next);
  await put('shifts', next);
}

export async function acceptShift(user: CurrentUser, safety: Record<string, boolean>, from: { id: string; remarks: string } | null = null) {
  // и takeOverShift, и rolloverShift идут через эту функцию: администратор цирка (manager) и врач не дежурят
  if (!canTakeShift(user.role)) throw new Error('Дежурить могут только киперы и директор');
  logEvent('shift.accept', { remarks: from?.remarks?.slice(0, 200) ?? '' });
  const date = isoDate();
  // id — дата и случайный хвост: два телефона без связи в один день не создадут одну и ту же смену
  // (иначе вторая при отправке затёрла бы отметки первой)
  const id = `${date}-${newId().replace(/-/g, '').slice(0, 8)}`;
  await put('shifts', { ...newShift(user, safety, date, from), id });
}

/**
 * Принять смену, которую не сдали (ушёл, нет связи, не успел): заступаем сразу. Чужую смену не трогаем:
 * когда наша дойдёт до сервера, он сам закроет прежнюю открытую («принята без сдачи»), а поздние записи прежнего
 * владельца сольются патчами. Работа со слонами не ждёт ни сети, ни кого-либо ещё.
 */
export async function takeOverShift(prev: Shift, user: CurrentUser, safety: Record<string, boolean>, remarks: string) {
  logEvent('shift.takeover', { from: prev.id });
  const note = ['Принята без сдачи', remarks].filter(Boolean).join('. ');
  await acceptShift(user, safety, { id: prev.id, remarks: note });
}

/** Закрыть свою смену: что не трогали — норма (кипер подтвердил осмотр), время и причина закрытия. */
function closeOwn(s: Shift, reason: NonNullable<Shift['close_reason']>, by: string | null) {
  s.status = 'handed';
  s.handed_at = new Date().toISOString();
  s.close_reason = reason;
  s.closed_by = by ?? s.keeper_id;
}

/**
 * Сдать дежурство конкретному сменщику (toId) или «кому-нибудь» (null). Кода нет: сменщик на своём телефоне
 * видит «Тебе сдали смену» и жмёт «Принять»; не увидел — принимает сам, смена сойдётся на сервере.
 */
export async function handOver(shift: Shift, note: string, toId: string | null = null) {
  logEvent('shift.handover', { shift: shift.id, to: toId, note: note.slice(0, 200) });
  await updateShift(shift, (s) => {
    // что не трогали — норма: в журнале остаётся явная отметка
    for (const el of ELEPHANTS) {
      s.state[el] = s.state[el] ?? {};
      for (const m of METRICS) if (!s.state[el]![m.key]) s.state[el]![m.key] = { level: 0 };
    }
    closeOwn(s, 'handover', s.keeper_id);
    s.note = note;
    s.handover_to = toId;
    s.handover_code = null;
    s.checked_at = s.handed_at; // сдаём только с галочкой «осмотрел всех» — она и делает нетронутое нормой
  });
}

/** Новые сутки (остаюсь на смене): своя закрывается, на того же человека открывается новая — за одно нажатие. */
export async function rolloverShift(shift: Shift, user: CurrentUser) {
  logEvent('shift.rollover', { shift: shift.id });
  await updateShift(shift, (s) => closeOwn(s, 'rollover', user.id));
  await acceptShift(user, shift.safety ?? {}, { id: shift.id, remarks: '' });
}

/** Передумал сдавать, пока смену никто не принял. */
export async function cancelHandOver(shift: Shift) {
  await updateShift(shift, (s) => {
    s.status = 'open';
    s.handed_at = null;
    s.handover_code = null;
    s.handover_to = null;
    s.closed_by = null;
    s.close_reason = null;
  });
}

export async function setCell(shift: Shift, el: ElephantName, m: MetricKey, level: Level | null) {
  logEvent('state.set', { el, metric: m, level });
  await updateShift(shift, (s) => {
    s.state[el] = s.state[el] ?? {};
    if (level === null) delete s.state[el]![m];
    else s.state[el]![m] = { level, symptoms: level > 0 ? (s.state[el]![m]?.symptoms ?? []) : [] };
  });
}

export async function toggleSymptom(shift: Shift, el: ElephantName, m: MetricKey, symptom: string) {
  await updateShift(shift, (s) => {
    const c = s.state[el]?.[m];
    if (!c) return;
    const list = new Set(c.symptoms ?? []);
    if (list.has(symptom)) list.delete(symptom);
    else list.add(symptom);
    c.symptoms = [...list];
  });
}

export async function fillNorm(shift: Shift, els: ElephantName[], metrics: MetricKey[]) {
  await updateShift(shift, (s) => {
    for (const el of els) {
      s.state[el] = s.state[el] ?? {};
      for (const m of metrics) if (!s.state[el]![m]) s.state[el]![m] = { level: 0 };
    }
  });
}

/**
 * Движение с постоянным id (кормление, вес, сено, мешки): правка заменяет прежнее. Но если прежнее лежит до
 * пересчёта склада, оно в остатке уже не учитывается, и замена потерялась бы (или, наоборот, посчиталась бы
 * дважды) — тогда прежнее не трогаем, а разницу пишем отдельным движением «:adj:».
 */
async function putKeyedMove(row: Omit<StockMove, 'updated_at' | 'created_at'>) {
  const all = getRows('stock_moves');
  const existing = getRow('stock_moves', row.id);
  if (existing && isBeforeCount(existing, all)) {
    const adj = all.filter((m) => m.id.startsWith(`${row.id}:adj:`)).reduce((sum, m) => sum + Number(m.delta), 0);
    const want = row.deleted ? 0 : Number(row.delta);
    const diff = Math.round((want - (Number(existing.delta) + adj)) * 1000) / 1000;
    if (diff !== 0) {
      await put('stock_moves', {
        id: `${row.id}:adj:${newId().replace(/-/g, '').slice(0, 8)}`,
        item_id: row.item_id,
        delta: diff,
        reason: row.reason,
        shift_id: row.shift_id,
        author_name: row.author_name,
        created_at: new Date().toISOString(),
      });
    }
    return;
  }
  await put('stock_moves', { ...row, created_at: existing?.created_at ?? new Date().toISOString() });
}

/** Отметить кормление. Списываем со склада по рациону; снятие отметки возвращает всё, что за это кормление списали. */
export async function setFeedDone(shift: Shift, time: string, done: boolean, user: CurrentUser) {
  logEvent('feed.toggle', { time, done });
  await updateShift(shift, (s) => {
    const prev = s.feeds[time];
    // кг, «дали меньше» и «½/отказ» помним и при снятии, и при повторной галочке: это данные, а не черновик
    s.feeds[time] = done
      ? { ...prev, done: true, at: new Date().toISOString(), eaten: prev?.eaten ?? { Претти: 'all', Марго: 'all', Одри: 'all' } }
      : { ...prev, done: false };
  });
  if (!done) {
    // снимаем именно то, что записано за эту смену и это кормление, — даже если рацион с тех пор поменялся
    const feedPrefix = `feed:${shift.id}:${time}:`;
    for (const m of getRows('stock_moves')) {
      if (m.id.includes(':adj:')) continue; // поправки уйдут вместе со своим движением (см. putKeyedMove)
      if (m.id.startsWith(feedPrefix) || m.id === `veg:${shift.id}:${time}`) {
        await putKeyedMove({ ...m, deleted: true, author_name: user.full_name });
      }
    }
    return;
  }
  // кормление «по весу» (строка рациона без количества): списание по вписанным кг
  // (getRow не видит удалённые строки, поэтому при повторной галочке списание пересоздаём из кг смены)
  const kg = getRow('shifts', shift.id)?.feeds[time]?.kg ?? 0;
  const weighedId = weighedItem(getRows('diets'), time);
  if (kg > 0 && weighedId && !getRow('stock_moves', `veg:${shift.id}:${time}`)) await setFeedKg(shift, time, weighedId, kg, user);
  const usage = feedUsage(getRows('diets'), time, getRows('stock_items'));
  // поправленное кипером (сетками) — важнее рациона
  const given = getRow('shifts', shift.id)?.feeds[time]?.given ?? {};
  for (const [item, kg] of Object.entries(given)) usage.set(item, kg);
  for (const [item, qty] of usage) {
    const id = `feed:${shift.id}:${time}:${item}`;
    await putKeyedMove({ id, item_id: item, delta: -qty, reason: 'feed', shift_id: shift.id, author_name: user.full_name, deleted: false });
  }
  void reportLowStock(); // что-то стало «заканчивается» — закупщикам уйдёт уведомление
}

/** Кипер поправил, сколько выдал по позиции (например, картофеля 2 сетки вместо 3). Списание пересчитывается. */
export async function setFeedGiven(shift: Shift, time: string, itemId: string, kg: number, user: CurrentUser) {
  logEvent('feed.given', { time, item: itemId, kg });
  await updateShift(shift, (s) => {
    const f = s.feeds[time];
    if (f) f.given = { ...(f.given ?? {}), [itemId]: kg };
  });
  const id = `feed:${shift.id}:${time}:${itemId}`;
  await putKeyedMove({ id, item_id: itemId, delta: -kg, reason: 'feed', shift_id: shift.id, author_name: user.full_name, deleted: false });
}

/** Выдали вне рациона (манеж, репетиция, шоу) или списали брак — отдельное движение со своим поводом. */
export async function addStockMoveNote(item_id: string, delta: number, reason: 'extra' | 'waste', note: string, user: CurrentUser, shift_id: string | null) {
  logEvent('stock.move', { item: item_id, delta, reason, note });
  if (!delta) return;
  await put('stock_moves', { id: newId(), item_id, delta, reason, shift_id, author_name: user.full_name, note, created_at: new Date().toISOString() });
  void reportLowStock();
}

/** Кипер вписывает, сколько кг выдал по строке рациона «по весу». Списывается со склада. */
export async function setFeedKg(shift: Shift, time: string, itemId: string, kg: number, user: CurrentUser) {
  await updateShift(shift, (s) => {
    const f = s.feeds[time];
    if (f) f.kg = kg;
  });
  const id = `veg:${shift.id}:${time}`;
  await putKeyedMove({ id, item_id: itemId, delta: -kg, reason: 'feed', shift_id: shift.id, author_name: user.full_name, deleted: kg <= 0 });
}

export async function cycleEaten(shift: Shift, time: string, el: ElephantName) {
  await updateShift(shift, (s) => {
    const f = s.feeds[time];
    if (!f?.done) return;
    f.eaten = f.eaten ?? {};
    const cur = f.eaten[el] ?? 'all';
    f.eaten[el] = cur === 'all' ? 'half' : cur === 'half' ? 'none' : 'all';
  });
}

export async function setHay(shift: Shift, bales: number, user: CurrentUser) {
  logEvent('hay.set', { bales });
  await updateShift(shift, (s) => {
    s.hay_bales = bales;
  });
  const id = `hay:${shift.id}`;
  await putKeyedMove({ id, item_id: 'hay', delta: -bales, reason: 'hay', shift_id: shift.id, author_name: user.full_name, deleted: bales === 0 });
}

/** Мешки для мусора: сколько взяли со склада за дежурство. */
export async function setBags(shift: Shift, bags: number, user: CurrentUser) {
  await updateShift(shift, (s) => {
    s.quests.cleaning = { ...(s.quests.cleaning ?? {}), bags };
  });
  const id = `bags:${shift.id}`;
  await putKeyedMove({ id, item_id: 'bags', delta: -bags, reason: 'feed', shift_id: shift.id, author_name: user.full_name, deleted: bags === 0 });
}

export async function addMark(requestId: string, shift: Shift, user: CurrentUser, note = '', photo?: File) {
  logEvent('request.mark', { request: requestId, photo: Boolean(photo), text: note.slice(0, 200) });
  const id = newId();
  const photo_path = photo ? await savePhoto(photo, shift.id, id) : null;
  await put('request_marks', {
    id,
    request_id: requestId,
    shift_id: shift.id,
    done_by: user.full_name,
    done_at: new Date().toISOString(),
    note,
    photo_path,
  });
}

export async function addComment(requestId: string, user: CurrentUser, text: string) {
  const clean = text.trim();
  if (!clean) return;
  logEvent('request.comment', { request: requestId, text: clean.slice(0, 200) });
  await put('request_comments', { id: newId(), request_id: requestId, author_id: user.id, author_name: user.full_name, text: clean, created_at: new Date().toISOString() });
}

export async function addNote(input: {
  shift_id: string;
  elephant: ElephantName;
  kind: NoteKind;
  metric: MetricKey | null;
  text: string;
  photo?: File | null;
  user: CurrentUser;
}) {
  logEvent('note.add', { kind: input.kind, metric: input.metric, photo: Boolean(input.photo), text: input.text.trim().slice(0, 200) });
  const id = newId();
  const photo_path = input.photo ? await savePhoto(input.photo, input.shift_id, id) : null;
  const note: Omit<Note, 'updated_at'> = {
    id,
    shift_id: input.shift_id,
    elephant: input.elephant,
    kind: input.kind,
    metric: input.metric,
    text: input.text.trim(),
    photo_path,
    author_name: input.user.full_name,
    created_at: new Date().toISOString(),
  };
  await put('notes', note);
}

/** Движение фуража. id — постоянный, если одно и то же действие могут повторить (приход по закупке): тогда без задвоения. */
export async function addStockMove(item_id: string, delta: number, reason: StockMove['reason'], user: CurrentUser, shift_id: string | null, id = newId()) {
  logEvent('stock.move', { item: item_id, delta, reason });
  if (!delta) return;
  await put('stock_moves', {
    id,
    item_id,
    delta,
    reason,
    shift_id,
    author_name: user.full_name,
    created_at: new Date().toISOString(),
  });
}

/**
 * Пересчитали: на складе ровно counted. Записываем факт пересчёта — остаток дальше считается от него
 * (см. balances), а delta — разница с тем, что видел этот телефон, для старых версий приложения.
 */
export async function countStock(item_id: string, counted: number, user: CurrentUser, shift_id: string | null) {
  const now = getRows('stock_moves').filter((m) => m.item_id === item_id);
  const delta = Math.round((counted - (balances(now).get(item_id) ?? 0)) * 1000) / 1000;
  if (!delta) return;
  logEvent('stock.count', { item: item_id, counted, delta });
  await put('stock_moves', {
    id: newId(),
    item_id,
    delta,
    counted,
    reason: 'fix',
    shift_id,
    author_name: user.full_name,
    created_at: new Date().toISOString(),
  });
}

/** Статус закупки: «заказано» (с датой доставки), «привезли», «отменено». */
export async function setPurchaseStatus(p: Purchase, status: PurchaseStatus, user: CurrentUser, delivery?: string | null) {
  logEvent('purchase.status', { title: p.title.slice(0, 100), status, delivery: delivery ?? null });
  await put('purchases', {
    ...p,
    status,
    status_by: user.full_name,
    status_at: new Date().toISOString(),
    delivery_date: delivery === undefined ? (p.delivery_date ?? null) : delivery,
  });
}

/**
 * «Привезли» по закупке: зачислить приход (n — мешков, кг или штук, как считается позиция) и закрыть закупку.
 * id прихода — по закупке: два нажатия или два телефона дают один приход. Возвращает, сколько зачислено.
 */
export async function arrivePurchase(p: Purchase, item: StockItem | undefined, n: number, user: CurrentUser, shiftId: string | null): Promise<number> {
  const delta = item ? toStockUnits(item, n) : 0;
  if (item && delta > 0) await addStockMove(item.id, delta, 'in', user, shiftId, `in:purchase:${p.id}`);
  await setPurchaseStatus(p, 'done', user);
  return delta;
}
