import { METRICS } from './elephants';
import { FEED_TIMES, closingMarks, perShift, shiftFlags, type Flag } from './shift';
import { addDays, isoDate, localDay } from '../lib/dates';
import type { Eaten, ElephantName, Level, MetricKey, RequestMark, Shift, VetRequest } from './types';

/**
 * Наблюдение за слонами из смены в смену: что тянется с прошлой смены, что из назначений пропустили,
 * как менялось состояние слона за последние дни.
 */

const live = (shifts: Shift[]) => shifts.filter((s) => !s.deleted);

/** Прошлая смена: та, которую эта приняла, иначе — последняя начатая раньше. */
export function previousShift(shifts: Shift[], shift: Shift): Shift | undefined {
  const list = live(shifts).filter((s) => s.id !== shift.id);
  if (shift.accepted_from) {
    const from = list.find((s) => s.id === shift.accepted_from);
    if (from) return from;
  }
  const key = (s: Shift) => `${s.date} ${s.accepted_at ?? ''}`;
  return list.filter((s) => key(s) < key(shift)).sort((a, b) => (key(a) < key(b) ? 1 : -1))[0];
}

/**
 * Что было не в норме в прошлую смену и ещё не проверено в этой: такие клетки не считаются нормой по умолчанию —
 * кипер смотрит и отвечает «всё так же» или «сегодня норма».
 */
export function carryFlags(shifts: Shift[], shift: Shift): Flag[] {
  const prev = previousShift(shifts, shift);
  return shiftFlags(prev).filter((f) => !shift.state?.[f.elephant]?.[f.metric]);
}

export interface MissedTask {
  req: VetRequest;
  /** «не отмечено» или «отмечено 2 из 4» */
  why: string;
}

/**
 * Что из назначений и задач должно было быть сделано в эту смену и не сделано. Только у сданной смены:
 * идущая ещё может успеть. Регулярные — не хватает отметок в смене; разовые — к концу смены так и не закрыты.
 */
export function missedTasks(requests: VetRequest[], marks: RequestMark[], shift: Shift): MissedTask[] {
  if (shift.status !== 'handed' || !shift.accepted_at) return [];
  const start = shift.accepted_at;
  const end = shift.handed_at ?? new Date().toISOString();
  const out: MissedTask[] = [];
  for (const req of requests) {
    if (req.deleted || req.created_at > end) continue;
    // закрыли до начала смены — к ней уже не относится
    if (req.status !== 'active' && (req.updated_at ?? '') < start) continue;
    const mine = marks.filter((m) => m.request_id === req.id && !m.deleted);
    if (req.frequency === 'once') {
      const day = req.on_date ?? localDay(req.created_at);
      if (day > shift.date) continue;
      const closed = closingMarks(mine, req);
      if (closed.some((m) => m.done_at < start)) continue; // сделано раньше
      if (!closed.some((m) => m.done_at <= end)) out.push({ req, why: day < shift.date ? 'просрочено' : 'не отмечено' });
    } else {
      if (localDay(req.created_at) > shift.date || (req.due_date && req.due_date < shift.date)) continue;
      const needed = perShift(req);
      const here = mine.filter((m) => m.shift_id === shift.id).length;
      if (here < needed) out.push({ req, why: here ? `отмечено ${here} из ${needed}` : 'не отмечено' });
    }
  }
  return out;
}

export interface DayHistory {
  date: string;
  /** null — в этот день не дежурили или клетку не отмечали */
  levels: Record<MetricKey, Level | null>;
  /** худшее за кормления: всё / ½ / отказ; null — не кормили или не отмечали */
  eaten: Eaten | null;
  feces: number | null;
  urine: number | null;
}

const EATEN_RANK: Record<Eaten, number> = { all: 0, half: 1, none: 2 };

/** Состояние слона по дням за последние days дней (старые слева). Несколько смен в день — худшее и сумма. */
export function elephantHistory(shifts: Shift[], el: ElephantName, days = 14, today = isoDate()): DayHistory[] {
  const byDate = new Map<string, Shift[]>();
  for (const s of live(shifts)) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - days + 1);
    const list = byDate.get(date) ?? [];
    const levels = Object.fromEntries(
      METRICS.map((m) => {
        const vals = list.map((s) => s.state?.[el]?.[m.key]?.level ?? (s.checked_at ? 0 : null)).filter((v): v is Level => v != null);
        return [m.key, vals.length ? (Math.max(...vals) as Level) : null];
      }),
    ) as Record<MetricKey, Level | null>;
    const eatenAll = list.flatMap((s) => Object.values(s.feeds ?? {}).filter((f) => f?.done).map((f) => f.eaten?.[el] ?? 'all'));
    const eaten = eatenAll.length ? eatenAll.reduce((a, b) => (EATEN_RANK[b] > EATEN_RANK[a] ? b : a)) : null;
    const sum = (f: (s: Shift) => number) => (list.length ? list.reduce((n, s) => n + f(s), 0) : null);
    return {
      date,
      levels,
      eaten,
      feces: sum((s) => Number(s.quests?.feces?.[el] ?? 0)),
      urine: sum((s) => s.quests?.urine?.[el]?.ok ?? 0),
    };
  });
}

