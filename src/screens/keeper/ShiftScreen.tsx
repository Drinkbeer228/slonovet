import { canReceiveHandover, canTakeShift, canWorkShift } from '../../domain/access';
import { useEffect, useState, type ReactNode } from 'react';
import { handOver, rolloverShift, updateShift } from '../../domain/actions';
import { FEED_TIMES, acceptedBy, currentShift, dutyTodos, lastHanded, needsRollover, newShift, shiftFlags } from '../../domain/shift';
import type { CurrentUser, Shift } from '../../domain/types';
import { useRows, useEffectiveDiets } from '../../lib/store';
import { setPreviewSample, usePreviewRole, usePreviewSample } from '../../lib/preview';
import { isoDate, localDay, longDate, relDate, timeOf } from '../../lib/dates';
import { Button, Card, Check, Chip, Plate, Section, Sheet, inputCls, toast } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { NoteSheet, type NoteDraft } from '../common/NoteSheet';
import { RoadBanner } from '../common/RoadBanner';
import { mealCancelled } from '../../domain/road';
import { NotesList } from '../common/NotesList';
import { AcceptShift } from './AcceptShift';
import { FeedingBlock } from './FeedingBlock';
import { HandedShift, HandoverBanner, NotHandedHint } from './HandedShift';
import { QuestsBlock } from './QuestsBlock';
import { RequestsBlock } from './RequestsBlock';
import { StateMatrix } from './StateMatrix';

/** Ведут дежурство только киперы (domain/access.ts). Остальные смотрят его как есть; назначения и лечение отмечают все. */
const canWork = (u: CurrentUser) => canWorkShift(u.role);

export function ShiftScreen({ user }: { user: CurrentUser }) {
  const shifts = useRows('shifts');
  const shift = currentShift(shifts);
  const [acceptOwn, setAcceptOwn] = useState(false);
  const [accepting, setAccepting] = useState(false);
  // «Посмотреть как»: принять нельзя (ничего не сохраняется) — показываем пример открытого дежурства в памяти
  const preview = usePreviewRole();
  const sample = usePreviewSample();
  if (shift) return <OpenShift shift={shift} user={user} readOnly={!(canWork(user) || shift.keeper_id === user.id)} />;
  if (sample && preview) {
    return (
      <div className="flex flex-col gap-4">
        <Plate glow="teal" className="flex items-center gap-3 p-3.5">
          <span className="flex-1 text-[13px] font-semibold text-muted">
            Пример: так выглядит открытое дежурство у кипера. Нажимать можно — ничего не сохраняется.
          </span>
          <Button onClick={() => setPreviewSample(null)}>Скрыть</Button>
        </Plate>
        <OpenShift shift={sample} user={user} readOnly={false} />
      </div>
    );
  }

  const last = lastHanded(shifts);
  // только что сдал сам — показываем код, пока сменщик не принял
  if (!acceptOwn && last?.keeper_id === user.id && last.handed_at && !acceptedBy(shifts, last)) {
    return <HandedShift shift={last} onAcceptOwn={() => setAcceptOwn(true)} />;
  }
  // никто не дежурит: видно последнее дежурство, проверка при приёме — в шторке
  const toMe = Boolean(last && last.handover_to === user.id && !acceptedBy(shifts, last));
  const accept = canTakeShift(user.role) && (
    <>
      {toMe && last && (
        <Plate glow="teal" halo className="flex flex-col gap-0.5 p-4">
          <span className="text-[17px] font-extrabold">Тебе сдали смену</span>
          <span className="text-[13px] font-semibold text-muted">
            {last.keeper_name}, {relDate(last.handed_at ? localDay(last.handed_at) : last.date)} в {timeOf(last.handed_at)}
            {last.note.trim() ? ` · «${last.note.trim()}»` : ''}
          </span>
        </Plate>
      )}
      <div>
        <Button kind="accent" big full icon="shield" onClick={() => setAccepting(true)}>
          {toMe ? 'Принять' : 'Принять дежурство'}
        </Button>
      </div>
      {preview && (
        <Button full icon="eye" onClick={() => setPreviewSample({ ...newShift(user, {}), id: 'preview-sample', updated_at: '' })}>
          Показать открытое дежурство (пример)
        </Button>
      )}
      <Sheet open={accepting} onClose={() => setAccepting(false)} title="Принять дежурство">
        <AcceptShift user={user} />
      </Sheet>
    </>
  );
  if (!last) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="m-0 px-1 text-[26px] font-extrabold tracking-tight">Дежурство</h1>
        <Card className="p-4 text-[15px] text-muted">
          Дежурств ещё не было.{!canWork(user) && ' Здесь появится дежурство, как только кипер его примет.'}
        </Card>
        {accept}
      </div>
    );
  }
  return <OpenShift shift={last} user={user} readOnly accept={accept} />;
}

