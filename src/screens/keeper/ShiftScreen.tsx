import { useEffect, useState } from 'react';
import { handOver, updateShift } from '../../domain/actions';
import { FEED_TIMES, acceptedBy, currentShift, lastHanded, requestTodos, shiftFlags } from '../../domain/shift';
import type { CurrentUser, Shift } from '../../domain/types';
import { useRows } from '../../lib/store';
import { isoDate, longDate, relDate, timeOf } from '../../lib/dates';
import { Button, Card, Check, Section, Sheet, inputCls, toast } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { NoteSheet, type NoteDraft } from '../common/NoteSheet';
import { NotesList } from '../common/NotesList';
import { AcceptShift } from './AcceptShift';
import { FeedingBlock } from './FeedingBlock';
import { HandedShift, HandoverBanner, NotHandedHint } from './HandedShift';
import { QuestsBlock } from './QuestsBlock';
import { RequestsBlock } from './RequestsBlock';
import { StateMatrix } from './StateMatrix';

export function ShiftScreen({ user }: { user: CurrentUser }) {
  const shifts = useRows('shifts');
  const shift = currentShift(shifts);
  const [acceptOwn, setAcceptOwn] = useState(false);
  if (!shift) {
    // только что сдал сам — показываем код, пока сменщик не принял
    const last = lastHanded(shifts);
    if (!acceptOwn && last?.keeper_id === user.id && last.handover_code && !acceptedBy(shifts, last)) {
      return <HandedShift shift={last} onAcceptOwn={() => setAcceptOwn(true)} />;
    }
    return <AcceptShift user={user} />;
  }
  return <OpenShift shift={shift} user={user} />;
}

function OpenShift({ shift, user }: { shift: Shift; user: CurrentUser }) {
  const notes = useRows('notes').filter((n) => n.shift_id === shift.id);
  const from = useRows('shifts').find((s) => s.id === shift.accepted_from);
  const someoneElses = user.role === 'keeper' && shift.keeper_id !== user.id && from?.keeper_id !== user.id;
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const stale = shift.date < isoDate();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-0.5 px-1">
        <span className="text-[13px] font-semibold text-muted">
          {longDate(shift.date)} · с {timeOf(shift.accepted_at)}
        </span>
        <h1 className="m-0 text-[26px] font-extrabold tracking-tight">Дежурство · {shift.keeper_name}</h1>
        {stale && (
          <span className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-bold text-amber">
            <Icon name="alert" size={16} />
            Дежурство от {relDate(shift.date)} не сдано
          </span>
        )}
      </header>

      <JumpBar shift={shift} />

      {someoneElses && <NotHandedHint shift={shift} />}
      <HandoverBanner shift={shift} from={from} myId={user.id} />

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          <RequestsBlock shift={shift} user={user} />
          <StateMatrix shift={shift} onNote={setNoteDraft} />
        </div>
        <div className="flex flex-col gap-6">
          <FeedingBlock shift={shift} user={user} />
          <QuestsBlock shift={shift} user={user} />
          <Section title="Записи за дежурство" aside={notes.length ? String(notes.length) : undefined}>
            {notes.length > 0 && <NotesList notes={[...notes].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))} />}
            <Button icon="plus" full onClick={() => setNoteDraft({ elephant: 'Претти', metric: null, kind: 'observation' })}>
              Запись или фото
            </Button>
          </Section>
          <HandoverNote shift={shift} />
          <Button kind="primary" big full onClick={() => setHandoverOpen(true)}>
            Сдать дежурство
          </Button>
        </div>
      </div>

      <NoteSheet draft={noteDraft} shiftId={shift.id} user={user} onClose={() => setNoteDraft(null)} />
      <HandoverSheet open={handoverOpen} shift={shift} onClose={() => setHandoverOpen(false)} />
    </div>
  );
}

