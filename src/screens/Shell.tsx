import { useState } from 'react';
import type { CurrentUser, Role } from '../domain/types';
import { logout, type Session } from '../lib/auth';
import { syncNow, useSyncStatus } from '../lib/sync';
import { isoDate, relDate, timeOf } from '../lib/dates';
import { Button, Card, Segmented, Sheet } from '../ui/kit';
import { THEME_LABEL, setTheme, useTheme, type Theme } from '../lib/theme';
import { Icon, type IconName } from '../ui/Icon';

export type Tab = 'shift' | 'requests' | 'diet' | 'stock' | 'journal' | 'users' | 'guide' | 'rating' | 'move';

export const TAB_META: Record<Tab, { label: string; icon: IconName }> = {
  shift: { label: 'Дежурство', icon: 'shift' },
  requests: { label: 'Заявки', icon: 'message' },
  diet: { label: 'Рацион', icon: 'bowl' },
  stock: { label: 'Фураж', icon: 'box' },
  journal: { label: 'Журнал', icon: 'book' },
  users: { label: 'Люди', icon: 'users' },
  guide: { label: 'Справка', icon: 'question' },
  rating: { label: 'Рейтинг и ачивки', icon: 'trophy' },
  move: { label: 'Переезд', icon: 'truck' },
};

export const TABS_BY_ROLE: Record<Role, Tab[]> = {
  keeper: ['shift', 'diet', 'stock', 'journal'],
  // дежурство видят все: не кипер — только смотрит
  vet: ['journal', 'shift', 'requests', 'diet'],
  director: ['journal', 'shift', 'requests', 'stock'],
  manager: ['stock', 'shift', 'journal'],
  admin: ['shift', 'journal', 'requests', 'stock'],
};

/** Порядок разделов в меню */
const ALL_TABS: Tab[] = ['shift', 'journal', 'requests', 'diet', 'stock', 'users', 'move', 'rating', 'guide'];

/** Все видят всё: чего нет на нижней панели — открывается из меню (на чужом разделе — только просмотр). */
export const MENU_TABS = Object.fromEntries(
  (Object.keys(TABS_BY_ROLE) as Role[]).map((r) => [r, ALL_TABS.filter((t) => !TABS_BY_ROLE[r].includes(t))]),
) as Record<Role, Tab[]>;

const ROLE_LABEL: Record<Role, string> = { keeper: 'Кипер', vet: 'Ветврач', director: 'Директор', manager: 'Администратор', admin: 'Системный админ' };

export function Logo({ size = 32 }: { size?: number }) {
  return <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={size} height={size} className="rounded-[22%]" />;
}

/** Записи копятся на телефоне, а связи давно нет — сказать прямо, чтобы поймали Wi‑Fi. */
export function OfflineBanner() {
  const s = useSyncStatus();
  if (s.state === 'demo' || !s.pending) return null;
  const stale = !s.lastSync || Date.now() - new Date(s.lastSync).getTime() > 60 * 60 * 1000;
  if (s.state !== 'offline' && s.state !== 'error' && !stale) return null;
  const when = s.lastSync ? `${relDate(s.lastSync.slice(0, 10), isoDate())} в ${timeOf(s.lastSync)}` : 'ещё не было';
  return (
    <Card className="mb-4 flex gap-2.5 p-3.5 ring-1 ring-amber/50">
      <Icon name="cloudOff" size={20} className="mt-0.5 shrink-0 text-amber" />
      <span className="flex flex-col gap-0.5">
        <span className="text-[14px] font-bold text-amber">
          Не отправлено: {s.pending} · связь с сервером {s.lastSync ? `была ${when}` : when}
        </span>
        <span className="text-[13px] font-semibold text-muted">Всё сохранено на телефоне и отправится само, как появится интернет. Подойдёт любой Wi‑Fi.</span>
      </span>
    </Card>
  );
}

export function SyncChip({ onClick }: { onClick: () => void }) {
  const s = useSyncStatus();
  let icon: IconName = 'cloud';
  let text = 'сохранено';
  let cls = 'text-muted';
  if (s.state === 'demo') {
    text = 'пример';
    icon = 'cloudOff';
  } else if (s.state === 'offline') {
    icon = 'cloudOff';
    text = s.pending ? `без сети · ${s.pending}` : 'без сети';
    cls = 'text-amber';
  } else if (s.state === 'syncing') {
    icon = 'refresh';
    text = 'синхронизация';
  } else if (s.state === 'error') {
    icon = 'alert';
    text = 'ошибка';
    cls = 'text-coral';
  } else if (s.pending) {
    text = `в очереди · ${s.pending}`;
    cls = 'text-amber';
  }
  return (
    <button type="button" onClick={onClick} className={`inline-flex h-10 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-bold ${cls}`}>
      <Icon name={icon} size={15} stroke={2.2} className={s.state === 'syncing' ? 'animate-spin' : ''} />
      {text}
    </button>
  );
}

