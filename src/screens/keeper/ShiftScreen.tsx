import { canReceiveHandover, canTakeShift, canWorkShift } from '../../domain/access';
import { useEffect, useState, type ReactNode } from 'react';
import { offerHandover, rolloverShift } from '../../domain/actions';
import { currentShift, dutyTodos, lastHanded, needsRollover, newShift, shiftFlags } from '../../domain/shift';
import type { CurrentUser, Shift } from '../../domain/types';
import { useRows } from '../../lib/store';
import { setPreviewSample, usePreviewRole, usePreviewSample } from '../../lib/preview';
import { isoDate, localDay, relDate, timeOf } from '../../lib/dates';
import { Button, Card, Chip, Plate, Section, Sheet, SwipeConfirm, toast } from '../../ui/kit';
import { Icon } from '../../ui/Icon';
import { NoteSheet, type NoteDraft } from '../common/NoteSheet';
import { carryFlags, durationText, noDutySince } from '../../domain/monitoring';
import { METRIC_LABEL } from '../../domain/elephants';
import { NotesList } from '../common/NotesList';
import { AcceptShift } from './AcceptShift';
import { FeedingBlock } from './FeedingBlock';
import { DutyBar, HandoverInvite } from './DutyBar';
import { QuestsBlock } from './QuestsBlock';
import { RequestsBlock } from './RequestsBlock';
import { StateMatrix } from './StateMatrix';
import { ShiftSummaryCard } from './ShiftSummaryCard';

/** Ведут дежурство только киперы (domain/access.ts). Остальные смотрят его как есть; назначения и лечение отмечают все. */
const canWork = (u: CurrentUser) => canWorkShift(u.role);

export function ShiftScreen({ user }: { user: CurrentUser }) {
  const shifts = useRows('shifts');
  const shift = currentShift(shifts);
  const [accepting, setAccepting] = useState(false);
  // «Посмотреть как»: принять нельзя (ничего не сохраняется) — показываем пример открытого дежурства в памяти
  const preview = usePreviewRole();
  const sample = usePreviewSample();
  // дежурный — один: свою смену ведёшь, чужую только смотришь (назначения не киперам — как раньше)
  if (shift) return <OpenShift shift={shift} user={user} readOnly={shift.keeper_id !== user.id} />;
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
  // никто не дежурит (самое начало или старые сданные смены): только «Принять дежурство»
  const accept = canTakeShift(user.role) && (
    <>
      <div>
        <Button kind="accent" big full icon="shield" onClick={() => setAccepting(true)}>
          Принять дежурство
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
          Дежурств ещё не было.{!canWork(user) && ' Здесь появится дежурство, как только кипер его примет.'} Как выглядит заполненная смена — образец в «Журнале».
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
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const handed = shift.status !== 'open';
  // назначения и записи о лечении — не только кипер: директор сам обработал Претти — отмечает, врач видит
  const keeper = canWorkShift(user.role);
  const canMark = !readOnly || !keeper;
  const stale = needsRollover(shift); // вторые сутки: 24 часа от приёма
  const mine = shift.keeper_id === user.id && !readOnly;
  // никто не дежурит: только приём; что было в прошлую смену — в шторке приёма и в «Журнале» по дате, здесь не повторяем
  const folded = Boolean(accept);
  // директор отмечает назначения и без приёма смены — у него они наверху, а не в свёрнутом
  const tasksUp = Boolean(accept) && !keeper;
  return (
    <div className="flex flex-col gap-6">
      {/* кто дежурит — одной строкой; тап — сводка и действия (передать, отменить, стать дежурным) */}
      {!accept && (
        <div className="flex flex-col gap-1.5">
          <DutyBar shift={shift} from={from} user={user} stale={stale} onHandover={() => setHandoverOpen(true)} />
          {readOnly && !keeper && <span className="px-1 text-[13px] font-semibold text-muted">Отмечает дежурный кипер. Назначения и записи о лечении — можешь и ты</span>}
        </div>
      )}

      {stale && mine && (
        <Plate glow="amber" className="flex flex-col gap-2 p-3.5">
          <span className="text-[14px] font-bold text-amber-fg">Смена идёт больше суток</span>
          {/* передать — одной кнопкой внизу экрана («Передать дежурство»), здесь не дублируем */}
          <Button kind="accent" full onClick={() => rolloverShift(shift, user)}>
            Новые сутки (я остаюсь)
          </Button>
          <span className="text-[13px] font-semibold text-muted">Уходишь — «Передать дежурство» внизу экрана.</span>
        </Plate>
      )}

      {accept && (
        <>
          <div className="flex flex-col gap-2">
            <NoDutyLine />
            {accept}
          </div>
          {tasksUp && <RequestsBlock shift={shift} user={user} />}
          {/* не кипер может записать процедуру и когда никто не дежурит */}
          {tasksUp && (
            <Button icon="plus" full onClick={() => setNoteDraft({ elephant: 'Претти', metric: null, kind: 'procedure' })}>
              Запись о лечении или фото
            </Button>
          )}
        </>
      )}

      {/* тебе передают — единственное, что требует действия: крупно и на виду */}
      {!accept && shift.handover_to === user.id && !mine && <HandoverInvite shift={shift} user={user} />}

      {!folded && (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          {/* inert — смотреть можно, нажимать нельзя */}
          <div className="flex flex-col gap-6">
            {!tasksUp && (
              <div inert={!canMark}>
                <RequestsBlock shift={shift} user={user} />
              </div>
            )}
            <div inert={readOnly}>
              <StateMatrix shift={shift} onNote={setNoteDraft} />
            </div>
          </div>
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-6" inert={readOnly}>
              <FeedingBlock shift={shift} user={user} />
              <QuestsBlock shift={shift} user={user} />
            </div>
            {/* записи — раздел с кнопкой в заголовке; пусто — только заголовок, без «пока нет» */}
            <Section
              id="sec-notes"
              title={notes.length ? `Записи · ${notes.length}` : 'Записи'}
              aside={
                !folded && (!handed || !keeper) && (mine || !keeper) ? (
                  <button
                    type="button"
                    onClick={() => setNoteDraft({ elephant: 'Претти', metric: null, kind: keeper ? 'observation' : 'procedure' })}
                    className="-my-3 inline-flex h-11 items-center gap-1 px-1 font-bold text-teal"
                  >
                    <Icon name="plus" size={16} stroke={2.6} />
                    Запись
                  </button>
                ) : undefined
              }
            >
              {notes.length > 0 && <NotesList notes={[...notes].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))} />}
            </Section>
            {/* заметки следующему больше нет: сводка «Сдаю» собирается сама; старые заметки — только показать */}
            {readOnly
              ? !accept &&
                shift.note.trim() && (
                  <Section id="sec-note" title="Заметка">
                    <Card className="px-4 py-3 text-[15px] leading-snug">{shift.note}</Card>
                  </Section>
                )
              : (
                <Button kind="primary" big full icon="check" onClick={() => setHandoverOpen(true)}>
                  Передать дежурство
                </Button>
              )}
          </div>
        </div>
      )}

      <NoteSheet draft={noteDraft} shiftId={shift.id} user={user} onClose={() => setNoteDraft(null)} />
      <HandoverSheet open={handoverOpen} shift={shift} user={user} onClose={() => setHandoverOpen(false)} />
    </div>
  );
}

