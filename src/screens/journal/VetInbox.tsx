import { useState } from 'react';
import { addNoteComment } from '../../domain/actions';
import { vetInbox } from '../../domain/inbox';
import type { CurrentUser, ElephantName, Note } from '../../domain/types';
import { localDay, relDate, timeOf } from '../../lib/dates';
import { useRows } from '../../lib/store';
import { Button, Card, PhotoThumb, Plate, Section, toast } from '../../ui/kit';
import { NewRequestSheet } from '../vet/RequestsScreen';

const KEY = (u: CurrentUser) => `slonovet.vet-seen.${u.id}`;
function seenAt(u: CurrentUser): string {
  try {
    return localStorage.getItem(KEY(u)) ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
  } catch {
    return new Date(Date.now() - 7 * 86_400_000).toISOString();
  }
}

const DOT = { bad: 'bg-coral', warn: 'bg-amber', info: 'bg-sky' } as const;

/** «Новое с прошлого визита»: то, ради чего врач открыл приложение. Пусто — так и сказано, одной строкой. */
export function VetInbox({ user }: { user: CurrentUser }) {
  const [since, setSince] = useState(() => seenAt(user));
  const notes = useRows('notes');
  const shifts = useRows('shifts');
  const marks = useRows('request_marks');
  const requests = useRows('requests');
  const items = vetInbox({ notes, shifts, marks, requests }, since);
  const [assign, setAssign] = useState<{ el: ElephantName | 'all'; text: string } | null>(null);
  if (!items.length) {
    return <Plate glow="teal" className="px-4 py-3 text-[15px] font-bold text-teal-fg">Нового с прошлого визита нет</Plate>;
  }
  return (
    <Section title="Новое с прошлого визита" aside={String(items.length)}>
      {items.slice(0, 20).map((i) => (
        <Card key={i.id} className="flex flex-col gap-2 p-3.5">
          <span className="flex items-start gap-2.5">
            <span aria-hidden="true" className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${DOT[i.tone]}`} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-bold leading-snug">{i.text}</span>
              <span className="text-[12px] font-semibold text-muted">
                {relDate(localDay(i.at))} {timeOf(i.at)} · {i.sub}
              </span>
            </span>
            {i.note?.photo_path && <PhotoThumb path={i.note.photo_path} size={56} />}
          </span>
          {i.note && i.note.elephant !== 'none' && <ReplyButtons note={i.note} user={user} onAssign={() => setAssign({ el: i.note!.elephant as ElephantName, text: i.note!.text })} />}
        </Card>
      ))}
      <Button
        full
        icon="check"
        onClick={() => {
          const now = new Date().toISOString();
          try {
            localStorage.setItem(KEY(user), now);
          } catch {
            /* без хранилища — просто скрываем до перезагрузки */
          }
          setSince(now);
          toast('Отмечено прочитанным');
        }}
      >
        Всё прочитано
      </Button>
      <NewRequestSheet initial={assign?.el ?? null} prefill={assign?.text} user={user} onClose={() => setAssign(null)} />
    </Section>
  );
}

/** Ответ врача на запись — одной кнопкой; кипер увидит его под записью. */
export function ReplyButtons({ note, user, onAssign }: { note: Note; user: CurrentUser; onAssign: () => void }) {
  const replies = useRows('note_comments').filter((c) => c.note_id === note.id && !c.deleted);
  const mine = replies.find((c) => c.author_id === user.id);
  if (mine) return <span className="text-[13px] font-bold text-teal-fg">Ответ: {REPLY_LABEL[mine.kind]}</span>;
  return (
    <div className="grid grid-cols-3 gap-2">
      <Button onClick={() => addNoteComment(note.id, user, 'seen').then(() => toast('Кипер увидит: «врач смотрит»'))}>Смотрю</Button>
      <Button
        onClick={async () => {
          await addNoteComment(note.id, user, 'assign');
          onAssign();
        }}
      >
        Назначить
      </Button>
      <Button onClick={() => addNoteComment(note.id, user, 'call').then(() => toast('Кипер увидит: «врач позвонит»'))}>Позвоню</Button>
    </div>
  );
}

export const REPLY_LABEL = { seen: 'смотрю дальше', assign: 'назначу', call: 'позвоню', text: '' } as const;
