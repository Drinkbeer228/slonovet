import { EDITORS, canEdit as canEditSection } from '../domain/access';
import { useEffect, useState } from 'react';
import { ELEPHANTS } from '../domain/elephants';
import type { CurrentUser, Diet, ElephantName, MealUnit } from '../domain/types';
import { put, useRows } from '../lib/store';
import { fmtNum } from '../domain/stock';
import { plural } from '../lib/dates';
import { Button, Card, DecimalInput, ReadOnlyNote, Segmented, inputCls, toast } from '../ui/kit';
import { Icon } from '../ui/Icon';

const UNITS: MealUnit[] = ['кг', 'г', 'гарец'];

export function qtyText(qty: number | null, unit: MealUnit) {
  if (qty == null) return 'по весу';
  if (unit === 'гарец') {
    const word = Number.isInteger(qty) ? plural(qty, 'гарец', 'гарца', 'гарцев') : 'гарца';
    return `${fmtNum(qty)} ${word}`;
  }
  return `${fmtNum(qty)} ${unit}`;
}

export function DietScreen({ user }: { user: CurrentUser }) {
  const diets = useRows('diets');
  const [el, setEl] = useState<ElephantName>('Претти');
  const [editing, setEditing] = useState(false);
  const diet = diets.find((d) => d.id === el);
  const canEdit = canEditSection('diet', user.role);
  const [draft, setDraft] = useState<Diet | null>(null);

  useEffect(() => {
    setEditing(false);
    setDraft(null);
  }, [el]);

  const startEdit = () => {
    if (!diet) return;
    setDraft(JSON.parse(JSON.stringify(diet)) as Diet);
    setEditing(true);
  };

  const shown = editing && draft ? draft : diet;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3 px-1">
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight">Рацион</h1>
          {canEdit && !editing && (
            <Button icon="edit" onClick={startEdit}>
              Изменить
            </Button>
          )}
        </div>
        {!canEdit && <ReadOnlyNote who={EDITORS.diet.who} />}
      </header>

      <div data-tour="diet-el">
      <Segmented label="Слониха" value={el} onChange={setEl} options={ELEPHANTS.map((e) => ({ value: e, label: e }))} />
      </div>

      {!shown ? (
        <Card className="p-4 text-muted">Рацион не загружен</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['hay_kg', 'Сено в сутки', ''],
                ['branches_kg', 'Ветки в сутки', 'от '],
              ] as const
            ).map(([k, label, pre]) => (
              <Card key={k} className="flex flex-col gap-0.5 px-3.5 py-3">
                <span className="text-[12px] font-semibold text-muted">{label}</span>
                {editing && draft ? (
                  <DecimalInput label={label} className="mt-1 py-2" value={draft[k]} onCommit={(v) => setDraft({ ...draft, [k]: v })} />
                ) : (
                  <span className="text-[20px] font-extrabold">{shown[k] != null ? `${pre}${shown[k]} кг` : '—'}</span>
                )}
              </Card>
            ))}
          </div>

          {shown.meals.map((m, mi) => (
            <Card key={m.time} className="flex flex-col gap-2.5 px-4 py-3.5">
              <div className="flex items-baseline gap-3">
                <span className="text-[20px] font-extrabold text-teal">{m.time}</span>
                <h2 className="m-0 text-[17px] font-extrabold">{m.title}</h2>
              </div>
              {m.prep && (
                <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-amber/15 px-2.5 py-1 text-[13px] font-bold text-amber">
                  <Icon name="clock" size={14} />
                  {m.prep}
                </span>
              )}
              <div className="flex flex-col">
                {m.items.map((it, ii) => (
                  <div key={ii} className="flex items-center justify-between gap-3 border-t border-surface2 py-2">
                    <span className="text-[15px] font-medium text-ink2">{it.name}</span>
                    {editing && draft ? (
                      <span className="flex items-center gap-1.5">
                        <DecimalInput
                          label={`${it.name}, количество`}
                          className="w-20 py-2 text-right"
                          value={it.qty}
                          placeholder="—"
                          onCommit={(v) => {
                            const next = JSON.parse(JSON.stringify(draft)) as Diet;
                            next.meals[mi].items[ii].qty = v;
                            setDraft(next);
                          }}
                        />
                        <select
                          aria-label={`${it.name}, единица`}
                          className={`${inputCls} w-[86px] px-2 py-2`}
                          value={it.unit}
                          onChange={(e) => {
                            const next = JSON.parse(JSON.stringify(draft)) as Diet;
                            next.meals[mi].items[ii].unit = e.target.value as MealUnit;
                            setDraft(next);
                          }}
                        >
                          {UNITS.map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select>
                      </span>
                    ) : (
                      <span className={`whitespace-nowrap text-[15px] font-extrabold ${it.qty == null ? 'text-muted' : ''}`}>{qtyText(it.qty, it.unit)}</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
          {editing && (
            <div className="sticky bottom-24 flex gap-2 md:bottom-4">
              <Button full onClick={() => setEditing(false)} className="bg-bg">
                Отмена
              </Button>
              <Button
                kind="primary"
                full
                onClick={async () => {
                  if (draft) await put('diets', draft);
                  setEditing(false);
                  toast('Рацион сохранён');
                }}
              >
                Сохранить
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
