import { useEffect, useState, type ReactNode } from 'react';
import { logEvent } from '../../lib/log';
import { ELEPHANTS } from '../../domain/elephants';
import { FREQ_LABEL, answerPresets, currentShift, onRestDay, overdue, requestProgress, requestTodos, whenLabel, whoLabel, type RequestTodo } from '../../domain/shift';
import { addMark, setPurchaseStatus } from '../../domain/actions';
import { GROUPS, GROUP_TITLE, boardAttention, boardGroups, type BoardFilter, type BoardItem, type BoardType } from '../../domain/board';
import type { CurrentUser, ElephantName, Purchase, RequestFrequency, Shift, VetRequest } from '../../domain/types';
import { newId, put, useRows } from '../../lib/store';
import { savePhoto } from '../../lib/photos';
import { addDays, isoDate, localDay, relDate, shortDate, stampOf } from '../../lib/dates';
import { Button, Card, Check, Chip, Confirm, DateInput, Empty, Field, FilePreview, KEY, LateBadge, Meter, PhotoPick, PhotoThumb, Plate, Section, Segmented, Sheet, UrgentBadge, inputCls, toast, type Glow } from '../../ui/kit';
import { canCloseRequest, canEdit } from '../../domain/access';
import { Icon } from '../../ui/Icon';
import { TASK_TYPE } from '../taskType';
import { ArriveSheet, NewPurchaseSheet, OrderSheet, PurchaseDetail, PurchaseRow } from '../PurchasesView';
import { DiscussionThread } from '../Discussion';
import { MarkLine, MarkSheet } from '../keeper/RequestsBlock';
import { unreadCount, useReadMarks } from '../../lib/comments';

const VIEW_KEY = 'slonovet_requests_view';

const FILTERS: { value: BoardFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'elephants', label: 'Слоны' },
  { value: 'work', label: 'Работа' },
  { value: 'purchases', label: 'Закупки' },
];

