import { useEffect, useState } from 'react';
import { canEdit } from '../domain/access';
import type { CurrentUser, Purchase, PurchaseStatus } from '../domain/types';
import { logEvent } from '../lib/log';
import { newId, put, useRows } from '../lib/store';
import { relDate, timeOf } from '../lib/dates';
import { Button, Card, Check, Chip, Empty, Field, Section, Sheet, inputCls, toast } from '../ui/kit';

const STATUS: Record<PurchaseStatus, { label: string; cls: string }> = {
  new: { label: 'ждёт', cls: 'text-amber' },
  ordered: { label: 'заказано', cls: 'text-teal' },
  done: { label: 'привезли', cls: 'text-muted' },
  cancelled: { label: 'отменено', cls: 'text-muted' },
};

const isActive = (p: Purchase) => p.status === 'new' || p.status === 'ordered';
const byNewest = (a: Purchase, b: Purchase) => (a.created_at < b.created_at ? 1 : -1);

/** Закупки целиком: что просили купить, что заказано, что уже привезли. */
export function PurchasesView({ user }: { user: CurrentUser }) {
  const all = useRows('purchases');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Purchase | null>(null);
  const active = all.filter(isActive).sort((a, b) => Number(b.urgent) - Number(a.urgent) || byNewest(a, b));
  const closed = all.filter((p) => !isActive(p)).sort(byNewest).slice(0, 20);

  return (
    <div className="flex flex-col gap-6">
      <Button kind="primary" big full icon="plus" onClick={() => setCreating(true)}>
        Нужно купить
      </Button>
      <Section title="Активные" aside={active.length ? String(active.length) : undefined}>
        {active.length ? <PurchaseList list={active} onOpen={setOpen} /> : <Empty>Ничего не просили купить</Empty>}
      </Section>
      {closed.length > 0 && (
        <Section title="Закрытые">
          <PurchaseList list={closed} onOpen={setOpen} />
        </Section>
      )}
      <NewPurchaseSheet open={creating} user={user} onClose={() => setCreating(false)} />
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
      {active.length > 0 && <PurchaseList list={active} onOpen={setOpen} />}
      <Button icon="plus" full onClick={() => setCreating(true)}>
        Нужно купить
      </Button>
      <NewPurchaseSheet open={creating} user={user} onClose={() => setCreating(false)} />
      <PurchaseDetail purchase={open} user={user} onClose={() => setOpen(null)} />
    </Section>
  );
}

function PurchaseList({ list, onOpen }: { list: Purchase[]; onOpen: (p: Purchase) => void }) {
  return (
    <Card className="divide-y divide-surface2 overflow-hidden">
      {list.map((p) => (
        <button key={p.id} type="button" onClick={() => onOpen(p)} className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left ${isActive(p) ? '' : 'opacity-60'}`}>
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[15px] font-bold">
              {p.title}
              {p.amount && <span className="font-semibold text-ink2"> · {p.amount}</span>}
            </span>
            <span className={`shrink-0 text-[13px] font-bold ${STATUS[p.status].cls}`}>
              {p.urgent && isActive(p) && <span className="mr-2 rounded-md bg-coral/15 px-1.5 py-0.5 text-[11px] text-coral">СРОЧНО</span>}
              {STATUS[p.status].label}
            </span>
          </span>
          <span className="text-[12px] font-semibold text-muted">
            {p.author_name}, {relDate(p.created_at.slice(0, 10))}
          </span>
        </button>
      ))}
    </Card>
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
  if (!p) return null;
  const buyer = canEdit('purchases', user.role);
  const mine = p.author_id === user.id;
  const setStatus = async (status: PurchaseStatus) => {
    logEvent('purchase.status', { title: p.title.slice(0, 100), status });
    await put('purchases', { ...p, status, status_by: user.full_name, status_at: new Date().toISOString() });
    toast(status === 'done' && p.item_id ? 'Привезли. Внесите приход в «Фураж» → «Привезли»' : `Отмечено: ${STATUS[status].label}`);
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
              <Button kind="primary" big full onClick={() => setStatus('ordered')}>
                Заказано
              </Button>
            )}
            {buyer && active && (
              <Button kind={p.status === 'ordered' ? 'primary' : 'light'} big full onClick={() => setStatus('done')}>
                Привезли
              </Button>
            )}
            {active && (
              <Button full onClick={() => setStatus('cancelled')}>
                Отменить
              </Button>
            )}
            {buyer && !active && (
              <Button full onClick={() => setStatus('new')}>
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
          Сейчас: {STATUS[p.status].label}
          {p.status_by && p.status !== 'new' ? ` (${p.status_by}, ${relDate((p.status_at ?? p.updated_at).slice(0, 10))})` : ''}
        </span>
        {!buyer && <span className="text-[13px] font-semibold text-muted">«Заказано» и «Привезли» отмечает администратор или директор.</span>}
      </div>
    </Sheet>
  );
}
