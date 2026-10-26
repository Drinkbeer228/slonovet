-- Отвечать на назначения может любой: директор сам обработал Претти — отмечает, врач видит, кто и когда.
drop policy if exists "write" on public.request_marks;
create policy "write" on public.request_marks for all to authenticated
  using (public.my_role() is not null) with check (public.my_role() is not null);
