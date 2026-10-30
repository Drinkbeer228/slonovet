// «Контейнеры»: поиск реквизита по описи, фильтр по типу, габариты.
import { describe, expect, it } from 'vitest';
import { dims, findInContainers } from './containers';
import type { Container } from './types';

const box = (id: string, number: string, contents: string, extra: Partial<Container> = {}): Container => ({ id, number, contents, note: '', created_by: 'А', updated_at: '', ...extra });

describe('контейнеры', () => {
  const list = [
    box('a', '10', 'Удлинитель 20 м', { kind: 'light_sound' }),
    box('b', '6', 'Синяя шляпа в звёздочку\nКрасный плащ', { kind: 'props' }),
    box('c', '2', 'Попоны', { kind: 'props', note: 'грузить последним' }),
  ];

  it('«синяя шляпа» → контейнер №6 и строка описи', () => {
    expect(findInContainers(list, 'синяя шляпа').map((r) => [r.c.number, r.lines])).toEqual([['6', ['Синяя шляпа в звёздочку']]]);
  });

  it('без запроса — все по номеру: 2, 6, 10; ищется по типу и заметке', () => {
    expect(findInContainers(list, '').map((r) => r.c.number)).toEqual(['2', '6', '10']);
    expect(findInContainers(list, 'свет').map((r) => r.c.number)).toEqual(['10']);
    expect(findInContainers(list, 'последним').map((r) => r.c.number)).toEqual(['2']);
  });

  it('фильтр по типу вместе с поиском', () => {
    expect(findInContainers(list, '', 'props').map((r) => r.c.number)).toEqual(['2', '6']);
    expect(findInContainers(list, 'удлинитель', 'props')).toEqual([]);
  });

  it('габариты: что известно, остальное «?»', () => {
    expect(dims({ length_cm: 120, width_cm: 80, height_cm: 110 })).toBe('120×80×110');
    expect(dims({ length_cm: 120, width_cm: null, height_cm: null })).toBe('120×?×?');
    expect(dims({})).toBe('');
  });
});
