// Поставщики по городам (этап C1): поиск и порядок.
import { describe, expect, it } from 'vitest';
import { findSuppliers, supplierCities, suppliersFor } from './suppliers';
import type { Supplier } from './types';

const sup = (id: string, city: string, name: string, extra: Partial<Supplier> = {}): Supplier => ({ id, city, name, supplies: [], phone: '', address: '', quality: null, note: '', created_by: 'А', updated_at: '', ...extra });

describe('поставщики', () => {
  const list = [sup('a', 'Казань', 'Иван', { supplies: ['Сено'], quality: 2 }), sup('b', 'Самара', 'КФХ Петров', { supplies: ['Сено', 'Овощи'], quality: 3 }), sup('c', 'Казань', 'Овощебаза', { supplies: ['Овощи'], quality: 3 })];

  it('текущий город наверху, внутри — лучшие по оценке', () => {
    expect(findSuppliers(list, '', null, 'Казань').map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });

  it('поиск по тому, что возят, и по городу; ё и регистр не мешают', () => {
    expect(findSuppliers(list, 'сено', null, null).map((s) => s.id)).toEqual(['b', 'a']);
    expect(findSuppliers(list, 'КАЗАНЬ', null, null).map((s) => s.id)).toEqual(['c', 'a']);
    expect(findSuppliers(list, '', 'Самара', null).map((s) => s.id)).toEqual(['b']);
  });

  it('города для фильтра: текущий первым, без повторов', () => {
    expect(supplierCities(list, 'Самара')).toEqual(['Самара', 'Казань']);
  });
});

describe('у кого заказать', () => {
  const list = [
    sup('hay1', 'Казань', 'Сенник', { supplies: ['Сено'], quality: 2 }),
    sup('veg1', 'Казань', 'Овощебаза', { supplies: ['Овощи'], quality: 3 }),
    sup('bad', 'Казань', 'Ненадёжный', { supplies: ['Сено'], quality: 1 }),
    sup('far', 'Самара', 'КФХ Петров', { supplies: ['Сено'], quality: 3 }),
  ];

  it('в городе — только его поставщики; кто возит нужное — первым, «плохо» — в конце', () => {
    expect(suppliersFor(list, 'feed', 'Казань').map((s) => s.id)).toEqual(['hay1', 'veg1', 'bad']);
    expect(suppliersFor(list, 'veg', 'Казань').map((s) => s.id)).toEqual(['veg1', 'hay1', 'bad']);
  });

  it('город не отмечен — все', () => {
    expect(suppliersFor(list, null, null)).toHaveLength(4);
  });

  it('ветеринар и мастер в «У кого» закупки не попадают', () => {
    const more = [...list, sup('vet', 'Казань', 'Ветврач Иван', { supplies: ['Ветеринар'] })];
    expect(suppliersFor(more, 'feed', 'Казань').map((s) => s.id)).not.toContain('vet');
  });
});
