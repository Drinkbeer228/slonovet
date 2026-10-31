import { ELEPHANTS, LEVEL_LABEL, METRIC_LABEL } from './elephants';
import { shiftFlags, type RequestTodo } from './shift';
import type { DaySlot } from './day';
import type { ElephantName, Shift } from './types';

export interface SummaryLine {
  tone: 'ok' | 'warn' | 'bad';
  text: string;
}

/**
 * Сводка «Сдаю» одной карточкой: слонихи (кто в норме, кто нет и почему), назначения, кормления.
 * Собирается сама из смены — кипер дописывает только заметку. Сменщик при приёме видит ту же карточку.
 */
export function shiftSummary(shift: Shift, todos: RequestTodo[], slots: DaySlot[]): SummaryLine[] {
  const out: SummaryLine[] = [];
  const flags = shiftFlags(shift);
  const fine = ELEPHANTS.filter((e) => !flags.some((f) => f.elephant === e));
  if (fine.length) out.push({ tone: 'ok', text: `${fine.join(', ')} — норма` });
  for (const el of ELEPHANTS) {
    const mine = flags.filter((f) => f.elephant === el);
    if (!mine.length) continue;
    const worst = Math.max(...mine.map((f) => f.level));
    const what = mine.map((f) => `${METRIC_LABEL[f.metric].toLowerCase()}${f.symptoms.length ? ` (${f.symptoms.join(', ')})` : ''}`).join(', ');
    out.push({ tone: worst === 2 ? 'bad' : 'warn', text: `${el as ElephantName} — ${LEVEL_LABEL[worst as 1 | 2]}: ${what}` });
  }
  const elTodos = todos.filter((t) => t.req.elephant !== 'work');
  if (elTodos.length) {
    const left = elTodos.filter((t) => !t.done);
    out.push({
      tone: left.length ? 'warn' : 'ok',
      text: left.length
        ? `Назначения: ${elTodos.length - left.length} из ${elTodos.length}, не сделано — ${left.map((t) => `${t.req.elephant === 'all' ? 'всем' : t.req.elephant}: ${t.req.text}`).join('; ')}`
        : `Назначения: все ${elTodos.length}`,
    });
  }
  const missed = slots.filter((s) => s.status === 'late' || s.status === 'due');
  const fed = slots.filter((s) => s.status === 'done');
  if (missed.length) out.push({ tone: 'warn', text: `Кормления: не отмечено — ${missed.map((s) => s.name.toLowerCase()).join(', ')}` });
  else if (fed.length) out.push({ tone: 'ok', text: 'Кормления: все отмечены' });
  return out;
}
