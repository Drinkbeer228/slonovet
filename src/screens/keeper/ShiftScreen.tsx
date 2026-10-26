import { useEffect, useState, type ReactNode } from 'react';
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

/** Ведут дежурство только киперы. Остальные, включая админов, смотрят его как есть, ничего не меняя. */
const canWork = (u: CurrentUser) => u.role === 'keeper';

export function ShiftScreen({ user }: { user: CurrentUser }) {
  const shifts = useRows('shifts');
  const shift = currentShift(shifts);
  const [acceptOwn, setAcceptOwn] = useState(false);
  const [accepting, setAccepting] = useState(false);
  if (shift) return <OpenShift shift={shift} user={user} readOnly={!canWork(user)} />;

  const last = lastHanded(shifts);
  // только что сдал сам — показываем код, пока сменщик не принял
  if (!acceptOwn && last?.keeper_id === user.id && last.handover_code && !acceptedBy(shifts, last)) {
    return <HandedShift shift={last} onAcceptOwn={() => setAcceptOwn(true)} />;
  }
  // никто не дежурит: видно последнее дежурство, проверка при приёме — в шторке
  const accept = canWork(user) && (
    <>
      <div data-tour="accept">
        <Button kind="primary" big full icon="shield" onClick={() => setAccepting(true)}>
          Принять дежурство
        </Button>
      </div>
      <Sheet open={accepting} onClose={() => setAccepting(false)} title="Принять дежурство">
        <AcceptShift user={user} />
      </Sheet>
    </>
  );
  if (!last) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="m-0 px-1 text-[26px] font-extrabold tracking-tight">Дежурство</h1>
        <Card className="p-4 text-[15px] text-muted">
          Дежурств ещё не было.{!canWork(user) && ' Здесь появится дежурство, как только кипер его примет.'}
        </Card>
        {accept}
      </div>
    );
  }
  return <OpenShift shift={last} user={user} readOnly accept={accept} />;
}

function OpenShift({ shift, user, readOnly, accept }: { shift: Shift; user: CurrentUser; readOnly: boolean; accept?: ReactNode }) {
  const notes = useRows('notes').filter((n) => n.shift_id === shift.id);
  const from = useRows('shifts').find((s) => s.id === shift.accepted_from);
  const someoneElses = user.role === 'keeper' && shift.keeper_id !== user.id && from?.keeper_id !== user.id;
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const handed = shift.status !== 'open';
  // назначения и записи о лечении — не только кипер: директор сам обработал Претти — отмечает, врач видит
  const keeper = user.role === 'keeper';
  const canMark = !readOnly || !keeper;
  const stale = !handed && shift.date < isoDate();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-0.5 px-1">
        <span className="text-[13px] font-semibold text-muted">
          {longDate(shift.date)} · с {timeOf(shift.accepted_at)}
          {handed && ` · сдано ${relDate(shift.handed_at?.slice(0, 10) ?? shift.date)} в ${timeOf(shift.handed_at)}`}
        </span>
        <h1 className="m-0 text-[26px] font-extrabold tracking-tight">
          {handed ? 'Прошлое дежурство' : 'Дежурство'} · {shift.keeper_name}
        </h1>
        {readOnly && !accept && (
          <span className="text-[13px] font-semibold text-muted">
            {keeper ? 'Только просмотр — отмечает дежурный кипер' : 'Отмечает дежурный кипер. Назначения и записи о лечении — можешь и ты'}
          </span>
        )}
        {stale && (
          <span className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-bold text-amber">
            <Icon name="alert" size={16} />
            Дежурство от {relDate(shift.date)} не сдано
          </span>
        )}
      </header>

      {accept && (
        <div className="flex flex-col gap-2">
          <p className="m-0 px-1 text-[14px] font-semibold text-ink2">Сейчас никто не дежурит.</p>
          {accept}
        </div>
      )}

      <JumpBar shift={shift} readOnly={readOnly} />

      {someoneElses && !readOnly && <NotHandedHint shift={shift} />}
      <HandoverBanner shift={shift} from={from} myId={user.id} />

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* inert — смотреть можно, нажимать нельзя */}
        <div className="flex flex-col gap-6">
          <div inert={!canMark}>
            <RequestsBlock shift={shift} user={user} />
          </div>
          <div inert={readOnly}>
            <StateMatrix shift={shift} onNote={setNoteDraft} />
          </div>
        </div>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-6" inert={readOnly}>
            <FeedingBlock shift={shift} user={user} />
            <QuestsBlock shift={shift} user={user} />
          </div>
          <Section id="sec-notes" title="Записи за дежурство" aside={notes.length ? String(notes.length) : undefined}>
            {notes.length > 0 && <NotesList notes={[...notes].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))} />}
            {/* запись может оставить любой; не кипер — и после сдачи (процедуру сделали, когда никто не дежурит) */}
            {(!handed || !keeper) && (
              <Button icon="plus" full onClick={() => setNoteDraft({ elephant: 'Претти', metric: null, kind: keeper ? 'observation' : 'procedure' })}>
                {keeper ? 'Запись или фото' : 'Запись о лечении или фото'}
              </Button>
            )}
            {handed && !notes.length && <Card className="px-4 py-3 text-[15px] text-muted">Записей нет</Card>}
          </Section>
          {readOnly ? (
            <Section id="sec-note" title="Следующему дежурному">
              <Card className="px-4 py-3 text-[15px] leading-snug">{shift.note.trim() || <span className="text-muted">Без заметки</span>}</Card>
            </Section>
          ) : (
            <>
              <HandoverNote shift={shift} />
              <Button kind="primary" big full onClick={() => setHandoverOpen(true)}>
                Сдать дежурство
              </Button>
            </>
          )}
        </div>
      </div>

      <NoteSheet draft={noteDraft} shiftId={shift.id} user={user} onClose={() => setNoteDraft(null)} />
      <HandoverSheet open={handoverOpen} shift={shift} onClose={() => setHandoverOpen(false)} />
    </div>
  );
}

/** Строка-сводка вверху: сколько осталось и тап — прокрутка к нужному блоку. */
function JumpBar({ shift, readOnly }: { shift: Shift; readOnly: boolean }) {
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
    { id: 'sec-note', label: readOnly ? 'Заметка' : 'Сдать', val: '', warn: false },
  ];
  return (
    // прилипает под шапкой: посреди длинного дежурства переходы под рукой
    <nav
      aria-label="Блоки дежурства"
      data-tour="jumpbar"
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
