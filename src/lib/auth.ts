import { useSyncExternalStore } from 'react';
import type { CurrentUser, Profile, Role } from '../domain/types';
import { getServerConfig, LOGIN_DOMAIN } from './config';
import { diag } from './diag';
import { getClient } from './supabase';
import { purgeDemo, setCloudMode, setOwner, wipeAll } from './store';
import { startSync, stopSync, syncNow } from './sync';
import { seedDemo } from '../domain/demo';
import { resetErsProgress } from './ers';
import { isoDate } from './dates';

export interface Session {
  mode: 'cloud' | 'demo';
  user: CurrentUser;
}

/** Публичные сценарии демонстрации (Переключатель ролей) */
export type DemoPersona = 'keeper' | 'vet' | 'observer';

export const DEMO_PERSONAS: Record<DemoPersona, { label: string; shortLabel: string; hint: string; user: CurrentUser }> = {
  keeper: {
    label: 'Кипер',
    shortLabel: 'Кипер',
    hint: 'Утренний и вечерний обход, поедаемость кормов, вода, стул и поведенческие заметки',
    user: { id: 'demo-keeper', login: 'keeper1', full_name: 'Кипер Поста №1', role: 'keeper' },
  },
  vet: {
    label: 'Ветеринар',
    shortLabel: 'Ветеринар',
    hint: 'Осмотр ног и кожи, назначение процедур, контроль 30-дневной динамики и медотметок',
    user: { id: 'demo-vet', login: 'vet', full_name: 'Ветврач станции', role: 'vet' },
  },
  observer: {
    label: 'Наблюдатель / Стажёр',
    shortLabel: 'Наблюдатель',
    hint: 'Режим просмотра сменных сводок, журнала и протоколов без права редактирования назначений',
    user: { id: 'demo-observer', login: 'observer', full_name: 'Стажёр-наблюдатель', role: 'keeper' },
  },
};

const KEY = 'slonovet_session';
const PERSONA_KEY = 'slonovet_demo_persona';
const listeners = new Set<() => void>();
let session: Session | null = load();
let demoPersona: DemoPersona = loadPersona(session);
/** хозяин неотправленного в очереди — тот, кто вошёл (в примере очереди нет) */
const ownerOf = (s: Session | null) => (s?.mode === 'cloud' ? s.user.id : null);
setOwner(ownerOf(session));

