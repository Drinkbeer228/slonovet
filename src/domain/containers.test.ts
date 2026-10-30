// «Контейнеры» (этап C3): поиск реквизита по описи.
import { describe, expect, it } from 'vitest';
import { findInContainers } from './containers';
import type { Container } from './types';

const box = (id: string, number: string, contents: string, truck = ''): Container => ({ id, number, truck, contents, note: '', created_by: 'А', updated_at: '' });

describe('контейнеры', () => {
  const list = [box('a', '10', 'Удлинитель 20 м'), box('b', '6', 'Синяя шляпа в звёздочку\nКрасный плащ', 'Фура 2'), box('c', '2', 'Попоны')];

  it('«синяя шляпа» → контейнер №6 и строка описи', () => {
    expect(findInContainers(list, 'синяя шляпа').map((r) => [r.c.number, r.lines])).toEqual([['6', ['Синяя шляпа в звёздочку']]]);
  });

  it('без запроса — все по номеру: 2, 6, 10; ищется и по фуре', () => {
    expect(findInContainers(list, '').map((r) => r.c.number)).toEqual(['2', '6', '10']);
    expect(findInContainers(list, 'фура 2').map((r) => r.c.number)).toEqual(['6']);
  });
});
