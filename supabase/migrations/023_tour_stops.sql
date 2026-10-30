-- Гастроли: города, где стоит труппа (этап C1). По ним делится лента фуража, к ним потом привяжутся поставщики.
-- Только добавление новой таблицы: старые приложения её не знают и не трогают.
create table if not exists public.tour_stops (
  id text primary key,
  city text not null default '',
  arrive_on date not null,
  depart_on date,
  note text not null default '',
  created_by text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

drop trigger if exists touch on public.tour_stops;
create trigger touch before insert or update on public.tour_stops for each row execute function public.touch_updated_at();
create index if not exists tour_stops_updated_idx on public.tour_stops (updated_at);
alter table public.tour_stops enable row level security;

drop policy if exists "read" on public.tour_stops;
create policy "read" on public.tour_stops for select to authenticated using (public.my_role() is not null);

-- отметить «приехали» может любой, кроме врача (как и чек-лист переезда, но врачи на местах меняются)
drop policy if exists "write" on public.tour_stops;
create policy "write" on public.tour_stops for all to authenticated
  using (public.my_role() in ('keeper', 'director', 'manager', 'admin'))
  with check (public.my_role() in ('keeper', 'director', 'manager', 'admin'));
