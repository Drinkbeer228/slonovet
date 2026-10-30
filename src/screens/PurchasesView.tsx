import { useEffect, useState } from 'react';
import { canEdit } from '../domain/access';
import type { CurrentUser, Purchase, PurchaseStatus, Supplier } from '../domain/types';
import { logEvent } from '../lib/log';
import { newId, put, useRows } from '../lib/store';
import { isoDate, localDay, relDate, shortDate, timeOf } from '../lib/dates';
import { arrivePurchase, setPurchaseStatus } from '../domain/actions';
import { currentShift } from '../domain/shift';
import { currentStop } from '../domain/stops';
import { QUALITY, suppliersFor } from '../domain/suppliers';
import { categoryOf, countWords, fmtNum, packWords, toStockUnits } from '../domain/stock';
import { Button, Card, Check, Chip, DateInput, Field, KEY, Section, Sheet, UrgentBadge, inputCls, toast } from '../ui/kit';

const STATUS: Record<PurchaseStatus, { label: string; cls: string }> = {
  new: { label: 'ждёт', cls: 'text-ink2' },
  // янтарный — состояние «заказано, едет» (цвет типа «Закупки» — фиолетовый, на доске)
  ordered: { label: 'заказано', cls: 'text-amber' },
  done: { label: 'привезли', cls: 'text-muted' },
  cancelled: { label: 'отменено', cls: 'text-muted' },
};

const isActive = (p: Purchase) => p.status === 'new' || p.status === 'ordered';

/** Статус словами: «заказано · привезут 30.10». */
function statusText(p: Purchase) {
  if (p.status === 'ordered' && p.delivery_date) return `заказано · привезут ${shortDate(p.delivery_date)}`;
  return STATUS[p.status].label;
}

async function setStatus(p: Purchase, status: PurchaseStatus, user: CurrentUser, delivery?: string | null, supplierId?: string | null) {
  await setPurchaseStatus(p, status, user, delivery, supplierId);
  toast(`Отмечено: ${STATUS[status].label}`);
}

/** Первое число из «сколько»: «10 тюков» → 10. */
function firstNumber(text: string): string {
  const m = text.replace(',', '.').match(/\d+(\.\d+)?/);
  return m ? m[0].replace('.', ',') : '';
}

/** «Привезли» по позиции фуража: сразу зачислить приход, чтобы не вводить второй раз в «Фураже». */
export function ArriveSheet({ purchase: p, user, onClose }: { purchase: Purchase | null; user: CurrentUser; onClose: () => void }) {
  const items = useRows('stock_items');
  const shifts = useRows('shifts');
  const [qty, setQty] = useState('');
  useEffect(() => {
    if (p) setQty(firstNumber(p.amount));
  }, [p]);
  if (!p) return null;
  const it = items.find((i) => i.id === p.item_id);
  const n = Number(qty.replace(',', '.')) || 0;
  const unit = !it ? '' : it.kind === 'kg' ? 'кг' : it.kind === 'sack' ? packWords(it)[2] : countWords(it.id, it.unit)[2];
  const delta = it ? toStockUnits(it, n) : 0;
  const finish = async (withStock: boolean) => {
    const added = await arrivePurchase(p, withStock ? it : undefined, n, user, currentShift(shifts)?.id ?? null);
    toast(added > 0 && it ? `${it.name}: +${fmtNum(n, it.kind === 'kg' ? 1 : 0)} ${unit} в фураж` : `Отмечено: ${STATUS.done.label}`);
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Привезли: ${p.title}`}
      footer={
        <div className="flex flex-col gap-2">
          <Button kind="primary" big full disabled={!it || delta <= 0} onClick={() => finish(true)}>
            Зачислить в фураж
          </Button>
          <Button full onClick={() => finish(false)}>
            Без прихода
          </Button>
        </div>
      }
    >
      {it ? (
        <div className="flex flex-col gap-2">
          <Field label={`Сколько привезли, ${unit}`} hint={it.kind === 'sack' && it.sack_kg ? `мешок ${fmtNum(it.sack_kg)} кг` : undefined}>
            <input className={inputCls} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
          </Field>
          {it.kind === 'sack' && /кг|килог/i.test(p.amount) && (
            <span className="text-[13px] font-semibold text-amber-fg">
              В заявке «{p.amount}», а здесь считаем мешками — проверьте число.
            </span>
          )}
        </div>
      ) : (
        <p className="m-0 text-[15px] text-ink2">Этой позиции уже нет в фураже — заявка просто закроется.</p>
      )}
    </Sheet>
  );
}

/**
 * Для «Фуража»: кнопка «Нужно купить» — сразу форма в шторке. Сам список закупок с «Заказано» и «Привезли»
 * живёт на доске «Задачи» → «Закупки», здесь не дублируем — только сколько в работе.
 */
export function PurchasesBlock({ user }: { user: CurrentUser }) {
  const active = useRows('purchases').filter(isActive).length;
  const [creating, setCreating] = useState(false);
  return (
    <Section title="Закупки" aside={active ? `в работе: ${active} · в «Задачах»` : undefined}>
      <Button icon="plus" full onClick={() => setCreating(true)}>
        Нужно купить
      </Button>
      <NewPurchaseSheet open={creating} user={user} onClose={() => setCreating(false)} />
    </Section>
  );
}

/** Одна закупка: что, сколько, кто просил, состояние и кнопки закупщика. Общая для «Фуража» и доски «Задачи». */
export function PurchaseRow({
  p,
  buyer,
  onOpen,
  onOrder,
  onArrive,
  className = '',
}: {
  p: Purchase;
  buyer: boolean;
  onOpen: (p: Purchase) => void;
  onOrder: (p: Purchase) => void;
  onArrive: (p: Purchase) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${isActive(p) ? '' : 'text-ink2'} ${className}`}>
      <button type="button" onClick={() => onOpen(p)} className="flex w-full flex-col gap-0.5 text-left">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[15px] font-bold">
            {p.title}
            {p.amount && <span className="font-semibold text-ink2"> · {p.amount}</span>}
          </span>
          {p.urgent && isActive(p) && <UrgentBadge />}
        </span>
        {p.note && <span className="text-[13px] font-medium text-ink2">{p.note}</span>}
        <span className="text-[13px] font-semibold text-muted">
          {p.author_name}, {relDate(localDay(p.created_at))}
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border border-edge-hi bg-surface2 px-2.5 py-1 text-[13px] font-bold shadow-[inset_0_1px_0_var(--color-hl)] ${STATUS[p.status].cls}`}>{statusText(p)}</span>
        <SupplierName id={p.supplier_id} />
        {buyer && p.status === 'new' && (
          <button type="button" onClick={() => onOrder(p)} className="h-11 rounded-full border border-teal/50 bg-[color-mix(in_srgb,var(--color-teal)_var(--tint),transparent)] px-4 text-[14px] font-bold text-teal-fg shadow-(--shadow-key-on) transition-transform active:scale-[0.97]">
            Заказано
          </button>
        )}
        {buyer && isActive(p) && (
          <button type="button" onClick={() => onArrive(p)} className={`h-11 rounded-full px-4 text-[14px] font-bold text-ink ${KEY}`}>
            Привезли
          </button>
        )}
      </div>
    </div>
  );
}

/** В карточке закупки: у кого заказали и кнопка звонка. */
function SupplierLine({ id }: { id: string | null | undefined }) {
  const s = useSupplier(id);
  if (!s) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1 text-[15px] font-semibold">
        У кого: {s.name}
        {s.city ? <span className="text-muted"> · {s.city}</span> : null}
      </span>
      {s.phone && (
        <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`} className={`inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-bold text-teal-fg ${KEY}`}>
          Позвонить
        </a>
      )}
    </div>
  );
}

