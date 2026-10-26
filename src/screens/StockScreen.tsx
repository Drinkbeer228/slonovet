import { EDITORS, canEdit } from '../domain/access';
import { PurchasesBlock } from './PurchasesView';
import { useMemo, useState } from 'react';
import { addStockMove } from '../domain/actions';
import { currentShift } from '../domain/shift';
import { STOCK_CATEGORIES, balances, categoryOf, countText, deleteBlocker, packWords, pickWords, countPerDay, countWords, dailyUsage, fmtNum, itemsWithoutQty, stockView, weighedPerDay, type StockView } from '../domain/stock';
import type { CurrentUser, StockCategory, StockItem } from '../domain/types';
import { newId, put, useRows } from '../lib/store';
import { plural, relDate, timeOf } from '../lib/dates';
import { Button, Card, Chip, Confirm, Field, ReadOnlyNote, Section, Sheet, Stepper, inputCls, toast } from '../ui/kit';
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
  if (balance <= 0) return 'закончилось';
  if (item.kind === 'count') return `${fmtNum(balance, 0)} ${plural(Math.round(balance), ...countWords(item.id, item.unit))}`;
  if (item.kind === 'sack' && item.sack_kg) {
    const parts = [];
    if (item.pick_unit) return `${fmtNum(balance)} кг · ${countText(balance / item.sack_kg, packWords(item))}`;
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
      <div className="relative h-6 w-16 overflow-hidden rounded-md border-2 border-track">
        <div className={`absolute inset-y-0 left-0 ${low ? 'bg-dot1' : 'bg-teal'}`} style={{ width: `${pct}%` }} />
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
        <span key={i} className={`h-6 w-4 rounded-[4px] ${v.low ? 'bg-dot1' : 'bg-teal'}`} aria-hidden="true" />
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
    const usage = dailyUsage(diets, items);
    const noQtyIds = itemsWithoutQty(diets);
    const perDay = (it: StockItem) => {
      if (it.kind === 'count') return countPerDay(moves, it.id) || null;
      if (noQtyIds.has(it.id)) return weighedPerDay(moves, it.id) || null;
      return usage.get(it.id) ?? null;
    };
    return new Map(items.map((it) => [it.id, stockView(it, bal.get(it.id) ?? 0, perDay(it))] as const));
  }, [items, moves, diets]);
  const noQty = useMemo(() => itemsWithoutQty(diets), [diets]);
  const low = [...views.values()].filter((v) => v.low).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  const history = [...moves]
    .filter((m) => m.reason === 'in' || m.reason === 'fix' || m.reason === 'waste' || m.reason === 'extra')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 15);
  const nameOf = (id: string) => items.find((i) => i.id === id)?.name ?? id;
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
        <Card className="flex flex-col gap-1 p-4 ring-1 ring-amber/40">
          <span className="text-[12px] font-extrabold tracking-wide text-amber">ЗАКАНЧИВАЕТСЯ</span>
          {low.map((v) => (
            <span key={v.item.id} className="text-[15px] font-bold">
              {v.item.name} — {v.balance <= 0 ? 'закончилось' : daysText(v, false)}
            </span>
          ))}
        </Card>
      )}

      <PurchasesBlock user={user} />

      {STOCK_CATEGORIES.map((g) => {
        const ids = items
          .filter((i) => categoryOf(i) === g.id)
          .sort((a, b) => a.sort - b.sort)
          .map((i) => i.id);
        if (!ids.length) return null;
        return (
          <Section key={g.id} title={g.title}>
            <Card className="divide-y divide-surface2 overflow-hidden">
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
        <Button icon="plus" full onClick={() => setAdding(true)}>
          Добавить позицию
        </Button>
      )}

      <p className="m-0 px-1 text-[13px] font-semibold leading-relaxed text-muted">
        Каши и зерно из рациона списываются сами, когда кипер отмечает кормление. Сено — по числу выданных тюков, овощи — сетками в 19:00 (по рациону, кипер поправляет), мешки — по счётчику «Мешков взяли». Фрукты и овощи на манеже и шоу — «Вне рациона» в дежурстве, гниль — «Списать брак» в карточке.
        {canWrite && ' Нажми на позицию, чтобы поправить остаток, переименовать или удалить.'}
      </p>

      {history.length > 0 && (
        <Section title="Приход, выдачи и брак">
          <Card className="divide-y divide-surface2 overflow-hidden">
            {history.map((m) => {
              const it = items.find((i) => i.id === m.item_id);
              const unit = it?.kind === 'count' ? countWords(it.id, it.unit)[2] : 'кг';
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[14px] font-bold">{nameOf(m.item_id)}</span>
                    <span className="text-[12px] font-semibold text-muted">
                      {MOVE_LABEL[m.reason] ?? 'поправка'}
                      {m.note ? `: ${m.note}` : ''} · {relDate(m.created_at.slice(0, 10))} {timeOf(m.created_at)} · {m.author_name}
                    </span>
                  </span>
                  <span className={`text-[15px] font-extrabold ${Number(m.delta) > 0 ? 'text-teal' : 'text-ink2'}`}>
                    {Number(m.delta) > 0 ? '+' : '−'}
                    {fmtNum(Math.abs(Number(m.delta)))} {unit}
                  </span>
                </div>
              );
            })}
          </Card>
        </Section>
      )}

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
  const [perGarets, setPerGarets] = useState('');
  const [waste, setWaste] = useState('');
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  if (view && it && openedFor !== it.id) {
    setOpenedFor(it.id);
    setFull(view.full);
    setFrac(FRACTIONS.reduce((a, b) => (Math.abs(b.v - view.openFrac) < Math.abs(a.v - view.openFrac) ? b : a)).v);
    setValue(String(Math.round(view.balance * 10) / 10));
    setSackKg(String(it.sack_kg ?? ''));
    setName(it.name);
    setPerGarets(String(it.kg_per_garets ?? ''));
    setWaste('');
  }
  const close = () => {
    setOpenedFor(null);
    onClose();
  };
  if (!view || !it) return null;

  // овощи и фрукты считаем в кг (их берут сетками и вёдрами, мешки не «открывают»), крупы — мешками
  const byKg = Boolean(it.pick_unit) || it.kind !== 'sack' || !it.sack_kg;
  const num = (v: string) => Number(v.replace(',', '.')) || 0;
  const target = byKg ? num(value) : (full + frac) * it.sack_kg!;
  const pick = pickWords(it);
  const bump = (d: number) => setValue(String(Math.max(0, Math.round((num(value) + d) * 10) / 10)).replace('.', ','));
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
            const delta = Math.round((target - view.balance) * 1000) / 1000;
            await addStockMove(it.id, delta, 'fix', user, shiftId);
            // название и настройки — одной записью, чтобы одно не затёрло другое
            const next: StockItem = { ...it, name: name.trim() || it.name };
            if (it.kind === 'sack' && num(sackKg)) next.sack_kg = num(sackKg);
            if (perGarets) next.kg_per_garets = num(perGarets) || null;
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
        {byKg && it.pick_unit ? (
          <div className="flex flex-col gap-2">
            <Field label="Сейчас, кг" hint={it.sack_kg ? `≈ ${countText(num(value) / it.sack_kg, packWords(it))} по ${fmtNum(it.sack_kg)} кг` : undefined}>
              <input className={inputCls} type="text" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
            <div className="grid grid-cols-4 gap-1.5">
              {[-10, -5, 5, 10].map((d) => (
                <button key={d} type="button" onClick={() => bump(d)} className="h-11 rounded-xl border border-line text-[15px] font-bold text-ink2">
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
              <Stepper label="Полных мешков" value={full} onChange={setFull} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[15px] font-bold">Открытый мешок</span>
              <div className="grid grid-cols-5 gap-1.5">
                {FRACTIONS.map((f) => (
                  <button
                    key={f.v}
                    type="button"
                    aria-pressed={frac === f.v}
                    onClick={() => setFrac(f.v)}
                    className={`flex h-20 flex-col items-center justify-end gap-1.5 rounded-xl border pb-2 text-[13px] font-bold ${
                      frac === f.v ? 'border-ink text-ink' : 'border-line text-muted'
                    }`}
                  >
                    <span className="relative h-9 w-6 overflow-hidden rounded-[5px] border-2 border-track">
                      <span className="absolute inset-x-0 bottom-0 bg-teal" style={{ height: `${f.v * 100}%` }} />
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
            <input className={inputCls} type="text" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
        )}
        {pick && (
          // брак и гниль при переборке — списание мимо рациона, чтобы склад не расходился с приложением
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <span className="text-[15px] font-bold">Списать брак / гниль</span>
            <div className="flex flex-wrap gap-2">
              {[it.kg_per_garets ? { kg: it.kg_per_garets, label: `1 ${pick[0]} · ${fmtNum(it.kg_per_garets)} кг` } : null, { kg: 5, label: '5 кг' }, { kg: 10, label: '10 кг' }]
                .filter((x): x is { kg: number; label: string } => Boolean(x))
                .map((x) => (
                  <Chip key={x.label} on={num(waste) === x.kg} onClick={() => setWaste(String(x.kg))}>
                    {x.label}
                  </Chip>
                ))}
            </div>
            <div className="flex gap-2">
              <input className={inputCls} type="text" inputMode="decimal" value={waste} onChange={(e) => setWaste(e.target.value)} placeholder="кг" aria-label="Брак, кг" />
              <Button
                className="shrink-0"
                disabled={!num(waste)}
                onClick={async () => {
                  await addStockMove(it.id, -num(waste), 'waste', user, shiftId);
                  toast(`Списан брак: ${fmtNum(num(waste))} кг`);
                  close();
                }}
              >
                Списать
              </Button>
            </div>
          </div>
        )}
        {it.kind === 'sack' && (
          <div className="grid grid-cols-2 gap-3 border-t border-line pt-4">
            <Field label={`Вес: 1 ${packWords(it)[0]}, кг`}>
              <input className={inputCls} type="text" inputMode="decimal" value={sackKg} onChange={(e) => setSackKg(e.target.value)} />
            </Field>
            <Field label={pick ? `1 ${pick[0]}, кг` : 'В совке, кг'} hint={pick ? 'сколько берут в работу за раз' : 'полный мерный совок'}>
              <input className={inputCls} type="text" inputMode="decimal" value={perGarets} onChange={(e) => setPerGarets(e.target.value)} placeholder="—" />
            </Field>
          </div>
        )}
        <div className="flex flex-col gap-3 border-t border-line pt-4">
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
  const amount = !it ? 0 : typed ? typedNum : qty * (it.sack_kg ?? 0);
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
              className={`h-10 rounded-xl border px-3.5 text-[14px] font-bold ${i.id === itemId ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink2'}`}
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
            if (have > 0) await addStockMove(id, have, 'fix', user, shiftId);
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
                className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2.5 text-center ${kind === k.id ? 'border-ink text-ink' : 'border-line text-muted'}`}
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
