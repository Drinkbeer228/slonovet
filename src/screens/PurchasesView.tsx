import { useEffect, useState } from 'react';
import { canEdit } from '../domain/access';
import type { CurrentUser, Purchase, PurchaseStatus } from '../domain/types';
import { logEvent } from '../lib/log';
import { newId, put, useRows } from '../lib/store';
import { isoDate, relDate, shortDate, timeOf } from '../lib/dates';
import { addStockMove } from '../domain/actions';
import { currentShift } from '../domain/shift';
import { countWords, fmtNum } from '../domain/stock';
import { Button, Card, Check, Chip, DateInput, Empty, Field, Section, Sheet, inputCls, toast } from '../ui/kit';

const STATUS: Record<PurchaseStatus, { label: string; cls: string }> = {
  new: { label: 'ждёт', cls: 'text-amber' },
  ordered: { label: 'заказано', cls: 'text-teal' },
  done: { label: 'привезли', cls: 'text-muted' },
  cancelled: { label: 'отменено', cls: 'text-muted' },
};

const isActive = (p: Purchase) => p.status === 'new' || p.status === 'ordered';

/** Статус словами: «заказано · привезут 30.10». */
function statusText(p: Purchase) {
  if (p.status === 'ordered' && p.delivery_date) return `заказано · привезут ${shortDate(p.delivery_date)}`;
  return STATUS[p.status].label;
}

async function setStatus(p: Purchase, status: PurchaseStatus, user: CurrentUser, delivery?: string | null) {
  logEvent('purchase.status', { title: p.title.slice(0, 100), status, delivery: delivery ?? null });
  await put('purchases', {
    ...p,
    status,
    status_by: user.full_name,
    status_at: new Date().toISOString(),
    delivery_date: delivery === undefined ? (p.delivery_date ?? null) : delivery,
  });
  toast(`Отмечено: ${STATUS[status].label}`);
}

/** Первое число из «сколько»: «10 тюков» → 10. */
function firstNumber(text: string): string {
  const m = text.replace(',', '.').match(/\d+(\.\d+)?/);
  return m ? m[0].replace('.', ',') : '';
}

/** «Привезли» по позиции фуража: сразу зачислить приход, чтобы не вводить второй раз в «Фураже». */
function ArriveSheet({ purchase: p, user, onClose }: { purchase: Purchase | null; user: CurrentUser; onClose: () => void }) {
  const items = useRows('stock_items');
  const shifts = useRows('shifts');
  const [qty, setQty] = useState('');
  useEffect(() => {
    if (p) setQty(firstNumber(p.amount));
  }, [p]);
  if (!p) return null;
  const it = items.find((i) => i.id === p.item_id);
  const n = Number(qty.replace(',', '.')) || 0;
  const unit = !it ? '' : it.kind === 'kg' ? 'кг' : it.kind === 'sack' ? 'мешков' : countWords(it.id, it.unit)[2];
  const delta = !it ? 0 : it.kind === 'sack' ? n * (it.sack_kg ?? 0) : n;
  const finish = async (withStock: boolean) => {
    if (withStock && it && delta > 0) await addStockMove(it.id, delta, 'in', user, currentShift(shifts)?.id ?? null);
    await setStatus(p, 'done', user);
    if (withStock && it && delta > 0) toast(`${it.name}: +${fmtNum(n, it.kind === 'kg' ? 1 : 0)} ${unit} в фураж`);
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
        <Field label={`Сколько привезли, ${unit}`} hint={it.kind === 'sack' && it.sack_kg ? `мешок ${fmtNum(it.sack_kg)} кг` : undefined}>
          <input className={inputCls} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
        </Field>
      ) : (
        <p className="m-0 text-[15px] text-ink2">Этой позиции уже нет в фураже — заявка просто закроется.</p>
      )}
    </Sheet>
  );
}
const byNewest = (a: Purchase, b: Purchase) => (a.created_at < b.created_at ? 1 : -1);

