-- Дежурство — только киперы и директор (admin — аварийно, для тестов и починки). Администратор (manager) не дежурит никогда.
-- До применения посмотреть, нет ли смен, которые правило нарушают:
--   select s.id, s.date, s.keeper_name, p.role from public.shifts s join public.profiles p on p.id = s.keeper_id
--    where p.role not in ('keeper', 'director', 'admin');
-- Выкладывать СНАЧАЛА приложение, потом миграцию: очередь менеджера со сменой получит отказ 403 (приложение положит её в карантин).

-- 1. Политика «пишет свою смену» — теперь только директор (у киперов и admin общая политика "write" из 001)
drop policy if exists "write_own" on public.shifts;
create policy "write_own" on public.shifts for all to authenticated
  using (public.my_role() in ('director') and keeper_id = auth.uid())
  with check (public.my_role() in ('director') and keeper_id = auth.uid());

-- 2. Охранник смены: кто записан дежурным и кому сдают, часы телефона не из будущего.
-- Срабатывает до shifts_relay (триггеры одной таблицы идут по алфавиту).
create or replace function public.shifts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text;
begin
  if tg_op = 'INSERT' or new.keeper_id is distinct from old.keeper_id then
    select role into r from public.profiles where id = new.keeper_id;
    if r is null or r not in ('keeper', 'director', 'admin') then
      raise exception 'Дежурить могут только киперы и директор' using errcode = '42501';
    end if;
  end if;
  if new.handover_to is not null and (tg_op = 'INSERT' or new.handover_to is distinct from old.handover_to) then
    select role into r from public.profiles where id = new.handover_to;
    if r is null or r not in ('keeper', 'director') then
      raise exception 'Сдать смену можно только киперу или директору' using errcode = '42501';
    end if;
  end if;
  -- телефон с неверной датой не должен «заступить в будущем» и закрыть чужие смены
  if new.accepted_at is not null and new.accepted_at > now() + interval '10 minutes' then new.accepted_at := now(); end if;
  if new.handed_at is not null and new.handed_at > now() + interval '10 minutes' then new.handed_at := now(); end if;
  return new;
end $$;

drop trigger if exists shifts_guard on public.shifts;
create trigger shifts_guard before insert or update on public.shifts for each row execute function public.shifts_guard();

-- 3. shifts_relay: те же правила, что в 019, но одна вставка за раз — две пачки с двух телефонов не оставят две открытые смены
create or replace function public.shifts_relay() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  newer text;
begin
  if new.status <> 'open' or new.deleted then return new; end if;
  perform pg_advisory_xact_lock(hashtext('slonovet.shifts_relay'));

  select id into newer from public.shifts
   where status = 'open' and not deleted and id <> new.id
     and coalesce(accepted_at, '-infinity'::timestamptz) > coalesce(new.accepted_at, '-infinity'::timestamptz)
   limit 1;
  if newer is not null then
    new.status := 'handed';
    new.handed_at := coalesce(new.handed_at, new.accepted_at, now());
    new.close_reason := coalesce(new.close_reason, 'superseded');
    new.closed_by := coalesce(new.closed_by, new.keeper_id);
    return new;
  end if;

  update public.shifts s set
      status = 'handed',
      handed_at = coalesce(new.accepted_at, now()),
      close_reason = case
        when s.id = new.accepted_from and s.keeper_id is not distinct from new.keeper_id then 'rollover'
        when s.id = new.accepted_from then 'takeover'
        else 'superseded' end,
      closed_by = new.keeper_id
    where s.status = 'open' and not s.deleted and s.id <> new.id
      and coalesce(s.accepted_at, '-infinity'::timestamptz) <= coalesce(new.accepted_at, now());
  return new;
end $$;
