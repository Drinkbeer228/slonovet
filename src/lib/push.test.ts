// Push: кому и что уходит (функция notify на сервере) и «заканчивается» — один раз в день с телефона.
import { describe, expect, it } from 'vitest';
import { ROLES_FOR, message, recipients } from '../../supabase/functions/notify/recipients';
import { EDITORS } from '../domain/access';
import { newlyLow, pushTopics } from './push';

const people = [
  { id: 'k1', role: 'keeper', active: true },
  { id: 'k2', role: 'keeper', active: false },
  { id: 'v1', role: 'vet', active: true },
  { id: 'd1', role: 'director', active: true },
  { id: 'm1', role: 'manager', active: true },
  { id: 'a1', role: 'admin', active: true },
];

describe('push-уведомления: кому и что', () => {
  it('срочное назначение — дежурному киперу и системному админу, не автору', () => {
    const many = [...people, { id: 'k3', role: 'keeper', active: true }];
    const urgent = { type: 'urgent' as const, id: 'r1', elephant: 'Марго', text: 'Смотреть ногу', author_id: 'v1' };
    expect(recipients(urgent, many, 'k3')).toEqual(['a1', 'k3']);
    expect(recipients(urgent, many, null)).toEqual(['k1', 'a1', 'k3']); // смены нет — всем киперам, чтобы не потерялось
  });

  it('«плохо» у слонихи — врачу, директору и админу, не тому, кто отметил', () => {
    expect(recipients({ type: 'bad', shift_id: 's1', elephant: 'Одри', metric: 'legs', author_id: 'k1' }, people)).toEqual(['v1', 'd1', 'a1']);
    const m = message({ type: 'bad', shift_id: 's1', elephant: 'Одри', metric: 'legs', keeper_name: 'Дима' }, '2026-10-27');
    expect(m.title).toBe('Одри: ноги — плохо');
    expect(m.url).toBe('/?tab=shift');
  });

  it('закупки и «заканчивается» — тем же, кто отмечает «Заказано»/«Привезли» на экране', () => {
    expect(ROLES_FOR.purchase.sort()).toEqual([...EDITORS.purchases.roles].sort());
    expect(ROLES_FOR.low.sort()).toEqual([...EDITORS.purchases.roles].sort());
    expect(recipients({ type: 'purchase', id: 'p1', title: 'Сено', author_id: 'm1' }, people)).toEqual(['d1', 'a1']);
  });

  it('одно событие — один ключ: повтор той же строки и «заканчивается» в тот же день не уходят второй раз', () => {
    expect(message({ type: 'urgent', id: 'r1', elephant: 'all', text: 'x' }, '2026-10-27').key).toBe('urgent:r1');
    expect(message({ type: 'low', item_id: 'oats', item_name: 'Овёс', days: 2.4 }, '2026-10-27').key).toBe('low:oats:2026-10-27');
    expect(message({ type: 'low', item_id: 'oats', item_name: 'Овёс', days: 2.4 }, '2026-10-28').key).toBe('low:oats:2026-10-28');
  });

  it('подпись в меню совпадает с тем, кому функция реально шлёт', () => {
    for (const role of ['keeper', 'vet', 'director', 'manager', 'admin']) {
      const gets = (Object.keys(ROLES_FOR) as (keyof typeof ROLES_FOR)[]).filter((t) => ROLES_FOR[t].includes(role));
      expect(pushTopics(role).length > 0).toBe(gets.length > 0);
    }
  });

  it('«заканчивается» с телефона: о позиции сообщаем один раз в день', () => {
    expect(newlyLow(['oats', 'hay'], null, '2026-10-27')).toEqual(['oats', 'hay']);
    expect(newlyLow(['oats', 'hay'], { day: '2026-10-27', ids: ['oats'] }, '2026-10-27')).toEqual(['hay']);
    expect(newlyLow(['oats'], { day: '2026-10-26', ids: ['oats'] }, '2026-10-27')).toEqual(['oats']);
  });
});
