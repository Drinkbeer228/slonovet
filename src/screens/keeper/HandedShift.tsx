import { useState } from 'react';
import { cancelOffer } from '../../domain/actions';
import type { CurrentUser, Shift } from '../../domain/types';
import { timeOf } from '../../lib/dates';
import { useRows } from '../../lib/store';
import { Button, Confirm, GlowIcon, Plate, Section, Sheet, toast } from '../../ui/kit';
import { AcceptShift } from './AcceptShift';
import { Icon } from '../../ui/Icon';

/** Свою смену передаёшь: дежуришь, пока сменщик не примет; отмечать можно дальше, передумал — отменить. */
export function OfferBanner({ shift }: { shift: Shift }) {
  const to = useRows('profiles').find((p) => p.id === shift.handover_to);
  return (
    <Plate glow="teal" className="flex items-center gap-3 p-3.5">
      <GlowIcon glow="teal" icon="shift" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-extrabold text-teal-fg">Передаёшь: {to?.full_name ?? 'сменщику'}</span>
        <span className="text-[13px] font-semibold text-muted">Дежуришь, пока не примет. Отмечать можно дальше.</span>
      </span>
      <button
        type="button"
        onClick={async () => {
          await cancelOffer(shift);
          toast('Передача отменена');
        }}
        className="-my-2 min-h-11 shrink-0 px-1 text-[13px] font-bold text-muted underline"
      >
        отменить
      </button>
    </Plate>
  );
}

/**
 * Чужая открытая смена. Тебе передают — «Принять дежурство» (в этот миг дежурным становишься ты, прежняя смена
 * закрывается). Иначе — кто дежурит и, если дежурный забыл передать, «Заступить самому» с подтверждением.
 */
export function DutyPlate({ shift, user }: { shift: Shift; user: CurrentUser }) {
  const to = useRows('profiles').find((p) => p.id === shift.handover_to);
  const toMe = shift.handover_to === user.id;
  const [sheet, setSheet] = useState<'accept' | 'takeover' | null>(null);
  const [ask, setAsk] = useState(false);
  return (
    <>
      {toMe ? (
        <Plate glow="teal" halo className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <GlowIcon glow="teal" icon="shift" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[17px] font-extrabold">Тебе передают дежурство</span>
              <span className="text-[13px] font-semibold text-muted">{shift.keeper_name} дежурит, пока ты не примешь</span>
            </span>
          </div>
          <Button kind="accent" big full icon="shield" onClick={() => setSheet('accept')}>
            Принять дежурство
          </Button>
        </Plate>
      ) : (
        <Plate glow="teal" className="flex flex-col gap-3 p-3.5">
          <div className="flex items-center gap-3">
            <GlowIcon glow="teal" icon="users" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] font-extrabold">Дежурит {shift.keeper_name}</span>
              <span className="text-[13px] font-semibold text-muted">
                {to ? `передаёт: ${to.full_name}` : `с ${timeOf(shift.accepted_at)} · отмечает только дежурный`}
              </span>
            </span>
          </div>
          <Button full onClick={() => setAsk(true)}>
            Заступить самому
          </Button>
        </Plate>
      )}
      <Confirm
        open={ask}
        title="Заступить без передачи?"
        text={`${shift.keeper_name} ещё на дежурстве. Если заступишь, смена закроется как «принята без сдачи» — это будет видно в журнале.`}
        okLabel="Заступить"
        onOk={() => setSheet('takeover')}
        onClose={() => setAsk(false)}
      />
      <Sheet open={sheet !== null} onClose={() => setSheet(null)} title={sheet === 'takeover' ? 'Заступить без передачи' : 'Принять дежурство'}>
        {sheet === 'takeover' ? <AcceptShift user={user} takeover={shift} /> : <AcceptShift user={user} handover={shift} />}
      </Sheet>
    </>
  );
}

/** Плашка над сменой: кто её ведёт и как прошла передача. */
export function HandoverBanner({ shift, from, myId }: { shift: Shift; from: Shift | undefined; myId: string }) {
  const iHanded = from?.keeper_id === myId;
  // принял после самого себя («новые сутки», снова заступил) — передачи не было, говорить не о чем
  if (!from || from.keeper_id === shift.keeper_id || (!iHanded && !shift.accept_remarks)) return null;
  return (
    <Section title="Передача дежурства">
      <Plate glow={shift.accept_remarks ? 'amber' : 'teal'} className="flex flex-col gap-2 p-4">
        <p className="m-0 text-[15px]">
          {iHanded ? 'Ты сдал' : `${from.keeper_name} сдал`} · {shift.keeper_name} принял в {timeOf(shift.accepted_at)}
        </p>
        {shift.accept_remarks ? (
          <p className="m-0 flex gap-2 text-[15px] font-semibold text-amber-fg">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
            Замечания: {shift.accept_remarks}
          </p>
        ) : (
          <p className="m-0 text-[14px] font-semibold text-teal-fg">Без замечаний</p>
        )}
      </Plate>
    </Section>
  );
}
