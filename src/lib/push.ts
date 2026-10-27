import { useEffect, useState } from 'react';
import { getClient } from './supabase';
import { getSession } from './auth';
import { isStandalone, platform } from './install';
import { getRows } from './store';
import { isoDate } from './dates';
import { balances, stockPerDay, stockView } from '../domain/stock';
import { EDITORS } from '../domain/access';

/**
 * Push-уведомления: подписка этого телефона на сервере (функции save/delete_push_subscription)
 * и «заканчивается», которое замечает сам телефон после списаний. Отправляет функция notify на сервере.
 */

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState = 'unsupported' | 'need-install' | 'denied' | 'off' | 'on';

/** base64url → байты (так браузер принимает открытый ключ сервера) */
function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const supported = () => {
  try {
    return Boolean(VAPID_PUBLIC) && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  } catch {
    return false;
  }
};

/** Обращения к service worker на iPhone иногда не отвечают вовсе — не ждём дольше 5 с. */
function within<T>(p: Promise<T>, ms = 5000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Телефон не ответил — попробуйте ещё раз')), ms))]);
}

export async function pushState(): Promise<PushState> {
  // на iPhone уведомления есть только у приложения, поставленного на экран «Домой»
  if (platform() === 'ios' && !isStandalone()) return 'need-install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await within(navigator.serviceWorker.getRegistration());
  const sub = await within(reg?.pushManager.getSubscription() ?? Promise.resolve(null));
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Включить: спросить разрешение, подписаться и записать подписку на сервер. */
export async function enablePush(): Promise<PushState> {
  const now = await pushState();
  if (now !== 'off' && now !== 'on') return now;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await within(navigator.serviceWorker.ready);
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC!) }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await getClient()!.rpc('save_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth });
  if (error) throw new Error(error.message);
  return 'on';
}

/** Выключить на этом телефоне (и при выходе — чтобы уведомления не шли следующему, кто войдёт). */
export async function disablePush(): Promise<void> {
  if (!supported()) return;
  const reg = await within(navigator.serviceWorker.getRegistration());
  const sub = await within(reg?.pushManager.getSubscription() ?? Promise.resolve(null));
  if (!sub) return;
  await getClient()?.rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/** Состояние для меню; обновляется после включения или выключения. */
export function usePushState() {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => {
    let alive = true;
    pushState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState('unsupported'));
    return () => {
      alive = false;
    };
  }, []);
  return [state, setState] as const;
}

/* ---------- «заканчивается»: замечает телефон после списаний ---------- */

const REPORTED_KEY = 'slonovet_low_reported';

/** Какие позиции стали низкими и о них сегодня ещё не сообщали с этого телефона. */
export function newlyLow(lowIds: string[], reported: { day: string; ids: string[] } | null, today: string): string[] {
  const seen = reported?.day === today ? new Set(reported.ids) : new Set<string>();
  return lowIds.filter((id) => !seen.has(id));
}

/** После списания: позиции, которые «заканчиваются», — сообщить на сервер (он разошлёт закупщикам один раз в день). */
export async function reportLowStock() {
  const s = getSession();
  if (s?.mode !== 'cloud' || !navigator.onLine) return;
  const moves = getRows('stock_moves');
  // только позиции, внесённые на склад (был приход или пересчёт): пустой склад — не повод слать «заканчивается»
  const stocked = new Set(moves.filter((m) => m.reason === 'in' || m.counted != null).map((m) => m.item_id));
  const items = getRows('stock_items').filter((it) => stocked.has(it.id));
  const bal = balances(moves);
  const perDay = stockPerDay(items, getRows('diets'), moves);
  const low = items.map((it) => stockView(it, bal.get(it.id) ?? 0, perDay.get(it.id) ?? null)).filter((v) => v.low);
  if (!low.length) return;
  const today = isoDate();
  let reported: { day: string; ids: string[] } | null = null;
  try {
    reported = JSON.parse(localStorage.getItem(REPORTED_KEY) ?? 'null');
  } catch {
    /* не помним — сервер сам отсечёт повтор */
  }
  const fresh = newlyLow(
    low.map((v) => v.item.id),
    reported,
    today,
  );
  if (!fresh.length) return;
  const client = getClient();
  if (!client) return;
  for (const id of fresh) {
    const v = low.find((x) => x.item.id === id)!;
    await client.functions.invoke('notify', { body: { type: 'low', item_id: id, item_name: v.item.name, days: v.daysLeft } }).catch(() => undefined);
  }
  try {
    const ids = reported?.day === today ? [...reported.ids, ...fresh] : fresh;
    localStorage.setItem(REPORTED_KEY, JSON.stringify({ day: today, ids }));
  } catch {
    /* не запомнится — сервер отсечёт повтор */
  }
}

/** Что получает человек с этой ролью — для подписи в меню. */
export function pushTopics(role: string): string[] {
  const out: string[] = [];
  if (role === 'keeper' || role === 'admin') out.push('срочные назначения');
  if (role === 'vet' || role === 'director' || role === 'admin') out.push('«плохо» у слонихи');
  if ((EDITORS.purchases.roles as string[]).includes(role)) out.push('просьбы купить', '«заканчивается» в фураже');
  return out;
}
