// Edge-функция: push-уведомление тем, кому оно нужно (кому и что — решает recipients.ts).
// Зовут её триггеры базы (заголовок x-notify-secret — секрет из slonovet.settings и NOTIFY_SECRET в окружении функций)
// и приложение — только «заканчивается» и только от вошедшего человека.
// Окружение: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, NOTIFY_SECRET (+ SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY подставляет Supabase).
// Деплой: положить папку в /opt/supabase/volumes/functions/notify/.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { message, recipients, type Payload } from './recipients.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');
const SECRET = Deno.env.get('NOTIFY_SECRET');
if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@slonovet.ru', VAPID_PUBLIC, VAPID_PRIVATE);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return reply({ error: 'Уведомления не настроены (нет ключей VAPID)' }, 503);

  let p: Payload;
  try {
    p = await req.json();
  } catch {
    return reply({ error: 'Неверный запрос' }, 400);
  }

  const fromServer = Boolean(SECRET) && req.headers.get('x-notify-secret') === SECRET;
  if (!fromServer) {
    // из приложения — только «заканчивается», и только от вошедшего активного человека
    if (p?.type !== 'low') return reply({ error: 'Нельзя' }, 403);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: caller } = await admin.auth.getUser(jwt);
    if (!caller?.user) return reply({ error: 'Нужно войти' }, 401);
    const { data: me } = await admin.from('profiles').select('active').eq('id', caller.user.id).single();
    if (!me?.active) return reply({ error: 'Нельзя' }, 403);
    p = { ...p, author_id: caller.user.id };
  }

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
  const msg = message(p, today);
  // одно событие — одно уведомление (повторная отправка строки, второй телефон, повтор за день)
  const { data: first, error: markError } = await admin.rpc('push_mark_sent', { p_key: msg.key });
  if (markError) return reply({ error: markError.message }, 500);
  if (!first) return reply({ sent: 0, duplicate: true });

  const { data: people } = await admin.from('profiles').select('id, role, active');
  // срочное — дежурному: кипер последней открытой смены
  let onDuty: string | null = null;
  if (p.type === 'urgent') {
    const { data: open } = await admin.from('shifts').select('keeper_id').eq('status', 'open').eq('deleted', false).order('date', { ascending: false }).order('accepted_at', { ascending: false }).limit(1);
    onDuty = open?.[0]?.keeper_id ?? null;
  }
  const ids = recipients(p, people ?? [], onDuty);
  if (!ids.length) return reply({ sent: 0 });
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', ids);

  let sent = 0;
  const body = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url, tag: msg.tag });
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 12 * 60 * 60 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // телефон отписался или переустановил приложение — подписка больше не действует
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    }),
  );
  return reply({ sent, to: ids.length });
});
