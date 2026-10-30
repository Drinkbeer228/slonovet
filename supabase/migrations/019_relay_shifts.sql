-- Эстафета смен: кому сдали, кто и как закрыл, самосхождение двух телефонов без связи.
-- Только добавления: установленные приложения со старым кодом продолжают работать.

alter table public.shifts add column if not exists handover_to uuid;   -- кому сдали (для карточки «Тебе сдали смену»)
alter table public.shifts add column if not exists closed_by uuid;     -- кто закрыл: сдал сам, принял сменщик или перехватил
alter table public.shifts add column if not exists close_reason text;  -- как закрыта

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shifts_close_reason_check') then
    alter table public.shifts
      add constraint shifts_close_reason_check
      check (close_reason is null or close_reason in ('handover', 'rollover', 'takeover', 'superseded'));
  end if;
end $$;

-- Новая открытая смена закрывает более старые открытые. НЕ отказывает: отказ (4xx) приложение сочло бы окончательным
-- и откатило смену кипера, а работа со слонами блокироваться не должна. Два телефона, принявших смену без связи,
-- сходятся сами, когда выйдут на связь.
create or replace function public.shifts_relay() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  newer text;
begin
  if new.status <> 'open' or new.deleted then return new; end if;

  -- уже есть более новая открытая смена (эта пришла с опозданием) — вставляем её сразу закрытой
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

drop trigger if exists shifts_relay on public.shifts;
create trigger shifts_relay before insert on public.shifts for each row execute function public.shifts_relay();

-- патчи смены знают про новые поля
create or replace function public.apply_shift_patch(p_id text, p_row jsonb, p_patches jsonb)
returns public.shifts language plpgsql security invoker set search_path = public as $$
declare
  cur public.shifts;
  r jsonb;
  p jsonb;
begin
  select * into cur from public.shifts where id = p_id for update;
  if not found then
    if p_row is null then raise exception 'Смена % не найдена', p_id; end if;
    insert into public.shifts select * from jsonb_populate_record(null::public.shifts,
      jsonb_build_object('status', 'open', 'safety', '{}'::jsonb, 'state', '{}'::jsonb, 'feeds', '{}'::jsonb,
        'quests', '{}'::jsonb, 'hay_bales', 0, 'note', '', 'accept_remarks', '', 'deleted', false, 'updated_at', now())
      || jsonb_strip_nulls(p_row)) returning * into cur;
    return cur;
  end if;

  r := to_jsonb(cur);
  for p in select * from jsonb_array_elements(coalesce(p_patches, '[]'::jsonb)) loop
    r := public.jsonb_set_deep(
      r,
      array(select jsonb_array_elements_text(p -> 'path')),
      p -> 'value',
      coalesce((p ->> 'del')::boolean, false)
    );
  end loop;
  r := r || jsonb_build_object('id', p_id);

  update public.shifts s set
    date = x.date, keeper_id = x.keeper_id, keeper_name = x.keeper_name, status = x.status,
    safety = x.safety, state = x.state, feeds = x.feeds, quests = x.quests, hay_bales = x.hay_bales,
    note = x.note, accepted_at = x.accepted_at, handed_at = x.handed_at, handover_code = x.handover_code,
    accepted_from = x.accepted_from, accept_remarks = x.accept_remarks, checked_at = x.checked_at,
    handover_to = x.handover_to, closed_by = x.closed_by, close_reason = x.close_reason,
    deleted = x.deleted
  from jsonb_populate_record(null::public.shifts, r) x
  where s.id = p_id
  returning s.* into cur;
  return cur;
end $$;

revoke execute on function public.apply_shift_patch(text, jsonb, jsonb) from public, anon;
grant execute on function public.apply_shift_patch(text, jsonb, jsonb) to authenticated;

-- директор и администратор (manager) могут сами заступить на дежурство: пишут только свою смену.
-- Кипер и системный админ по-прежнему пишут любую (политика "write" из 001).
drop policy if exists "write_own" on public.shifts;
create policy "write_own" on public.shifts for all to authenticated
  using (public.my_role() in ('director', 'manager') and keeper_id = auth.uid())
  with check (public.my_role() in ('director', 'manager') and keeper_id = auth.uid());
