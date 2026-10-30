import { useState } from 'react';
import { logEvent } from '../lib/log';
import { QUALITY, SUPPLIES, findSuppliers, supplierCities } from '../domain/suppliers';
import { currentStop } from '../domain/stops';
import type { CurrentUser, Supplier } from '../domain/types';
import { getRow, newId, put, remove, useRows } from '../lib/store';
import { Button, Card, Chip, Confirm, Empty, Field, Section, Sheet, inputCls, toast } from '../ui/kit';
import { Icon } from '../ui/Icon';

type Draft = Omit<Supplier, 'updated_at'>;
const blank = (city: string, user: CurrentUser): Draft => ({ id: newId(), city, name: '', supplies: [], phone: '', address: '', quality: null, note: '', created_by: user.full_name });

/**
 * Контакты по городам: Город · Что · Кто. Сено и овощи, ветеринар, ремонт, транспорт — возвращаемся в город через пару лет,
 * проверенный контакт под рукой. Текущий город (из «Переезда») — наверху; позвонить — одним нажатием.
 * В базе это таблица suppliers: из неё же «У кого» в закупке.
 */
export function SuppliersScreen({ user }: { user: CurrentUser }) {
  const list = useRows('suppliers');
  const here = currentStop(useRows('tour_stops'))?.city ?? null;
  const [query, setQuery] = useState('');
  const [city, setCity] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const canWrite = user.role !== 'vet';
  const cities = supplierCities(list, here);
  const found = findSuppliers(list, query, city, here);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3 px-1">
        <h1 className="m-0 text-[26px] font-extrabold tracking-tight">Контакты</h1>
        {canWrite && (
          <Button kind="accent" icon="plus" onClick={() => setEdit(blank(city ?? here ?? '', user))}>
            Добавить
          </Button>
        )}
      </header>
      <input className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск: сено, ветеринар, Казань, Иван…" aria-label="Поиск контакта" />
      {cities.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Chip on={!city} onClick={() => setCity(null)}>
            Все города
          </Chip>
          {cities.map((c) => (
            <Chip key={c} on={city === c} onClick={() => setCity(city === c ? null : c)}>
              {c}
              {c === here ? ' · сейчас' : ''}
            </Chip>
          ))}
        </div>
      )}
      {found.length === 0 ? (
        <Empty>{list.length ? 'Никого не нашли' : 'Пока никого. Нашли хороший контакт — сено, ветеринара, мастера — запишите, через год пригодится.'}</Empty>
      ) : (
        byCity(found).map(([c, group]) => (
          <Section key={c} title={c ? `${c}${c === here ? ' · сейчас здесь' : ''}` : 'Без города'} aside={String(group.length)}>
            <div className="flex flex-col gap-2.5">
              {group.map((s) => (
                <SupplierCard key={s.id} s={s} onEdit={canWrite ? () => setEdit({ ...s }) : undefined} />
              ))}
            </div>
          </Section>
        ))
      )}
      <SupplierSheet draft={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

/** Подряд идущие по городу — одной группой (порядок уже задан findSuppliers: текущий город первым). */
function byCity(list: Supplier[]): [string, Supplier[]][] {
  const out: [string, Supplier[]][] = [];
  for (const s of list) {
    const c = s.city.trim();
    const last = out[out.length - 1];
    if (last && last[0].toLowerCase() === c.toLowerCase()) last[1].push(s);
    else out.push([c, [s]]);
  }
  return out;
}

/** Карточка: что (крупно) → кто → адрес, заметка → позвонить. */
function SupplierCard({ s, onEdit }: { s: Supplier; onEdit?: () => void }) {
  const q = s.quality ? QUALITY[s.quality] : null;
  return (
    <Card className="flex flex-col gap-2 p-4">
      <button type="button" disabled={!onEdit} onClick={onEdit} className="flex flex-col gap-1 text-left disabled:opacity-100">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[17px] font-extrabold leading-tight text-teal-fg">{s.supplies.length ? s.supplies.join(', ') : 'Контакт'}</span>
          {q && <span className={`shrink-0 text-[13px] font-extrabold ${q.cls}`}>{q.label}</span>}
        </span>
        <span className="text-[16px] font-bold">{s.name || 'Без имени'}</span>
        {s.address && <span className="text-[14px] text-ink2">{s.address}</span>}
        {s.note && <span className="text-[14px] text-ink2">{s.note}</span>}
      </button>
      {s.phone.trim() && (
        <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-edge-hi bg-surface2 text-[15px] font-extrabold text-teal-fg">
          <Icon name="phone" size={16} />
          {s.phone}
        </a>
      )}
    </Card>
  );
}

function SupplierSheet({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const [d, setD] = useState<Draft | null>(null);
  const [asking, setAsking] = useState(false);
  if (draft && d?.id !== draft.id) setD(draft);
  if (!draft || !d) return null;
  const isNew = !getRow('suppliers', d.id);
  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const save = async () => {
    logEvent('supplier.save', { city: d.city.trim(), name: d.name.trim().slice(0, 80) });
    await put('suppliers', { ...d, city: d.city.trim(), name: d.name.trim(), phone: d.phone.trim(), address: d.address.trim(), note: d.note.trim() });
    toast('Сохранено');
    setD(null);
    onClose();
  };
  return (
    <Sheet
      open
      onClose={() => {
        setD(null);
        onClose();
      }}
      title={isNew ? 'Новый контакт' : d.name || 'Контакт'}
      footer={
        <Button kind="primary" big full disabled={!d.name.trim() || !d.city.trim()} onClick={save}>
          Сохранить
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Город">
          <input className={inputCls} value={d.city} onChange={(e) => set({ city: e.target.value })} placeholder="Казань" autoComplete="off" />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Что</span>
          <div className="flex flex-wrap gap-2">
            {SUPPLIES.map((x) => (
              <Chip key={x} on={d.supplies.includes(x)} onClick={() => set({ supplies: d.supplies.includes(x) ? d.supplies.filter((y) => y !== x) : [...d.supplies, x] })}>
                {x}
              </Chip>
            ))}
          </div>
        </div>
        <Field label="Кто">
          <input className={inputCls} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="КФХ Петров, ветеринар Иван Сергеевич" autoComplete="off" />
        </Field>
        <Field label="Телефон">
          <input className={inputCls} value={d.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" placeholder="+7 900 000-00-00" autoComplete="off" />
        </Field>
        <Field label="Адрес или как найти">
          <input className={inputCls} value={d.address} onChange={(e) => set({ address: e.target.value })} autoComplete="off" />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Как себя показал</span>
          <div className="flex flex-wrap gap-2">
            {([3, 2, 1] as const).map((q) => (
              <Chip key={q} on={d.quality === q} onClick={() => set({ quality: d.quality === q ? null : q })}>
                {QUALITY[q].label}
              </Chip>
            ))}
          </div>
        </div>
        <Field label="Заметка">
          <textarea rows={2} className={`${inputCls} resize-none`} value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="Тюки сухие, привозит сам, цена…" />
        </Field>
        {!isNew && (
          <Button full onClick={() => setAsking(true)}>
            Удалить
          </Button>
        )}
      </div>
      <Confirm
        open={asking}
        title="Удалить контакт?"
        text={`${d.name}, ${d.city}. Контакт пропадёт у всех.`}
        okLabel="Удалить"
        onOk={async () => {
          await remove('suppliers', d.id);
          toast('Удалено');
          setD(null);
          onClose();
        }}
        onClose={() => setAsking(false)}
      />
    </Sheet>
  );
}
