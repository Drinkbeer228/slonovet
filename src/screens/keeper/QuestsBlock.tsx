import { Fragment, useState, type ReactNode } from 'react';
import { BRANCH_AMOUNT, BRANCH_KINDS, ELEPHANTS } from '../../domain/elephants';
import { setBags, updateShift } from '../../domain/actions';
import type { CurrentUser, ElephantName, Quests, Shift } from '../../domain/types';
import { Card, Chip, KEY, Section, Segmented, Stepper, TONE } from '../../ui/kit';
import { Icon, type IconName } from '../../ui/Icon';
import { RowIcon } from './RowIcon';
import { nowTime } from '../../lib/dates';

/** Раскрывающаяся строка карточки: итог справа, подробности — по тапу. */
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
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <RowIcon icon={icon} done={complete} />
        <span className="flex-1 text-[15px] font-bold">{title}</span>
        <span className={`text-right text-[13px] font-bold ${complete ? 'text-teal-fg' : 'text-muted'}`}>{progress}</span>
        <Icon name="down" size={18} className={`shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-edge px-4 py-3">{children}</div>}
    </div>
  );
}

function Counter({ value, onPlus, onMinus, label, tone }: { value: number; onPlus: () => void; onMinus: () => void; label: string; tone: 'teal' | 'amber' }) {
  return (
    <div className={`flex items-center gap-0.5 rounded-2xl p-0.5 ${TONE.sunken}`}>
      <button type="button" aria-label={`${label}: убрать`} onClick={onMinus} disabled={value === 0} className={`h-11 w-11 rounded-[14px] text-[20px] font-bold text-ink2 disabled:opacity-30 ${KEY}`}>
        −
      </button>
      <button
        type="button"
        aria-label={`${label}: добавить`}
        onClick={onPlus}
        className={`inline-flex h-11 min-w-[60px] items-center justify-center gap-1 rounded-[14px] border px-2 text-[15px] font-extrabold transition-transform active:scale-[0.97] ${
          tone === 'teal'
            ? 'border-teal/50 bg-[color-mix(in_srgb,var(--color-teal)_var(--tint),transparent)] text-teal-fg shadow-(--shadow-key-on)'
            : 'border-amber/50 bg-[color-mix(in_srgb,var(--color-amber)_var(--tint),transparent)] text-amber-fg shadow-[inset_0_1px_0_var(--color-hl),0_0_16px_-4px_color-mix(in_srgb,var(--color-amber)_var(--glow),transparent)]'
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
      {/* одна плита, строки одного вида: иконка, что это, итог или управление справа */}
      <Card className="divide-y divide-edge overflow-hidden">
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
            <div className="mt-1 grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-2 border-t border-edge pt-3">
              <span className="text-[12px] font-bold text-muted">кал, раз за дежурство</span>
              <span />
              {ELEPHANTS.map((el) => (
                <Fragment key={el}>
                  <span className="text-[15px] font-bold">{el}</span>
                  <Counter tone="teal" label={`${el}, кал`} value={feces(el)} onPlus={() => poop(el, 1)} onMinus={() => poop(el, -1)} />
                </Fragment>
              ))}
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

        <div className="flex gap-3 px-4 py-3">
          <RowIcon icon="trash" done={(q.cleaning?.bags ?? 0) > 0} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="flex min-h-9 items-center text-[15px] font-bold">Мешки, 240 л</span>
            <div className="flex items-center gap-3">
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[14px] font-bold">Взяли</span>
                <span className="text-[12px] font-semibold text-muted">из запаса</span>
              </span>
              <Stepper label="Мешков взяли" value={q.cleaning?.bags ?? 0} onChange={(v) => setBags(shift, v, user)} />
            </div>
            <div className="flex items-center gap-3">
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[14px] font-bold">Вывезли</span>
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
          </div>
        </div>

        <WashRow shift={shift} />
      </Card>
    </Section>
  );
}

/** Мытьё: кого мыли — чипами «Всех · Претти · Марго · Одри» (несколько сразу); снять — тап ещё раз. */
function WashRow({ shift }: { shift: Shift }) {
  const w = shift.quests?.wash ?? (shift.quests?.shower ? { at: '' } : undefined);
  // старые записи без «кого» — мыли всех
  const who: ElephantName[] = w ? (w.who ?? [...ELEPHANTS]) : [];
  const save = (next: ElephantName[]) =>
    updateShift(shift, (s) => {
      delete s.quests.shower;
      if (!next.length) delete s.quests.wash;
      else s.quests.wash = { at: s.quests.wash?.at || nowTime(), who: next };
    });
  const all = who.length === ELEPHANTS.length;
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3">
      <div className="flex items-center gap-3">
        <RowIcon icon="sparkle" done={who.length > 0} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-bold">Мытьё</span>
          <span className="text-[12px] font-semibold text-muted">{who.length ? `мыли${w?.at ? ` в ${w.at}` : ''}` : 'кого мыли сегодня'}</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2 pl-12">
        <Chip on={all} onClick={() => save(all ? [] : [...ELEPHANTS])}>
          Всех
        </Chip>
        {ELEPHANTS.map((el) => (
          <Chip key={el} on={who.includes(el)} onClick={() => save(who.includes(el) ? who.filter((x) => x !== el) : ELEPHANTS.filter((x) => x === el || who.includes(x)))}>
            {el}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** Мытьё одной строкой — для журнала. */
export function washText(q: Quests | undefined): string {
  const w = q?.wash;
  if (!w) return q?.shower ? 'мыли' : '';
  const old = [w.place === 'outside' && 'на улице', w.air != null && `${w.air > 0 ? '+' : ''}${w.air}°`].filter(Boolean); // из старых записей
  const who = w.who && w.who.length < ELEPHANTS.length ? w.who.join(', ') : '';
  return ['мыли', who, ...old, w.note].filter(Boolean).join(', ');
}
