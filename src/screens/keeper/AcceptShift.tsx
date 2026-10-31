import { useState } from 'react';
import { SAFETY_CHECKS } from '../../domain/elephants';
import { acceptShift, takeOverShift } from '../../domain/actions';
import { acceptedBy, lastHanded } from '../../domain/shift';
import type { CurrentUser, Shift } from '../../domain/types';
import { useRows } from '../../lib/store';
import { isoDate, longDate } from '../../lib/dates';
import { Button, Card, Chip, KEY, Plate, Section, inputCls, toast, GlowIcon } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { PrevShiftSummary } from './PrevShiftSummary';

/** Быстрые замечания при приёме — чтобы не набирать руками. */
// частые косяки, которые оставляют сменщику (со слов слоноводов)
const REMARKS = [
  'Ссаная подстилка прикопана сухим сеном',
  'Слоны грязные — замыть пятна',
  'Сожран инструмент (веник, таз, бак)',
  'Багры покусаны',
  'Совок и скребок не помыты',
  'Инструмент не на месте',
  'Не убран навоз',
  'Мешки не вывезены',
  'Нет воды',
];

/**
 * handover — смену передают тебе: принимаешь, и в тот же миг прежняя закрывается (сервер).
 * takeover — дежурный не передал: заступаешь сам, прежняя закроется как «принята без сдачи».
 */
export function AcceptShift({ user, takeover, handover }: { user: CurrentUser; takeover?: Shift; handover?: Shift }) {
  const shifts = useRows('shifts');
  const last = lastHanded(shifts);
  // смену, которую уже кто-то принял, второй раз не принимаем по её коду
  const prev = takeover ?? handover ?? (last && !acceptedBy(shifts, last) ? last : undefined);
  const [checks, setChecks] = useState<Record<string, boolean | undefined>>({});
  const [remarks, setRemarks] = useState('');
  // каждый пункт: true — в порядке, false — не в порядке (уйдёт в замечания), нет ответа — пусто
  const allOk = SAFETY_CHECKS.every((c) => checks[c.key] !== undefined);
  const failed = SAFETY_CHECKS.filter((c) => checks[c.key] === false);
  const toggleRemark = (r: string) =>
    setRemarks((t) => {
      const parts = t.split('. ').map((x) => x.trim()).filter(Boolean);
      return (parts.includes(r) ? parts.filter((x) => x !== r) : [...parts, r]).join('. ');
    });

  return (
    <div className="flex flex-col gap-6">
      {/* без отрицательного отступа: область прокрутки шторки обрезала бы дату сверху */}
      <span className="px-1 text-[13px] font-semibold text-muted">{longDate(isoDate())}</span>

      {takeover && (
        <Plate glow="amber" halo className="flex gap-2.5 p-3.5">
          <GlowIcon glow="amber" icon="alert" />
          <span className="text-[14px] font-semibold leading-snug text-ink2">
            {takeover.keeper_name} не передал дежурство. Смена закроется как «принята без сдачи» — запишем, кто и когда заступил.
          </span>
        </Plate>
      )}

      {prev && <PrevShiftSummary prev={prev} />}

      <Section title="Проверка при приёме" aside={`${SAFETY_CHECKS.filter((c) => checks[c.key] !== undefined).length} из ${SAFETY_CHECKS.length}`}>
        <Card className="divide-y divide-edge overflow-hidden">
          {SAFETY_CHECKS.map((c) => (
            <YesNo key={c.key} label={c.label} value={checks[c.key]} onChange={(v) => setChecks((s) => ({ ...s, [c.key]: v }))} />
          ))}
        </Card>
        {failed.length > 0 && <p className="m-0 px-1 text-[13px] font-semibold text-amber-fg">Пункты с крестиком попадут в замечания прошлому дежурному.</p>}
        {!allOk && <p className="m-0 px-1 text-[13px] font-semibold text-muted">Проверку можно пропустить: ответь, что успеешь, ✓ или ✗</p>}
      </Section>

      {prev && (
        <Section title="Замечания при приёме" aside="если есть">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {REMARKS.map((r) => (
                <Chip key={r} tone="amber" on={remarks.includes(r)} onClick={() => toggleRemark(r)}>
                  {r}
                </Chip>
              ))}
            </div>
            <textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className={`${inputCls} resize-none`}
              placeholder="Что не так — останется у прошлого дежурного"
            />
          </div>
        </Section>
      )}

      {/* кнопка приёма всегда видна внизу шторки — не листать мимо проверки и замечаний */}
      <div className="sticky -bottom-4 z-10 -mx-5 -mb-4 border-t border-edge bg-bg px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <Button
          kind="accent"
          big
          full
          icon="shield"
          onClick={async () => {
            const all = [...failed.map((c) => `Не в порядке: ${c.label.toLowerCase()}`), remarks.trim()].filter(Boolean).join('. ');
            const safety = Object.fromEntries(SAFETY_CHECKS.map((c) => [c.key, checks[c.key] === true]));
            if (takeover) await takeOverShift(takeover, user, safety, all);
            else await acceptShift(user, safety, prev ? { id: prev.id, remarks: all } : null);
            toast(all ? 'Дежурство принято с замечаниями' : 'Дежурство принято');
          }}
        >
          {remarks.trim() || failed.length ? 'Принять с замечаниями' : 'Принять дежурство'}
        </Button>
      </div>
    </div>
  );
}

/** Пункт проверки: галочка — в порядке, крестик — не в порядке. Повторное нажатие снимает ответ. */
function YesNo({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  const btn = 'inline-flex h-11 w-11 items-center justify-center rounded-xl border';
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <span className={`flex-1 text-[15px] font-bold ${value === false ? 'text-coral-fg' : value ? 'text-faint' : ''}`}>{label}</span>
      <button
        type="button"
        aria-label={`${label}: в порядке`}
        aria-pressed={value === true}
        onClick={() => onChange(value === true ? undefined : true)}
        className={`${btn} ${
          value === true ? 'border-transparent bg-teal bg-[linear-gradient(to_bottom,rgb(255_255_255/var(--sheen-t)),transparent_55%)] text-teal-ink shadow-(--shadow-key-on)' : `${KEY} text-muted`
        }`}
      >
        <Icon name="check" size={20} stroke={2.6} />
      </button>
      <button
        type="button"
        aria-label={`${label}: не в порядке`}
        aria-pressed={value === false}
        onClick={() => onChange(value === false ? undefined : false)}
        className={`${btn} ${
          value === false
            ? 'border-transparent bg-coral bg-[linear-gradient(to_bottom,rgb(255_255_255/var(--sheen-t)),transparent_55%)] text-teal-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_0_16px_-4px_color-mix(in_srgb,var(--color-coral)_var(--glow),transparent)]'
            : `${KEY} text-muted`
        }`}
      >
        <Icon name="x" size={20} stroke={2.6} />
      </button>
    </div>
  );
}
