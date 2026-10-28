import { useState } from 'react';
import { canWorkShift } from '../../domain/access';
import { currentShift, lastHanded, mainTodo, overdue, requestTodos, whenLabel, whoLabel } from '../../domain/shift';
import type { CurrentUser } from '../../domain/types';
import { usePreviewSample } from '../../lib/preview';
import { useRows } from '../../lib/store';
import { Icon, type IconName } from '../../ui/Icon';
import { Card } from '../../ui/kit';
import { NoteSheet, type NoteDraft } from '../common/NoteSheet';
import { NewPurchaseSheet } from '../PurchasesView';
import { NewRequestSheet } from '../vet/RequestsScreen';

/* Сводка вверху «Дежурства» — одна для всех ролей: что сейчас главное и что сделать одним касанием. */

const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export function ShiftSummary({ user }: { user: CurrentUser }) {
  const shifts = useRows('shifts');
  const requests = useRows('requests');
  const marks = useRows('request_marks');
  const sample = usePreviewSample();
  const open = currentShift(shifts) ?? sample ?? undefined;
  const keeper = canWorkShift(user.role);
  // запись о лечении: в открытое дежурство; не кипер — и в последнее сданное (процедуру сделали, когда никто не дежурит)
  const noteShift = open ?? (keeper ? undefined : lastHanded(shifts));
  const [note, setNote] = useState<NoteDraft | null>(null);
  const [buying, setBuying] = useState(false);
  const [asking, setAsking] = useState(false);

  const todos = open ? requestTodos(requests, marks, open) : [];
  const main = mainTodo(todos);
  const done = todos.filter((t) => t.done).length;

  return (
    <section className="flex flex-col gap-3" aria-label="Сводка">
      <MainCard
        open={Boolean(open)}
        total={todos.length}
        done={done}
        main={main && { who: whoLabel(main.req.elephant), text: main.req.text, when: whenLabel(main.req), late: overdue(main.req, false), urgent: main.req.urgent }}
      />
      {/* только то, что открывает быстрый ввод; переходы по смене — в полосе «Назначения · Состояние · Кормление» ниже */}
      <div className="grid grid-cols-3 gap-2">
        <Tile
          icon="syringe"
          label="Запись о лечении"
          off={noteShift ? '' : 'нет дежурства'}
          onClick={() => setNote({ elephant: 'Претти', metric: null, kind: keeper ? 'observation' : 'procedure' })}
        />
        <Tile icon="box" label="Нужно купить" onClick={() => setBuying(true)} />
        <Tile icon="message" label="Новая задача" onClick={() => setAsking(true)} />
      </div>
      {noteShift && <NoteSheet draft={note} shiftId={noteShift.id} user={user} onClose={() => setNote(null)} />}
      <NewPurchaseSheet open={buying} user={user} onClose={() => setBuying(false)} />
      <NewRequestSheet
        initial={asking ? 'Претти' : null}
        user={user}
        onClose={() => setAsking(false)}
        onBuy={() => {
          setAsking(false);
          setBuying(true);
        }}
      />
    </section>
  );
}

const PILL = {
  late: 'bg-coral/15 text-coral',
  urgent: 'bg-coral/15 text-coral',
  wait: 'bg-amber/15 text-amber',
  ok: 'bg-teal/15 text-teal',
};

function MainCard({
  open,
  total,
  done,
  main,
}: {
  open: boolean;
  total: number;
  done: number;
  main?: { who: string; text: string; when: string; late: boolean; urgent: boolean };
}) {
  if (!open) {
    return (
      <Card className="flex flex-col gap-1 p-4">
        <span className="text-[13px] font-bold text-muted">Сейчас</span>
        <span className="text-[17px] font-extrabold">Никто не дежурит</span>
      </Card>
    );
  }
  if (!main) {
    return (
      <Card className="flex items-center gap-3 p-4 ring-1 ring-teal/40">
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-extrabold ${PILL.ok}`}>Выполнено</span>
        <span className="text-[15px] font-bold">{total ? `Все задачи смены выполнены · ${done} из ${total}` : 'Задач на смену нет'}</span>
      </Card>
    );
  }
  const [pill, label] = main.late ? [PILL.late, 'Просрочено'] : main.urgent ? [PILL.urgent, 'Срочно'] : [PILL.wait, 'Ждёт отметки'];
  return (
    <button type="button" onClick={() => go('sec-requests')} className="text-left">
      <Card className={`flex flex-col gap-2 p-4 ring-1 ${main.late || main.urgent ? 'ring-coral/50' : 'ring-amber/40'}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[14px] font-extrabold text-amber">{main.who}</span>
          <span className={`rounded-full px-2.5 py-1 text-[12px] font-extrabold ${pill}`}>{label}</span>
        </div>
        <span className="text-[18px] font-extrabold leading-snug">{main.text}</span>
        <span className="flex items-center justify-between gap-2 text-[13px] font-semibold text-muted">
          <span>{main.when}</span>
          <span>
            {done} из {total} задач смены
          </span>
        </span>
      </Card>
    </button>
  );
}

function Tile({ icon, label, off = '', onClick }: { icon: IconName; label: string; off?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={Boolean(off)}
      onClick={onClick}
      className="flex min-h-[88px] flex-col items-start justify-between gap-2 rounded-2xl border border-line bg-surface p-3 text-left active:bg-surface2 disabled:opacity-45"
    >
      <Icon name={icon} size={22} className={off ? 'text-muted' : 'text-teal'} />
      <span className="flex flex-col">
        <span className="text-[14px] font-extrabold leading-tight">{label}</span>
        {off && <span className="text-[12px] font-semibold text-muted">{off}</span>}
      </span>
    </button>
  );
}
