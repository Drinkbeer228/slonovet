import { useEffect, useRef, useState } from 'react';
import { addComment } from '../domain/actions';
import { whoLabel } from '../domain/shift';
import type { CurrentUser, VetRequest } from '../domain/types';
import { markRead, unreadCount, useReadMarks } from '../lib/comments';
import { localDay, relDate, timeOf } from '../lib/dates';
import { useRows } from '../lib/store';
import { haptics } from '../lib/haptics';
import { Icon } from '../ui/Icon';
import { Sheet, inputCls } from '../ui/kit';

/* Обсуждение внутри заявки: спросить врача, уточнить у кипера — прямо в карточке задачи, без общего чата. */

/** Лента и поле ввода. Открыли — значит прочитали всё, что видно. */
export function DiscussionThread({ req, user }: { req: VetRequest; user: CurrentUser }) {
  const all = useRows('request_comments');
  const list = all.filter((c) => c.request_id === req.id && !c.deleted).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const last = list.at(-1)?.created_at;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (last) markRead(req.id, user.id, last);
    end.current?.scrollIntoView({ block: 'end' });
  }, [last, req.id, user.id]);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await addComment(req.id, user, text);
      haptics.success();
      setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {list.length === 0 && <p className="m-0 text-[14px] font-semibold text-muted">Пока никто не писал. Спросите — ответ увидят все, кто откроет задачу.</p>}
      {list.map((c) => {
        const mine = c.author_id === user.id;
        return (
          <div key={c.id} className={`flex max-w-[85%] flex-col gap-0.5 rounded-2xl px-3.5 py-2.5 ${mine ? 'self-end bg-teal/15' : 'self-start bg-surface'}`}>
            <span className="text-[12px] font-bold text-muted">
              {mine ? 'Вы' : c.author_name} · {relDate(localDay(c.created_at))} {timeOf(c.created_at)}
            </span>
            <span className="whitespace-pre-wrap text-[15px] leading-snug">{c.text}</span>
          </div>
        );
      })}
      <div ref={end} />
      <div className="flex items-end gap-2">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Написать…"
          aria-label="Комментарий"
          className={`${inputCls} min-h-12 flex-1 resize-none`}
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || busy}
          aria-label="Отправить"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal text-teal-ink disabled:opacity-40"
        >
          <Icon name="next" size={22} />
        </button>
      </div>
    </div>
  );
}

/** Шторка с обсуждением — из карточки задачи у кипера: остаёшься на дежурстве. */
export function DiscussionSheet({ req, user, onClose }: { req: VetRequest | null; user: CurrentUser; onClose: () => void }) {
  return (
    <Sheet open={req !== null} onClose={onClose} title={req ? `Обсуждение · ${whoLabel(req.elephant)}` : ''}>
      {req && (
        <div className="flex flex-col gap-4">
          <p className="m-0 rounded-2xl border border-line px-3.5 py-2.5 text-[14px] font-medium leading-snug text-muted">{req.text}</p>
          <DiscussionThread req={req} user={user} />
        </div>
      )}
    </Sheet>
  );
}

/** Кнопка «Обсуждение · 3» с точкой, если есть новое от других. */
export function DiscussionButton({ req, user, onOpen }: { req: VetRequest; user: CurrentUser; onOpen: () => void }) {
  const all = useRows('request_comments');
  const read = useReadMarks(user.id);
  const total = all.filter((c) => c.request_id === req.id && !c.deleted).length;
  const fresh = unreadCount(all, req.id, user.id, read[req.id]);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex h-11 items-center gap-2 self-start rounded-xl px-3 text-[14px] font-bold ${fresh ? 'bg-coral/15 text-coral' : 'text-muted'}`}
    >
      <Icon name="message" size={18} />
      {total ? `Обсуждение · ${total}` : 'Спросить'}
      {fresh > 0 && <span className="rounded-full bg-coral px-1.5 text-[11px] font-extrabold text-bg">+{fresh}</span>}
    </button>
  );
}
