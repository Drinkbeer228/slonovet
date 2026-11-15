import type { ElephantName } from './types';
import { recordRoundCheckProgress, type ErsProgressPayload } from '../lib/ers';

export const BIOLAB_PROGRESS_KEY = 'ers_progress_v1:biolab';

/** Порядок карточек слонов на планшете Полевого поста */
export const STATION_ELEPHANTS: ElephantName[] = ['Марго', 'Претти', 'Одри'];

export const FAR_PASTURE_STATUS = 'На дальнем выгуле у леса';
export const FAR_PASTURE_TARAS_NOTE =
  'Этих пока в Манеже нет — они на дальнем выгуле у заповедного леса, наблюдай за ними со смотрового настила';

const ELEPHANT_ALIASES: Record<string, ElephantName> = {
  margo: 'Марго',
  марго: 'Марго',
  pretty: 'Претти',
  претти: 'Претти',
  odri: 'Одри',
  audrey: 'Одри',
  одри: 'Одри',
};

export type RoundMetricKey = 'feet' | 'skin' | 'appetite' | 'water' | 'digestion';
export type RoundValue = 'norm' | 'issue';

export interface RoundMetricMeta {
  key: RoundMetricKey;
  label: string;
  normLabel: string;
  issueLabel: string;
}

/** 5 обязательных пунктов чек-листа обхода стажёра (задача B2) */
export const ROUND_METRICS: RoundMetricMeta[] = [
  {
    key: 'feet',
    label: 'Состояние стоп',
    normLabel: 'норма',
    issueLabel: 'натоптыш или трещина подошвы',
  },
  {
    key: 'skin',
    label: 'Кожа и складки',
    normLabel: 'норма',
    issueLabel: 'сухость или потёртость',
  },
  {
    key: 'appetite',
    label: 'Аппетит и кормление',
    normLabel: 'норма',
    issueLabel: 'недоедание или остатки сена',
  },
  {
    key: 'water',
    label: 'Водопой',
    normLabel: 'норма',
    issueLabel: 'сниженное потребление воды',
  },
  {
    key: 'digestion',
    label: 'Консистенция навоза и ЖКТ',
    normLabel: 'норма',
    issueLabel: 'рыхлый с крупным волокном или закисление',
  },
];

export type ElephantRoundState = Record<RoundMetricKey, RoundValue>;
export type RoundReport = Record<ElephantName, ElephantRoundState>;

export interface ElephantFieldCardMeta {
  name: ElephantName;
  tag: string;
  enclosure: string;
  summary: string;
  observations: Record<RoundMetricKey, string>;
}

/**
 * Разбор списка активных слонов Манежа из значения параметра `elephants`
 * (например, `margo`, `margo,pretty`, `margo,pretty,odri`).
 * По умолчанию возвращает всех трёх слонов: Марго, Претти, Одри.
 */
export function parseActiveElephants(rawParam?: string | null): ElephantName[] {
  if (!rawParam || !rawParam.trim()) return [...STATION_ELEPHANTS];
  const matched = new Set<ElephantName>();
  for (const token of rawParam.split(',')) {
    const normalized = token.trim().toLowerCase();
    const name = ELEPHANT_ALIASES[normalized];
    if (name) matched.add(name);
  }
  if (matched.size === 0) return [...STATION_ELEPHANTS];
  return STATION_ELEPHANTS.filter((el) => matched.has(el));
}

/**
 * Извлекает параметр `elephants` из `search` (`?mode=station&elephants=margo`)
 * или из query-части `hash` (`#/station?elephants=margo,pretty`).
 */
export function getActiveElephantsFromLocation(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  hash: string = typeof window !== 'undefined' ? window.location.hash : '',
): ElephantName[] {
  try {
    const qIdx = hash.indexOf('?');
    if (qIdx !== -1) {
      const hashParams = new URLSearchParams(hash.slice(qIdx + 1));
      const hashValue = hashParams.get('elephants');
      if (hashValue !== null) return parseActiveElephants(hashValue);
    }
    const searchParams = new URLSearchParams(search);
    const searchValue = searchParams.get('elephants');
    if (searchValue !== null) return parseActiveElephants(searchValue);
  } catch {
    /* ignore malformed query strings */
  }
  return [...STATION_ELEPHANTS];
}

