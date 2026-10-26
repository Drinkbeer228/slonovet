import { useEffect, useState } from 'react';
import { refreshCurrentUser, resumeSession, useSession } from './lib/auth';
import { initStore, useRows } from './lib/store';
import { Toaster } from './ui/kit';
import { Login } from './screens/Login';
import { BottomNav, MENU_TABS, MenuSheet, OfflineBanner, TABS_BY_ROLE, TopBar, type Tab } from './screens/Shell';
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

function Main() {
  const session = useSession()!;
  const user = session.user;
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
        <div className={current === 'shift' ? '' : 'mx-auto max-w-2xl'}>
          {current === 'shift' && <ShiftScreen user={user} />}
          {current === 'requests' && <RequestsScreen user={user} />}
          {current === 'diet' && <DietScreen user={user} onGuide={() => setTab('guide')} />}
          {current === 'stock' && <StockScreen user={user} />}
          {current === 'journal' && <JournalScreen />}
          {current === 'users' && <UsersScreen session={session} />}
          {current === 'guide' && <GuideScreen />}
          {current === 'rating' && <RatingScreen user={user} />}
          {current === 'move' && <MoveScreen user={user} />}
        </div>
      </main>
      <BottomNav tabs={tabs} tab={current} onTab={setTab} />
      <MenuSheet open={menu} onClose={() => setMenu(false)} session={session} onTab={setTab} />
    </div>
  );
}
