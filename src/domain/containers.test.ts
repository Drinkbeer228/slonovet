// «Контейнеры»: поиск реквизита по описи, фильтр по типу, габариты.
import { describe, expect, it } from 'vitest';
import { dims, findInContainers, placeOf, tags, tagsLabel } from './containers';
import type { Container } from './types';

const box = (id: string, number: string, contents: string, extra: Partial<Container> = {}): Container => ({ id, number, contents, note: '', created_by: 'А', updated_at: '', ...extra });

describe('контейнеры', () => {
  const list = [
    box('a', '10', 'Удлинитель 20 м', { kind: 'case', purpose: 'light_sound' }),
    box('b', '6', 'Синяя шляпа в звёздочку\nКрасный плащ', { kind: 'case', purpose: 'props', in_tour: false }),
    box('c', '2', 'Попоны', { kind: 'wheels', purpose: 'elephants', note: 'грузить последним' }),
  ];

  it('«синяя шляпа» → контейнер №6 и строка описи', () => {
    expect(findInContainers(list, 'синяя шляпа').map((r) => [r.c.number, r.lines])).toEqual([['6', ['Синяя шляпа в звёздочку']]]);
  });

  it('без запроса — все по номеру: 2, 6, 10; ищется по типу и заметке', () => {
    expect(findInContainers(list, '').map((r) => r.c.number)).toEqual(['2', '6', '10']);
    expect(findInContainers(list, 'свет').map((r) => r.c.number)).toEqual(['10']);
    expect(findInContainers(list, 'последним').map((r) => r.c.number)).toEqual(['2']);
  });

  it('фильтр по таре, «что внутри» и месту — вместе с поиском', () => {
    expect(findInContainers(list, '', { kind: 'case' }).map((r) => r.c.number)).toEqual(['6', '10']);
    expect(findInContainers(list, '', { purpose: 'elephants' }).map((r) => r.c.number)).toEqual(['2']);
    expect(findInContainers(list, '', { place: 'base' }).map((r) => r.c.number)).toEqual(['6']);
    expect(findInContainers(list, '', { place: 'tour', kind: 'case' }).map((r) => r.c.number)).toEqual(['10']);
    expect(findInContainers(list, 'удлинитель', { purpose: 'props' })).toEqual([]);
    expect(findInContainers(list, 'слоны').map((r) => r.c.number)).toEqual(['2']);
  });

  it('старые виды «Свет/звук», «Реквизит», «Личный багаж» — это «что внутри», тара не указана', () => {
    expect(tags({ kind: 'light_sound' })).toEqual({ kind: '', purpose: 'light_sound' });
    expect(tags({ kind: 'luggage' })).toEqual({ kind: '', purpose: 'personal' });
    expect(tags({ kind: 'case', purpose: 'props' })).toEqual({ kind: 'case', purpose: 'props' });
    expect(tagsLabel({ kind: 'props' })).toBe('Реквизит');
    expect(findInContainers([box('x', '7', 'Пульт', { kind: 'light_sound' })], '', { purpose: 'light_sound' })).toHaveLength(1);
  });

  it('место: без отметки — в туре, in_tour=false — на базе', () => {
    expect(placeOf({})).toBe('tour');
    expect(placeOf({ in_tour: false })).toBe('base');
  });

  it('габариты: что известно, остальное «?»', () => {
    expect(dims({ length_cm: 120, width_cm: 80, height_cm: 110 })).toBe('120×80×110');
    expect(dims({ length_cm: 120, width_cm: null, height_cm: null })).toBe('120×?×?');
    expect(dims({})).toBe('');
  });
});