function normalizeActiveElephants(activeElephants?: ElephantName[]): ElephantName[] {
  if (!activeElephants || activeElephants.length === 0) return [...STATION_ELEPHANTS];
  const set = new Set(activeElephants);
  const filtered = STATION_ELEPHANTS.filter((el) => set.has(el));
  return filtered.length > 0 ? filtered : [...STATION_ELEPHANTS];
}

/**
 * Проверка входящего протокола из Био-лаборатории (`ers_progress_v1:biolab`).
 * Если там зафиксирован флаг `ration-violation`, в фактическом состоянии смены
 * автоматически выставляется отклонение по рациону/навозу (когда Одри в Манеже).
 */
export function hasBiolabRationViolation(storage?: Pick<Storage, 'getItem'>): boolean {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
  if (!store) return false;
  try {
    const raw = store.getItem(BIOLAB_PROGRESS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as {
      flags?: unknown;
      items?: Record<string, { flags?: unknown }>;
    } | null;
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.flags) && parsed.flags.includes('ration-violation')) {
        return true;
      }
      if (parsed.items && typeof parsed.items === 'object') {
        for (const item of Object.values(parsed.items)) {
          if (item && Array.isArray(item.flags) && item.flags.includes('ration-violation')) {
            return true;
          }
        }
      }
    }
    return raw.includes('"ration-violation"');
  } catch {
    return false;
  }
}

/**
 * Скрытое фактическое состояние смены с учётом активного состава в Манеже
 * и входящего протокола Био-лаборатории (`ers_progress_v1:biolab`).
 * Флаг `ration-violation` учитывается только если Одри присутствует в списке активных слонов.
 */
export function getActualRoundFacts(options?: {
  biolabRationViolation?: boolean;
  activeElephants?: ElephantName[];
}): RoundReport {
  const active = normalizeActiveElephants(options?.activeElephants);
  const odriIsActive = active.includes('Одри');
  const rationViolation = odriIsActive && (options?.biolabRationViolation ?? hasBiolabRationViolation());

  return {
    Марго: {
      feet: 'norm',
      skin: 'norm',
      appetite: 'norm',
      water: 'issue', // сниженное потребление воды (третий день пьёт мало, нужен подогрев бака)
      digestion: 'norm',
    },
    Претти: {
      feet: 'issue', // трещина подошвы на задней левой стопе
      skin: 'issue', // сухость и потёртость складки у левой височной области
      appetite: 'norm',
      water: 'norm',
      digestion: 'norm',
    },
    Одри: {
      feet: 'norm',
      skin: 'norm',
      appetite: 'issue', // недоедание дневной каши и остатки сена у кормушки
      water: 'norm',
      digestion: rationViolation ? 'issue' : 'norm', // при флаге ration-violation из Био-лаборатории — рыхлый с крупным волокном / закисление
    },
  };
}

