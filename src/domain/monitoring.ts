import { METRICS } from './elephants';
import { FEED_TIMES, closingMarks, shiftFlags, type Flag } from './shift';
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
      const needed = req.frequency === 'feeding' ? FEED_TIMES.length : 1;
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
