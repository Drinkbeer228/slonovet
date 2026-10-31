import { ShiftSummaryCard } from './ShiftSummaryCard';
import type { Shift } from '../../domain/types';
import { localDay, relDate, timeOf } from '../../lib/dates';
import { Card, Section } from '../../ui/kit';

/** Что важно от прошлого дежурства: заметка сменщику и сводка «Сдаю». */
export function PrevShiftSummary({ prev }: { prev: Shift }) {
  return (
    <Section title="От прошлого дежурства" aside={prev.handed_at ? `${prev.keeper_name} · ${relDate(localDay(prev.handed_at))} ${timeOf(prev.handed_at)}` : `${prev.keeper_name} · дежурит`}>
      <Card className="flex flex-col gap-3 p-4">
        {prev.note ? <p className="m-0 text-[16px] leading-relaxed">{prev.note}</p> : <p className="m-0 text-[15px] text-muted">Без заметок</p>}
      </Card>
      {/* та же сводка «Сдаю», что видел сдающий */}
      <ShiftSummaryCard shift={prev} />
    </Section>
  );
}
