import { useState } from 'react';
import { cancelHandOver } from '../../domain/actions';
import type { CurrentUser, Shift } from '../../domain/types';
import { syncNow } from '../../lib/sync';
import { localDay, relDate, timeOf } from '../../lib/dates';
import { useRows } from '../../lib/store';
import { Button, Confirm, Plate, Section, Sheet } from '../../ui/kit';
import { AcceptShift } from './AcceptShift';
import { Icon } from '../../ui/Icon';

/** Экран сдающего: смена сдана, ждём, пока сменщик нажмёт «Принять». Кода нет. */
export function HandedShift({ shift, onAcceptOwn }: { shift: Shift; onAcceptOwn: () => void }) {
  const [cancel, setCancel] = useState(false);
  const profiles = useRows('profiles');
  const to = profiles.find((p) => p.id === shift.handover_to);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-0.5 px-1">
        <span className="text-[13px] font-semibold text-muted">
          сдана {relDate(shift.handed_at ? localDay(shift.handed_at) : shift.date)} в {timeOf(shift.handed_at)}
        </span>
        <h1 className="m-0 text-[26px] font-extrabold tracking-tight">Смена сдана</h1>
      </header>

      <Plate glow="teal" halo className="flex flex-col items-center gap-2 p-6 text-center">
        <Icon name="check" size={28} stroke={2.6} className="text-teal-fg" />
        <span className="text-[17px] font-extrabold">{to ? `Принимает ${to.full_name}` : 'Ждём сменщика'}</span>
        <span className="text-[13px] font-semibold text-muted">
          У сменщика на телефоне появится «Тебе сдали смену» и кнопка «Принять». Интернет нужен только, чтобы он это увидел; не увидел, заступит сам.
        </span>
      </Plate>

      <div className="flex flex-col gap-2">
        <Button kind="light" full icon="refresh" onClick={() => syncNow().catch(() => undefined)}>
          Проверить, принял ли
        </Button>
        <Button kind="ghost" full onClick={() => setCancel(true)}>
          Вернуть дежурство себе
        </Button>
        <button type="button" onClick={onAcceptOwn} className="py-2 text-[13px] font-bold text-muted">
          Принимаю дальше сам →
        </button>
      </div>

      <Confirm
        open={cancel}
        title="Вернуть дежурство?"
        text="Дежурство снова откроется у тебя."
        okLabel="Вернуть"
        onOk={() => cancelHandOver(shift)}
        onClose={() => setCancel(false)}
      />
    </div>
  );
}

/** Плашка над сменой: кто её ведёт и как прошла передача. */
export function HandoverBanner({ shift, from, myId }: { shift: Shift; from: Shift | undefined; myId: string }) {
  const iHanded = from?.keeper_id === myId;
  if (!from || (!iHanded && !shift.accept_remarks)) return null;
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

/** Новый кипер пришёл, а смена ещё открыта у другого. */
export function NotHandedHint({ shift, user }: { shift: Shift; user: CurrentUser }) {
  const [takeover, setTakeover] = useState(false);
  return (
    <Plate glow="amber" className="flex flex-col gap-2 p-4">
      <p className="m-0 text-[15px] font-bold">Дежурит {shift.keeper_name}</p>
      <p className="m-0 text-[14px] text-ink2">Если он ушёл и не сдал смену, можно заступить сразу.</p>
      <div className="flex flex-wrap gap-x-5">
        <button type="button" onClick={() => syncNow().catch(() => undefined)} className="py-2 text-[13px] font-bold text-teal">
          Он уже сдал? Обновить
        </button>
        <button type="button" onClick={() => setTakeover(true)} className="py-2 text-[13px] font-bold text-teal">
          Заступить (смена не сдана)
        </button>
      </div>
      <Sheet open={takeover} onClose={() => setTakeover(false)} title="Принять без кода">
        <AcceptShift user={user} takeover={shift} />
      </Sheet>
    </Plate>
  );
}
