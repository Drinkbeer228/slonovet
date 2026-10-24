-- Раздел «Переезд». Для базы, где 001_init.sql уже применён: вставить в SQL Editor → Run.
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

drop trigger if exists touch on public.move_items;
create trigger touch before insert or update on public.move_items for each row execute function public.touch_updated_at();
create index if not exists move_items_updated_idx on public.move_items (updated_at);
alter table public.move_items enable row level security;

drop policy if exists "read" on public.move_items;
create policy "read" on public.move_items for select to authenticated using (public.my_role() is not null);

drop policy if exists "write" on public.move_items;
create policy "write" on public.move_items for all to authenticated
  using (public.my_role() is not null) with check (public.my_role() is not null);
