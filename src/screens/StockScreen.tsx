import { EDITORS, canEdit } from '../domain/access';
import { PurchasesBlock } from './PurchasesView';
import { useMemo, useState } from 'react';
import { addStockMove, countStock } from '../domain/actions';
import { currentShift } from '../domain/shift';
import { STOCK_CATEGORIES, toStockUnits, balances, categoryOf, countText, deleteBlocker, packWords, countWords, fmtNum, itemsWithoutQty, stockPerDay, stockView, type StockView } from '../domain/stock';
import type { CurrentUser, StockCategory, StockItem, StockMove } from '../domain/types';
import { currentStop, ledger } from '../domain/stops';
import { newId, put, useRows } from '../lib/store';
import { localDay, plural, relDate, shortDate, timeOf } from '../lib/dates';
import { Button, Card, Chip, Confirm, Empty, Field, KEY, PAD, Plate, ReadOnlyNote, Section, Sheet, Stepper, TONE, inputCls, toast } from '../ui/kit';
import { Icon } from '../ui/Icon';

const MOVE_LABEL: Partial<Record<string, string>> = { in: 'приход', fix: 'поправка', waste: 'брак', extra: 'вне рациона' };

const FRACTIONS = [
  { v: 0, label: 'пусто' },
  { v: 0.25, label: '¼' },
  { v: 0.5, label: '½' },
  { v: 0.75, label: '¾' },
  { v: 1, label: 'полный' },
];

function fracLabel(f: number) {
  if (f < 0.15) return 'на дне';
  if (f < 0.375) return '¼';
  if (f < 0.625) return '½';
  if (f < 0.875) return '¾';
  return 'почти полный';
}

function amountText(v: StockView) {
  const { item, balance } = v;
  // минус — списали больше, чем внесли: приход или пересчёт не записан
  if (balance < -0.05) return `минус ${fmtNum(-balance, item.kind === 'count' ? 0 : 1)} ${item.kind === 'count' ? countWords(item.id, item.unit)[2] : 'кг'} — не внесён приход?`;
  if (balance <= 0) return 'закончилось';
  if (item.kind === 'count') return `${fmtNum(balance, 0)} ${plural(Math.round(balance), ...countWords(item.id, item.unit))}`;
  if (item.kind === 'sack' && item.sack_kg) {
    const parts = [];
    if (categoryOf(item) === 'veg') return `${fmtNum(balance)} кг · ${countText(balance / item.sack_kg, packWords(item))}`;
    if (v.full > 0) parts.push(`${v.full} ${plural(v.full, ...packWords(item))}`);
    if (v.openFrac > 0) parts.push(v.full > 0 ? `+ ${fracLabel(v.openFrac)}` : `${fracLabel(v.openFrac)} мешка`);
    return parts.join(' ');
  }
  return `${fmtNum(balance)} кг`;
}

function daysText(v: StockView, noQty: boolean) {
  // корма нет совсем — «на сколько хватит» не пишем, «закончилось» уже сказано в остатке
  if (v.balance <= 0) return '';
  if (v.daysLeft == null) return noQty ? 'расход появится после первых выдач' : '';
  if (v.daysLeft < 1) return 'меньше дня';
  const d = Math.floor(v.daysLeft);
  return `≈ ${d} ${plural(d, 'день', 'дня', 'дней')}`;
}

/** «Батарейка» открытого мешка */
function Battery({ frac, low }: { frac: number; low: boolean }) {
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  return (
    <div className="flex items-center gap-1" role="img" aria-label={`Открытый мешок заполнен на ${pct}%`}>
      <div className={`relative h-6 w-16 overflow-hidden rounded-md ${TONE.sunken}`}>
        <div className={`absolute inset-y-0 left-0 ${low ? PAD.amber : PAD.teal}`} style={{ width: `${pct}%` }} />
        {[25, 50, 75].map((t) => (
          <span key={t} className="absolute inset-y-0 w-px bg-bg/60" style={{ left: `${t}%` }} />
        ))}
      </div>
      <span className="h-2.5 w-1 rounded-r-sm bg-track" />
    </div>
  );
}

