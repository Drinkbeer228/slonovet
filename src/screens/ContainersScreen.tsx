import { useState } from 'react';
import { logEvent } from '../lib/log';
import { KINDS, PURPOSES, containerName, dims, findInContainers, placeOf, tags, tagsLabel, type Place } from '../domain/containers';
import type { Container, ContainerKind, ContainerPurpose, CurrentUser } from '../domain/types';
import { getRow, newId, put, remove, useRows } from '../lib/store';
import { Button, Card, Chip, Confirm, Empty, Field, Segmented, Sheet, inputCls, toast } from '../ui/kit';
import { LoadingView } from './LoadingView';

type Draft = Omit<Container, 'updated_at'>;
const blank = (user: CurrentUser, kind: ContainerKind | null, purpose: ContainerPurpose | null, place: Place | null): Draft => ({
  id: newId(),
  number: '',
  kind: kind ?? '',
  purpose: purpose ?? '',
  length_cm: null,
  width_cm: null,
  height_cm: null,
  in_tour: place !== 'base',
  contents: '',
  note: '',
  created_by: user.full_name,
});

/**
 * «Контейнеры»: опись (где лежит реквизит — «синяя шляпа» → №6) и погрузка фуры («тетрис»).
 * Контейнер к фуре не привязан: живёт в описи, а в какую фуру и в каком порядке — решает схема погрузки.
 */
export function ContainersScreen({ user }: { user: CurrentUser }) {
  const [part, setPart] = useState<'list' | 'load'>('list');
  const canWrite = user.role !== 'vet';
  return (
    <div className="flex flex-col gap-5">
      <h1 className="m-0 px-1 text-[26px] font-extrabold tracking-tight">Контейнеры</h1>
      <Segmented
        label="Раздел"
        value={part}
        onChange={setPart}
        options={[
          { value: 'list', label: 'Опись' },
          { value: 'load', label: 'Погрузка' },
        ]}
      />
      {part === 'list' ? <Inventory user={user} canWrite={canWrite} /> : <LoadingView user={user} canWrite={canWrite} />}
    </div>
  );
}

const PLACES: { id: Place; label: string }[] = [
  { id: 'tour', label: 'На гастролях' },
  { id: 'base', label: 'На базе' },
];

function Inventory({ user, canWrite }: { user: CurrentUser; canWrite: boolean }) {
  const list = useRows('containers');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ContainerKind | null>(null);
  const [purpose, setPurpose] = useState<ContainerPurpose | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const found = findInContainers(list, query, { kind, purpose, place });
  const live = list.filter((c) => !c.deleted);
  // в фильтрах — только то, что есть в описи
  const kinds = KINDS.filter((k) => live.some((c) => tags(c).kind === k.id));
  const purposes = PURPOSES.filter((p) => live.some((c) => tags(c).purpose === p.id));
  const count = (p: Place) => live.filter((c) => placeOf(c) === p).length;
  return (
    <>
      <div className="flex gap-2">
        <input className={`${inputCls} min-w-0 flex-1`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти: шляпа, №6…" aria-label="Поиск по контейнерам" />
        {canWrite && (
          <Button kind="accent" icon="plus" onClick={() => setEdit(blank(user, kind, purpose, place))}>
            Ящик
          </Button>
        )}
      </div>
      {count('base') > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&>*]:shrink-0">
          <Chip on={!place} onClick={() => setPlace(null)}>
            Все · {live.length}
          </Chip>
          {PLACES.map((p) => (
            <Chip key={p.id} on={place === p.id} onClick={() => setPlace(place === p.id ? null : p.id)}>
              {p.label} · {count(p.id)}
            </Chip>
          ))}
        </div>
      )}
      {kinds.length > 1 && (
        <ChipPick label="Тара" items={kinds} value={kind} onChange={setKind} line />
      )}
      {purposes.length > 1 && (
        <ChipPick label="Что внутри" items={purposes} value={purpose} onChange={setPurpose} line />
      )}
      {found.length === 0 ? (
        <Empty>{live.length ? 'Не нашли — проверь опись' : 'Пока пусто. Заведи контейнер: номер, тару, габариты и что внутри — по строке на предмет.'}</Empty>
      ) : (
        <div className="flex flex-col gap-2.5">
          {found.map(({ c, lines }) => (
            <button key={c.id} type="button" disabled={!canWrite} onClick={() => setEdit({ ...c, ...tags(c) })} className="text-left disabled:opacity-100">
              <Card className={`flex flex-col gap-1 p-4 ${placeOf(c) === 'base' ? 'opacity-60' : ''}`}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[18px] font-extrabold">{containerName(c)}</span>
                  <span className="text-right text-[13px] font-bold text-muted">{[tagsLabel(c), dims(c)].filter(Boolean).join(' · ')}</span>
                </span>
                {placeOf(c) === 'base' && <span className="text-[13px] font-extrabold text-amber-fg">на базе</span>}
                {lines.length > 0 ? (
                  lines.map((l, i) => (
                    <span key={i} className="text-[15px] font-bold text-teal-fg">
                      {l}
                    </span>
                  ))
                ) : (
                  <span className="line-clamp-2 text-[14px] text-ink2">{c.contents.split('\n').filter(Boolean).join(' · ') || 'опись пустая'}</span>
                )}
                {c.note && <span className="text-[13px] font-semibold text-muted">{c.note}</span>}
              </Card>
            </button>
          ))}
        </div>
      )}
      <ContainerSheet draft={edit} onClose={() => setEdit(null)} />
    </>
  );
}

