-- Задачи ставят все: кипер увидел неубранный проход — поставил задачу с фото. Можно выполнять повторно.
-- Создать — любой, от своего имени. Менять и закрывать — автор, врач, директор, администратор или админ.
-- Приложение шлёт изменения как «вставь или обнови», поэтому правило вставки тоже пускает закрывающих.
drop policy if exists "write" on public.requests;
drop policy if exists "insert" on public.requests;
drop policy if exists "update" on public.requests;

create policy "insert" on public.requests for insert to authenticated
  with check (
    public.my_role() in ('vet', 'director', 'manager', 'admin')
    or (public.my_role() is not null and author_id = auth.uid())
  );

create policy "update" on public.requests for update to authenticated
  using (
    public.my_role() in ('vet', 'director', 'manager', 'admin')
    or (public.my_role() is not null and author_id = auth.uid())
  )
  with check (
    public.my_role() in ('vet', 'director', 'manager', 'admin')
    or (public.my_role() is not null and author_id = auth.uid())
  );
