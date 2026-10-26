import { ELEPHANTS, METRICS } from './elephants';
import type { CurrentUser, ElephantName, Level, MetricKey, RequestMark, Shift, VetRequest } from './types';
import { isoDate, localDay } from '../lib/dates';

export const FEED_TIMES = ['07:00', '13:00', '17:00', '19:00'];

export function newShift(
  user: CurrentUser,
  safety: Record<string, boolean>,
  date = isoDate(),
  from: { id: string; remarks: string } | null = null,
): Omit<Shift, 'updated_at'> {
  return {
    id: date,
    date,
    keeper_id: user.id,
    keeper_name: user.full_name,
    status: 'open',
    safety,
    state: {},
    feeds: {},
    quests: {},
    hay_bales: 0,
    note: '',
    accepted_at: new Date().toISOString(),
    handed_at: null,
    handover_code: null,
    accepted_from: from?.id ?? null,
    accept_remarks: from?.remarks ?? '',
  };
}

/** Смена, которая приняла эту (если уже приняли). */
export function acceptedBy(shifts: Shift[], shift: Shift | undefined): Shift | undefined {
  return shift ? shifts.find((s) => s.accepted_from === shift.id) : undefined;
}

/** Код передачи: 4 случайные цифры, без «0000»-подобных повторов. */
export function newHandoverCode(): string {
  const rnd = () => {
    const a = new Uint32Array(1);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(a);
    else a[0] = Math.floor(Math.random() * 2 ** 32);
    return a[0];
  };
  for (;;) {
    const code = String(rnd() % 10000).padStart(4, '0');
    if (new Set(code).size > 1) return code;
  }
}

export function sortShifts(shifts: Shift[]) {
  // за один день может быть две смены (передали днём) — свежая сверху
  return [...shifts].sort((a, b) => b.date.localeCompare(a.date) || (b.accepted_at ?? '').localeCompare(a.accepted_at ?? ''));
}

export function currentShift(shifts: Shift[]): Shift | undefined {
  return sortShifts(shifts).find((s) => s.status === 'open');
}

export function lastHanded(shifts: Shift[]): Shift | undefined {
  return sortShifts(shifts).find((s) => s.status === 'handed');
}

export function cellLevel(shift: Shift | undefined, el: ElephantName, m: MetricKey): Level | null {
  const c = shift?.state?.[el]?.[m];
  return c ? c.level : null;
}

export interface Flag {
  elephant: ElephantName;
  metric: MetricKey;
  level: Level;
  symptoms: string[];
}

export function shiftFlags(shift: Shift | undefined): Flag[] {
  if (!shift) return [];
  const out: Flag[] = [];
  for (const el of ELEPHANTS) {
    for (const m of METRICS) {
      const c = shift.state?.[el]?.[m.key];
      if (c && c.level > 0) out.push({ elephant: el, metric: m.key, level: c.level, symptoms: c.symptoms ?? [] });
    }
  }
  return out;
}

export function unsetCount(shift: Shift): number {
  let n = 0;
  for (const el of ELEPHANTS) for (const m of METRICS) if (!shift.state?.[el]?.[m.key]) n++;
  return n;
}

/** Что из заявок врача нужно сделать в этой смене. */
export interface RequestTodo {
  req: VetRequest;
  marks: RequestMark[]; // отметки в этой смене
  allMarks: RequestMark[];
  needed: number; // сколько отметок нужно в эту смену
  done: boolean;
}

export function requestTodos(requests: VetRequest[], marks: RequestMark[], shift: Shift): RequestTodo[] {
  return requests
    .filter((r) => r.status === 'active' && (!r.due_date || r.due_date >= shift.date))
    .map((req) => {
      const allMarks = marks.filter((m) => m.request_id === req.id);
      const here = allMarks.filter((m) => m.shift_id === shift.id);
      const needed = req.frequency === 'feeding' ? FEED_TIMES.length : 1;
      const done = req.frequency === 'once' ? allMarks.length > 0 : here.length >= needed;
      return { req, marks: here, allMarks, needed, done };
    })
    .filter((t) => !(t.req.frequency === 'once' && t.done && t.marks.length === 0))
    .sort((a, b) => Number(a.done) - Number(b.done) || Number(b.req.urgent) - Number(a.req.urgent));
}

/** Готовые наборы ответов для заявки врача */
export const ANSWER_PRESETS: { label: string; options: string[] }[] = [
  { label: 'Съела', options: ['всё', 'половину', 'отказ'] },
  { label: 'Есть / нет', options: ['есть', 'нет'] },
  { label: 'Норма / внимание / плохо', options: ['норма', 'внимание', 'плохо'] },
  { label: 'Выпила', options: ['много', 'как обычно', 'мало'] },
];

/** Кому адресовано назначение — для подписи */
export function whoLabel(e: string): string {
  return e === 'all' ? 'Всем слонам' : e === 'work' ? 'Работа' : e;
}

export const FREQ_LABEL: Record<VetRequest['frequency'], string> = {
  once: 'один раз',
  shift: 'каждое дежурство',
  feeding: 'каждое кормление',
};

/** Сколько смен должно было быть отмечено и сколько отмечено — для прогресса у врача. */
export function requestProgress(req: VetRequest, marks: RequestMark[], shifts: Shift[]) {
  const mine = marks.filter((m) => m.request_id === req.id);
  if (req.frequency === 'once') return { done: Math.min(1, mine.length), total: 1, last: lastMark(mine) };
  const created = localDay(req.created_at);
  const relevant = shifts.filter((s) => s.date >= created && (!req.due_date || s.date <= req.due_date));
  const per = req.frequency === 'feeding' ? FEED_TIMES.length : 1;
  const doneShifts = relevant.filter((s) => mine.filter((m) => m.shift_id === s.id).length >= per).length;
  return { done: doneShifts, total: Math.max(relevant.length, 1), last: lastMark(mine) };
}

function lastMark(marks: RequestMark[]) {
  return [...marks].sort((a, b) => (a.done_at < b.done_at ? 1 : -1))[0];
}
