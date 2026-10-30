import { ELEPHANTS, METRICS } from './elephants';
import { FEED_TIMES, sortShifts } from './shift';
import type { ElephantName, MetricKey, Shift } from './types';
import { addDays, isoDate } from '../lib/dates';

/*
 * Что видят врач и директор наверху журнала. Два разных смысла:
 *  - «Тревога» — «плохо» по последней отметке или отказ от еды: звонить врачу.
 *  - «В процедурах» — «внимание»: плановое лечение или наблюдение (ванночки для ног неделю-две), без паники.
 * Считаем по отметкам, а не по сменам: новая пустая смена ничего не сбрасывает, неотмеченное серию не рвёт.
 */

/** Сколько последних дней смотрим. */
export const HEALTH_DAYS = 14;

export interface HealthItem {
  el: ElephantName;
  metric: MetricKey | null;
  text: string;
  /** с какого дня тянется (первая отметка серии) */
  since: string;
  /** какой по счёту день серии, считая сегодняшний */
  day: number;
  symptoms: string[];
}

const dayNo = (since: string, today: string) => {
  let n = 1;
  for (let d = since; d < today && n < 400; d = addDays(d, 1)) n++;
  return n;
};

export function healthAlerts(shifts: Shift[], today = isoDate()): { alarms: HealthItem[]; procedures: HealthItem[] } {
  const from = addDays(today, -HEALTH_DAYS + 1);
  const chrono = sortShifts(shifts.filter((s) => !s.deleted && s.date >= from)).reverse(); // от старых к свежим
  const alarms: HealthItem[] = [];
  const procedures: HealthItem[] = [];
  for (const el of ELEPHANTS) {
    for (const m of METRICS) {
      // только явные отметки: смена, где ячейку не трогали, серию не прерывает и не обнуляет
      const marks = chrono.flatMap((s) => {
        const c = s.state?.[el]?.[m.key];
        return c ? [{ date: s.date, level: c.level, symptoms: c.symptoms ?? [] }] : [];
      });
      const last = marks[marks.length - 1];
      if (!last || last.level === 0) continue;
      // начало серии: подряд идущие отметки того же уровня или выше с конца
      let i = marks.length - 1;
      while (i > 0 && marks[i - 1].level >= (last.level === 2 ? 2 : 1)) i--;
      const since = marks[i].date;
      const item = { el, metric: m.key, since, day: dayNo(since, today), symptoms: last.symptoms };
      const label = m.label.toLowerCase();
      if (last.level === 2) alarms.push({ ...item, text: `${label} — плохо` });
      else procedures.push({ ...item, text: `${label} — внимание` });
    }
    // еда — по последней смене, где кормили
    const fed = [...chrono].reverse().find((s) => FEED_TIMES.some((t) => s.feeds[t]?.done));
    if (fed) {
      const none = FEED_TIMES.filter((t) => fed.feeds[t]?.done && fed.feeds[t]!.eaten?.[el] === 'none');
      const half = FEED_TIMES.filter((t) => fed.feeds[t]?.done && fed.feeds[t]!.eaten?.[el] === 'half');
      const base = { el, metric: null, since: fed.date, day: dayNo(fed.date, today), symptoms: [] };
      if (none.length) alarms.push({ ...base, text: `отказ от еды: ${none.join(', ')}` });
      else if (half.length) procedures.push({ ...base, text: `не доела: ${half.join(', ')}` });
    }
  }
  return { alarms, procedures };
}