function HandoverSheet({ open, shift, user, onClose }: { open: boolean; shift: Shift; user: CurrentUser; onClose: () => void }) {
  const requests = useRows('requests');
  const people = useRows('profiles').filter((p) => p.active && canReceiveHandover(p.role) && p.id !== user.id);
  const [toId, setToId] = useState<string | null>(null);
  const to = people.find((p) => p.id === toId);
  // заметку пишут прямо здесь, не закрывая шторку; сохраняем при выходе из поля и при сдаче
  const [note, setNote] = useState(shift.note);
  useEffect(() => {
    if (open) {
      setToId(shift.handover_to ?? null);
      setNote(shift.note);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const marks = useRows('request_marks');

  const reqLeft = dutyTodos(requests, marks, shift, isoDate()).filter((t) => !t.done);
  const flags = shiftFlags(shift);
  const carry = carryFlags(useRows('shifts'), shift);
  const warnings = [
    carry.length ? `Не проверено с прошлой смены: ${carry.map((f) => `${f.elephant} · ${METRIC_LABEL[f.metric].toLowerCase()}`).join(', ')}` : null,
    reqLeft.some((t) => t.req.elephant === 'work') ? `Не выполнено работы: ${reqLeft.filter((t) => t.req.elephant === 'work').length}` : null,
  ].filter(Boolean) as string[];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Передать дежурство"
      footer={
        // самое ответственное действие смены — свайпом (это и есть подтверждение); без сменщика неактивно.
        // Смена остаётся за тобой, пока сменщик не примет: дежурный есть всегда.
        <SwipeConfirm
          label={to ? `Проведи — передать: ${to.full_name}` : 'Выбери, кому передаёшь'}
          disabled={!to}
          onConfirm={async () => {
            await offerHandover(shift, note.trim(), to!.id);
            toast(`Передаёшь: ${to!.full_name}`);
            onClose();
          }}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Сдаю — собрано само</span>
          <ShiftSummaryCard shift={shift} today={isoDate()} />
        </div>
        {warnings.length > 0 && (
          <Plate glow="amber" halo className="flex flex-col gap-1.5 p-3.5">
            {warnings.map((w) => (
              <span key={w} className="flex items-start gap-2 text-[14px] font-semibold text-amber-fg">
                <Icon name="alert" size={16} className="mt-0.5" />
                {w}
              </span>
            ))}
          </Plate>
        )}
        {flags.length > 0 && <p className="m-0 px-1 text-[13px] font-semibold text-muted">Это увидит следующий дежурный и врач.</p>}
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Кому передаёшь</span>
          {people.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {people.map((p) => (
                <Chip key={p.id} on={toId === p.id} onClick={() => setToId(p.id)}>
                  {p.full_name}
                </Chip>
              ))}
            </div>
          ) : (
            <span className="px-1 text-[13px] font-semibold text-amber-fg">Передать некому: в «Персонале» нет других киперов</span>
          )}
        </div>
        <p className="m-0 px-1 text-[14px] font-semibold text-ink2">Всё, что не отмечено в таблице и в кормлении, уйдёт как норма.</p>
        <p className="m-0 text-[13px] font-semibold text-muted">Сменщик увидит «Дежурство передают» и нажмёт «Принять». До этого дежурный — {user.full_name}.</p>
      </div>
    </Sheet>
  );
}

/** «Сейчас никто не дежурит — с 08:00, 11 ч 28 мин»: дольше получаса — янтарём, слоны без присмотра. */
function NoDutyLine() {
  const gap = noDutySince(useRows('shifts'));
  if (!gap) return <p className="m-0 px-1 text-[14px] font-semibold text-ink2">Сейчас никто не дежурит.</p>;
  const long = gap.minutes >= 30;
  return (
    <p className={`m-0 px-1 text-[14px] font-semibold ${long ? 'text-amber-fg' : 'text-ink2'}`}>
      Сейчас никто не дежурит — с {relDate(localDay(gap.from))} {timeOf(gap.from)}
      {long ? `, уже ${durationText(gap.minutes)}` : ''}.
    </p>
  );
}

