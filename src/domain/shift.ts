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

/**
 * Отсыпной: человек сдал суточное дежурство (не меньше 18 часов) — следующие 24 часа он отдыхает.
 * Задачу ему поставить можно, но экран предупредит.
 */
export const REST_HOURS = 24;
export function onRestDay(userId: string, shifts: Shift[], now = Date.now()): boolean {
  return shifts.some((s) => {
    if (s.keeper_id !== userId || s.deleted || !s.handed_at || !s.accepted_at) return false;
    const end = Date.parse(s.handed_at);
    const long = end - Date.parse(s.accepted_at) >= 18 * 3600_000;
    return long && now >= end && now < end + REST_HOURS * 3600_000;
  });
}

/** Смена, которая приняла эту (если уже приняли). */
export function acceptedBy(shifts: Shift[], shift: Shift | undefined): Shift | undefined {
  return shift ? shifts.find((s) => s.accepted_from === shift.id) : undefined;
}

/** Смене пошли вторые сутки: прошло 24 часа от приёма. Смены идут не по календарю, поэтому считаем от приёма. */
export const ROLLOVER_HOURS = 24;
export function needsRollover(shift: Shift, now = Date.now()): boolean {
  if (shift.status !== 'open' || !shift.accepted_at) return false;
  return now - Date.parse(shift.accepted_at) >= ROLLOVER_HOURS * 3600 * 1000;
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

/** Ответы-неудачи: отметка «не получилось» не закрывает разовую задачу — её надо сделать ещё раз. */
export const FAILED_ANSWERS = ['не получилось', 'не вышло', 'не дал'];

/** Ответ отметки — вариант кнопки в начале заметки («ответ — комментарий»); без ответа — null. */
export function markAnswer(m: RequestMark, req?: VetRequest): string | null {
  const head = (m.note ?? '').split(' — ')[0].trim();
  if (!head) return null;
  return req?.options?.includes(head) || FAILED_ANSWERS.includes(head) ? head : null;
}

export const isFailedMark = (m: RequestMark, req?: VetRequest) => FAILED_ANSWERS.includes(markAnswer(m, req) ?? '');

/** Отметки, которые засчитываются выполнением (не удалённые и не «не получилось»). */
export const closingMarks = (marks: RequestMark[], req: VetRequest) => marks.filter((m) => m.request_id === req.id && !m.deleted && !isFailedMark(m, req));

/**
 * today — сегодняшний день (на экране — isoDate()): задача «на сегодня», поставленная после полуночи,
 * видна и в смене, принятой вчера вечером. Без него — день смены (так считают тесты на фиксированных датах).
 * Срочное видно сразу, даже если поставлено на будущий день, — так же, как на доске.
 */
export function requestTodos(requests: VetRequest[], marks: RequestMark[], shift: Shift, today = shift.date): RequestTodo[] {
  const day = today > shift.date ? today : shift.date;
  return requests
    .filter((r) => r.status === 'active' && (!r.due_date || r.due_date >= shift.date) && (!r.on_date || r.on_date <= day || r.urgent))
    .map((req) => {
      const allMarks = marks.filter((m) => m.request_id === req.id);
      const here = allMarks.filter((m) => m.shift_id === shift.id);
      const needed = perShift(req);
      // «не получилось» не закрывает разовую задачу: она остаётся и ждёт повторной попытки
      const done = req.frequency === 'once' ? closingMarks(allMarks, req).length > 0 : here.length >= needed;
      return { req, marks: here, allMarks, needed, done };
    })
    .filter((t) => !(t.req.frequency === 'once' && t.done && closingMarks(t.marks, t.req).length === 0))
    // невыполненное: срочное всегда наверху, дальше по сроку (у просроченного он самый ранний), при равном — кто раньше поставлен
    .sort((a, b) => Number(a.done) - Number(b.done) || byPriority(a.req, b.req));
}

/** На «Дежурстве» — только по слонам (медицина, уход); «Работа» живёт на доске «Задачи». */
export const dutyTodos = (requests: VetRequest[], marks: RequestMark[], shift: Shift, today = shift.date): RequestTodo[] =>
  requestTodos(requests, marks, shift, today).filter((t) => t.req.elephant !== 'work');

/**
 * Срок задачи для порядка: разовая — день и час (у старых — «до какого числа»), курс — до какого числа.
 * Без срока — в конец. Строки сравниваются как есть: «2026-10-26 16:00» < «2026-10-27 99:99» < «9999».
 */
export function deadlineKey(r: VetRequest): string {
  const day = r.frequency === 'once' ? (r.on_date ?? r.due_date) : r.due_date;
  return day ? `${day} ${r.at_time?.slice(0, 5) ?? '99:99'}` : '9999';
}

const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

/** Порядок задач везде одинаковый: срочное наверху, потом по сроку, потом кто раньше поставлен. */
export const byPriority = (a: VetRequest, b: VetRequest) =>
  Number(b.urgent) - Number(a.urgent) || cmp(deadlineKey(a), deadlineKey(b)) || cmp(a.created_at, b.created_at);

/**
 * Разовая задача на день просрочена: день прошёл, а отметки нет, или сегодня — и время уже наступило.
 * Без даты — не бывает просроченной (у регулярных есть только «до какого дня»).
 */
export function overdue(req: VetRequest, done: boolean, now = new Date()): boolean {
  if (done || req.frequency !== 'once' || !req.on_date) return false;
  const today = isoDate(now);
  if (req.on_date < today) return true;
  if (req.on_date > today || !req.at_time) return false;
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  // «к 16:00» — ровно в 16:00 ещё вовремя
  return hm > req.at_time.slice(0, 5);
}

/** «26.10 · к 16:00», «сегодня к 16:00» — для карточки; пусто, если дня нет. */
export function whenLabel(req: VetRequest, today = isoDate()): string {
  if (!req.on_date) return '';
  const day = req.on_date === today ? 'сегодня' : req.on_date.slice(8, 10) + '.' + req.on_date.slice(5, 7);
  return req.at_time ? `${day} к ${req.at_time.slice(0, 5)}` : day;
}

/**
 * Готовые наборы ответов — одни для слонов и для «Работы» (кроме «Просто выполнено»). Специфичное — «Свои варианты».
 * Без «в работе»: любая отметка — выполнение, и разовая задача после неё закрылась бы.
 * «не получилось» и «не вышло» задачу не закрывают (FAILED_ANSWERS); «частично» — закрывает.
 */
export const ANSWER_PRESETS: { label: string; options: string[] }[] = [
  { label: 'Сделано / не получилось', options: ['сделано', 'не получилось'] },
  { label: 'Сделано / частично / не вышло', options: ['сделано', 'частично', 'не вышло'] },
  { label: 'Дал / частично / не дал', options: ['дал', 'частично', 'не дал'] },
];

export const answerPresets = () => ANSWER_PRESETS;

/** Кому адресовано назначение — для подписи */
export function whoLabel(e: string): string {
  return e === 'all' ? 'Всем слонам' : e === 'work' ? 'Работа' : e;
}

export const FREQ_LABEL: Record<VetRequest['frequency'], string> = {
  once: 'один раз',
  shift: 'раз в сутки',
  twice: 'утро и вечер',
  feeding: 'каждое кормление',
};

/** Сколько отметок нужно за одно дежурство (сутки). */
export function perShift(req: Pick<VetRequest, 'frequency'>): number {
  return req.frequency === 'feeding' ? FEED_TIMES.length : req.frequency === 'twice' ? 2 : 1;
}

/** Сколько смен должно было быть отмечено и сколько отмечено — для прогресса у врача. */
export function requestProgress(req: VetRequest, marks: RequestMark[], shifts: Shift[]) {
  const mine = marks.filter((m) => m.request_id === req.id);
  if (req.frequency === 'once') return { done: Math.min(1, closingMarks(mine, req).length), total: 1, last: lastMark(mine) };
  const created = localDay(req.created_at);
  const relevant = shifts.filter((s) => s.date >= created && (!req.due_date || s.date <= req.due_date));
  const per = perShift(req);
  const doneShifts = relevant.filter((s) => mine.filter((m) => m.shift_id === s.id).length >= per).length;
  return { done: doneShifts, total: Math.max(relevant.length, 1), last: lastMark(mine) };
}

function lastMark(marks: RequestMark[]) {
  return [...marks].sort((a, b) => (a.done_at < b.done_at ? 1 : -1))[0];
}

/** Начало курса: день, на который поставлен, или день, когда поставили. */
export function courseStart(req: VetRequest): string {
  return req.on_date ?? localDay(req.created_at);
}

/** «день 3 из 7» для курса с датой окончания; без даты — только номер дня. */
export function courseDay(req: VetRequest, today: string): { day: number; total: number | null } | null {
  if (req.frequency === 'once') return null;
  const start = courseStart(req);
  const diff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86_400_000);
  const day = diff(start, today) + 1;
  if (day < 1) return null;
  return { day, total: req.due_date ? diff(start, req.due_date) + 1 : null };
}

/** Назначение одной строкой: что, как, доза, сколько раз — для истории правок и выписки. */
export function describeRequest(req: Pick<VetRequest, 'text' | 'route' | 'dose' | 'frequency' | 'due_date'>): string {
  return [req.text, req.route, req.dose, FREQ_LABEL[req.frequency], req.due_date ? `до ${req.due_date}` : ''].filter(Boolean).join(' · ');
}
