import { useState } from 'react';
import { logEvent } from '../lib/log';
import { containerName } from '../domain/containers';
import { EURO_TRUCK, autoOrder, pack, planBoxes, shapeKey, shapes, swap, type Box, type Placed } from '../domain/loading';
import type { CurrentUser, ExtraBox, LoadPlan, Truck } from '../domain/types';
import { newId, put, remove, useRows } from '../lib/store';
import { Icon } from '../ui/Icon';
import { Button, Card, Chip, Confirm, Empty, Field, KEY, Meter, Plate, Section, Sheet, inputCls, toast } from '../ui/kit';

type Work = Pick<LoadPlan, 'truck_id' | 'queue' | 'off' | 'extras'>;
const EMPTY: Work = { truck_id: null, queue: [], off: [], extras: [] };
/** последняя открытая схема — на этом телефоне */
const PLAN_KEY = 'slonovet_load_plan';

/** Цвета фигур по кругу: одна фигура — один цвет (их можно менять местами). */
const SHAPE_COLORS = ['--color-teal', '--color-sky', '--color-violet', '--color-amber', '--color-coral'];
const color = (letter: string) => `var(${SHAPE_COLORS[(letter.charCodeAt(0) - 65) % SHAPE_COLORS.length]})`;

const meters = (cm: number) => `${(cm / 100).toFixed(1).replace('.', ',')} м`;
const cm = (s: string) => {
  const n = parseInt(s.replace(/\D/g, ''), 10);
  return n > 0 ? n : 0;
};

/**
 * Погрузка («тетрис»): фура, очередь от передней стенки к дверям и схема сверху.
 * Выбрана сохранённая схема — правки сразу пишутся в неё; без схемы — черновик, «Сохранить как…».
 */
