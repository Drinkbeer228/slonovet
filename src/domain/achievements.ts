import { ELEPHANTS } from './elephants';
import type { Note, RequestMark, Shift } from './types';

/**
 * Личные значки киперов. Всё считается из смен, которые и так заполняются.
 * Сравниваем «на одно дежурство», чтобы новичок и ветеран были в равных условиях.
 */

export interface KeeperStats {
  id: string;
  name: string;
  since: string; // дата первой смены
  shifts: number;
  /** часы на дежурстве: от приёма до сдачи, только сданные смены */
  hours: number;
  urineOk: number;
  urineMiss: number;
  feces: number;
  /** мешков для мусора взяли со склада и вывезли */
  bagsTaken: number;
  bagsOut: number;
  notes: number;
  /** закрытые задачи — отметки «выполнено» */
  marks: number;
  /** сдал смену, а принявший не написал замечаний */
  cleanHandovers: number;
  handedChecked: number;
  /** самая длинная серия чистых сдач подряд */
  bestCleanStreak: number;
}

/**
 * Статистика одного сотрудника — всё из того, что и так заполняется за смену.
 * Смены — по keeper_id; записи и отметки — по id автора, а старые (до id) — по имени.
 * Экран «Мои достижения» пока скрыт; функция копит цифры, чтобы включить его, когда база наберётся.
 */
export function staffStats(who: { id: string; name: string }, rows: { shifts: Shift[]; notes: Note[]; marks: RequestMark[] }): KeeperStats {
  const mine = (id: string | null | undefined, name: string) => (id ? id === who.id : name === who.name);
  const sorted = rows.shifts.filter((s) => s.keeper_id === who.id && !s.deleted).sort((a, b) => a.date.localeCompare(b.date));
  const acceptedFrom = new Map(rows.shifts.filter((s) => s.accepted_from).map((s) => [s.accepted_from!, s]));
  let hours = 0;
  let urineOk = 0;
  let urineMiss = 0;
  let feces = 0;
  let bagsTaken = 0;
  let bagsOut = 0;
  let cleanHandovers = 0;
  let handedChecked = 0;
  let streak = 0;
  let bestCleanStreak = 0;
  for (const s of sorted) {
    if (s.status === 'handed' && s.accepted_at && s.handed_at) hours += Math.max(0, Date.parse(s.handed_at) - Date.parse(s.accepted_at)) / 3_600_000;
    for (const el of ELEPHANTS) {
      urineOk += s.quests?.urine?.[el]?.ok ?? 0;
      urineMiss += s.quests?.urine?.[el]?.miss ?? 0;
      feces += Number(s.quests?.feces?.[el] ?? 0);
    }
    bagsTaken += s.quests?.cleaning?.bags ?? 0;
    bagsOut += s.quests?.cleaning?.out ?? 0;
    const next = acceptedFrom.get(s.id);
    if (next) {
      handedChecked++;
      if (next.accept_remarks) streak = 0;
      else {
        cleanHandovers++;
        streak++;
        bestCleanStreak = Math.max(bestCleanStreak, streak);
      }
    }
  }
  return {
    id: who.id,
    name: who.name,
    since: sorted[0]?.date ?? '',
    shifts: sorted.length,
    hours: Math.round(hours * 10) / 10,
    urineOk,
    urineMiss,
    feces,
    bagsTaken,
    bagsOut,
    notes: rows.notes.filter((n) => !n.deleted && mine(n.author_id, n.author_name)).length,
    marks: rows.marks.filter((m) => !m.deleted && mine(m.done_by_id, m.done_by)).length,
    cleanHandovers,
    handedChecked,
    bestCleanStreak,
  };
}

/** Все, кто дежурил: имя — по последней смене. */
export function keeperStats(shifts: Shift[], notes: Note[], marks: RequestMark[]): KeeperStats[] {
  const last = new Map<string, Shift>();
  for (const s of shifts) if (s.keeper_id && (!last.has(s.keeper_id) || last.get(s.keeper_id)!.date <= s.date)) last.set(s.keeper_id, s);
  return [...last.entries()].map(([id, s]) => staffStats({ id, name: s.keeper_name }, { shifts, notes, marks }));
}

export interface Badge {
  key: string;
  icon: string;
  title: string;
  text: string;
  /** сколько сейчас и сколько нужно */
  progress: (k: KeeperStats) => [number, number];
}

/** Личные значки — только за качество работы, без сравнения с другими и без значков «за количество» (их хочется накрутить). */
export const BADGES: Badge[] = [
  { key: 'first', icon: '🐘', title: 'Первое дежурство', text: 'Отдежурил первый раз', progress: (k) => [k.shifts, 1] },
  { key: 'ten', icon: '🌙', title: 'Десять ночей', text: '10 дежурств', progress: (k) => [k.shifts, 10] },
  { key: 'hundred', icon: '🏅', title: 'Сотня', text: '100 дежурств', progress: (k) => [k.shifts, 100] },
  { key: 'clean', icon: '🧹', title: 'Чистая сдача', text: '10 дежурств подряд приняли без замечаний', progress: (k) => [k.bestCleanStreak, 10] },
  { key: 'eye', icon: '👁️', title: 'Глазастый', text: '20 записей и наблюдений', progress: (k) => [k.notes, 20] },
  { key: 'vet', icon: '🩺', title: 'Правая рука врача', text: '50 выполненных заявок врача', progress: (k) => [k.marks, 50] },
];
