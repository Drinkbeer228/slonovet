import { useEffect, useState } from 'react';
import { ELEPHANTS, METRIC_LABEL } from '../../domain/elephants';
import { addNote } from '../../domain/actions';
import type { CurrentUser, ElephantName, MetricKey, NoteKind } from '../../domain/types';
import { Button, Check, Chip, FilePreview, PhotoPick, Plate, Sheet, inputCls, toast } from '../../ui/kit';
import { ElephantFace } from '../../ui/ElephantFace';
import { Icon } from '../../ui/Icon';

export interface NoteDraft {
  elephant: ElephantName | 'none';
  metric: MetricKey | null;
  kind: NoteKind;
  /** «Показать врачу» сразу включён (например, из клетки «плохо») */
  forVet?: boolean;
}

const KINDS: { value: NoteKind; label: string }[] = [
  { value: 'observation', label: 'Наблюдение' },
  { value: 'procedure', label: 'Процедура' },
  { value: 'medication', label: 'Препарат' },
  { value: 'incident', label: 'ЧП' },
];

const CHOICES: (ElephantName | 'none')[] = [...ELEPHANTS, 'none'];

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
  // про кого — выбирают каждый раз (кроме записи из клетки таблицы): не уйдёт по ошибке не той слонихе
  const [el, setEl] = useState<ElephantName | 'none' | null>(null);
  const [kind, setKind] = useState<NoteKind>('observation');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [forVet, setForVet] = useState(false);

  useEffect(() => {
    if (draft) {
      setEl(draft.metric ? draft.elephant : null);
      setKind(draft.kind);
      setText('');
      setPhoto(null);
      setForVet(Boolean(draft.forVet));
    }
  }, [draft]);

  const save = async () => {
    if (!draft || !el || (!text.trim() && !photo)) return;
    setBusy(true);
    try {
      // «ЧП» — запись не про слониху: вода, свет, инвентарь, манеж, стресс
      // «Общее» — запись не про одну слониху (elephant 'none'); ЧП — тип, его можно и по слонихе. ЧП врач видит всегда
      await addNote({ shift_id: shiftId, elephant: el, kind, metric: draft.metric, text, photo, user, for_vet: forVet || kind === 'incident' });
      toast(kind === 'incident' ? 'ЧП записано — врач увидит' : forVet ? 'Записано — врач увидит в «Новом»' : 'Записано — видно в журнале');
      onClose();
    } catch {
      toast('Не удалось сохранить', 'error');
    } finally {
      setBusy(false);
    }
  };

  const placeholder =
    kind === 'incident'
      ? 'Что случилось: вода, свет, сломалось, слоны тянули аппаратуру, стресс…'
      : kind === 'medication' ? 'Препарат, доза, как давали' : kind === 'procedure' ? 'Что сделали: стопы, железа, бивни…' : 'Что видно';

  return (
    <Sheet
      open={draft !== null}
      onClose={onClose}
      title={draft?.metric ? `${draft.elephant} · ${METRIC_LABEL[draft.metric].toLowerCase()} — что видно` : kind === 'incident' ? 'ЧП' : 'Запись'}
      footer={
        <Button kind="primary" big full onClick={save} disabled={busy || !el || (!text.trim() && !photo)}>
          Сохранить
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {!draft?.metric && (
          <>
            {/* слониха — лицом: крупно и под палец; ЧП — запись не про слониху */}
            <span className="-mb-2 px-1 text-[14px] font-bold text-muted">Про кого</span>
            <div role="radiogroup" aria-label="Слониха" className="grid grid-cols-4 gap-2">
              {CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={el === c}
                  onClick={() => setEl(c)}
                  className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border text-[13px] font-bold transition ${
                    el === c ? 'border-teal bg-[color-mix(in_srgb,var(--color-teal)_var(--tint),transparent)] text-teal-fg' : 'border-edge bg-surface/60 text-ink2'
                  }`}
                >
                  {c === 'none' ? (
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface2 text-muted">
                      <Icon name="users" size={18} />
                    </span>
                  ) : (
                    <ElephantFace name={c} size={36} />
                  )}
                  {c === 'none' ? 'Общее' : c}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <Chip key={k.value} on={kind === k.value} tone={k.value === 'incident' ? 'coral' : undefined} onClick={() => setKind(k.value)}>
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
          {photo ? <FilePreview file={photo} onRemove={() => setPhoto(null)} /> : <PhotoPick onFile={setPhoto} label="Фото" />}
        </div>
        {kind !== 'incident' && (
          <Plate glow="sky" halo={forVet}>
            <Check on={forVet} label="Показать врачу" sub="врач увидит запись первой, в «Новом»" onChange={setForVet} />
          </Plate>
        )}
      </div>
    </Sheet>
  );
}
