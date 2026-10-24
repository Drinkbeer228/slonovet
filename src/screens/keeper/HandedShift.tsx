import { useState } from 'react';
import { cancelHandOver } from '../../domain/actions';
import type { Shift } from '../../domain/types';
import { syncNow } from '../../lib/sync';
import { relDate, timeOf } from '../../lib/dates';
import { Button, Card, Confirm, Section } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { WhyLink } from '../common/Why';

/** Экран сдающего: код для следующего дежурного, пока смену не приняли. */
export function HandedShift({ shift, onAcceptOwn }: { shift: Shift; onAcceptOwn: () => void }) {
  const [cancel, setCancel] = useState(false);
  const code = shift.handover_code ?? '';
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-0.5 px-1">
        <span className="text-[13px] font-semibold text-muted">
          сдана {relDate(shift.handed_at?.slice(0, 10) ?? shift.date)} в {timeOf(shift.handed_at)}
        </span>
        <h1 className="m-0 text-[26px] font-extrabold tracking-tight">Ждём дежурного</h1>
      </header>

      <Card className="flex flex-col items-center gap-3 p-6">
        <span className="text-[14px] font-bold text-muted">Продиктуй код тому, кто принимает</span>
        <span aria-label={`Код ${code.split('').join(' ')}`} className="font-mono text-[56px] font-extrabold tracking-[0.25em] text-teal">
          {code}
        </span>
        <span className="text-center text-[13px] font-semibold text-muted">Он пройдёт проверку, впишет замечания и введёт код. Тогда дежурство будет передана.</span>
        <WhyLink id="handover-code" label="зачем код?" />
      </Card>

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
        text="Код перестанет действовать, дежурство снова откроется у тебя."
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
      <Card className="flex flex-col gap-2 p-4">
        <p className="m-0 text-[15px]">
          {iHanded ? 'Ты сдал' : `${from.keeper_name} сдал`} · {shift.keeper_name} принял в {timeOf(shift.accepted_at)}
        </p>
        {shift.accept_remarks ? (
          <p className="m-0 flex gap-2 text-[15px] font-semibold text-amber">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
            Замечания: {shift.accept_remarks}
          </p>
        ) : (
          <p className="m-0 text-[14px] font-semibold text-teal">Без замечаний</p>
        )}
      </Card>
    </Section>
  );
}

/** Новый кипер пришёл, а смена ещё открыта у другого. */
export function NotHandedHint({ shift }: { shift: Shift }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <p className="m-0 text-[15px] font-bold">Дежурит {shift.keeper_name}</p>
      <p className="m-0 text-[14px] text-ink2">Чтобы принять её, попроси его нажать «Сдать дежурство» внизу и продиктовать код.</p>
      <button type="button" onClick={() => syncNow().catch(() => undefined)} className="self-start text-[13px] font-bold text-teal">
        Он уже сдал? Обновить
      </button>
    </Card>
  );
}