function load(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function loadPersona(s: Session | null): DemoPersona {
  try {
    const raw = localStorage.getItem(PERSONA_KEY);
    if (raw === 'keeper' || raw === 'vet' || raw === 'observer') return raw;
  } catch {
    /* ignore */
  }
  if (s?.mode === 'demo') {
    if (s.user.id === 'demo-observer') return 'observer';
    if (s.user.role === 'vet') return 'vet';
  }
  return 'keeper';
}

function savePersona(p: DemoPersona) {
  demoPersona = p;
  try {
    localStorage.setItem(PERSONA_KEY, p);
  } catch {
    /* ignore */
  }
}

function set(s: Session | null) {
  session = s;
  setOwner(ownerOf(s));
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

export function getDemoPersona(): DemoPersona {
  return demoPersona;
}

export function useDemoPersona(): DemoPersona {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => demoPersona,
  );
}

/** Активен ли режим «Наблюдатель / Стажёр» (только просмотр, без права редактирования) */
export function isObserverMode(): boolean {
  if (!session || session.mode !== 'demo') return false;
  return demoPersona === 'observer' || session.user.id === 'demo-observer';
}

/** Запуск: включаем синхронизацию для облачного режима или восстанавливаем публичный демо-режим. */
export async function resumeSession() {
  if (!session) return;
  if (session.mode === 'demo') {
    setCloudMode(false);
    await seedDemo();
    stopSync(true);
    return;
  }
  setCloudMode(true);
  await purgeDemo();
  const client = getClient();
  if (client && navigator.onLine) {
    // проверка входа не дольше 6 с: не ответила — работаем с тем, что есть на телефоне, синхронизация догонит
    const checked = await Promise.race([client.auth.getSession(), new Promise<null>((r) => setTimeout(() => r(null), 6000))]);
    if (checked && !checked.data.session) {
      // сессия истекла — нужно войти заново
      set(null);
      return;
    }
  }
  startSync();
}

/**
 * Автозапуск публичного демо-режима при первом открытии публичной версии (без локальной облачной сессии и сервера).
 * Вызывается из App.tsx при инициализации браузерного приложения.
 */
export async function ensurePublicDemoSession() {
  if (session) return;
  // Если подключён реальный облачный сервер из env/настроек и явно запрошен экран входа (?login=1), остаёмся на входе
  const wantLogin = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('login') === '1';
  if (wantLogin && getServerConfig()) return;
  await loginDemoPersona(demoPersona || 'keeper');
}

/**
 * Что сказать человеку, когда вход не удался. «Неверный логин или пароль» — только когда сервер так и ответил;
 * обрыв связи (запрос до сервера не дошёл) раньше выдавался за неверный пароль — и человек искал ошибку не там.
 */
export function loginErrorText(error: { status?: number; code?: string; name?: string } | null): string {
  if (!error) return 'Неверный логин или пароль';
  if (error.code === 'invalid_credentials' || error.status === 400) return 'Неверный логин или пароль';
  if (error.status === 429) return 'Слишком много попыток входа. Подожди минуту и попробуй снова.';
  return 'Нет связи с сервером. Проверь интернет — подойдёт любой Wi‑Fi — и попробуй ещё раз.';
}

export async function loginCloud(login: string, password: string): Promise<void> {
  const client = getClient();
  if (!client) throw new Error('Сервер не настроен');
  const clean = login.trim().toLowerCase();
  const { data, error } = await client.auth.signInWithPassword({ email: `${clean}@${LOGIN_DOMAIN}`, password });
  if (error || !data.user) {
    const text = loginErrorText(error);
    diag('login-fail', `${error?.status ?? ''} ${error?.code ?? ''} ${error?.name ?? ''}`);
    throw new Error(text);
  }
  diag('login-token');
  const { data: profile, error: pErr } = await client.from('profiles').select('*').eq('id', data.user.id).single();
  if (pErr || !profile) throw new Error('Профиль не найден. Попроси того, кто ведёт «Персонал», проверить учётную запись.');
  const p = profile as Profile;
  if (!p.active) {
    await client.auth.signOut();
    throw new Error('Учётная запись отключена');
  }
  if (session?.mode === 'demo' || load()?.mode === 'demo') await wipeAll();
  else await purgeDemo();
  diag('login-profile');
  set({ mode: 'cloud', user: { id: p.id, login: p.login, full_name: p.full_name, role: p.role } });
  setCloudMode(true);
  startSync();
  await syncNow();
}

export async function loginDemo(role: Role, name: string) {
  if (session?.mode === 'cloud') await wipeAll();
  setCloudMode(false);
  await seedDemo();
  savePersona(role === 'vet' ? 'vet' : 'keeper');
  set({ mode: 'demo', user: { id: `demo-${role}`, login: role, full_name: name, role } });
  stopSync(true);
}

/** Войти в публичный демо-режим под выбранной учебной ролью (Кипер / Ветеринар / Наблюдатель) */
export async function loginDemoPersona(persona: DemoPersona) {
  if (session?.mode === 'cloud') await wipeAll();
  setCloudMode(false);
  await seedDemo();
  savePersona(persona);
  set({ mode: 'demo', user: { ...DEMO_PERSONAS[persona].user } });
  stopSync(true);
}

/** Мгновенно переключить учебную роль в демо-режиме */
export function switchDemoPersona(persona: DemoPersona) {
  savePersona(persona);
  if (session?.mode !== 'demo') return;
  set({ mode: 'demo', user: { ...DEMO_PERSONAS[persona].user } });
}

/** Сбросить демо-данные к исходному учебному состоянию */
export async function resetDemoData() {
  const activePersona = demoPersona || 'keeper';
  setCloudMode(false);
  stopSync(true);
  await wipeAll();
  resetErsProgress(isoDate());
  await seedDemo();
  savePersona(activePersona);
  set({ mode: 'demo', user: { ...DEMO_PERSONAS[activePersona].user } });
}

const DEMO_NAMES: Record<Role, string> = {
  keeper: 'Кипер Поста №1',
  vet: 'Ветврач станции',
  director: 'Директор',
  manager: 'Администратор',
  admin: 'Координатор поста',
};

/** Сменить роль в демо-режиме (совместимость с DevRoleSwitcher) */
export function switchDemoRole(role: Role) {
  if (session?.mode !== 'demo') return;
  savePersona(role === 'vet' ? 'vet' : 'keeper');
  set({ mode: 'demo', user: { id: `demo-${role}`, login: role, full_name: DEMO_NAMES[role], role } });
}

export async function logout() {
  const s = session;
  if (s?.mode === 'cloud') {
    await syncNow().catch(() => undefined);
    // уведомления этого телефона — тому, кто вошёл; вышел — отписываем, чтобы не шли следующему
    await import('./push').then((m) => m.disablePush()).catch(() => undefined);
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
