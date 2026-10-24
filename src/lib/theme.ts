import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light' | 'pixel';

export const THEME_LABEL: Record<Theme, string> = { dark: 'Тёмная', light: 'Светлая', pixel: 'Пиксель' };
const META_COLOR: Record<Theme, string> = { dark: '#0b1217', light: '#f3f6f7', pixel: '#5c94fc' };

const KEY_THEME = 'slonovet.theme';
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';

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
  if (current === 'pixel' && !document.getElementById('skin-font')) {
    const l = document.createElement('link');
    l.id = 'skin-font';
    l.rel = 'stylesheet';
    l.href = FONT_URL;
    document.head.appendChild(l);
  }
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