export function LoadingView({ user, canWrite }: { user: CurrentUser; canWrite: boolean }) {
  const containers = useRows('containers');
  const trucks = useRows('trucks').filter((t) => !t.deleted);
  const plans = useRows('load_plans')
    .filter((p) => !p.deleted)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const [planId, setPlanIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(PLAN_KEY);
    } catch {
      return null;
    }
  });
  const setPlanId = (id: string | null) => {
    setPlanIdState(id);
    try {
      if (id) localStorage.setItem(PLAN_KEY, id);
      else localStorage.removeItem(PLAN_KEY);
    } catch {
      /* не запомнится — откроется черновик */
    }
  };
  const [draft, setDraft] = useState<Work>(EMPTY);
  const [picked, setPicked] = useState<string | null>(null);
  /** шторка фуры: 'new' — новая, иначе правим эту */
  const [truckSheet, setTruckSheet] = useState<'new' | Truck | null>(null);
  const [extraSheet, setExtraSheet] = useState(false);
  const [saveSheet, setSaveSheet] = useState(false);

  const plan = plans.find((p) => p.id === planId) ?? null;
  const work: Work = plan ?? draft;
  const chosen = trucks.find((t) => t.id === work.truck_id) ?? trucks[0];
  const truck: Pick<Truck, 'name' | 'length_cm' | 'width_cm' | 'height_cm'> = chosen ?? EURO_TRUCK;
  const { queue, off, noDims } = planBoxes(containers, work);
  const result = pack(truck, queue);
  const letters = shapes(queue);
  const letterOf = (b: Box) => letters.get(shapeKey(b)) ?? '?';
  const stepOf = new Map(result.placed.map((p) => [p.id, p.step]));
  const left = new Set([...result.overflow, ...result.tooTall].map((b) => b.id));

  const update = async (patch: Partial<Work>) => {
    if (plan) await put('load_plans', { ...plan, ...patch });
    else setDraft({ ...work, ...patch });
  };
  const ids = queue.map((b) => b.id);
  const tap = (id: string) => {
    if (!canWrite) return;
    if (!picked) return setPicked(id);
    if (picked !== id) update({ queue: [...swap(ids, picked, id), ...off.map((b) => b.id)] });
    setPicked(null);
  };

  return (
    <>
      <Section title="Фура" aside={`${truck.length_cm} × ${truck.width_cm} × ${truck.height_cm} см`}>
        <div className="flex flex-wrap gap-2">
          {trucks.length === 0 && (
            <Chip on onClick={() => undefined}>
              {EURO_TRUCK.name}
            </Chip>
          )}
          {trucks.map((t) => (
            <Chip key={t.id} on={t.id === chosen?.id} onClick={() => update({ truck_id: t.id })}>
              {t.name}
            </Chip>
          ))}
          {canWrite && chosen && (
            <Button icon="edit" onClick={() => setTruckSheet(chosen)}>
              Изменить
            </Button>
          )}
          {canWrite && (
            <Button icon="plus" onClick={() => setTruckSheet('new')}>
              Фура
            </Button>
          )}
        </div>
      </Section>

      <Section title="Схема" aside={plan ? 'правки сохраняются сами' : 'черновик'}>
        <div className="flex flex-wrap gap-2">
          <Chip on={!plan} onClick={() => setPlanId(null)}>
            Черновик
          </Chip>
          {plans.map((p) => (
            <Chip key={p.id} on={p.id === planId} onClick={() => setPlanId(p.id)}>
              {p.name}
            </Chip>
          ))}
          {canWrite && (
            <Button icon="plus" onClick={() => setSaveSheet(true)}>
              {plan ? 'Копия' : 'Сохранить'}
            </Button>
          )}
        </div>
      </Section>

      <Plate glow={result.overflow.length || result.tooTall.length ? 'coral' : 'teal'} halo className="flex flex-col gap-2 p-4">
        <span className="text-[17px] font-extrabold">
          Занято {meters(result.usedLength)} из {meters(truck.length_cm)}
        </span>
        <Meter value={result.usedLength / truck.length_cm} tone={result.overflow.length ? 'coral' : 'teal'} label="Занято длины кузова" />
        <span className="text-[14px] font-semibold text-ink2">
          Стоит {result.placed.length} из {queue.length}
          {result.placed.length ? ` · свободно у дверей ${meters(truck.length_cm - result.usedLength)}` : ''}
        </span>
        {result.overflow.length > 0 && <span className="text-[14px] font-bold text-coral-fg">Не влезло: {result.overflow.map((b) => b.label).join(', ')}</span>}
        {result.tooTall.length > 0 && <span className="text-[14px] font-bold text-coral-fg">Выше кузова: {result.tooTall.map((b) => b.label).join(', ')}</span>}
      </Plate>

      {queue.length === 0 ? (
        <Empty>Нечего грузить. В «Описи» укажите габариты контейнеров (длина и ширина) — или добавьте временный ящик.</Empty>
      ) : (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
          <TruckPlan truck={truck} placed={result.placed} letterOf={letterOf} picked={picked} onTap={tap} />
          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-[12px] font-bold text-muted">{canWrite ? 'Тап по двум — поменять местами' : 'Порядок погрузки'}</span>
            {queue.map((b) => (
              <div key={b.id} className={`flex items-center rounded-xl ${picked === b.id ? 'ring-2 ring-coral' : ''} ${left.has(b.id) ? 'opacity-50' : ''}`}>
                <button type="button" onClick={() => tap(b.id)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-1.5 text-left">
                  <span className="w-6 shrink-0 text-right text-[13px] font-extrabold text-muted">{stepOf.get(b.id) ?? '—'}</span>
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: color(letterOf(b)) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{b.label}</span>
                    <span className="block text-[12px] font-semibold text-muted">
                      {letterOf(b)} · {b.l}×{b.w}
                    </span>
                  </span>
                </button>
                {canWrite && (
                  <button type="button" aria-label={`${b.label}: не грузить в этой схеме`} onClick={() => update({ off: [...work.off, b.id] })} className="flex h-11 w-9 shrink-0 items-center justify-center text-muted">
                    <Icon name="x" size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {canWrite && queue.length > 1 && (
        <div className="grid grid-cols-2 gap-2">
          <Button icon="sparkle" onClick={() => update({ queue: [...autoOrder(queue).map((b) => b.id), ...off.map((b) => b.id)] })}>
            Авто
          </Button>
          <Button icon="plus" onClick={() => setExtraSheet(true)}>
            Временный ящик
          </Button>
        </div>
      )}
      {canWrite && queue.length <= 1 && (
        <Button icon="plus" full onClick={() => setExtraSheet(true)}>
          Временный ящик
        </Button>
      )}

      {off.length > 0 && (
        <Section title="Не грузим в этой схеме" aside={String(off.length)}>
          <div className="flex flex-wrap gap-2">
            {off.map((b) => (
              <Chip key={b.id} on={false} onClick={() => canWrite && update({ off: work.off.filter((x) => x !== b.id) })}>
                + {b.label}
              </Chip>
            ))}
          </div>
        </Section>
      )}
      {work.extras.length > 0 && (
        <Section title="Временные ящики">
          <Card className="divide-y divide-edge overflow-hidden">
            {work.extras.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4">
                <span className="min-w-0 flex-1 py-3 text-[15px] font-semibold">
                  {e.label || 'Ящик'} · {e.count} × {e.l}×{e.w}×{e.h}
                </span>
                {canWrite && (
                  <button type="button" aria-label={`Убрать «${e.label || 'Ящик'}»`} onClick={() => update({ extras: work.extras.filter((x) => x.id !== e.id) })} className="flex h-11 w-11 items-center justify-center text-muted">
                    <Icon name="trash" size={18} />
                  </button>
                )}
              </div>
            ))}
          </Card>
        </Section>
      )}
      {noDims.length > 0 && (
        <p className="m-0 px-1 text-[13px] font-semibold text-muted">
          Без габаритов — не считаются: {noDims.map(containerName).join(', ')}. Впишите длину и ширину в «Описи».
        </p>
      )}

      {truckSheet && <TruckSheet key={truckSheet === 'new' ? 'new' : truckSheet.id} edit={truckSheet === 'new' ? null : truckSheet} user={user} onClose={() => setTruckSheet(null)} onSaved={(id) => update({ truck_id: id })} />}
      <ExtraSheet open={extraSheet} onClose={() => setExtraSheet(false)} onAdd={(e) => update({ extras: [...work.extras, e] })} />
      <SaveSheet
        open={saveSheet}
        copy={Boolean(plan)}
        onClose={() => setSaveSheet(false)}
        onSave={async (name) => {
          const id = newId();
          logEvent('loading.plan.save', { name: name.slice(0, 60), boxes: queue.length });
          await put('load_plans', { id, name, truck_id: work.truck_id, queue: [...ids, ...off.map((b) => b.id)], off: work.off, extras: work.extras, created_by: user.full_name });
          setPlanId(id);
          setDraft(EMPTY);
          toast('Схема сохранена');
        }}
      />
    </>
  );
}

/** Кузов сверху: передняя стенка — вверху, двери — внизу. Масштаб — чтобы еврофура влезла примерно в экран. */
function TruckPlan({ truck, placed, letterOf, picked, onTap }: { truck: Pick<Truck, 'length_cm' | 'width_cm'>; placed: Placed[]; letterOf: (b: Box) => string; picked: string | null; onTap: (id: string) => void }) {
  const scale = Math.min(150 / truck.width_cm, 900 / truck.length_cm);
  return (
    <figure className="m-0 flex flex-col items-center gap-1">
      <span className="text-[11px] font-bold text-muted">кабина</span>
      <svg
        width={Math.round(truck.width_cm * scale)}
        height={Math.round(truck.length_cm * scale)}
        viewBox={`0 0 ${truck.width_cm} ${truck.length_cm}`}
        role="img"
        aria-label={`Схема кузова сверху: ${placed.length} мест`}
        className="rounded-md bg-well shadow-(--shadow-well)"
      >
        {/* метровые риски вдоль борта */}
        {Array.from({ length: Math.floor(truck.length_cm / 100) }, (_, i) => (
          <line key={i} x1={0} x2={10} y1={(i + 1) * 100} y2={(i + 1) * 100} stroke="var(--color-tick)" strokeWidth={2} />
        ))}
        {placed.map((p) => {
          const c = color(letterOf(p));
          const on = picked === p.id;
          // подпись по ширине ящика; не влезает даже мелко — номер шага
          const name = p.label.replace(/^№/, '');
          const fit = Math.min(34, (p.dw - 12) / (0.62 * name.length), p.dl / 2);
          const text = fit >= 16 ? name : String(p.step);
          const size = fit >= 16 ? fit : Math.min(34, p.dw / 2, p.dl / 2);
          return (
            <g key={p.id} onClick={() => onTap(p.id)} className="cursor-pointer">
              <rect x={p.x + 2} y={p.y + 2} width={p.dw - 4} height={p.dl - 4} rx={6} fill={c} fillOpacity={on ? 0.55 : 0.28} stroke={on ? 'var(--color-coral)' : c} strokeWidth={on ? 8 : 3} />
              <text x={p.x + p.dw / 2} y={p.y + p.dl / 2} textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight={800} fill="var(--color-ink)">
                {text}
              </text>
            </g>
          );
        })}
      </svg>
      <span className="text-[11px] font-bold text-muted">двери</span>
    </figure>
  );
}

/** Новая фура или правка выбранной; у выбранной — «Удалить». Схемы с удалённой фурой берут первую оставшуюся. */
function TruckSheet({ edit, user, onClose, onSaved }: { edit: Truck | null; user: CurrentUser; onClose: () => void; onSaved: (id: string) => void }) {
  const base = edit ?? EURO_TRUCK;
  const [t, setT] = useState({ name: edit?.name ?? '', l: String(base.length_cm), w: String(base.width_cm), h: String(base.height_cm) });
  const [asking, setAsking] = useState(false);
  const ok = t.name.trim() && cm(t.l) && cm(t.w) && cm(t.h);
  return (
    <Sheet
      open
      onClose={onClose}
      title={edit ? edit.name : 'Новая фура'}
      footer={
        <Button
          kind="primary"
          big
          full
          disabled={!ok}
          onClick={async () => {
            const fields = { name: t.name.trim(), length_cm: cm(t.l), width_cm: cm(t.w), height_cm: cm(t.h) };
            if (edit) {
              await put('trucks', { ...edit, ...fields });
              toast('Фура сохранена');
            } else {
              const id = newId();
              await put('trucks', { id, ...fields, created_by: user.full_name });
              onSaved(id);
              toast('Фура добавлена');
            }
            onClose();
          }}
        >
          Сохранить
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Название">
          <input className={inputCls} value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Фура 1, Малая, Реквизитная" autoComplete="off" />
        </Field>
        <span className="px-1 text-[13px] font-semibold text-muted">Кузов изнутри, см. По умолчанию — еврофура 1360 × 245 × 270.</span>
        <div className="grid grid-cols-3 gap-2">
          {(['l', 'w', 'h'] as const).map((k) => (
            <Field key={k} label={{ l: 'Длина', w: 'Ширина', h: 'Высота' }[k]}>
              <input className={inputCls} inputMode="numeric" value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value.replace(/\D/g, '') })} />
            </Field>
          ))}
        </div>
        {edit && (
          <Button full onClick={() => setAsking(true)}>
            Удалить фуру
          </Button>
        )}
      </div>
      {edit && (
        <Confirm
          open={asking}
          title={`Удалить «${edit.name}»?`}
          text="Фура пропадёт у всех. Схемы погрузки останутся — пересчитаются на другую фуру."
          okLabel="Удалить"
          onOk={async () => {
            await remove('trucks', edit.id);
            logEvent('loading.truck.delete', { name: edit.name.slice(0, 60) });
            toast('Фура удалена');
            onClose();
          }}
          onClose={() => setAsking(false)}
        />
      )}
    </Sheet>
  );
}

function ExtraSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (e: ExtraBox) => void }) {
  const [e, setE] = useState({ label: '', n: '1', l: '', w: '', h: '' });
  if (!open) return null;
  const ok = cm(e.n) && cm(e.l) && cm(e.w);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Временный ящик"
      footer={
        <Button
          kind="primary"
          big
          full
          disabled={!ok}
          onClick={() => {
            onAdd({ id: newId(), label: e.label.trim(), count: cm(e.n), l: cm(e.l), w: cm(e.w), h: cm(e.h) });
            setE({ label: '', n: '1', l: '', w: '', h: '' });
            onClose();
          }}
        >
          Добавить
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <span className="px-1 text-[13px] font-semibold text-muted">Только для этой схемы, в опись не попадает: сено, клетка, чужой груз.</span>
        <Field label="Что">
          <input className={inputCls} value={e.label} onChange={(ev) => setE({ ...e, label: ev.target.value })} placeholder="Сено, клетка…" autoComplete="off" />
        </Field>
        <div className="grid grid-cols-4 gap-2">
          {(['n', 'l', 'w', 'h'] as const).map((k) => (
            <Field key={k} label={{ n: 'Штук', l: 'Длина', w: 'Ширина', h: 'Высота' }[k]}>
              <input className={inputCls} inputMode="numeric" value={e[k]} onChange={(ev) => setE({ ...e, [k]: ev.target.value.replace(/\D/g, '') })} placeholder={k === 'n' ? '' : 'см'} />
            </Field>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function SaveSheet({ open, copy, onClose, onSave }: { open: boolean; copy: boolean; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  if (!open) return null;
  return (
    <Sheet
      open
      onClose={onClose}
      title={copy ? 'Копия схемы' : 'Сохранить схему'}
      footer={
        <Button
          kind="primary"
          big
          full
          disabled={!name.trim()}
          onClick={async () => {
            await onSave(name.trim());
            setName('');
            onClose();
          }}
        >
          Сохранить
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Название">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Основная, Без света, Малая фура" autoComplete="off" />
        </Field>
        <div className="flex flex-wrap gap-2">
          {['Основная', 'Без света', 'Малая фура'].map((x) => (
            <button key={x} type="button" onClick={() => setName(x)} className={`h-11 rounded-xl px-3.5 text-[14px] font-bold ${KEY}`}>
              {x}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
