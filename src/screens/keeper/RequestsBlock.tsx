import { useEffect, useState } from 'react';
import { addMark } from '../../domain/actions';
import { FREQ_LABEL, courseDay, dutyTodos, isFailedMark, markAnswer, overdue, whenLabel, whoLabel, type RequestTodo } from '../../domain/shift';
import { canUndoMark } from '../../domain/access';
import type { CurrentUser, RequestMark, Shift, VetRequest } from '../../domain/types';
import { DiscussionButton, DiscussionSheet } from '../Discussion';
import { TASK_TYPE, taskType } from '../taskType';
import { TypePill } from '../TypePill';
import { Icon } from '../../ui/Icon';
import { remove, useRows } from '../../lib/store';
import { isoDate, localDay, relDate, shortDate, timeOf } from '../../lib/dates';
import { Button, CHIP, Card, Chip, Confirm, FilePreview, IconButton, KEY, LateBadge, PhotoPick, PhotoThumb, Plate, Section, Sheet, TONE, UrgentBadge, SwipeConfirm, inputCls, toast } from '../../ui/kit';

export function RequestsBlock({ shift, user }: { shift: Shift; user: CurrentUser }) {
  const requests = useRows('requests');
  const marks = useRows('request_marks');
  const todos = dutyTodos(requests, marks, shift, isoDate());
  const left = todos.filter((t) => !t.done).length;
  const [marking, setMarking] = useState<{ todo: RequestTodo; answer: string } | null>(null);
  const [talk, setTalk] = useState<VetRequest | null>(null);

  return (
    <Section id="sec-requests" title="Назначения и задачи" aside={todos.length === 0 ? undefined : left > 0 ? `${left} к выполнению` : 'всё выполнено'}>
      {todos.length === 0 && <Card className="px-4 py-4 text-[14px] font-semibold text-muted">Назначений и задач нет</Card>}
      {todos.map((t) => (
        <RequestCard
          key={t.req.id}
          todo={t}
          user={user}
          shiftKeeper={shift.keeper_id}
          onTalk={() => setTalk(t.req)}
          onQuick={async (answer = '') => {
            if (t.req.needs_photo) {
              setMarking({ todo: t, answer });
              return;
            }
            await addMark(t.req.id, shift, user, answer);
            toast(answer ? `Отмечено: ${answer}` : 'Отмечено');
          }}
          onDetailed={() => setMarking({ todo: t, answer: '' })}
        />
      ))}
      <DiscussionSheet req={talk} user={user} onClose={() => setTalk(null)} />
      <MarkSheet todo={marking?.todo ?? null} answer={marking?.answer ?? ''} shift={shift} user={user} onClose={() => setMarking(null)} />
    </Section>
  );
}

/**
 * Строка отметки: кто, когда и что ответил. «Не получилось» — коралловым и с восклицательным знаком,
 * чтобы не читалось как «выполнено». Отменить можно крупной кнопкой и только после подтверждения.
 */
export function MarkLine({ m, req, user, shiftKeeper, withDay }: { m: RequestMark; req: VetRequest; user: CurrentUser; shiftKeeper: string | null; withDay?: boolean }) {
  const [asking, setAsking] = useState(false);
  const failed = isFailedMark(m, req);
  const answer = markAnswer(m, req);
  const rest = answer ? m.note.slice(answer.length).replace(/^\s*—\s*/, '') : m.note;
  const when = `${withDay ? `${relDate(localDay(m.done_at))} ` : ''}${timeOf(m.done_at)}`;
  return (
    <div className="flex items-center gap-2 text-[13px] font-semibold text-ink2">
      {m.photo_path && <PhotoThumb path={m.photo_path} size={44} />}
      <Icon name={failed ? 'alert' : 'check'} size={14} stroke={3} className={`shrink-0 ${failed ? 'text-coral' : 'text-teal'}`} />
      <span className="flex-1">
        <span className={failed ? 'font-extrabold text-coral-fg' : 'text-ink'}>{failed ? 'Не получилось' : answer ? `«${answer}»` : 'Выполнено'}</span>
        {` · ${m.done_by}, ${when}`}
        {rest ? ` — ${rest}` : ''}
      </span>
      {canUndoMark(m, user, shiftKeeper) && (
        <Button className="-my-1 shrink-0" onClick={() => setAsking(true)}>
          Отменить
        </Button>
      )}
      <Confirm
        open={asking}
        title="Отменить отметку?"
        text={`${m.done_by}, ${when}${m.note ? ` — ${m.note}` : ''}. Задача снова будет ждать отметки.`}
        okLabel="Отменить отметку"
        onOk={async () => {
          await remove('request_marks', m.id);
          toast('Отметка отменена');
        }}
        onClose={() => setAsking(false)}
      />
    </div>
  );
}