/** «Задачи» — доска коллектива: назначения по слонам, хоздела и закупки по группам во времени. */
export function RequestsScreen({ user }: { user: CurrentUser }) {
  const requests = useRows('requests');
  const purchases = useRows('purchases');
  const marks = useRows('request_marks');
  const [creating, setCreating] = useState<ElephantName | 'all' | 'work' | null>(null);
  const [open, setOpen] = useState<VetRequest | null>(null);
  const [buying, setBuying] = useState(false);
  const [openBuy, setOpenBuy] = useState<Purchase | null>(null);
  const [ordering, setOrdering] = useState<Purchase | null>(null);
  const [arriving, setArriving] = useState<Purchase | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [view, setViewState] = useState<BoardFilter>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === 'all' || v === 'elephants' || v === 'work' || v === 'purchases') return v;
      if (v === 'requests') return 'elephants'; // сохранено до разделения
    } catch {
      /* без хранилища — по роли */
    }
    return user.role === 'manager' ? 'purchases' : 'all';
  });
  const setView = (v: BoardFilter) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* не запомнится — не беда */
    }
  };
  const groups = boardGroups(requests, purchases, marks, view);
  const attention = boardAttention(requests, purchases, marks);
  const dots = { elephants: attention.elephants > 0, work: attention.work > 0, purchases: attention.purchases > 0 };
  const buyer = canEdit('purchases', user.role);
  const arrive = (p: Purchase) => (p.item_id ? setArriving(p) : setPurchaseStatus(p, 'done', user).then(() => toast('Отмечено: привезли')));
  const empty = GROUPS.every((g) => groups[g].length === 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3 px-1">
        <h1 className="m-0 text-[26px] font-extrabold tracking-tight">Задачи</h1>
        {/* на «Закупках» — сразу форма закупки; иначе задача (на «Работе» — уже с адресатом «Работа»).
            На телефоне кнопка висит справа над нижней панелью — под большим пальцем; на широком экране — в шапке */}
        <div className="fixed right-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-20 md:static">
          <Button kind="accent" big icon="plus" onClick={() => (view === 'purchases' ? setBuying(true) : setCreating(view === 'work' ? 'work' : 'Претти'))}>
            {view === 'purchases' ? 'Купить' : 'Новая'}
          </Button>
        </div>
      </header>
      <div>
        <Segmented label="Какие задачи" value={view} onChange={setView} options={FILTERS} dots={dots} />
      </div>
      {empty && <Empty>{view === 'purchases' ? 'Ничего не просили купить' : 'Задач нет'}</Empty>}
      {GROUPS.map((g) => {
        const list = groups[g];
        if (!list.length) return null;
        const closed = g === 'closed';
        return (
          <Section
            key={g}
            id={g === 'today' ? 'requests-active' : undefined}
            title={
              <span className="flex items-center gap-2">
                {GROUP_TITLE[g]}
                <span className="rounded-full border border-edge-hi bg-surface2 px-2 py-0.5 text-[13px] font-bold text-ink2 shadow-[inset_0_1px_0_var(--color-hl)]">{list.length}</span>
              </span>
            }
            aside={
              closed ? (
                <button type="button" onClick={() => setShowClosed(!showClosed)} className="-mr-2 -my-2 flex h-11 items-center px-2 font-bold text-teal">
                  {showClosed ? 'Скрыть' : 'Показать'}
                </button>
              ) : undefined
            }
          >
            {(!closed || showClosed) && (
              <div className="flex flex-col gap-2.5">
                {list.map((i) =>
                  i.kind === 'request' ? (
                    <BoardRequest key={i.req.id} item={i} user={user} onOpen={setOpen} />
                  ) : (
                    <BoardCard key={i.p.id} type="purchases" label={TASK_TYPE.purchases.label} urgent={i.p.urgent && (i.p.status === 'new' || i.p.status === 'ordered')}>
                      <PurchaseRow p={i.p} buyer={buyer} onOpen={setOpenBuy} onOrder={setOrdering} onArrive={arrive} />
                    </BoardCard>
                  ),
                )}
              </div>
            )}
          </Section>
        );
      })}
      {/* место под плавающую кнопку, чтобы она не закрывала последнюю карточку */}
      <div className="h-16 md:hidden" aria-hidden="true" />
      <NewRequestSheet
        initial={creating}
        user={user}
        onClose={() => setCreating(null)}
        onBuy={() => {
          setCreating(null);
          setBuying(true);
        }}
      />
      <NewPurchaseSheet open={buying} user={user} onClose={() => setBuying(false)} />
      <PurchaseDetail purchase={openBuy} user={user} onClose={() => setOpenBuy(null)} />
      <OrderSheet purchase={ordering} user={user} onClose={() => setOrdering(null)} />
      <ArriveSheet purchase={arriving} user={user} onClose={() => setArriving(null)} />
      <RequestDetail req={open} user={user} onClose={() => setOpen(null)} />
    </div>
  );
}

/**
 * Плита карточки на доске: свечение по левому краю цветом типа (слоны — teal, работа — sky, закупка — violet),
 * у срочного и просроченного — coral. Тип читается и по иконке с подписью, не только по свету.
 */
