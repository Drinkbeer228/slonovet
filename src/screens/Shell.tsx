import { useMemo, useState } from 'react';
import type { CurrentUser, Role } from '../domain/types';
import { MANAGES, canEdit } from '../domain/access';
import { boardAttention } from '../domain/board';
import { logout, type Session } from '../lib/auth';
import { clearRejected, syncNow, useSyncStatus } from '../lib/sync';
import { isoDate, localDay, relDate, timeOf } from '../lib/dates';
import { Button, Card, Chip, Confirm, KEY, Plate, Sheet, TONE, toast, GlowIcon } from '../ui/kit';
import { setPreviewRole, usePreviewRole } from '../lib/preview';
import { setTheme, useTheme } from '../lib/theme';
import { Icon, type IconName } from '../ui/Icon';
import { exportUnsent, requeueQuarantine, useRows, useEffectiveDiets } from '../lib/store';
import { haptics } from '../lib/haptics';
import { currentShift, dutyTodos } from '../domain/shift';
import { unreadRequests, useReadMarks } from '../lib/comments';
import { balances, stockPerDay, stockView } from '../domain/stock';
import { StopCard } from './common/StopCard';
import { INSTALL_HINTS, openInstallSheet } from './InstallHint';
import { useInstall } from '../lib/install';
import { disablePush, enablePush, pushTopics, usePushState } from '../lib/push';

export type Tab = 'shift' | 'requests' | 'diet' | 'stock' | 'journal' | 'users' | 'guide' | 'rating' | 'move' | 'suppliers' | 'containers';

export const TAB_META: Record<Tab, { label: string; icon: IconName }> = {
  shift: { label: 'Дежурство', icon: 'shift' },
  requests: { label: 'Задачи', icon: 'message' },
  diet: { label: 'Рацион слонов', icon: 'bowl' },
  stock: { label: 'Фураж', icon: 'box' },
  journal: { label: 'Журнал', icon: 'book' },
  users: { label: 'Персонал', icon: 'users' },
  guide: { label: 'Справка', icon: 'question' },
  rating: { label: 'Мои достижения', icon: 'trophy' },
  move: { label: 'Переезд', icon: 'truck' },
  suppliers: { label: 'Контакты', icon: 'phone' },
  containers: { label: 'Контейнеры', icon: 'box' },
};

/**
 * Одни и те же разделы у всех ролей: видят все, а что можно делать — решают кнопки внутри
 * (domain/access.ts). Дежурство не кипер только смотрит, назначения и лечение отмечают все.
 */
// от сегодняшнего к архиву
export const TABS: Tab[] = ['shift', 'requests', 'stock', 'journal'];

/** Меню профиля — одно у всех; «Персонал» — тем, кто заводит людей (MANAGES). */
export function menuTabs(role: Role): Tab[] {
  // «Мои достижения» скрыты, пока база не набрала смен и людей: статистика копится (staffStats), вернуть — добавить 'rating' перед 'guide'
  return (['diet', 'users', 'move', 'containers', 'suppliers', 'guide'] as Tab[]).filter((t) => t !== 'users' || Boolean(MANAGES[role]?.length));
}

export const ROLE_LABEL: Record<Role, string> = { keeper: 'Кипер', vet: 'Ветврач', director: 'Директор', manager: 'Администратор', admin: 'Системный админ' };

/** Плашка «Посмотреть как»: чья роль на экране и как вернуться к себе. */
export function PreviewBanner({ role }: { role: Role }) {
  return (
    <Plate glow="teal" className="mb-4 flex items-center gap-3 p-3.5">
      <GlowIcon glow="teal" icon="users" />
      <span className="flex flex-1 flex-col">
        <span className="text-[14px] font-bold">Смотришь как: {ROLE_LABEL[role]}</span>
        <span className="text-[12px] font-semibold text-muted">только просмотр, изменения не сохраняются</span>
      </span>
      <Button onClick={() => setPreviewRole(null)}>Выйти</Button>
    </Plate>
  );
}

