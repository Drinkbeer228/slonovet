import { ELEPHANTS } from '../../domain/elephants';
import { cycleEaten, setFeedDone, setFeedGiven, setFeedKg, setHay } from '../../domain/actions';
import { categoryOf, feedUsage, weighedItem } from '../../domain/stock';
import { FEED_TIMES } from '../../domain/shift';
import type { CurrentUser, Diet, Eaten, Shift } from '../../domain/types';
import { useState } from 'react';
import { useRows } from '../../lib/store';
import { Card, DecimalInput, Section, Segmented, Sheet, Stepper, Tick } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { qtyText } from '../DietScreen';

const EATEN_LABEL: Record<Eaten, string> = { all: 'всё', half: '½', none: 'отказ' };
const EATEN_CLS: Record<Eaten, string> = {
  all: 'border-transparent bg-surface2 text-ink2',
  half: 'border-transparent bg-amber/15 text-amber',
  none: 'border-transparent bg-coral/15 text-coral',
};

/** «запарить за 20 мин» → «запарить в 12:40» */
function prepHint(time: string, prep: string): string {
  const m = prep.match(/запарить за (\d+)/);
  if (!m) return prep;
  const [h, mm] = time.split(':').map(Number);
  const t = h * 60 + mm - Number(m[1]);
  const at = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  return prep.replace(/запарить за \d+ мин/, `запарить в ${at}`);
}

export function mealTitle(diets: Diet[], time: string) {
  const meal = diets.find((d) => d.id === 'Претти')?.meals.find((m) => m.time === time) ?? diets[0]?.meals.find((m) => m.time === time);
  return { title: meal?.title ?? 'Кормление', prep: meal ? prepHint(time, meal.prep) : '' };
}

