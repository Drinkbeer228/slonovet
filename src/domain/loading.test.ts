// Погрузка фуры («тетрис»): укладка вида сверху, фигуры, очередь из описи.
import { describe, expect, it } from 'vitest';
import { EURO_TRUCK, autoOrder, pack, planBoxes, shapeKey, shapes, swap, type Box } from './loading';
import type { Container } from './types';

const box = (id: string, l: number, w: number, h = 100): Box => ({ id, label: id, l, w, h });
const geom = (r: ReturnType<typeof pack>) => r.placed.map((p) => [p.x, p.y, p.dw, p.dl]);

describe('укладка', () => {
  it('три поддона 120×80 встают в ряд поперёк еврофуры — заняты первые 120 см', () => {
    const r = pack(EURO_TRUCK, [box('a', 120, 80), box('b', 120, 80), box('c', 120, 80)]);
    expect(r.placed.map((p) => [p.x, p.y])).toEqual([[0, 0], [80, 0], [160, 0]]);
    expect(r.usedLength).toBe(120);
    expect(r.overflow).toEqual([]);
  });

  it('ящик шире кузова поворачивается и встаёт вдоль', () => {
    const r = pack(EURO_TRUCK, [box('long', 60, 300)]);
    expect(r.placed[0]).toMatchObject({ rotated: true, dl: 300, dw: 60, x: 0, y: 0 });
  });

  it('не влезло по длине — в перегруз, остальное стоит', () => {
    const small = { length_cm: 300, width_cm: 245, height_cm: 270 };
    const r = pack(small, ['a', 'b', 'c', 'd', 'e'].map((id) => box(id, 120, 120)));
    expect(r.placed).toHaveLength(4);
    expect(r.overflow.map((b) => b.id)).toEqual(['e']);
    expect(r.usedLength).toBe(240);
  });

  it('выше кузова — «не пройдёт по высоте», в схему не ставится', () => {
    const r = pack(EURO_TRUCK, [box('tall', 100, 100, 290), box('ok', 100, 100, 200)]);
    expect(r.tooTall.map((b) => b.id)).toEqual(['tall']);
    expect(r.placed.map((p) => [p.id, p.x, p.y])).toEqual([['ok', 0, 0]]);
  });

  it('одинаковые фигуры можно менять местами — геометрия та же', () => {
    const list = [box('a', 120, 80), box('b', 200, 100), box('c', 120, 80), box('d', 80, 120)];
    const swapped = [list[2], list[1], list[0], list[3]];
    expect(geom(pack(EURO_TRUCK, swapped))).toEqual(geom(pack(EURO_TRUCK, list)));
    expect(shapeKey(list[3])).toBe(shapeKey(list[0])); // 80×120 — та же фигура, что 120×80
    expect([...shapes(list).entries()]).toEqual([['120×80', 'A'], ['200×100', 'B']]);
  });

  it('«Авто»: крупные вперёд, одна фигура рядом', () => {
    const order = autoOrder([box('s', 50, 50), box('a', 120, 80), box('big', 200, 120), box('a2', 80, 120)]);
    expect(order.map((b) => b.id)).toEqual(['big', 'a', 'a2', 's']);
  });

  it('swap меняет два места в очереди', () => {
    expect(swap(['a', 'b', 'c'], 'a', 'c')).toEqual(['c', 'b', 'a']);
    expect(swap(['a', 'b'], 'a', 'zz')).toEqual(['a', 'b']);
  });
});

describe('что грузим', () => {
  const c = (id: string, number: string, extra: Partial<Container> = {}): Container => ({ id, number, contents: '', note: '', created_by: '', updated_at: '', length_cm: 120, width_cm: 80, height_cm: 100, ...extra });
  const containers = [
    c('c2', '2'),
    c('c6', '6'),
    c('c10', '10'),
    c('home', '7', { in_tour: false }),
    c('nodim', '9', { length_cm: null }),
    c('gone', '11', { deleted: true }),
  ];

  it('порядок из схемы, новые — в конец по номеру; не едет и удалённые — мимо; без габаритов — отдельно', () => {
    const r = planBoxes(containers, { queue: ['c10', 'c2'], off: [], extras: [] });
    expect(r.queue.map((b) => b.id)).toEqual(['c10', 'c2', 'c6']);
    expect(r.noDims.map((x) => x.number)).toEqual(['9']);
  });

  it('выключенные в схеме — в off; временные ящики — по количеству', () => {
    const r = planBoxes(containers, { queue: [], off: ['c6'], extras: [{ id: 'x', label: 'Сено', count: 2, l: 100, w: 50, h: 50 }] });
    expect(r.off.map((b) => b.id)).toEqual(['c6']);
    expect(r.queue.map((b) => b.label)).toEqual(['№2', '№10', 'Сено 1', 'Сено 2']);
  });
});