/** Скачать неотправленное и непринятое файлом: работа не пропадёт, даже если телефон придётся менять. */
async function saveUnsentFile() {
  const text = await exportUnsent();
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `slonovet-unsent-${isoDate()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Связь — один значок в шапке и одна шторка по тапу. В обычной работе значка нет; он появляется, когда есть что
 * сказать: пример, нет сети, ошибка, сервер что-то не принял или записи давно лежат неотправленными.
 */
export function SyncChip() {
  const s = useSyncStatus();
  const [open, setOpen] = useState(false);
  const stale = s.pending > 0 && (!s.lastSync || Date.now() - new Date(s.lastSync).getTime() > 60 * 60 * 1000);
  if (s.state !== 'demo' && s.state !== 'offline' && s.state !== 'error' && !s.rejected.length && !stale) return null;
  let icon: IconName = 'cloud';
  let text = '';
  let cls = 'text-muted';
  if (s.rejected.length && s.state !== 'demo') {
    icon = 'alert';
    text = 'не принято';
    cls = 'text-coral-fg';
  } else if (s.state === 'demo') {
    text = 'пример';
    icon = 'cloudOff';
  } else if (s.state === 'offline') {
    icon = 'cloudOff';
    text = s.pending ? `без сети · ${s.pending}` : 'без сети';
    cls = 'text-amber-fg';
  } else if (s.state === 'error') {
    icon = 'alert';
    text = 'ошибка';
    cls = 'text-coral-fg';
  } else {
    icon = 'cloudOff';
    text = `не отправлено · ${s.pending}`;
    cls = 'text-amber-fg';
  }
  return (
    <>
    <button type="button" onClick={() => setOpen(true)} className={`inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold ${KEY} ${cls}`}>
      <Icon name={icon} size={15} stroke={2.2} />
      {text}
    </button>
    <SyncSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Шторка связи: что не ушло, что сервер не принял, и что с этим сделать. */
function SyncSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const when = s.lastSync ? `${relDate(localDay(s.lastSync), isoDate())} в ${timeOf(s.lastSync)}` : 'ещё не было';
  return (
    <Sheet open={open} onClose={onClose} title="Связь">
      <div className="flex flex-col gap-4">
        {s.state === 'demo' ? (
          <span className="text-[15px] font-semibold text-muted">Это пример без сервера: всё хранится только на этом телефоне.</span>
        ) : (
          <span className="text-[15px] font-semibold text-muted">
            Связь с сервером: {when}. Всё внесённое сохранено на телефоне и уходит само, как появится интернет — подойдёт любой Wi‑Fi.
          </span>
        )}
        {/* сервер окончательно что-то не принял: правку на телефоне уже вернули как на сервере — сказать, что именно */}
        {s.state !== 'demo' && s.rejected.length > 0 && (
          <Plate glow="coral" halo className="flex flex-col gap-2 p-4">
            <span className="text-[15px] font-bold text-coral-fg">Сервер не принял: {s.rejected.length}</span>
            {s.rejected.map((r, i) => (
              <span key={i} className="text-[14px] leading-snug">
                {r.what} — {r.reason}
                <span className="text-muted"> · {relDate(localDay(r.at), isoDate())} в {timeOf(r.at)}</span>
              </span>
            ))}
            <span className="text-[13px] font-semibold text-muted">
              На телефоне вернули, как на сервере, а то, что ты внёс, сохранено отдельно и не потеряно. Если права вернули — отправь ещё раз.
            </span>
            <Button
              icon="refresh"
              onClick={async () => {
                const n = await requeueQuarantine();
                clearRejected();
                toast(n ? `Отправляем ещё раз: ${n}` : 'Нечего отправлять');
                syncNow();
              }}
            >
              Отправить ещё раз
            </Button>
            <Button onClick={saveUnsentFile}>Сохранить в файл</Button>
            <Button onClick={clearRejected}>Понятно</Button>
          </Plate>
        )}

        {/* в обычной работе про отправку молчим; карточка — только если что-то не ушло */}
        {s.state !== 'demo' && (s.state === 'offline' || s.state === 'error' || s.pending > 0) && (
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
            <Button onClick={saveUnsentFile}>Сохранить неотправленное в файл</Button>
          </Card>
        )}
      </div>
    </Sheet>
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
  const badges = useBadges(user);
  return (
    // с иконки на iPhone страница идёт под чёлку и часы (viewport-fit=cover): шапка начинается строго под ними
    <header className="pt-safe sticky top-0 z-30 border-b border-edge bg-bg/85 backdrop-blur-xl">
      <div className="px-safe mx-auto flex h-14 w-full max-w-6xl items-center gap-3">
        {/* надписью, как на логотипе: «Вет» бирюзой; картинка — только на входе и на иконке приложения */}
        <span className="text-[19px] font-extrabold tracking-tight">
          Слоно<span className="text-teal-fg">Вет</span>
        </span>
        <nav className="ml-4 hidden flex-1 items-center gap-1 md:flex" aria-label="Разделы">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              aria-current={t === tab ? 'page' : undefined}
              onClick={() => onTab(t)}
              className={`h-9 rounded-xl px-3.5 text-[14px] font-bold ${t === tab ? `${KEY} text-teal-fg` : 'border border-transparent text-muted hover:text-ink'}`}
            >
              {TAB_META[t].label}
              {badges[t] ? <span className="ml-1.5 rounded-full bg-amber px-1.5 py-0.5 text-[11px] font-extrabold text-bg">{badges[t]}</span> : null}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden flex-col items-end leading-tight md:flex">
            <span className="text-[14px] font-bold">{user.full_name}</span>
            <span className="rounded-md bg-surface2 px-1.5 py-px text-[11px] font-bold text-muted">{ROLE_LABEL[user.role]}</span>
          </span>
          <SyncChip />
          <button
            type="button"
            onClick={onMenu}
            aria-label="Профиль и меню"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-surface2 text-ink active:scale-95"
          >
            <Icon name="menu" size={22} />
          </button>
        </div>
      </div>
    </header>
  );
}

/**
 * Цифры на разделах — чтобы не открывать вкладку проверять: на «Дежурстве» — сколько назначений ждёт
 * ответа в открытом дежурстве, на «Фураже» — сколько позиций заканчивается (как в плашке «Заканчивается»),
 * на «Задачах» — новое в обсуждении плюс просроченное и срочное без отметки.
 * urgent — есть просроченное или срочное: тогда счётчик «Задач» коралловый, а одно новое в обсуждении — янтарь.
 */
export function useBadges(user: CurrentUser): Partial<Record<Tab, number>> & { urgent: boolean } {
  const requests = useRows('requests');
  const marks = useRows('request_marks');
  const shifts = useRows('shifts');
  const items = useRows('stock_items');
  const moves = useRows('stock_moves');
  const { diets } = useEffectiveDiets();
  const comments = useRows('request_comments');
  const purchases = useRows('purchases');
  const read = useReadMarks(user.id);
  const shift = currentShift(shifts);
  const left = shift ? dutyTodos(requests, marks, shift, isoDate()).filter((t) => !t.done).length : 0;
  const low = useMemo(() => {
    const bal = balances(moves);
    const perDay = stockPerDay(items, diets, moves);
    return items.filter((it) => stockView(it, bal.get(it.id) ?? 0, perDay.get(it.id) ?? null).low).length;
  }, [items, moves, diets]);
  const active = new Set(requests.filter((r) => r.status === 'active' && !r.deleted).map((r) => r.id));
  const talk = unreadRequests(comments, user.id, read, active);
  // на «Задачах»: новое в обсуждении + просроченное и срочное без отметки (у закупщиков — и срочные закупки)
  const att = boardAttention(requests, purchases, marks);
  const late = att.elephants + att.work + (canEdit('purchases', user.role) ? att.purchases : 0);
  return { shift: left, stock: low, requests: talk + late, urgent: late > 0 };
}

function Badge({ n, urgent }: { n?: number; urgent?: boolean }) {
  if (!n) return null;
  return (
    <span
      aria-label={`${n} требуют внимания`}
      className={`absolute -right-2.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-extrabold leading-none text-bg ${urgent ? 'bg-coral' : 'bg-amber'}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

export function BottomNav({ user, tabs, tab, onTab }: { user: CurrentUser; tabs: Tab[]; tab: Tab; onTab: (t: Tab) => void }) {
  const badges = useBadges(user);
  return (
    <nav
      aria-label="Разделы"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 grid border-t border-edge bg-nav/85 px-2 pt-2 backdrop-blur-xl md:hidden"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => {
        const on = t === tab;
        return (
          <button
            key={t}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => {
              if (t !== tab) haptics.tap();
              onTab(t);
            }}
            className={`flex flex-col items-center gap-1 py-1.5 text-[12px] transition-transform active:scale-95 ${on ? 'font-extrabold text-teal-fg' : 'font-bold text-muted'}`}
          >
            <span className={`relative ${on ? '[filter:drop-shadow(0_0_6px_color-mix(in_srgb,var(--color-teal)_var(--glow),transparent))]' : ''}`}>
              <Icon name={TAB_META[t].icon} size={22} />
              <Badge n={badges[t]} urgent={t === 'requests' && badges.urgent} />
            </span>
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
  const [confirmLogout, setConfirmLogout] = useState(false);
  const { installed } = useInstall();
  const extra = menuTabs(role);
  const preview = usePreviewRole();
  return (
    <Sheet open={open} onClose={onClose} title={session.user.full_name}>
      <div className="flex flex-col gap-4">
        <span className="px-1 text-[14px] font-bold text-muted">
          {ROLE_LABEL[session.user.role]}
          {session.mode === 'demo' ? ' · пример без сервера' : ` · ${session.user.login}`}
        </span>
        <StopCard user={{ ...session.user, role }} />


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
                    onTab(TABS[0]);
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

        {session.mode === 'cloud' && !preview && <PushCard role={session.user.role} onClose={onClose} />}

        <ThemeCard />

        {extra.length > 0 && (
          <Card className="divide-y divide-edge overflow-hidden">
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

        {INSTALL_HINTS && !installed && (
          <Button
            icon="install"
            full
            onClick={() => {
              onClose();
              openInstallSheet();
            }}
          >
            Установить на устройство
          </Button>
        )}

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
          text={`Ждут отправки: ${s.pending}. Они сохранены на этом телефоне и уйдут, когда ты снова войдёшь здесь и будет интернет. Под чужим входом они не отправятся.`}
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

/** Уведомления на этот телефон: что приходит этой роли и кнопка включить или выключить. */
function PushCard({ role, onClose }: { role: Role; onClose: () => void }) {
  const [state, setState] = usePushState();
  const topics = pushTopics(role);
  // на iPhone без установки — молчим, пока установка на экран не работает (INSTALL_HINTS)
  if (!state || state === 'unsupported' || !topics.length || (state === 'need-install' && !INSTALL_HINTS)) return null;
  return (
    <Card className="flex flex-col gap-2 p-4">
      <span className="flex items-center gap-2 text-[15px] font-bold">
        <Icon name="bell" size={18} />
        Уведомления {state === 'on' && <span className="text-[13px] font-bold text-teal">включены</span>}
      </span>
      <span className="text-[13px] font-semibold text-muted">Придут, даже когда приложение закрыто: {topics.join(', ')}.</span>
      {state === 'need-install' && (
        <>
          <span className="text-[13px] font-semibold text-amber">На iPhone — только у приложения на экране «Домой». Сначала установи его.</span>
          <Button
            icon="install"
            onClick={() => {
              onClose();
              openInstallSheet();
            }}
          >
            Как установить
          </Button>
        </>
      )}
      {state === 'denied' && (
        <span className="text-[13px] font-semibold text-amber">Уведомления запрещены в настройках телефона для этого сайта — разреши их там.</span>
      )}
      {state === 'off' && (
        <Button
          icon="bell"
          onClick={async () => {
            try {
              const next = await enablePush();
              setState(next);
              if (next === 'on') toast('Уведомления включены');
            } catch {
              toast('Не удалось включить — проверь интернет', 'error');
            }
          }}
        >
          Включить уведомления
        </Button>
      )}
      {state === 'on' && (
        <Button
          onClick={async () => {
            await disablePush().catch(() => undefined);
            setState('off');
          }}
        >
          Выключить на этом телефоне
        </Button>
      )}
    </Card>
  );
}

/** Тема: компактный переключатель «луна / солнце». Круглая клавиша перекрывает выбранную иконку. */
function ThemeCard() {
  const theme = useTheme();
  const light = theme === 'light';
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <span className="text-[15px] font-bold">Тема</span>
      <button
        type="button"
        role="switch"
        aria-checked={light}
        aria-label={`Светлая тема: ${light ? 'включена' : 'выключена'}`}
        onClick={() => setTheme(light ? 'dark' : 'light')}
        className={`relative h-11 w-[92px] rounded-full ${TONE.sunken}`}
      >
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-1/2 items-center justify-center text-faint">
          <Icon name="moon" size={18} />
        </span>
        <span className="pointer-events-none absolute inset-y-0 right-0 flex w-1/2 items-center justify-center text-faint">
          <Icon name="sun" size={18} />
        </span>
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute left-[3px] top-[3px] flex h-[calc(100%-6px)] w-[calc(50%-3px)] items-center justify-center rounded-full text-teal-fg shadow-(--shadow-key-on) transition-transform duration-200 ease-out ${KEY} ${
            light ? 'translate-x-full' : ''
          }`}
        >
          <Icon name={light ? 'sun' : 'moon'} size={18} stroke={2.4} />
        </span>
      </button>
    </div>
  );
}
