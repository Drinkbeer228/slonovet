import { useEffect, useState } from 'react';
import { addMark } from '../../domain/actions';
import { FREQ_LABEL, overdue, requestTodos, whenLabel, whoLabel, type RequestTodo } from '../../domain/shift';
import type { CurrentUser, Shift, VetRequest } from '../../domain/types';
import { DiscussionButton, DiscussionSheet } from '../Discussion';
import { remove, useRows } from '../../lib/store';
import { shortDate, timeOf } from '../../lib/dates';
import { Button, Card, Chip, FilePreview, IconButton, PhotoPick, PhotoThumb, Section, Sheet, inputCls, toast } from '../../ui/kit';

export function RequestsBlock({ shift, user }: { shift: Shift; user: CurrentUser }) {
  const requests = useRows('requests');
  const marks = useRows('request_marks');
  const todos = requestTodos(requests, marks, shift);
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
  const when = whenLabel(req);
  const multi = needed > 1;
  const who = whoLabel(req.elephant);
  return (
    <Card className={`flex flex-col gap-2.5 p-3.5 ${done ? 'opacity-60' : req.urgent || late ? 'ring-1 ring-coral/60' : 'ring-1 ring-amber/35'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-extrabold text-amber">
          {who}
          {req.urgent && !done && <span className="rounded-md bg-coral/15 px-1.5 py-0.5 text-[11px] text-coral">СРОЧНО</span>}
          {late && <span className="rounded-md bg-coral/15 px-1.5 py-0.5 text-[11px] text-coral">ПРОСРОЧЕНО</span>}
        </span>
        <span className={`text-[12px] ${when ? 'font-extrabold text-ink' : 'font-semibold text-muted'}`}>
          {when || FREQ_LABEL[req.frequency]}
          {req.due_date ? ` · до ${shortDate(req.due_date)}` : ''}
        </span>
      </div>
      <p className="m-0 text-[15px] font-medium leading-snug">{req.text}</p>
      {req.photo_path && <PhotoThumb path={req.photo_path} size={96} />}
      <span className="-mt-1.5 text-[12px] font-semibold text-muted">от {req.author_name}</span>
      {marks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {marks.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-[13px] font-semibold text-muted">
              {m.photo_path && <PhotoThumb path={m.photo_path} size={36} />}
              <span className="flex-1">
                Выполнил: {m.done_by}, {timeOf(m.done_at)}
                {m.note ? ` — ${m.note}` : ''}
              </span>
              <button type="button" className="-my-2 px-2 py-3 text-[13px] font-bold text-muted underline" onClick={() => remove('request_marks', m.id)}>
                отменить
              </button>
            </div>
          ))}
        </div>
      )}
      {!done && req.options?.length ? (
        <div className="flex flex-col gap-2">
          {multi && <span className="text-[12px] font-semibold text-muted">отмечено {marks.length} из {needed}</span>}
          <div className="flex gap-2">
            <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(req.options.length, 3)}, minmax(0, 1fr))` }}>
              {req.options.map((o) => (
                <button key={o} type="button" onClick={() => onQuick(o)} className="h-11 rounded-xl bg-ink px-2 text-[15px] font-extrabold text-bg">
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
            <Button kind="light" icon="check" full onClick={() => onQuick()}>
              {multi ? `Отметить (${marks.length} из ${needed})` : req.needs_photo ? 'Выполнено — фото' : 'Выполнено'}
            </Button>
            {!req.needs_photo && <IconButton icon="camera" label="Отметить с фото или заметкой" onClick={onDetailed} />}
          </div>
        )
      )}
      {req.needs_photo && !done && <span className="text-[12px] font-semibold text-muted">врач просит фото</span>}
      <DiscussionButton req={req} user={user} onOpen={onTalk} />
    </Card>
  );
}

function MarkSheet({ todo, answer, shift, user, onClose }: { todo: RequestTodo | null; answer: string; shift: Shift; user: CurrentUser; onClose: () => void }) {
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
