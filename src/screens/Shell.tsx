import { useState } from 'react';
import type { CurrentUser, Role } from '../domain/types';
import { logout, type Session } from '../lib/auth';
import { clearRejected, syncNow, useSyncStatus } from '../lib/sync';
import { isoDate, localDay, relDate, timeOf } from '../lib/dates';
import { Button, Card, Chip, Confirm, Segmented, Sheet } from '../ui/kit';
import { setPreviewRole, usePreviewRole } from '../lib/preview';
import { THEME_LABEL, setTheme, useTheme, type Theme } from '../lib/theme';
import { Icon, type IconName } from '../ui/Icon';
import { startTour } from './Tour';

export type Tab = 'shift' | 'requests' | 'diet' | 'stock' | 'journal' | 'users' | 'guide' | 'rating' | 'move';

export const TAB_META: Record<Tab, { label: string; icon: IconName }> = {
  shift: { label: 'Дежурство', icon: 'shift' },
  requests: { label: 'Заявки', icon: 'message' },
  diet: { label: 'Рацион', icon: 'bowl' },
  stock: { label: 'Фураж', icon: 'box' },
  journal: { label: 'Журнал', icon: 'book' },
  users: { label: 'Персонал', icon: 'users' },
  guide: { label: 'Справка', icon: 'question' },
  rating: { label: 'Мои достижения', icon: 'trophy' },
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

/** Плашка «Посмотреть как»: чья роль на экране и как вернуться к себе. */
export function PreviewBanner({ role }: { role: Role }) {
  return (
    <Card className="mb-4 flex items-center gap-3 p-3.5 ring-1 ring-teal/50">
      <Icon name="users" size={20} className="shrink-0 text-teal" />
      <span className="flex flex-1 flex-col">
        <span className="text-[14px] font-bold">Вы смотрите как: {ROLE_LABEL[role]}</span>
        <span className="text-[12px] font-semibold text-muted">только просмотр, изменения не сохраняются</span>
      </span>
      <Button onClick={() => setPreviewRole(null)}>Выйти</Button>
    </Card>
  );
}

/** Записи копятся на телефоне, а связи давно нет — сказать прямо, чтобы поймали Wi‑Fi. */
export function OfflineBanner() {
  const s = useSyncStatus();
  if (s.state === 'demo' || !s.pending) return null;
  const stale = !s.lastSync || Date.now() - new Date(s.lastSync).getTime() > 60 * 60 * 1000;
  if (s.state !== 'offline' && s.state !== 'error' && !stale) return null;
  const when = s.lastSync ? `${relDate(localDay(s.lastSync), isoDate())} в ${timeOf(s.lastSync)}` : 'ещё не было';
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

/** Значок в шапке — только когда есть что сказать: пример, нет сети, ошибка, сервер что-то не принял. В обычной работе его нет. */
export function SyncChip({ onClick }: { onClick: () => void }) {
  const s = useSyncStatus();
  if (s.state !== 'demo' && s.state !== 'offline' && s.state !== 'error' && !s.rejected.length) return null;
  let icon: IconName = 'cloud';
  let text = '';
  let cls = 'text-muted';
  if (s.rejected.length && s.state !== 'demo') {
    icon = 'alert';
    text = 'не принято';
    cls = 'text-coral';
  } else if (s.state === 'demo') {
    text = 'пример';
    icon = 'cloudOff';
  } else if (s.state === 'offline') {
    icon = 'cloudOff';
    text = s.pending ? `без сети · ${s.pending}` : 'без сети';
    cls = 'text-amber';
  } else {
    icon = 'alert';
    text = 'ошибка';
    cls = 'text-coral';
  }
  return (
    <button type="button" onClick={onClick} className={`inline-flex h-10 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[13px] font-bold ${cls}`}>
      <Icon name={icon} size={15} stroke={2.2} />
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
              data-tour={`nav-${t}`}
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
            data-tour="menu"
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
            data-tour={`nav-${t}`}
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

export function MenuSheet({
  open,
  onClose,
  session,
  role,
  onTab,
}: {
  open: boolean;
  onClose: () => void;
  session: Session;
  /** роль, глазами которой сейчас смотрим (у админа в «Посмотреть как…» — чужая) */
  role: Role;
  onTab: (t: Tab) => void;
}) {
  const s = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const extra = MENU_TABS[role];
  const preview = usePreviewRole();
  return (
    <Sheet open={open} onClose={onClose} title={session.user.full_name}>
      <div className="flex flex-col gap-4">
        <span className="px-1 text-[14px] font-bold text-muted">
          {ROLE_LABEL[session.user.role]}
          {session.mode === 'demo' ? ' · пример без сервера' : ` · ${session.user.login}`}
        </span>

        {/* сервер окончательно что-то не принял: правку на телефоне уже вернули как на сервере — сказать, что именно */}
        {session.mode === 'cloud' && s.rejected.length > 0 && (
          <Card className="flex flex-col gap-2 p-4 ring-1 ring-coral/50">
            <span className="text-[15px] font-bold text-coral">Сервер не принял: {s.rejected.length}</span>
            {s.rejected.map((r, i) => (
              <span key={i} className="text-[14px] leading-snug">
                {r.what} — {r.reason}
                <span className="text-muted"> · {relDate(localDay(r.at), isoDate())} в {timeOf(r.at)}</span>
              </span>
            ))}
            <span className="text-[13px] font-semibold text-muted">
              На телефоне вернули, как на сервере. Если это важно — скажите администратору или сделайте ещё раз.
            </span>
            <Button onClick={clearRejected}>Понятно</Button>
          </Card>
        )}

        {/* в обычной работе про отправку молчим; карточка — только если что-то не ушло */}
        {session.mode === 'cloud' && (s.state === 'offline' || s.state === 'error' || s.pending > 0) && (
          <Card className="flex flex-col gap-2 p-4">
            <span className="text-[15px] font-bold">
              {s.state === 'offline' ? 'Нет сети — всё сохраняется на телефоне' : `Ждут отправки: ${s.pending}`}
            </span>
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
              Отправить сейчас
            </Button>
          </Card>
        )}

        {session.user.role === 'admin' && (
          // админу: посмотреть приложение глазами другой роли, не выходя из своего входа
          <Card className="flex flex-col gap-2 p-4">
            <span className="text-[15px] font-bold">Посмотреть как</span>
            <div className="flex flex-wrap gap-2">
              {(['keeper', 'vet', 'director', 'manager'] as Role[]).map((r) => (
                <Chip
                  key={r}
                  on={preview === r}
                  onClick={() => {
                    setPreviewRole(preview === r ? null : r);
                    onTab(TABS_BY_ROLE[r][0]);
                    onClose();
                  }}
                >
                  {ROLE_LABEL[r]}
                </Chip>
              ))}
            </div>
            <span className="text-[12px] font-semibold text-muted">Настоящие данные, только просмотр — изменения не сохраняются.</span>
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
          icon="question"
          full
          onClick={() => {
            onClose();
            startTour();
          }}
        >
          Показать подсказки
        </Button>

        <Button
          kind="danger"
          icon="logout"
          full
          onClick={async () => {
            // неотправленное не пропадёт, но уйдёт только под входом этого же человека — предупредить
            if (session.mode === 'cloud' && s.pending > 0) {
              setConfirmLogout(true);
              return;
            }
            onClose();
            await logout();
          }}
        >
          Выйти
        </Button>
        <Confirm
          open={confirmLogout}
          title="Не всё отправлено"
          text={`Ждут отправки: ${s.pending}. Они сохранены на этом телефоне и уйдут, когда вы снова войдёте здесь и будет интернет. Под чужим входом они не отправятся.`}
          okLabel="Всё равно выйти"
          danger
          onOk={async () => {
            setConfirmLogout(false);
            onClose();
            await logout();
          }}
          onClose={() => setConfirmLogout(false)}
        />
        <span className="text-center text-[12px] font-semibold text-muted">Версия от {__BUILD__}</span>
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
