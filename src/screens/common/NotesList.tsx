import { METRIC_LABEL } from '../../domain/elephants';
import type { Note } from '../../domain/types';
import { localDay, relDate, timeOf } from '../../lib/dates';
import { useRows } from '../../lib/store';
import { Card, PhotoThumb } from '../../ui/kit';

const KIND: Record<Note['kind'], string> = { observation: '', procedure: '💉 процедура', medication: '💊 препарат', incident: '⚠ ЧП' };

const REPLY: Record<string, string> = { seen: 'смотрит дальше', assign: 'назначит', call: 'позвонит' };

export function NotesList({ notes, showElephant = true, showDate = false }: { notes: Note[]; showElephant?: boolean; showDate?: boolean }) {
  // ответы врача — под записью: кипер видит, что врач её прочитал
  const replies = useRows('note_comments');
  return (
    <div className="flex flex-col gap-2">
      {notes.map((n) => (
        <Card key={n.id} className="flex gap-3 p-3">
          <PhotoThumb path={n.photo_path} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[12px] font-bold text-muted">
              {[
                showDate ? relDate(localDay(n.created_at)) : null,
                timeOf(n.created_at),
                showElephant && n.elephant !== 'none' ? n.elephant : null,
                n.metric ? METRIC_LABEL[n.metric].toLowerCase() : KIND[n.kind] || null,
                n.author_name,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {n.text && <span className="text-[15px] font-medium leading-snug">{n.text}</span>}
            {n.for_vet && <span className="text-[12px] font-bold text-sky-fg">Показано врачу</span>}
            {replies
              .filter((c) => c.note_id === n.id && !c.deleted)
              // у каждого — только последний ответ (врач мог передумать)
              .filter((c, _, all) => !all.some((x) => x.author_id === c.author_id && x.note_id === c.note_id && !x.deleted && x.created_at > c.created_at))
              .map((c) => (
                <span key={c.id} className="text-[13px] font-bold text-teal-fg">
                  {c.author_name}: {c.kind === 'text' ? c.text : REPLY[c.kind]}
                </span>
              ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
