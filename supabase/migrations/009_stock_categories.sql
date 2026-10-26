-- Фураж: позиции можно добавлять, переименовывать и удалять прямо в приложении.
-- Группа хранится у позиции. Править фураж могут киперы, директор, администратор и админ. Можно выполнять повторно.
alter table public.stock_items add column if not exists category text not null default 'other';

update public.stock_items set category = case
  when id in ('hay') then 'feed'
  when id in ('veg') then 'veg'
  when id in ('formamax', 'optiform', 'monograss') then 'porridge'
  when id in ('hercules', 'bran', 'oats', 'corn', 'seeds') then 'grain'
  when id in ('bags') then 'household'
  else category end
where category = 'other';

drop policy if exists "write" on public.stock_items;
create policy "write" on public.stock_items for all to authenticated
  using (public.my_role() in ('keeper', 'director', 'manager', 'admin'))
  with check (public.my_role() in ('keeper', 'director', 'manager', 'admin'));

drop policy if exists "write" on public.stock_moves;
create policy "write" on public.stock_moves for all to authenticated
  using (public.my_role() in ('keeper', 'director', 'manager', 'admin'))
  with check (public.my_role() in ('keeper', 'director', 'manager', 'admin'));
