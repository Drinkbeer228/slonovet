import { useState } from 'react';
import { LEVEL_LABEL, METRIC_LABEL, SAFETY_CHECKS } from '../../domain/elephants';
import { acceptShift } from '../../domain/actions';
import { acceptedBy, lastHanded, requestTodos, shiftFlags } from '../../domain/shift';
import type { CurrentUser } from '../../domain/types';
import { useRows } from '../../lib/store';
import { isoDate, longDate, relDate, timeOf } from '../../lib/dates';
import { getSession } from '../../lib/auth';
import { Button, Card, Chip, Section, inputCls, toast } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { WhyLink } from '../common/Why';

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

export function AcceptShift({ user }: { user: CurrentUser }) {
  const shifts = useRows('shifts');
  const requests = useRows('requests');
  const marks = useRows('request_marks');
  const last = lastHanded(shifts);
  // смену, которую уже кто-то принял, второй раз не принимаем по её коду
  const prev = last && !acceptedBy(shifts, last) ? last : undefined;
  const [checks, setChecks] = useState<Record<string, boolean | undefined>>({});
  const [remarks, setRemarks] = useState('');
  const [code, setCode] = useState('');
  // каждый пункт: true — в порядке, false — не в порядке (уйдёт в замечания), нет ответа — пусто
  const allOk = SAFETY_CHECKS.every((c) => checks[c.key] !== undefined);
  const failed = SAFETY_CHECKS.filter((c) => checks[c.key] === false);
  const needCode = Boolean(prev?.handover_code) && prev?.keeper_id !== user.id; // свою смену себе — без кода
  const ready = allOk && (!needCode || code.length === 4);
  const demo = getSession()?.mode === 'demo';
  const toggleRemark = (r: string) =>
    setRemarks((t) => {
      const parts = t.split('. ').map((x) => x.trim()).filter(Boolean);
      return (parts.includes(r) ? parts.filter((x) => x !== r) : [...parts, r]).join('. ');
    });
  const flags = shiftFlags(prev);
  const openReqs = prev ? requestTodos(requests, marks, { ...prev, date: isoDate(), id: '__new__' }).filter((t) => !t.done) : [];

  return (
    <div className="flex flex-col gap-6">
      <span className="-mt-2 px-1 text-[13px] font-semibold text-muted">{longDate(isoDate())}</span>

      {prev && (
        <Section title="От прошлого дежурства" aside={`${prev.keeper_name} · ${relDate(prev.handed_at?.slice(0, 10) ?? prev.date)} ${timeOf(prev.handed_at)}`}>
          <Card className="flex flex-col gap-3 p-4">
            {prev.note ? (
              <p className="m-0 text-[16px] leading-relaxed">{prev.note}</p>
            ) : (
              <p className="m-0 text-[15px] text-muted">Без заметок</p>
            )}
            {flags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {flags.map((f) => (
                  <span
                    key={`${f.elephant}-${f.metric}`}
                    className={`rounded-lg px-2.5 py-1 text-[13px] font-bold ${f.level === 2 ? 'bg-coral/15 text-coral' : 'bg-amber/15 text-amber'}`}
                  >
                    {f.elephant} · {METRIC_LABEL[f.metric].toLowerCase()} — {LEVEL_LABEL[f.level]}
                    {f.symptoms.length > 0 && <span className="font-semibold">: {f.symptoms.join(', ')}</span>}
                  </span>
                ))}
              </div>
            )}
            {openReqs.length > 0 && (
              <div className="flex items-center gap-2 text-[14px] font-semibold text-amber">
                <Icon name="message" size={18} />
                Назначений и задач на сегодня: {openReqs.length}
              </div>
            )}
          </Card>
        </Section>
      )}

      <Section title="Проверка при приёме" aside={`${SAFETY_CHECKS.filter((c) => checks[c.key] !== undefined).length} из ${SAFETY_CHECKS.length}`}>
        <Card className="divide-y divide-surface2 overflow-hidden">
          {SAFETY_CHECKS.map((c) => (
            <YesNo key={c.key} label={c.label} value={checks[c.key]} onChange={(v) => setChecks((s) => ({ ...s, [c.key]: v }))} />
          ))}
        </Card>
        {failed.length > 0 && <p className="m-0 px-1 text-[13px] font-semibold text-amber">Пункты с крестиком попадут в замечания прошлому дежурному.</p>}
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

      {needCode && (
        <Section title="Код от дежурного" aside={<WhyLink id="handover-code" label="зачем?" />}>
          <Card className="flex flex-col gap-2 p-4">
            <p className="m-0 text-[14px] text-ink2">
              Прошлый дежурный — {prev!.keeper_name} — диктует 4 цифры со своего телефона{demo ? ` (в примере — ${prev!.handover_code})` : ''}.
            </p>
            <input
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              aria-label="Код передачи дежурства"
              placeholder="• • • •"
              className={`${inputCls} text-center text-[28px] font-extrabold tracking-[0.5em]`}
            />
          </Card>
        </Section>
      )}

      <div className="flex flex-col gap-2">
        <Button
          kind="primary"
          big
          full
          icon="shield"
          disabled={!ready}
          onClick={async () => {
            if (needCode && code !== prev!.handover_code) {
              toast('Код не совпадает — переспроси', 'error');
              return;
            }
            const all = [...failed.map((c) => `Не в порядке: ${c.label.toLowerCase()}`), remarks.trim()].filter(Boolean).join('. ');
            await acceptShift(user, Object.fromEntries(SAFETY_CHECKS.map((c) => [c.key, checks[c.key] === true])), prev ? { id: prev.id, remarks: all } : null);
            toast(all ? 'Дежурство принято с замечаниями' : 'Дежурство принято');
          }}
        >
          {remarks.trim() || failed.length ? 'Принять с замечаниями' : 'Принять дежурство'}
        </Button>
        {!allOk && <p className="m-0 text-center text-[13px] font-semibold text-muted">Ответь на все пункты проверки: ✓ или ✗</p>}
        {allOk && needCode && code.length < 4 && <p className="m-0 text-center text-[13px] font-semibold text-muted">Введи код от дежурного</p>}
      </div>
    </div>
  );
}

/** Пункт проверки: галочка — в порядке, крестик — не в порядке. Повторное нажатие снимает ответ. */
function YesNo({ label, value, onChange }: { label: string; value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  const btn = 'inline-flex h-11 w-11 items-center justify-center rounded-xl border';
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <span className={`flex-1 text-[15px] font-bold ${value === false ? 'text-coral' : value ? 'text-faint' : ''}`}>{label}</span>
      <button
        type="button"
        aria-label={`${label}: в порядке`}
        aria-pressed={value === true}
        onClick={() => onChange(value === true ? undefined : true)}
        className={`${btn} ${value === true ? 'border-teal bg-teal text-bg' : 'border-line text-muted'}`}
      >
        <Icon name="check" size={20} stroke={2.6} />
      </button>
      <button
        type="button"
        aria-label={`${label}: не в порядке`}
        aria-pressed={value === false}
        onClick={() => onChange(value === false ? undefined : false)}
        className={`${btn} ${value === false ? 'border-coral bg-coral text-bg' : 'border-line text-muted'}`}
      >
        <Icon name="x" size={20} stroke={2.6} />
      </button>
    </div>
  );
}