/** Целые сантиметры: пусто — неизвестно. */
const cm = (s: string) => {
  const n = parseInt(s.replace(/\D/g, ''), 10);
  return n > 0 ? n : null;
};

function ContainerSheet({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const [d, setD] = useState<Draft | null>(null);
  const [asking, setAsking] = useState(false);
  if (draft && d?.id !== draft.id) setD(draft);
  if (!draft || !d) return null;
  const isNew = !getRow('containers', d.id);
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const close = () => {
    setD(null);
    onClose();
  };
  const size = (key: 'length_cm' | 'width_cm' | 'height_cm', label: string) => (
    <Field label={label}>
      <input className={inputCls} inputMode="numeric" value={d[key] ?? ''} onChange={(e) => set({ [key]: cm(e.target.value) })} autoComplete="off" />
    </Field>
  );
  return (
    <Sheet
      open
      onClose={close}
      title={isNew ? 'Новый контейнер' : containerName(d)}
      footer={
        <Button
          kind="primary"
          big
          full
          disabled={!d.number.trim()}
          onClick={async () => {
            logEvent('container.save', { number: d.number.trim(), kind: d.kind ?? '', purpose: d.purpose ?? '', in_tour: d.in_tour !== false });
            await put('containers', { ...d, number: d.number.trim(), contents: d.contents.trim(), note: d.note.trim(), in_tour: d.in_tour !== false });
            toast('Сохранено');
            close();
          }}
        >
          Сохранить
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Номер или название">
          <input className={inputCls} value={d.number} onChange={(e) => set({ number: e.target.value })} placeholder="6, 6А, Кофр звук 2" autoComplete="off" />
        </Field>
        <ChipPick label="Тара" items={KINDS} value={d.kind || null} onChange={(v) => set({ kind: v ?? '' })} />
        <ChipPick label="Что внутри" items={PURPOSES} value={d.purpose || null} onChange={(v) => set({ purpose: v ?? '' })} />
        <div className="grid grid-cols-3 gap-2">
          {size('length_cm', 'Длина, см')}
          {size('width_cm', 'Ширина, см')}
          {size('height_cm', 'Высота, см')}
        </div>
        <div className="flex flex-col gap-2">
          <Segmented
            label="Где лежит"
            value={placeOf(d)}
            onChange={(v) => set({ in_tour: v === 'tour' })}
            options={PLACES.map((p) => ({ value: p.id, label: p.label }))}
          />
          <span className="px-1 text-[13px] font-semibold text-muted">
            {placeOf(d) === 'tour' ? 'Едет с нами — попадает в погрузку.' : 'Остался на базе — в погрузку не идёт, опись остаётся.'}
          </span>
        </div>
        <Field label="Что внутри — по строке на предмет">
          <textarea rows={7} className={`${inputCls} resize-none`} value={d.contents} onChange={(e) => set({ contents: e.target.value })} placeholder={'Синяя шляпа в звёздочку\nУдлинитель 20 м\nПопоны для слонов'} />
        </Field>
        <Field label="Заметка">
          <input className={inputCls} value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="Хрупкое, грузить последним…" autoComplete="off" />
        </Field>
        {!isNew && (
          <Button full onClick={() => setAsking(true)}>
            Удалить контейнер
          </Button>
        )}
      </div>
      <Confirm
        open={asking}
        title={`Удалить ${containerName(d)}?`}
        text="Опись пропадёт у всех."
        okLabel="Удалить"
        onOk={async () => {
          await remove('containers', d.id);
          toast('Удалено');
          close();
        }}
        onClose={() => setAsking(false)}
      />
    </Sheet>
  );
}

/** Выбор одного из чипов с подписью; повторный тап снимает. line — фильтр одной строкой с прокруткой вбок, чтобы не съедать экран. */
function ChipPick<T extends string>({ label, items, value, onChange, line }: { label: string; items: { id: T; label: string }[]; value: T | null; onChange: (v: T | null) => void; line?: boolean }) {
  return (
    <div className={`flex flex-col ${line ? 'gap-1' : 'gap-2'}`}>
      <span className={`px-1 font-bold text-muted ${line ? 'text-[12px]' : 'text-[14px]'}`}>{label}</span>
      <div className={`flex gap-2 ${line ? '-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&>*]:shrink-0' : 'flex-wrap'}`}>
        {items.map((k) => (
          <Chip key={k.id} on={value === k.id} onClick={() => onChange(value === k.id ? null : k.id)}>
            {k.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
