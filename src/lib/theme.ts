import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light' | 'pixel';

export const THEME_LABEL: Record<Theme, string> = { dark: 'Тёмная', light: 'Светлая', pixel: 'Пиксель' };
const META_COLOR: Record<Theme, string> = { dark: '#0b1217', light: '#f3f6f7', pixel: '#5c94fc' };

const KEY_THEME = 'slonovet.theme';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* без хранилища тема просто не запомнится */
  }
}

let current: Theme = (() => {
  const t = read(KEY_THEME);
  return t === 'light' || t === 'pixel' ? t : 'dark';
})();
const listeners = new Set<() => void>();

function apply() {
  const root = document.documentElement;
  root.dataset.theme = current;
  root.style.colorScheme = current === 'dark' ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[current]);
  // пиксельный шрифт — тоже свой, и только когда выбрана эта тема
  if (current === 'pixel') import('@fontsource/press-start-2p/400.css').catch(() => undefined);
}

export function initTheme() {
  apply();
}

export function setTheme(t: Theme) {
  current = t;
  write(KEY_THEME, t);
  apply();
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
