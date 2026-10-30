import { useState } from 'react';
import { logEvent } from '../lib/log';
import { DAYS_ID, MOVE_SECTIONS, moveNeeds } from '../domain/move';
import { HAY_THERE_ID, RESERVE_ID, ROAD_ID, roadMode } from '../domain/road';
import type { CurrentUser, MoveItem } from '../domain/types';
import { getRow, newId, put, remove, useRows } from '../lib/store';
import { localDay, shortDate, timeOf } from '../lib/dates';
import { Button, Card, Check, Chip, Confirm, DateInput, Field, Plate, Section, Sheet, Stepper, inputCls, toast } from '../ui/kit';
import { currentStop, sortStops } from '../domain/stops';
import { isoDate } from '../lib/dates';

/** Переезд: сколько всего нужно на дорогу и общий чек-лист сборов — кто что собрал. */
export function MoveScreen({ user }: { user: CurrentUser }) {
  const rows = useRows('move_items');
  const diets = useRows('diets');
  const items = useRows('stock_items');
  const moves = useRows('stock_moves');
  const [text, setText] = useState('');
  const [section, setSection] = useState(MOVE_SECTIONS[0].key);
  const [reset, setReset] = useState(false);

  const days = rows.find((r) => r.id === DAYS_ID)?.qty ?? 3;
  const reserve = rows.find((r) => r.id === RESERVE_ID)?.qty ?? 3;
  const hayThere = rows.find((r) => r.id === HAY_THERE_ID)?.qty === 1;
  const road = roadMode(rows);
  const needs = moveNeeds(days, diets, items, moves, { reserve, hayThere });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const custom = rows.filter((r) => r.id !== DAYS_ID && r.text && !MOVE_SECTIONS.some((s) => s.items.some((i) => i.id === r.id)));
  const allIds = [...MOVE_SECTIONS.flatMap((s) => s.items.map((i) => i.id)), ...custom.map((c) => c.id)];
  const done = allIds.filter((id) => byId.get(id)?.done_by).length;

  const row = (id: string, sec: string, t: string): Omit<MoveItem, 'updated_at'> => {
    const cur = getRow('move_items', id);
    return { id, section: sec, text: t, qty: null, done_by: null, done_at: null, created_by: user.full_name, ...cur };
  };
  const toggle = async (id: string, sec: string, t: string, on: boolean) => {
    await put('move_items', { ...row(id, sec, t), done_by: on ? user.full_name : null, done_at: on ? new Date().toISOString() : null });
  };
  const setDays = (v: number) => put('move_items', { ...row(DAYS_ID, '', ''), qty: Math.max(1, v) });
  const setReserve = (v: number) => put('move_items', { ...row(RESERVE_ID, '', ''), qty: Math.max(0, v) });
  const setHayThere = (on: boolean) => put('move_items', { ...row(HAY_THERE_ID, '', ''), qty: on ? 1 : 0 });
  // режим «В дороге»: каши отменяются у всех сразу; включает директор, врач или администратор
  const canRoad = user.role !== 'keeper';
  const setRoad = async (on: boolean) => {
    logEvent('road.toggle', { on });
    await put('move_items', { ...row(ROAD_ID, '', ''), qty: on ? 1 : 0, done_by: on ? user.full_name : null, done_at: on ? new Date().toISOString() : null });
    toast(on ? 'В дороге: каши и зерносмесь отменены' : 'Приехали: рацион обычный');
  };

  return (
    <div className="flex flex-col gap-6">
      <StopCard user={user} />
      <header className="flex flex-col gap-0.5 px-1">
        <h1 className="m-0 text-[26px] font-extrabold tracking-tight">Переезд</h1>
        <span className="text-[14px] font-semibold text-muted">
          Что подготовить киперам · собрано {done} из {allIds.length}
        </span>
      </header>

      <Card className="overflow-hidden">
        <Check
          on={road.on}
          label="В дороге"
          sub={canRoad ? 'каши и зерносмесь отменяются у всех, овощи вечером, сено и вода вволю' : 'включает директор, врач или администратор'}
          onChange={(v) => canRoad && setRoad(v)}
        />
      </Card>

      <Section title="На дорогу">
        <Card className="divide-y divide-edge overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex-1 text-[15px] font-bold">Дней в дороге</span>
            <Stepper label="Дней в дороге" value={days} min={1} onChange={setDays} />
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex flex-1 flex-col">
              <span className="text-[15px] font-bold">Запас на новом месте, дней</span>
              <span className="text-[12px] font-semibold text-muted">пока не привезут первую партию</span>
            </span>
            <Stepper label="Запас на новом месте, дней" value={reserve} min={0} onChange={setReserve} />
          </div>
          <Check on={hayThere} label="Сено на новой точке есть" sub="тогда сено берём только на дорогу" onChange={setHayThere} />
          {needs.map((n) => (
            <div key={n.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-[14px] text-ink2">{n.label}</span>
              <span className="text-[15px] font-extrabold">{n.value}</span>
            </div>
          ))}
        </Card>
        <p className="m-0 px-1 text-[12px] font-semibold text-muted">
          Считаем по рациону и по реальному расходу сена и мешков за неделю. В дороге каши и зерносмесь не дают — их берём только на запас. Коробка — одна голова на один ужин.
        </p>
      </Section>

      {MOVE_SECTIONS.map((sec) => {
        const own = custom.filter((c) => c.section === sec.key);
        return (
          <Section key={sec.key} title={sec.title}>
            <Card className="divide-y divide-edge overflow-hidden">
              {[...sec.items, ...own.map((c) => ({ id: c.id, text: c.text }))].map((it) => {
                const r = byId.get(it.id);
                const ns = needs.filter((n) => n.item === it.id);
                const need = ns.length > 1 ? { value: ns.map((n) => `${n.label.split(' ')[0]} ${n.value.split(' ·')[0]}`).join(', ') } : ns[0];
                const isOwn = own.some((c) => c.id === it.id);
                return (
                  <div key={it.id} className="relative">
                    <Check
                      on={Boolean(r?.done_by)}
                      label={it.text}
                      sub={
                        r?.done_by
                          ? `собрал ${r.done_by}, ${shortDate(localDay(r.done_at!))} ${timeOf(r.done_at)}`
                          : need
                            ? `нужно: ${need.value}`
                            : isOwn
                              ? `добавил ${r?.created_by}`
                              : undefined
                      }
                      onChange={(v) => toggle(it.id, sec.key, it.text, v)}
                    />
                    {isOwn && !r?.done_by && (
                      <button
                        type="button"
                        onClick={() => remove('move_items', it.id)}
                        className="absolute bottom-2 right-16 text-[12px] font-bold text-faint underline"
                      >
                        убрать
                      </button>
                    )}
                  </div>
                );
              })}
            </Card>
          </Section>
        );
      })}

      <Section title="Добавить свой пункт">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {MOVE_SECTIONS.map((s) => (
              <Chip key={s.key} on={section === s.key} onClick={() => setSection(s.key)}>
                {s.title}
              </Chip>
            ))}
          </div>
          <div className="flex gap-2">
            <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: удлинитель для ветродуйки" />
            <Button
              kind="primary"
              disabled={!text.trim()}
              onClick={async () => {
                logEvent('move.custom', { section, text: text.trim().slice(0, 200) });
                await put('move_items', { id: newId(), section, text: text.trim(), qty: null, done_by: null, done_at: null, created_by: user.full_name });
                setText('');
                toast('Добавлено в список');
              }}
            >
              Добавить
            </Button>
          </div>
        </div>
      </Section>

      <Button full onClick={() => setReset(true)}>
        Новый переезд — снять все отметки
      </Button>
      <Confirm
        open={reset}
        title="Начать новый переезд?"
        text="Все отметки «собрал» снимутся. Свои пункты и число дней останутся."
        okLabel="Снять отметки"
        onOk={async () => {
          for (const r of rows.filter((x) => x.done_by)) await put('move_items', { ...r, done_by: null, done_at: null });
          toast('Отметки сняты');
        }}
        onClose={() => setReset(false)}
      />
    </div>
  );
}

/** Где стоит труппа: текущий город и кнопка «Приехали в новый город». По городу делится лента фуража. */
function StopCard({ user }: { user: CurrentUser }) {
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
      <Plate glow="teal" className="flex flex-col gap-2 p-4">
        <span className="text-[13px] font-extrabold tracking-wide text-muted">ГДЕ СТОИМ</span>
        <span className="text-[20px] font-extrabold">{here ? here.city : 'Город не отмечен'}</span>
        {here && <span className="text-[13px] font-semibold text-muted">с {shortDate(here.arrive_on)} · отметил {here.created_by}</span>}
        {past.length > 0 && <span className="text-[13px] font-semibold text-muted">До этого: {past.map((s) => s.city).join(' ← ')}</span>}
        {user.role !== 'vet' && (
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
      {/* шторка — вне плиты: у плиты свой слой (isolate), и нижняя навигация перекрыла бы кнопку «Отметить» */}
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
              По городу поставщики покажут, кто возит здесь.
            </span>
          </div>
        </Sheet>
    </>
  );
}