/** Закупки целиком: что просили купить, что заказано, что уже привезли. Кнопка «Купить» — в шапке «Заявок». */
export function PurchasesView({ user, adding, onAddClose }: { user: CurrentUser; adding: boolean; onAddClose: () => void }) {
  const all = useRows('purchases');
  const [open, setOpen] = useState<Purchase | null>(null);
  const active = all.filter(isActive).sort((a, b) => Number(b.urgent) - Number(a.urgent) || byNewest(a, b));
  const closed = all.filter((p) => !isActive(p)).sort(byNewest).slice(0, 20);

  return (
    <div className="flex flex-col gap-6">
      <Section title="Активные" aside={active.length ? String(active.length) : undefined}>
        {active.length ? <PurchaseList list={active} user={user} onOpen={setOpen} /> : <Empty>Ничего не просили купить</Empty>}
      </Section>
      {closed.length > 0 && (
        <Section title="Закрытые">
          <PurchaseList list={closed} user={user} onOpen={setOpen} />
        </Section>
      )}
      <NewPurchaseSheet open={adding} user={user} onClose={onAddClose} />
      <PurchaseDetail purchase={open} user={user} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Для «Фуража»: только активные закупки и кнопка «Нужно купить». */
export function PurchasesBlock({ user }: { user: CurrentUser }) {
  const all = useRows('purchases');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Purchase | null>(null);
  const active = all.filter(isActive).sort((a, b) => Number(b.urgent) - Number(a.urgent) || byNewest(a, b));
  return (
    <Section title="Закупки" aside={active.length ? String(active.length) : undefined}>
      {active.length > 0 && <PurchaseList list={active} user={user} onOpen={setOpen} />}
      <Button icon="plus" full onClick={() => setCreating(true)}>
        Нужно купить
      </Button>
      <NewPurchaseSheet open={creating} user={user} onClose={() => setCreating(false)} />
      <PurchaseDetail purchase={open} user={user} onClose={() => setOpen(null)} />
    </Section>
  );
}

function PurchaseList({ list, user, onOpen }: { list: Purchase[]; user: CurrentUser; onOpen: (p: Purchase) => void }) {
  const buyer = canEdit('purchases', user.role);
  const [ordering, setOrdering] = useState<Purchase | null>(null);
  const [arriving, setArriving] = useState<Purchase | null>(null);
  const arrived = (p: Purchase) => (p.item_id ? setArriving(p) : setStatus(p, 'done', user));
  return (
    <Card className="divide-y divide-surface2 overflow-hidden">
      {list.map((p) => (
        <div key={p.id} className={`flex flex-col gap-2 px-4 py-3 ${isActive(p) ? '' : 'opacity-60'}`}>
          <button type="button" onClick={() => onOpen(p)} className="flex w-full flex-col gap-0.5 text-left">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-bold">
                {p.title}
                {p.amount && <span className="font-semibold text-ink2"> · {p.amount}</span>}
              </span>
              {p.urgent && isActive(p) && <span className="shrink-0 rounded-md bg-coral/15 px-1.5 py-0.5 text-[11px] font-bold text-coral">СРОЧНО</span>}
            </span>
            <span className="text-[12px] font-semibold text-muted">
              {p.author_name}, {relDate(p.created_at.slice(0, 10))}
            </span>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full bg-surface2 px-2.5 py-1 text-[12px] font-bold ${STATUS[p.status].cls}`}>{statusText(p)}</span>
            {buyer && p.status === 'new' && (
              <button type="button" onClick={() => setOrdering(p)} className="h-9 rounded-full border border-teal px-3.5 text-[13px] font-bold text-teal">
                Заказано
              </button>
            )}
            {buyer && isActive(p) && (
              <button type="button" onClick={() => arrived(p)} className="h-9 rounded-full border border-line px-3.5 text-[13px] font-bold text-ink2">
                Привезли
              </button>
            )}
          </div>
        </div>
      ))}
      <OrderSheet purchase={ordering} user={user} onClose={() => setOrdering(null)} />
      <ArriveSheet purchase={arriving} user={user} onClose={() => setArriving(null)} />
    </Card>
  );
}

/** «Заказано»: можно сразу указать, когда обещали привезти. */
function OrderSheet({ purchase: p, user, onClose }: { purchase: Purchase | null; user: CurrentUser; onClose: () => void }) {
  const [date, setDate] = useState('');
  useEffect(() => {
    if (p) setDate(p.delivery_date ?? '');
  }, [p]);
  if (!p) return null;
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
            await setStatus(p, 'ordered', user, date || null);
            onClose();
          }}
        >
          Заказано
        </Button>
      }
    >
      <Field label="Когда привезут" hint="можно не указывать">
        <DateInput value={date} onChange={setDate} min={isoDate()} label="Когда привезут" clearable />
      </Field>
    </Sheet>
  );
}

function NewPurchaseSheet({ open, user, onClose }: { open: boolean; user: CurrentUser; onClose: () => void }) {
  const items = useRows('stock_items');
  const [itemId, setItemId] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [amount, setAmount] = useState('');
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    if (open) {
      setItemId(null);
      setOther('');
      setAmount('');
      setUrgent(false);
    }
  }, [open]);

  const item = items.find((i) => i.id === itemId);
  const title = itemId === 'other' ? other.trim() : (item?.name ?? '');

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
              note: '',
              urgent,
              status: 'new',
              author_id: user.id,
              author_name: user.full_name,
              status_by: null,
              status_at: null,
              created_at: new Date().toISOString(),
            });
            toast('Заявка на закупку отправлена');
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
            {items.map((i) => (
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
        <Card className="overflow-hidden">
          <Check on={urgent} label="Срочно" sub="заканчивается совсем" onChange={setUrgent} />
        </Card>
      </div>
    </Sheet>
  );
}

function PurchaseDetail({ purchase: p, user, onClose }: { purchase: Purchase | null; user: CurrentUser; onClose: () => void }) {
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
        <span className="text-[14px] font-semibold text-muted">
          Попросил {p.author_name}, {relDate(p.created_at.slice(0, 10))} в {timeOf(p.created_at)}
          {p.urgent ? ' · срочно' : ''}
        </span>
        <span className={`text-[14px] font-bold ${STATUS[p.status].cls}`}>
          Сейчас: {statusText(p)}
          {p.status_by && p.status !== 'new' ? ` (${p.status_by}, ${relDate((p.status_at ?? p.updated_at).slice(0, 10))})` : ''}
        </span>
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
