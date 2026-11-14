import { useEffect, useState } from 'react';
import { ensurePublicDemoSession, isObserverMode, refreshCurrentUser, resumeSession, useDemoPersona, useSession } from './lib/auth';
import { initErsBridge, useErsState } from './lib/ers';
import { initStore, setWriteBlock, useRows } from './lib/store';
import { Toaster, toast } from './ui/kit';
import { Login } from './screens/Login';
import { InstallBanner, InstallSheet } from './screens/InstallHint';
import { BottomNav, DemoBanner, MenuSheet, PreviewBanner, TABS, TopBar, menuTabs, type Tab } from './screens/Shell';
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
import { SuppliersScreen } from './screens/SuppliersScreen';
import { ContainersScreen } from './screens/ContainersScreen';
import { DevRoleSwitcher } from './screens/DevRoleSwitcher';
import { diag } from './lib/diag';

const TAB_KEY = 'slonovet_tab';

export default function App() {
  const [ready, setReady] = useState(false);
  const [stuck, setStuck] = useState(false);
  const session = useSession();

  useEffect(() => {
    initErsBridge();
    let stage = 'store';
    // данные с телефона не открылись за 8 с — сказать об этом и дать продолжить, а не висеть на «Загрузке»
    const timer = setTimeout(() => {
      diag('stuck', stage);
      setStuck(true);
    }, 8000);
    (async () => {
      try {
        await initStore();
        stage = 'session';
        await resumeSession();
        await ensurePublicDemoSession();
        diag('ready');
      } catch (e) {
        diag('init-error', `${stage}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        clearTimeout(timer);
        setReady(true);
      }
    })();
    return () => clearTimeout(timer);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="text-[15px] font-semibold text-muted">Загрузка…</span>
        {stuck && (
          <>
            <span className="text-[14px] text-muted">Данные на телефоне долго открываются.</span>
            <button type="button" onClick={() => location.reload()} className="h-12 rounded-2xl bg-teal px-6 text-[16px] font-extrabold text-bg">
              Перезапустить
            </button>
            <button type="button" onClick={() => setReady(true)} className="text-[14px] font-bold text-teal">
              Продолжить без них
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <Toaster />
      {session ? <Main key={session.mode} /> : <Login />}
    </>
  );
}

// «Посмотреть как…» или роль «Наблюдатель / Стажёр»: только просмотр, критические изменения блокируются
setWriteBlock(() => {
  if (isObserverMode()) {
    toast('Режим наблюдателя — редактирование смен и назначений отключено', 'error');
    return true;
  }
  if (!getPreviewRole()) return false;
  toast('Режим просмотра — изменения не сохраняются', 'error');
  return true;
});

function Main() {
  const session = useSession()!;
  const previewRole = usePreviewRole();
  const demoPersona = useDemoPersona();
  const ers = useErsState();
  // админ может посмотреть приложение глазами другой роли; всё остальное считается от неё
  const user = previewRole && session.user.role === 'admin' ? { ...session.user, role: previewRole } : session.user;
  const profiles = useRows('profiles');
  const tabs = TABS;
  const allowed = [...tabs, ...menuTabs(user.role)];
  const [tab, setTabState] = useState<Tab>(() => {
    // открыли из уведомления: /?tab=stock — нужный раздел (сохраняя ?embedded=1, если он есть)
    const params = new URLSearchParams(location.search);
    const fromLink = params.get('tab') as Tab | null;
    if (fromLink && allowed.includes(fromLink)) {
      params.delete('tab');
      const qs = params.toString();
      history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
      return fromLink;
    }
    try {
      const saved = localStorage.getItem(TAB_KEY) as Tab | null;
      if (saved && allowed.includes(saved)) return saved;
    } catch {
      /* ignore */
    }
    if (user.role === 'vet') return 'journal';
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
    <div className="min-h-screen" data-persona={session.mode === 'demo' ? demoPersona : undefined}>
      <TopBar user={user} tabs={tabs} tab={current} onTab={setTab} onMenu={() => setMenu(true)} />
      <main className={`mx-auto w-full max-w-6xl px-4 ${ers.embedded ? 'pb-28 pt-3 md:pb-12' : 'pb-32 pt-4 md:pb-16'}`}>
        {session.mode === 'demo' && <DemoBanner />}
        {session.mode === 'cloud' && !previewRole && <InstallBanner />}
        {previewRole && <PreviewBanner role={previewRole} />}
        <div className={current === 'shift' ? '' : 'mx-auto max-w-2xl'}>
          {current === 'shift' && <ShiftScreen user={user} />}
          {current === 'requests' && <RequestsScreen user={user} />}
          {current === 'diet' && <DietScreen user={user} />}
          {current === 'stock' && <StockScreen user={user} />}
          {current === 'journal' && <JournalScreen user={user} />}
          {current === 'users' && <UsersScreen session={session} role={user.role} />}
          {current === 'guide' && <GuideScreen />}
          {current === 'rating' && <RatingScreen user={user} />}
          {current === 'move' && <MoveScreen user={user} />}
          {current === 'suppliers' && <SuppliersScreen user={user} />}
          {current === 'containers' && <ContainersScreen user={user} />}
        </div>
      </main>
      <BottomNav user={user} tabs={tabs} tab={current} onTab={setTab} />
      <InstallSheet />
      <MenuSheet open={menu} onClose={() => setMenu(false)} session={session} role={user.role} onTab={setTab} />
      {import.meta.env.DEV && session.mode === 'cloud' && <DevRoleSwitcher />}
    </div>
  );
}
