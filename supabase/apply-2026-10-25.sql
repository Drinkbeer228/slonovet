-- СлоноВет 25.10: журнал действий + веса и рацион. Supabase → SQL Editor → New query → вставить всё → Run.

-- Журнал действий: что люди делают в приложении и где оно падает — чтобы улучшать.
-- Пишет каждый только от своего имени; читают админ и директор. SQL Editor → Run, можно повторно.
create table if not exists public.events (
  id text primary key,
  user_id uuid not null,
  user_name text not null default '',
  role text not null default '',
  action text not null,           -- screen.open, shift.accept, feed.toggle, request.mark, error…
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_action_idx on public.events (action);

alter table public.events enable row level security;

drop policy if exists "insert own" on public.events;
create policy "insert own" on public.events for insert to authenticated
  with check (user_id = auth.uid() and public.my_role() is not null);

drop policy if exists "read admin" on public.events;
create policy "read admin" on public.events for select to authenticated
  using (public.my_role() in ('admin', 'director'));

-- Данные со слов слоноводов (25.10.2026): каша запаривается за ~час, состав и порция овощей, вес совка.
-- SQL Editor → Run. Повторный запуск ничего не испортит.
update public.diets set meals = replace(replace(meals::text,
  'запарить за 20 мин', 'запарить за 60 мин'),
  'Тыква, капуста, морковь, свёкла, картофель, сельдерей — по сезону',
  'Картофель 20 кг, морковь 20 кг, свёкла 20 кг + сезонное 10–15 кг (тыква, кабачки, капуста, перец, баклажаны, яблоки)')::jsonb;

-- совок (гарец) = 2 кг овса, остальное зерно — по плотности; овощи — порция ~75 кг на слониху
update public.stock_items set kg_per_garets = case id
  when 'oats' then 2 when 'hercules' then 1.5 when 'bran' then 1.1 when 'corn' then 3.2 when 'seeds' then 1.9 when 'veg' then 75 end
where id in ('oats', 'hercules', 'bran', 'corn', 'seeds', 'veg');
