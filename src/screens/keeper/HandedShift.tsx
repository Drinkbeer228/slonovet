import { useEffect, useState } from 'react';
import { canTakeShift } from '../../domain/access';
import { cancelOffer } from '../../domain/actions';
import { sortShifts } from '../../domain/shift';
import type { CurrentUser, Shift } from '../../domain/types';
import { localDay, relDate, timeOf } from '../../lib/dates';
import { useRows } from '../../lib/store';
import { Button, Card, Confirm, GlowIcon, Plate, Section, Sheet, toast } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { AcceptShift } from './AcceptShift';

const TAKEOVER = 'Принята без сдачи';
const when = (ts: string | null | undefined) => (ts ? `${relDate(localDay(ts))} ${timeOf(ts)}` : '');

/**
 * Одна строка «кто дежурит» вместо нескольких плашек: имя, с какого часа и главное для тебя
 * (передаёшь / тебя сменили / замечания при приёме). Тап — шторка со сводкой и действиями:
 * «Передать дежурство», «Отменить передачу», «Стать дежурным».
 */
export function DutyBar({ shift, from, user, stale, onHandover }: { shift: Shift; from: Shift | undefined; user: CurrentUser; stale: boolean; onHandover: () => void }) {
  const profiles = useRows('profiles');
  const shifts = useRows('shifts');
  const [open, setOpen] = useState<'info' | 'ask' | 'takeover' | null>(null);
  // дежурство сменилось (приняли, заступили) — открытые шторки про прежнее закрываем
  useEffect(() => setOpen(null), [shift.id]);
  const mine = shift.keeper_id === user.id;
  const to = profiles.find((p) => p.id === shift.handover_to);
  const takenOver = Boolean(shift.accept_remarks?.startsWith(TAKEOVER));
  const remarks = takenOver ? (shift.accept_remarks ?? '').slice(TAKEOVER.length).replace(/^\.\s*/, '') : (shift.accept_remarks ?? '');
  const iHanded = Boolean(from && from.keeper_id === user.id && from.keeper_id !== shift.keeper_id);
  // одна строка о главном для того, кто смотрит
  const line = mine
    ? to
      ? { text: `передаёт: ${to.full_name} · ждём, когда примет`, cls: 'text-teal-fg' }
      : { text: `дежурит с ${timeOf(shift.accepted_at)}`, cls: 'text-muted' }
    : iHanded && takenOver
      ? { text: `сменил без передачи · ${timeOf(shift.accepted_at)}`, cls: 'text-amber-fg' }
      : iHanded && remarks
        ? { text: 'есть замечания при приёме', cls: 'text-amber-fg' }
        : to
          ? { text: `передаёт: ${to.full_name}`, cls: 'text-muted' }
          : { text: `с ${timeOf(shift.accepted_at)}`, cls: 'text-muted' };
  const before = sortShifts(shifts)
    .filter((s) => s.status === 'handed' && !s.deleted && s.id !== shift.id)
    .slice(0, 4);
  const canTake = !mine && canTakeShift(user.role) && shift.handover_to !== user.id;

  return (
    <>
      <button type="button" onClick={() => setOpen('info')} aria-label="Дежурство: подробнее" className="text-left transition-transform active:scale-[0.99]">
        <Card tone="glass" className="flex items-center gap-3 px-3.5 py-2.5">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-teal)_var(--tint),transparent)] text-[16px] font-extrabold text-teal-fg">
            {shift.keeper_name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <h1 className="m-0 truncate text-[17px] font-extrabold leading-tight">{shift.keeper_name}</h1>
            <span className={`truncate text-[13px] font-semibold ${line.cls}`}>{line.text}</span>
          </span>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-extrabold ${
              stale ? 'bg-[color-mix(in_srgb,var(--color-amber)_var(--tint),transparent)] text-amber-fg' : 'bg-[color-mix(in_srgb,var(--color-teal)_var(--tint),transparent)] text-teal-fg'
            }`}
          >
            {stale && <Icon name="alert" size={12} stroke={3} />}
            {stale ? 'Больше суток' : 'На смене'}
          </span>
          <Icon name="down" size={18} className="shrink-0 text-muted" />
        </Card>
      </button>

      <Sheet
        open={open === 'info'}
        onClose={() => setOpen(null)}
        title="Дежурство"
        footer={
          mine ? (
            <div className="flex flex-col gap-2">
              <Button
                kind="primary"
                full
                icon="check"
                onClick={() => {
                  setOpen(null);
                  onHandover();
                }}
              >
                {to ? 'Передать другому' : 'Передать дежурство'}
              </Button>
              {to && (
                <Button
                  full
                  onClick={async () => {
                    await cancelOffer(shift);
                    toast('Передача отменена');
                    setOpen(null);
                  }}
                >
                  Отменить передачу
                </Button>
              )}
            </div>
          ) : canTake ? (
            <Button full icon="shield" onClick={() => setOpen('ask')}>
              Стать дежурным
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-1 p-4">
            <span className="text-[17px] font-extrabold">Дежурит {shift.keeper_name}</span>
            <span className="text-[14px] font-semibold text-muted">принял {when(shift.accepted_at)}</span>
            {to && <span className="text-[14px] font-bold text-teal-fg">передаёт: {to.full_name} — дежурит, пока не примет</span>}
          </Card>
          {from && from.keeper_id !== shift.keeper_id && (
            <Section title="Передача">
              <Card className="flex flex-col gap-1.5 p-4">
                <span className="text-[15px]">
                  {from.keeper_name} → {shift.keeper_name}, {when(shift.accepted_at)}
                </span>
                {takenOver && <span className="text-[14px] font-bold text-amber-fg">без передачи — дежурный не передал</span>}
                {remarks ? (
                  <span className="flex gap-2 text-[14px] font-semibold text-amber-fg">
                    <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                    Замечания: {remarks}
                  </span>
                ) : (
                  !takenOver && <span className="text-[14px] font-semibold text-teal-fg">Без замечаний</span>
                )}
              </Card>
            </Section>
          )}
          {before.length > 0 && (
            <Section title="Раньше" aside="подробно — в «Журнале»">
              <Card className="flex flex-col divide-y divide-edge overflow-hidden">
                {before.map((s) => (
                  <span key={s.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-[14px]">
                    <span className="font-bold">{s.keeper_name}</span>
                    <span className="text-right font-semibold text-muted">
                      {when(s.accepted_at)} – {timeOf(s.handed_at)}
                    </span>
                  </span>
                ))}
              </Card>
            </Section>
          )}
        </div>
      </Sheet>

      <Confirm
        open={open === 'ask'}
        title="Стать дежурным без передачи?"
        text={`${shift.keeper_name} ещё на дежурстве. Если заступишь, смена закроется как «принята без сдачи» — это будет видно в журнале.`}
        okLabel="Стать дежурным"
        onOk={() => window.setTimeout(() => setOpen('takeover'), 0)}
        onClose={() => setOpen((v) => (v === 'ask' ? null : v))}
      />
      <Sheet open={open === 'takeover'} onClose={() => setOpen(null)} title="Стать дежурным">
        <AcceptShift user={user} takeover={shift} />
      </Sheet>
    </>
  );
}

/** Дежурство передают этому человеку — единственное, что требует действия, поэтому крупно и на виду. */
export function HandoverInvite({ shift, user }: { shift: Shift; user: CurrentUser }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Plate glow="teal" halo className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <GlowIcon glow="teal" icon="shift" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[17px] font-extrabold">Дежурство передают: {user.full_name}</span>
            <span className="text-[13px] font-semibold text-muted">{shift.keeper_name} дежурит, пока {user.full_name} не примет</span>
          </span>
        </div>
        <Button kind="accent" big full icon="shield" onClick={() => setOpen(true)}>
          Принять дежурство
        </Button>
      </Plate>
      <Sheet open={open} onClose={() => setOpen(false)} title="Принять дежурство">
        <AcceptShift user={user} handover={shift} />
      </Sheet>
    </>
  );
}
