import { useMemo } from 'react';
import { healthAlerts, type HealthItem } from '../../domain/health';
import { useRows } from '../../lib/store';
import { relDate, shortDate } from '../../lib/dates';
import { Card, LEVEL_DOT, Plate } from '../../ui/kit';
import { Icon } from '../../ui/Icon';

const dayText = (a: HealthItem) => (a.day <= 1 ? relDate(a.since) : `${a.day}-й день, с ${shortDate(a.since)}`);

function Line({ a, level }: { a: HealthItem; level: 1 | 2 }) {
  return (
    <span className="flex items-start gap-2 text-[15px] font-bold leading-snug">
      <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[level]}`} />
      <span>
        {a.el}: {a.text}
        {a.symptoms.length > 0 && <span className="font-semibold text-ink2"> ({a.symptoms.join(', ')})</span>}
        <span className="font-semibold text-muted"> · {dayText(a)}</span>
      </span>
    </span>
  );
}

/** Кнопки звонка врачам, у которых в профиле есть телефон. */
export function CallVet() {
  const vets = useRows('profiles').filter((p) => p.active && p.role === 'vet' && p.phone?.trim());
  if (!vets.length) return <span className="text-[13px] font-semibold text-muted">Телефона врача нет — его вписывают в «Персонале».</span>;
  return (
    <div className="flex flex-col gap-2">
      {vets.map((v) => (
        <a
          key={v.id}
          href={`tel:${v.phone!.replace(/[^\d+]/g, '')}`}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-coral text-[16px] font-extrabold text-bg"
        >
          <Icon name="phone" size={18} />
          Позвонить врачу: {v.full_name}
        </a>
      ))}
    </div>
  );
}

/**
 * Наверху журнала. «Тревога» (плохо, отказ от еды) — коралловая плита со звонком врачу.
 * «В процедурах» — спокойный список: «внимание» тут рабочая пометка (лечение, наблюдение), а не повод для паники.
 */
export function AlertsCard() {
  const shifts = useRows('shifts');
  const { alarms, procedures } = useMemo(() => healthAlerts(shifts), [shifts]);
  if (!alarms.length && !procedures.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {alarms.length > 0 && (
        <Plate glow="coral" halo className="flex flex-col gap-2 p-4">
          <span className="text-[12px] font-extrabold tracking-wide text-coral-fg">ТРЕВОГА</span>
          {alarms.map((a, i) => (
            <Line key={i} a={a} level={2} />
          ))}
          <CallVet />
        </Plate>
      )}
      {procedures.length > 0 && (
        <Card className="flex flex-col gap-1.5 p-4">
          <span className="text-[12px] font-extrabold tracking-wide text-muted">В ПРОЦЕДУРАХ И ПОД НАБЛЮДЕНИЕМ</span>
          {procedures.map((a, i) => (
            <Line key={i} a={a} level={1} />
          ))}
        </Card>
      )}
    </div>
  );
}