export function FeedingBlock({ shift, user }: { shift: Shift; user: CurrentUser }) {
  const diets = useRows('diets');
  const doneCount = FEED_TIMES.filter((t) => shift.feeds[t]?.done).length;
  const [recipe, setRecipe] = useState<string | null>(null);
  return (
    <Section
      id="sec-feeding"
      title="Кормление"
      aside={
        <button type="button" className="-my-3 px-1 py-3 font-bold text-teal" onClick={() => setRecipe(FEED_TIMES.find((t) => !shift.feeds[t]?.done) ?? FEED_TIMES[0])}>
          рецепты
        </button>
      }
    >
      <Card tone="glass" className="overflow-hidden">
        {FEED_TIMES.map((t) => {
          const f = shift.feeds[t];
          const done = Boolean(f?.done);
          const { title, prep } = mealTitle(diets, t);
          return (
            <div key={t} className="border-b border-surface2">
              <button
                type="button"
                role="checkbox"
                aria-checked={done}
                onClick={() => setFeedDone(shift, t, !done, user)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className={`w-12 text-[15px] font-extrabold ${done ? 'text-faint' : ''}`}>{t}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={`text-[15px] font-bold ${done ? 'text-faint' : ''}`}>{title}</span>
                  <span className="text-[12px] font-semibold text-muted">{done ? 'выдано' : prep}</span>
                </span>
                <Tick on={done} />
              </button>
              {done && (
                <div className="flex gap-2 px-4 pb-3">
                  {ELEPHANTS.map((el) => {
                    const e = f?.eaten?.[el] ?? 'all';
                    return (
                      <button
                        key={el}
                        type="button"
                        onClick={() => cycleEaten(shift, t, el)}
                        aria-label={`${el} съела: ${EATEN_LABEL[e]}. Нажми, чтобы изменить`}
                        className={`h-11 flex-1 rounded-[10px] border px-1 text-[13px] font-bold ${EATEN_CLS[e]}`}
                      >
                        {el} · {EATEN_LABEL[e]}
                      </button>
                    );
                  })}
                </div>
              )}
              {done && <GivenRows shift={shift} time={t} diets={diets} user={user} />}
              {done && weighedItem(diets, t) && <WeighRow kg={f?.kg ?? 0} onSave={(kg) => setFeedKg(shift, t, weighedItem(diets, t)!, kg, user)} />}
            </div>
          );
        })}
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">Сено, тюков</span>
            <span className="text-[12px] font-semibold text-muted">списывается само</span>
          </span>
          <Stepper label="Сено" value={shift.hay_bales} onChange={(v) => setHay(shift, v, user)} />
        </div>
      </Card>
      {doneCount > 0 && <p className="m-0 px-1 text-[12px] font-semibold text-muted">Корм списывается из запаса сам, по рациону, когда ставишь галочку. Овощи — по рациону в кг, поправь, если дали иначе.</p>}
      <RecipeSheet time={recipe} onTime={setRecipe} diets={diets} />
    </Section>
  );
}

/** Рецепт кормления шторкой снизу — посмотрел, смахнул, остался на месте. */
function RecipeSheet({ time, onTime, diets }: { time: string | null; onTime: (t: string | null) => void; diets: Diet[] }) {
  const { title, prep } = time ? mealTitle(diets, time) : { title: '', prep: '' };
  return (
    <Sheet open={time != null} onClose={() => onTime(null)} title="Рецепты">
      {time && (
        <div className="flex flex-col gap-4">
          <Segmented label="Кормление" value={time} onChange={onTime} options={FEED_TIMES.map((t) => ({ value: t, label: t }))} />
          <div className="flex flex-col gap-1.5">
            <span className="text-[17px] font-extrabold">{title}</span>
            {prep && (
              <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-amber/15 px-2.5 py-1 text-[13px] font-bold text-amber">
                <Icon name="clock" size={14} />
                {prep}
              </span>
            )}
          </div>
          {ELEPHANTS.map((el) => {
            const meal = diets.find((d) => d.id === el)?.meals.find((m) => m.time === time);
            return (
              <Card key={el} className="flex flex-col px-4 py-3">
                <span className="pb-1 text-[15px] font-extrabold text-teal">{el}</span>
                {meal?.items.length ? (
                  meal.items.map((it, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 border-t border-surface2 py-2">
                      <span className="text-[15px] text-ink2">{it.name}</span>
                      <span className={`whitespace-nowrap text-[15px] font-extrabold ${it.qty == null ? 'text-muted' : ''}`}>{qtyText(it.qty, it.unit)}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-[14px] text-muted">В рационе нет</span>
                )}
              </Card>
            );
          })}
          <p className="m-0 text-[12px] font-semibold text-muted">1 гарец — мерный совок. Рацион меняет врач в разделе «Рацион».</p>
        </div>
      )}
    </Sheet>
  );
}

/** Строка рациона «по весу» (без количества): кипер вписывает, сколько кг выдал, — столько и списывается. */
function WeighRow({ kg, onSave }: { kg: number; onSave: (kg: number) => void }) {
  return (
    <div className="flex items-center gap-3 px-4 pb-3">
      <span className="flex flex-1 flex-col">
        <span className="text-[14px] font-bold">Выдано по весу, кг</span>
        <span className={`text-[12px] font-semibold ${kg ? 'text-muted' : 'text-amber'}`}>{kg ? 'списано из запаса' : 'взвесь и впиши, сколько выдал'}</span>
      </span>
      <DecimalInput
        label="Выдано по весу, кг"
        value={kg || null}
        placeholder="0"
        onCommit={(v) => onSave(Math.max(0, v ?? 0))}
        className="w-24 py-2 text-right text-[18px] font-extrabold"
      />
    </div>
  );
}

/** Овощи и фрукты: списано по рациону в кг; дали больше или меньше — поправь число. */
function GivenRows({ shift, time, diets, user }: { shift: Shift; time: string; diets: Diet[]; user: CurrentUser }) {
  const items = useRows('stock_items');
  const usage = feedUsage(diets, time, items);
  const rows = [...usage.keys()]
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is NonNullable<typeof i> => Boolean(i && categoryOf(i) === 'veg'));
  if (!rows.length) return null;
  const given = shift.feeds[time]?.given ?? {};
  return (
    <div className="flex flex-col gap-1.5 px-4 pb-3">
      <span className="text-[12px] font-bold text-muted">Списано по рациону, кг — поправь, если дали иначе</span>
      {rows.map((it) => (
        <div key={it.id} className="flex items-center gap-3">
          <span className="flex-1 text-[14px] font-bold">{it.name}</span>
          <DecimalInput
            label={`${it.name}, кг`}
            value={given[it.id] ?? usage.get(it.id) ?? 0}
            placeholder="0"
            onCommit={(v) => setFeedGiven(shift, time, it.id, Math.max(0, v ?? 0), user)}
            className="w-24 py-2 text-right text-[16px] font-extrabold"
          />
        </div>
      ))}
    </div>
  );
}