function BoardCard({
  type,
  label,
  right,
  urgent,
  late,
  children,
}: {
  type: BoardType;
  label: string;
  right?: ReactNode;
  urgent?: boolean;
  late?: boolean;
  children: ReactNode;
}) {
  const t = TASK_TYPE[type];
  const glow: Glow = urgent || late ? 'coral' : t.glow;
  return (
    <Plate glow={glow} halo={urgent} className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 text-[13px] font-extrabold ${t.text}`}>
          <Icon name={t.icon} size={15} />
          {label}
        </span>
        {right}
      </div>
      {children}
    </Plate>
  );
}

function BoardRequest({ item, user, onOpen }: { item: Extract<BoardItem, { kind: 'request' }>; user: CurrentUser; onOpen: (r: VetRequest) => void }) {
  const marks = useRows('request_marks');
  const shifts = useRows('shifts');
  const comments = useRows('request_comments');
  const read = useReadMarks(user.id);
  const r = item.req;
  const shift = currentShift(shifts);
  const p = requestProgress(r, marks, shifts);
  const courseOver = r.frequency !== 'once' && Boolean(r.due_date && r.due_date < isoDate());
  const closed = r.status === 'closed' || (r.frequency === 'once' && p.done > 0) || courseOver;
  const late = !closed && overdue(r, p.done > 0);
  const talk = comments.filter((c) => c.request_id === r.id && !c.deleted).length;
  const fresh = unreadCount(comments, r.id, user.id, read[r.id]);
  // в открытом дежурстве ответить можно прямо с доски — без шторки
  const todo = shift && !closed && r.status === 'active' ? requestTodos([r], marks, shift, isoDate())[0] : undefined;
  const profiles = useRows('profiles');
  const assignee = r.assignee_id ? profiles.find((x) => x.id === r.assignee_id) : undefined;
  const resting = Boolean(assignee && !closed && onRestDay(assignee.id, shifts));
  return (
    <BoardCard
      type={item.type}
      urgent={!closed && r.urgent}
      late={late}
      label={item.type === 'work' ? TASK_TYPE.work.label : whoLabel(r.elephant)}
      right={
        <span className="flex items-center gap-1.5">
          {r.urgent && !closed && <UrgentBadge />}
          {late && <LateBadge />}
        </span>
      }
    >
      <button type="button" onClick={() => onOpen(r)} className="-mx-1 flex flex-col gap-1.5 rounded-xl px-1 py-0.5 text-left">
        <span className={`text-[15px] font-semibold leading-snug ${closed ? 'text-ink2' : ''}`}>
          {r.text}
          {r.photo_path && <span className="text-[13px] font-bold text-muted"> · фото</span>}
        </span>
        <span className={`flex items-center gap-1.5 text-[13px] font-bold ${late ? 'text-coral' : 'text-ink2'}`}>
          {late && <Icon name="alert" size={14} />}
          {r.status === 'closed' ? 'закрыта' : courseOver ? 'курс окончен' : `${whenLabel(r) || FREQ_LABEL[r.frequency]}${r.due_date ? ` · до ${shortDate(r.due_date)}` : ''}`}
          {r.needs_photo && !closed ? ' · нужно фото' : ''}
        </span>
        {r.frequency !== 'once' && !closed && (
          <Meter value={p.total ? p.done / p.total : 0} tone={TASK_TYPE[item.type].glow} label="Выполнено дежурств" />
        )}
        <span className="text-[13px] font-semibold text-muted">
          Поставил: {r.author_name}, {relDate(localDay(r.created_at))}
          {r.frequency !== 'once' ? ` · ${p.done} из ${p.total} ${p.total === 1 ? 'дежурства' : 'дежурств'}` : !p.last ? ' · ждёт отметки' : ''}
          {todo && !todo.done && r.frequency !== 'once' ? ' · в этой смене не отмечено' : ''}
        </span>
        {assignee && (
          <span className={`text-[13px] font-bold ${resting ? 'text-amber-fg' : 'text-ink2'}`}>
            Поручено: {assignee.full_name}
            {resting ? ' · на отсыпном' : ''}
          </span>
        )}
        {talk > 0 && (
          <span className={`text-[13px] font-bold ${fresh ? 'text-coral' : 'text-muted'}`}>
            Обсуждение · {talk}
            {fresh ? ` · новых ${fresh}` : ''}
          </span>
        )}
      </button>
      {p.last && <MarkLine m={p.last} req={r} user={user} shiftKeeper={shift?.keeper_id ?? null} withDay />}
      {todo && !todo.done && shift && <QuickMark req={r} todo={todo} shift={shift} user={user} onPhoto={() => onOpen(r)} />}
    </BoardCard>
  );
}

/** Ответ одной кнопкой прямо на доске (как на «Дежурстве»); задача с фото открывает карточку. */
function QuickMark({ req, todo, shift, user, onPhoto }: { req: VetRequest; todo: RequestTodo; shift: Shift; user: CurrentUser; onPhoto: () => void }) {
  const mark = async (answer = '') => {
    await addMark(req.id, shift, user, answer);
    toast(answer ? `Отмечено: ${answer}` : 'Отмечено');
  };
  if (req.needs_photo) {
    return (
      <Button icon="camera" full onClick={onPhoto}>
        Отметить с фото
      </Button>
    );
  }
  if (req.options?.length) {
    return (
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(req.options.length, 3)}, minmax(0, 1fr))` }}>
        {req.options.map((o) => (
          <button key={o} type="button" onClick={() => mark(o)} className={`h-11 min-w-0 truncate rounded-xl px-2 text-[15px] font-extrabold text-ink ${KEY}`}>
            {o}
          </button>
        ))}
      </div>
    );
  }
  return (
    <Button kind="accent" icon="check" full onClick={() => mark()}>
      {todo.needed > 1 ? `Отметить (${todo.marks.length} из ${todo.needed})` : 'Выполнено'}
    </Button>
  );
}