/** Поставщик закупки: имя (удалённого не показываем). */
function useSupplier(id: string | null | undefined): Supplier | undefined {
  const list = useRows('suppliers');
  return id ? list.find((s) => s.id === id && !s.deleted) : undefined;
}

function SupplierName({ id }: { id: string | null | undefined }) {
  const s = useSupplier(id);
  return s ? <span className="text-[13px] font-semibold text-muted">у {s.name}</span> : null;
}

/** «Заказано»: можно сразу указать, у кого и когда обещали привезти. */
export function OrderSheet({ purchase: p, user, onClose }: { purchase: Purchase | null; user: CurrentUser; onClose: () => void }) {
  const [date, setDate] = useState('');
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const suppliers = useRows('suppliers');
  const items = useRows('stock_items');
  const here = currentStop(useRows('tour_stops'))?.city ?? null;
  useEffect(() => {
    if (p) {
      setDate(p.delivery_date ?? '');
      setSupplierId(p.supplier_id ?? null);
    }
  }, [p]);
  if (!p) return null;
  const item = items.find((i) => i.id === p.item_id);
  const offer = suppliersFor(suppliers, item ? categoryOf(item) : null, here);
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Заказано: ${p.title}`}
      footer={
        <Button
          kind="primary"
          big
          full
          onClick={async () => {
            await setStatus(p, 'ordered', user, date || null, supplierId);
            onClose();
          }}
        >
          Заказано
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {offer.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="px-1 text-[14px] font-bold text-muted">У кого{here ? ` · ${here}` : ''} — можно не указывать</span>
            <div className="flex flex-wrap gap-2">
              {offer.map((s) => (
                <Chip key={s.id} on={supplierId === s.id} onClick={() => setSupplierId(supplierId === s.id ? null : s.id)}>
                  {s.name}
                  {s.quality && <span className={`ml-1.5 text-[12px] ${QUALITY[s.quality].cls}`}>{QUALITY[s.quality].label}</span>}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <Field label="Когда привезут" hint="можно не указывать">
          <DateInput value={date} onChange={setDate} min={isoDate()} label="Когда привезут" clearable />
        </Field>
      </div>
    </Sheet>
  );
}

export function NewPurchaseSheet({ open, user, onClose }: { open: boolean; user: CurrentUser; onClose: () => void }) {
  const items = useRows('stock_items');
  const [itemId, setItemId] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    if (open) {
      setItemId(null);
      setOther('');
      setAmount('');
      setNote('');
      setUrgent(false);
    }
  }, [open]);

  const item = items.find((i) => i.id === itemId);
  const title = itemId === 'other' ? other.trim() : (item?.name ?? '');
  const sorted = [...items].sort((a, b) => a.sort - b.sort);
  const produce = sorted.filter((i) => categoryOf(i) === 'veg');

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Нужно купить"
      footer={
        <Button
          kind="primary"
          big
          full
          disabled={!title}
          onClick={async () => {
            logEvent('purchase.create', { title: title.slice(0, 100), amount: amount.trim().slice(0, 60), urgent });
            await put('purchases', {
              id: newId(),
              item_id: item ? item.id : null,
              title,
              amount: amount.trim(),
              note: note.trim(),
              urgent,
              status: 'new',
              author_id: user.id,
              author_name: user.full_name,
              status_by: null,
              status_at: null,
              created_at: new Date().toISOString(),
            });
            toast('Попросили купить');
            onClose();
          }}
        >
          Попросить купить
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Что</span>
          <div className="flex flex-wrap gap-2">
            {sorted
              .filter((i) => categoryOf(i) !== 'veg')
              .map((i) => (
                <Chip key={i.id} on={itemId === i.id} onClick={() => setItemId(i.id)}>
                  {i.name}
                </Chip>
              ))}
          </div>
          <span className="px-1 pt-1 text-[13px] font-bold text-muted">Овощи и фрукты</span>
          <div className="flex flex-wrap gap-2">
            {produce.map((i) => (
              <Chip key={i.id} on={itemId === i.id} onClick={() => setItemId(i.id)}>
                {i.name}
              </Chip>
            ))}
            <Chip on={itemId === 'other'} onClick={() => setItemId('other')}>
              Другое
            </Chip>
          </div>
        </div>
        {itemId === 'other' && (
          <Field label="Что купить">
            <input className={inputCls} value={other} onChange={(e) => setOther(e.target.value)} placeholder="Например: соль-лизунец" />
          </Field>
        )}
        <Field label="Сколько" hint="можно не писать">
          <input className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Например: 10 мешков" />
        </Field>
        <Field label="Примечание" hint="можно не писать">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: сено луговое" />
        </Field>
        <Card className="overflow-hidden">
          <Check on={urgent} label="Срочно" sub="заканчивается совсем" onChange={setUrgent} />
        </Card>
        <p className="m-0 px-1 text-[14px] font-semibold text-muted">Закажет администратор или директор — отметят «Заказано» и «Привезли».</p>
      </div>
    </Sheet>
  );
}

export function PurchaseDetail({ purchase: p, user, onClose }: { purchase: Purchase | null; user: CurrentUser; onClose: () => void }) {
  const [ordering, setOrdering] = useState(false);
  const [arriving, setArriving] = useState(false);
  if (!p) return null;
  const buyer = canEdit('purchases', user.role);
  const mine = p.author_id === user.id;
  const mark = async (status: PurchaseStatus) => {
    await setStatus(p, status, user);
    onClose();
  };
  const active = isActive(p);

  return (
    <Sheet
      open
      onClose={onClose}
      title={p.title}
      footer={
        (buyer || (mine && active)) && (
          <div className="flex flex-col gap-2">
            {buyer && p.status === 'new' && (
              <Button kind="primary" big full onClick={() => setOrdering(true)}>
                Заказано
              </Button>
            )}
            {buyer && active && (
              <Button kind={p.status === 'ordered' ? 'primary' : 'light'} big full onClick={() => (p.item_id ? setArriving(true) : mark('done'))}>
                Привезли
              </Button>
            )}
            {active && (
              <Button full onClick={() => mark('cancelled')}>
                Отменить
              </Button>
            )}
            {buyer && !active && (
              <Button full onClick={() => mark('new')}>
                Вернуть в работу
              </Button>
            )}
          </div>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {p.amount && <p className="m-0 text-[16px] font-semibold">Сколько: {p.amount}</p>}
        {p.note && <p className="m-0 text-[15px] text-ink2">{p.note}</p>}
        <span className="text-[14px] font-semibold text-muted">
          Попросил {p.author_name}, {relDate(localDay(p.created_at))} в {timeOf(p.created_at)}
          {p.urgent ? ' · срочно' : ''}
        </span>
        <span className={`text-[14px] font-bold ${STATUS[p.status].cls}`}>
          Сейчас: {statusText(p)}
          {p.status_by && p.status !== 'new' ? ` (${p.status_by}, ${relDate(localDay(p.status_at ?? p.updated_at))})` : ''}
        </span>
        <SupplierLine id={p.supplier_id} />
        {!buyer && <span className="text-[13px] font-semibold text-muted">«Заказано» и «Привезли» отмечает администратор или директор.</span>}
      </div>
      <ArriveSheet
        purchase={arriving ? p : null}
        user={user}
        onClose={() => {
          setArriving(false);
          onClose();
        }}
      />
      <OrderSheet
        purchase={ordering ? p : null}
        user={user}
        onClose={() => {
          setOrdering(false);
          onClose();
        }}
      />
    </Sheet>
  );
}
