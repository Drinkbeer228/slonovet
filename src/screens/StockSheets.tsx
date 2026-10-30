import { useEffect, useState } from 'react';
import { canEdit } from '../domain/access';
import { addStockMove, arrivePurchase, countStock, setPurchaseStatus } from '../domain/actions';
import { STOCK_CATEGORIES, balances, categoryOf, countWords, fmtNum } from '../domain/stock';
import type { CurrentUser, Purchase, StockItem } from '../domain/types';
import { logEvent } from '../lib/log';
import { getRows, useRows } from '../lib/store';
import { Button, Card, Check, Chip, Sheet, inputCls, toast } from '../ui/kit';
import { firstNumber } from './PurchasesView';

/**
 * В чём человек считает позицию: крупы — мешками, овощи и развес — кг, сено и мешки для мусора — штуками.
 * На складе всё хранится в кг или штуках — переводим туда и обратно.
 */
export function unitOf(it: StockItem): { label: string; toStock: (n: number) => number; fromStock: (b: number) => number } {
  if (it.kind === 'sack' && it.sack_kg && categoryOf(it) !== 'veg') {
    const kg = it.sack_kg;
    return { label: 'мешков', toStock: (n) => n * kg, fromStock: (b) => b / kg };
  }
  if (it.kind === 'count') return { label: countWords(it.id, it.unit)[2], toStock: (n) => n, fromStock: (b) => b };
  return { label: 'кг', toStock: (n) => n, fromStock: (b) => b };
}

const num = (s: string) => Number(s.replace(',', '.')) || 0;
const show = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const sortItems = (items: StockItem[]) =>
  [...items].sort((a, b) => STOCK_CATEGORIES.findIndex((c) => c.id === categoryOf(a)) - STOCK_CATEGORIES.findIndex((c) => c.id === categoryOf(b)) || a.sort - b.sort);

/** Строка «позиция — сколько»: поле числа и единица справа. */
function AmountRow({ it, value, onChange, hint }: { it: StockItem; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3 px-4 py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-bold">{it.name}</span>
        {hint && <span className="text-[12px] font-semibold text-muted">{hint}</span>}
      </span>
      {/* поле — своей колонкой: общий inputCls растягивает на всю ширину и налезал на название */}
      <span className="w-24 shrink-0">
        <input
          className={`${inputCls} h-11 text-right`}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          aria-label={`${it.name}, ${unitOf(it).label}`}
          placeholder="0"
        />
      </span>
      <span className="w-14 shrink-0 text-[13px] font-semibold text-muted">{unitOf(it).label}</span>
    </label>
  );
}

/**
 * «Привезли» — вся машина одной шторкой: у каждой позиции сколько привезли. Заказанное подставляется само
 * (позиция и количество из закупки); закупку закрывает тот, кто вправе отмечать «Привезли» (администратор, директор).
 */
