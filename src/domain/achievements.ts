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
