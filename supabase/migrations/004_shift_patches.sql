-- Смены правят патчами: телефон шлёт только изменённые поля, сервер вклеивает их в свою версию.
-- Так отметки двух телефонов не затирают друг друга. SQL Editor → Run, можно повторно.

-- когда кипер подтвердил при сдаче «осмотрел всех трёх, неотмеченное — норма»
alter table public.shifts add column if not exists checked_at timestamptz;

-- положить value по пути path внутрь target (недостающие уровни создаются); del — удалить ключ
create or replace function public.jsonb_set_deep(target jsonb, path text[], value jsonb, del boolean)
returns jsonb language plpgsql immutable set search_path = public as $$
declare child jsonb;
begin
  if target is null or jsonb_typeof(target) <> 'object' then target := '{}'::jsonb; end if;
  if coalesce(array_length(path, 1), 0) = 0 then return target; end if;
  if array_length(path, 1) = 1 then
    if del then return target - path[1]; end if;
    return jsonb_set(target, path, coalesce(value, 'null'::jsonb), true);
  end if;
  child := target -> path[1];
  return jsonb_set(target, array[path[1]], public.jsonb_set_deep(child, path[2:], value, del), true);
end $$;

-- p_row — вся смена (нужна, если на сервере её ещё нет); p_patches — [{"path": [...], "value": ..., "del": true}]
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
    -- чего нет в присланной строке — по умолчанию, а не null (колонки not null)
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
    deleted = x.deleted
  from jsonb_populate_record(null::public.shifts, r) x
  where s.id = p_id
  returning s.* into cur;
  return cur;
end $$;

revoke execute on function public.apply_shift_patch(text, jsonb, jsonb) from public, anon;
grant execute on function public.apply_shift_patch(text, jsonb, jsonb) to authenticated;
