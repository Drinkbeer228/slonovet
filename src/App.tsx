import { useEffect, useState } from 'react';
import { refreshCurrentUser, resumeSession, useSession } from './lib/auth';
import { initStore, setWriteBlock, useRows } from './lib/store';
import { Toaster, toast } from './ui/kit';
import { Login } from './screens/Login';
import { BottomNav, MENU_TABS, MenuSheet, OfflineBanner, PreviewBanner, TABS_BY_ROLE, TopBar, type Tab } from './screens/Shell';
import { getPreviewRole, usePreviewRole } from './lib/preview';
import { ShiftScreen } from './screens/keeper/ShiftScreen';
import { DietScreen } from './screens/DietScreen';
import { StockScreen } from './screens/StockScreen';
import { JournalScreen } from './screens/JournalScreen';
import { RequestsScreen } from './screens/vet/RequestsScreen';
import { UsersScreen } from './screens/admin/UsersScreen';
import { GuideScreen } from './screens/GuideScreen';
import { RatingScreen } from './screens/RatingScreen';
import { logEvent } from './lib/log';
import { MoveScreen } from './screens/MoveScreen';
import { Tour } from './screens/Tour';

const TAB_KEY = 'slonovet_tab';

export default function App() {
  const [ready, setReady] = useState(false);
  const session = useSession();

  useEffect(() => {
    (async () => {
      try {
        await initStore();
        await resumeSession();
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-[15px] font-semibold text-muted">Загрузка…</div>;
  }

  return (
    <>
      <Toaster />
      {session ? <Main key={session.user.id} /> : <Login />}
    </>
  );
}

// «Посмотреть как…»: пока админ смотрит глазами другой роли, в базу ничего не пишем
setWriteBlock(() => {
  if (!getPreviewRole()) return false;
  toast('Режим просмотра — изменения не сохраняются', 'error');
  return true;
});

function Main() {
  const session = useSession()!;
  const previewRole = usePreviewRole();
  // админ может посмотреть приложение глазами другой роли; всё остальное считается от неё
  const user = previewRole && session.user.role === 'admin' ? { ...session.user, role: previewRole } : session.user;
  const profiles = useRows('profiles');
  const tabs = TABS_BY_ROLE[user.role];
  const allowed = [...tabs, ...MENU_TABS[user.role]];
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY) as Tab | null;
      if (saved && allowed.includes(saved)) return saved;
    } catch {
      /* ignore */
    }
    return tabs[0];
  });
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    refreshCurrentUser(profiles);
  }, [profiles]);

  const setTab = (t: Tab) => {
    logEvent('screen.open', { tab: t });
    setTabState(t);
    window.scrollTo({ top: 0 });
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* ignore */
    }
  };

  const current = allowed.includes(tab) ? tab : tabs[0];

  return (
    <div className="min-h-screen">
      <TopBar user={user} tabs={tabs} tab={current} onTab={setTab} onMenu={() => setMenu(true)} />
      <main className="mx-auto w-full max-w-6xl px-4 pb-32 pt-5 md:pb-16">
        <OfflineBanner />
        {previewRole && <PreviewBanner role={previewRole} />}
        <div className={current === 'shift' ? '' : 'mx-auto max-w-2xl'}>
          {current === 'shift' && <ShiftScreen user={user} />}
          {current === 'requests' && <RequestsScreen user={user} />}
          {current === 'diet' && <DietScreen user={user} />}
          {current === 'stock' && <StockScreen user={user} />}
          {current === 'journal' && <JournalScreen />}
          {current === 'users' && <UsersScreen session={session} role={user.role} />}
          {current === 'guide' && <GuideScreen role={user.role} />}
          {current === 'rating' && <RatingScreen user={user} />}
          {current === 'move' && <MoveScreen user={user} />}
        </div>
      </main>
      <BottomNav tabs={tabs} tab={current} onTab={setTab} />
      <MenuSheet open={menu} onClose={() => setMenu(false)} session={session} role={user.role} onTab={setTab} />
      {!previewRole && <Tour user={user} tab={current} onTab={setTab} />}
    </div>
  );
}
