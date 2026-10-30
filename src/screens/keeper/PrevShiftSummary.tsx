import { LEVEL_LABEL, METRIC_LABEL } from '../../domain/elephants';
import { dutyTodos, shiftFlags } from '../../domain/shift';
import type { Shift } from '../../domain/types';
import { useRows } from '../../lib/store';
import { isoDate, localDay, relDate, timeOf } from '../../lib/dates';
import { CHIP, Card, Section } from '../../ui/kit';
import { Icon } from '../../ui/Icon';

/** Что важно от прошлого дежурства: заметка сменщику, слонихи не в норме, сколько назначений на сегодня. */
export function PrevShiftSummary({ prev }: { prev: Shift }) {
  const requests = useRows('requests');
  const marks = useRows('request_marks');
  const flags = shiftFlags(prev);
  const openReqs = dutyTodos(requests, marks, { ...prev, date: isoDate(), id: '__new__' }).filter((t) => !t.done);
  return (
    <Section title="От прошлого дежурства" aside={`${prev.keeper_name} · ${relDate(prev.handed_at ? localDay(prev.handed_at) : prev.date)} ${timeOf(prev.handed_at)}`}>
      <Card className="flex flex-col gap-3 p-4">
        {prev.note ? <p className="m-0 text-[16px] leading-relaxed">{prev.note}</p> : <p className="m-0 text-[15px] text-muted">Без заметок</p>}
        {flags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {flags.map((f) => (
              <span
                key={`${f.elephant}-${f.metric}`}
                className={`${CHIP} !text-[13px] ${f.level === 2 ? '!border-coral/40 !bg-[color-mix(in_srgb,var(--color-coral)_var(--tint),transparent)] !text-coral-fg' : '!border-amber/40 !bg-[color-mix(in_srgb,var(--color-amber)_var(--tint),transparent)] !text-amber-fg'}`}
              >
                {f.elephant} · {METRIC_LABEL[f.metric].toLowerCase()} — {LEVEL_LABEL[f.level]}
                {f.symptoms.length > 0 && <span className="font-semibold">: {f.symptoms.join(', ')}</span>}
              </span>
            ))}
          </div>
        )}
        {openReqs.length > 0 && (
          <div className="flex items-center gap-2 text-[14px] font-semibold text-amber">
            <Icon name="message" size={18} />
            Назначений и задач на сегодня: {openReqs.length}
          </div>
        )}
      </Card>
    </Section>
  );
}
