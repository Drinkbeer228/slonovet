-- Закупки: любой сотрудник просит купить (мешки, сено, ветки, каши…), администратор, директор или админ
-- отмечает «заказано» / «привезли». Автор может отменить свою заявку. Можно выполнять повторно.
create table if not exists public.purchases (
  id text primary key,
  item_id text,                     -- позиция фуража, если выбрана из списка
  title text not null default '',   -- что купить (название позиции или свой текст)
  amount text not null default '',  -- сколько, своими словами: «10 мешков», «на неделю»
  note text not null default '',
  urgent boolean not null default false,
  status text not null default 'new' check (status in ('new', 'ordered', 'done', 'cancelled')),
  author_id uuid not null,
  author_name text not null default '',
  status_by text,                   -- кто последним поменял статус
  status_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

drop trigger if exists touch on public.purchases;
create trigger touch before insert or update on public.purchases for each row execute function public.touch_updated_at();
create index if not exists purchases_updated_idx on public.purchases (updated_at);
alter table public.purchases enable row level security;

drop policy if exists "read" on public.purchases;
create policy "read" on public.purchases for select to authenticated using (public.my_role() is not null);

-- просить может любой — только от своего имени. Приложение шлёт изменения как «вставь или обнови»,
-- поэтому закупщикам это правило тоже нужно пройти для чужих заявок
drop policy if exists "insert" on public.purchases;
create policy "insert" on public.purchases for insert to authenticated
  with check (public.my_role() in ('director', 'manager', 'admin') or (public.my_role() is not null and author_id = auth.uid()));

-- менять: тот, кто закупает, или автор своей заявки
drop policy if exists "update" on public.purchases;
create policy "update" on public.purchases for update to authenticated
  using (public.my_role() in ('director', 'manager', 'admin') or (public.my_role() is not null and author_id = auth.uid()))
  with check (public.my_role() in ('director', 'manager', 'admin') or (public.my_role() is not null and author_id = auth.uid()));
