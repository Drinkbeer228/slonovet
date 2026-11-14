import { EDITORS, canEdit } from '../domain/access';
import { NewPurchaseSheet, requestPurchase } from './PurchasesView';
import { DeliverySheet, SackGauge } from './StockSheets';
import { useMemo, useState } from 'react';
import { countStock } from '../domain/actions';
import { currentShift } from '../domain/shift';
import { LOW_DAYS, LOW_DAYS_OPTIONS, STOCK_CATEGORIES, balances, categoryOf, countText, deleteBlocker, deliveries, lastCount, lowDays, orderHint, packWords, countWords, fmtNum, itemsWithoutQty, stockPerDay, stockView, type StockView } from '../domain/stock';
import type { CurrentUser, StockCategory, StockItem, StockMove } from '../domain/types';
import { ledger } from '../domain/stops';
import { newId, put, useRows } from '../lib/store';
import { localDay, plural, relDate, shortDate, timeOf } from '../lib/dates';
import { Button, Card, Chip, Confirm, Empty, Field, KEY, PAD, Plate, ReadOnlyNote, Section, Sheet, Stepper, TONE, inputCls, toast, GlowIcon } from '../ui/kit';
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

function Sacks({ v }: { v: StockView }) {
  return <SackGauge full={v.full} frac={v.openFrac} low={v.low} />;
}

