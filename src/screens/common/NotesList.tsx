import { METRIC_LABEL } from '../../domain/elephants';
import type { Note } from '../../domain/types';
import { localDay, relDate, timeOf } from '../../lib/dates';
import { Card, PhotoThumb } from '../../ui/kit';

const KIND: Record<Note['kind'], string> = { observation: '', procedure: '💉 процедура', medication: '💊 препарат', incident: '⚠ ЧП' };

export function NotesList({ notes, showElephant = true, showDate = false }: { notes: Note[]; showElephant?: boolean; showDate?: boolean }) {
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
          </div>
        </Card>
      ))}
    </div>
  );
}