export function TopBar({
  user,
  tabs,
  tab,
  onTab,
  onMenu,
}: {
  user: CurrentUser;
  tabs: Tab[];
  tab: Tab;
  onTab: (t: Tab) => void;
  onMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-surface2 bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
        <Logo size={28} />
        <span className="text-[16px] font-extrabold tracking-tight">СлоноВет</span>
        <nav className="ml-4 hidden flex-1 items-center gap-1 md:flex" aria-label="Разделы">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              aria-current={t === tab ? 'page' : undefined}
              onClick={() => onTab(t)}
              className={`h-9 rounded-xl px-3.5 text-[14px] font-bold ${t === tab ? 'bg-surface text-ink' : 'text-muted hover:text-ink'}`}
            >
              {TAB_META[t].label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <SyncChip onClick={onMenu} />
          <button
            type="button"
            onClick={onMenu}
            aria-label="Профиль и меню"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface2 text-[15px] font-extrabold"
          >
            {user.full_name.slice(0, 1)}
          </button>
        </div>
      </div>
    </header>
  );
}

export function BottomNav({ tabs, tab, onTab }: { tabs: Tab[]; tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav
      aria-label="Разделы"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 grid border-t border-surface2 bg-nav/95 px-2 pt-2 backdrop-blur md:hidden"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => {
        const on = t === tab;
        return (
          <button
            key={t}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => onTab(t)}
            className={`flex flex-col items-center gap-1 py-1.5 text-[12px] ${on ? 'font-extrabold text-teal' : 'font-bold text-muted'}`}
          >
            <Icon name={TAB_META[t].icon} size={22} />
            {TAB_META[t].label}
          </button>
        );
      })}
    </nav>
  );
}

export function MenuSheet({ open, onClose, session, onTab }: { open: boolean; onClose: () => void; session: Session; onTab: (t: Tab) => void }) {
  const s = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const extra = MENU_TABS[session.user.role];
  return (
    <Sheet open={open} onClose={onClose} title={session.user.full_name}>
      <div className="flex flex-col gap-4">
        <span className="px-1 text-[14px] font-bold text-muted">
          {ROLE_LABEL[session.user.role]}
          {session.mode === 'demo' ? ' · пример без сервера' : ` · ${session.user.login}`}
        </span>

        {session.mode === 'cloud' && (
          <Card className="flex flex-col gap-2 p-4">
            <span className="text-[15px] font-bold">
              {s.state === 'offline'
                ? 'Нет сети — всё сохраняется на телефоне'
                : s.pending
                  ? `Ждут отправки: ${s.pending}`
                  : 'Всё отправлено'}
            </span>
            {s.lastSync && <span className="text-[13px] font-semibold text-muted">Последняя синхронизация в {timeOf(s.lastSync)}</span>}
            {s.error && <span className="text-[13px] font-semibold text-coral">{s.error}</span>}
            <Button
              icon="refresh"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await syncNow();
                setBusy(false);
              }}
            >
              Синхронизировать
            </Button>
          </Card>
        )}

        <ThemeCard />

        {extra.length > 0 && (
          <Card className="divide-y divide-surface2 overflow-hidden">
            {extra.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  onTab(t);
                  onClose();
                }}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-bold"
              >
                <Icon name={TAB_META[t].icon} />
                <span className="flex-1">{TAB_META[t].label}</span>
                <Icon name="next" size={18} className="text-muted" />
              </button>
            ))}
          </Card>
        )}

        <Button
          kind="danger"
          icon="logout"
          full
          onClick={async () => {
            onClose();
            await logout();
          }}
        >
          Выйти
        </Button>
      </div>
    </Sheet>
  );
}

/** Вид приложения: тёмная, светлая или «Пиксель». */
function ThemeCard() {
  const theme = useTheme();
  return (
    <div className="flex flex-col gap-2">
      <span className="px-1 text-[14px] font-bold text-muted">Вид</span>
      <Segmented
        label="Вид приложения"
        options={(['dark', 'light', 'pixel'] as Theme[]).map((t) => ({ value: t, label: THEME_LABEL[t] }))}
        value={theme}
        onChange={setTheme}
      />
    </div>
  );
}
