import { useSyncExternalStore } from 'react';

/**
 * Установка на экран телефона. Открытое с иконки приложение («standalone») не стирается Safari
 * и может получать уведомления; в обычном браузере подсказываем, как его поставить.
 */

export type Platform = 'ios' | 'android' | 'other';

/** Открыто с иконки на экране «Домой», а не во вкладке браузера. */
export function isStandalone(win: Window = window): boolean {
  const iosStandalone = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || win.matchMedia?.('(display-mode: standalone)').matches === true;
}

/** iPhone/iPad (включая iPad, который называет себя «Macintosh») или Android. */
export function platform(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> = navigator): Platform {
  const ua = nav.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Chrome на Android присылает это событие, когда приложение можно поставить одной кнопкой. */
let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // своё окно Chrome не показываем — кнопка «Установить» в баннере
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
}

/** Системное окно «Установить приложение» (Android, Chrome). false — если окна нет или отказались. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  emit();
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}

let snapshot = { canPrompt: false, installed: false };
function read() {
  const next = { canPrompt: deferred !== null, installed: installed || isStandalone() };
  if (next.canPrompt !== snapshot.canPrompt || next.installed !== snapshot.installed) snapshot = next;
  return snapshot;
}

/** Можно ли поставить одной кнопкой и стоит ли уже приложение. */
export function useInstall() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
  );
}
