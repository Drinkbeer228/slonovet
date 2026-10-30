-- Поставщики по городам (этап C1): сено, овощи, зерно, опилки — контакты сохраняются между визитами в город.
-- Только добавление новой таблицы.
create table if not exists public.suppliers (
  id text primary key,
  city text not null default '',
  name text not null default '',
  supplies text[] not null default '{}',
  phone text not null default '',
  address text not null default '',
  quality smallint check (quality is null or quality between 1 and 3),
  note text not null default '',
  created_by text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

drop trigger if exists touch on public.suppliers;
create trigger touch before insert or update on public.suppliers for each row execute function public.touch_updated_at();
create index if not exists suppliers_updated_idx on public.suppliers (updated_at);
alter table public.suppliers enable row level security;

drop policy if exists "read" on public.suppliers;
create policy "read" on public.suppliers for select to authenticated using (public.my_role() is not null);

-- вносить и оценивать может любой, кроме врача (врачи на местах меняются)
drop policy if exists "write" on public.suppliers;
create policy "write" on public.suppliers for all to authenticated
  using (public.my_role() in ('keeper', 'director', 'manager', 'admin'))
  with check (public.my_role() in ('keeper', 'director', 'manager', 'admin'));
