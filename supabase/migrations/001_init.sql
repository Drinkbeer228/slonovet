-- СлоноВет · схема базы данных
-- Выполнить один раз: Supabase → SQL Editor → вставить весь файл → Run.

-- ============================================================
-- Пользователи и роли
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  login text unique not null,
  full_name text not null,
  role text not null default 'keeper' check (role in ('keeper', 'vet', 'director', 'admin')),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Профиль создаётся автоматически при создании пользователя.
-- Логин и имя — из user_metadata, роль — из app_metadata: её может задать только сервер
-- (функция admin-users). Кто зарегистрировался сам, получает неактивный профиль без доступа.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text := new.raw_app_meta_data->>'role';
begin
  insert into public.profiles (id, login, full_name, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'login', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when r in ('keeper', 'vet', 'director', 'admin') then r else 'keeper' end,
    coalesce(r in ('keeper', 'vet', 'director', 'admin'), false)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

-- ============================================================
-- Общие поля: id (text), updated_at (ставит сервер), deleted
-- ============================================================
-- функции наружу не торчат: триггер вызывает сама база, my_role — только вошедшие (нужна для прав)
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Смена (сутки). id = дата начала смены, 'YYYY-MM-DD'
create table if not exists public.shifts (
  id text primary key,
  date date not null,
  keeper_id uuid,
  keeper_name text not null,
  status text not null default 'open' check (status in ('open', 'handed')),
  safety jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  feeds jsonb not null default '{}'::jsonb,
  quests jsonb not null default '{}'::jsonb,
  hay_bales int not null default 0,
  note text not null default '',
  accepted_at timestamptz,
  handed_at timestamptz,
  handover_code text,                     -- 4 цифры, которые сдающий диктует сменщику
  accepted_from text,                     -- какую смену приняли (замечания принимающего — к ней)
  accept_remarks text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Заявки ветврача
create table if not exists public.requests (
  id text primary key,
  elephant text not null,           -- 'Претти' | 'Марго' | 'Одри' | 'all'
  text text not null,
  frequency text not null default 'once' check (frequency in ('once', 'shift', 'feeding')),
  due_date date,
  needs_photo boolean not null default false,
  urgent boolean not null default false,
  options jsonb,                          -- варианты ответа кипера кнопками: ["всё","половину","отказ"]
  author_id uuid,
  author_name text not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Отметки выполнения заявок
create table if not exists public.request_marks (
  id text primary key,
  request_id text not null references public.requests(id) on delete cascade,
  shift_id text not null,
  done_by text not null,
  done_at timestamptz not null default now(),
  note text not null default '',
  photo_path text,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Наблюдения, процедуры, заметки с фото
create table if not exists public.notes (
  id text primary key,
  shift_id text not null,
  elephant text not null,
  kind text not null default 'observation' check (kind in ('observation', 'procedure', 'medication')),
  metric text,
  text text not null default '',
  photo_path text,
  author_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Склад: позиции
create table if not exists public.stock_items (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('count', 'kg', 'sack')),
  unit text not null default 'кг',
  sack_kg numeric,
  kg_per_garets numeric,
  low_days numeric not null default 3,
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Склад: движения (приход, списание по кормлению, поправка). Остаток = сумма delta
create table if not exists public.stock_moves (
  id text primary key,
  item_id text not null,
  delta numeric not null,
  reason text not null check (reason in ('in', 'feed', 'hay', 'fix')),
  shift_id text,
  author_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Рацион (по слонихе). id = имя слонихи
create table if not exists public.diets (
  id text primary key,
  hay_kg numeric,
  branches_kg numeric,
  meals jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Переезд: отметки «кто собрал» по пунктам шаблона и свои пункты; '_days' — дней в дороге
create table if not exists public.move_items (
  id text primary key,
  section text not null default '',
  text text not null default '',
  qty numeric,
  done_by text,
  done_at timestamptz,
  created_by text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

do $$
declare t text;
begin
  foreach t in array array['profiles','shifts','requests','request_marks','notes','stock_items','stock_moves','diets','move_items'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('create index if not exists %I on public.%I (updated_at)', t || '_updated_idx', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ============================================================
-- Права (RLS)
-- Читать могут все вошедшие. Писать — по ролям.
-- ============================================================
drop policy if exists "read" on public.profiles;
create policy "read" on public.profiles for select to authenticated using (true);
-- профили меняет только функция admin-users (service role) — политик на запись нет

do $$
declare t text;
begin
  foreach t in array array['shifts','requests','request_marks','notes','stock_items','stock_moves','diets','move_items'] loop
    execute format('drop policy if exists "read" on public.%I', t);
    execute format('create policy "read" on public.%I for select to authenticated using (public.my_role() is not null)', t);
  end loop;
end $$;

-- кипер и админ: смены, отметки заявок, склад (движения)
do $$
declare t text;
begin
  foreach t in array array['shifts','request_marks','stock_moves'] loop
    execute format('drop policy if exists "write" on public.%I', t);
    execute format($p$create policy "write" on public.%I for all to authenticated
      using (public.my_role() in ('keeper','admin'))
      with check (public.my_role() in ('keeper','admin'))$p$, t);
  end loop;
end $$;

-- врач и админ: рацион
do $$
declare t text;
begin
  foreach t in array array['diets'] loop
    execute format('drop policy if exists "write" on public.%I', t);
    execute format($p$create policy "write" on public.%I for all to authenticated
      using (public.my_role() in ('vet','admin'))
      with check (public.my_role() in ('vet','admin'))$p$, t);
  end loop;
end $$;

-- заявки: врач, директор и админ
drop policy if exists "write" on public.requests;
create policy "write" on public.requests for all to authenticated
  using (public.my_role() in ('vet','director','admin'))
  with check (public.my_role() in ('vet','director','admin'));

-- переезд: собирают все
drop policy if exists "write" on public.move_items;
create policy "write" on public.move_items for all to authenticated
  using (public.my_role() is not null) with check (public.my_role() is not null);

-- заметки: все роли
drop policy if exists "write" on public.notes;
create policy "write" on public.notes for all to authenticated
  using (public.my_role() is not null) with check (public.my_role() is not null);

-- настройки склада (вес мешка и т.п.): только админ
drop policy if exists "write" on public.stock_items;
create policy "write" on public.stock_items for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ============================================================
-- Фото: приватное хранилище
-- ============================================================
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "photos read" on storage.objects;
create policy "photos read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.my_role() is not null);

drop policy if exists "photos write" on storage.objects;
create policy "photos write" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.my_role() is not null);

drop policy if exists "photos update" on storage.objects;
create policy "photos update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.my_role() is not null);

-- ============================================================
-- Начальные данные: склад и рацион
-- Вес мешков и «кг в гарце» — примерные, админ правит их в приложении.
-- ============================================================
insert into public.stock_items (id, name, kind, unit, sack_kg, kg_per_garets, sort) values
  ('hay',       'Сено',                 'count', 'тюк', null, null, 1),
  ('veg',       'Овощи',                'kg',    'кг',  null, 15,   2),  -- для овощей: кг в обычном тазу
  ('formamax',  'ФормаМакс',            'sack',  'кг',  20,   null, 3),
  ('optiform',  'ОптиФорм Микс (Юниор)',        'sack',  'кг',  20,   null, 4),
  ('monograss', 'Mono Grass',           'sack',  'кг',  20,   null, 5),
  ('hercules',  'Геркулес',             'sack',  'кг',  30,   1.13, 6),
  ('bran',      'Отруби',               'sack',  'кг',  20,   0.83,  7),
  ('oats',      'Овёс',                 'sack',  'кг',  40,   1.5,  8),
  ('corn',      'Кукуруза',             'sack',  'кг',  45,   2.4,  9),
  ('seeds',     'Семечки',              'sack',  'кг',  25,   1.4,  10),
  ('bags',      'Мешки для мусора 240 л', 'count', 'шт',  null, null, 11)
on conflict (id) do nothing;

insert into public.diets (id, hay_kg, branches_kg, meals) values
('Претти', 60, 10, '[
  {"time":"07:00","title":"Зерносмесь","prep":"","items":[
    {"item":"hercules","name":"Геркулес","qty":2,"unit":"гарец"},
    {"item":"bran","name":"Отруби","qty":2,"unit":"гарец"},
    {"item":"oats","name":"Овёс","qty":1,"unit":"гарец"},
    {"item":"corn","name":"Кукуруза","qty":0.5,"unit":"гарец"},
    {"item":"seeds","name":"Семечки","qty":300,"unit":"г"}]},
  {"time":"13:00","title":"Каша","prep":"запарить за 20 мин · через 45–60 мин после манежа","items":[
    {"item":"formamax","name":"ФормаМакс","qty":2,"unit":"кг"}]},
  {"time":"17:00","title":"Каша","prep":"запарить за 20 мин","items":[
    {"item":"formamax","name":"ФормаМакс","qty":2,"unit":"кг"}]},
  {"time":"19:00","title":"Овощи","prep":"мыть, крупная нарезка · таз на каждую","items":[
    {"item":"veg","name":"Тыква, капуста, морковь, свёкла, картофель, сельдерей — по сезону","qty":null,"unit":"кг"}]}
]'::jsonb),
('Марго', 55, 10, '[
  {"time":"07:00","title":"Зерносмесь","prep":"","items":[
    {"item":"hercules","name":"Геркулес","qty":1,"unit":"гарец"},
    {"item":"bran","name":"Отруби","qty":1,"unit":"гарец"},
    {"item":"oats","name":"Овёс","qty":0.5,"unit":"гарец"},
    {"item":"corn","name":"Кукуруза","qty":300,"unit":"г"},
    {"item":"seeds","name":"Семечки","qty":200,"unit":"г"}]},
  {"time":"13:00","title":"Каша","prep":"запарить за 20 мин · через 45–60 мин после манежа","items":[
    {"item":"optiform","name":"ОптиФорм Микс (Юниор)","qty":1.5,"unit":"кг"}]},
  {"time":"17:00","title":"Каша","prep":"запарить за 20 мин","items":[
    {"item":"optiform","name":"ОптиФорм Микс (Юниор)","qty":1.5,"unit":"кг"}]},
  {"time":"19:00","title":"Овощи","prep":"мыть, крупная нарезка · таз на каждую","items":[
    {"item":"veg","name":"Тыква, капуста, морковь, свёкла, картофель, сельдерей — по сезону","qty":null,"unit":"кг"}]}
]'::jsonb),
('Одри', 50, 10, '[
  {"time":"07:00","title":"Зерносмесь","prep":"","items":[
    {"item":"hercules","name":"Геркулес","qty":1,"unit":"гарец"},
    {"item":"bran","name":"Отруби","qty":1,"unit":"гарец"},
    {"item":"oats","name":"Овёс","qty":0.5,"unit":"гарец"},
    {"item":"seeds","name":"Семечки","qty":200,"unit":"г"}]},
  {"time":"13:00","title":"Каша","prep":"запарить за 20 мин · через 45–60 мин после манежа","items":[
    {"item":"monograss","name":"Mono Grass","qty":1.5,"unit":"кг"}]},
  {"time":"17:00","title":"Каша","prep":"запарить за 20 мин","items":[
    {"item":"monograss","name":"Mono Grass","qty":1.5,"unit":"кг"}]},
  {"time":"19:00","title":"Овощи","prep":"мыть, крупная нарезка · таз на каждую","items":[
    {"item":"veg","name":"Тыква, капуста, морковь, свёкла, картофель, сельдерей — по сезону","qty":null,"unit":"кг"}]}
]'::jsonb)
on conflict (id) do nothing;
