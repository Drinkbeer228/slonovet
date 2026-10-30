import { useEffect, useState } from 'react';
import { addMark } from '../../domain/actions';
import { haptics } from '../../lib/haptics';
import { FREQ_LABEL, dutyTodos, overdue, whenLabel, whoLabel, type RequestTodo } from '../../domain/shift';
import type { CurrentUser, Shift, VetRequest } from '../../domain/types';
import { DiscussionButton, DiscussionSheet } from '../Discussion';
import { TASK_TYPE, taskType } from '../taskType';
import { Icon } from '../../ui/Icon';
import { remove, useRows } from '../../lib/store';
import { shortDate, timeOf } from '../../lib/dates';
import { Button, CHIP, Card, Chip, FilePreview, IconButton, LateBadge, PhotoPick, PhotoThumb, Section, Sheet, TONE, UrgentBadge, KEY, inputCls, toast } from '../../ui/kit';

export function RequestsBlock({ shift, user }: { shift: Shift; user: CurrentUser }) {
  const requests = useRows('requests');
  const marks = useRows('request_marks');
  const todos = dutyTodos(requests, marks, shift);
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
          onTalk={() => setTalk(t.req)}
          onQuick={async (answer = '') => {
            if (t.req.needs_photo) {
              setMarking({ todo: t, answer });
              return;
            }
            await addMark(t.req.id, shift, user, answer);
            haptics.success();
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

function RequestCard({
  todo,
  user,
  onQuick,
  onDetailed,
  onTalk,
}: {
  todo: RequestTodo;
  user: CurrentUser;
  onQuick: (answer?: string) => void;
  onDetailed: () => void;
  onTalk: () => void;
}) {
  const { req, marks, needed, done } = todo;
  const late = overdue(req, done);
  const t = TASK_TYPE[taskType(req.elephant)];
  const when = whenLabel(req);
  const multi = needed > 1;
  const who = whoLabel(req.elephant);
  const tag = CHIP;
  return (
    <div className={`relative flex flex-col gap-2.5 overflow-hidden rounded-2xl p-3.5 ${TONE.glass} ${!done && req.urgent ? 'shadow-[0_0_26px_-8px_color-mix(in_srgb,var(--color-coral)_65%,transparent)]!' : ''}`}>
      {/* срочное: тлеющее свечение по левому краю */}
      {!done && req.urgent && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-coral/25 via-coral/10 to-transparent" />}
      <div className="flex items-start justify-between gap-2">
        <h3 className={`m-0 flex min-w-0 items-center gap-2 text-[20px] font-extrabold leading-tight ${t.text}`}>
          <Icon name={t.icon} size={18} />
          <span className="truncate">{who}</span>
        </h3>
        <span className="flex shrink-0 items-center gap-1.5">
          {req.urgent && !done && <UrgentBadge />}
          {late && <LateBadge />}
          <span className="-my-1.5">
            <DiscussionButton req={req} user={user} onOpen={onTalk} compact />
          </span>
        </span>
      </div>
      <p className={`m-0 text-[15px] font-medium leading-snug ${done ? 'text-ink2' : ''}`}>{req.text}</p>
      {req.photo_path && <PhotoThumb path={req.photo_path} size={72} />}
      <div className="flex flex-wrap gap-1.5">
        <span className={late ? `${tag} !border-coral/40 !bg-coral/15 !text-coral` : tag}>
          {late && <Icon name="alert" size={12} stroke={3} />}
          {when || FREQ_LABEL[req.frequency]}
        </span>
        {req.due_date && <span className={tag}>до {shortDate(req.due_date)}</span>}
        {req.needs_photo && !done && (
          <span className={tag}>
            <Icon name="camera" size={12} />с фото
          </span>
        )}
      </div>
      {marks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {marks.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-[13px] font-semibold text-ink2">
              {m.photo_path && <PhotoThumb path={m.photo_path} size={36} />}
              <Icon name="check" size={14} stroke={3} className="shrink-0 text-teal" />
              <span className="flex-1">
                Выполнил: {m.done_by}, {timeOf(m.done_at)}
                {m.note ? ` — ${m.note}` : ''}
              </span>
              <button type="button" className="-my-1.5 flex h-11 items-center px-2 text-[13px] font-bold text-muted underline" onClick={() => remove('request_marks', m.id)}>
                отменить
              </button>
            </div>
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
                <button key={o} type="button" onClick={() => onQuick(o)} className={`h-10 min-w-0 truncate rounded-[10px] px-1.5 text-[14px] font-bold text-ink ${KEY}`}>
                  {o}
                </button>
              ))}
            </div>
            {!req.needs_photo && <IconButton icon="camera" label="Отметить с фото или заметкой" onClick={onDetailed} className={KEY} />}
          </div>
        </div>
      ) : (
        !done && (
          <div className="flex gap-2">
            <Button kind="accent" icon="check" full onClick={() => onQuick()}>
              {multi ? `Отметить (${marks.length} из ${needed})` : req.needs_photo ? 'Выполнено — фото' : 'Выполнено'}
            </Button>
            {!req.needs_photo && <IconButton icon="camera" label="Отметить с фото или заметкой" onClick={onDetailed} className={KEY} />}
          </div>
        )
      )}
    </div>
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
              haptics.success();
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
