import { Fragment, useState, type ReactNode } from 'react';
import { BRANCH_AMOUNT, BRANCH_KINDS, ELEPHANTS } from '../../domain/elephants';
import { setBags, updateShift } from '../../domain/actions';
import type { CurrentUser, ElephantName, Quests, Shift } from '../../domain/types';
import { Card, Check, Chip, DecimalInput, Section, Segmented, Stepper, inputCls } from '../../ui/kit';
import { Icon, type IconName } from '../../ui/Icon';
import { WhyLink } from '../common/Why';
import { nowTime } from '../../lib/dates';
import { logEvent } from '../../lib/log';

function Quest({
  icon,
  title,
  progress,
  complete,
  children,
}: {
  icon: IconName;
  title: string;
  progress: string;
  complete: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${complete ? 'bg-teal/15 text-teal' : 'bg-surface2 text-ink2'}`}>
          <Icon name={complete ? 'check' : icon} size={18} stroke={complete ? 2.6 : 2} />
        </span>
        <span className="flex-1 text-[15px] font-bold">{title}</span>
        <span className={`text-[13px] font-bold ${complete ? 'text-teal' : 'text-muted'}`}>{progress}</span>
        <Icon name="down" size={18} className={`text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-surface2 px-4 py-3">{children}</div>}
    </Card>
  );
}

function Counter({ value, onPlus, onMinus, label, tone }: { value: number; onPlus: () => void; onMinus: () => void; label: string; tone: 'teal' | 'amber' }) {
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" aria-label={`${label}: убрать`} onClick={onMinus} disabled={value === 0} className="h-11 w-11 rounded-xl border border-line bg-surface2 text-[20px] font-bold text-ink2 disabled:opacity-30">
        −
      </button>
      <button
        type="button"
        aria-label={`${label}: добавить`}
        onClick={onPlus}
        className={`inline-flex h-11 min-w-[64px] items-center justify-center gap-1 rounded-xl border px-2 text-[15px] font-extrabold ${
          tone === 'teal' ? 'border-teal/50 bg-teal/10 text-teal' : 'border-amber/50 bg-amber/10 text-amber'
        }`}
      >
        {value}
        <Icon name="plus" size={14} stroke={2.6} />
      </button>
    </div>
  );
}

