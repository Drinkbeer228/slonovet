import { useEffect, useState } from 'react';
import { ELEPHANTS, METRIC_LABEL } from '../../domain/elephants';
import { addNote } from '../../domain/actions';
import type { CurrentUser, ElephantName, MetricKey, NoteKind } from '../../domain/types';
import { Button, Chip, FilePreview, PhotoPick, Segmented, Sheet, inputCls, toast } from '../../ui/kit';

export interface NoteDraft {
  elephant: ElephantName | 'none';
  metric: MetricKey | null;
  kind: NoteKind;
}

const KINDS: { value: NoteKind; label: string }[] = [
  { value: 'observation', label: 'Наблюдение' },
  { value: 'procedure', label: 'Процедура' },
  { value: 'medication', label: 'Препарат' },
];

/** Запись словами и фото. Отметки «норма / внимание / плохо» ставятся в таблице состояния, не здесь. */
export function NoteSheet({
  draft,
  shiftId,
  user,
  onClose,
}: {
  draft: NoteDraft | null;
  shiftId: string;
  user: CurrentUser;
  onClose: () => void;
}) {
  const [el, setEl] = useState<ElephantName | 'none'>('Претти');
  const [kind, setKind] = useState<NoteKind>('observation');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (draft) {
      setEl(draft.elephant);
      setKind(draft.kind);
      setText('');
      setPhoto(null);
    }
  }, [draft]);

  const save = async () => {
    if (!draft || (!text.trim() && !photo)) return;
    setBusy(true);
    try {
      // «ЧП» — запись не про слониху: вода, свет, инвентарь, манеж, стресс
      await addNote({ shift_id: shiftId, elephant: el, kind: el === 'none' ? 'incident' : kind, metric: draft.metric, text, photo, user });
      toast(el === 'none' ? 'ЧП записано — видно в журнале' : 'Записано — видно в журнале и у врача');
      onClose();
    } catch {
      toast('Не удалось сохранить', 'error');
    } finally {
      setBusy(false);
    }
  };

  const placeholder =
    el === 'none'
      ? 'Что случилось: вода, свет, сломалось, слоны тянули аппаратуру, стресс…'
      : kind === 'medication' ? 'Препарат, доза, как давали' : kind === 'procedure' ? 'Что сделали: стопы, железа, бивни…' : 'Что видно';

  return (
    <Sheet
      open={draft !== null}
      onClose={onClose}
      title={draft?.metric ? `${draft.elephant} · ${METRIC_LABEL[draft.metric].toLowerCase()} — что видно` : el === 'none' ? 'ЧП' : 'Запись'}
      footer={
        <Button kind="primary" big full onClick={save} disabled={busy || (!text.trim() && !photo)}>
          Сохранить
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {!draft?.metric && (
          <>
            <Segmented
              label="Слониха"
              value={el}
              onChange={setEl}
              options={[...ELEPHANTS.map((e) => ({ value: e as ElephantName | 'none', label: e })), { value: 'none', label: 'ЧП' }]}
            />
            <div className={`flex flex-wrap gap-2 ${el === 'none' ? 'hidden' : ''}`}>
              {KINDS.map((k) => (
                <Chip key={k.value} on={kind === k.value} onClick={() => setKind(k.value)}>
                  {k.label}
                </Chip>
              ))}
            </div>
          </>
        )}
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label="Текст записи"
          className={`${inputCls} resize-none`}
        />
        <div className="flex items-center gap-3">
          {photo ? <FilePreview file={photo} onRemove={() => setPhoto(null)} /> : <PhotoPick onFile={setPhoto} label="Добавить фото" />}
        </div>
      </div>
    </Sheet>
  );
}
