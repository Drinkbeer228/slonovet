import type { Role } from './types';

/**
 * Правило: все видят всё, меняет только хозяин раздела.
 * Здесь — кто хозяин. На чужом разделе человек видит «Только просмотр — меняет …».
 * Права в базе (RLS) совпадают с этим списком; дежурство — только кипер (см. ShiftScreen).
 */
export const EDITORS = {
  requests: { roles: ['vet', 'director', 'admin'], who: 'врач и директор' },
  diet: { roles: ['vet', 'admin'], who: 'врач' },
  stock: { roles: ['keeper', 'manager', 'admin'], who: 'киперы и администратор' },
  users: { roles: ['director', 'manager', 'admin'], who: 'директор и администратор' },
} satisfies Record<string, { roles: Role[]; who: string }>;

export type OwnedSection = keyof typeof EDITORS;

export const canEdit = (section: OwnedSection, role: Role) => (EDITORS[section].roles as Role[]).includes(role);
