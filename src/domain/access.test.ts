// Одна таблица прав (access.ts) против базы и сервера: что разрешает экран, то разрешают права в базе (RLS)
// по последней миграции, а функция admin-users знает тех же, кто с кем работает в «Персонале».
import { describe, expect, it } from 'vitest';
import adminUsers from '../../supabase/functions/admin-users/index.ts?raw';
import { EDITORS, MANAGES, canReceiveHandover, canTakeShift, canWorkShift } from './access';
import type { Role } from './types';

const files = import.meta.glob('../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Кому по миграциям разрешена запись в таблицу: последняя политика с этим именем, по порядку файлов. */
function policyRoles(): Map<string, Role[]> {
  const out = new Map<string, Role[]>();
  const roles = (list: string) => [...list.matchAll(/'(\w+)'/g)].map((m) => m[1] as Role).sort();
  for (const name of Object.keys(files).sort()) {
    const sql = files[name];
    const found: { at: number; key: string; roles: Role[] }[] = [];
    // create policy "write"|"insert"|"update" on public.<таблица> … my_role() in (…)
    for (const m of sql.matchAll(/create policy "(write|insert|update)" on public\.(\w+)[\s\S]*?my_role\(\) in \(([^)]*)\)/g)) {
      found.push({ at: m.index, key: `${m[2]}.${m[1]}`, roles: roles(m[3]) });
    }
    // 001: те же политики в цикле по таблицам — foreach t in array array[…] … create policy "write" … in (…)
    for (const m of sql.matchAll(/foreach t in array array\[([^\]]+)\] loop[\s\S]*?create policy "write" on public\.%I[\s\S]*?my_role\(\) in \(([^)]*)\)/g)) {
      for (const t of [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1])) found.push({ at: m.index, key: `${t}.write`, roles: roles(m[2]) });
    }
    for (const f of found.sort((a, b) => a.at - b.at)) out.set(f.key, f.roles);
  }
  return out;
}

const sorted = (r: readonly Role[]) => [...r].sort();

describe('права: экран = база = сервер', () => {
  const db = policyRoles();

  it('фураж: позиции и движения пишут те, кому экран разрешает', () => {
    expect(db.get('stock_items.write')).toEqual(sorted(EDITORS.stock.roles));
    expect(db.get('stock_moves.write')).toEqual(sorted(EDITORS.stock.roles));
  });

  it('рацион правят врач и системный админ', () => {
    expect(db.get('diets.write')).toEqual(sorted(EDITORS.diet.roles));
  });

  it('задачи: закрывают и правят чужие те же роли, что на экране', () => {
    expect(db.get('requests.update')).toEqual(sorted(EDITORS.requests.roles));
  });

  it('обсуждение: писать и править — только свой комментарий', () => {
    const sql = Object.entries(files).find(([n]) => n.includes('018_'))![1];
    for (const p of ['insert', 'update']) expect(sql).toMatch(new RegExp(`create policy "${p}" on public\\.request_comments[\\s\\S]*?author_id = auth\\.uid\\(\\)`));
  });

  it('закупки: «Заказано» и «Привезли» — те же роли, что на экране', () => {
    expect(db.get('purchases.update')).toEqual(sorted(EDITORS.purchases.roles));
  });

  it('дежурство: всем, кого экран пускает вести смену, база разрешает запись', () => {
    const allowed = db.get('shifts.write') ?? [];
    for (const r of ['keeper', 'vet', 'director', 'manager', 'admin'] as Role[]) if (canWorkShift(r)) expect(allowed).toContain(r);
  });

  it('заступить на дежурство: кому экран разрешает, тому база пишет смену (директору и администратору — только свою)', () => {
    const allowed = db.get('shifts.write') ?? [];
    const own = /create policy "write_own" on public\.shifts[\s\S]*?my_role\(\) in \(([^)]*)\) and keeper_id = auth\.uid\(\)/.exec(
      Object.entries(files).sort().map(([, sql]) => sql).join('\n'),
    );
    expect(own).not.toBeNull();
    const ownRoles = [...own![1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    for (const r of ['keeper', 'vet', 'director', 'manager', 'admin'] as Role[]) if (canTakeShift(r)) expect([...allowed, ...ownRoles]).toContain(r);
  });

  it('правило дежурства: заступают keeper и director (admin — аварийно); manager и врач — никогда, ни на экране, ни в базе', () => {
    expect((['keeper', 'vet', 'director', 'manager', 'admin'] as Role[]).filter(canTakeShift).sort()).toEqual(['admin', 'director', 'keeper']);
    expect((['keeper', 'vet', 'director', 'manager', 'admin'] as Role[]).filter(canReceiveHandover).sort()).toEqual(['director', 'keeper']);
    const sql = Object.entries(files).sort().map(([, s]) => s).join('\n');
    const last = [...sql.matchAll(/create policy "write_own" on public\.shifts[\s\S]*?my_role\(\) in \(([^)]*)\) and keeper_id = auth\.uid\(\)/g)].pop();
    expect([...last![1].matchAll(/'(\w+)'/g)].map((m) => m[1])).toEqual(['director']);
    expect(db.get('shifts.write') ?? []).not.toContain('manager');
  });

  it('«Персонал»: функция admin-users знает тех же, кто с кем работает', () => {
    const m = /const MANAGES[^=]*=\s*\{([^}]*)\}/.exec(adminUsers);
    expect(m).not.toBeNull();
    const all = /const ROLES = \[([^\]]*)\]/.exec(adminUsers)![1];
    const fromFn = Object.fromEntries(
      [...m![1].matchAll(/(\w+):\s*(ROLES|\[[^\]]*\])/g)].map(([, role, list]) => [role, [...(list === 'ROLES' ? all : list).matchAll(/'(\w+)'/g)].map((x) => x[1]).sort()]),
    );
    expect(fromFn).toEqual(Object.fromEntries(Object.entries(MANAGES).map(([k, v]) => [k, sorted(v)])));
  });
});
