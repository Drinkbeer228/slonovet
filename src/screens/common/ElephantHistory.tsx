import type { ReactNode } from 'react';
import { METRICS } from '../../domain/elephants';
import { elephantHistory } from '../../domain/monitoring';
import type { ElephantName } from '../../domain/types';
import { useRows } from '../../lib/store';
import { parseIso } from '../../lib/dates';
import { Sheet } from '../../ui/kit';

const DAYS = 14;
const SHORT: Record<string, string> = { behavior: 'Общ.', sleep: 'Сон', food: 'Еда', water: 'Вода', urine: 'Моча', feces: 'Кал', legs: 'Ноги' };
/** точка уровня: норма — бирюза, внимание — янтарь, плохо — коралл, не отмечено — пусто */
const DOT = ['bg-teal', 'bg-dot1', 'bg-dot2'];
const EATEN = { all: { t: '✓', cls: 'text-teal-fg' }, half: { t: '½', cls: 'text-amber-fg' }, none: { t: '×', cls: 'text-coral-fg' } } as const;

/**
 * Слон за две недели: по дням (старые слева) — семь показателей точками, аппетит за кормления, кал и моча числом.
 * Видно, тянется ли «пьёт мало» и растёт или падает кал — без листания журнала по дню.
 */
export function ElephantHistorySheet({ el, onClose }: { el: ElephantName | null; onClose: () => void }) {
  const shifts = useRows('shifts');
  if (!el) return null;
  const days = elephantHistory(shifts, el, DAYS);
  const cols = { gridTemplateColumns: `44px repeat(${DAYS}, minmax(0, 1fr))` };
  const num = (v: number | null) => (v == null ? '' : String(v));
  return (
    <Sheet open onClose={onClose} title={`${el} · 14 дней`}>
      <div className="flex flex-col gap-3">
        <div className="grid items-center gap-y-1.5 text-center" style={cols}>
          <span />
          {days.map((d) => {
            const dt = parseIso(d.date);
            return (
              <span key={d.date} className={`text-[10px] font-bold ${dt.getDay() === 1 ? 'text-ink2' : 'text-faint'}`}>
                {dt.getDate()}
              </span>
            );
          })}
          {METRICS.map((m) => (
            <Row key={m.key} label={SHORT[m.key]}>
              {days.map((d) => {
                const l = d.levels[m.key];
                return (
                  <span key={d.date} className="flex justify-center">
                    <span className={`h-2.5 w-2.5 rounded-full ${l == null ? 'bg-well shadow-(--shadow-well)' : DOT[l]}`} />
                  </span>
                );
              })}
            </Row>
          ))}
          <Row label="Ела">
            {days.map((d) => (
              <span key={d.date} className={`text-[12px] font-extrabold ${d.eaten ? EATEN[d.eaten].cls : ''}`}>
                {d.eaten ? EATEN[d.eaten].t : ''}
              </span>
            ))}
          </Row>
          <Row label="Кал">
            {days.map((d) => (
              <span key={d.date} className="text-[11px] font-bold text-ink2">
                {num(d.feces)}
              </span>
            ))}
          </Row>
          <Row label="Моча">
            {days.map((d) => (
              <span key={d.date} className="text-[11px] font-bold text-ink2">
                {num(d.urine)}
              </span>
            ))}
          </Row>
        </div>
        <p className="m-0 px-1 text-[12px] font-semibold text-muted">
          Точки: бирюза — норма, янтарь — внимание, красный — плохо, пусто — не дежурили или не отмечали. «Ела»: ✓ всё, ½ половину, × отказ — худшее за день. Кал — раз, моча — баков за день.
        </p>
      </div>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="border-t border-edge pt-1.5 text-left text-[12px] font-bold text-ink2">{label}</span>
      {Array.isArray(children)
        ? children.map((c, i) => (
            <span key={i} className="border-t border-edge pt-1.5">
              {c}
            </span>
          ))
        : children}
    </>
  );
}
