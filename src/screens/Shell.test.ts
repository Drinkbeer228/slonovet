// Единый каркас: у всех ролей одни и те же разделы; «Персонал» в меню — только у тех, кто заводит людей.
import { describe, expect, it } from 'vitest';
import { MANAGES } from '../domain/access';
import type { Role } from '../domain/types';
import { TABS, menuTabs } from './Shell';

const ROLES: Role[] = ['keeper', 'vet', 'director', 'manager', 'admin'];

describe('единый каркас', () => {
  it('нижние разделы одинаковые у всех: Дежурство, Журнал, Заявки, Фураж', () => {
    expect(TABS).toEqual(['shift', 'journal', 'requests', 'stock']);
  });

  it('меню одно у всех, «Персонал» — только у тех, кто заводит людей', () => {
    for (const r of ROLES) {
      const m = menuTabs(r);
      expect(m.filter((t) => t !== 'users')).toEqual(['diet', 'move', 'rating', 'guide']);
      expect(m.includes('users')).toBe(Boolean(MANAGES[r]?.length));
    }
  });
});
