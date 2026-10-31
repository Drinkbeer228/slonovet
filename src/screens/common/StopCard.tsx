import { useState } from 'react';
import { createPortal } from 'react-dom';
import { canEdit } from '../../domain/access';
import { CIRCUS_CITIES, currentStop } from '../../domain/stops';
import type { CurrentUser } from '../../domain/types';
import { logEvent } from '../../lib/log';
import { isoDate } from '../../lib/dates';
import { newId, put, useRows } from '../../lib/store';
import { Button, Sheet, inputCls, toast } from '../../ui/kit';
import { Icon } from '../../ui/Icon';

/**
 * «Город: Брянск» — одна строка в меню профиля. Город видят все; выбирают из списка цирков (или вписывают свой)
 * администратор и директор. Дата приезда — сегодня, без лишних полей. По городу «Контакты» показывают, кому звонить.
 */
export function StopCard({ user }: { user: CurrentUser }) {
  const canSet = canEdit('tour', user.role);
  const here = currentStop(useRows('tour_stops'));
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const pick = async (name: string) => {
    const city = name.trim();
    if (!city || city === here?.city) return setOpen(false);
    const day = isoDate();
    logEvent('tour.arrive', { city, day });
    // прежний город закрываем днём приезда в новый
    if (here && !here.depart_on) await put('tour_stops', { ...here, depart_on: day });
    await put('tour_stops', { id: newId(), city, arrive_on: day, depart_on: null, note: '', created_by: user.full_name });
    toast(`Город: ${city}`);
    setOpen(false);
  };
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
  const list = CIRCUS_CITIES.filter((c) => norm(c).includes(norm(q.trim())));
  const row = (
    <>
      <span className="text-[15px] font-bold">Город</span>
      <span className="flex items-center gap-1 text-[15px] font-bold text-ink2">
        {here ? here.city : 'не выбран'}
        {canSet && <Icon name="next" size={16} className="text-muted" />}
      </span>
    </>
  );
  return (
    <>
      {canSet ? (
        <button
          type="button"
          onClick={() => {
            setQ('');
            setOpen(true);
          }}
          className="flex min-h-11 items-center justify-between gap-3 px-1 text-left"
        >
          {row}
        </button>
      ) : (
        <div className="flex min-h-11 items-center justify-between gap-3 px-1">{row}</div>
      )}
      {/* шторка — в корне страницы: внутри меню (своё стекло) её обрезало бы */}
      {createPortal(
        <Sheet open={open} onClose={() => setOpen(false)} title="Город">
          <div className="flex flex-col gap-3">
            <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти или вписать город" aria-label="Город" autoComplete="off" />
            {q.trim() && !CIRCUS_CITIES.some((c) => norm(c) === norm(q.trim())) && (
              <Button kind="accent" full icon="plus" onClick={() => pick(q)}>
                {q.trim()}
              </Button>
            )}
            <div className="flex flex-wrap gap-2">
              {list.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pick(c)}
                  className={`h-11 rounded-xl border px-3.5 text-[14px] font-bold ${c === here?.city ? 'border-teal bg-[color-mix(in_srgb,var(--color-teal)_var(--tint),transparent)] text-teal-fg' : 'border-edge bg-well text-ink2'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </Sheet>,
        document.body,
      )}
    </>
  );
}