/* ---------- кормления по времени и дыры между сменами ---------- */

/** Когда кормление этой смены: время до 08:00 — уже следующее утро (смена 08:00 → 08:00). */
export function feedMoment(shift: Pick<Shift, 'date'>, time: string): Date {
  const d = new Date(`${shift.date}T${time}:00`);
  if (time < '08:00') d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Кормление в смене: done — отмечено; outside — было до приёма или после сдачи (не этого дежурного);
 * due — его отрезок дня идёт (за полчаса до начала и до следующего кормления); late — отрезок прошёл, а не отмечено;
 * soon — ещё впереди. Жёстких таймеров нет: из‑за репетиций и представлений каша плавает (13:30 вместо 13:00),
 * поэтому «не отмечено» горит только когда начался следующий отрезок, а не через полчаса.
 */
export type FeedStatus = 'done' | 'outside' | 'late' | 'due' | 'soon';
const EARLY_MS = 30 * 60_000;
/** Конец отрезка: начало следующего кормления; утреннее (07:00, последнее в смене) — до 10:00. */
export function slotEnd(shift: Pick<Shift, 'date'>, time: string): Date {
  const i = FEED_TIMES.indexOf(time);
  if (time < '08:00') return new Date(feedMoment(shift, time).getTime() + 3 * 60 * 60_000);
  const next = FEED_TIMES[i + 1] ?? FEED_TIMES[0];
  return feedMoment(shift, next);
}
export function feedStatus(shift: Shift, time: string, now = new Date()): FeedStatus {
  if (shift.feeds?.[time]?.done) return 'done';
  const at = feedMoment(shift, time).getTime();
  // чьё кормление — того, кто на смене через полчаса после его начала: приняли в 13:05 — каша (13:30) твоя
  const pivot = at + EARLY_MS;
  if (shift.accepted_at && pivot < Date.parse(shift.accepted_at)) return 'outside';
  if (shift.handed_at && pivot > Date.parse(shift.handed_at)) return 'outside';
  if (shift.status === 'handed' || now.getTime() >= slotEnd(shift, time).getTime()) return 'late';
  if (now.getTime() >= at - EARLY_MS) return 'due';
  return 'soon';
}

export interface Gap {
  from: string;
  to: string;
  minutes: number;
}

/** Меньше получаса между сдачей и приёмом — обычная пересменка, не дыра. */
const GAP_MIN = 30;

/** Сколько никто не дежурил перед этой сменой: от сдачи предыдущей (по времени) до приёма этой. */
export function gapBefore(shifts: Shift[], shift: Shift): Gap | null {
  if (!shift.accepted_at) return null;
  const prev = live(shifts)
    .filter((s) => s.id !== shift.id && s.accepted_at && s.accepted_at < shift.accepted_at!)
    .sort((a, b) => (a.accepted_at! < b.accepted_at! ? 1 : -1))[0];
  if (!prev?.handed_at) return null;
  const minutes = Math.round((Date.parse(shift.accepted_at) - Date.parse(prev.handed_at)) / 60_000);
  return minutes >= GAP_MIN ? { from: prev.handed_at, to: shift.accepted_at, minutes } : null;
}

/** Сейчас никто не дежурит: с какого времени (сдача последней смены). null — кто-то на смене или смен ещё не было. */
export function noDutySince(shifts: Shift[], now = new Date()): Gap | null {
  const list = live(shifts);
  if (list.some((s) => s.status === 'open')) return null;
  const last = list.filter((s) => s.handed_at).sort((a, b) => (a.handed_at! < b.handed_at! ? 1 : -1))[0];
  if (!last?.handed_at) return null;
  const minutes = Math.round((now.getTime() - Date.parse(last.handed_at)) / 60_000);
  return { from: last.handed_at, to: now.toISOString(), minutes };
}

/** «11 ч 28 мин», «45 мин», «2 сут 3 ч». */
export function durationText(minutes: number): string {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d) return `${d} сут${h ? ` ${h} ч` : ''}`;
  if (h) return `${h} ч${m ? ` ${m} мин` : ''}`;
  return `${m} мин`;
}
