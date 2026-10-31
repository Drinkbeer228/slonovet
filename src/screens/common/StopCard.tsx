import { useState } from 'react';
import { createPortal } from 'react-dom';
import { canEdit } from '../../domain/access';
import { currentStop, sortStops } from '../../domain/stops';
import type { CurrentUser } from '../../domain/types';
import { logEvent } from '../../lib/log';
import { isoDate, shortDate } from '../../lib/dates';
import { newId, put, useRows } from '../../lib/store';
import { Button, DateInput, Field, Plate, Sheet, inputCls, toast } from '../../ui/kit';

/**
 * Где стоит труппа — в меню профиля: город видят все, отмечают «Приехали в новый город» администратор и директор.
 * По городу «Контакты» показывают, кто возит и кому звонить здесь.
 */
export function StopCard({ user }: { user: CurrentUser }) {
  const canSet = canEdit('tour', user.role);
  const stops = useRows('tour_stops');
  const here = currentStop(stops);
  const past = sortStops(stops).filter((s) => s.id !== here?.id).slice(0, 3);
  const [open, setOpen] = useState(false);
  const [city, setCity] = useState('');
  const [day, setDay] = useState(isoDate());
  const save = async () => {
    const name = city.trim();
    if (!name) return;
    logEvent('tour.arrive', { city: name, day });
    // прежний город закрываем днём приезда в новый
    if (here && !here.depart_on) await put('tour_stops', { ...here, depart_on: day });
    await put('tour_stops', { id: newId(), city: name, arrive_on: day, depart_on: null, note: '', created_by: user.full_name });
    toast(`Приехали: ${name}`);
    setOpen(false);
  };
  return (
    <>
      <Plate glow="teal" className="flex flex-col gap-1.5 p-3.5">
        <span className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-muted">Где стоим</span>
        <span className="text-[18px] font-extrabold">{here ? here.city : 'Город не отмечен'}</span>
        {here && <span className="text-[13px] font-semibold text-muted">с {shortDate(here.arrive_on)} · отметил {here.created_by}</span>}
        {past.length > 0 && <span className="text-[13px] font-semibold text-muted">До этого: {past.map((s) => s.city).join(' ← ')}</span>}
        {canSet && (
          <Button
            kind="accent"
            icon="plus"
            full
            onClick={() => {
              setCity('');
              setDay(isoDate());
              setOpen(true);
            }}
          >
            Приехали в новый город
          </Button>
        )}
      </Plate>
      {/* шторка — в корне страницы: внутри плиты (isolate) и внутри меню (своё стекло) её обрезало бы */}
        {createPortal(
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title="Приехали в новый город"
          footer={
            <Button kind="primary" big full disabled={!city.trim()} onClick={save}>
              Отметить
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="Город">
              <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Например: Казань" autoComplete="off" />
            </Field>
            <Field label="Когда приехали">
              <DateInput value={day} onChange={setDay} label="Когда приехали" />
            </Field>
            <span className="text-[13px] font-semibold text-muted">
              По городу «Контакты» покажут, кто возит и кому звонить здесь.
            </span>
          </div>
        </Sheet>,
          document.body,
        )}
    </>
  );
}