export function StockScreen({ user }: { user: CurrentUser }) {
  const items = useRows('stock_items');
  const moves = useRows('stock_moves');
  const diets = useRows('diets');
  const shifts = useRows('shifts');
  const shiftId = currentShift(shifts)?.id ?? null;
  const [edit, setEdit] = useState<StockView | null>(null);
  const [incoming, setIncoming] = useState(false);
  const [buy, setBuy] = useState<{ itemId: string; amount: string } | null>(null);
  const purchases = useRows('purchases').filter((p) => !p.deleted && (p.status === 'new' || p.status === 'ordered'));
  const activeBuys = purchases.length;
  const counted = lastCount(moves);
  const countAge = counted ? Math.floor((Date.now() - Date.parse(counted.created_at)) / 86_400_000) : null;

  const views = useMemo(() => {
    const bal = balances(moves);
    const perDay = stockPerDay(items, diets, moves);
    return new Map(items.map((it) => [it.id, stockView(it, bal.get(it.id) ?? 0, perDay.get(it.id) ?? null)] as const));
  }, [items, moves, diets]);
  const noQty = useMemo(() => itemsWithoutQty(diets), [diets]);
  const low = [...views.values()].filter((v) => v.low).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  // ещё не в закупках — их можно попросить купить разом, «на неделю» по рациону
  const toBuy = low.filter((v) => !purchases.some((x) => x.item_id === v.item.id));
  const [buyAll, setBuyAll] = useState(false);
  const canWrite = canEdit('stock', user.role);
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3 px-1">
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight">Фураж</h1>
        </div>
        {/* на гастролях расхождения копятся: напоминаем, если давно не сверяли (правка остатка по тапу на позицию) */}
        <span className={`px-1 text-[13px] font-semibold ${countAge == null || countAge > 7 ? 'text-amber-fg' : 'text-muted'}`}>
          {counted ? `Остатки сверяли: ${relDate(localDay(counted.created_at))}, ${counted.author_name}` : 'Остатки ещё ни разу не сверяли'}
          {countAge == null || countAge > 7 ? ' — нажми на позицию и поправь, если на складе иначе' : ''}
        </span>
        {!canWrite && <ReadOnlyNote who={EDITORS.stock.who} />}
      </header>

      {low.length > 0 && (
        // предупреждение, не тревога: тонированное стекло без halo, шапка — значок в медальоне и слово
        <Plate glow="amber" className="flex flex-col p-4">
          <div className="flex items-center gap-3 pb-1">
            <GlowIcon glow="amber" icon="alert" />
            <span className="flex-1 text-[15px] font-extrabold text-amber-fg">Заканчивается</span>
            <span className="text-[13px] font-semibold text-muted">{low.length} {plural(low.length, 'позиция', 'позиции', 'позиций')}</span>
          </div>
          {/* одна кнопка на всё незаказанное, вместо стопки одинаковых; у строки — лёгкая ссылка, чтобы поправить количество */}
          {toBuy.length > 1 && (
            <Button full icon="box" className="mb-2 mt-1" onClick={() => setBuyAll(true)}>
              Всё в закупку · {toBuy.length}
            </Button>
          )}
          {low.map((v) => {
            const p = purchases.find((x) => x.item_id === v.item.id);
            const hint = orderHint(v);
            return (
              // строка целиком — «в закупку» (если ещё не просили); отдельной кнопки у каждой строки нет
              <button
                key={v.item.id}
                type="button"
                disabled={Boolean(p)}
                onClick={() => setBuy({ itemId: v.item.id, amount: hint?.text ?? '' })}
                className="flex w-full items-center gap-3 border-t border-edge py-2 text-left first:border-t-0 disabled:opacity-100"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-bold">
                    {v.item.name} — {v.balance <= 0 ? amountText(v) : daysText(v, false)}
                  </span>
                  <span className={`text-[13px] font-semibold ${p ? 'text-teal-fg' : 'text-muted'}`}>
                    {p
                      ? p.status === 'ordered'
                        ? `заказано${p.delivery_date ? ` · привезут ${shortDate(p.delivery_date)}` : ''}${p.amount ? ` · ${p.amount}` : ''}`
                        : `попросили купить${p.amount ? ` · ${p.amount}` : ''}`
                      : hint
                        ? `на неделю взять ≈ ${hint.text}`
                        : 'не заказано'}
                  </span>
                </span>
                {!p && <Icon name="next" size={18} className="shrink-0 text-teal-fg" />}
              </button>
            );
          })}
        </Plate>
      )}

      {/* закупки: что в работе — в «Задачах»; здесь только «Привезли» — разгрузили машину, приход на склад */}
      {canWrite && (
        <Section title="Закупки" aside={activeBuys ? `в работе: ${activeBuys} · в «Задачах»` : undefined}>
          <Button full icon="truck" onClick={() => setIncoming(true)}>
            Привезли
          </Button>
        </Section>
      )}

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
        <div>
          <Button icon="plus" full onClick={() => setAdding(true)}>
            Добавить позицию
          </Button>
        </div>
      )}

      <p className="m-0 px-1 text-[13px] font-semibold text-muted">
        {canWrite ? 'Нажми на позицию — поправить остаток, срок «заканчивается», название. ' : ''}Как списывается сам — в «Справке».
      </p>

      <Ledger moves={moves} items={items} />

      <AdjustSheet view={edit} user={user} shiftId={shiftId} onClose={() => setEdit(null)} />
      <AddItemSheet open={adding} items={items} user={user} shiftId={shiftId} onClose={() => setAdding(false)} />
      <DeliverySheet open={incoming} user={user} shiftId={shiftId} onClose={() => setIncoming(false)} />
      <NewPurchaseSheet open={buy !== null} preset={buy} user={user} onClose={() => setBuy(null)} />
      <Confirm
        open={buyAll}
        title={`В закупку: ${toBuy.length}`}
        text={toBuy.map((v) => `${v.item.name}${orderHint(v) ? ` — ≈ ${orderHint(v)!.text}` : ''}`).join(' · ')}
        okLabel="Попросить купить"
        onOk={async () => {
          for (const v of toBuy) await requestPurchase(user, { item_id: v.item.id, title: v.item.name, amount: orderHint(v)?.text ?? '' });
          toast(`Попросили купить: ${toBuy.length}`);
        }}
        onClose={() => setBuyAll(false)}
      />
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
  const [warn, setWarn] = useState(7);
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
    setWarn(lowDays(it));
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
            // 3 в базе — «по группе»; выбрали срок группы — так и храним
            if (warn !== lowDays(it)) next.low_days = warn === LOW_DAYS[categoryOf(it)] ? 3 : warn;
            if (next.name !== it.name || next.sack_kg !== it.sack_kg || next.kg_per_garets !== it.kg_per_garets || next.low_days !== it.low_days) await put('stock_items', next);
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
        <div className="flex flex-col gap-2 border-t border-edge pt-4">
          <span className="px-1 text-[14px] font-bold text-muted">«Заканчивается» — когда останется на</span>
          <div className="flex flex-wrap gap-2">
            {/* 3 дня — только там, где это срок группы (овощи): иначе 3 читалось бы как «по группе» */}
            {[...new Set([...LOW_DAYS_OPTIONS, LOW_DAYS[categoryOf(it)]])].sort((a, b) => a - b).map((d) => (
              <Chip key={d} on={warn === d} onClick={() => setWarn(d)}>
                {d} {plural(d, 'день', 'дня', 'дней')}
              </Chip>
            ))}
          </div>
        </div>
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
  // «+92 тюка», «+5 тюков»; у пересчёта — «пересчёт: 34 тюка»
  const unitFor = (n: number) => (it?.kind === 'count' ? plural(Math.round(Math.abs(n)), ...countWords(it.id, it.unit)) : 'кг');
  const unit = unitFor(Number(m.delta));
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-bold">{it?.name ?? m.item_id}</span>
        <span className="text-[12px] font-semibold text-muted">
          {m.counted != null ? `пересчёт: ${fmtNum(Number(m.counted))} ${unitFor(Number(m.counted))}` : (MOVE_LABEL[m.reason] ?? 'поправка')}
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

