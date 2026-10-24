import { ELEPHANTS } from './elephants';
import type { Note, RequestMark, Shift } from './types';

/**
 * Рейтинг и ачивки киперов. Всё считается из смен, которые и так заполняются.
 * Сравниваем «на одно дежурство», чтобы новичок и ветеран были в равных условиях.
 */

export interface KeeperStats {
  id: string;
  name: string;
  since: string; // дата первой смены
  shifts: number;
  urineOk: number;
  urineMiss: number;
  feces: number;
  bagsOut: number;
  notes: number;
  marks: number;
  /** сдал смену, а принявший не написал замечаний */
  cleanHandovers: number;
  handedChecked: number;
  /** самая длинная серия чистых сдач подряд */
  bestCleanStreak: number;
}

/** Меньше смен — в рейтинг не попадает, чтобы две удачные смены не обгоняли годы работы. */
export const MIN_SHIFTS = 5;

export function keeperStats(shifts: Shift[], notes: Note[], marks: RequestMark[]): KeeperStats[] {
  const byId = new Map<string, Shift[]>();
  for (const s of shifts) {
    if (!s.keeper_id) continue;
    byId.set(s.keeper_id, [...(byId.get(s.keeper_id) ?? []), s]);
  }
  const acceptedFrom = new Map(shifts.filter((s) => s.accepted_from).map((s) => [s.accepted_from!, s]));

  return [...byId.entries()].map(([id, list]) => {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const name = sorted[sorted.length - 1].keeper_name;
    let urineOk = 0;
    let urineMiss = 0;
    let feces = 0;
    let bagsOut = 0;
    let cleanHandovers = 0;
    let handedChecked = 0;
    let streak = 0;
    let bestCleanStreak = 0;
    for (const s of sorted) {
      for (const el of ELEPHANTS) {
        urineOk += s.quests?.urine?.[el]?.ok ?? 0;
        urineMiss += s.quests?.urine?.[el]?.miss ?? 0;
        feces += Number(s.quests?.feces?.[el] ?? 0);
      }
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
      id,
      name,
      since: sorted[0].date,
      shifts: sorted.length,
      urineOk,
      urineMiss,
      feces,
      bagsOut,
      notes: notes.filter((n) => n.author_name === name).length,
      marks: marks.filter((m) => m.done_by === name).length,
      cleanHandovers,
      handedChecked,
      bestCleanStreak,
    };
  });
}

export interface Board {
  key: string;
  label: string;
  hint: string;
  value: (k: KeeperStats) => number;
  format: (v: number) => string;
}

const per = (n: number, k: KeeperStats) => (k.shifts ? n / k.shifts : 0);
const one = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
const pct = (v: number) => `${Math.round(v * 100)}%`;

export const BOARDS: Board[] = [
  { key: 'urine', label: 'В бак', hint: 'мочи поймано в бак за дежурство', value: (k) => per(k.urineOk, k), format: one },
  {
    key: 'aim',
    label: 'Точность',
    hint: 'доля «в бак» среди всех походов',
    value: (k) => (k.urineOk + k.urineMiss ? k.urineOk / (k.urineOk + k.urineMiss) : 0),
    format: pct,
  },
  { key: 'feces', label: 'Кал', hint: 'отмечено за дежурство', value: (k) => per(k.feces, k), format: one },
  {
    key: 'clean',
    label: 'Сдачи',
    hint: 'дежурство у него приняли без замечаний',
    value: (k) => (k.handedChecked ? k.cleanHandovers / k.handedChecked : 0),
    format: pct,
  },
];

export interface Badge {
  key: string;
  icon: string;
  title: string;
  text: string;
  /** сколько сейчас и сколько нужно */
  progress: (k: KeeperStats) => [number, number];
}

export const BADGES: Badge[] = [
  { key: 'first', icon: '🐘', title: 'Первое дежурство', text: 'Отдежурил первый раз', progress: (k) => [k.shifts, 1] },
  { key: 'ten', icon: '🌙', title: 'Десять ночей', text: '10 дежурств', progress: (k) => [k.shifts, 10] },
  { key: 'hundred', icon: '🏅', title: 'Сотня', text: '100 дежурств', progress: (k) => [k.shifts, 100] },
  { key: 'catcher', icon: '🪣', title: 'Ловец', text: '100 раз поймал мочу в бак', progress: (k) => [k.urineOk, 100] },
  { key: 'catcher2', icon: '🛢️', title: 'Повелитель бака', text: '1000 раз в бак', progress: (k) => [k.urineOk, 1000] },
  {
    key: 'sniper',
    icon: '🎯',
    title: 'Снайпер',
    text: 'Точность 90% и больше на 30+ походах',
    progress: (k) => {
      const all = k.urineOk + k.urineMiss;
      return all < 30 ? [all, 30] : [Math.round((k.urineOk / all) * 100), 90];
    },
  },
  { key: 'clean', icon: '🧹', title: 'Чистая сдача', text: '10 дежурств подряд приняли без замечаний', progress: (k) => [k.bestCleanStreak, 10] },
  { key: 'eye', icon: '👁️', title: 'Глазастый', text: '20 записей и наблюдений', progress: (k) => [k.notes, 20] },
  { key: 'vet', icon: '🩺', title: 'Правая рука врача', text: '50 выполненных заявок врача', progress: (k) => [k.marks, 50] },
  { key: 'bags', icon: '🚛', title: 'Мусоровоз', text: '100 мешков вывез на мусорку', progress: (k) => [k.bagsOut, 100] },
];
