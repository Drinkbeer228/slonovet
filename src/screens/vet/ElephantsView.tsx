import { canEdit } from '../../domain/access';
import { useMemo, useState } from 'react';
import { ELEPHANTS, LEVEL_LABEL, METRICS } from '../../domain/elephants';
import { FEED_TIMES, sortShifts } from '../../domain/shift';
import type { ElephantName, Level, MetricKey, Shift, VetRequest } from '../../domain/types';
import { getSession } from '../../lib/auth';
import { useRows } from '../../lib/store';
import { addDays, isoDate, relDate, shortDate } from '../../lib/dates';
import { Button, Card, Empty, LEVEL_DOT, Section, Segmented } from '../../ui/kit';
import { NotesList } from '../common/NotesList';
import { ShiftDetail } from '../JournalScreen';
import { NewRequestSheet, RequestList } from './RequestsScreen';

const DAYS = 14;

type Row = { key: string; label: string; levels: (Level | null)[] };

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
  return { latest, dates, byDate, alerts };
}

/** Тревоги сверху журнала: что плохо или повторяется несколько дежурств подряд. Тап — к этой слонихе. */
export function AlertsCard({ onPick }: { onPick: (el: ElephantName) => void }) {
  const { alerts } = useRecent();
  if (!alerts.length) return null;
  return (
    <Card className="flex flex-col gap-1.5 p-4 ring-1 ring-amber/40">
      <span className="text-[12px] font-extrabold tracking-wide text-amber">ТРЕБУЕТ ВНИМАНИЯ</span>
      {alerts.map((a, i) => (
        <button key={i} type="button" onClick={() => onPick(a.el)} className="flex items-start gap-2 text-left text-[15px] font-bold leading-snug">
          <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[a.level]}`} />
          <span>
            {a.el}: {a.text}
          </span>
        </button>
      ))}
    </Card>
  );
}

/** Строка под заголовком журнала: кто дежурил последним. */
export function LatestShiftLine() {
  const { latest } = useRecent();
  return (
    <span className="px-1 text-[13px] font-semibold text-muted">
      {latest ? `последнее дежурство — ${relDate(latest.date)}, ${latest.keeper_name}${latest.status === 'open' ? ' (идёт)' : ''}` : 'дежурств пока нет'}
    </span>
  );
}

/** Журнал «По слонихам»: как каждая слониха жила последние 14 дней, записи киперов и заявки. */
export function ElephantsView({ el, setEl, onRequests }: { el: ElephantName; setEl: (el: ElephantName) => void; onRequests: () => void }) {
  const notes = useRows('notes');
  const requests = useRows('requests');
  const [detail, setDetail] = useState<Shift | null>(null);
  const [creating, setCreating] = useState<ElephantName | 'all' | null>(null);
  const user = getSession()!.user;
  const { dates, byDate, alerts } = useRecent();
  const alertEls = Object.fromEntries(ELEPHANTS.map((e) => [e, alerts.some((a) => a.el === e)])) as Record<ElephantName, boolean>;

  const rows: Row[] = [
    ...METRICS.map((m) => ({
      key: m.key,
      label: m.label,
      levels: dates.map((d) => byDate.get(d)?.state?.[el]?.[m.key as MetricKey]?.level ?? null),
    })),
    { key: 'eaten', label: 'Доедание', levels: dates.map((d) => eatenLevel(byDate.get(d), el)) },
  ];
  const urine = dates.map((d) => {
    const s = byDate.get(d);
    return s ? (s.quests?.urine?.[el]?.ok ?? null) : null;
  });

  const elNotes = notes
    .filter((n) => n.elephant === el && n.created_at.slice(0, 10) >= dates[0])
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 12);
  const elReqs: VetRequest[] = requests.filter((r) => r.status === 'active' && (r.elephant === el || r.elephant === 'all'));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Segmented label="Слониха" value={el} onChange={setEl} dots={alertEls} options={ELEPHANTS.map((e) => ({ value: e, label: e }))} />
          <Card className="flex flex-col gap-1.5 px-3 py-3.5">
            <div className="flex items-baseline justify-between px-0.5 pb-1">
              <h2 className="m-0 text-[15px] font-extrabold">Последние {DAYS} дней</h2>
              <span className="text-[12px] font-semibold text-muted">
                {shortDate(dates[0])} — {shortDate(dates[dates.length - 1])} · {dates.some((d) => byDate.has(d)) ? 'нажми на клетку' : 'клетки заполнятся по дежурствам'}
              </span>
            </div>
            {rows.map((r) => (
              <div key={r.key} className="grid items-center gap-[3px]" style={{ gridTemplateColumns: `76px repeat(${DAYS}, minmax(0, 1fr))` }}>
                <span className="text-[13px] font-semibold text-ink2">{r.label}</span>
                {r.levels.map((lv, i) => {
                  const s = byDate.get(dates[i]);
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!s}
                      onClick={() => s && setDetail(s)}
                      title={`${shortDate(dates[i])} — ${lv == null ? 'не отмечено' : LEVEL_LABEL[lv]}`}
                      aria-label={`${r.label}, ${shortDate(dates[i])}: ${lv == null ? 'не отмечено' : LEVEL_LABEL[lv]}`}
                      className={`h-[22px] rounded-[4px] ${lv == null ? 'shadow-[inset_0_0_0_1px_var(--color-track)]' : LEVEL_DOT[lv]}`}
                    />
                  );
                })}
              </div>
            ))}
            <div className="grid items-center gap-[3px] pt-1" style={{ gridTemplateColumns: `76px repeat(${DAYS}, minmax(0, 1fr))` }}>
              <span className="text-[12px] font-semibold text-muted">Баков мочи</span>
              {urine.map((u, i) => (
                <span key={i} className="text-center text-[11px] font-bold text-muted">
                  {u ?? ''}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1 px-0.5 pt-2 text-[12px] font-semibold text-muted">
              {(['норма', 'внимание', 'плохо'] as const).map((l, i) => (
                <span key={l} className="inline-flex items-center gap-1.5">
                  <span className={`h-3 w-3 rounded-[3px] ${LEVEL_DOT[i]}`} />
                  {l}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-[3px] shadow-[inset_0_0_0_1px_var(--color-track)]" />
                не отмечено
              </span>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Section title="Что пишут киперы">{elNotes.length ? <NotesList notes={elNotes} showElephant={false} showDate /> : <Empty>За две недели записей нет</Empty>}</Section>

          <Section
            title="Заявки"
            aside={
              <button type="button" className="-my-3 py-3 pl-3 font-bold text-teal" onClick={onRequests}>
                все →
              </button>
            }
          >
            {elReqs.length > 0 && <RequestList list={elReqs} onOpen={() => onRequests()} />}
            {canEdit('requests', user.role) && (
              <Button kind="primary" big full icon="plus" onClick={() => setCreating(el)}>
                Новая заявка · {el}
              </Button>
            )}
          </Section>
        </div>
      </div>

      <ShiftDetail shift={detail} onClose={() => setDetail(null)} />
      <NewRequestSheet initial={creating} user={user} onClose={() => setCreating(null)} />
    </div>
  );
}