export function QuestsBlock({ shift, user }: { shift: Shift; user: CurrentUser }) {
  const q = shift.quests ?? {};
  const urineTotal = ELEPHANTS.reduce((s, e) => s + (q.urine?.[e]?.ok ?? 0), 0);
  const missTotal = ELEPHANTS.reduce((s, e) => s + (q.urine?.[e]?.miss ?? 0), 0);
  const feces = (el: ElephantName) => Number(q.feces?.[el] ?? 0);
  const fecesTotal = ELEPHANTS.reduce((sum, e) => sum + feces(e), 0);
  const poop = (el: ElephantName, d: number) =>
    updateShift(shift, (s) => {
      s.quests.feces = { ...(s.quests.feces ?? {}), [el]: Math.max(0, Number(s.quests.feces?.[el] ?? 0) + d) };
    });
  const branches = q.branches?.amount ?? 0;

  const urine = (el: ElephantName, key: 'ok' | 'miss', d: number) =>
    updateShift(shift, (s) => {
      s.quests.urine = s.quests.urine ?? {};
      const cur = s.quests.urine[el] ?? { ok: 0, miss: 0 };
      cur[key] = Math.max(0, cur[key] + d);
      s.quests.urine[el] = cur;
    });

  return (
    <Section id="sec-quests" title="За дежурство">
      <Quest
        icon="drop"
        title="Туалет"
        progress={`баков ${urineTotal}${missTotal ? ` · мимо ${missTotal}` : ''} · кал ${fecesTotal}`}
        complete={false}
      >
        <div className="flex flex-col gap-2.5">
          <p className="m-0 text-[12px] font-semibold text-muted">Моча — сколько баков собрали; «мимо» — сколько раз не поймали.</p>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 text-[12px] font-bold text-muted">
            <span />
            <span className="w-[116px] text-center">баков мочи</span>
            <span className="w-[116px] text-center">мимо</span>
          </div>
          {ELEPHANTS.map((el) => (
            <div key={el} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2">
              <span className="text-[15px] font-bold">{el}</span>
              <Counter tone="teal" label={`${el}, баков мочи`} value={q.urine?.[el]?.ok ?? 0} onPlus={() => urine(el, 'ok', 1)} onMinus={() => urine(el, 'ok', -1)} />
              <Counter tone="amber" label={`${el}, мимо`} value={q.urine?.[el]?.miss ?? 0} onPlus={() => urine(el, 'miss', 1)} onMinus={() => urine(el, 'miss', -1)} />
            </div>
          ))}
          <div className="mt-1 grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-2 border-t border-surface2 pt-3">
            <span className="text-[12px] font-bold text-muted">кал, раз за дежурство</span>
            <span />
            {ELEPHANTS.map((el) => (
              <Fragment key={el}>
                <span className="text-[15px] font-bold">{el}</span>
                <Counter tone="teal" label={`${el}, кал`} value={feces(el)} onPlus={() => poop(el, 1)} onMinus={() => poop(el, -1)} />
              </Fragment>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0 pt-1">
            <WhyLink id="urine-tank" label="зачем в бак?" />
            <WhyLink id="urine-miss" label="зачем отмечать «мимо»?" />
            <WhyLink id="ammonia" label="почему убирать сразу?" />
            <WhyLink id="dry-bedding" label="почему сухая подстилка?" />
            <WhyLink id="floor-mold" label="почему не под пол?" />
          </div>
        </div>
      </Quest>

      <Quest
        icon="leaf"
        title="Ветки"
        progress={BRANCH_AMOUNT[branches]}
        complete={branches > 0}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-[14px] font-bold text-muted">Сколько дали, на глаз</span>
            <Segmented
              label="Сколько веток"
              value={String(branches)}
              onChange={(v) =>
                updateShift(shift, (s) => {
                  s.quests.branches = { ...(s.quests.branches ?? { kinds: [] }), amount: Number(v) };
                })
              }
              options={BRANCH_AMOUNT.map((l, i) => ({ value: String(i), label: ['нет', l, 'обычно', l][i] }))}
            />
            <div className="flex flex-wrap gap-2">
              {BRANCH_KINDS.map((k) => {
                const on = q.branches?.kinds?.includes(k) ?? false;
                return (
                  <Chip
                    key={k}
                    on={on}
                    onClick={() =>
                      updateShift(shift, (s) => {
                        const kinds = new Set(s.quests.branches?.kinds ?? []);
                        if (kinds.has(k)) kinds.delete(k);
                        else kinds.add(k);
                        s.quests.branches = { ...(s.quests.branches ?? {}), kinds: [...kinds] };
                      })
                    }
                  >
                    {k}
                  </Chip>
                );
              })}
            </div>
          </div>
        </div>
      </Quest>

      <Card className="divide-y divide-surface2 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">Мешков взяли</span>
            <span className="text-[12px] font-semibold text-muted">240 л, из запаса</span>
          </span>
          <Stepper label="Мешков взяли" value={q.cleaning?.bags ?? 0} onChange={(v) => setBags(shift, v, user)} />
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">Мешков вывезли</span>
            <span className="text-[12px] font-semibold text-muted">на мусорку</span>
          </span>
          <Stepper
            label="Мешков вывезли"
            value={q.cleaning?.out ?? 0}
            onChange={(v) =>
              updateShift(shift, (s) => {
                s.quests.cleaning = { ...(s.quests.cleaning ?? {}), out: v };
              })
            }
          />
        </div>
      </Card>

      <WashCard shift={shift} />
    </Section>
  );
}

/** Мытьё: одно нажатие; комментарий — только если было что-то особенное. */
function WashCard({ shift }: { shift: Shift }) {
  const w = shift.quests?.wash ?? (shift.quests?.shower ? { at: '' } : undefined);
  const set = (patch: Partial<NonNullable<Quests['wash']>>) =>
    updateShift(shift, (s) => {
      s.quests.wash = { at: nowTime(), ...(s.quests.wash ?? {}), ...patch };
    });
  return (
    <Card className="flex flex-col gap-3 p-3.5">
      <div className="flex items-center gap-3">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${w ? 'bg-teal/15 text-teal' : 'bg-surface2 text-ink2'}`}>
          <Icon name={w ? 'check' : 'drop'} size={18} stroke={w ? 2.6 : 2} />
        </span>
        <span className="flex-1 text-[15px] font-bold">{w ? 'Слоних мыли' : 'Мытьё'}</span>
        {w ? (
          <button
            type="button"
            onClick={() =>
              updateShift(shift, (s) => {
                delete s.quests.wash;
                delete s.quests.shower;
              })
            }
            className="-my-3 px-2 py-3 text-[14px] font-bold text-muted underline"
          >
            не мыли
          </button>
        ) : (
          <button type="button" onClick={() => set({})} className="h-11 rounded-xl border border-line px-3.5 text-[14px] font-bold">
            Мыли сегодня
          </button>
        )}
      </div>
      {w && <WashNote value={w.note ?? ''} onCommit={(note) => set({ note })} />}
    </Card>
  );
}

function WashNote({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <input
      className={inputCls}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text === value) return;
        onCommit(text.trim());
        logEvent('wash.note', { text: text.trim().slice(0, 200) }); // частые фразы потом превратим в кнопки
      }}
      placeholder="Если вели себя странно или что-то особенное (необязательно)"
    />
  );
}

/** Мытьё одной строкой — для журнала. */
export function washText(q: Quests | undefined): string {
  const w = q?.wash;
  if (!w) return q?.shower ? 'мыли' : '';
  const old = [w.place === 'outside' && 'на улице', w.air != null && `${w.air > 0 ? '+' : ''}${w.air}°`].filter(Boolean); // из старых записей
  return ['мыли', ...old, w.note].filter(Boolean).join(', ');
}