/** Данные визуального осмотра вольеров (подсказки на месте для внимательного стажёра) */
export function getFieldInspectionCards(biolabRationViolation: boolean): Record<ElephantName, ElephantFieldCardMeta> {
  return {
    Марго: {
      name: 'Марго',
      tag: '1991 г.р. · 3,9 т · Сектор В-2',
      enclosure: 'Вольер №1 (тёплый контур)',
      summary: 'Спокойная, чувствительна к температуре питьевой воды.',
      observations: {
        feet: 'Подошвы чистые, рог ровный, без трещин и натоптышей.',
        skin: 'Кожные складки эластичные, потёртостей от сбруи нет.',
        appetite: 'Утреннюю зерносмесь и сено съела полностью.',
        water: 'Уровень в поилке почти не снизился: подходила дважды, выпила меньше трети нормы (вода остыла до 16 °C).',
        digestion: 'Болюсы оформленные, влажность и запах в пределах нормы.',
      },
    },
    Претти: {
      name: 'Претти',
      tag: '1986 г.р. · 4,3 т · Сектор В-1',
      enclosure: 'Вольер №2 (отдельный бокс)',
      summary: 'Старшая слониха группы, требует регулярного контроля стоп.',
      observations: {
        feet: 'На задней левой подошве заметна продольная трещина и краевой натоптыш — требуется расчистка и обработка.',
        skin: 'В складке у левой височной области и за ухом выраженная сухость и шелушение кожи.',
        appetite: 'Кормушка вылизана чисто, сено поедает активно.',
        water: 'Выпила 4 мерных бака за утро — её обычная норма.',
        digestion: 'Стул регулярный, консистенция плотная, без непереваренных волокон.',
      },
    },
    Одри: {
      name: 'Одри',
      tag: '1994 г.р. · 3,7 т · Сектор В-3',
      enclosure: 'Вольер №3 (выгульный двор)',
      summary: 'Активная, избирательна к грубым кормам и замесу каши.',
      observations: {
        feet: 'Подошвы и кутикула без повреждений, стачивание равномерное.',
        skin: 'Кожа чистая, после пылевой ванны без раздражений.',
        appetite: 'В кормушке осталась половина дневной каши Mono Grass и разбросаны грубые стебли сена.',
        water: 'Поилка опорожнена по графику, жажды нет.',
        digestion: biolabRationViolation
          ? 'По сводке Био-лаборатории (ration-violation) и осмотру: навоз рыхлый, с длинным непереваренным волокном и кислым запахом.'
          : 'Навоз оформленный, без признаков закисления.',
      },
    },
  };
}

/** Исходный бланк стажёра: по умолчанию везде стоит «норма» (если сдать не глядя — сработает проверка на приписку) */
export function createBlankRoundReport(): RoundReport {
  return {
    Марго: { feet: 'norm', skin: 'norm', appetite: 'norm', water: 'norm', digestion: 'norm' },
    Претти: { feet: 'norm', skin: 'norm', appetite: 'norm', water: 'norm', digestion: 'norm' },
    Одри: { feet: 'norm', skin: 'norm', appetite: 'norm', water: 'norm', digestion: 'norm' },
  };
}

export interface RoundDiscrepancy {
  elephant: ElephantName;
  metric: RoundMetricKey;
  metricLabel: string;
  expected: RoundValue;
  reported: RoundValue;
  kind: 'cover-up' | 'false-alarm';
}

export interface RoundEvaluationResult {
  accepted: boolean;
  hasCoverUp: boolean;
  hasMismatch: boolean;
  score: number;
  flags: string[];
  activeElephants: ElephantName[];
  discrepancies: RoundDiscrepancy[];
  coverUps: RoundDiscrepancy[];
  falseAlarms: RoundDiscrepancy[];
  tarasTitle: string;
  tarasReply: string;
}

function buildAcceptedTarasReply(active: ElephantName[], rationViolationActive: boolean): string {
  const details: string[] = [];
  if (active.includes('Марго')) {
    details.push('сниженный водопой у Марго зафиксировал');
  }
  if (active.includes('Претти')) {
    details.push('трещину подошвы со складкой у Претти не утаил');
  }
  if (active.includes('Одри')) {
    details.push(
      rationViolationActive
        ? 'кормушку с ЖКТ у Одри проверил по факту'
        : 'кормушку у Одри проверил по факту',
    );
  }
  const summaryText = details.length > 0 ? `: и ${details.join(', и ')}` : '';
  return `«Добро, стажёр! Рапорт честный, без единой приписки${summaryText}. Принимаю смену без замечаний — сводка в журнале станции!»`;
}

/**
 * Сверка рапорта стажёра с фактическим состоянием смены.
 * Сверяются только доступные в Манеже слоны (`activeElephants`).
 * Если стажёр поставил «норма» там, где по факту проблема (приписка), Тарас ловит на расхождении и выписывает замечание.
 */
