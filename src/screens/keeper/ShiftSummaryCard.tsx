import { daySlots } from '../../domain/day';
import { dutyTodos } from '../../domain/shift';
import { shiftSummary, type SummaryLine } from '../../domain/summary';
import type { Shift } from '../../domain/types';
import { useRows } from '../../lib/store';
import { Card } from '../../ui/kit';

const DOT: Record<SummaryLine['tone'], string> = { ok: 'bg-teal', warn: 'bg-amber', bad: 'bg-coral' };

/** «Сдаю» одной карточкой — собрана сама из смены; одна и та же у сдающего и у принимающего. */
export function ShiftSummaryCard({ shift, today }: { shift: Shift; today?: string }) {
  const requests = useRows('requests');
  const marks = useRows('request_marks');
  // только то, что уже было поставлено, пока шла смена: назначение после сдачи — не её «не сделано»
  const until = shift.handed_at ?? new Date().toISOString();
  const todos = dutyTodos(requests, marks, shift, today ?? shift.date).filter((t) => t.req.created_at <= until);
  const lines = shiftSummary(shift, todos, daySlots(shift));
  return (
    <Card className="flex flex-col gap-2 p-4">
      {lines.map((l) => (
        <span key={l.text} className="flex items-start gap-2.5 text-[15px] font-semibold leading-snug">
          <span aria-hidden="true" className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${DOT[l.tone]}`} />
          {l.text}
        </span>
      ))}
    </Card>
  );
}
