-- «Контейнеры» (этап C3): реквизит в пронумерованных контейнерах по фурам — опись и поиск.
-- truck/load_order/slot_x/slot_y — каркас под схему погрузки «тетрис» (вид сверху); пока не заполняются.
create table if not exists public.containers (
  id text primary key,
  number text not null default '',
  truck text not null default '',
  contents text not null default '',
  note text not null default '',
  load_order int,
  slot_x int,
  slot_y int,
  created_by text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

drop trigger if exists touch on public.containers;
create trigger touch before insert or update on public.containers for each row execute function public.touch_updated_at();
create index if not exists containers_updated_idx on public.containers (updated_at);
alter table public.containers enable row level security;

drop policy if exists "read" on public.containers;
create policy "read" on public.containers for select to authenticated using (public.my_role() is not null);

drop policy if exists "write" on public.containers;
create policy "write" on public.containers for all to authenticated
  using (public.my_role() in ('keeper', 'director', 'manager', 'admin'))
  with check (public.my_role() in ('keeper', 'director', 'manager', 'admin'));
