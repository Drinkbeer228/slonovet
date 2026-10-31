import { setFeedDone } from '../../domain/actions';
import { daySlots, nowItem, type DaySlot } from '../../domain/day';
import { mealCancelled } from '../../domain/road';
import { dutyTodos, whoLabel } from '../../domain/shift';
import type { CurrentUser, Shift } from '../../domain/types';
import { isoDate } from '../../lib/dates';
import { useEffectiveDiets, useRows } from '../../lib/store';
import { Icon, type IconName } from '../../ui/Icon';
import { Button, GlowIcon, Plate, toast, type Glow } from '../../ui/kit';
import { mealTitle } from './FeedingBlock';

/**
 * «Сейчас» — первая плита дежурства: одно ближайшее дело крупно и кнопка, которая его делает.
 * Под ней — лента дня по смыслу (День · Вечер · Ночь · Утро), без жёстких таймеров.
 */
export function NowPlate({ shift, user, stale, onHandover }: { shift: Shift; user: CurrentUser; stale: boolean; onHandover: () => void }) {
  const { diets, base } = useEffectiveDiets();
  const requests = useRows('requests');
  const marks = useRows('request_marks');
  const todos = dutyTodos(requests, marks, shift, isoDate()).filter((t) => t.req.elephant !== 'work');
  const slots = daySlots(shift, (t) => mealCancelled(base, diets, t));
  const item = nowItem(slots, todos, { stale });

  let glow: Glow = 'teal';
  let icon: IconName = 'check';
  let title = '';
  let sub = '';
  let action: { label: string; run: () => void } | null = null;
  if (item.kind === 'feed') {
    const { title: meal, prep } = mealTitle(diets, item.time);
    const slot = slots.find((s) => s.time === item.time)!;
    glow = item.late ? 'amber' : 'teal';
    icon = 'bowl';
    title = `${slot.name}: ${meal.toLowerCase()}`;
    sub = item.late ? 'Не отмечено — дали? Отметь, если кормили' : prep || 'Дали — отметь';
    action = {
      label: 'Покормили',
      run: async () => {
        await setFeedDone(shift, item.time, true, user);
        toast(`${slot.name}: отмечено`);
      },
    };
  } else if (item.kind === 'task') {
    const r = item.todo.req;
    glow = r.urgent ? 'coral' : 'sky';
    icon = 'syringe';
    title = `${whoLabel(r.elephant)}: ${r.text}`;
    sub = [r.dose, r.at_time ? `к ${r.at_time.slice(0, 5)}` : '', item.todo.needed > 1 ? `${item.todo.marks.length} из ${item.todo.needed} сегодня` : ''].filter(Boolean).join(' · ');
    action = { label: 'К назначению', run: () => document.getElementById('sec-requests')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) };
  } else if (item.kind === 'handover') {
    glow = 'amber';
    icon = 'shift';
    title = 'Пора передавать дежурство';
    sub = 'Смена идёт больше суток';
    action = { label: 'Передать', run: onHandover };
  } else {
    title = 'Всё по плану';
    sub = [item.next ? `Дальше — ${item.next.name.toLowerCase()}, ${item.next.hint}` : 'Кормления на эту смену отмечены', item.left ? `назначений осталось: ${item.left}` : ''].filter(Boolean).join(' · ');
  }

  return (
    <Plate glow={glow} halo={glow !== 'teal'} className="flex flex-col gap-3 p-4">
      <span className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted">Сейчас</span>
      <div className="flex items-start gap-3">
        <GlowIcon glow={glow} icon={icon} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[19px] font-extrabold leading-snug">{title}</span>
          {sub && <span className="text-[14px] font-semibold text-ink2">{sub}</span>}
        </div>
      </div>
      {action && (
        <Button kind="accent" big full onClick={action.run}>
          {action.label}
        </Button>
      )}
      <DayLine slots={slots} />
    </Plate>
  );
}

const DOT: Record<DaySlot['status'], { cls: string; icon?: IconName; label: string }> = {
  done: { cls: 'border-teal bg-teal text-bg', icon: 'check', label: 'отмечено' },
  due: { cls: 'border-teal text-teal-fg ring-4 ring-[color-mix(in_srgb,var(--color-teal)_25%,transparent)]', label: 'сейчас' },
  late: { cls: 'border-amber text-amber-fg', icon: 'alert', label: 'не отмечено' },
  soon: { cls: 'border-edge-hi text-faint', label: 'впереди' },
  outside: { cls: 'border-edge text-faint opacity-50', label: 'не в смене' },
  off: { cls: 'border-dashed border-edge text-faint', icon: 'minus', label: 'в дороге — нет' },
};

/** Лента дня: четыре отрезка смены точками; линия между ними закрашена до последнего отмеченного. */
export function DayLine({ slots }: { slots: DaySlot[] }) {
  return (
    <ol className="relative m-0 grid list-none grid-cols-4 p-0 pt-1" aria-label="Лента дня">
      <span aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-[17px] h-0.5 rounded bg-edge" />
      {slots.map((s) => {
        const d = DOT[s.status];
        return (
          <li key={s.time} className="relative flex flex-col items-center gap-1" aria-label={`${s.name}, ${s.hint}: ${d.label}`}>
            <span className={`z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 bg-surface ${d.cls}`}>
              {d.icon && <Icon name={d.icon} size={14} stroke={2.6} />}
            </span>
            <span className="text-[13px] font-bold">{s.name}</span>
            <span className="text-[12px] font-semibold text-muted">{s.hint}</span>
          </li>
        );
      })}
    </ol>
  );
}