export function DeliverySheet({ open, user, shiftId, onClose }: { open: boolean; user: CurrentUser; shiftId: string | null; onClose: () => void }) {
  const items = useRows('stock_items').filter((i) => !i.deleted);
  const purchases = useRows('purchases').filter((p) => !p.deleted && (p.status === 'ordered' || p.status === 'new'));
  const closer = canEdit('purchases', user.role);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<string[]>([]);
  const [freeDone, setFreeDone] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    // сначала заказанное: позиция и количество из закупки
    const ordered = getRows('purchases').filter((p) => !p.deleted && p.status === 'ordered' && p.item_id);
    setQty(Object.fromEntries(ordered.map((p) => [p.item_id!, firstNumber(p.amount)])));
    setRows([...new Set(ordered.map((p) => p.item_id!))]);
    setFreeDone([]);
  }, [open]);
  if (!open) return null;

  const byItem = (id: string) => purchases.find((p) => p.item_id === id && p.status === 'ordered') ?? purchases.find((p) => p.item_id === id);
  const free = purchases.filter((p) => !p.item_id && p.status === 'ordered');
  const shown = sortItems(items.filter((i) => rows.includes(i.id)));
  const rest = sortItems(items.filter((i) => !rows.includes(i.id)));
  const filled = shown.filter((i) => num(qty[i.id] ?? '') > 0);

  const save = async () => {
    setBusy(true);
    try {
      for (const it of filled) {
        const n = num(qty[it.id]);
        const stock = unitOf(it).toStock(n);
        const p = byItem(it.id);
        // закупку закрывает приход «по закупке» — тот же id при повторном нажатии, без задвоения
        if (p && closer) await arrivePurchase(p, it, it.kind === 'sack' && it.sack_kg ? stock / it.sack_kg : stock, user, shiftId);
        else await addStockMove(it.id, stock, 'in', user, shiftId);
      }
      if (closer) for (const p of free.filter((x) => freeDone.includes(x.id))) await setPurchaseStatus(p as Purchase, 'done', user);
      logEvent('stock.delivery', { items: filled.length, purchases: freeDone.length });
      toast(`Записано: ${filled.map((i) => `${i.name} +${fmtNum(num(qty[i.id]))}`).join(', ') || 'закупки закрыты'}`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Привезли"
      footer={
        <Button kind="primary" big full disabled={busy || (!filled.length && !freeDone.length)} onClick={save}>
          Записать{filled.length ? ` · ${filled.length}` : ''}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {shown.length > 0 ? (
          <Card className="divide-y divide-edge overflow-hidden">
            {shown.map((it) => {
              const p = byItem(it.id);
              return <AmountRow key={it.id} it={it} value={qty[it.id] ?? ''} onChange={(v) => setQty({ ...qty, [it.id]: v })} hint={p ? `заказано: ${p.amount || 'без количества'}` : undefined} />;
            })}
          </Card>
        ) : (
          <p className="m-0 px-1 text-[14px] font-semibold text-muted">Заказанного нет. Отметь, что привезли:</p>
        )}
        {free.length > 0 && closer && (
          <Card className="divide-y divide-edge overflow-hidden">
            {free.map((p) => (
              <Check key={p.id} on={freeDone.includes(p.id)} label={p.title} sub={`заказано${p.amount ? `: ${p.amount}` : ''} · закрыть закупку`} onChange={(v) => setFreeDone(v ? [...freeDone, p.id] : freeDone.filter((x) => x !== p.id))} />
            ))}
          </Card>
        )}
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Ещё привезли</span>
          <div className="flex flex-wrap gap-2">
            {rest.map((it) => (
              <Chip key={it.id} on={false} onClick={() => setRows([...rows, it.id])}>
                + {it.name}
              </Chip>
            ))}
          </div>
        </div>
        {!closer && purchases.some((p) => p.status === 'ordered') && (
          <p className="m-0 px-1 text-[13px] font-semibold text-muted">Приход запишется сразу. Закупку закроет администратор или директор.</p>
        )}
      </div>
    </Sheet>
  );
}

/**
 * Пересчёт склада одной шторкой: прошёл, посмотрел, поправил цифры. В поле — сколько сейчас по приложению;
 * записываются только изменённые позиции (как «пересчёт» — остаток дальше считается от него).
 */
export function RecountSheet({ open, user, shiftId, onClose }: { open: boolean; user: CurrentUser; shiftId: string | null; onClose: () => void }) {
  const items = useRows('stock_items').filter((i) => !i.deleted);
  const [val, setVal] = useState<Record<string, string>>({});
  const [start, setStart] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const bal = balances(getRows('stock_moves'));
    const now = Object.fromEntries(getRows('stock_items').map((it) => [it.id, show(Math.max(0, unitOf(it).fromStock(bal.get(it.id) ?? 0)))]));
    setVal(now);
    setStart(now);
  }, [open]);
  if (!open) return null;

  const sorted = sortItems(items);
  const changed = sorted.filter((it) => (val[it.id] ?? '') !== (start[it.id] ?? ''));
  const save = async () => {
    setBusy(true);
    try {
      for (const it of changed) await countStock(it.id, unitOf(it).toStock(num(val[it.id] ?? '0')), user, shiftId);
      logEvent('stock.recount', { items: changed.length });
      toast(changed.length ? `Пересчёт записан: ${changed.length}` : 'Всё сошлось');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Пересчёт склада"
      footer={
        <Button kind="primary" big full disabled={busy} onClick={save}>
          {changed.length ? `Записать · ${changed.length}` : 'Всё сошлось'}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 px-1 text-[13px] font-semibold text-muted">В полях — сколько сейчас по приложению. Поправь, где на складе иначе. Крупы — мешками: «3,75» = 3 полных и ¾.</p>
        <Card className="divide-y divide-edge overflow-hidden">
          {sorted.map((it) => (
            <AmountRow key={it.id} it={it} value={val[it.id] ?? ''} onChange={(v) => setVal({ ...val, [it.id]: v })} hint={(val[it.id] ?? '') !== (start[it.id] ?? '') ? `было ${start[it.id]}` : undefined} />
          ))}
        </Card>
      </div>
    </Sheet>
  );
}
