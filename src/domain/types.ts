/**
 * director — «смотрящий»: видит всё, ставит заявки и пишет наблюдения, ведёт людей.
 * manager — «Администратор» цирка: люди (киперы и врачи), фураж, переезд.
 * admin — «Системный админ»: всё, включая других админов.
 */
export type Role = 'keeper' | 'vet' | 'director' | 'manager' | 'admin';
export type ElephantName = 'Претти' | 'Марго' | 'Одри';
/** 0 — норма, 1 — внимание, 2 — плохо */
export type Level = 0 | 1 | 2;
export type MetricKey = 'food' | 'water' | 'feces' | 'urine' | 'legs' | 'behavior' | 'sleep';
export type Eaten = 'all' | 'half' | 'none';

export interface Base {
  id: string;
  updated_at: string;
  deleted?: boolean;
}

export interface Profile extends Base {
  login: string;
  full_name: string;
  role: Role;
  active: boolean;
  /** телефон для звонка с экрана (у врача — кнопка «Позвонить врачу») */
  phone?: string | null;
}

export interface CellState {
  level: Level;
  symptoms?: string[];
}

export interface FeedState {
  done: boolean;
  at?: string;
  eaten?: Partial<Record<ElephantName, Eaten>>;
  /** сколько кг выдано — для кормлений «по весу» (овощи) */
  kg?: number;
  /** сколько кг реально выдали по позиции, если не по рациону (картофель взяли 2 сетки вместо 3) */
  given?: Record<string, number>;
}

export interface Quests {
  urine?: Partial<Record<ElephantName, { ok: number; miss: number }>>;
  /** кал за дежурство: сколько раз сходила (болюсы не считаем); true — из старых записей, считаем как 1 */
  feces?: Partial<Record<ElephantName, number | boolean>>;
  /** слоних мыли (старое поле, только «да») */
  shower?: boolean;
  /** мытьё: когда и в каких условиях — чтобы связать с простудой, если что */
  wash?: { at: string; place?: 'inside' | 'outside'; water?: 'warm' | 'cool' | 'cold'; air?: number | null; note?: string };
  /** ветки никто не взвешивает: 1 — немного, 2 — как обычно, 3 — много (kg — из старых записей) */
  branches?: { amount?: number; kinds: string[]; kg?: number };
  /** уход не каждый день: мыли (обычно перед шоу) или оттирали щёткой после грязной ночи */
  care?: Partial<Record<ElephantName, { wash?: boolean; brush?: boolean; shower?: boolean; bath?: boolean }>>;
  /** bags — мешков взято со склада, out — вывезено на мусорку (litter/loosen/waste — галочки из старых записей) */
  cleaning?: { litter?: boolean; loosen?: boolean; waste?: boolean; bags?: number; out?: number };
  enrichment?: { done?: boolean; what?: string };
}

export interface Shift extends Base {
  date: string; // YYYY-MM-DD
  keeper_id: string | null;
  keeper_name: string;
  status: 'open' | 'handed';
  safety: Record<string, boolean>;
  state: Partial<Record<ElephantName, Partial<Record<MetricKey, CellState>>>>;
  feeds: Record<string, FeedState>;
  quests: Quests;
  hay_bales: number;
  note: string;
  accepted_at: string | null;
  handed_at: string | null;
  /** прежний код передачи: новые смены его не ставят, поле осталось для старых записей */
  handover_code?: string | null;
  /** кому сдали (он увидит «Тебе сдали смену»); пусто — сдали «кому-нибудь» */
  handover_to?: string | null;
  /** кто закрыл смену и как: handover — сдал сменщику, rollover — «новые сутки», takeover — приняли без сдачи, superseded — выровняла база */
  closed_by?: string | null;
  close_reason?: 'handover' | 'rollover' | 'takeover' | 'superseded' | null;
  /** какую смену эта приняла — замечания принимающего относятся к ней */
  accepted_from?: string | null;
  accept_remarks?: string;
  /** кипер подтвердил при сдаче: осмотрел всех трёх, проверил тазы — всё неотмеченное норма */
  checked_at?: string | null;
}

export type RequestFrequency = 'once' | 'shift' | 'feeding';

export interface VetRequest extends Base {
  /** 'all' — всем слонам; 'work' — рабочая задача не про слонов (ставит директор) */
  elephant: ElephantName | 'all' | 'work';
  text: string;
  frequency: RequestFrequency;
  due_date: string | null;
  needs_photo: boolean;
  urgent: boolean;
  /** варианты ответа кипера кнопками (например «всё / половину / отказ»); пусто — просто «Выполнено» */
  options?: string[] | null;
  /** фото от автора: что сделать или что не так (машина сена, неубранный проход) */
  photo_path?: string | null;
  author_id: string | null;
  author_name: string;
  status: 'active' | 'closed';
  /** разовая задача на конкретный день (due_date — «до какого дня» у регулярных) */
  on_date?: string | null;
  /** к которому часу, «16:00» — необязательно */
  at_time?: string | null;
  /** кому поручено (кипер или директор) — необязательно; задача по-прежнему про слона или «Работу» */
  assignee_id?: string | null;
  created_at: string;
}

