import { useEffect, useState, type ReactNode } from 'react';
import { logEvent } from '../../lib/log';
import { ELEPHANTS } from '../../domain/elephants';
import { FEED_TIMES, FREQ_LABEL, answerPresets, courseDay, courseStart, currentShift, describeRequest, eventExpired, markAnswer, perShift, onRestDay, overdue, requestProgress, requestTodos, whenLabel, whoLabel, type RequestTodo } from '../../domain/shift';
import { addMark, setPurchaseStatus } from '../../domain/actions';
import { GROUPS, GROUP_TITLE, boardAttention, boardGroups, type BoardFilter, type BoardItem, type BoardType } from '../../domain/board';
import type { CurrentUser, ElephantName, Purchase, RequestFrequency, RequestMark, Shift, VetRequest } from '../../domain/types';
import { newId, put, useRows } from '../../lib/store';
import { savePhoto } from '../../lib/photos';
import { addDays, isoDate, localDay, relDate, shortDate, stampOf } from '../../lib/dates';
import { Button, CHIP, Card, Check, Chip, Confirm, DateInput, Empty, Field, FilePreview, KEY, LateBadge, Meter, PhotoPick, PhotoThumb, Plate, Section, Segmented, Sheet, UrgentBadge, SwipeConfirm, inputCls, toast } from '../../ui/kit';
import { canCloseRequest, canEdit } from '../../domain/access';
import { Icon } from '../../ui/Icon';
import { TASK_TYPE } from '../taskType';
import { TypePill } from '../TypePill';
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
  const [picking, setPicking] = useState(false);
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
          <Button kind="accent" big icon="plus" onClick={() => (view === 'purchases' ? setBuying(true) : view === 'work' ? setCreating('work') : view === 'elephants' ? setCreating('Претти') : setPicking(true))}>
            {view === 'purchases' ? 'Закупка' : 'Новая'}
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
              // «Просрочено» — заголовок кораллом: прошлое, которое ждёт отметки или закрытия
              <span className={`flex items-center gap-2 ${g === 'overdue' ? 'text-coral-fg' : ''}`}>
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
                    <BoardCard key={i.p.id} type="purchases" label={TASK_TYPE.purchases.label} quiet={closed} urgent={i.p.urgent && (i.p.status === 'new' || i.p.status === 'ordered')}>
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
      />
      <TaskTypeSheet
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(t) => {
          setPicking(false);
          if (t === 'purchases') setBuying(true);
          else setCreating(t === 'work' ? 'work' : 'Претти');
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
  quiet,
  children,
}: {
  type: BoardType;
  label: string;
  right?: ReactNode;
  urgent?: boolean;
  late?: boolean;
  /** закрытая: без коралловой рамки — не спорит с тем, что ещё надо сделать */
  quiet?: boolean;
  children: ReactNode;
}) {
  // без свечения слева: тип — словом в плашке, срочное и просроченное — коралловой рамкой и бейджем
  const alarm = (urgent || late) && !quiet;
  return (
    <Plate glow="coral" flat className={`flex flex-col gap-2 px-4 py-3 ${alarm ? '!border-coral/60' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <TypePill type={type} />
          {label !== TASK_TYPE[type].label && <span className="truncate text-[14px] font-extrabold">{label}</span>}
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
  const closed = r.status === 'closed' || (r.frequency === 'once' && p.done > 0) || courseOver || eventExpired(r, marks);
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
      quiet={closed}
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
          {r.frequency !== 'once' ? ` · ${p.done} из ${p.total} ${p.total === 1 ? 'дежурства' : 'дежурств'}` : eventExpired(r, marks) ? ' · прошло без отметки' : !p.last ? ' · ждёт отметки' : ''}
          {todo && !todo.done && r.frequency !== 'once' ? ' · в этой смене не отмечено' : ''}
        </span>
        {assignee && (
          <span className={`text-[13px] font-bold ${resting ? 'text-amber-fg' : 'text-ink2'}`}>
            Поручено: {assignee.full_name}
            {resting ? ' · на отсыпном' : ''}
          </span>
        )}
        {talk > 0 && (
          <span className={`text-[13px] font-bold ${fresh ? 'text-amber-fg' : 'text-muted'}`}>
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
  const [edit, setEdit] = useState(false);
  const shifts = useRows('shifts');
  if (!req) return null;
  const cd = courseDay(req, isoDate());
  const course = req.frequency !== 'once' && req.elephant !== 'work';
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
            {req.status === 'active' && req.elephant !== 'work' && (
              <Button full icon="edit" onClick={() => setEdit(true)}>
                Изменить
              </Button>
            )}
            {req.status === 'active' ? (
              <Button full onClick={() => setConfirm(true)}>
                {course ? 'Отменить досрочно' : 'Закрыть задачу'}
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
        {(req.route || req.dose || cd) && (
          <span className="flex flex-wrap gap-2">
            {req.route && <span className={CHIP}>{req.route}</span>}
            {req.dose && <span className={CHIP}>{req.dose}</span>}
            {cd && <span className={`${CHIP} !text-teal-fg`}>{cd.total ? `день ${Math.min(cd.day, cd.total)} из ${cd.total}` : `день ${cd.day}`}</span>}
          </span>
        )}
        {(req.history ?? []).map((h) => (
          <span key={h.at} className="text-[13px] font-semibold text-amber-fg">
            Изменено {stampOf(h.at)} ({h.by}). Было: {h.was}
          </span>
        ))}
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
              <SwipeConfirm
                label="Проведи — выполнено"
                onConfirm={async () => {
                  await addMark(req.id, shift!, user);
                  toast('Отмечено');
                }}
              />
            )}
          </div>
        )}
        {course && <CourseGrid req={req} marks={mine} shifts={shifts} />}
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
      <NewRequestSheet initial={edit ? (req.elephant as ElephantName | 'all') : null} editing={req} user={user} onClose={() => setEdit(false)} />
      <Confirm
        open={confirm}
        title={course ? 'Отменить курс досрочно?' : 'Закрыть задачу?'}
        text="Киперы перестанут её видеть."
        okLabel={course ? 'Отменить курс' : 'Закрыть'}
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

/** «+ Новая» на «Все»: сначала что за задача — слонам, работа или закупка. */
const TASK_KINDS: { type: BoardType; title: string; sub: string }[] = [
  { type: 'elephants', title: 'Слонам', sub: 'Лечение, процедуры, наблюдение, кормление. Делает дежурный кипер' },
  { type: 'work', title: 'Работа', sub: 'Хозяйство и поручения: можно назначить человека' },
  { type: 'purchases', title: 'Закупка', sub: 'Корм, лекарства, инвентарь — что нужно купить' },
];

function TaskTypeSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (t: BoardType) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Новая задача">
      <div className="flex flex-col gap-2.5">
        {TASK_KINDS.map((k) => {
          const t = TASK_TYPE[k.type];
          return (
            <button key={k.type} type="button" onClick={() => onPick(k.type)} className="text-left transition-transform active:scale-[0.98]">
              {/* обычная плита: тип говорит иконка и слово, без полосок и свечения */}
              <Card className="flex items-center gap-3.5 p-4">
                <Icon name={t.icon} size={26} className={t.text} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[18px] font-extrabold">{k.title}</span>
                  <span className="text-[13px] font-semibold text-muted">{k.sub}</span>
                </span>
                <Icon name="next" size={18} className="text-muted" />
              </Card>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

/** Шаблоны назначений — как пишет врач; тап заполняет форму, дальше можно поправить. */
const TEMPLATES: { label: string; text: string; route: string; dose: string; freq: RequestFrequency; days: number; photo?: boolean; at?: string }[] = [
  { label: 'Ванночки', text: 'Ванночки со слабым раствором марганцовки — задняя/передняя нога', route: 'ванночка', dose: 'по 15–20 мин', freq: 'twice', days: 10 },
  { label: 'Трещина подошвы', text: 'Обработка трещины подошвы: промыть хлоргексидином + заложить Левомеколь / Ихтиол', route: 'наружно', dose: 'после чистки', freq: 'shift', days: 7 },
  { label: 'Капли в глаз', text: 'Капли глазные (Ципровет) — левый/правый глаз', route: 'в глаз', dose: '', freq: 'twice', days: 5 },
  { label: 'В кашу', text: 'Подкормка / витамины / таблетки в кашу (или с бананом)', route: 'в корм', dose: 'в вечернее кормление', freq: 'shift', days: 14 },
  { label: 'Контроль мочи', text: 'Контроль мочи: собрать в чистую тару на осадок', route: '', dose: '', freq: 'once', days: 1, photo: true, at: '07:00' },
];
const ROUTES = ['в корм', 'наружно', 'ванночка', 'в глаз', 'укол'];
const COURSE_DAYS = [5, 7, 10, 14];
/**
 * Ответ кипера — по смыслу назначения: «дал» — про то, что дают в корм; ванночка, мазь, капли, укол — «сделано»;
 * разовое «собрать и сфотографировать» — «сделано / не получилось». Врач может поменять сам.
 */
export function answersFor(route: string, oncePhoto: boolean): string[] {
  if (route === 'в корм') return ['дал', 'частично', 'не дал'];
  if (oncePhoto) return ['сделано', 'не получилось'];
  return ['сделано', 'частично', 'не вышло'];
}

export function NewRequestSheet({
  initial,
  user,
  onClose,
  prefill,
  editing,
}: {
  /** слон или «Всем» — форма «Слонам»; 'work' — форма «Работа» */
  initial: ElephantName | 'all' | 'work' | null;
  user: CurrentUser;
  onClose: () => void;
  /** текст из записи кипера («Назначить» у врача) */
  prefill?: string;
  /** правка назначения: прежний вид уходит в историю — «Изменено. Было: …» */
  editing?: VetRequest;
}) {
  const [route, setRoute] = useState('');
  const [dose, setDose] = useState('');
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
  // варианты ответа подстраиваются под «Как», пока врач не выбрал их сам; блок свёрнут в одну строку
  const [answersTouched, setAnswersTouched] = useState(false);
  const [answersOpen, setAnswersOpen] = useState(false);
  const [authorPhoto, setAuthorPhoto] = useState<File | null>(null);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
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
      setUntil(addDays(isoDate(), initial === 'work' ? 3 : 6)); // курс слону по умолчанию — неделя
      setOnDate(isoDate());
      setAtTime('');
      setPhoto(false);
      setUrgent(false);
      setOptions([]);
      setOwn('');
      setAssignee(null);
      setChoosing(false);
      setRoute('');
      setDose('');
      setAnswersTouched(Boolean(editing));
      setAnswersOpen(false);
      if (editing) {
        setText(editing.text);
        setRoute(editing.route ?? '');
        setDose(editing.dose ?? '');
        setWhen(editing.frequency === 'once' ? (editing.on_date && editing.on_date !== isoDate() ? 'date' : 'today') : 'course');
        if (editing.frequency !== 'once') setCourseFreq(editing.frequency);
        if (editing.due_date) setUntil(editing.due_date);
        if (editing.on_date) setOnDate(editing.on_date);
        setAtTime(editing.at_time?.slice(0, 5) ?? '');
        setPhoto(editing.needs_photo);
        setUrgent(editing.urgent);
        setOptions(editing.options ?? []);
      }
    }
  }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  // ответ по смыслу: «в корм» — «дал», процедуры — «сделано», разовое с фото — «сделано / не получилось»
  useEffect(() => {
    if (initial === null || who === 'work' || answersTouched) return;
    setOptions(answersFor(route, when !== 'course' && photo));
  }, [initial, who, route, photo, when, answersTouched]);

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    setText(t.text);
    setRoute(t.route);
    setDose(t.dose);
    setPhoto(Boolean(t.photo));
    setAnswersTouched(false);
    if (t.freq === 'once') {
      setWhen('today');
      setAtTime(t.at ?? '');
    } else {
      setWhen('course');
      setCourseFreq(t.freq as Exclude<RequestFrequency, 'once'>);
      setUntil(addDays(isoDate(), t.days - 1));
    }
  };

  return (
    <Sheet
      open={initial !== null}
      onClose={onClose}
      title={editing ? 'Изменить назначение' : who === 'work' ? 'Задача по работе' : 'Назначение слону'}
      footer={
        <Button
          kind="primary"
          big
          full
          disabled={!text.trim()}
          onClick={async () => {
            logEvent(editing ? 'request.edit' : 'request.create', { who, text: text.trim().slice(0, 200), options: options.join(' / '), photo, urgent });
            const id = editing?.id ?? newId();
            const photo_path = authorPhoto ? await savePhoto(authorPhoto, 'requests', id) : (editing?.photo_path ?? null);
            await put('requests', {
              ...(editing ?? {}),
              id,
              photo_path,
              route: who === 'work' ? '' : route.trim(),
              dose: who === 'work' ? '' : dose.trim(),
              history: editing ? [...(editing.history ?? []), { at: new Date().toISOString(), by: user.full_name, was: describeRequest({ ...editing, route: editing.route ?? '', dose: editing.dose ?? '' }) }] : [],
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
              author_id: editing?.author_id ?? user.id,
              author_name: editing?.author_name ?? user.full_name,
              status: 'active',
              created_at: editing?.created_at ?? new Date().toISOString(),
              // поле шлём, только если выбрали человека: старый сервер без колонки примет остальные задачи как раньше
              ...(assignee && who === 'work' ? { assignee_id: assignee } : {}),
            });
            toast(editing ? 'Назначение изменено' : who === 'work' ? 'Задача поставлена' : 'Назначение добавлено');
            onClose();
          }}
        >
          {editing ? 'Сохранить' : who === 'work' ? 'Поставить задачу' : 'Назначить'}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {who !== 'work' && (
          <div className="flex flex-col gap-2">
            <span className="px-1 text-[14px] font-bold text-muted">Кому из слонов</span>
            <div className="flex flex-wrap gap-2">
              {[...ELEPHANTS, 'all' as const].map((e) => (
                <Chip key={e} on={who === e} onClick={() => setWho(e)}>
                  {whoLabel(e)}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {prefill && (
          <Plate glow="sky" className="px-3.5 py-2.5 text-[14px] font-semibold leading-snug">
            <span className="text-muted">По записи кипера: </span>
            {prefill}
          </Plate>
        )}
        {who !== 'work' && !editing && (
          <div className="flex flex-col gap-2">
            <span className="px-1 text-[14px] font-bold text-muted">Шаблоны</span>
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <Chip key={t.label} on={text === t.text} onClick={() => applyTemplate(t)}>
                  {t.label}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <Field label="Что сделать">
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            // растёт по мере ввода: короткое назначение — две строки, длинное не прячется
            ref={(el) => {
              if (el) {
                el.style.height = 'auto';
                el.style.height = `${el.scrollHeight + 2}px`;
              }
            }}
            className={`${inputCls} resize-none overflow-hidden`}
            placeholder={who === 'work' ? 'Например: перебрать сенник, сухие тюки ближе к выходу' : 'Например: марганцевые ванночки для ног, 15 мин'}
          />
        </Field>
        {who === 'work' ? (
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => setChoosing(!choosing)} aria-expanded={choosing} className="flex min-h-11 items-center gap-2 px-1 text-left">
              <span className="text-[14px] font-bold text-muted">Кто сделает:</span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{people.find((p) => p.id === assignee)?.full_name ?? 'любой на смене'}</span>
              <span className="text-[14px] font-bold text-teal">{choosing ? 'готово' : 'изменить'}</span>
            </button>
            {choosing && (
              <div className="flex flex-wrap gap-2">
                <Chip on={!assignee} onClick={() => setAssignee(null)}>
                  Любой на смене
                </Chip>
                {people.map((p) => (
                  <Chip key={p.id} on={assignee === p.id} onClick={() => setAssignee(p.id)}>
                    {p.full_name}
                  </Chip>
                ))}
              </div>
            )}
            {resting && (
              <Plate glow="amber" className="px-3.5 py-2.5 text-[14px] font-bold text-amber-fg">
                Внимание: {resting.full_name} на отсыпном после суточного дежурства
              </Plate>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <span className="px-1 text-[14px] font-bold text-muted">Как</span>
              <div className="flex flex-wrap gap-2">
                {ROUTES.map((r) => (
                  <Chip key={r} on={route === r} onClick={() => setRoute(route === r ? '' : r)}>
                    {r}
                  </Chip>
                ))}
              </div>
            </div>
            <Field label="Доза, уточнение" hint="Необязательно">
              <input className={inputCls} value={dose} onChange={(e) => setDose(e.target.value)} placeholder="2 таблетки, по 15–20 мин, после чистки…" />
            </Field>
          </>
        )}
        <div className="flex flex-col gap-3">
          <Segmented label="Когда" value={when} onChange={setWhen} options={who === 'work' ? WHEN.map((w) => (w.value === 'course' ? { ...w, label: 'Регулярно' } : w)) : WHEN} />
          {when === 'course' ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Chip on={who === 'work' || courseFreq === 'shift'} onClick={() => setCourseFreq('shift')}>
                  {who === 'work' ? 'Каждое дежурство' : 'Раз в сутки'}
                </Chip>
                {who !== 'work' && (
                  <Chip on={courseFreq === 'twice'} onClick={() => setCourseFreq('twice')}>
                    Утро и вечер
                  </Chip>
                )}
                {who !== 'work' && (
                  <Chip on={courseFreq === 'feeding'} onClick={() => setCourseFreq('feeding')}>
                    Каждое кормление
                  </Chip>
                )}
              </div>
              {who !== 'work' ? (
                // курс слону — днями: 5 / 7 / 10 / 14 или своё число, рядом — до какого числа
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-1 text-[14px] font-bold text-muted">Дней:</span>
                  {COURSE_DAYS.map((d) => (
                    <Chip key={d} on={courseDays(until, editing) === d} onClick={() => setUntil(addDays(courseStartDay(editing), d - 1))}>
                      {d}
                    </Chip>
                  ))}
                  <input
                    inputMode="numeric"
                    aria-label="Своё число дней"
                    placeholder="своё"
                    value={COURSE_DAYS.includes(courseDays(until, editing)) ? '' : String(courseDays(until, editing))}
                    onChange={(e) => {
                      const n = Math.min(90, Number(e.target.value.replace(/\D/g, '')));
                      if (n >= 1) setUntil(addDays(courseStartDay(editing), n - 1));
                    }}
                    className={`${inputCls} !h-11 !w-20 text-center`}
                  />
                  <span className="px-1 text-[14px] font-bold text-teal-fg">до {shortDate(until)}</span>
                </div>
              ) : (
                <Field label="До какого числа">
                  <DateInput value={until} onChange={setUntil} min={isoDate()} label="До какого числа" />
                </Field>
              )}
            </>
          ) : (
            <>
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
              {/* ко времени кормления — одним тапом (часы браузера у всех разные); своё время — в поле выше */}
              <div className="grid grid-cols-4 gap-2">
                {FEED_TIMES.map((t) => (
                  <Chip key={t} on={atTime === t} onClick={() => setAtTime(atTime === t ? '' : t)}>
                    {t}
                  </Chip>
                ))}
              </div>
            </>
          )}
        </div>
        {/* ответ кипера — одной строкой; поменять — «изменить» */}
        <button type="button" onClick={() => setAnswersOpen(!answersOpen)} aria-expanded={answersOpen} className="flex min-h-11 items-center gap-2 px-1 text-left">
          <span className="text-[14px] font-bold text-muted">Ответ:</span>
          <span className="min-w-0 flex-1 text-[14px] font-bold leading-snug">{options.length ? options.join(' · ') : 'просто «выполнено»'}</span>
          <span className="text-[14px] font-bold text-teal">{answersOpen ? 'готово' : 'изменить'}</span>
        </button>
        <div className={`flex flex-col gap-2 ${answersOpen ? '' : 'hidden'}`}>
          <div className="flex flex-wrap gap-2">
            <Chip on={options.length === 0} onClick={() => (setAnswersTouched(true), setOptions([]))}>
              Просто «выполнено»
            </Chip>
            {answerPresets().map((p) => (
              <Chip key={p.label} on={options.join('|') === p.options.join('|')} onClick={() => (setAnswersTouched(true), setOptions(p.options))}>
                {p.label}
              </Chip>
            ))}
          </div>
          <input
            className={inputCls}
            value={own}
            onChange={(e) => {
              setOwn(e.target.value);
              setAnswersTouched(true);
              setOptions(
                e.target.value
                  .split(/[,/]/)
                  .map((x) => x.trim())
                  .filter(Boolean),
              );
            }}
            placeholder="Свои: забрал, нет на месте"
          />
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

/** С какого дня считаются «дни курса»: у правки — с начала курса, у нового — с сегодня. */
function courseStartDay(editing?: VetRequest): string {
  return editing ? courseStart(editing) : isoDate();
}

const GIVE_SYM: Record<string, { sym: string; cls: string }> = {
  дал: { sym: '✓', cls: 'bg-teal/25 text-teal-fg' },
  частично: { sym: '½', cls: 'bg-amber/25 text-amber-fg' },
  'не дал': { sym: '✗', cls: 'bg-coral/25 text-coral-fg' },
};

/** Курс у врача: дни × приёмы. ✓ дал, ½ частично, ✗ не дал, пусто — пропущено (день прошёл). */
function CourseGrid({ req, marks, shifts }: { req: VetRequest; marks: RequestMark[]; shifts: Shift[] }) {
  const today = isoDate();
  const start = courseStart(req);
  const end = req.due_date && req.due_date < today ? req.due_date : today;
  const dateOf = new Map(shifts.map((s) => [s.id, s.date]));
  const per = perShift(req);
  const days: string[] = [];
  for (let d = start; d <= end && days.length < 60; d = addDays(d, 1)) days.push(d);
  if (!days.length) return null;
  return (
    <Section title="Курс по дням">
      <Card tone="sunken" className="flex flex-wrap gap-2 p-3">
        {days.map((d) => {
          const got = marks.filter((m) => !m.deleted && dateOf.get(m.shift_id) === d);
          const cells = Array.from({ length: per }, (_, i) => got[i]);
          return (
            <span key={d} className="flex flex-col items-center gap-1">
              <span className="flex gap-0.5">
                {cells.map((m, i) => {
                  const a = m ? (markAnswer(m, req) ?? 'дал') : null;
                  const look = a ? (GIVE_SYM[a] ?? GIVE_SYM['дал']) : null;
                  return (
                    <span key={i} className={`inline-flex h-6 w-6 items-center justify-center rounded-md border border-edge text-[12px] font-extrabold ${look ? look.cls : d < today ? 'text-faint' : ''}`}>
                      {look ? look.sym : d < today ? '·' : ''}
                    </span>
                  );
                })}
              </span>
              <span className="text-[11px] font-semibold text-muted">{d.slice(8)}.{d.slice(5, 7)}</span>
            </span>
          );
        })}
      </Card>
    </Section>
  );
}

/** Сколько дней курса до «до какого числа», считая первый. */
function courseDays(until: string, editing?: VetRequest): number {
  return Math.round((Date.parse(`${until}T12:00:00`) - Date.parse(`${courseStartDay(editing)}T12:00:00`)) / 86_400_000) + 1;
}
