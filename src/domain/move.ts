import { ELEPHANTS } from './elephants';
import { countPerDay, dailyUsage, fmtNum } from './stock';
import type { Diet, StockItem, StockMove } from './types';

/**
 * Переезд (гастроли): что подготовить киперам. Шаблон — здесь, в коде;
 * в базе (move_items) хранятся только отметки «кто собрал» и свои пункты.
 */

export interface MoveTemplateItem {
  id: string;
  text: string;
}

export interface MoveSection {
  key: string;
  title: string;
  items: MoveTemplateItem[];
}

export const MOVE_SECTIONS: MoveSection[] = [
  {
    key: 'feed',
    title: 'Корм в дорогу',
    items: [
      { id: 'feed-veg', text: 'Овощи нарезаны по коробкам — коробка на голову на ужин' },
      { id: 'feed-salt', text: 'Соль и мел' },
      { id: 'feed-hay', text: 'Сено погружено' },
      { id: 'feed-grain', text: 'Зерносмесь расфасована по дням' },
      { id: 'feed-porridge', text: 'Каши (ФормаМакс, ОптиФорм, Mono Grass)' },
      { id: 'feed-branches', text: 'Ветки' },
      { id: 'feed-treats', text: 'Подкормка для репетиций' },
    ],
  },
  {
    key: 'water',
    title: 'Вода и посуда',
    items: [
      { id: 'water-canisters', text: 'Вода в дорогу (канистры, баки)' },
      { id: 'water-bowls', text: 'Тазы-кормушки — по одному на голову и запас' },
      { id: 'water-tank', text: 'Бак 65 л для мочи' },
      { id: 'water-baskets', text: 'Корзины в дырочку и корзиночки' },
      { id: 'water-hoses', text: 'Шланги, муфты, переходники' },
      { id: 'water-buckets', text: 'Вёдра' },
    ],
  },
  {
    key: 'clean',
    title: 'Уборка',
    items: [
      { id: 'clean-scoop', text: 'Совки и скребки' },
      { id: 'clean-tools', text: 'Лопата, вилы, грабли, веники' },
      { id: 'clean-bags', text: 'Мешки 240 л' },
      { id: 'clean-sawdust', text: 'Опилки' },
      { id: 'clean-straw', text: 'Солома для подстилки' },
      { id: 'clean-cart', text: 'Тачка' },
    ],
  },
  {
    key: 'care',
    title: 'Уход и аптечка',
    items: [
      { id: 'care-brushes', text: 'Щётки — металлические и мягкие' },
      { id: 'care-soap', text: 'Мыло' },
      { id: 'care-blower', text: 'Ветродуйка' },
      { id: 'care-meds', text: 'Аптечка и препараты по списку врача' },
    ],
  },
  {
    key: 'show',
    title: 'Манеж',
    items: [
      { id: 'show-hook', text: 'Багор, арапник' },
      { id: 'show-bags', text: 'Сумки для подкормки' },
      { id: 'show-props', text: 'Реквизит — по списку дрессировщика' },
    ],
  },
  {
    key: 'leave',
    title: 'Перед выездом',
    items: [
      { id: 'leave-check', text: 'Слоновник обойдён — ничего не забыли' },
      { id: 'leave-trash', text: 'Помойка вывезена, мешки не оставлены' },
      { id: 'leave-bedding', text: 'Подстилка вывезена на помойку' },
      { id: 'leave-wash', text: 'Помещения помыты' },
      { id: 'leave-bolts', text: 'Болты на цепях и балках проверены' },
      { id: 'leave-keys', text: 'Ключи на 17 на месте' },
      { id: 'leave-elephants', text: 'Все трое осмотрены перед погрузкой' },
    ],
  },
];

export const DAYS_ID = '_days';

export interface MoveNeed {
  label: string;
  value: string;
  /** к какому пункту сборов относится */
  item?: string;
}

/**
 * Что брать с собой: дни в дороге + запас на первые дни на новом месте (пока не наладятся поставки).
 * В дороге каши и зерносмесь отменены — они нужны только на запас; овощи и сено — на всё время; сено на запас — только если
 * на новой точке его нет.
 */
export function moveNeeds(days: number, diets: Diet[], items: StockItem[], moves: StockMove[], opts: { reserve?: number; hayThere?: boolean } = {}): MoveNeed[] {
  const reserve = opts.reserve ?? 0;
  const all = days + reserve;
  const heads = ELEPHANTS.length;
  const usage = dailyUsage(diets, items);
  const hay = countPerDay(moves, 'hay') || 9;
  const bags = countPerDay(moves, 'bags') || 2;
  const kg = (ids: string[], n: number) => ids.reduce((s, id) => s + (usage.get(id) ?? 0), 0) * n;
  const out: MoveNeed[] = [
    { label: 'Коробок овощей', value: `${all * heads}`, item: 'feed-veg' },
    { label: 'Сена, тюков', value: `≈ ${Math.round(hay * (days + (opts.hayThere ? 0 : reserve)))}`, item: 'feed-hay' },
    // зерносмесь и каши в дороге не дают — только запас на новое место
    { label: 'Зерносмеси', value: `≈ ${fmtNum(kg(['hercules', 'bran', 'oats', 'corn', 'seeds'], reserve), 0)} кг`, item: 'feed-grain' },
  ];
  for (const it of items.filter((i) => ['formamax', 'optiform', 'monograss'].includes(i.id))) {
    // каши в дороге не дают — только запас на новое место
    const need = (usage.get(it.id) ?? 0) * reserve;
    if (need > 0) {
      out.push({
        label: it.name,
        value: `${fmtNum(need, 1)} кг${it.sack_kg ? ` · ${Math.ceil(need / it.sack_kg)} меш.` : ''}`,
        item: 'feed-porridge',
      });
    }
  }
  out.push({ label: 'Мешков 240 л', value: `≈ ${Math.ceil(bags * all)}`, item: 'clean-bags' });
  return out;
}
