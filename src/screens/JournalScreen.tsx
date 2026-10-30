import { Fragment, useState, type ReactNode } from 'react';
import { BRANCH_AMOUNT, ELEPHANTS, LEVEL_LABEL, METRIC_LABEL, METRICS } from '../domain/elephants';
import { FEED_TIMES, acceptedBy, shiftFlags, sortShifts } from '../domain/shift';
import type { Shift } from '../domain/types';
import { useRows } from '../lib/store';
import { addDays, isoDate, localDay, longDate, parseIso, relDate, shortDate, timeOf } from '../lib/dates';
import { CalendarSheet, Card, Empty, IconButton, KEY, PAD, Section } from '../ui/kit';
import { AlertsCard } from './common/Alerts';
import { Icon } from '../ui/Icon';
import { NotesList } from './common/NotesList';
import { ElephantHistorySheet } from './common/ElephantHistory';
import { missedTasks } from '../domain/monitoring';
import type { ElephantName } from '../domain/types';
import { mealTitle } from './keeper/FeedingBlock';
import { washText } from './keeper/QuestsBlock';

const EATEN: Record<string, string> = { all: 'всё', half: '½', none: 'отказ' };

const UNSET = { sym: '·', cls: 'text-faint' };
const MARK = [
  { sym: '+', cls: 'text-teal' },
  { sym: '!', cls: 'text-amber' },
  { sym: '×', cls: 'text-coral' },
];
const SHORT: Record<string, string> = { behavior: 'Общ.', sleep: 'Сон', food: 'Еда', water: 'Вода', urine: 'Моча', feces: 'Кал', legs: 'Ноги' };

const WEEKS = 12;
const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const DAY_CLS = [PAD.teal, PAD.amber, PAD.coral];

/** Худшее за день: 0 — всё норма, 1 — было «внимание», 2 — было «плохо». */
function worst(shifts: Shift[]): number {
  return Math.max(0, ...shifts.map((s) => Math.max(0, ...shiftFlags(s).map((f) => f.level))));
}

/** Журнал как бумажный: выбрал день — видишь отметки и всё, что было за дежурство. Тревоги — сверху, только если есть. */
export function JournalScreen() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 px-1 text-[26px] font-extrabold tracking-tight">Журнал</h1>
      <AlertsCard />
      <DaysView />
    </div>
  );
}

