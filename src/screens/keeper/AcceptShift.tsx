import { useState } from 'react';
import { SAFETY_CHECKS } from '../../domain/elephants';
import { acceptShift, takeOverShift } from '../../domain/actions';
import { acceptedBy, lastHanded } from '../../domain/shift';
import type { CurrentUser, Shift } from '../../domain/types';
import { useRows } from '../../lib/store';
import { isoDate, longDate } from '../../lib/dates';
import { Button, Card, Chip, Plate, Section, inputCls, toast, GlowIcon } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { PrevShiftSummary } from './PrevShiftSummary';

/**
 * handover — смену передают тебе: принимаешь, и в тот же миг прежняя закрывается (сервер).
 * takeover — дежурный не передал: заступаешь сам, прежняя закроется как «принята без сдачи».
 */
export function AcceptShift({ user, takeover, handover }: { user: CurrentUser; takeover?: Shift; handover?: Shift }) {
  const shifts = useRows('shifts');
  const last = lastHanded(shifts);
  // смену, которую уже кто-то принял, второй раз не принимаем по её коду
  const prev = takeover ?? handover ?? (last && !acceptedBy(shifts, last) ? last : undefined);
  // по умолчанию всё в порядке: отмечают только «не так» и, если хотят, что именно (готовые замечания пункта)
  const [bad, setBad] = useState<Record<string, string[]>>({});
  const [remarks, setRemarks] = useState('');
  const failed = SAFETY_CHECKS.filter((c) => bad[c.key]);
  const toggleBad = (key: string) =>
    setBad((b) => {
      const next = { ...b };
      if (next[key]) delete next[key];
      else next[key] = [];
      return next;
    });
  const toggleIssue = (key: string, issue: string) =>
    setBad((b) => ({ ...b, [key]: b[key]?.includes(issue) ? b[key].filter((x) => x !== issue) : [...(b[key] ?? []), issue] }));

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

      <Section title="Проверь при приёме" aside="отмечай только «не так»">
        <Card className="divide-y divide-edge overflow-hidden">
          {SAFETY_CHECKS.map((c) => {
            const off = Boolean(bad[c.key]);
            return (
              <div key={c.key} className="flex flex-col">
                <button type="button" aria-pressed={off} onClick={() => toggleBad(c.key)} className="flex min-h-12 items-center gap-3 px-4 py-2 text-left">
                  <span className={`flex-1 text-[15px] font-bold ${off ? 'text-amber-fg' : ''}`}>{c.label}</span>
                  <span className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[13px] font-extrabold ${off ? 'bg-[color-mix(in_srgb,var(--color-amber)_var(--tint),transparent)] text-amber-fg' : 'text-teal-fg'}`}>
                    <Icon name={off ? 'x' : 'check'} size={16} stroke={2.6} />
                    {off ? 'не так' : 'в порядке'}
                  </span>
                </button>
                {off && c.issues.length > 0 && (
                  <div className="flex flex-wrap gap-2 px-4 pb-3">
                    {c.issues.map((r) => (
                      <Chip key={r} tone="amber" on={bad[c.key].includes(r)} onClick={() => toggleIssue(c.key, r)}>
                        {r}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
        {prev && (
          <textarea
            rows={2}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className={`${inputCls} resize-none`}
            placeholder="Что ещё не так — необязательно"
          />
        )}
        {(failed.length > 0 || remarks.trim()) && prev && <p className="m-0 px-1 text-[13px] font-semibold text-amber-fg">Замечания увидит прошлый дежурный.</p>}
      </Section>

      {/* кнопка приёма всегда видна внизу шторки — не листать мимо проверки и замечаний */}
      <div className="sticky -bottom-4 z-10 -mx-5 -mb-4 border-t border-edge bg-bg px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        <Button
          kind="accent"
          big
          full
          icon="shield"
          onClick={async () => {
            const all = [...failed.map((c) => `Не так: ${c.label.toLowerCase()}${bad[c.key].length ? ` — ${bad[c.key].join(', ')}` : ''}`), remarks.trim()].filter(Boolean).join('. ');
            const safety = Object.fromEntries(SAFETY_CHECKS.map((c) => [c.key, !bad[c.key]]));
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
