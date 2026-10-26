import { useMemo } from 'react';
import { ELEPHANTS, METRICS } from '../../domain/elephants';
import { FEED_TIMES, sortShifts } from '../../domain/shift';
import type { ElephantName, Level, MetricKey, Shift } from '../../domain/types';
import { useRows } from '../../lib/store';
import { addDays, isoDate, relDate } from '../../lib/dates';
import { Card, LEVEL_DOT } from '../../ui/kit';

/** Сколько последних дней смотрим, чтобы заметить, что тянется несколько дежурств подряд. */
const DAYS = 14;

function eatenLevel(s: Shift | undefined, el: ElephantName): Level | null {
  if (!s) return null;
  const done = FEED_TIMES.map((t) => s.feeds[t]).filter((f) => f?.done);
  if (!done.length) return null;
  if (done.some((f) => f!.eaten?.[el] === 'none')) return 2;
  if (done.some((f) => f!.eaten?.[el] === 'half')) return 1;
  return 0;
}

interface Alert {
  el: ElephantName;
  text: string;
  level: Level;
}

/** Что показать врачу наверху: повторяющиеся отклонения и «плохо» в последней смене. */
function computeAlerts(byDate: Map<string, Shift>, dates: string[]): Alert[] {
  const out: Alert[] = [];
  const recent = [...dates].reverse().filter((d) => byDate.has(d)); // от свежих к старым
  const latest = byDate.get(recent[0]);
  for (const el of ELEPHANTS) {
    for (const m of METRICS) {
      const lv = (d: string) => byDate.get(d)?.state?.[el]?.[m.key]?.level ?? null;
      let streak = 0;
      for (const d of recent) {
        if ((lv(d) ?? 0) > 0) streak++;
        else break;
      }
      const last = latest ? lv(recent[0]) : null;
      if (last === 2) out.push({ el, level: 2, text: `${m.label.toLowerCase()} — плохо${streak > 1 ? `, ${streak} дежурства подряд` : ''}` });
      else if (streak >= 2) out.push({ el, level: 1, text: `${m.label.toLowerCase()} — внимание ${streak} ${streak < 5 ? 'дежурства' : 'дежурств'} подряд` });
    }
    const eaten = eatenLevel(latest, el);
    if (latest && eaten && eaten > 0) {
      const which = FEED_TIMES.filter((t) => latest.feeds[t]?.done && (latest.feeds[t]!.eaten?.[el] ?? 'all') !== 'all');
      out.push({ el, level: eaten, text: `не доела: ${which.join(', ')} (${relDate(latest.date)})` });
    }
  }
  return out.sort((a, b) => b.level - a.level);
}

/** Последние 14 дней: дежурство на каждую дату и тревоги по слонихам. */
function useRecent() {
  const shifts = sortShifts(useRows('shifts'));
  const latest = shifts[0];
  const end = latest && latest.date > isoDate() ? latest.date : isoDate();
  const dates = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(end, i - DAYS + 1)), [end]);
  const byDate = useMemo(() => {
    const m = new Map<string, Shift>();
    // если за дату несколько смен — берём последнюю
    for (const s of [...shifts].reverse()) m.set(s.date, s);
    return m;
  }, [shifts]);
  const alerts = useMemo(() => computeAlerts(byDate, dates), [byDate, dates]);
  return { alerts };
}

/** Тревоги сверху журнала: что плохо или повторяется несколько дежурств подряд. Пусто — плашки нет. */
export function AlertsCard() {
  const { alerts } = useRecent();
  if (!alerts.length) return null;
  return (
    <Card className="flex flex-col gap-1.5 p-4 ring-1 ring-amber/40">
      <span className="text-[12px] font-extrabold tracking-wide text-amber">ТРЕБУЕТ ВНИМАНИЯ</span>
      {alerts.map((a, i) => (
        <span key={i} className="flex items-start gap-2 text-[15px] font-bold leading-snug">
          <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[a.level]}`} />
          <span>
            {a.el}: {a.text}
          </span>
        </span>
      ))}
    </Card>
  );
}
