import type { Role } from './types';

/**
 * Правило: все видят всё, меняет только хозяин раздела.
 * Здесь — кто хозяин. На чужом разделе человек видит «Только просмотр — меняет …».
 * Права в базе (RLS) совпадают с этим списком; дежурство — только кипер (см. ShiftScreen).
 */
export const EDITORS = {
  // задачи ставят все; закрывать чужие — врач, директор, администратор, админ (своё — автор)
  requests: { roles: ['vet', 'director', 'manager', 'admin'], who: 'автор, врач, директор или администратор' },
  diet: { roles: ['vet', 'admin'], who: 'врач' },
  stock: { roles: ['keeper', 'director', 'manager', 'admin'], who: 'киперы, директор и администратор' },
  users: { roles: ['director', 'manager', 'admin'], who: 'директор и администратор' },
  // просить купить может любой; «заказано» и «привезли» отмечают они
  purchases: { roles: ['director', 'manager', 'admin'], who: 'администратор и директор' },
} satisfies Record<string, { roles: Role[]; who: string }>;

export type OwnedSection = keyof typeof EDITORS;

export const canEdit = (section: OwnedSection, role: Role) => (EDITORS[section].roles as Role[]).includes(role);

/** Закрыть или вернуть в работу задачу: автор или те, кто ведёт задачи. */
export const canCloseRequest = (req: { author_id: string | null }, user: { id: string; role: Role }) => req.author_id === user.id || canEdit('requests', user.role);
