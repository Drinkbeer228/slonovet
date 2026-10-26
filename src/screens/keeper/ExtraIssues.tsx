import { useState } from 'react';
import { addStockMoveNote } from '../../domain/actions';
import { categoryOf, fmtNum } from '../../domain/stock';
import type { CurrentUser, Shift } from '../../domain/types';
import { remove, useRows } from '../../lib/store';
import { timeOf } from '../../lib/dates';
import { Button, Card, Chip, Field, Sheet, inputCls, toast } from '../../ui/kit';

/** Поводы выдачи вне рациона: бананы и яблоки на манеже и репетициях, овощи на шоу. */
const REASONS = ['Манеж', 'Репетиция', 'Шоу', 'Доп. кормление', 'Другое'];

/**
 * «Выдали вне рациона»: фрукты на манеже, овощи на шоу. В пару тапов — что и сколько,
 * и это списывается со склада так же, как кормление.
 */
export function ExtraIssues({ shift, user }: { shift: Shift; user: CurrentUser }) {
  const items = useRows('stock_items');
  const moves = useRows('stock_moves').filter((m) => m.shift_id === shift.id && m.reason === 'extra');
  const [open, setOpen] = useState(false);
  const nameOf = (id: string) => items.find((i) => i.id === id)?.name ?? id;

  return (
    <Card className="flex flex-col gap-2 p-4">
      <span className="text-[15px] font-bold">Вне рациона</span>
      {moves.length === 0 ? (
        <span className="text-[13px] font-semibold text-muted">Фрукты на манеже, овощи на шоу — тоже уходят со склада</span>
      ) : (
        moves
          .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
          .map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-[14px]">
              <span className="flex-1 font-semibold">
                {nameOf(m.item_id)} · {fmtNum(-Number(m.delta))} кг
                <span className="text-muted">
                  {m.note ? ` · ${m.note}` : ''} · {timeOf(m.created_at)}
                </span>
              </span>
              <button type="button" className="-my-2 px-2 py-3 text-[13px] font-bold text-muted underline" onClick={() => remove('stock_moves', m.id)}>
                отменить
              </button>
            </div>
          ))
      )}
      <Button icon="plus" full onClick={() => setOpen(true)}>
        Выдали вне рациона
      </Button>
      <ExtraSheet open={open} shift={shift} user={user} onClose={() => setOpen(false)} />
    </Card>
  );
}

function ExtraSheet({ open, shift, user, onClose }: { open: boolean; shift: Shift; user: CurrentUser; onClose: () => void }) {
  const items = useRows('stock_items');
  const [reason, setReason] = useState('Манеж');
  const [itemId, setItemId] = useState<string | null>(null);
  const [kg, setKg] = useState('');
  const [openedAt, setOpenedAt] = useState(false);
  if (open && !openedAt) {
    setOpenedAt(true);
    setReason('Манеж');
    setItemId(null);
    setKg('');
  }
  if (!open && openedAt) setOpenedAt(false);

  // сначала овощи и фрукты (их и выдают вне рациона), потом остальное, кроме мешков для мусора
  const choices = items
    .filter((i) => i.id !== 'bags')
    .sort((a, b) => Number(categoryOf(b) === 'veg') - Number(categoryOf(a) === 'veg') || a.sort - b.sort);
  const it = items.find((i) => i.id === itemId);
  const amount = Number(kg.replace(',', '.')) || 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Выдали вне рациона"
      footer={
        <Button
          kind="primary"
          big
          full
          disabled={!it || amount <= 0}
          onClick={async () => {
            await addStockMoveNote(it!.id, -amount, 'extra', reason, user, shift.id);
            toast(`${it!.name}: −${fmtNum(amount)} кг · ${reason}`);
            onClose();
          }}
        >
          Списать
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <Chip key={r} on={reason === r} onClick={() => setReason(r)}>
              {r}
            </Chip>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Что</span>
          <div className="flex flex-wrap gap-2">
            {choices.map((i) => (
              <Chip
                key={i.id}
                on={itemId === i.id}
                onClick={() => setItemId(i.id)}
              >
                {i.name}
              </Chip>
            ))}
          </div>
        </div>
        {it && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {[5, 10, 20].map((v) => (
                <Chip key={v} on={amount === v} onClick={() => setKg(String(v))}>
                  {v} кг
                </Chip>
              ))}
            </div>
            <Field label="Сколько, кг">
              <input className={inputCls} inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="0" />
            </Field>
          </div>
        )}
      </div>
    </Sheet>
  );
}
