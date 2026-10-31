-- 030: чужое дежурство — только просмотр, и правильная причина закрытия при передаче.
-- 1) Кипер или директор правит только свою смену (keeper_id = он). admin — аварийно, без ограничений.
--    Закрытие прежней смены триггером shifts_relay идёт изнутри триггера (pg_trigger_depth() > 1) — его не трогаем.
-- 2) shifts_relay: смену, которую передали именно этому сменщику (handover_to), закрываем причиной handover,
--    а не takeover («принята без сдачи»).
-- Выкладка: приложение и миграция в любом порядке — приложение и так не правит чужие смены.

create or replace function public.shifts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text;
  me uuid := auth.uid();
begin
  -- только просмотр: прямые правки чужой смены (кроме admin и сервисных вызовов без пользователя)
  if me is not null and pg_trigger_depth() = 1 and public.my_role() is distinct from 'admin' then
    if tg_op = 'INSERT' and new.keeper_id is distinct from me then
      raise exception 'Открыть дежурство можно только на себя' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.keeper_id is distinct from me then
      raise exception 'Чужое дежурство — только просмотр' using errcode = '42501';
    end if;
  end if;
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
  if new.accepted_at is not null and new.accepted_at > now() + interval '10 minutes' then new.accepted_at := now(); end if;
  if new.handed_at is not null and new.handed_at > now() + interval '10 minutes' then new.handed_at := now(); end if;
  return new;
end $$;

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
        when s.id <> coalesce(new.accepted_from, '') then 'superseded'
        when s.keeper_id is not distinct from new.keeper_id then 'rollover'
        when s.handover_to is not distinct from new.keeper_id then 'handover'
        else 'takeover' end,
      closed_by = new.keeper_id
    where s.status = 'open' and not s.deleted and s.id <> new.id
      and coalesce(s.accepted_at, '-infinity'::timestamptz) <= coalesce(new.accepted_at, now());
  return new;
end $$;
