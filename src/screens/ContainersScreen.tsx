import { useState } from 'react';
import { logEvent } from '../lib/log';
import { KINDS, containerName, dims, findInContainers, kindLabel } from '../domain/containers';
import type { Container, ContainerKind, CurrentUser } from '../domain/types';
import { getRow, newId, put, remove, useRows } from '../lib/store';
import { Button, Card, Check, Chip, Confirm, Empty, Field, Segmented, Sheet, inputCls, toast } from '../ui/kit';
import { LoadingView } from './LoadingView';

type Draft = Omit<Container, 'updated_at'>;
const blank = (user: CurrentUser, kind: ContainerKind | null): Draft => ({
  id: newId(),
  number: '',
  kind: kind ?? '',
  length_cm: null,
  width_cm: null,
  height_cm: null,
  in_tour: true,
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

function Inventory({ user, canWrite }: { user: CurrentUser; canWrite: boolean }) {
  const list = useRows('containers');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ContainerKind | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const found = findInContainers(list, query, kind);
  const kinds = KINDS.filter((k) => list.some((c) => !c.deleted && c.kind === k.id));
  return (
    <>
      <div className="flex gap-2">
        <input className={`${inputCls} min-w-0 flex-1`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Что ищем: синяя шляпа, №6, кофр…" aria-label="Поиск по контейнерам" />
        {canWrite && (
          <Button kind="accent" icon="plus" onClick={() => setEdit(blank(user, kind))}>
            Ящик
          </Button>
        )}
      </div>
      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Chip on={!kind} onClick={() => setKind(null)}>
            Все
          </Chip>
          {kinds.map((k) => (
            <Chip key={k.id} on={kind === k.id} onClick={() => setKind(kind === k.id ? null : k.id)}>
              {k.label}
            </Chip>
          ))}
        </div>
      )}
      {found.length === 0 ? (
        <Empty>{list.length ? 'Не нашли — проверьте опись' : 'Пока пусто. Заведите контейнер: номер, тип, габариты и что внутри — по строке на предмет.'}</Empty>
      ) : (
        <div className="flex flex-col gap-2.5">
          {found.map(({ c, lines }) => (
            <button key={c.id} type="button" disabled={!canWrite} onClick={() => setEdit({ ...c })} className="text-left disabled:opacity-100">
              <Card className={`flex flex-col gap-1 p-4 ${c.in_tour === false ? 'opacity-60' : ''}`}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[18px] font-extrabold">{containerName(c)}</span>
                  <span className="text-right text-[13px] font-bold text-muted">{[kindLabel(c.kind), dims(c)].filter(Boolean).join(' · ')}</span>
                </span>
                {c.in_tour === false && <span className="text-[13px] font-extrabold text-amber-fg">не едет</span>}
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
      <input className={inputCls} inputMode="numeric" value={d[key] ?? ''} onChange={(e) => set({ [key]: cm(e.target.value) })} placeholder="см" autoComplete="off" />
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
            logEvent('container.save', { number: d.number.trim(), kind: d.kind ?? '', in_tour: d.in_tour !== false });
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
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Тип</span>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <Chip key={k.id} on={d.kind === k.id} onClick={() => set({ kind: d.kind === k.id ? '' : k.id })}>
                {k.label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {size('length_cm', 'Длина')}
          {size('width_cm', 'Ширина')}
          {size('height_cm', 'Высота')}
        </div>
        <Card tone="sunken" className="overflow-hidden">
          <Check on={d.in_tour !== false} label="Едет в туре" sub="Выключите, если остался или уехал в другой город: в погрузку не пойдёт, опись останется" onChange={(v) => set({ in_tour: v })} />
        </Card>
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
