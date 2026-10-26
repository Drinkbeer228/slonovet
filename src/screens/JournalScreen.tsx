import { Fragment, useState, type ReactNode } from 'react';
import { BRANCH_AMOUNT, ELEPHANTS, METRICS } from '../domain/elephants';
import { FEED_TIMES, acceptedBy, shiftFlags, sortShifts } from '../domain/shift';
import type { Shift } from '../domain/types';
import { useRows } from '../lib/store';
import { addDays, isoDate, longDate, parseIso, relDate, shortDate, timeOf } from '../lib/dates';
import { Card, Empty, IconButton, Section, Sheet } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { NotesList } from './common/NotesList';
import { StateMatrix } from './keeper/StateMatrix';
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
const DAY_CLS = ['bg-teal', 'bg-dot1', 'bg-dot2'];

/** Худшее за день: 0 — всё норма, 1 — было «внимание», 2 — было «плохо». */
function worst(shifts: Shift[]): number {
  return Math.max(0, ...shifts.map((s) => Math.max(0, ...shiftFlags(s).map((f) => f.level))));
}

/** Журнал: календарь как активность на GitHub, под ним смена выбранного дня — таблицей, как на бумаге. */
export function JournalScreen() {
  const all = useRows('shifts');
  const shifts = sortShifts(all);
  const [open, setOpen] = useState<Shift | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const byDay = new Map<string, Shift[]>();
  for (const s of shifts) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  const selected = day ?? shifts[0]?.date ?? isoDate();
  const days = [...byDay.keys()].sort().reverse();
  const dayIdx = days.indexOf(selected);
  /** Открыть день: календарь сам перелистывается к нему. */
  const jump = (to: string) => {
    setDay(to);
    const weeksBack = Math.floor((parseIso(isoDate()).getTime() - parseIso(to).getTime()) / 86400000 / 7);
    if (to < start || to > end) setPage(Math.max(0, Math.floor(weeksBack / WEEKS)));
  };
  const step = (d: number) => {
    const to = days[dayIdx + d];
    if (to) jump(to);
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
      <h1 className="m-0 px-1 text-[26px] font-extrabold tracking-tight">Журнал</h1>
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
                      disabled={!list}
                      onClick={() => setDay(d)}
                      aria-label={`${shortDate(d)}${list ? `, дежурный ${list.map((x) => x.keeper_name).join(', ')}` : ', дежурства нет'}`}
                      className={`aspect-square w-full rounded-[3px] ${
                        list ? DAY_CLS[worst(list)] : future ? 'bg-transparent' : 'bg-empty'
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
            <span className="h-2.5 w-2.5 rounded-[3px] bg-empty" />
            нет дежурства
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-teal" />
            норма
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-dot1" />
            внимание
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-dot2" />
            плохо
          </span>
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <IconButton icon="back" label="Дежурство раньше" onClick={() => step(1)} className={!days[dayIdx + 1] ? 'opacity-30' : ''} />
        <DateJump value={selected} onPick={jump} className="h-11 flex-1 rounded-xl border border-line text-[15px] font-extrabold">
          {longDate(selected)}
        </DateJump>
        <IconButton icon="next" label="Дежурство позже" onClick={() => step(-1)} className={!days[dayIdx - 1] ? 'opacity-30' : ''} />
      </div>

      {(byDay.get(selected) ?? []).map((s) => (
        <ShiftCard key={s.id} shift={s} shifts={shifts} onOpen={() => setOpen(s)} />
      ))}
      {!byDay.get(selected) && <Empty>{shifts.length ? 'В этот день дежурства нет' : 'Дежурств пока нет'}</Empty>}
      <ShiftDetail shift={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/**
 * Кнопка «перейти к дате»: тап открывает календарь телефона (или браузера), выбранный день сразу открывается.
 * Поле даты лежит прозрачным поверх кнопки — так тап на телефоне попадает прямо в него; на компьютере зовём showPicker.
 */
/** Дата с календарём: тап по ней открывает выбор числа (единственный календарь в журнале). */
function DateJump({ value, onPick, className, children }: { value: string; onPick: (d: string) => void; className: string; children: ReactNode }) {
  return (
    <label className={`relative inline-flex cursor-pointer items-center justify-center gap-1.5 ${className}`}>
      <Icon name="calendar" size={16} className="text-teal" />
      {children}
      <input
        type="date"
        aria-label="Перейти к дате"
        value={value}
        max={isoDate()}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch {
            /* старые браузеры откроют календарь сами по тапу */
          }
        }}
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

/** Смена таблицей, как в бумажном журнале. */
function ShiftCard({ shift: s, shifts, onOpen }: { shift: Shift; shifts: Shift[]; onOpen: () => void }) {
  const notes = useRows('notes');
  const n = notes.filter((x) => x.shift_id === s.id).length;
  const next = acceptedBy(shifts, s);
  const branches = s.quests?.branches?.amount || s.quests?.branches?.kg ? '+' : '—';
  const wash = washText(s.quests);
  return (
    <button type="button" onClick={onOpen} className="block w-full text-left">
      <Card className="flex flex-col gap-2 p-3">
        <div className="flex items-baseline gap-2 px-1">
          <span className="truncate text-[15px] font-extrabold">{s.keeper_name}</span>
          <span className="flex-1 text-[13px] font-semibold text-muted">
            с {timeOf(s.accepted_at)}
            {s.handed_at ? ` до ${timeOf(s.handed_at)}` : ''}
          </span>
          {s.status === 'open' && <span className="text-[12px] font-bold text-teal">идёт</span>}
          <Icon name="next" size={16} className="text-muted" />
        </div>
        <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] text-center text-[11px] font-bold text-muted">
          <span />
          {METRICS.map((m) => (
            <span key={m.key}>{SHORT[m.key]}</span>
          ))}
          {ELEPHANTS.map((el) => (
            <Fragment key={el}>
              <span className="border-t border-surface2 py-1 text-left text-[13px] font-bold text-ink2">{el}</span>
              {METRICS.map((m) => {
                // нетронутая клетка — норма, только если кипер подтвердил «осмотрел всех» при сдаче
                const level = s.state?.[el]?.[m.key]?.level ?? (s.checked_at ? 0 : null);
                const mark = level == null ? UNSET : MARK[level];
                return (
                  <span key={m.key} className={`border-t border-surface2 py-1 text-[16px] font-extrabold ${mark.cls}`}>
                    {mark.sym}
                  </span>
                );
              })}
            </Fragment>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-1 text-[12px] font-semibold text-muted">
          <span>сено {s.hay_bales}</span>
          <span>ветки {branches}</span>
          {wash && <span>{wash.split(',')[0]}</span>}
          {n > 0 && <span>записей: {n}</span>}
          {next?.accept_remarks && <span className="text-amber">приняли с замечаниями</span>}
        </div>
        {s.note && <p className="m-0 line-clamp-2 px-1 text-[13px] leading-snug text-ink2">{s.note}</p>}
      </Card>
    </button>
  );
}

export function ShiftDetail({ shift, onClose }: { shift: Shift | null; onClose: () => void }) {
  const notes = useRows('notes');
  const next = acceptedBy(useRows('shifts'), shift ?? undefined);
  const marks = useRows('request_marks');
  const requests = useRows('requests');
  const diets = useRows('diets');
  if (!shift) return null;
  const q = shift.quests ?? {};
  const sNotes = notes.filter((n) => n.shift_id === shift.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const sMarks = marks.filter((m) => m.shift_id === shift.id);
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

  return (
    <Sheet open onClose={onClose} title={`${longDate(shift.date)} · ${shift.keeper_name}`}>
      <div className="flex flex-col gap-6 pb-2">
        {shift.note && (
          <Card className="p-4">
            <span className="mb-1 block text-[12px] font-extrabold tracking-wide text-muted">ЗАМЕТКА ДЕЖУРСТВУ</span>
            <p className="m-0 text-[15px] leading-relaxed">{shift.note}</p>
          </Card>
        )}

        {next && (
          <Card className="p-4">
            <span className="mb-1 block text-[12px] font-extrabold tracking-wide text-muted">
              ПРИНЯЛ {next.keeper_name.toUpperCase()} · {timeOf(next.accepted_at)}
            </span>
            {next.accept_remarks ? (
              <p className="m-0 text-[15px] font-semibold leading-relaxed text-amber">Замечания: {next.accept_remarks}</p>
            ) : (
              <p className="m-0 text-[15px] font-semibold text-teal">Без замечаний</p>
            )}
          </Card>
        )}

        <StateMatrix shift={shift} readOnly />

        <Section title="Кормление">
          <Card className="divide-y divide-surface2 overflow-hidden">
            {FEED_TIMES.map((t) => {
              const f = shift.feeds[t];
              const eaten = f?.done ? ELEPHANTS.filter((e) => (f.eaten?.[e] ?? 'all') !== 'all') : [];
              return (
                <div key={t} className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
                  <span className="w-12 font-extrabold">{t}</span>
                  <span className="flex-1 font-semibold text-ink2">{mealTitle(diets, t).title}</span>
                  <span className={`font-bold ${f?.done ? (eaten.length ? 'text-amber' : 'text-teal') : 'text-coral'}`}>
                    {f?.done
                      ? eaten.length
                        ? eaten.map((e) => `${e} ${EATEN[f.eaten![e]!]}`).join(', ')
                        : 'всё'
                      : 'не отмечено'}
                  </span>
                </div>
              );
            })}
            <div className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
              <span className="flex-1 font-semibold text-ink2">Сено</span>
              <span className="font-bold">{shift.hay_bales} тюк.</span>
            </div>
          </Card>
        </Section>

        <Section title="За дежурство">
          <Card className="flex flex-col gap-2.5 p-4 text-[14px]">
            <Row label="Моча, баков" value={urine} />
            <Row label="Ветки" value={branchesText} />
            <Row label="Кал, раз" value={ELEPHANTS.map((e) => `${e} ${Number(q.feces?.[e] ?? 0)}`).join(' · ')} />
            <Row label="Мытьё" value={washText(q) || (care ? 'мыли' : '—')} />
            <Row label="Мешки" value={cleaning || '—'} />
          </Card>
        </Section>

        {sMarks.length > 0 && (
          <Section title="Назначения и задачи">
            <Card className="divide-y divide-surface2 overflow-hidden">
              {sMarks.map((m) => (
                <div key={m.id} className="flex flex-col gap-0.5 px-4 py-2.5">
                  <span className="text-[14px] font-semibold">{requests.find((r) => r.id === m.request_id)?.text ?? 'Заявка'}</span>
                  <span className="text-[12px] font-semibold text-teal">
                    ✓ {timeOf(m.done_at)} · {m.done_by}
                    {m.note ? ` — ${m.note}` : ''}
                  </span>
                </div>
              ))}
            </Card>
          </Section>
        )}

        {sNotes.length > 0 && (
          <Section title="Записи">
            <NotesList notes={sNotes} />
          </Section>
        )}

        <p className="m-0 px-1 text-[12px] font-semibold text-muted">
          Принял {timeOf(shift.accepted_at)}
          {shift.handed_at ? ` · сдал ${relDate(shift.handed_at.slice(0, 10))} ${timeOf(shift.handed_at)}` : ' · идёт'}
        </p>
      </div>
    </Sheet>
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