/** Поставка одной машиной: «15.10 10:00 · Кипер Поста №1 · 16 позиций», по тапу — что именно. */
function DeliveryGroup({ g, items }: { g: { at: string; author: string; moves: StockMove[] }; items: StockItem[] }) {
  const [open, setOpen] = useState(false);
  const recount = g.moves.every((m) => m.counted != null);
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-bold">
            {recount ? 'Пересчёт' : 'Поставка'} · {g.moves.length} {plural(g.moves.length, 'позиция', 'позиции', 'позиций')}
          </span>
          <span className="truncate text-[12px] font-semibold text-muted">
            {relDate(localDay(g.at))} {timeOf(g.at)} · {g.author} · {g.moves.map((m) => items.find((i) => i.id === m.item_id)?.name ?? m.item_id).join(', ')}
          </span>
        </span>
        <Icon name="down" size={18} className={`shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="divide-y divide-edge border-t border-edge">
          {g.moves.map((m) => (
            <LedgerRow key={m.id} m={m} items={items} />
          ))}
        </div>
      )}
    </Card>
  );
}

/** Сколько поставок показывать сразу — остальное по «Показать ещё». */
const LEDGER_PAGE = 20;

/**
 * «Привозили»: приходы и пересчёты за 30 дней; старше — свёрнуто по месяцам. От города в «Переезде» не зависит.
 * Не бухгалтерия: только чтобы помнить, что и когда привозили, и вовремя заказать.
 */
function Ledger({ moves, items }: { moves: StockMove[]; items: StockItem[] }) {
  const [more, setMore] = useState(false);
  const [archive, setArchive] = useState(false);
  const { start, current, archive: past } = ledger(moves);
  if (!current.length && !past.length) return null;
  // одна машина (приходы одного человека за пару часов) — одной строкой, позиции по тапу
  const groups = deliveries(current);
  const shown = more ? groups : groups.slice(0, LEDGER_PAGE);
  return (
    <Section id="stock-history" title="Привозили" aside={`за 30 дней, с ${shortDate(start)}`}>
      {groups.length ? (
        <div className="flex flex-col gap-2">
          {shown.map((g) => (g.moves.length === 1 ? <Card key={g.moves[0].id} className="overflow-hidden"><LedgerRow m={g.moves[0]} items={items} /></Card> : <DeliveryGroup key={g.moves[0].id} g={g} items={items} />))}
        </div>
      ) : (
        <Empty>За последние 30 дней ничего не привозили</Empty>
      )}
      {groups.length > LEDGER_PAGE && (
        <Button full onClick={() => setMore(!more)}>
          {more ? 'Свернуть' : `Показать ещё ${groups.length - LEDGER_PAGE}`}
        </Button>
      )}
      {past.length > 0 && (
        <>
          <Button full onClick={() => setArchive(!archive)}>
            {archive ? 'Скрыть' : `Раньше · ${past.reduce((n, g) => n + g.moves.length, 0)}`}
          </Button>
          {archive &&
            past.map((g) => (
              <div key={g.label} className="flex flex-col gap-1.5">
                <span className="px-1 text-[13px] font-extrabold text-muted">{g.label}</span>
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
