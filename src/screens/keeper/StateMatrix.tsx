import { ElephantFace } from '../../ui/ElephantFace';
import { useState } from 'react';
import { ELEPHANTS, LEVEL_LABEL, METRICS, METRIC_LABEL } from '../../domain/elephants';
import { repeatCell, setCell, toggleSymptom } from '../../domain/actions';
import { carryFlags } from '../../domain/monitoring';
import { shiftFlags, type Flag } from '../../domain/shift';
import type { ElephantName, Level, MetricKey, Shift } from '../../domain/types';
import { useRows } from '../../lib/store';
import { Button, Card, Chip, LEVEL_CELL, LEVEL_DOT, Section, Segmented, Sheet } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import type { NoteDraft } from '../common/NoteSheet';
import { ElephantHistorySheet } from '../common/ElephantHistory';
import { CallVet } from '../common/Alerts';

export function StateMatrix({ shift, onNote, readOnly }: { shift: Shift; onNote?: (d: NoteDraft) => void; readOnly?: boolean }) {
  const notes = useRows('notes');
  const bad = shiftFlags(shift).filter((f) => f.level === 2);
  // не в норме в прошлую смену и ещё не проверено — не «норма» по умолчанию, а «проверь»
  const shifts = useRows('shifts');
  const carry = readOnly ? [] : carryFlags(shifts, shift);
  const carried = (el: ElephantName, m: MetricKey) => carry.find((f) => f.elephant === el && f.metric === m);
  const [history, setHistory] = useState<ElephantName | null>(null);
  // открытая ячейка: признаки, уровень и запись — в шторке, чтобы таблица 7×3 не разъезжалась
  const [open, setOpen] = useState<{ el: ElephantName; m: MetricKey } | null>(null);

  // по умолчанию всё — норма (как в бумажном журнале): тап по норме → сразу «внимание» и шторка с признаками
  // «проверь» — только шторка: кипер сам отвечает «всё так же» или «сегодня норма»
  const tap = (el: ElephantName, m: MetricKey) => {
    const cur = shift.state?.[el]?.[m]?.level ?? 0;
    if (cur === 0 && !carried(el, m)) setCell(shift, el, m, 1);
    setOpen({ el, m });
  };
  const COLS = 'grid grid-cols-[76px_repeat(3,minmax(0,1fr))] gap-x-2';

  return (
    <Section title="Состояние" id="sec-state">
      <Card tone="sunken" className="relative p-2">
        {/* колонки слоних — отдельными полосами, чтобы с первого взгляда было видно: три слонихи, одни и те же показатели */}
        <div aria-hidden="true" className={`pointer-events-none absolute inset-2 ${COLS}`}>
          <span />
          {ELEPHANTS.map((e) => (
            <span key={e} className="rounded-xl border border-edge bg-surface2/60" />
          ))}
        </div>
        <div className="relative flex flex-col gap-1">
          <div className={`${COLS} pb-1 pt-1.5`}>
            <span />
            {ELEPHANTS.map((e) => (
              <button key={e} type="button" onClick={() => setHistory(e)} aria-label={`${e}: 14 дней`} className="flex min-h-11 flex-col items-center gap-1 text-center text-[14px] font-extrabold">
                <ElephantFace name={e} size={34} />
                {e}
              </button>
            ))}
          </div>
          {METRICS.map((m) => (
            <div key={m.key} className={`${COLS} items-center`}>
              <span className="pl-1.5 text-[14px] font-semibold text-ink2">{m.label}</span>
              {ELEPHANTS.map((el) => {
                const cell = shift.state?.[el]?.[m.key];
                const level = cell?.level ?? 0;
                const check = !cell && carried(el, m.key);
                const label = check ? 'проверь' : LEVEL_LABEL[level];
                const n = cell?.symptoms?.length ?? 0;
                return (
                  <div key={el} className="px-1">
                    <button
                      type="button"
                      disabled={readOnly}
                      aria-label={`${el}, ${m.label}: ${label}${n ? `, признаков: ${n}` : ''}`}
                      onClick={() => tap(el, m.key)}
                      className={`relative h-11 w-full rounded-[10px] border text-[13px] transition-transform active:scale-[0.97] ${check ? 'border-2 border-dashed border-amber bg-[color-mix(in_srgb,var(--color-amber)_var(--tint),transparent)] font-extrabold text-amber-fg' : LEVEL_CELL[level]}`}
                    >
                      {label}
                      {/* сколько признаков отмечено — уголком, чтобы не теснить слово */}
                      {n > 0 && <span className="absolute right-1 top-0.5 text-[10px] font-extrabold leading-none">{n}</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
          <span className="h-1" />
        </div>
      </Card>

      {/* под таблицей — только «плохо» и звонок врачу; «внимание» живёт в жёлтой клетке и уходит в сводку «Сдаю» */}
      {bad.length > 0 && (
        <div className="flex flex-col divide-y divide-edge overflow-hidden rounded-2xl border border-coral/50 bg-[color-mix(in_srgb,var(--color-coral)_var(--tint),transparent)]">
          {bad.map((f) => {
            const n = notes.filter((x) => x.shift_id === shift.id && x.elephant === f.elephant && x.metric === f.metric).length;
            return (
              <button
                key={`${f.elephant}-${f.metric}`}
                type="button"
                disabled={readOnly}
                onClick={() => setOpen({ el: f.elephant, m: f.metric })}
                className="flex min-h-11 items-center gap-2.5 px-3 py-2.5 text-left disabled:opacity-100"
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
          {!readOnly && (
            <div className="px-3 py-2.5">
              <CallVet />
            </div>
          )}
        </div>
      )}

      {carry.length > 0 && (
        <p className="m-0 px-1 text-[13px] font-semibold text-amber-fg">
          «Проверь» — было не в норме в прошлую смену: {carry.map((f) => `${f.elephant} · ${METRIC_LABEL[f.metric].toLowerCase()}`).join(', ')}. Посмотри и ответь.
        </p>
      )}

      <ElephantHistorySheet el={history} onClose={() => setHistory(null)} />
      {!readOnly && (
        <CellSheet
          shift={shift}
          carry={open ? carried(open.el, open.m) : undefined}
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
  carry,
  cell,
  onClose,
  onNote,
}: {
  shift: Shift;
  /** было не в норме в прошлую смену — сначала спросить, как сейчас */
  carry?: Flag;
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
        {carry && !cur && (
          <Card tone="sunken" className="flex flex-col gap-3 p-3.5">
            <span className="text-[15px] font-bold">
              В прошлую смену: <span className={carry.level === 2 ? 'text-coral-fg' : 'text-amber-fg'}>{LEVEL_LABEL[carry.level]}</span>
              {carry.symptoms.length > 0 && <span className="text-ink2"> — {carry.symptoms.join(', ')}</span>}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={async () => {
                  await repeatCell(shift, el, m, carry.level, carry.symptoms);
                }}
              >
                Всё так же
              </Button>
              <Button
                kind="primary"
                onClick={async () => {
                  await setCell(shift, el, m, 0);
                  onClose();
                }}
              >
                Сегодня норма
              </Button>
            </div>
          </Card>
        )}
        {!(carry && !cur) && (
        <Segmented
          label="Состояние"
          value={String(level)}
          onChange={(v) => {
            setCell(shift, el, m, Number(v) as Level);
            if (v === '0') onClose();
          }}
          options={LEVELS}
          tones={{ '1': 'amber', '2': 'coral' }}
        />
        )}
        {level > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              {meta.symptoms.map((sym) => {
                const on = symptoms.includes(sym);
                return (
                  <Chip key={sym} on={on} tone={level === 2 ? 'coral' : 'amber'} onClick={() => toggleSymptom(shift, el, m, sym)}>
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
            {/* «плохо» — тревога: звонить врачу прямо отсюда, не искать в журнале */}
            {level === 2 && <CallVet />}
          </>
        )}
      </div>
    </Sheet>
  );
}
