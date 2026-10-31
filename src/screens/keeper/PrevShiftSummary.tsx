import { dutyTodos } from '../../domain/shift';
import { ShiftSummaryCard } from './ShiftSummaryCard';
import type { Shift } from '../../domain/types';
import { useRows } from '../../lib/store';
import { isoDate, localDay, relDate, timeOf } from '../../lib/dates';
import { Card, Section } from '../../ui/kit';
import { Icon } from '../../ui/Icon';

/** Что важно от прошлого дежурства: заметка сменщику, сводка «Сдаю», сколько назначений на сегодня. */
export function PrevShiftSummary({ prev }: { prev: Shift }) {
  const requests = useRows('requests');
  const marks = useRows('request_marks');
  const openReqs = dutyTodos(requests, marks, { ...prev, date: isoDate(), id: '__new__' }).filter((t) => !t.done);
  return (
    <Section title="От прошлого дежурства" aside={prev.handed_at ? `${prev.keeper_name} · ${relDate(localDay(prev.handed_at))} ${timeOf(prev.handed_at)}` : `${prev.keeper_name} · дежурит`}>
      <Card className="flex flex-col gap-3 p-4">
        {prev.note ? <p className="m-0 text-[16px] leading-relaxed">{prev.note}</p> : <p className="m-0 text-[15px] text-muted">Без заметок</p>}
        {openReqs.length > 0 && (
          <div className="flex items-center gap-2 text-[14px] font-semibold text-amber">
            <Icon name="message" size={18} />
            Назначений и задач на сегодня: {openReqs.length}
          </div>
        )}
      </Card>
      {/* та же сводка «Сдаю», что видел сдающий */}
      <ShiftSummaryCard shift={prev} />
    </Section>
  );
}
