import { getRow, getRows, newId, put } from '../lib/store';
import { ELEPHANTS, METRICS } from './elephants';
import { savePhoto } from '../lib/photos';
import { isoDate } from '../lib/dates';
import { newHandoverCode, newShift } from './shift';
import { feedUsage, weighedItem } from './stock';
import type { CurrentUser, ElephantName, Level, MetricKey, Note, NoteKind, Shift, StockMove } from './types';

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
  const date = isoDate();
  let id = date;
  for (let n = 2; getRow('shifts', id); n++) id = `${date}-${n}`;
  await put('shifts', { ...newShift(user, safety, date, from), id });
}

/** Сдать дежурство: появляется код, который сдающий диктует сменщику. */
export async function handOver(shift: Shift, note: string) {
  await updateShift(shift, (s) => {
    // что не трогали — норма: в журнале остаётся явная отметка
    for (const el of ELEPHANTS) {
      s.state[el] = s.state[el] ?? {};
      for (const m of METRICS) if (!s.state[el]![m.key]) s.state[el]![m.key] = { level: 0 };
    }
    s.status = 'handed';
    s.handed_at = new Date().toISOString();
    s.note = note;
    s.handover_code = newHandoverCode();
  });
}

/** Передумал сдавать, пока смену никто не принял. */
export async function cancelHandOver(shift: Shift) {
  await updateShift(shift, (s) => {
    s.status = 'open';
    s.handed_at = null;
    s.handover_code = null;
  });
}

export async function setCell(shift: Shift, el: ElephantName, m: MetricKey, level: Level | null) {
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

/** Отметить кормление. Списываем со склада по рациону; снятие отметки возвращает. */
export async function setFeedDone(shift: Shift, time: string, done: boolean, user: CurrentUser) {
  await updateShift(shift, (s) => {
    const prev = s.feeds[time];
    s.feeds[time] = done
      ? { done: true, at: new Date().toISOString(), eaten: prev?.eaten ?? { Претти: 'all', Марго: 'all', Одри: 'all' }, kg: prev?.kg }
      : { done: false, kg: prev?.kg }; // кг помним: при повторной галочке они вернутся вместе со списанием
  });
  // кормление «по весу» (овощи): списание по введённым кг
  // (getRow не видит удалённые строки, поэтому при повторной галочке списание пересоздаём из кг смены)
  const weighed = getRow('stock_moves', `veg:${shift.id}:${time}`);
  const kg = getRow('shifts', shift.id)?.feeds[time]?.kg ?? 0;
  const weighedId = weighedItem(getRows('diets'), time);
  if (!done && weighed) await put('stock_moves', { ...weighed, deleted: true });
  if (done && !weighed && kg > 0 && weighedId) await setFeedKg(shift, time, weighedId, kg, user);
  // овощи по образцу: первая галочка сразу списывает по тазу на каждую слониху
  const perBowl = weighedId ? getRow('stock_items', weighedId)?.kg_per_garets : null;
  if (done && !weighed && kg === 0 && weighedId && perBowl) {
    const fill = Object.fromEntries(ELEPHANTS.map((e) => [e, 1])) as Record<ElephantName, number>;
    await setFeedKg(shift, time, weighedId, ELEPHANTS.length * perBowl, user, fill);
  }
  const usage = feedUsage(getRows('diets'), time, getRows('stock_items'));
  for (const [item, qty] of usage) {
    const id = `feed:${shift.id}:${time}:${item}`;
    const existing = getRow('stock_moves', id);
    if (done) {
      await put('stock_moves', {
        id,
        item_id: item,
        delta: -qty,
        reason: 'feed',
        shift_id: shift.id,
        author_name: user.full_name,
        created_at: existing?.created_at ?? new Date().toISOString(),
        deleted: false,
      } satisfies Omit<StockMove, 'updated_at'>);
    } else if (existing) {
      await put('stock_moves', { ...existing, deleted: true });
    }
  }
}

/** Кипер вписывает, сколько кг выдал (овощи). Списывается со склада. */
export async function setFeedKg(
  shift: Shift,
  time: string,
  itemId: string,
  kg: number,
  user: CurrentUser,
  fill?: Partial<Record<ElephantName, number>>,
) {
  await updateShift(shift, (s) => {
    const f = s.feeds[time];
    if (f) {
      f.kg = kg;
      f.fill = fill; // вписали кг руками — наполнение тазов больше не считаем
    }
  });
  const id = `veg:${shift.id}:${time}`;
  const existing = getRow('stock_moves', id);
  await put('stock_moves', {
    id,
    item_id: itemId,
    delta: -kg,
    reason: 'feed',
    shift_id: shift.id,
    author_name: user.full_name,
    created_at: existing?.created_at ?? new Date().toISOString(),
    deleted: kg <= 0,
  });
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
  await updateShift(shift, (s) => {
    s.hay_bales = bales;
  });
  const id = `hay:${shift.id}`;
  const existing = getRow('stock_moves', id);
  await put('stock_moves', {
    id,
    item_id: 'hay',
    delta: -bales,
    reason: 'hay',
    shift_id: shift.id,
    author_name: user.full_name,
    created_at: existing?.created_at ?? new Date().toISOString(),
    deleted: bales === 0,
  });
}

/** Мешки для мусора: сколько взяли со склада за дежурство. */
export async function setBags(shift: Shift, bags: number, user: CurrentUser) {
  await updateShift(shift, (s) => {
    s.quests.cleaning = { ...(s.quests.cleaning ?? {}), bags };
  });
  const id = `bags:${shift.id}`;
  const existing = getRow('stock_moves', id);
  await put('stock_moves', {
    id,
    item_id: 'bags',
    delta: -bags,
    reason: 'feed',
    shift_id: shift.id,
    author_name: user.full_name,
    created_at: existing?.created_at ?? new Date().toISOString(),
    deleted: bags === 0,
  });
}

export async function addMark(requestId: string, shift: Shift, user: CurrentUser, note = '', photo?: File) {
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

export async function addNote(input: {
  shift_id: string;
  elephant: ElephantName;
  kind: NoteKind;
  metric: MetricKey | null;
  text: string;
  photo?: File | null;
  user: CurrentUser;
}) {
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

export async function addStockMove(item_id: string, delta: number, reason: StockMove['reason'], user: CurrentUser, shift_id: string | null) {
  if (!delta) return;
  await put('stock_moves', {
    id: newId(),
    item_id,
    delta,
    reason,
    shift_id,
    author_name: user.full_name,
    created_at: new Date().toISOString(),
  });
}