function Sacks({ v }: { v: StockView }) {
  const shown = Math.min(v.full, 5);
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: shown }).map((_, i) => (
        <span key={i} className={`h-6 w-4 rounded-[4px] ${v.low ? PAD.amber : PAD.teal}`} aria-hidden="true" />
      ))}
      {v.full > shown && <span className="text-[12px] font-bold text-muted">+{v.full - shown}</span>}
      {(v.openFrac > 0 || v.full === 0) && <Battery frac={v.openFrac} low={v.low} />}
    </div>
  );
}

export function StockScreen({ user }: { user: CurrentUser }) {
  const items = useRows('stock_items');
  const moves = useRows('stock_moves');
  const diets = useRows('diets');
  const shifts = useRows('shifts');
  const shiftId = currentShift(shifts)?.id ?? null;
  const [edit, setEdit] = useState<StockView | null>(null);
  const [incoming, setIncoming] = useState(false);

  const views = useMemo(() => {
    const bal = balances(moves);
    const perDay = stockPerDay(items, diets, moves);
    return new Map(items.map((it) => [it.id, stockView(it, bal.get(it.id) ?? 0, perDay.get(it.id) ?? null)] as const));
  }, [items, moves, diets]);
  const noQty = useMemo(() => itemsWithoutQty(diets), [diets]);
  const low = [...views.values()].filter((v) => v.low).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  const canWrite = canEdit('stock', user.role);
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3 px-1">
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight">Фураж</h1>
          {canWrite && (
            <Button kind="light" icon="truck" onClick={() => setIncoming(true)}>
              Привезли
            </Button>
          )}
        </div>
        {!canWrite && <ReadOnlyNote who={EDITORS.stock.who} />}
      </header>

      {low.length > 0 && (
        <Plate glow="amber" halo className="flex flex-col gap-1 p-4" data-tour="stock-low">
          <span className="text-[12px] font-extrabold tracking-wide text-amber-fg">ЗАКАНЧИВАЕТСЯ</span>
          {low.map((v) => (
            <span key={v.item.id} className="text-[15px] font-bold">
              {v.item.name} — {v.balance <= 0 ? amountText(v) : daysText(v, false)}
            </span>
          ))}
        </Plate>
      )}

      <div data-tour="purchases">
        <PurchasesBlock user={user} />
      </div>

      {STOCK_CATEGORIES.map((g) => {
        const ids = items
          .filter((i) => categoryOf(i) === g.id)
          .sort((a, b) => a.sort - b.sort)
          .map((i) => i.id);
        if (!ids.length) return null;
        return (
          <Section key={g.id} id={`stock-${g.id}`} title={g.title}>
            <Card className="divide-y divide-edge overflow-hidden">
              {ids.map((id) => {
                const v = views.get(id);
                if (!v) return null;
                return (
                  <button key={id} type="button" disabled={!canWrite} onClick={() => setEdit(v)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-[15px] font-bold">{v.item.name}</span>
                      <span className={`text-[13px] font-semibold ${v.low ? 'text-amber' : 'text-muted'}`}>
                        {amountText(v)}
                        {daysText(v, noQty.has(id)) && ` · ${daysText(v, noQty.has(id))}`}
                      </span>
                    </span>
                    {v.item.kind === 'sack' ? (
                      <Sacks v={v} />
                    ) : (
                      <span className={`text-[20px] font-extrabold ${v.low ? 'text-amber' : ''}`}>{fmtNum(v.balance, v.item.kind === 'count' ? 0 : 1)}</span>
                    )}
                  </button>
                );
              })}
            </Card>
          </Section>
        );
      })}

      {canWrite && (
        <div data-tour="stock-add">
          <Button icon="plus" full onClick={() => setAdding(true)}>
            Добавить позицию
          </Button>
        </div>
      )}

      <p className="m-0 px-1 text-[13px] font-semibold leading-relaxed text-muted">
        Каши и зерно из рациона списываются сами, когда кипер отмечает кормление. Сено — по числу выданных тюков, овощи — по рациону в 19:00, мешки — по счётчику «Мешков взяли». Фрукты и овощи на манеже и шоу — «Вне рациона» в дежурстве, остальные расхождения — поправка остатка.
        {canWrite && ' Нажми на позицию, чтобы поправить остаток, переименовать или удалить.'}
      </p>

      <Ledger moves={moves} items={items} />

      <AdjustSheet view={edit} user={user} shiftId={shiftId} onClose={() => setEdit(null)} />
      <AddItemSheet open={adding} items={items} user={user} shiftId={shiftId} onClose={() => setAdding(false)} />
      <IncomingSheet open={incoming} items={items} user={user} shiftId={shiftId} onClose={() => setIncoming(false)} />
    </div>
  );
}

