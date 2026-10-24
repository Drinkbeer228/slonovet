// Edge-функция: админ создаёт пользователей по логину и паролю (без настоящей почты).
// Деплой: Supabase → Edge Functions → Deploy new function → имя "admin-users" → вставить этот файл.
// Переменные SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY Supabase подставляет сам.
import { createClient } from 'npm:@supabase/supabase-js@2';

// Должен совпадать с LOGIN_DOMAIN в src/lib/config.ts
const LOGIN_DOMAIN = 'slonovet.local';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Кто вызывает — должен быть активный админ
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: caller } = await admin.auth.getUser(jwt);
  if (!caller?.user) return reply({ error: 'Нужно войти' }, 401);
  const { data: me } = await admin.from('profiles').select('role, active').eq('id', caller.user.id).single();
  if (!me || me.role !== 'admin' || !me.active) return reply({ error: 'Только для администратора' }, 403);

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return reply({ error: 'Неверный запрос' }, 400);
  }

  const login = String(body.login ?? '').trim().toLowerCase();
  const loginOk = /^[a-z0-9._-]{2,32}$/.test(login);

  if (body.action === 'create') {
    if (!loginOk) return reply({ error: 'Логин: латиница, цифры, точка, дефис, 2–32 символа' }, 400);
    if (String(body.password ?? '').length < 6) return reply({ error: 'Пароль минимум 6 символов' }, 400);
    if (!['keeper', 'vet', 'director', 'admin'].includes(body.role)) return reply({ error: 'Неизвестная роль' }, 400);
    const { data, error } = await admin.auth.admin.createUser({
      email: `${login}@${LOGIN_DOMAIN}`,
      password: body.password,
      email_confirm: true,
      user_metadata: { login, full_name: body.full_name || login },
      app_metadata: { role: body.role }, // роль задаёт только сервер — по ней триггер делает профиль активным
    });
    if (error) return reply({ error: error.message.includes('already') ? 'Такой логин уже есть' : error.message }, 400);
    return reply({ id: data.user?.id });
  }

  if (body.action === 'password') {
    if (String(body.password ?? '').length < 6) return reply({ error: 'Пароль минимум 6 символов' }, 400);
    const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password });
    if (error) return reply({ error: error.message }, 400);
    return reply({ ok: true });
  }

  if (body.action === 'update') {
    const patch: Record<string, unknown> = {};
    if (body.full_name) patch.full_name = body.full_name;
    if (['keeper', 'vet', 'director', 'admin'].includes(body.role)) patch.role = body.role;
    if (body.active === 'true' || body.active === 'false') patch.active = body.active === 'true';
    if (body.id === caller.user.id && (patch.active === false || (patch.role && patch.role !== 'admin'))) {
      return reply({ error: 'Нельзя отключить или понизить самого себя' }, 400);
    }
    const { error } = await admin.from('profiles').update(patch).eq('id', body.id);
    if (error) return reply({ error: error.message }, 400);
    if (patch.active === false) await admin.auth.admin.updateUserById(body.id, { ban_duration: '876000h' });
    if (patch.active === true) await admin.auth.admin.updateUserById(body.id, { ban_duration: 'none' });
    return reply({ ok: true });
  }

  return reply({ error: 'Неизвестное действие' }, 400);
});
