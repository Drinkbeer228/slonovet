import { ELEPHANTS, LEVEL_LABEL, METRIC_LABEL } from './elephants';
import { shiftFlags, type RequestTodo } from './shift';
import type { DaySlot } from './day';
import type { ElephantName, Note, Shift } from './types';

const ATE: Record<string, string> = { half: 'не доела', none: 'отказ от еды' };

export interface SummaryLine {
  tone: 'ok' | 'warn' | 'bad';
  text: string;
}

/**
 * Сводка «Сдаю» одной карточкой: слонихи (кто в норме, кто нет и почему), назначения, кормления.
 * Собирается сама из смены — кипер дописывает только заметку. Сменщик при приёме видит ту же карточку.
 */
export function shiftSummary(shift: Shift, todos: RequestTodo[], slots: DaySlot[], notes: Note[] = []): SummaryLine[] {
  const out: SummaryLine[] = [];
  const flags = shiftFlags(shift);
  // как поела по кормлениям: «½» или «отказ» — это тоже не норма, даже если в таблице «Еда» ничего не отмечено
  const ate = (el: ElephantName) =>
    Object.entries(shift.feeds ?? {})
      .filter(([, f]) => f?.done && f.eaten?.[el] && f.eaten[el] !== 'all')
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([t, f]) => ({ t, e: f!.eaten![el]! }));
  const fine = ELEPHANTS.filter((e) => !flags.some((f) => f.elephant === e) && !ate(e).length);
  if (fine.length) out.push({ tone: 'ok', text: `${fine.join(', ')} — норма` });
  for (const el of ELEPHANTS) {
    const mine = flags.filter((f) => f.elephant === el);
    const meals = ate(el);
    if (!mine.length && !meals.length) continue;
    const worst = Math.max(0, ...mine.map((f) => f.level), ...meals.map((m) => (m.e === 'none' ? 2 : 1)));
    const what = [
      ...mine.map((f) => `${METRIC_LABEL[f.metric].toLowerCase()}${f.symptoms.length ? ` (${f.symptoms.join(', ')})` : ''}`),
      ...meals.map((m) => `${ATE[m.e]} в ${m.t}`),
    ].join(', ');
    out.push({ tone: worst === 2 ? 'bad' : 'warn', text: `${el as ElephantName} — ${LEVEL_LABEL[worst as 1 | 2]}: ${what}` });
  }
  const elTodos = todos.filter((t) => t.req.elephant !== 'work');
  if (elTodos.length) {
    const left = elTodos.filter((t) => !t.done);
    out.push({
      tone: left.length ? 'warn' : 'ok',
      text: left.length
        ? `Назначения: ${elTodos.length - left.length} из ${elTodos.length}, не сделано — ${left.map((t) => `${t.req.elephant === 'all' ? 'всем' : t.req.elephant}: ${t.req.text}`).join('; ')}`
        : `Назначения: ${elTodos.length} из ${elTodos.length}`,
    });
  }
  const missed = slots.filter((s) => s.status === 'late' || s.status === 'due');
  const fed = slots.filter((s) => s.status === 'done');
  if (missed.length) out.push({ tone: 'warn', text: `Кормления: не отмечено — ${missed.map((s) => s.name.toLowerCase()).join(', ')}` });
  else if (fed.length) out.push({ tone: 'ok', text: 'Кормления: все отмечены' });
  // ЧП за смену и замечания при приёме — чтобы сменщик и врач увидели их в итоге, а не искали
  for (const n of notes.filter((x) => x.shift_id === shift.id && x.kind === 'incident' && !x.deleted)) {
    out.push({ tone: 'bad', text: `ЧП${n.elephant !== 'none' ? ` · ${n.elephant}` : ''}: ${n.text || 'фото'}` });
  }
  if (shift.accept_remarks?.trim()) out.push({ tone: 'warn', text: `При приёме: ${shift.accept_remarks.trim()}` });
  return out;
}
