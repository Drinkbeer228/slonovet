import { useState } from 'react';
import { ELEPHANTS, LEVEL_LABEL, METRICS, METRIC_LABEL } from '../../domain/elephants';
import { setCell, toggleSymptom } from '../../domain/actions';
import { shiftFlags } from '../../domain/shift';
import type { ElephantName, Level, MetricKey, Shift } from '../../domain/types';
import { useRows } from '../../lib/store';
import { Button, Card, Chip, LEVEL_CELL, LEVEL_DOT, Section, Segmented, Sheet, TONE } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import type { NoteDraft } from '../common/NoteSheet';

export function StateMatrix({ shift, onNote, readOnly }: { shift: Shift; onNote?: (d: NoteDraft) => void; readOnly?: boolean }) {
  const notes = useRows('notes');
  const flags = shiftFlags(shift);
  // открытая ячейка: признаки, уровень и запись — в шторке, чтобы таблица 7×3 не разъезжалась
  const [open, setOpen] = useState<{ el: ElephantName; m: MetricKey } | null>(null);

  // норма → сразу «внимание» и шторка с признаками; не норма — шторка (там же «плохо» и вернуть «норму»)
  const tap = (el: ElephantName, m: MetricKey) => {
    const cur = shift.state?.[el]?.[m]?.level ?? 0;
    if (cur === 0) setCell(shift, el, m, 1);
    setOpen({ el, m });
  };

  return (
    <Section title="Состояние" id="sec-state">
      <Card tone="sunken" className="flex flex-col gap-1 p-2">
        <div className="grid grid-cols-[88px_repeat(3,minmax(0,1fr))] gap-1 pb-1.5 pt-1">
          <span />
          {ELEPHANTS.map((e) => (
            <span key={e} className="text-center text-[13px] font-extrabold">
              {e}
            </span>
          ))}
        </div>
        {METRICS.map((m) => (
          <div key={m.key} className="grid grid-cols-[88px_repeat(3,minmax(0,1fr))] items-center gap-1">
            <span className="pl-1.5 text-[14px] font-semibold text-ink2">{m.label}</span>
            {ELEPHANTS.map((el) => {
              const cell = shift.state?.[el]?.[m.key];
              const level = cell?.level ?? 0;
              const label = LEVEL_LABEL[level];
              const n = cell?.symptoms?.length ?? 0;
              return (
                <button
                  key={el}
                  type="button"
                  disabled={readOnly}
                  aria-label={`${el}, ${m.label}: ${label}${n ? `, признаков: ${n}` : ''}`}
                  onClick={() => tap(el, m.key)}
                  className={`relative h-11 rounded-[10px] border text-[13px] transition-transform active:scale-[0.97] ${LEVEL_CELL[level]}`}
                >
                  {label}
                  {/* сколько признаков отмечено — уголком, чтобы не теснить слово */}
                  {n > 0 && <span className="absolute right-1 top-0.5 text-[10px] font-extrabold leading-none">{n}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </Card>

      {/* отклонения — короткой строкой под таблицей: «Претти · общее — внимание: вялая, качается ✎» */}
      {flags.length > 0 && (
        <div className={`flex flex-col divide-y divide-edge overflow-hidden rounded-2xl ${TONE.glass}`}>
          {flags.map((f) => {
            const n = notes.filter((x) => x.shift_id === shift.id && x.elephant === f.elephant && x.metric === f.metric).length;
            return (
              <button
                key={`${f.elephant}-${f.metric}`}
                type="button"
                disabled={readOnly}
                onClick={() => setOpen({ el: f.elephant, m: f.metric })}
                className="flex items-center gap-2.5 px-3 py-2.5 text-left disabled:opacity-100"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${LEVEL_DOT[f.level]}`} />
                <span className="min-w-0 flex-1 text-[14px] leading-snug">
                  <span className="font-bold">
                    {f.elephant} · {METRIC_LABEL[f.metric].toLowerCase()}
                  </span>
                  <span className={`font-bold ${f.level === 2 ? 'text-coral-fg' : 'text-amber-fg'}`}> — {LEVEL_LABEL[f.level]}</span>
                  {f.symptoms.length > 0 && <span className="text-ink2">: {f.symptoms.join(', ')}</span>}
                  {n > 0 && <span className="text-muted"> · записи: {n}</span>}
                </span>
                {!readOnly && <Icon name="edit" size={16} className="shrink-0 text-muted" />}
              </button>
            );
          })}
        </div>
      )}

      {!readOnly && (
        <CellSheet
          shift={shift}
          cell={open}
          onClose={() => setOpen(null)}
          onNote={
            onNote &&
            ((d) => {
              setOpen(null);
              onNote(d);
            })
          }
        />
      )}
    </Section>
  );
}

const LEVELS: { value: string; label: string }[] = [0, 1, 2].map((l) => ({ value: String(l), label: LEVEL_LABEL[l as Level] }));

/** Одна ячейка: уровень, признаки и запись с фото — в шторке поверх таблицы. */
function CellSheet({
  shift,
  cell,
  onClose,
  onNote,
}: {
  shift: Shift;
  cell: { el: ElephantName; m: MetricKey } | null;
  onClose: () => void;
  onNote?: (d: NoteDraft) => void;
}) {
  if (!cell) return null;
  const { el, m } = cell;
  const meta = METRICS.find((x) => x.key === m)!;
  const cur = shift.state?.[el]?.[m];
  const level = cur?.level ?? 0;
  const symptoms = cur?.symptoms ?? [];
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${el} · ${METRIC_LABEL[m].toLowerCase()}`}
      footer={
        <Button kind="primary" big full onClick={onClose}>
          Готово
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          label="Состояние"
          value={String(level)}
          onChange={(v) => {
            setCell(shift, el, m, Number(v) as Level);
            if (v === '0') onClose();
          }}
          options={LEVELS}
        />
        {level > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              {meta.symptoms.map((sym) => {
                const on = symptoms.includes(sym);
                return (
                  <Chip key={sym} on={on} onClick={() => toggleSymptom(shift, el, m, sym)}>
                    {sym}
                  </Chip>
                );
              })}
            </div>
            {onNote && (
              <Button icon="camera" full onClick={() => onNote({ elephant: el, metric: m, kind: 'observation' })}>
                Фото или словами
              </Button>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
