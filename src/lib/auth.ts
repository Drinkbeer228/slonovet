import { useSyncExternalStore } from 'react';
import type { CurrentUser, Profile, Role } from '../domain/types';
import { LOGIN_DOMAIN } from './config';
import { getClient } from './supabase';
import { purgeDemo, setCloudMode, wipeAll } from './store';
import { startSync, stopSync, syncNow } from './sync';
import { seedDemo } from '../domain/demo';

export interface Session {
  mode: 'cloud' | 'demo';
  user: CurrentUser;
}

const KEY = 'slonovet_session';
const listeners = new Set<() => void>();
let session: Session | null = load();

function load(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function set(s: Session | null) {
  session = s;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useSession() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => session,
  );
}

export function getSession() {
  return session;
}

/** Запуск: включаем синхронизацию для облачного режима. */
export async function resumeSession() {
  if (!session) return;
  if (session.mode === 'demo') {
    // на сайте примера больше нет: открытый когда-то пример стираем и ведём на вход
    if (!import.meta.env.DEV) {
      await wipeAll();
      set(null);
      return;
    }
    setCloudMode(false);
    stopSync(true);
    return;
  }
  setCloudMode(true);
  await purgeDemo();
  const client = getClient();
  if (client && navigator.onLine) {
    const { data } = await client.auth.getSession();
    if (!data.session) {
      // сессия истекла — нужно войти заново
      set(null);
      return;
    }
  }
  startSync();
}

export async function loginCloud(login: string, password: string): Promise<void> {
  const client = getClient();
  if (!client) throw new Error('Сервер не настроен');
  const clean = login.trim().toLowerCase();
  const { data, error } = await client.auth.signInWithPassword({ email: `${clean}@${LOGIN_DOMAIN}`, password });
  if (error || !data.user) throw new Error('Неверный логин или пароль');
  const { data: profile, error: pErr } = await client.from('profiles').select('*').eq('id', data.user.id).single();
  if (pErr || !profile) throw new Error('Профиль не найден. Попросите администратора проверить учётную запись.');
  const p = profile as Profile;
  if (!p.active) {
    await client.auth.signOut();
    throw new Error('Учётная запись отключена');
  }
  if (session?.mode === 'demo' || load()?.mode === 'demo') await wipeAll();
  else await purgeDemo();
  set({ mode: 'cloud', user: { id: p.id, login: p.login, full_name: p.full_name, role: p.role } });
  setCloudMode(true);
  startSync();
  await syncNow();
}

export async function loginDemo(role: Role, name: string) {
  if (session?.mode === 'cloud') await wipeAll();
  setCloudMode(false);
  await seedDemo();
  set({ mode: 'demo', user: { id: `demo-${role}`, login: role, full_name: name, role } });
  stopSync(true);
}

export async function logout() {
  const s = session;
  if (s?.mode === 'cloud') {
    await syncNow().catch(() => undefined);
    await getClient()?.auth.signOut().catch(() => undefined);
  }
  stopSync(false);
  // пример не должен остаться в телефоне и попасть в рабочие данные при следующем входе
  if (s?.mode === 'demo') await wipeAll();
  set(null);
}

/** Обновить имя/роль текущего пользователя из таблицы профилей (после синхронизации). */
export function refreshCurrentUser(profiles: Profile[]) {
  if (!session || session.mode !== 'cloud') return;
  const p = profiles.find((x) => x.id === session!.user.id);
  if (!p) return;
  if (!p.active) {
    logout();
    return;
  }
  if (p.full_name !== session.user.full_name || p.role !== session.user.role) {
    set({ ...session, user: { ...session.user, full_name: p.full_name, role: p.role } });
  }
}
