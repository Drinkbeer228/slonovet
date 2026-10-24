import { Fragment } from 'react';
import { ELEPHANTS, LEVEL_LABEL, METRICS, METRIC_LABEL } from '../../domain/elephants';
import { setCell, toggleSymptom } from '../../domain/actions';
import { shiftFlags } from '../../domain/shift';
import type { Level, MetricKey, Shift } from '../../domain/types';
import { useRows } from '../../lib/store';
import { Card, LEVEL_CELL, LEVEL_DOT, Section } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import type { NoteDraft } from '../common/NoteSheet';

export function StateMatrix({ shift, onNote, readOnly }: { shift: Shift; onNote?: (d: NoteDraft) => void; readOnly?: boolean }) {
  const notes = useRows('notes');
  const flags = shiftFlags(shift);

  // по умолчанию всё норма; нажатие: норма → внимание → плохо → норма
  const cycle = (el: (typeof ELEPHANTS)[number], m: MetricKey) => {
    const cur = shift.state?.[el]?.[m]?.level ?? 0;
    setCell(shift, el, m, ((cur + 1) % 3) as Level);
  };

  return (
    <Section title="Состояние" id="sec-state">
      <Card className="flex flex-col gap-1 p-2">
        <div className="grid grid-cols-[88px_repeat(3,minmax(0,1fr))] gap-1 pb-1.5 pt-1">
          <span />
          {ELEPHANTS.map((e) => (
            <span key={e} className="text-center text-[13px] font-extrabold">
              {e}
            </span>
          ))}
        </div>
        {METRICS.map((m) => (
          <Fragment key={m.key}>
          <div className="grid grid-cols-[88px_repeat(3,minmax(0,1fr))] items-center gap-1">
            <span className="pl-1.5 text-[14px] font-semibold text-ink2">{m.label}</span>
            {ELEPHANTS.map((el) => {
              const level = shift.state?.[el]?.[m.key]?.level ?? 0;
              const label = LEVEL_LABEL[level];
              const cls = LEVEL_CELL[level];
              return (
                <button
                  key={el}
                  type="button"
                  disabled={readOnly}
                  aria-label={`${el}, ${m.label}: ${label}`}
                  onClick={() => cycle(el, m.key)}
                  className={`h-11 rounded-[10px] border text-[13px] ${cls}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {!readOnly && renderFlags(m.key)}
          </Fragment>
        ))}
      </Card>

      {readOnly && renderFlags()}
    </Section>
  );

  /** Отклонения: у врача и в журнале — внизу списком, у кипера — сразу под строкой, чтобы не искать. */
  function renderFlags(metric?: MetricKey) {
    const list = metric ? flags.filter((f) => f.metric === metric) : flags;
    if (!list.length) return null;
    return (
      <div className={metric ? 'divide-y divide-line overflow-hidden rounded-xl bg-surface2' : 'divide-y divide-surface2 overflow-hidden rounded-2xl bg-surface'}>
          {list.map((f) => {
            const meta = METRICS.find((m) => m.key === f.metric)!;
            const n = notes.filter((x) => x.shift_id === shift.id && x.elephant === f.elephant && x.metric === f.metric);
            return (
              <div key={`${f.elephant}-${f.metric}`} className="flex flex-col gap-2.5 p-3">
                <div className="flex items-center gap-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT[f.level]}`} />
                  <span className="flex-1 text-[15px] font-bold">
                    {f.elephant} · {METRIC_LABEL[f.metric].toLowerCase()}
                    <span className={`ml-1.5 ${f.level === 2 ? 'text-coral' : 'text-amber'}`}>— {LEVEL_LABEL[f.level]}</span>
                  </span>
                  {!readOnly && onNote && (
                    <button
                      type="button"
                      onClick={() => onNote({ elephant: f.elephant, metric: f.metric, kind: 'observation' })}
                      className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border border-line px-3 text-[13px] font-bold"
                    >
                      <Icon name="camera" size={16} />
                      {n.length ? `записи: ${n.length}` : 'фото / словами'}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(readOnly ? f.symptoms : meta.symptoms).map((sym) => {
                    const on = f.symptoms.includes(sym);
                    return (
                      <button
                        key={sym}
                        type="button"
                        disabled={readOnly}
                        aria-pressed={on}
                        onClick={() => toggleSymptom(shift, f.elephant, f.metric, sym)}
                        className={`h-11 rounded-[10px] border px-3 text-[14px] font-bold ${
                          on ? 'border-ink bg-ink text-bg' : 'border-line bg-surface2 text-ink2'
                        }`}
                      >
                        {sym}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>
    );
  }
}