function RequestDetail({ req, user, onClose }: { req: VetRequest | null; user: CurrentUser; onClose: () => void }) {
  const marks = useRows('request_marks');
  const shift = currentShift(useRows('shifts'));
  const [confirm, setConfirm] = useState(false);
  const [marking, setMarking] = useState(false);
  if (!req) return null;
  // отметить может любой (директор сам обработал Претти) — но только в открытое дежурство и если в нём ещё не отмечено
  const todo = shift && req.status === 'active' ? requestTodos([req], marks, shift, isoDate())[0] : undefined;
  const mine = marks.filter((m) => m.request_id === req.id).sort((a, b) => (a.done_at < b.done_at ? 1 : -1));
  return (
    <Sheet
      open
      onClose={onClose}
      title={whoLabel(req.elephant)}
      footer={
        canCloseRequest(req, user) && (
          <div className="flex gap-2">
            {req.status === 'active' ? (
              <Button full onClick={() => setConfirm(true)}>
                Закрыть задачу
              </Button>
            ) : (
              <Button
                full
                onClick={async () => {
                  await put('requests', { ...req, status: 'active' });
                  onClose();
                }}
              >
                Вернуть в работу
              </Button>
            )}
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[16px] font-medium leading-relaxed">{req.text}</p>
        {req.photo_path && <PhotoThumb path={req.photo_path} size={140} />}
        <span className="text-[13px] font-semibold text-muted">
          {whenLabel(req) || FREQ_LABEL[req.frequency]}
          {req.due_date ? ` · до ${shortDate(req.due_date)}` : ''}
          {req.needs_photo ? ' · с фото' : ''} · {stampOf(req.created_at)} · {req.author_name}
        </span>
        {todo && !todo.done && (
          <div className="flex flex-col gap-2">
            {req.needs_photo ? (
              <Button kind="primary" icon="camera" full onClick={() => setMarking(true)}>
                Отметить с фото
              </Button>
            ) : req.options?.length ? (
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(req.options.length, 3)}, minmax(0, 1fr))` }}>
                {req.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={async () => {
                      await addMark(req.id, shift!, user, o);
                      toast(`Отмечено: ${o}`);
                    }}
                    className={`h-11 rounded-xl px-2 text-[15px] font-extrabold text-ink ${KEY}`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            ) : (
              <Button
                kind="primary"
                icon="check"
                full
                onClick={async () => {
                  await addMark(req.id, shift!, user);
                  toast('Отмечено');
                }}
              >
                Отметить выполнение
              </Button>
            )}
          </div>
        )}
        <Section title="Выполнение" aside={String(mine.length)}>
          {mine.length === 0 ? (
            <Empty>Пока не отмечено</Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {mine.map((m) => (
                <Card key={m.id} className="p-3">
                  <MarkLine m={m} req={req} user={user} shiftKeeper={shift?.keeper_id ?? null} withDay />
                </Card>
              ))}
            </div>
          )}
        </Section>
        <Section title="Обсуждение">
          <DiscussionThread req={req} user={user} />
        </Section>
      </div>
      {shift && todo && <MarkSheet todo={marking ? todo : null} answer="" shift={shift} user={user} onClose={() => setMarking(false)} />}
      <Confirm
        open={confirm}
        title="Закрыть задачу?"
        text="Киперы перестанут её видеть."
        okLabel="Закрыть"
        onOk={async () => {
          await put('requests', { ...req, status: 'closed' });
          toast('Задача закрыта');
          onClose();
        }}
        onClose={() => setConfirm(false)}
      />
    </Sheet>
  );
}

/** «Когда»: разовая сегодня, разовая на день (и час), курс — каждое дежурство или кормление до числа */
type When = 'today' | 'date' | 'course';
const WHEN: { value: When; label: string }[] = [
  { value: 'today', label: 'Сегодня' },
  { value: 'date', label: 'На дату' },
  { value: 'course', label: 'Курс' },
];

export function NewRequestSheet({
  initial,
  user,
  onClose,
  onBuy,
}: {
  initial: ElephantName | 'all' | 'work' | null;
  user: CurrentUser;
  onClose: () => void;
  /** «Купить? → Закупки»: хоздело «купить» на самом деле закупка — открыть её форму */
  onBuy?: () => void;
}) {
  const [who, setWho] = useState<ElephantName | 'all' | 'work'>('Претти');
  const [text, setText] = useState('');
  const [when, setWhen] = useState<When>('today');
  const [courseFreq, setCourseFreq] = useState<Exclude<RequestFrequency, 'once'>>('shift');
  const [until, setUntil] = useState(addDays(isoDate(), 3));
  const [onDate, setOnDate] = useState(isoDate());
  const [atTime, setAtTime] = useState('');
  const [photo, setPhoto] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [own, setOwn] = useState('');
  const [authorPhoto, setAuthorPhoto] = useState<File | null>(null);
  const [assignee, setAssignee] = useState<string | null>(null);
  // поручают киперам; директор ставит задачи и следит, исполнителем не числится
  const people = useRows('profiles').filter((p) => p.active && p.role === 'keeper');
  const shifts = useRows('shifts');
  const resting = assignee ? people.find((p) => p.id === assignee && onRestDay(p.id, shifts)) : undefined;

  useEffect(() => {
    if (initial) {
      setAuthorPhoto(null);
      setWho(initial);
      setText('');
      setWhen('today');
      setCourseFreq('shift');
      setUntil(addDays(isoDate(), 3));
      setOnDate(isoDate());
      setAtTime('');
      setPhoto(false);
      setUrgent(false);
      setOptions([]);
      setOwn('');
      setAssignee(null);
    }
  }, [initial]);

  return (
    <Sheet
      open={initial !== null}
      onClose={onClose}
      title="Назначение или задача"
      footer={
        <Button
          kind="primary"
          big
          full
          disabled={!text.trim()}
          onClick={async () => {
            logEvent('request.create', { who, text: text.trim().slice(0, 200), options: options.join(' / '), photo, urgent });
            const id = newId();
            const photo_path = authorPhoto ? await savePhoto(authorPhoto, 'requests', id) : null;
            await put('requests', {
              id,
              photo_path,
              elephant: who,
              text: text.trim(),
              // у «Работы» нет кормлений: курс — только каждое дежурство
              frequency: when === 'course' ? (who === 'work' ? 'shift' : courseFreq) : 'once',
              // разовая — на конкретный день (и час); регулярная — «до какого числа»
              due_date: when === 'course' ? until || null : null,
              on_date: when === 'course' ? null : when === 'today' ? isoDate() : onDate || isoDate(),
              at_time: when !== 'course' && atTime ? atTime : null,
              needs_photo: photo,
              urgent,
              options: options.length ? options : null,
              author_id: user.id,
              author_name: user.full_name,
              status: 'active',
              created_at: new Date().toISOString(),
              // поле шлём, только если выбрали человека: старый сервер без колонки примет остальные задачи как раньше
              ...(assignee ? { assignee_id: assignee } : {}),
            });
            toast('Задача поставлена');
            onClose();
          }}
        >
          Поставить задачу
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Кому</span>
          <div className="flex flex-wrap gap-2">
            {[...ELEPHANTS, 'all' as const, 'work' as const].map((e) => (
              <Chip
                key={e}
                on={who === e}
                onClick={() => {
                  // слоны ↔ работа: ветеринарные ответы к хоздела не подходят (и наоборот) — сбрасываем на «выполнено»
                  if ((e === 'work') !== (who === 'work')) {
                    setOptions([]);
                    setOwn('');
                  }
                  setWho(e);
                }}
              >
                {whoLabel(e)}
              </Chip>
            ))}
          </div>
        </div>
        {people.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="px-1 text-[14px] font-bold text-muted">Поручить (необязательно)</span>
            <div className="flex flex-wrap gap-2">
              <Chip on={!assignee} onClick={() => setAssignee(null)}>
                Кто на смене
              </Chip>
              {people.map((p) => (
                <Chip key={p.id} on={assignee === p.id} onClick={() => setAssignee(p.id)}>
                  {p.full_name}
                </Chip>
              ))}
            </div>
            {resting && (
              <Plate glow="amber" className="px-3.5 py-2.5 text-[14px] font-bold text-amber-fg">
                Внимание: {resting.full_name} на отсыпном после суточного дежурства
              </Plate>
            )}
          </div>
        )}
        {who === 'work' && onBuy && (
          <button type="button" onClick={onBuy} className="-mt-2 flex h-11 items-center self-start px-1 text-[14px] font-bold text-teal">
            Купить? → Закупки
          </button>
        )}
        <Field label="Что сделать">
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={`${inputCls} resize-none`}
            placeholder={who === 'work' ? 'Например: перебрать сенник, сухие тюки ближе к выходу' : 'Например: давать тёплую воду, два раза за дежурство проверить, сколько выпила'}
          />
        </Field>
        <div className="flex flex-col gap-3">
          <Segmented label="Когда" value={when} onChange={setWhen} options={WHEN} />
          {when === 'course' ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Chip on={who === 'work' || courseFreq === 'shift'} onClick={() => setCourseFreq('shift')}>
                  Каждое дежурство
                </Chip>
                {who !== 'work' && (
                  <Chip on={courseFreq === 'feeding'} onClick={() => setCourseFreq('feeding')}>
                    Каждое кормление
                  </Chip>
                )}
              </div>
              <Field label="До какого числа">
                <DateInput value={until} onChange={setUntil} min={isoDate()} label="До какого числа" />
              </Field>
            </>
          ) : (
            <div className={when === 'date' ? 'grid grid-cols-[1fr_auto] gap-3' : 'flex'}>
              {when === 'date' && (
                <Field label="В какой день">
                  <DateInput value={onDate} onChange={setOnDate} min={isoDate()} label="В какой день" />
                </Field>
              )}
              <Field label="Ко времени">
                <input type="time" value={atTime} onChange={(e) => setAtTime(e.target.value)} aria-label="Ко времени, необязательно" className={`${inputCls} w-32`} />
              </Field>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Варианты ответа</span>
          <div className="flex flex-wrap gap-2">
            <Chip on={options.length === 0} onClick={() => setOptions([])}>
              Просто «выполнено»
            </Chip>
            {answerPresets(who).map((p) => (
              <Chip key={p.label} on={options.join('|') === p.options.join('|')} onClick={() => setOptions(p.options)}>
                {p.label}
              </Chip>
            ))}
          </div>
          <input
            className={inputCls}
            value={own}
            onChange={(e) => {
              setOwn(e.target.value);
              setOptions(
                e.target.value
                  .split(/[,/]/)
                  .map((x) => x.trim())
                  .filter(Boolean),
              );
            }}
            placeholder={who === 'work' ? 'Свои варианты через запятую: забрал, нет на месте' : 'Свои варианты через запятую: мутная, прозрачная, с песком'}
          />
          {options.length > 0 && <span className="px-1 text-[13px] font-semibold text-teal">Кнопки ответа: {options.join(' · ')}</span>}
        </div>
        {authorPhoto ? <FilePreview file={authorPhoto} onRemove={() => setAuthorPhoto(null)} /> : <PhotoPick onFile={setAuthorPhoto} label="Приложить фото" />}
        <Card className="divide-y divide-edge overflow-hidden">
          <Check on={photo} label="Нужно фото в ответ" sub="кипер отметит выполнение с фото" onChange={setPhoto} />
          <Check on={urgent} label="Срочно" sub="наверху экрана у кипера" onChange={setUrgent} />
        </Card>
      </div>
    </Sheet>
  );
}
