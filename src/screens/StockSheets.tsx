import { useEffect, useState } from 'react';
import { canEdit } from '../domain/access';
import { addStockMove, arrivePurchase, setPurchaseStatus } from '../domain/actions';
import { STOCK_CATEGORIES, categoryOf, countWords, fmtNum } from '../domain/stock';
import type { CurrentUser, Purchase, StockItem } from '../domain/types';
import { logEvent } from '../lib/log';
import { getRows, useRows } from '../lib/store';
import { Button, Card, Check, Chip, PAD, Sheet, Stepper, TONE, inputCls, toast } from '../ui/kit';
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
const sortItems = (items: StockItem[]) =>
  [...items].sort((a, b) => STOCK_CATEGORIES.findIndex((c) => c.id === categoryOf(a)) - STOCK_CATEGORIES.findIndex((c) => c.id === categoryOf(b)) || a.sort - b.sort);

/** Крупы и каши мешками (не овощи, не штучные «мешки для мусора»). */
const isSacks = (it: StockItem) => it.kind === 'sack' && Boolean(it.sack_kg) && categoryOf(it) !== 'veg';

/** «Батарейка» открытого мешка — как заряд телефона, четвертями. */
export function Battery({ frac, low = false, small = false }: { frac: number; low?: boolean; small?: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  return (
    <span className="flex items-center gap-1" role="img" aria-label={`Открытый мешок заполнен на ${pct}%`}>
      <span className={`relative overflow-hidden rounded-md ${small ? 'h-4 w-10' : 'h-6 w-16'} ${TONE.sunken}`}>
        <span className={`absolute inset-y-0 left-0 ${low ? PAD.amber : PAD.teal}`} style={{ width: `${pct}%` }} />
        {[25, 50, 75].map((t) => (
          <span key={t} className="absolute inset-y-0 w-px bg-bg/60" style={{ left: `${t}%` }} />
        ))}
      </span>
      <span className={`${small ? 'h-2 w-0.5' : 'h-2.5 w-1'} rounded-r-sm bg-track`} />
    </span>
  );
}

/** Мешки как на складе: полные — столбиками (до 5, дальше «+N»), открытый — батарейкой. */
export function SackGauge({ full, frac, low = false, small = false }: { full: number; frac: number; low?: boolean; small?: boolean }) {
  const shown = Math.min(full, 5);
  return (
    <span className={`flex items-center ${small ? 'gap-1' : 'gap-1.5'}`}>
      {Array.from({ length: shown }).map((_, i) => (
        <span key={i} className={`${small ? 'h-4 w-3 rounded-[3px]' : 'h-6 w-4 rounded-[4px]'} ${low ? PAD.amber : PAD.teal}`} aria-hidden="true" />
      ))}
      {full > shown && <span className="text-[12px] font-bold text-muted">+{full - shown}</span>}
      {(frac > 0 || full === 0) && <Battery frac={frac} low={low} small={small} />}
    </span>
  );
}

/** Строка «позиция — сколько»: поле числа и единица справа (мешки при поставке — кнопками −/+, целыми). */
function AmountRow({ it, value, onChange, hint }: { it: StockItem; value: string; onChange: (v: string) => void; hint?: string }) {
  if (isSacks(it))
    return (
      <div className="flex min-h-11 items-center gap-3 px-4 py-2">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-bold">{it.name}</span>
          {hint && <span className="text-[12px] font-semibold text-muted">{hint}</span>}
        </span>
        <Stepper label={`${it.name}: мешков`} value={Math.round(num(value))} onChange={(n) => onChange(String(n))} />
        <span className="w-14 shrink-0 text-[13px] font-semibold text-muted">мешков</span>
      </div>
    );
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
    // сначала то, что ждём: заказанное и «попросили купить» — позиция и количество из закупки (часто привозят без отметки «заказано»)
    const ordered = getRows('purchases').filter((p) => !p.deleted && (p.status === 'ordered' || p.status === 'new') && p.item_id);
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
              return <AmountRow key={it.id} it={it} value={qty[it.id] ?? ''} onChange={(v) => setQty({ ...qty, [it.id]: v })} hint={p ? `${p.status === 'ordered' ? 'заказано' : 'просили'}: ${p.amount || 'без количества'}` : undefined} />;
            })}
          </Card>
        ) : (
          <p className="m-0 px-1 text-[14px] font-semibold text-muted">Ничего не ждём — отметь, что привезли:</p>
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
              <Chip
                key={it.id}
                on={false}
                onClick={() => {
                  // количество — из закупки, если она есть
                  const p = byItem(it.id);
                  if (p && !qty[it.id]) setQty({ ...qty, [it.id]: firstNumber(p.amount) });
                  setRows([...rows, it.id]);
                }}
              >
                + {it.name}
              </Chip>
            ))}
          </div>
        </div>
        {!closer && purchases.some((p) => p.status === 'ordered') && (
          <p className="m-0 px-1 text-[13px] font-semibold text-muted">Приход запишется сразу, закупку закроют отдельно.</p>
        )}
      </div>
    </Sheet>
  );
}