function OpenShift({ shift, user, readOnly, accept }: { shift: Shift; user: CurrentUser; readOnly: boolean; accept?: ReactNode }) {
  const notes = useRows('notes').filter((n) => n.shift_id === shift.id);
  const from = useRows('shifts').find((s) => s.id === shift.accepted_from);
  const someoneElses = canTakeShift(user.role) && shift.keeper_id !== user.id && from?.keeper_id !== user.id;
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const handed = shift.status !== 'open';
  // назначения и записи о лечении — не только кипер: директор сам обработал Претти — отмечает, врач видит
  const keeper = canWorkShift(user.role);
  const canMark = !readOnly || !keeper;
  const stale = needsRollover(shift); // вторые сутки: 24 часа от приёма
  const mine = shift.keeper_id === user.id && !readOnly;

  return (
    <div className="flex flex-col gap-6">
      {/* компактный бар: кто дежурит, с какого часа и статус смены — в одну строку */}
      <header className="flex flex-col gap-1.5">
        <Card tone="glass" className="flex items-center gap-3 px-3.5 py-2.5">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-teal)_var(--tint),transparent)] text-[16px] font-extrabold text-teal-fg">
            {shift.keeper_name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="m-0 truncate text-[17px] font-extrabold leading-tight">{shift.keeper_name}</h1>
            <span className="truncate text-[13px] font-semibold text-muted">
              {longDate(shift.date)} · с {timeOf(shift.accepted_at)}
              {handed && ` · сдано ${relDate(shift.handed_at ? localDay(shift.handed_at) : shift.date)} в ${timeOf(shift.handed_at)}`}
            </span>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-extrabold ${
              stale
                ? 'bg-[color-mix(in_srgb,var(--color-amber)_var(--tint),transparent)] text-amber-fg'
                : handed
                  ? 'bg-surface2 text-ink2'
                  : 'bg-[color-mix(in_srgb,var(--color-teal)_var(--tint),transparent)] text-teal-fg'
            }`}
          >
            {stale && <Icon name="alert" size={12} stroke={3} />}
            {stale ? 'Больше суток' : handed ? 'Сдано' : 'На смене'}
          </span>
        </Card>
        {readOnly && !accept && (
          <span className="px-1 text-[13px] font-semibold text-muted">
            {keeper ? 'Только просмотр — отмечает дежурный кипер' : 'Отмечает дежурный кипер. Назначения и записи о лечении — можешь и ты'}
          </span>
        )}
      </header>
      <RoadBanner />

      {stale && mine && (
        <Plate glow="amber" className="flex flex-col gap-2 p-3.5">
          <span className="text-[14px] font-bold text-amber-fg">Смена идёт больше суток</span>
          {/* сдать — одной кнопкой внизу экрана («Сдать дежурство»), здесь не дублируем */}
          <Button kind="accent" full onClick={() => rolloverShift(shift, user)}>
            Новые сутки (я остаюсь)
          </Button>
          <span className="text-[13px] font-semibold text-muted">Уходишь — «Сдать дежурство» внизу экрана.</span>
        </Plate>
      )}

      {accept && (
        <div className="flex flex-col gap-2">
          <p className="m-0 px-1 text-[14px] font-semibold text-ink2">Сейчас никто не дежурит.</p>
          {accept}
        </div>
      )}


      {someoneElses && !readOnly && <NotHandedHint shift={shift} user={user} />}
      <HandoverBanner shift={shift} from={from} myId={user.id} />

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {/* inert — смотреть можно, нажимать нельзя */}
        <div className="flex flex-col gap-6">
          <div inert={!canMark}>
            <RequestsBlock shift={shift} user={user} />
          </div>
          <div inert={readOnly}>
            <StateMatrix shift={shift} onNote={setNoteDraft} />
          </div>
        </div>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-6" inert={readOnly}>
            <FeedingBlock shift={shift} user={user} />
            <QuestsBlock shift={shift} user={user} />
          </div>
          <Section id="sec-notes" title="Записи за дежурство" aside={notes.length ? String(notes.length) : undefined}>
            {notes.length > 0 && <NotesList notes={[...notes].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))} />}
            {/* запись может оставить любой; не кипер — и после сдачи (процедуру сделали, когда никто не дежурит) */}
            {(!handed || !keeper) && (
              <Button icon="plus" full onClick={() => setNoteDraft({ elephant: 'Претти', metric: null, kind: keeper ? 'observation' : 'procedure' })}>
                {keeper ? 'Запись или фото' : 'Запись о лечении или фото'}
              </Button>
            )}
            {handed && !notes.length && <Card className="px-4 py-3 text-[15px] text-muted">Записей нет</Card>}
          </Section>
          {readOnly ? (
            <Section id="sec-note" title="Следующему дежурному">
              <Card className="px-4 py-3 text-[15px] leading-snug">{shift.note.trim() || <span className="text-muted">Без заметки</span>}</Card>
            </Section>
          ) : (
            <>
              <HandoverNote shift={shift} />
              <Button kind="primary" big full onClick={() => setHandoverOpen(true)}>
                Сдать дежурство
              </Button>
            </>
          )}
        </div>
      </div>

      <NoteSheet draft={noteDraft} shiftId={shift.id} user={user} onClose={() => setNoteDraft(null)} />
      <HandoverSheet open={handoverOpen} shift={shift} user={user} onClose={() => setHandoverOpen(false)} />
    </div>
  );
}

function HandoverNote({ shift }: { shift: Shift }) {
  const [text, setText] = useState(shift.note);
  useEffect(() => setText(shift.note), [shift.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Section id="sec-note" title="Передать следующему дежурному">
      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== shift.note && updateShift(shift, (s) => void (s.note = text))}
        placeholder="Что важно знать следующему дежурному"
        aria-label="Заметка следующему дежурному"
        className={`${inputCls} resize-none`}
      />
    </Section>
  );
}

function HandoverSheet({ open, shift, user, onClose }: { open: boolean; shift: Shift; user: CurrentUser; onClose: () => void }) {
  const requests = useRows('requests');
  const people = useRows('profiles').filter((p) => p.active && canReceiveHandover(p.role) && p.id !== user.id);
  const [checked, setChecked] = useState(false);
  const [toId, setToId] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setChecked(false);
      setToId(null);
    }
  }, [open]);
  const marks = useRows('request_marks');

  const { diets: roadDiets, base: baseDiets } = useEffectiveDiets();
  const feedsLeft = FEED_TIMES.filter((t) => !shift.feeds[t]?.done && !mealCancelled(baseDiets, roadDiets, t));
  const reqLeft = dutyTodos(requests, marks, shift, isoDate()).filter((t) => !t.done);
  const flags = shiftFlags(shift);
  const warnings = [
    feedsLeft.length ? `Не отмечено кормление: ${feedsLeft.join(', ')}` : null,
    reqLeft.length ? `Не выполнено назначений и задач: ${reqLeft.length}` : null,
  ].filter(Boolean) as string[];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Сдать дежурство"
      footer={
        <Button
          kind="accent"
          big
          full
          disabled={!checked}
          onClick={async () => {
            await handOver(shift, shift.note.trim(), toId);
            toast('Дежурство сдано');
            onClose();
          }}
        >
          Сдать
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {warnings.length > 0 ? (
          <Plate glow="amber" halo className="flex flex-col gap-1.5 p-3.5">
            {warnings.map((w) => (
              <span key={w} className="flex items-start gap-2 text-[14px] font-semibold text-amber-fg">
                <Icon name="alert" size={16} className="mt-0.5" />
                {w}
              </span>
            ))}
          </Plate>
        ) : (
          <Plate glow="teal" className="flex items-center gap-2 p-3.5 text-[14px] font-bold text-teal-fg">
            <Icon name="check" size={18} stroke={2.6} />
            Всё отмечено
          </Plate>
        )}
        {flags.length > 0 && (
          <p className="m-0 text-[14px] font-semibold text-ink2">
            Отклонения ({flags.length}) увидит следующий дежурный и врач.
          </p>
        )}
        {people.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="px-1 text-[14px] font-bold text-muted">Кому сдаёшь</span>
            <div className="flex flex-wrap gap-2">
              {people.map((p) => (
                <Chip key={p.id} on={toId === p.id} onClick={() => setToId(toId === p.id ? null : p.id)}>
                  {p.full_name}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Следующему дежурному</span>
          <Card className="px-4 py-3 text-[15px] leading-snug">
            {shift.note.trim() ? shift.note : <span className="text-muted">Без заметки. Можно написать на экране, в блоке «Передать следующему дежурному».</span>}
          </Card>
        </div>
        <Plate glow="teal" halo={checked}>
          <Check
            on={checked}
            label="Осмотрел всех трёх и проверил тазы"
            sub="всё, что не отмечено в таблице и в кормлении, — норма"
            onChange={setChecked}
          />
        </Plate>
        <p className="m-0 text-[13px] font-semibold text-muted">Сменщик увидит у себя «Тебе сдали смену» и нажмёт «Принять». Не увидит (нет связи), заступит сам.</p>
      </div>
    </Sheet>
  );
}
