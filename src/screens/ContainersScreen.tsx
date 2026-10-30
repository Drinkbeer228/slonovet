import { useState } from 'react';
import { logEvent } from '../lib/log';
import { findInContainers } from '../domain/containers';
import type { Container, CurrentUser } from '../domain/types';
import { getRow, newId, put, remove, useRows } from '../lib/store';
import { Button, Card, Confirm, Empty, Field, Sheet, inputCls, toast } from '../ui/kit';

type Draft = Omit<Container, 'updated_at'>;
const blank = (user: CurrentUser): Draft => ({ id: newId(), number: '', truck: '', contents: '', note: '', created_by: user.full_name });

/** «Контейнеры»: где лежит реквизит. Вбил «синяя шляпа» — видишь «Контейнер №6, фура 2», не перерывая ящики. */
export function ContainersScreen({ user }: { user: CurrentUser }) {
  const list = useRows('containers');
  const [query, setQuery] = useState('');
  const [edit, setEdit] = useState<Draft | null>(null);
  const canWrite = user.role !== 'vet';
  const found = findInContainers(list, query);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3 px-1">
        <h1 className="m-0 text-[26px] font-extrabold tracking-tight">Контейнеры</h1>
        {canWrite && (
          <Button kind="accent" icon="plus" onClick={() => setEdit(blank(user))}>
            Добавить
          </Button>
        )}
      </header>
      <input className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Что ищем: синяя шляпа, удлинитель…" aria-label="Поиск по контейнерам" />
      {found.length === 0 ? (
        <Empty>{list.length ? 'Не нашли — проверьте опись' : 'Пока пусто. Заведите контейнер: номер, фура и что внутри — по строке на предмет.'}</Empty>
      ) : (
        <div className="flex flex-col gap-2.5">
          {found.map(({ c, lines }) => (
            <button key={c.id} type="button" disabled={!canWrite} onClick={() => setEdit({ ...c })} className="text-left disabled:opacity-100">
              <Card className="flex flex-col gap-1 p-4">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[18px] font-extrabold">Контейнер №{c.number || '—'}</span>
                  {c.truck && <span className="text-[13px] font-bold text-muted">{c.truck}</span>}
                </span>
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
    </div>
  );
}

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
  return (
    <Sheet
      open
      onClose={close}
      title={isNew ? 'Новый контейнер' : `Контейнер №${d.number}`}
      footer={
        <Button
          kind="primary"
          big
          full
          disabled={!d.number.trim()}
          onClick={async () => {
            logEvent('container.save', { number: d.number.trim() });
            await put('containers', { ...d, number: d.number.trim(), truck: d.truck.trim(), contents: d.contents.trim(), note: d.note.trim() });
            toast('Сохранено');
            close();
          }}
        >
          Сохранить
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Номер">
            <input className={inputCls} value={d.number} onChange={(e) => set({ number: e.target.value })} placeholder="6, 6А, Р-12" autoComplete="off" />
          </Field>
          <Field label="Фура">
            <input className={inputCls} value={d.truck} onChange={(e) => set({ truck: e.target.value })} placeholder="Фура 2" autoComplete="off" />
          </Field>
        </div>
        <Field label="Что внутри — по строке на предмет">
          <textarea rows={8} className={`${inputCls} resize-none`} value={d.contents} onChange={(e) => set({ contents: e.target.value })} placeholder={'Синяя шляпа в звёздочку\nУдлинитель 20 м\nПопоны для слонов'} />
        </Field>
        <Field label="Заметка">
          <input className={inputCls} value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="Грузить последним, хрупкое…" autoComplete="off" />
        </Field>
        {!isNew && (
          <Button full onClick={() => setAsking(true)}>
            Удалить контейнер
          </Button>
        )}
      </div>
      <Confirm
        open={asking}
        title={`Удалить контейнер №${d.number}?`}
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