/** Дата, под ней календарь как активность на GitHub, ниже смена выбранного дня — таблицей, как на бумаге, и подробности. */
function DaysView() {
  const all = useRows('shifts');
  const shifts = sortShifts(all);
  const [day, setDay] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const byDay = new Map<string, Shift[]>();
  for (const s of shifts) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  const selected = day ?? shifts[0]?.date ?? isoDate();
  /** Открыть день: календарь сам перелистывается к нему. */
  const jump = (to: string) => {
    setDay(to);
    const weeksBack = Math.floor((parseIso(isoDate()).getTime() - parseIso(to).getTime()) / 86400000 / 7);
    if (to < start || to > end) setPage(Math.max(0, Math.floor(weeksBack / WEEKS)));
  };
  /** Стрелки — на день назад или вперёд, дальше сегодня не листаем. */
  const step = (d: number) => {
    const to = addDays(selected, -d);
    if (to <= isoDate()) jump(to);
  };

  // последняя колонка — неделя с сегодняшним днём (или раньше, если листали)
  const end = addDays(isoDate(), -page * WEEKS * 7);
  const endMonday = addDays(end, -((parseIso(end).getDay() + 6) % 7));
  const start = addDays(endMonday, -(WEEKS - 1) * 7);
  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  const today = isoDate();
  const hasOlder = shifts.some((s) => s.date < start);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <IconButton icon="back" label="День раньше" onClick={() => step(1)} />
        <DateJump value={selected} onPick={jump} className={`h-11 flex-1 rounded-xl text-[15px] font-extrabold text-ink ${KEY}`}>
          {longDate(selected)}
        </DateJump>
        <IconButton icon="next" label="День позже" onClick={() => step(-1)} className={selected >= isoDate() ? 'opacity-30' : ''} />
      </div>
      <div>
        <Card className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between px-1">
            <button type="button" disabled={!hasOlder} onClick={() => setPage(page + 1)} className="-my-1.5 h-11 pr-3 text-[14px] font-bold text-teal disabled:text-faint">
              ← раньше
            </button>
            <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="-my-1.5 h-11 pl-3 text-[14px] font-bold text-teal disabled:text-faint">
              позже →
            </button>
          </div>
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: `18px repeat(${WEEKS}, minmax(0, 1fr))` }}>
            <div className="flex flex-col gap-[3px] text-[10px] font-bold text-faint">
              <span className="h-[13px]" />
              {['пн', '', 'ср', '', 'пт', '', 'вс'].map((d, i) => (
                <span key={i} className="flex min-h-0 flex-1 items-center">
                  {d}
                </span>
              ))}
            </div>
            {weeks.map((wk, w) => {
              const first = parseIso(wk[0]);
              const newMonth = w === 0 || first.getDate() <= 7;
              return (
                <div key={wk[0]} className="flex min-w-0 flex-col gap-[3px]">
                  <span className="h-[13px] overflow-visible whitespace-nowrap text-[10px] font-bold leading-[13px] text-faint">{newMonth ? MONTH_SHORT[first.getMonth()] : ''}</span>
                  {wk.map((d) => {
                    const list = byDay.get(d);
                    const future = d > today;
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={future}
                        onClick={() => setDay(d)}
                        aria-label={`${shortDate(d)}${list ? `, дежурный ${list.map((x) => x.keeper_name).join(', ')}` : ', дежурства нет'}`}
                        className={`aspect-square w-full rounded-[3px] ${
                          list ? DAY_CLS[worst(list)] : future ? 'bg-transparent' : PAD.empty
                        } ${d === selected ? 'ring-2 ring-ink' : ''} ${list?.some((x) => x.status === 'open') ? 'opacity-60' : ''}`}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] font-semibold text-muted">
            <span className="inline-flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-[3px] ${PAD.empty}`} />
              нет дежурства
            </span>
            <span className="inline-flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-[3px] ${PAD.teal}`} />
              норма
            </span>
            <span className="inline-flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-[3px] ${PAD.amber}`} />
              внимание
            </span>
            <span className="inline-flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-[3px] ${PAD.coral}`} />
              плохо
            </span>
          </div>
        </Card>
      </div>


      {(byDay.get(selected) ?? []).map((s) => (
        <Fragment key={s.id}>
          <div>
            <ShiftCard shift={s} />
          </div>
          <ShiftDetails shift={s} />
        </Fragment>
      ))}
      {!byDay.get(selected) && <Empty>{shifts.length ? 'В этот день дежурства нет' : 'Дежурств пока нет'}</Empty>}
    </div>
  );
}

/**
 * Кнопка «перейти к дате»: тап открывает календарь телефона (или браузера), выбранный день сразу открывается.
 * Поле даты лежит прозрачным поверх кнопки — так тап на телефоне попадает прямо в него; на компьютере зовём showPicker.
 */
/** Дата с календарём: тап по ней открывает выбор числа (единственный календарь в журнале). */
function DateJump({ value, onPick, className, children }: { value: string; onPick: (d: string) => void; className: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label="Перейти к дате" onClick={() => setOpen(true)} className={`inline-flex items-center justify-center gap-1.5 ${className}`}>
        <Icon name="calendar" size={16} className="text-teal" />
        {children}
      </button>
      <CalendarSheet open={open} value={value} max={isoDate()} onPick={onPick} onClose={() => setOpen(false)} />
    </>
  );
}

/** Смена таблицей, как в бумажном журнале. */
function ShiftCard({ shift: s }: { shift: Shift }) {
  const [history, setHistory] = useState<ElephantName | null>(null);
  return (
    <Card className="flex flex-col gap-2 p-3">
        <div className="flex items-baseline gap-2 px-1">
          <span className="truncate text-[15px] font-extrabold">{s.keeper_name}</span>
          <span className="flex-1 text-[13px] font-semibold text-muted">
            с {timeOf(s.accepted_at)}
            {s.handed_at ? ` до ${timeOf(s.handed_at)}` : ''}
          </span>
          {s.status === 'open' && <span className="text-[12px] font-bold text-teal">идёт</span>}
        </div>
        <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] text-center text-[11px] font-bold text-muted">
          <span />
          {METRICS.map((m) => (
            <span key={m.key}>{SHORT[m.key]}</span>
          ))}
          {ELEPHANTS.map((el) => (
            <Fragment key={el}>
              <button type="button" onClick={() => setHistory(el)} aria-label={`${el}: 14 дней`} className="min-h-9 border-t border-edge py-1 text-left text-[13px] font-bold text-ink2 underline decoration-edge-hi decoration-2 underline-offset-4">
                {el}
              </button>
              {METRICS.map((m) => {
                // нетронутая клетка — норма, только если кипер подтвердил «осмотрел всех» при сдаче
                const level = s.state?.[el]?.[m.key]?.level ?? (s.checked_at ? 0 : null);
                const mark = level == null ? UNSET : MARK[level];
                return (
                  <span key={m.key} className={`border-t border-edge py-1 text-[16px] font-extrabold ${mark.cls}`}>
                    {mark.sym}
                  </span>
                );
              })}
            </Fragment>
          ))}
        </div>
        <span className="px-1 text-[11px] font-semibold text-muted">Тап по имени — как было последние 14 дней</span>
        <ElephantHistorySheet el={history} onClose={() => setHistory(null)} />
      </Card>
  );
}

/**
 * Подробности дежурства под таблицей — по важности: «Что важно» (не норма, невыполненное, замечания, передача),
 * записи, выполненные назначения; рутина (кормление, туалет, сено, мешки) — одной строкой, подробно по тапу.
 */
function ShiftDetails({ shift }: { shift: Shift }) {
  const [openRoutine, setOpenRoutine] = useState(false);
  const notes = useRows('notes');
  const next = acceptedBy(useRows('shifts'), shift);
  const marks = useRows('request_marks');
  const requests = useRows('requests');
  const diets = useRows('diets');
  const q = shift.quests ?? {};
  const sNotes = notes.filter((n) => n.shift_id === shift.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const sMarks = marks.filter((m) => m.shift_id === shift.id);
  const flags = shiftFlags(shift);
  const urine = ELEPHANTS.map((e) => `${e} ${q.urine?.[e]?.ok ?? 0}${q.urine?.[e]?.miss ? ` (мимо ${q.urine[e]!.miss})` : ''}`).join(' · ');
  const care = ELEPHANTS.map((e) => {
    const c = q.care?.[e];
    const parts = [c?.wash || c?.shower ? 'помыли' : null, c?.brush ? 'щёткой' : null].filter(Boolean);
    return parts.length ? `${e}: ${parts.join(', ')}` : null;
  })
    .filter(Boolean)
    .join(' · ');
  const cleaning = [
    q.cleaning?.litter && 'навоз убран',
    q.cleaning?.loosen && 'мокрое сено заменено',
    q.cleaning?.waste && 'мешки вывезены',
    q.cleaning?.bags && `мешков взяли: ${q.cleaning.bags}`,
    q.cleaning?.out && `вывезли: ${q.cleaning.out}`,
  ]
    .filter(Boolean)
    .join(', ');
  const b = q.branches;
  const branches = b?.amount ? BRANCH_AMOUNT[b.amount] : b?.kg ? `${b.kg} кг` : '';
  const branchesText = branches ? `${branches}${b?.kinds?.length ? ` · ${b.kinds.join(', ')}` : ''}` : '—';

  const missed = missedTasks(requests, marks, shift);
  // рутина одной строкой: что не так с кормлением — по имени, остальное числом
  const feedIssues = FEED_TIMES.flatMap((t) => {
    const f = shift.feeds[t];
    if (!f?.done) return shift.status === 'handed' ? [`${t} не отмечено`] : [];
    return ELEPHANTS.filter((e) => (f.eaten?.[e] ?? 'all') !== 'all').map((e) => `${e} ${EATEN[f.eaten![e]!]} в ${t}`);
  });
  const total = (pick: (e: ElephantName) => number) => ELEPHANTS.reduce((n, e) => n + pick(e), 0);
  const routine = [
    feedIssues.length ? `кормление: ${feedIssues.join(', ')}` : FEED_TIMES.some((t) => shift.feeds[t]?.done) ? 'кормление всё' : null,
    `туалет ${total((e) => q.urine?.[e]?.ok ?? 0)} баков`,
    `кал ${total((e) => Number(q.feces?.[e] ?? 0))}`,
    `сено ${shift.hay_bales} тюк.`,
    q.cleaning?.bags ? `мешки ${q.cleaning.bags}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const quiet = shift.status === 'handed' && !flags.length && !missed.length && !next?.accept_remarks;

  return (
    <div className="flex flex-col gap-5">
        {(flags.length > 0 || missed.length > 0 || next?.accept_remarks || shift.note) && (
          <Section title="Что важно">
            <Card className="flex flex-col divide-y divide-edge overflow-hidden">
              {flags.map((f) => (
                <span key={`${f.elephant}-${f.metric}`} className={`px-4 py-2.5 text-[14px] font-bold ${f.level === 2 ? 'text-coral-fg' : 'text-amber-fg'}`}>
                  {f.elephant} · {METRIC_LABEL[f.metric].toLowerCase()} — {LEVEL_LABEL[f.level]}
                  {f.symptoms.length > 0 && <span className="font-semibold">: {f.symptoms.join(', ')}</span>}
                </span>
              ))}
              {missed.map(({ req, why }) => (
                <span key={req.id} className="px-4 py-2.5 text-[14px] font-semibold">
                  <span className="font-bold text-coral-fg">Не выполнено</span> · {req.elephant === 'work' ? 'Работа' : req.elephant === 'all' ? 'Всем' : req.elephant}: {req.text}
                  <span className="text-muted"> — {why}</span>
                </span>
              ))}
              {next?.accept_remarks && (
                <span className="px-4 py-2.5 text-[14px] font-semibold">
                  <span className="font-bold text-amber-fg">Замечания при приёме</span> ({next.keeper_name}): {next.accept_remarks}
                </span>
              )}
              {shift.note && (
                <span className="px-4 py-2.5 text-[14px] leading-relaxed">
                  <span className="font-bold text-muted">Передал следующему:</span> {shift.note}
                </span>
              )}
            </Card>
          </Section>
        )}
        {quiet && <p className="m-0 px-1 text-[14px] font-bold text-teal-fg">Всё спокойно: всё в норме, назначения выполнены, принято без замечаний.</p>}

        {sNotes.length > 0 && (
          <Section title="Записи">
            <NotesList notes={sNotes} />
          </Section>
        )}

        {sMarks.length > 0 && (
          <Section title="Выполнено по назначениям" aside={String(sMarks.length)}>
            <Card className="divide-y divide-edge overflow-hidden">
              {sMarks.map((m) => (
                <div key={m.id} className="flex flex-col gap-0.5 px-4 py-2.5">
                  <span className="text-[14px] font-semibold">{requests.find((r) => r.id === m.request_id)?.text ?? 'Заявка'}</span>
                  <span className="text-[12px] font-semibold text-teal-fg">
                    ✓ {timeOf(m.done_at)} · {m.done_by}
                    {m.note ? ` — ${m.note}` : ''}
                  </span>
                </div>
              ))}
            </Card>
          </Section>
        )}

        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => setOpenRoutine(!openRoutine)} aria-expanded={openRoutine} className={`flex min-h-11 items-center gap-3 rounded-2xl px-4 py-3 text-left ${KEY}`}>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[12px] font-extrabold tracking-wide text-muted">РУТИНА</span>
              <span className="text-[14px] font-semibold">{routine}</span>
            </span>
            <Icon name="down" size={18} className={`shrink-0 text-muted transition ${openRoutine ? 'rotate-180' : ''}`} />
          </button>
          {openRoutine && (
            <>
              <Card className="divide-y divide-edge overflow-hidden">
                {FEED_TIMES.map((t) => {
                  const f = shift.feeds[t];
                  const eaten = f?.done ? ELEPHANTS.filter((e) => (f.eaten?.[e] ?? 'all') !== 'all') : [];
                  return (
                    <div key={t} className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
                      <span className="w-12 font-extrabold">{t}</span>
                      <span className="flex-1 font-semibold text-ink2">{mealTitle(diets, t).title}</span>
                      <span className={`font-bold ${f?.done ? (eaten.length ? 'text-amber-fg' : 'text-teal-fg') : shift.status === 'handed' ? 'text-coral-fg' : 'text-muted'}`}>
                        {f?.done ? (eaten.length ? eaten.map((e) => `${e} ${EATEN[f.eaten![e]!]}`).join(', ') : 'всё') : shift.status === 'handed' ? 'не отмечено' : 'ещё нет'}
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
                  <span className="flex-1 font-semibold text-ink2">Сено</span>
                  <span className="font-bold">{shift.hay_bales} тюк.</span>
                </div>
              </Card>
              <Card className="flex flex-col gap-2.5 p-4 text-[14px]">
                <Row label="Моча, баков" value={urine} />
                <Row label="Кал, раз" value={ELEPHANTS.map((e) => `${e} ${Number(q.feces?.[e] ?? 0)}`).join(' · ')} />
                <Row label="Ветки" value={branchesText} />
                <Row label="Мытьё" value={washText(q) || (care ? 'мыли' : '—')} />
                <Row label="Мешки" value={cleaning || '—'} />
              </Card>
            </>
          )}
        </div>

        <p className="m-0 px-1 text-[12px] font-semibold text-muted">
          Принял {timeOf(shift.accepted_at)}
          {shift.handed_at ? ` · сдал ${relDate(localDay(shift.handed_at))} ${timeOf(shift.handed_at)}` : ' · идёт'}
          {next ? ` · принял ${next.keeper_name} в ${timeOf(next.accepted_at)}${next.accept_remarks ? '' : ', без замечаний'}` : ''}
        </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] font-bold text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