export function RequestCard({
  todo,
  user,
  shiftKeeper,
  onQuick,
  onDetailed,
  onTalk,
}: {
  todo: RequestTodo;
  user: CurrentUser;
  shiftKeeper: string | null;
  onQuick: (answer?: string) => void;
  onDetailed: () => void;
  onTalk: () => void;
}) {
  const { req, marks, needed, done } = todo;
  const late = overdue(req, done);
  const type = taskType(req.elephant);
  const t = TASK_TYPE[type];
  const when = whenLabel(req);
  const multi = needed > 1;
  const who = whoLabel(req.elephant);
  const tag = CHIP;
  return (
    // без свечения слева: тип — плашкой со словом, срочное и просроченное — коралловой рамкой и бейджем
    <Plate glow="coral" flat className={`flex flex-col gap-2.5 p-3.5 ${!done && (req.urgent || late) ? '!border-coral/60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="m-0 flex min-w-0 items-center gap-2">
          <TypePill type={type} />
          {who !== t.label && <span className="truncate text-[20px] font-extrabold leading-tight">{who}</span>}
        </h3>
        <span className="flex shrink-0 items-center gap-2">
          {req.urgent && !done && <UrgentBadge />}
          {late && <LateBadge />}
          <span className="-my-1.5 -mr-1 ml-0.5">
            <DiscussionButton req={req} user={user} onOpen={onTalk} compact />
          </span>
        </span>
      </div>
      <p className={`m-0 text-[15px] font-medium leading-snug ${done ? 'text-ink2' : ''}`}>{req.text}</p>
      {req.photo_path && <PhotoThumb path={req.photo_path} size={72} />}
      <div className="flex flex-wrap gap-1.5">
        <span className={late ? `${tag} !border-coral/40 !bg-[color-mix(in_srgb,var(--color-coral)_var(--tint),transparent)] !text-coral-fg` : tag}>
          {late && <Icon name="alert" size={12} stroke={3} />}
          {when || FREQ_LABEL[req.frequency]}
        </span>
        {req.route && <span className={tag}>{req.route}</span>}
        {req.dose && <span className={tag}>{req.dose}</span>}
        {(() => {
          const cd = courseDay(req, isoDate());
          return cd?.total ? <span className={`${tag} !text-teal-fg`}>день {Math.min(cd.day, cd.total)} из {cd.total}</span> : req.due_date ? <span className={tag}>до {shortDate(req.due_date)}</span> : null;
        })()}
        {req.needs_photo && !done && (
          <span className={tag}>
            <Icon name="camera" size={12} />с фото
          </span>
        )}
      </div>
      {marks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {marks.map((m) => (
            <MarkLine key={m.id} m={m} req={req} user={user} shiftKeeper={shiftKeeper} />
          ))}
        </div>
      )}
      {!done && req.options?.length ? (
        <div className="flex flex-col gap-1.5">
          {multi && <span className="text-[13px] font-semibold text-muted">отмечено {marks.length} из {needed}</span>}
          <div className="flex gap-2">
            {/* один цельный переключатель вместо отдельных кнопок */}
            <div role="group" aria-label="Ответ" className={`grid flex-1 gap-1 rounded-xl p-0.5 ${TONE.sunken}`} style={{ gridTemplateColumns: `repeat(${Math.min(req.options.length, 3)}, minmax(0, 1fr))` }}>
              {req.options.map((o) => (
                <button key={o} type="button" onClick={() => onQuick(o)} className={`h-11 min-w-0 truncate rounded-[10px] px-1.5 text-[14px] font-bold text-ink ${KEY}`}>
                  {o}
                </button>
              ))}
            </div>
            {!req.needs_photo && <IconButton icon="camera" label="Отметить с фото или заметкой" onClick={onDetailed} />}
          </div>
        </div>
      ) : (
        !done && (
          <div className="flex gap-2">
            {req.needs_photo ? (
              // с фото — шторка, подтверждение там
              <Button kind="accent" icon="camera" full onClick={() => onQuick()}>
                {multi ? `Отметить с фото (${marks.length} из ${needed})` : 'Выполнено — фото'}
              </Button>
            ) : (
              // свайпом, не тапом: случайно не отметится
              <SwipeConfirm label={multi ? 'Проведи — отметить' : 'Проведи — выполнено'} onConfirm={() => onQuick()} />
            )}
            {!req.needs_photo && <IconButton icon="camera" label="Отметить с фото или заметкой" onClick={onDetailed} />}
          </div>
        )
      )}
    </Plate>
  );
}

export function MarkSheet({ todo, answer, shift, user, onClose }: { todo: RequestTodo | null; answer: string; shift: Shift; user: CurrentUser; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState('');
  useEffect(() => setPicked(answer), [answer, todo]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const needPhoto = Boolean(todo?.req.needs_photo);

  const close = () => {
    setNote('');
    setPicked('');
    setPhoto(null);
    onClose();
  };

  return (
    <Sheet
      open={todo !== null}
      onClose={close}
      title="Отметить выполнение"
      footer={
        <Button
          kind="primary"
          big
          full
          disabled={busy || (needPhoto && !photo)}
          onClick={async () => {
            if (!todo) return;
            setBusy(true);
            try {
              await addMark(todo.req.id, shift, user, [picked, note.trim()].filter(Boolean).join(' — '), photo ?? undefined);
              toast('Отмечено');
              close();
            } finally {
              setBusy(false);
            }
          }}
        >
          Готово
        </Button>
      }
    >
      {todo && (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-[15px] leading-snug text-ink2">{todo.req.text}</p>
          {todo.req.options?.length ? (
            <div className="flex flex-wrap gap-2">
              {todo.req.options.map((o) => (
                <Chip key={o} on={picked === o} onClick={() => setPicked(picked === o ? '' : o)}>
                  {o}
                </Chip>
              ))}
            </div>
          ) : null}
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Что увидел (необязательно)"
            aria-label="Комментарий"
            className={`${inputCls} resize-none`}
          />
          <div className="flex items-center gap-3">
            {photo ? <FilePreview file={photo} onRemove={() => setPhoto(null)} /> : <PhotoPick onFile={setPhoto} label={needPhoto ? 'Сделать фото' : 'Добавить фото'} />}
            {needPhoto && !photo && <span className="text-[13px] font-semibold text-amber">нужно фото</span>}
          </div>
        </div>
      )}
    </Sheet>
  );
}
