import type { Role } from '../domain/types';
import { switchDemoRole, useSession } from '../lib/auth';
import { setPreviewRole, usePreviewRole } from '../lib/preview';
import { ROLE_LABEL } from './Shell';

/**
 * Только при разработке (npm run dev) — в сборку для сайта не попадает: быстро сменить роль и посмотреть,
 * какие кнопки кому доступны в одном и том же экране. В примере меняет роль демо-пользователя,
 * под рабочей учёткой админа — включает «Посмотреть как».
 */
const ROLES: Role[] = ['keeper', 'vet', 'director', 'manager', 'admin'];
const SHORT: Record<Role, string> = { keeper: 'Кип', vet: 'Врач', director: 'Дир', manager: 'Адм-р', admin: 'Админ' };

export function DevRoleSwitcher() {
  const session = useSession();
  const preview = usePreviewRole();
  if (!session) return null;
  const demo = session.mode === 'demo';
  if (!demo && session.user.role !== 'admin') return null;
  const current = demo ? session.user.role : (preview ?? 'admin');
  return (
    <div className="fixed bottom-24 left-2 z-40 flex gap-1 rounded-2xl border border-edge-hi bg-surface/70 p-1 shadow-(--shadow-plate) backdrop-blur-xl md:bottom-3" aria-label="Роль для проверки (разработка)">
      {ROLES.map((r) => (
        <button
          key={r}
          type="button"
          title={ROLE_LABEL[r]}
          onClick={() => (demo ? switchDemoRole(r) : setPreviewRole(r === 'admin' ? null : r))}
          className={`h-8 rounded-xl px-2 text-[12px] font-extrabold transition-transform active:scale-95 ${
            current === r ? 'bg-teal bg-[linear-gradient(to_bottom,rgb(255_255_255/0.22),transparent_55%)] text-teal-ink shadow-(--shadow-glow-teal)' : 'text-muted'
          }`}
        >
          {SHORT[r]}
        </button>
      ))}
    </div>
  );
}
