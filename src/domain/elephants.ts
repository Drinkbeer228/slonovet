import type { ElephantName, MetricKey } from './types';

export const ELEPHANTS: ElephantName[] = ['Претти', 'Марго', 'Одри'];

export const ELEPHANT_INFO: Record<ElephantName, { short: string; age: string; weight: string }> = {
  Претти: { short: 'П', age: '34 года', weight: '4 200 кг' },
  Марго: { short: 'М', age: '18 лет', weight: '3 600 кг' },
  Одри: { short: 'О', age: '17 лет', weight: '3 400 кг' },
};

export interface MetricMeta {
  key: MetricKey;
  label: string;
  symptoms: string[];
}

/** Строки таблицы состояния — как в бумажном журнале. Симптомы — короткие наблюдаемые факты, не диагнозы. */
export const METRICS: MetricMeta[] = [
  { key: 'behavior', label: 'Общее', symptoms: ['вялая', 'беспокойна', 'качается', 'хобот вялый', 'не машет ушами'] },
  { key: 'sleep', label: 'Сон', symptoms: ['не ложилась', 'спала стоя', 'беспокойно', 'долго лежала'] },
  { key: 'food', label: 'Еда', symptoms: ['не доела', 'отказ', 'ест медленно', 'роняет корм'] },
  { key: 'water', label: 'Вода', symptoms: ['пьёт мало', 'не подходила', 'пьёт много'] },
  { key: 'urine', label: 'Моча', symptoms: ['мутная', 'тёмная', 'песок / осадок', 'мало', 'ложные вызовы'] },
  { key: 'feces', label: 'Кал', symptoms: ['жидкий', 'кашица', 'твёрдые болюсы', 'сухой', 'много непереваренного', 'слизь', 'давно не было'] },
  { key: 'legs', label: 'Ноги', symptoms: ['хромает', 'часто переминается', 'трещина', 'горячая подошва', 'разгружает ногу'] },
];

export const METRIC_LABEL = Object.fromEntries(METRICS.map((m) => [m.key, m.label])) as Record<MetricKey, string>;

export const LEVEL_LABEL = ['норма', 'внимание', 'плохо'] as const;

export const SAFETY_CHECKS: { key: string; label: string }[] = [
  // что реально проверяют при приёме (со слов слоноводов)
  { key: 'elephants', label: 'Слоны здоровы и чистые, не спали в моче и навозе' },
  { key: 'bedding', label: 'Подстилка сухая' },
  { key: 'tools', label: 'Инвентарь цел и на месте: совок, скребок, бак, тазы, багры' },
  { key: 'water', label: 'Вода наполнена' },
  { key: 'air', label: 'Проветрено' },
  { key: 'place', label: 'Дежурное место убрано: кровать, пыль, пол' },
  { key: 'fence', label: 'Электропастух работает' },
];

/** Разрешённые виды — по листу «Рацион слонов» в слоновнике */
/** Ветки никто не взвешивает — сколько дали, на глаз */
export const BRANCH_AMOUNT = ['не давали', 'немного', 'как обычно', 'много'];

export const BRANCH_KINDS = ['Тутовник', 'Ольха', 'Бамбук', 'Орешник', 'Ива', 'Ясень', 'Липа', 'Дуб (без желудей)', 'Веники'];
