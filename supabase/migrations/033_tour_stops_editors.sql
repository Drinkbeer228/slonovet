-- 033: «Где стоим» (город гастролей) отмечают администратор и директор (и admin); видят все. Раньше могли и киперы.
-- Выкладка: приложение и миграция в любом порядке — кнопка у кипера уже скрыта.
drop policy if exists "write" on public.tour_stops;
create policy "write" on public.tour_stops for all to authenticated
  using (public.my_role() in ('director', 'manager', 'admin'))
  with check (public.my_role() in ('director', 'manager', 'admin'));