/** Комментарий в обсуждении заявки — вместо общего чата разговор всегда про конкретную задачу. */
export interface RequestComment extends Base {
  request_id: string;
  author_id: string;
  author_name: string;
  text: string;
  created_at: string;
}

export interface RequestMark extends Base {
  request_id: string;
  shift_id: string;
  done_by: string;
  done_at: string;
  note: string;
  photo_path: string | null;
}

/** incident — «ЧП»: не про слона (вода, свет, инвентарь, манеж, стресс) */
export type NoteKind = 'observation' | 'procedure' | 'medication' | 'incident';

export interface Note extends Base {
  shift_id: string;
  /** 'none' — запись «ЧП», не про конкретную слониху */
  elephant: ElephantName | 'none';
  kind: NoteKind;
  metric: MetricKey | null;
  text: string;
  photo_path: string | null;
  author_name: string;
  created_at: string;
}

export type StockCategory = 'feed' | 'porridge' | 'grain' | 'veg' | 'supplements' | 'household' | 'other';

export interface StockItem extends Base {
  name: string;
  category: StockCategory;
  kind: 'count' | 'kg' | 'sack';
  unit: string;
  sack_kg: number | null;
  /** для зерна — кг в мерном совке (гарце) */
  kg_per_garets: number | null;
  /** не используется: овощи и фрукты считаются в кг, как крупы (колонка в базе осталась) */
  pick_unit?: string | null;
  low_days: number;
  sort: number;
}

export interface StockMove extends Base {
  item_id: string;
  delta: number;
  /** extra — выдали вне рациона (манеж, репетиция, шоу); waste — брак, гниль при переборке */
  reason: 'in' | 'feed' | 'hay' | 'fix' | 'extra' | 'waste';
  shift_id: string | null;
  author_name: string;
  /** повод для «вне рациона»: Манеж, Репетиция… */
  note?: string;
  /** пересчёт: на складе ровно столько на created_at; остаток = это число + движения после (delta — для старых версий) */
  counted?: number | null;
  created_at: string;
}

export type MealUnit = 'кг' | 'г' | 'гарец';

export interface MealItem {
  item: string | null;
  name: string;
  qty: number | null;
  unit: MealUnit;
}

export interface Meal {
  time: string;
  title: string;
  prep: string;
  items: MealItem[];
}

export interface Diet extends Base {
  hay_kg: number | null;
  branches_kg: number | null;
  meals: Meal[];
}

/** Переезд: отметка по пункту сборов (id пункта из шаблона) или свой пункт; '_days' — сколько дней в дороге (qty). */
export interface MoveItem extends Base {
  section: string;
  text: string;
  qty: number | null;
  done_by: string | null;
  done_at: string | null;
  created_by: string;
}

/** Город гастролей: с какого дня труппа там (и до какого). Текущий — последний по дате приезда. */
export interface TourStop extends Base {
  city: string;
  arrive_on: string;
  depart_on: string | null;
  note: string;
  created_by: string;
}

/** Поставщик в городе гастролей: что возит, как связаться и как он себя показал (1 плохо · 2 так себе · 3 хорошо). */
export interface Supplier extends Base {
  city: string;
  name: string;
  supplies: string[];
  phone: string;
  address: string;
  quality: 1 | 2 | 3 | null;
  note: string;
  created_by: string;
}

/** Контейнер с реквизитом: номер как на ящике («6», «6А», «Р-12»), фура и опись по строке на предмет. */
export interface Container extends Base {
  number: string;
  truck: string;
  contents: string;
  note: string;
  /** схема погрузки («тетрис»): порядок и место в фуре — каркас, пока не заполняется */
  load_order?: number | null;
  slot_x?: number | null;
  slot_y?: number | null;
  created_by: string;
}

export type PurchaseStatus = 'new' | 'ordered' | 'done' | 'cancelled';

/** Закупка: кто-то просит купить; администратор/директор отмечает «заказано» и «привезли». */
export interface Purchase extends Base {
  item_id: string | null;
  title: string;
  amount: string;
  note: string;
  urgent: boolean;
  status: PurchaseStatus;
  author_id: string;
  author_name: string;
  status_by: string | null;
  status_at: string | null;
  /** когда обещали привезти — необязательно */
  delivery_date?: string | null;
  /** у кого заказали — необязательно */
  supplier_id?: string | null;
  created_at: string;
}

export interface TableMap {
  profiles: Profile;
  shifts: Shift;
  requests: VetRequest;
  request_marks: RequestMark;
  request_comments: RequestComment;
  notes: Note;
  stock_items: StockItem;
  stock_moves: StockMove;
  diets: Diet;
  move_items: MoveItem;
  purchases: Purchase;
  tour_stops: TourStop;
  suppliers: Supplier;
  containers: Container;
}

export type TableName = keyof TableMap;

export const TABLES: TableName[] = [
  'profiles',
  'shifts',
  'requests',
  'request_marks',
  'request_comments',
  'notes',
  'stock_items',
  'stock_moves',
  'diets',
  'move_items',
  'purchases',
  'tour_stops',
  'suppliers',
  'containers',
];

export interface CurrentUser {
  id: string;
  login: string;
  full_name: string;
  role: Role;
}
