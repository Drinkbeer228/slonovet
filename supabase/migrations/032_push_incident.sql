-- 032: ЧП — уведомление врачу и директору (функция notify, тип incident). «Внимание» — плановые процедуры, по ним тишина.
-- Выкладка: сначала функция notify с типом incident, потом миграция (иначе notify ответит «неизвестный тип» — запись всё равно сохранится).
create or replace function slonovet.on_note_insert()
returns trigger language plpgsql security definer set search_path = public, slonovet as $$
begin
  if new.kind = 'incident' and not new.deleted then
    perform slonovet.notify(jsonb_build_object('type', 'incident', 'id', new.id, 'text', new.text, 'author_name', new.author_name, 'author_id', new.author_id));
  end if;
  return new;
end $$;
drop trigger if exists push_incident on public.notes;
create trigger push_incident after insert on public.notes for each row execute function slonovet.on_note_insert();
