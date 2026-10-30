import { byNumber, containerName } from './containers';
import type { Container, LoadPlan, Truck } from './types';

/**
 * Погрузка фуры («тетрис»), вид сверху. Без штабелирования: каждый ящик стоит на полу.
 * Оси: x — поперёк кузова (0 — левый борт), y — вдоль кузова (0 — передняя стенка, к дверям растёт).
 */

/** Еврофура: 13,6 × 2,45 × 2,7 м. */
export const EURO_TRUCK = { name: 'Еврофура', length_cm: 1360, width_cm: 245, height_cm: 270 };

/** Ящик к погрузке: l — вдоль кузова, w — поперёк (как поставили бы без поворота), h — высота (0 — неизвестна). */
export interface Box {
  id: string;
  label: string;
  l: number;
  w: number;
  h: number;
}

export interface Placed extends Box {
  x: number;
  y: number;
  /** сколько занимает вдоль и поперёк с учётом поворота */
  dl: number;
  dw: number;
  rotated: boolean;
  /** шаг погрузки: 1 — первым, к передней стенке */
  step: number;
}

export interface PackResult {
  placed: Placed[];
  /** сколько см длины кузова занято от передней стенки */
  usedLength: number;
  /** не влезли по длине/ширине */
  overflow: Box[];
  /** выше кузова — в фуру не войдут */
  tooTall: Box[];
}

/** Одинаковые по полу (Д×Ш с учётом поворота) — одна «фигура»: их можно менять местами, схема не изменится. */
export const shapeKey = (b: Pick<Box, 'l' | 'w'>) => `${Math.max(b.l, b.w)}×${Math.min(b.l, b.w)}`;

/** Буквы фигурам по первому появлению: A — 120×80, B — 100×100… */
export function shapes(boxes: Box[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of boxes) {
    const k = shapeKey(b);
    if (!out.has(k)) out.set(k, String.fromCharCode(65 + (out.size % 26)));
  }
  return out;
}

const overlaps = (a: { x: number; y: number; dw: number; dl: number }, b: { x: number; y: number; dw: number; dl: number }) =>
  a.x < b.x + b.dw && b.x < a.x + a.dw && a.y < b.y + b.dl && b.y < a.y + a.dl;

/**
 * Укладка «к передней стенке, потом к левому борту» в порядке очереди: каждый следующий ящик встаёт как можно ближе
 * к передней стенке, потом к левому борту. Ставится как введено (Д — вдоль кузова); поворачивается, только если так
 * встаёт ближе (например, шире кузова или в щель сбоку). Места-кандидаты — углы уже поставленных ящиков.
 * Порядок очереди сохраняется: это и есть порядок погрузки.
 */
export function pack(truck: Pick<Truck, 'length_cm' | 'width_cm' | 'height_cm'>, boxes: Box[]): PackResult {
  const L = truck.length_cm;
  const W = truck.width_cm;
  const placed: Placed[] = [];
  const overflow: Box[] = [];
  const tooTall: Box[] = [];
  let points: [number, number][] = [[0, 0]];
  for (const b of boxes) {
    if (b.h > truck.height_cm) {
      tooTall.push(b);
      continue;
    }
    let best: { x: number; y: number; dw: number; dl: number; rotated: boolean } | null = null;
    for (const rotated of [false, true]) {
      const dl = rotated ? b.w : b.l;
      const dw = rotated ? b.l : b.w;
      for (const [x, y] of points) {
        const spot = { x, y, dw, dl };
        if (x + dw > W || y + dl > L || placed.some((p) => overlaps(spot, p))) continue;
        // ближе к передней стенке → левее → как введено (без поворота пробуется первым, при равенстве остаётся)
        if (!best || y < best.y || (y === best.y && x < best.x)) best = { ...spot, rotated };
      }
    }
    if (!best) {
      overflow.push(b);
      continue;
    }
    placed.push({ ...b, ...best, step: placed.length + 1 });
    points = [...points, [best.x + best.dw, best.y], [best.x, best.y + best.dl]];
  }
  return { placed, usedLength: placed.reduce((m, p) => Math.max(m, p.y + p.dl), 0), overflow, tooTall };
}

/** «Авто»: крупные по площади вперёд, при равной — длинные. Ящики одной фигуры остаются рядом. */
export function autoOrder<T extends Pick<Box, 'l' | 'w'>>(boxes: T[]): T[] {
  return [...boxes].sort((a, b) => b.l * b.w - a.l * a.w || Math.max(b.l, b.w) - Math.max(a.l, a.w) || shapeKey(a).localeCompare(shapeKey(b)));
}

/** Контейнер → ящик; без длины или ширины — не считается. */
function toBox(c: Container): Box | null {
  if (!c.length_cm || !c.width_cm) return null;
  return { id: c.id, label: containerName(c), l: c.length_cm, w: c.width_cm, h: c.height_cm ?? 0 };
}

/**
 * Что грузим по схеме: едущие контейнеры с габаритами и временные ящики. Порядок — как сохранён в схеме,
 * новые (не было в схеме) — в конец по номеру. off — выключенные в этой схеме, noDims — без габаритов.
 */
export function planBoxes(containers: Container[], plan: Pick<LoadPlan, 'queue' | 'off' | 'extras'>): { queue: Box[]; off: Box[]; noDims: Container[] } {
  const live = containers.filter((c) => !c.deleted && c.in_tour !== false).sort(byNumber);
  const all: Box[] = [];
  const noDims: Container[] = [];
  for (const c of live) {
    const b = toBox(c);
    if (b) all.push(b);
    else noDims.push(c);
  }
  for (const e of plan.extras)
    for (let i = 0; i < Math.max(0, e.count); i++)
      all.push({ id: `${e.id}#${i}`, label: e.count > 1 ? `${e.label || 'Ящик'} ${i + 1}` : e.label || 'Ящик', l: e.l, w: e.w, h: e.h });
  const byId = new Map(all.map((b) => [b.id, b]));
  const pos = new Map(plan.queue.map((id, i) => [id, i]));
  const ordered = [...plan.queue.map((id) => byId.get(id)).filter((b): b is Box => Boolean(b)), ...all.filter((b) => !pos.has(b.id))];
  const off = new Set(plan.off);
  return { queue: ordered.filter((b) => !off.has(b.id)), off: ordered.filter((b) => off.has(b.id)), noDims };
}

/** Поменять местами два ящика в очереди. */
export function swap(ids: string[], a: string, b: string): string[] {
  const i = ids.indexOf(a);
  const j = ids.indexOf(b);
  if (i < 0 || j < 0) return ids;
  const out = [...ids];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