/** Строка-сводка вверху: сколько осталось и тап — прокрутка к нужному блоку. */
function JumpBar({ shift }: { shift: Shift }) {
  const requests = useRows('requests');
  const marks = useRows('request_marks');
  const left = requestTodos(requests, marks, shift).filter((t) => !t.done).length;
  const feeds = FEED_TIMES.filter((t) => shift.feeds[t]?.done).length;
  const flags = shiftFlags(shift).length;
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const items = [
    { id: 'sec-requests', label: 'Назначения', val: left ? String(left) : '✓', warn: left > 0 },
    { id: 'sec-state', label: 'Состояние', val: flags ? String(flags) : '✓', warn: flags > 0 },
    { id: 'sec-feeding', label: 'Кормление', val: `${feeds}/${FEED_TIMES.length}`, warn: feeds < FEED_TIMES.length },
    { id: 'sec-quests', label: 'За дежурство', val: '', warn: false },
    { id: 'sec-note', label: 'Сдать', val: '', warn: false },
  ];
  return (
    // прилипает под шапкой: посреди длинного дежурства переходы под рукой
    <nav
      aria-label="Блоки дежурства"
      className="sticky top-14 z-20 -mx-4 flex gap-2 overflow-x-auto bg-bg/95 px-4 py-2 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          onClick={() => go(i.id)}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 text-[14px] font-bold text-ink2"
        >
          {i.label}
          {i.val && <span className={i.warn ? 'text-amber' : 'text-teal'}>{i.val}</span>}
        </button>
      ))}
    </nav>
  );
}

function HandoverNote({ shift }: { shift: Shift }) {
  const [text, setText] = useState(shift.note);
  useEffect(() => setText(shift.note), [shift.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Section id="sec-note" title="Передать следующему дежурному">
      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== shift.note && updateShift(shift, (s) => void (s.note = text))}
        placeholder="Что важно знать следующему дежурному"
        aria-label="Заметка следующему дежурному"
        className={`${inputCls} resize-none`}
      />
    </Section>
  );
}

function HandoverSheet({ open, shift, onClose }: { open: boolean; shift: Shift; onClose: () => void }) {
  const requests = useRows('requests');
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (open) setChecked(false);
  }, [open]);
  const marks = useRows('request_marks');

  const feedsLeft = FEED_TIMES.filter((t) => !shift.feeds[t]?.done);
  const reqLeft = requestTodos(requests, marks, shift).filter((t) => !t.done);
  const flags = shiftFlags(shift);
  const warnings = [
    feedsLeft.length ? `Не отмечено кормление: ${feedsLeft.join(', ')}` : null,
    reqLeft.length ? `Не выполнено назначений и задач: ${reqLeft.length}` : null,
  ].filter(Boolean) as string[];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Сдать дежурство"
      footer={
        <Button
          kind="primary"
          big
          full
          disabled={!checked}
          onClick={async () => {
            await handOver(shift, shift.note.trim());
            toast('Дежурство сдано');
            onClose();
          }}
        >
          Сдать
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {warnings.length > 0 ? (
          <Card className="flex flex-col gap-1.5 p-3.5 ring-1 ring-amber/40">
            {warnings.map((w) => (
              <span key={w} className="flex items-start gap-2 text-[14px] font-semibold text-amber">
                <Icon name="alert" size={16} className="mt-0.5" />
                {w}
              </span>
            ))}
          </Card>
        ) : (
          <Card className="flex items-center gap-2 p-3.5 text-[14px] font-bold text-teal">
            <Icon name="check" size={18} stroke={2.6} />
            Всё отмечено
          </Card>
        )}
        {flags.length > 0 && (
          <p className="m-0 text-[14px] font-semibold text-ink2">
            Отклонения ({flags.length}) увидит следующий дежурный и врач.
          </p>
        )}
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Следующему дежурному</span>
          <Card className="px-4 py-3 text-[15px] leading-snug">
            {shift.note.trim() ? shift.note : <span className="text-muted">Без заметки. Можно написать на экране, в блоке «Передать следующему дежурному».</span>}
          </Card>
        </div>
        <Card className="overflow-hidden ring-1 ring-teal/40">
          <Check
            on={checked}
            label="Осмотрел всех трёх и проверил тазы"
            sub="всё, что не отмечено в таблице и в кормлении, — норма"
            onChange={setChecked}
          />
        </Card>
        <p className="m-0 text-[13px] font-semibold text-muted">Следующий дежурный принимает дежурство под своим логином.</p>
      </div>
    </Sheet>
  );
}
