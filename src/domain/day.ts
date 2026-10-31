import { FEED_TIMES } from './shift';
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
  status: FeedStatus;
}

/** Кормления смены по порядку и их состояние — для сводки «Сдаю». */
export function daySlots(shift: Shift, now = new Date()): DaySlot[] {
  return shiftFeedOrder(shift).map((time) => ({ time, ...SLOT[time], status: feedStatus(shift, time, now) }));
}
