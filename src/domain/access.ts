import type { Role } from './types';

/**
 * Правило: все видят всё, меняет только хозяин раздела.
 * Здесь — кто хозяин. На чужом разделе человек видит «Только просмотр — меняет …».
 * Все правила доступа приложения — здесь. Права в базе (RLS) и функция admin-users совпадают с ними:
 * это проверяет src/domain/access.test.ts.
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

/** Ведёт дежурство (отметки, кормление, сдача) — только кипер. База пускает и системного админа, но экран строже. */
export const canWorkShift = (role: Role) => role === 'keeper';

/** Может заступить на дежурство (принять смену, в том числе не сданную): кипер, а также директор и администратор. */
export const canTakeShift = (role: Role) => role === 'keeper' || role === 'director' || role === 'manager' || role === 'admin';

/** С кем работает роль в «Персонале»: заводит, меняет пароль, отключает. Функция admin-users проверяет то же. */
export const MANAGES: Partial<Record<Role, Role[]>> = {
  admin: ['keeper', 'vet', 'director', 'manager', 'admin'],
  director: ['keeper', 'vet', 'director', 'manager'],
  manager: ['keeper', 'vet'],
};

/** Логины в «Персонале» видят только директор и системный админ — остальным только имена. */
export const SEES_LOGINS: Role[] = ['director', 'admin'];
