import { useMemo, useState } from 'react';
import { addStockMove } from '../domain/actions';
import { currentShift } from '../domain/shift';
import { GRAIN_RATIO, PACK_SIZE, balances, countPerDay, countWords, dailyUsage, fmtNum, itemsWithoutQty, stockView, weighedPerDay, type StockView } from '../domain/stock';
import type { CurrentUser, StockItem } from '../domain/types';
import { put, useRows } from '../lib/store';
import { plural, relDate, timeOf } from '../lib/dates';
import { Button, Card, Field, Section, Sheet, Stepper, inputCls, toast } from '../ui/kit';
import { Icon } from '../ui/Icon';

const GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Корма', ids: ['hay', 'veg'] },
  { title: 'Каши', ids: ['formamax', 'optiform', 'monograss'] },
  { title: 'Зерно', ids: ['hercules', 'bran', 'oats', 'corn', 'seeds'] },
  { title: 'Хозяйство', ids: ['bags'] },
];

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
  if (item.kind === 'count') return `${fmtNum(balance, 0)} ${plural(Math.round(balance), ...countWords(item.id))}`;
  if (item.kind === 'sack' && item.sack_kg) {
    if (balance <= 0) return 'пусто';
    const parts = [];
    if (v.full > 0) parts.push(`${v.full} ${plural(v.full, 'мешок', 'мешка', 'мешков')}`);
    if (v.openFrac > 0) parts.push(v.full > 0 ? `+ ${fracLabel(v.openFrac)}` : `${fracLabel(v.openFrac)} мешка`);
    return parts.join(' ');
  }
  return `${fmtNum(balance)} кг`;
}