function AdjustSheet({ view, user, shiftId, onClose }: { view: StockView | null; user: CurrentUser; shiftId: string | null; onClose: () => void }) {
  const diets = useRows('diets');
  const it = view?.item;
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [full, setFull] = useState(0);
  const [frac, setFrac] = useState(0);
  const [value, setValue] = useState('');
  const [sackKg, setSackKg] = useState('');
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  // остаток трогали — значит, пересчитали; иначе (переименовали) пересчёт не записываем
  const [counted, setCounted] = useState(false);

  if (view && it && openedFor !== it.id) {
    setOpenedFor(it.id);
    setCounted(false);
    setFull(view.full);
    setFrac(FRACTIONS.reduce((a, b) => (Math.abs(b.v - view.openFrac) < Math.abs(a.v - view.openFrac) ? b : a)).v);
    setValue(String(Math.round(view.balance * 10) / 10));
    setSackKg(String(it.sack_kg ?? ''));
    setName(it.name);
  }
  const close = () => {
    setOpenedFor(null);
    onClose();
  };
  if (!view || !it) return null;

  // овощи и фрукты поправляют в кг (мешки не «открывают»), крупы — мешками
  const veg = categoryOf(it) === 'veg';
  const byKg = veg || it.kind !== 'sack' || !it.sack_kg;
  const num = (v: string) => Number(v.replace(',', '.')) || 0;
  const target = byKg ? num(value) : (full + frac) * it.sack_kg!;
  const bump = (d: number) => {
    setCounted(true);
    setValue(String(Math.max(0, Math.round((num(value) + d) * 10) / 10)).replace('.', ','));
  };
  return (
    <Sheet
      open
      onClose={close}
      title={it.name}
      footer={
        <Button
          kind="primary"
          big
          full
          onClick={async () => {
            // пересчёт — факт «на складе столько»: остаток дальше считается от него, а не от того, что видел телефон
            if (counted) await countStock(it.id, target, user, shiftId);
            // название и настройки — одной записью, чтобы одно не затёрло другое
            const next: StockItem = { ...it, name: name.trim() || it.name };
            if (it.kind === 'sack' && num(sackKg)) next.sack_kg = num(sackKg);
            if (next.name !== it.name || next.sack_kg !== it.sack_kg || next.kg_per_garets !== it.kg_per_garets) await put('stock_items', next);
            toast('Сохранено');
            close();
          }}
        >
          Сохранить
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {veg ? (
          <div className="flex flex-col gap-2">
            <Field label="Сейчас, кг" hint={it.sack_kg ? `≈ ${countText(num(value) / it.sack_kg, packWords(it))} по ${fmtNum(it.sack_kg)} кг` : undefined}>
              <input className={inputCls} type="text" inputMode="decimal" value={value} onChange={(e) => {
                  setCounted(true);
                  setValue(e.target.value);
                }} />
            </Field>
            <div className="grid grid-cols-4 gap-1.5">
              {[-10, -5, 5, 10].map((d) => (
                <button key={d} type="button" onClick={() => bump(d)} className={`h-11 rounded-xl text-[15px] font-bold text-ink ${KEY}`}>
                  {d > 0 ? '+' : '−'}
                  {Math.abs(d)} кг
                </button>
              ))}
            </div>
          </div>
        ) : !byKg ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[15px] font-bold">Полных мешков</span>
              <Stepper
                label="Полных мешков"
                value={full}
                onChange={(v) => {
                  setCounted(true);
                  setFull(v);
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[15px] font-bold">Открытый мешок</span>
              <div className="grid grid-cols-5 gap-1.5">
                {FRACTIONS.map((f) => (
                  <button
                    key={f.v}
                    type="button"
                    aria-pressed={frac === f.v}
                    onClick={() => {
                      setCounted(true);
                      setFrac(f.v);
                    }}
                    className={`flex h-20 flex-col items-center justify-end gap-1.5 rounded-xl border pb-2 text-[13px] font-bold transition-transform active:scale-[0.97] ${
                      frac === f.v ? 'border-teal/60 bg-[color-mix(in_srgb,var(--color-teal)_var(--tint),transparent)] text-ink shadow-(--shadow-key-on)' : 'border-edge bg-well text-muted shadow-(--shadow-well)'
                    }`}
                  >
                    <span className={`relative h-9 w-6 overflow-hidden rounded-[5px] ${TONE.sunken}`}>
                      <span className={`absolute inset-x-0 bottom-0 ${PAD.teal}`} style={{ height: `${f.v * 100}%` }} />
                    </span>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-[13px] font-semibold text-muted">
              ≈ {fmtNum(target)} кг · мешок {fmtNum(it.sack_kg ?? 0)} кг
            </span>
          </>
        ) : (
          <Field label={it.kind === 'count' ? `Сейчас ${countWords(it.id, it.unit)[2]}` : 'Сейчас, кг'}>
            <input className={inputCls} type="text" inputMode="decimal" value={value} onChange={(e) => {
                  setCounted(true);
                  setValue(e.target.value);
                }} />
          </Field>
        )}
        {it.kind === 'sack' && (
          <div className="grid grid-cols-2 gap-3 border-t border-edge pt-4">
            <Field label={`Вес: 1 ${packWords(it)[0]}, кг`}>
              <input className={inputCls} type="text" inputMode="decimal" value={sackKg} onChange={(e) => setSackKg(e.target.value)} />
            </Field>
          </div>
        )}
        <div className="flex flex-col gap-3 border-t border-edge pt-4">
          <Field label="Название">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {deleteBlocker(it, diets) ? (
            <p className="m-0 px-1 text-[13px] font-semibold text-muted">{deleteBlocker(it, diets)}</p>
          ) : (
            <Button icon="trash" onClick={() => setConfirmDelete(true)}>
              Удалить позицию
            </Button>
          )}
        </div>
      </div>
      <Confirm
        open={confirmDelete}
        title={`Удалить «${it.name}»?`}
        text="Позиция пропадёт из фуража у всех. История приходов останется."
        okLabel="Удалить"
        danger
        onOk={async () => {
          await put('stock_items', { ...it, deleted: true });
          toast(`${it.name} удалена`);
          close();
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </Sheet>
  );
}

function IncomingSheet({
  open,
  items,
  user,
  shiftId,
  onClose,
}: {
  open: boolean;
  items: StockItem[];
  user: CurrentUser;
  shiftId: string | null;
  onClose: () => void;
}) {
  const sorted = [...items].sort((a, b) => a.sort - b.sort);
  const [itemId, setItemId] = useState('hay');
  const [qty, setQty] = useState(1);
  const [kg, setKg] = useState('');
  const it = sorted.find((i) => i.id === itemId);
  // килограммы и штуки вписывают числом (мешков для мусора бывает 25 и 50 в пачке), мешки корма — кнопками
  const typed = it?.kind === 'kg' || it?.kind === 'count';
  const isKg = it?.kind === 'kg';
  const typedNum = Number(kg.replace(',', '.')) || 0;
  const amount = !it ? 0 : toStockUnits(it, typed ? typedNum : qty);
  const unitWord = !it ? '' : it.kind === 'count' ? plural(Math.round(typedNum), ...countWords(it.id, it.unit)) : plural(qty, ...packWords(it));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Привезли фураж"
      footer={
        <Button
          kind="primary"
          big
          full
          disabled={!amount}
          onClick={async () => {
            if (!it) return;
            await addStockMove(it.id, amount, 'in', user, shiftId);
            toast(`${it.name}: +${isKg ? `${fmtNum(amount)} кг` : it.kind === 'count' ? `${fmtNum(amount, 0)} ${unitWord}` : `${qty} ${unitWord}`}`);
            setQty(1);
            setKg('');
            onClose();
          }}
        >
          Добавить
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          {sorted.map((i) => (
            <button
              key={i.id}
              type="button"
              aria-pressed={i.id === itemId}
              onClick={() => setItemId(i.id)}
              className={`h-11 rounded-xl border px-3.5 text-[14px] font-bold transition-transform active:scale-[0.97] ${
                i.id === itemId ? 'border-teal/60 bg-[color-mix(in_srgb,var(--color-teal)_var(--tint),transparent)] text-ink shadow-(--shadow-key-on)' : 'border-edge bg-well text-ink2 shadow-(--shadow-well)'
              }`}
            >
              {i.name}
            </button>
          ))}
        </div>
        {typed ? (
          <Field label={isKg ? 'Сколько, кг' : `Сколько, ${countWords(it!.id, it!.unit)[2]}`}>
            <input className={inputCls} type="text" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} />
          </Field>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] font-bold">
              {qty} {unitWord}
              {it?.kind === 'sack' && it.sack_kg ? <span className="ml-2 text-[13px] text-muted">≈ {fmtNum(amount)} кг</span> : null}
            </span>
            <Stepper label="Количество" value={qty} min={1} onChange={setQty} />
          </div>
        )}
        <span className="flex items-center gap-2 text-[13px] font-semibold text-muted">
          <Icon name="user" size={16} />
          Запишется от имени: {user.full_name}
        </span>
      </div>
    </Sheet>
  );
}

const KINDS: { id: StockItem['kind']; label: string; hint: string }[] = [
  { id: 'count', label: 'Штуки', hint: 'тюки, упаковки, банки' },
  { id: 'kg', label: 'Килограммы', hint: 'на развес' },
  { id: 'sack', label: 'Мешки', hint: 'с весом мешка' },
];
const UNITS = ['шт.', 'упак.', 'тюк', 'банка', 'ведро', 'пучок'];

/** Новая позиция фуража: группа, название, как считаем, сколько есть. */
function AddItemSheet({
  open,
  items,
  user,
  shiftId,
  onClose,
}: {
  open: boolean;
  items: StockItem[];
  user: CurrentUser;
  shiftId: string | null;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<StockCategory>('feed');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<StockItem['kind']>('count');
  const [unit, setUnit] = useState('шт.');
  const [sackKg, setSackKg] = useState('');
  const [qty, setQty] = useState('');
  const [openedAt, setOpenedAt] = useState(false);

  if (open && !openedAt) {
    setOpenedAt(true);
    setCategory('feed');
    setName('');
    setKind('count');
    setUnit('шт.');
    setSackKg('');
    setQty('');
  }
  if (!open && openedAt) setOpenedAt(false);

  const num = (v: string) => Number(v.replace(',', '.')) || 0;
  const taken = items.some((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase());
  const ready = name.trim() && !taken && (kind !== 'sack' || num(sackKg) > 0);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Новая позиция"
      footer={
        <Button
          kind="primary"
          big
          full
          disabled={!ready}
          onClick={async () => {
            const id = newId();
            const item: Omit<StockItem, 'updated_at'> = {
              id,
              name: name.trim(),
              category,
              kind,
              unit: kind === 'count' ? unit : 'кг',
              sack_kg: kind === 'sack' ? num(sackKg) : null,
              kg_per_garets: null,
              low_days: 3,
              sort: Math.max(0, ...items.map((i) => i.sort)) + 1,
            };
            await put('stock_items', item);
            // сколько есть сейчас — первой поправкой, чтобы остаток сразу был виден
            const have = kind === 'sack' ? num(qty) * num(sackKg) : num(qty);
            if (have > 0) await countStock(id, have, user, shiftId);
            toast(`Добавлено: ${item.name}`);
            onClose();
          }}
        >
          Добавить
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Группа</span>
          <div className="flex flex-wrap gap-2">
            {STOCK_CATEGORIES.filter((c) => c.id !== 'other').map((c) => (
              <Chip key={c.id} on={category === c.id} onClick={() => setCategory(c.id)}>
                {c.title}
              </Chip>
            ))}
          </div>
        </div>
        <Field label="Название" hint={taken ? 'такая позиция уже есть' : undefined}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Яблоки" />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Как считаем</span>
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                aria-pressed={kind === k.id}
                onClick={() => setKind(k.id)}
                className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-center transition-transform active:scale-[0.97] ${
                  kind === k.id ? 'border-teal/60 bg-[color-mix(in_srgb,var(--color-teal)_var(--tint),transparent)] text-ink shadow-(--shadow-key-on)' : 'border-edge bg-well text-muted shadow-(--shadow-well)'
                }`}
              >
                <span className="text-[14px] font-bold">{k.label}</span>
                <span className="text-[11px] font-semibold">{k.hint}</span>
              </button>
            ))}
          </div>
        </div>
        {kind === 'count' && (
          <div className="flex flex-wrap gap-2">
            {UNITS.map((u) => (
              <Chip key={u} on={unit === u} onClick={() => setUnit(u)}>
                {u}
              </Chip>
            ))}
          </div>
        )}
        {kind === 'sack' && (
          <Field label="Вес одного мешка, кг">
            <input className={inputCls} inputMode="decimal" value={sackKg} onChange={(e) => setSackKg(e.target.value)} placeholder="Например: 25" />
          </Field>
        )}
        <Field label={kind === 'sack' ? 'Сколько полных мешков есть' : kind === 'kg' ? 'Сколько кг есть' : `Сколько есть, ${unit}`} hint="можно не писать">
          <input className={inputCls} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
        </Field>
      </div>
    </Sheet>
  );
}

/** Одна строка ленты: что, сколько, когда, кто. */
function LedgerRow({ m, items }: { m: StockMove; items: StockItem[] }) {
  const it = items.find((i) => i.id === m.item_id);
  const unit = it?.kind === 'count' ? countWords(it.id, it.unit)[2] : 'кг';
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-bold">{it?.name ?? m.item_id}</span>
        <span className="text-[12px] font-semibold text-muted">
          {m.counted != null ? `пересчёт: ${fmtNum(Number(m.counted))} ${unit}` : (MOVE_LABEL[m.reason] ?? 'поправка')}
          {m.note ? `: ${m.note}` : ''} · {relDate(localDay(m.created_at))} {timeOf(m.created_at)} · {m.author_name}
        </span>
      </span>
      <span className={`text-[15px] font-extrabold ${Number(m.delta) > 0 ? 'text-teal' : 'text-ink2'}`}>
        {Number(m.delta) > 0 ? '+' : '−'}
        {fmtNum(Math.abs(Number(m.delta)))} {unit}
      </span>
    </div>
  );
}

/** Сколько строк показывать сразу — остальное по «Показать ещё». */
const LEDGER_PAGE = 20;

/**
 * «Привозили»: приходы и пересчёты текущего города (с дня приезда); прошлые города — свёрнутым архивом.
 * Не бухгалтерия: только чтобы помнить, что и когда привозили, и вовремя заказать.
 */
function Ledger({ moves, items }: { moves: StockMove[]; items: StockItem[] }) {
  const stops = useRows('tour_stops');
  const [more, setMore] = useState(false);
  const [archive, setArchive] = useState(false);
  const { start, current, archive: past } = ledger(moves, stops);
  const here = currentStop(stops);
  if (!current.length && !past.length) return null;
  const shown = more ? current : current.slice(0, LEDGER_PAGE);
  return (
    <Section id="stock-history" title="Привозили" aside={here ? `${here.city} · с ${shortDate(here.arrive_on)}` : `с ${shortDate(start)}`}>
      {current.length ? (
        <Card className="divide-y divide-edge overflow-hidden">
          {shown.map((m) => (
            <LedgerRow key={m.id} m={m} items={items} />
          ))}
        </Card>
      ) : (
        <Empty>{here ? `С ${shortDate(here.arrive_on)} пока ничего` : 'За последние 30 дней ничего'}</Empty>
      )}
      {current.length > LEDGER_PAGE && (
        <Button full onClick={() => setMore(!more)}>
          {more ? 'Свернуть' : `Показать ещё ${current.length - LEDGER_PAGE}`}
        </Button>
      )}
      {past.length > 0 && (
        <>
          <Button full onClick={() => setArchive(!archive)}>
            {archive ? 'Скрыть архив' : `Архив прошлых гастролей · ${past.reduce((n, g) => n + g.moves.length, 0)}`}
          </Button>
          {archive &&
            past.map((g) => (
              <div key={g.stop?.id ?? '_before'} className="flex flex-col gap-1.5">
                <span className="px-1 text-[13px] font-extrabold text-muted">
                  {g.stop ? `${g.stop.city} · ${shortDate(g.stop.arrive_on)}${g.stop.depart_on ? `–${shortDate(g.stop.depart_on)}` : ''}` : 'Раньше'}
                </span>
                <Card className="divide-y divide-edge overflow-hidden">
                  {g.moves.map((m) => (
                    <LedgerRow key={m.id} m={m} items={items} />
                  ))}
                </Card>
              </div>
            ))}
        </>
      )}
    </Section>
  );
}