export function evaluateRoundReport(
  report: RoundReport,
  actual?: RoundReport,
  options?: { activeElephants?: ElephantName[]; biolabRationViolation?: boolean },
): RoundEvaluationResult {
  const activeElephants = normalizeActiveElephants(options?.activeElephants);
  const resolvedActual =
    actual ??
    getActualRoundFacts({
      activeElephants,
      biolabRationViolation: options?.biolabRationViolation,
    });
  const discrepancies: RoundDiscrepancy[] = [];

  for (const el of activeElephants) {
    for (const m of ROUND_METRICS) {
      const exp = resolvedActual[el][m.key];
      const rep = report[el]?.[m.key] ?? 'norm';
      if (exp !== rep) {
        discrepancies.push({
          elephant: el,
          metric: m.key,
          metricLabel: m.label,
          expected: exp,
          reported: rep,
          kind: exp === 'issue' && rep === 'norm' ? 'cover-up' : 'false-alarm',
        });
      }
    }
  }

  const coverUps = discrepancies.filter((d) => d.kind === 'cover-up');
  const falseAlarms = discrepancies.filter((d) => d.kind === 'false-alarm');
  const hasCoverUp = coverUps.length > 0;
  const hasMismatch = discrepancies.length > 0;

  // Оценка от 0 до 10: за каждую приписку («норма» вместо проблемы) снимается 2 балла, за ложную тревогу — 1 балл
  const rawScore = hasMismatch ? 10 - coverUps.length * 2 - falseAlarms.length : 10;
  const score = Math.max(0, Math.min(10, rawScore));
  const flags = hasMismatch ? ['report-mismatch'] : [];

  if (!hasMismatch) {
    const rationViolationActive = activeElephants.includes('Одри') && resolvedActual.Одри.digestion === 'issue';
    return {
      accepted: true,
      hasCoverUp: false,
      hasMismatch: false,
      score: 10,
      flags: [],
      activeElephants,
      discrepancies: [],
      coverUps: [],
      falseAlarms: [],
      tarasTitle: 'Смена принята без замечаний',
      tarasReply: buildAcceptedTarasReply(activeElephants, rationViolationActive),
    };
  }

  if (hasCoverUp) {
    const details = coverUps
      .map((d) => `${d.elephant} (${d.metricLabel.toLowerCase()})`)
      .join('; ');
    return {
      accepted: false,
      hasCoverUp: true,
      hasMismatch: true,
      score,
      flags,
      activeElephants,
      discrepancies,
      coverUps,
      falseAlarms,
      tarasTitle: 'Замечание: выявлена приписка в рапорте!',
      tarasReply: `«Стоп, стажёр! Ты мне тут приписку принёс ради быстрой сдачи — поставил "норма" там, где у слона фактическое отклонение: ${details}. Я же предупреждал: у нас на посту халтура не проходит. Выписываю замечание (report-mismatch) — перепроверь вольеры и исправь рапорт!»`,
    };
  }

  const alarmDetails = falseAlarms
    .map((d) => `${d.elephant} (${d.metricLabel.toLowerCase()})`)
    .join('; ');
  return {
    accepted: false,
    hasCoverUp: false,
    hasMismatch: true,
    score,
    flags,
    activeElephants,
    discrepancies,
    coverUps,
    falseAlarms,
    tarasTitle: 'Расхождение с фактами осмотра',
    tarasReply: `«Приписок с "нормой" нет, но ты приписал лишние болячки там, где у слона полный порядок: ${alarmDetails}. Сверься с журналом наблюдений у вольера и поправь отметки!»`,
  };
}

/**
 * Сдать рапорт Тарасу: сверяет ответы только по активным в Манеже слонам и записывает результат
 * в `ers_progress_v1:slonovet` в поле `items["round-check"]`.
 */
export function submitRoundReportToStation(
  report: RoundReport,
  actual?: RoundReport,
  options?: { activeElephants?: ElephantName[]; biolabRationViolation?: boolean },
): { evaluation: RoundEvaluationResult; progress: ErsProgressPayload } {
  const evaluation = evaluateRoundReport(report, actual, options);
  const progress = recordRoundCheckProgress(evaluation.score, evaluation.hasMismatch);
  return { evaluation, progress };
}
