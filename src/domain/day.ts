import { FEED_TIMES, type RequestTodo } from './shift';
import { feedMoment, feedStatus, type FeedStatus } from './monitoring';
import type { Shift } from './types';

/**
 * День дежурного по смыслу, а не по минутам: Утро · День · Вечер · Ночь. Репетиции (9:00 подготовка, 11:00–13:00 манеж)
 * и представления сдвигают кашу на полчаса-час — поэтому отрезок, а не таймер. Сено даётся фоном весь день — не слот.
 */
export const SLOT: Record<string, { name: string; hint: string }> = {
  '07:00': { name: 'Утро', hint: '07:00' },
  '13:00': { name: 'День', hint: '13–14' },
  '17:00': { name: 'Вечер', hint: '17:00' },
  '19:00': { name: 'Ночь', hint: '19:00' },
};

/** Кормления в порядке смены: принимают утром, поэтому 07:00 — последнее, уже следующим утром. */
export function shiftFeedOrder(shift: Pick<Shift, 'date'>): string[] {
  return [...FEED_TIMES].sort((a, b) => feedMoment(shift, a).getTime() - feedMoment(shift, b).getTime());
}

export interface DaySlot {
  time: string;
  name: string;
  hint: string;
  status: FeedStatus | 'off';
}

/** Лента дня: кормления смены по порядку; отменённые в дороге — off. */
export function daySlots(shift: Shift, cancelled: (time: string) => boolean, now = new Date()): DaySlot[] {
  return shiftFeedOrder(shift).map((time) => ({ time, ...SLOT[time], status: cancelled(time) ? 'off' : feedStatus(shift, time, now) }));
}

export type NowItem =
  | { kind: 'feed'; time: string; late: boolean }
  | { kind: 'task'; todo: RequestTodo }
  | { kind: 'handover' }
  | { kind: 'calm'; next: DaySlot | null; left: number };

/** Задача «ко времени» подошла: за час до срока и позже. */
function timeDue(t: RequestTodo, now: Date): boolean {
  const at = t.req.at_time?.slice(0, 5);
  if (!at) return false;
  const [h, m] = at.split(':').map(Number);
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m - 60;
}

/**
 * Одно ближайшее дело для плиты «Сейчас»: не отмеченное прошлое кормление → срочное → кормление, чей отрезок идёт →
 * задача ко времени → пора передавать → спокойно (что дальше и сколько назначений осталось).
 */
export function nowItem(slots: DaySlot[], todos: RequestTodo[], opts: { stale: boolean; now?: Date }): NowItem {
  const now = opts.now ?? new Date();
  const open = todos.filter((t) => !t.done);
  const late = slots.find((s) => s.status === 'late');
  if (late) return { kind: 'feed', time: late.time, late: true };
  const urgent = open.find((t) => t.req.urgent);
  if (urgent) return { kind: 'task', todo: urgent };
  const due = slots.find((s) => s.status === 'due');
  if (due) return { kind: 'feed', time: due.time, late: false };
  const timed = open.find((t) => timeDue(t, now));
  if (timed) return { kind: 'task', todo: timed };
  if (opts.stale) return { kind: 'handover' };
  return { kind: 'calm', next: slots.find((s) => s.status === 'soon') ?? null, left: open.length };
}
