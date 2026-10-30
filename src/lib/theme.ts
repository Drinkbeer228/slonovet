import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

const META_COLOR: Record<Theme, string> = { dark: '#0b1217', light: '#f3f6f7' };

const KEY_THEME = 'slonovet.theme';
const KEY_LITE = 'slonovet.lite';

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
  return t === 'light' ? t : 'dark'; // любое другое значение (и сохранённое старыми версиями) — тёмная
})();
/** Лёгкий режим: без размытия, теней и анимаций — для старых и слабых телефонов. По умолчанию выключен. */
let lite = read(KEY_LITE) === '1';
const listeners = new Set<() => void>();

function apply() {
  const root = document.documentElement;
  root.dataset.theme = current;
  if (lite) root.dataset.lite = '1';
  else delete root.dataset.lite;
  root.style.colorScheme = current === 'dark' ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[current]);
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

export function setLite(on: boolean) {
  lite = on;
  write(KEY_LITE, on ? '1' : '0');
  apply();
  listeners.forEach((l) => l());
}

export function useLite(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => lite,
  );
}