function daysText(v: StockView, noQty: boolean) {
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
    .filter((m) => m.reason === 'in' || m.reason === 'fix')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 15);
  const nameOf = (id: string) => items.find((i) => i.id === id)?.name ?? id;
  const canWrite = user.role === 'keeper' || user.role === 'admin';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3 px-1">
        <h1 className="m-0 text-[26px] font-extrabold tracking-tight">Фураж</h1>
        {canWrite && (
          <Button kind="light" icon="truck" onClick={() => setIncoming(true)}>
            Привезли
          </Button>
        )}
      </header>

      {low.length > 0 && (
        <Card className="flex flex-col gap-1 p-4 ring-1 ring-amber/40">
          <span className="text-[12px] font-extrabold tracking-wide text-amber">ЗАКАНЧИВАЕТСЯ</span>
          {low.map((v) => (
            <span key={v.item.id} className="text-[15px] font-bold">
              {v.item.name} — {daysText(v, false)}
            </span>
          ))}
        </Card>
      )}

      {GROUPS.map((g) => (
        <Section key={g.title} title={g.title}>
          <Card className="divide-y divide-surface2 overflow-hidden">
            {g.ids.map((id) => {
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
      ))}

      <p className="m-0 px-1 text-[13px] font-semibold leading-relaxed text-muted">
        Каши и зерно списываются сами, когда кипер отмечает кормление. Сено — по числу выданных тюков, овощи — по наполнению тазов в 19:00, мешки — по счётчику «Мешков взяли».{canWrite && ' Нажми на позицию, чтобы поправить остаток.'}
      </p>

      {user.role === 'admin' && <ScoopCard items={items} />}

      {history.length > 0 && (
        <Section title="Приход и поправки">
          <Card className="divide-y divide-surface2 overflow-hidden">
            {history.map((m) => {
              const it = items.find((i) => i.id === m.item_id);
              const unit = it?.kind === 'count' ? countWords(it.id)[2] : 'кг';
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[14px] font-bold">{nameOf(m.item_id)}</span>
                    <span className="text-[12px] font-semibold text-muted">
                      {m.reason === 'in' ? 'приход' : 'поправка'} · {relDate(m.created_at.slice(0, 10))} {timeOf(m.created_at)} · {m.author_name}
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
      <IncomingSheet open={incoming} items={items} user={user} shiftId={shiftId} onClose={() => setIncoming(false)} />
    </div>
  );
}

function AdjustSheet({ view, user, shiftId, onClose }: { view: StockView | null; user: CurrentUser; shiftId: string | null; onClose: () => void }) {
  const it = view?.item;
  const [full, setFull] = useState(0);
  const [frac, setFrac] = useState(0);
  const [value, setValue] = useState('');
  const [sackKg, setSackKg] = useState('');
  const [perGarets, setPerGarets] = useState('');
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  if (view && it && openedFor !== it.id) {
    setOpenedFor(it.id);
    setFull(view.full);
    setFrac(FRACTIONS.reduce((a, b) => (Math.abs(b.v - view.openFrac) < Math.abs(a.v - view.openFrac) ? b : a)).v);
    setValue(String(Math.round(view.balance * 10) / 10));
    setSackKg(String(it.sack_kg ?? ''));
    setPerGarets(String(it.kg_per_garets ?? ''));
  }
  const close = () => {
    setOpenedFor(null);
    onClose();
  };
  if (!view || !it) return null;

  const target = it.kind === 'sack' && it.sack_kg ? (full + frac) * it.sack_kg : Number(value.replace(',', '.')) || 0;

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
            if (user.role === 'admin' && it.id === 'veg') {
              const g = Number(perGarets.replace(',', '.'));
              if (perGarets && g !== it.kg_per_garets) await put('stock_items', { ...it, kg_per_garets: g || null } as StockItem);
            }
            if (user.role === 'admin' && it.kind === 'sack') {
              const s = Number(sackKg.replace(',', '.'));
              const g = Number(perGarets.replace(',', '.'));
              if ((s && s !== it.sack_kg) || (perGarets && g !== it.kg_per_garets)) {
                await put('stock_items', { ...it, sack_kg: s || it.sack_kg, kg_per_garets: perGarets ? g : it.kg_per_garets } as StockItem);
              }
            }
            toast('Остаток обновлён');
            close();
          }}
        >
          Сохранить
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {it.kind === 'sack' && it.sack_kg ? (
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
              ≈ {fmtNum(target)} кг · мешок {fmtNum(it.sack_kg)} кг
            </span>
          </>
        ) : (
          <Field label={it.kind === 'count' ? `Сейчас ${countWords(it.id)[2]}` : 'Сейчас, кг'}>
            <input className={inputCls} type="text" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
        )}
        {user.role === 'admin' && it.id === 'veg' && (
          <div className="border-t border-line pt-4">
            <Field label="Обычный таз овощей, кг" hint="Один раз взвесить обычный таз. Тогда кипер отмечает тазы, а не взвешивает каждый день.">
              <input className={inputCls} type="text" inputMode="decimal" value={perGarets} onChange={(e) => setPerGarets(e.target.value)} placeholder="—" />
            </Field>
          </div>
        )}
        {user.role === 'admin' && it.kind === 'sack' && (
          <div className="grid grid-cols-2 gap-3 border-t border-line pt-4">
            <Field label="Вес мешка, кг">
              <input className={inputCls} type="text" inputMode="decimal" value={sackKg} onChange={(e) => setSackKg(e.target.value)} />
            </Field>
            <Field label="1 гарец ≈ кг">
              <input className={inputCls} type="text" inputMode="decimal" value={perGarets} onChange={(e) => setPerGarets(e.target.value)} placeholder="—" />
            </Field>
          </div>
        )}
      </div>
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
  const isKg = it?.kind === 'kg';
  const pack = it ? PACK_SIZE[it.id] : undefined;
  const amount = !it ? 0 : isKg ? Number(kg.replace(',', '.')) || 0 : it.kind === 'sack' ? qty * (it.sack_kg ?? 0) : qty * (pack ?? 1);
  const unitWord = !it
    ? ''
    : pack
      ? `${plural(qty, 'упаковка', 'упаковки', 'упаковок')} (${amount} шт.)`
      : it.kind === 'count'
        ? plural(qty, ...countWords(it.id))
        : plural(qty, 'мешок', 'мешка', 'мешков');

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
            toast(`${it.name}: +${isKg ? `${fmtNum(amount)} кг` : `${qty} ${unitWord}`}`);
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
        {isKg ? (
          <Field label="Сколько, кг">
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

/** Мерный совок («гарец»): одна цифра — сколько кг овса в полном совке. Остальное зерно пересчитывается по плотности. */
function ScoopCard({ items }: { items: StockItem[] }) {
  const oats = items.find((i) => i.id === 'oats');
  const current = oats?.kg_per_garets ?? 1.5;
  const [text, setText] = useState(String(current).replace('.', ','));
  const kg = Number(text.replace(',', '.')) || 0;
  const apply = async (v: number) => {
    for (const it of items) {
      const r = GRAIN_RATIO[it.id];
      if (r) await put('stock_items', { ...it, kg_per_garets: Math.round(v * r * 100) / 100 });
    }
    setText(String(v).replace('.', ','));
    toast(`Совок: ${fmtNum(v, 2)} кг овса`);
  };
  return (
    <Section title="Мерный совок (гарец)">
      <Card className="flex flex-col gap-3 p-4">
        <span className="text-[14px] font-semibold text-ink2">Сколько кг овса в полном совке? Взвесь один раз — остальное зерно пересчитается само.</span>
        <div className="flex flex-wrap items-center gap-2">
          {[1.5, 3].map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={current === v}
              onClick={() => apply(v)}
              className={`h-11 rounded-xl border px-4 text-[15px] font-bold ${current === v ? 'border-ink bg-ink text-bg' : 'border-line bg-surface2 text-ink2'}`}
            >
              {fmtNum(v)} кг
            </button>
          ))}
          <input
            className={`${inputCls.replace('w-full ', '')} w-24 py-2.5 text-right`}
            inputMode="decimal"
            aria-label="Кг овса в полном совке"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button kind="light" disabled={!kg || kg === current} onClick={() => apply(kg)}>
            Применить
          </Button>
        </div>
        <span className="text-[12px] font-semibold text-muted">
          Сейчас в совке:{' '}
          {items
            .filter((i) => GRAIN_RATIO[i.id] && i.kg_per_garets)
            .map((i) => `${i.name.toLowerCase()} ${fmtNum(i.kg_per_garets!, 2)}`)
            .join(' · ')}{' '}
          кг
        </span>
      </Card>
    </Section>
  );
}
